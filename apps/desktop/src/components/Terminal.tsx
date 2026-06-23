import { createEffect, createSignal, onCleanup, onMount, Show, createMemo, For } from "solid-js"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { ClipboardAddon } from "@xterm/addon-clipboard"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { SearchAddon } from "@xterm/addon-search"
import { SerializeAddon } from "@xterm/addon-serialize"
import { Unicode11Addon } from "@xterm/addon-unicode11"
import { nativeApi } from "../services/native"
import { Search, X, ArrowUp, ArrowDown, Save, Trash2 } from "lucide-solid"
import { CLI_ALIAS_TO_ID } from "../config/check"
import { store, useStore } from "../store"
import { api } from "../services/api"
import type { Session } from "../types"
import "@xterm/xterm/css/xterm.css"

interface TerminalProps {
  sessionId: string
  session?: Session | null
  cwd?: string
  isActiveOverride?: () => boolean
}

interface RerunCliEventDetail {
  sessionId: string
  command: string
}

interface TerminalHostInfo {
  os: string
  windowsBuildNumber?: number | null
}

type TerminalOs = TerminalHostInfo["os"]

interface IPty {
  reused: boolean
  shell?: string
  write(data: string): void
  resize(cols: number, rows: number): void
  dispose(): void
  kill(): void
  onData(callback: (chunk: string) => void): void
  onExit(callback: () => void): void
}

const launchedPendingCommandKeys = new Set<string>()
const ACTIVITY_THROTTLE_MS = 15_000
const FIT_SETTLE_DELAYS_MS = [0, 50, 150] as const

const DEFAULT_SESSION_NAME_PATTERN = /^Terminal \d+$/
const ANSI_ESCAPE_SEQUENCE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|[@-_]|\].*?(?:\x07|\x1b\\)|P.*?\x1b\\|X.*?\x1b\\|\^.*?\x1b\\|_.*?\x1b\\)/g
const OTHER_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/g
const BRACKETED_PASTE_WRAPPER = /\x1b\[(?:200|201)~/g
const OSC_COLOR_FRAGMENT = /(?:^|\s)(?:\d+;(?:rgb:[0-9a-f]+\/[0-9a-f]+\/[0-9a-f]+|\d+;))+/gi
const LEADING_GARBAGE_FRAGMENT = /^(?:\s|;|(?:\d+;)+(?:rgb:[0-9a-f]+\/[0-9a-f]+\/[0-9a-f]+)?)+/i
type CaptureMode = "text" | "escape" | "csi" | "osc" | "dcs" | "string"
const MAX_NAMING_CAPTURE_CHARS = 2048

function stripOptionalWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

function getShellBasename(shell: string): string {
  const unquotedShell = stripOptionalWrappingQuotes(shell)
  const baseName = unquotedShell.split(/[\\/]/).pop() ?? unquotedShell
  return baseName.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "")
}

function getDefaultShell(): string {
  // The renderer has no `process` (contextIsolation + no nodeIntegration);
  // derive the default shell from the native bridge instead.
  return nativeApi.defaultShell()
}

function resolveShell(shell: string | undefined | null, availableShells?: string[]): string {
  const candidate = stripOptionalWrappingQuotes(shell ?? "")
  if (candidate) return candidate

  if (availableShells && availableShells.length > 0) {
    return availableShells[0]
  }

  return getDefaultShell()
}

function decodePtyChunk(chunk: unknown, decoder: TextDecoder): string {
  if (typeof chunk === "string") return chunk
  if (chunk instanceof Uint8Array) return decoder.decode(chunk, { stream: true })
  if (Array.isArray(chunk)) return decoder.decode(Uint8Array.from(chunk), { stream: true })
  return ""
}

async function spawnNativePty(options: {
  sessionId: string
  shell: string
  fallbackShells?: string[]
  cwd?: string
  rows: number
  cols: number
  cursor?: number
  env: Record<string, string>
}): Promise<IPty> {
  const terminal = nativeApi.terminal()
  const id = options.sessionId
  const dataCallbacks = new Set<(chunk: string) => void>()
  const exitCallbacks = new Set<() => void>()
  const pendingChunks: string[] = []
  let disposed = false

  const offData = terminal.onData(id, (data) => {
    if (disposed) return
    if (dataCallbacks.size === 0) {
      pendingChunks.push(data)
      return
    }

    for (const callback of dataCallbacks) callback(data)
  })
  const offExit = terminal.onExit(id, () => {
    for (const callback of exitCallbacks) {
      try { callback() } catch (e) { console.error(e) }
    }
    dataCallbacks.clear()
    pendingChunks.length = 0
    offData()
    offExit()
  })

  const dispose = () => {
    if (disposed) return
    disposed = true
    offData()
    offExit()
    dataCallbacks.clear()
    exitCallbacks.clear()
    pendingChunks.length = 0
  }

  const spawned = await terminal.spawn({
    id: options.sessionId,
    shell: options.shell,
    fallbackShells: options.fallbackShells,
    cwd: options.cwd,
    rows: options.rows,
    cols: options.cols,
    cursor: options.cursor,
    env: options.env,
  }).catch((error) => {
    dispose()
    throw error
  })
  if (spawned.buffer) {
    pendingChunks.unshift(spawned.buffer)
  }

  return {
    reused: Boolean(spawned.reused),
    shell: spawned.shell,
    write: (data) => {
      void terminal.write(id, data)
    },
    resize: (cols, rows) => {
      void terminal.resize(id, cols, rows)
    },
    dispose,
    kill: () => {
      dispose()
      void terminal.kill(id)
    },
    onData: (callback) => {
      if (pendingChunks.length > 0) {
        const replay = pendingChunks.join("")
        pendingChunks.length = 0
        callback(replay)
      }

      dataCallbacks.add(callback)
    },
    onExit: (callback) => {
      exitCallbacks.add(callback)
    },
  }
}

function supportsClipboardRead() {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function"
}

function isPasteShortcut(event: KeyboardEvent, os: TerminalOs): boolean {
  if (event.repeat) return false
  if (event.altKey) return false

  if (event.key === "Insert") {
    return event.shiftKey && !event.ctrlKey && !event.metaKey
  }

  if (event.key.toLowerCase() !== "v") return false

  if (os === "macos") {
    return event.metaKey && !event.ctrlKey
  }

  if (os === "linux") {
    return event.ctrlKey && event.shiftKey && !event.metaKey
  }

  return event.ctrlKey && !event.metaKey
}

function isCopyShortcut(event: KeyboardEvent, os: TerminalOs): boolean {
  if (event.repeat) return false
  if (event.altKey) return false
  if (event.key.toLowerCase() !== "c") return false

  if (os === "macos") {
    return event.metaKey && !event.ctrlKey
  }

  return event.ctrlKey && !event.metaKey
}

function sanitizeClipboardPasteText(input: string): string {
  return input
    .replace(BRACKETED_PASTE_WRAPPER, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\r\n]+$/g, "")
}

function getShadcnTerminalTheme() {
  const css = getComputedStyle(document.documentElement)
  const bg = css.getPropertyValue("--term-bg").trim() || css.getPropertyValue("--background").trim() || "#09090b"
  const fg = css.getPropertyValue("--foreground").trim() || "#fafafa"
  const primary = css.getPropertyValue("--primary").trim() || "#3b82f6"
  const destructive = css.getPropertyValue("--destructive").trim() || "#ef4444"
  return {
    background: bg,
    foreground: fg,
    cursor: fg,
    cursorAccent: bg,
    selectionBackground: "rgba(255, 255, 255, 0.15)",
    selectionForeground: "#fafafa",
    black: "#09090b",
    brightBlack: "#71717a",
    red: destructive,
    brightRed: "#f87171",
    green: "#22c55e",
    brightGreen: "#4ade80",
    yellow: "#eab308",
    brightYellow: "#facc15",
    blue: primary,
    brightBlue: "#60a5fa",
    magenta: "#a855f7",
    brightMagenta: "#c084fc",
    cyan: "#06b6d4",
    brightCyan: "#22d3ee",
    white: fg,
    brightWhite: "#ffffff",
  }
}

function toSessionTitle(input: string) {
  return input
    .replace(OSC_COLOR_FRAGMENT, " ")
    .replace(LEADING_GARBAGE_FRAGMENT, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80)
}

function normalizeInputForSessionTitle(input: string) {
  return input
    .replace(BRACKETED_PASTE_WRAPPER, "")
    .replace(ANSI_ESCAPE_SEQUENCE, "")
    .replace(OSC_COLOR_FRAGMENT, " ")
    .replace(OTHER_CONTROL_CHARS, "")
}

function parseCliInvocation(input: string): { cliTool: string; promptText: string | null } | null {
  const normalizedInput = input.trim().replace(/\s+/g, " ")
  if (!normalizedInput) return null

  const tokens = normalizedInput.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  if (tokens.length === 0) return null

  const unwrapToken = (token: string) => token.replace(/^['"]|['"]$/g, "")
  const normalizedTokens = tokens.map((token) => unwrapToken(token))
  const cliIndex = normalizedTokens.findIndex((token) => {
    const baseName = token
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(cmd|exe|bat|ps1)$/i, "")
      .toLowerCase()

    return baseName ? Boolean(CLI_ALIAS_TO_ID[baseName]) : false
  })

  if (cliIndex === -1) return null

  const baseName = normalizedTokens[cliIndex]
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.(cmd|exe|bat|ps1)$/i, "")
    .toLowerCase()
  const cliTool = baseName ? CLI_ALIAS_TO_ID[baseName] : null
  if (!cliTool) return null

  const promptTokens = normalizedTokens.slice(cliIndex + 1)
  const promptText = promptTokens.length > 0 ? promptTokens.join(" ").trim() : null

  return {
    cliTool,
    promptText: promptText || null,
  }
}

export function Terminal(props: TerminalProps) {
  const sessionId = props.sessionId
  const isActive = () => (props.isActiveOverride ? props.isActiveOverride() : store.activeSessionId === sessionId)
  const themeId = useStore((s) => s.themeId)
  const colorScheme = useStore((s) => s.colorScheme)
  const availableShells = useStore((s) => s.availableShells)
  const preferredShell = useStore((s) => s.preferredShell)

  let terminalRef: HTMLDivElement | undefined
  let xtermRef: XTerm | null = null
  let fitAddonRef: FitAddon | null = null
  let searchAddonRef: SearchAddon | null = null
  let serializeAddonRef: SerializeAddon | null = null
  let ptyRef: IPty | null = null
  let ptyKilledRef = false
  let initPtyRef: (() => Promise<void>) | null = null
  let searchInputRef: HTMLInputElement | undefined
  const [showSearch, setShowSearch] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal("")
  const decoderRef = new TextDecoder()
  let inputBufferRef = ""
  let awaitingPromptTitleRef = false
  let hasNamedFromPromptRef = false
  let hasFlushedPendingLaunchRef = false
  let hasRecordedStartupMetricRef = false
  let captureModeRef: CaptureMode = "text"
  let captureEscapePendingRef = false
  createEffect(() => {
    themeId()
    colorScheme()
    if (!xtermRef) return
    xtermRef.options.theme = getShadcnTerminalTheme()
    xtermRef.refresh(0, xtermRef.rows - 1)
  })
  let fitRafRef: number | null = null
  let spawnInFlightRef = false
  let spawnStartedAtRef: number | null = null
  let lastPtySizeRef: { rows: number; cols: number } | null = null
  let lastPersistedActivityAtRef = 0
  let startupDurationMsRef: number | null = null
  let hasInitializedSessionStateRef = false

  const appStore = useStore()
  const [terminalStatus, setTerminalStatus] = createSignal<"launching" | "running" | "exited" | "failed">("launching")
  const [launchError, setLaunchError] = createSignal<string | null>(null)

  const sessionProject = useStore((state) => {
    for (const project of state.projects) {
      if (project.sessions.some((s) => s.id === sessionId)) return project
    }
    return null
  })
  const sessionFromStore = useStore((state) => {
    for (const project of state.projects) {
      const match = project.sessions.find((item) => item.id === sessionId)
      if (match) return match
    }
    return null
  })
  const workTerminalFromStore = useStore((state) => {
    for (const pid of Object.keys(state.workTerminals)) {
      const match = state.workTerminals[pid]?.find((t) => t.id === sessionId)
      if (match) return match
    }
    return null
  })
  const session = createMemo(() => {
    const s = props.session ?? sessionFromStore()
    if (s) return s

    const wt = workTerminalFromStore()
    if (wt) {
      return {
        id: wt.id,
        name: wt.title,
        shell: wt.shell,
        pendingLaunchCommand: null,
        cliTool: null,
        createdAt: wt.timeCreated,
        lastActiveAt: wt.timeUpdated,
        commandCount: 0,
        startupDurationMs: null,
        isWorkTerminal: true,
        projectId: wt.projectId,
      }
    }
    return null
  })
  const sessionProjectId = () => {
    const s = session()
    if (s && (s as any).isWorkTerminal) {
      return (s as any).projectId
    }
    if (props.session) {
      for (const project of (store as any).projects) {
        if (project.sessions.some((s: Session) => s.id === sessionId)) return project.id
      }
      return null
    }
    return sessionProject()?.id ?? null
  }
  const sessionProjectPath = () => {
    const s = session()
    if (s && (s as any).isWorkTerminal) {
      const p = store.projects.find((item) => item.id === (s as any).projectId)
      return p?.path ?? null
    }
    if (props.session) {
      for (const project of (store as any).projects) {
        if (project.sessions.some((s: Session) => s.id === sessionId)) return project.path
      }
      return null
    }
    return sessionProject()?.path ?? null
  }
  const renameSession = useStore((state) => state.renameSession)
  const updateSession = useStore((state) => state.updateSession)
  const recordSessionActivity = useStore((state) => state.recordSessionActivity)
  const recordSessionCommand = useStore((state) => state.recordSessionCommand)
  const recordSessionStartup = useStore((state) => state.recordSessionStartup)

  const fitTerminal = () => {
    if (!isActive()) return
    if (fitRafRef !== null) return
    fitRafRef = requestAnimationFrame(() => {
      fitRafRef = null
      if (!isActive()) return
      const fit = fitAddonRef
      const term = xtermRef
      if (fit && term) {
        fit.fit()
        const nextSize = { rows: term.rows, cols: term.cols }
        const lastSize = lastPtySizeRef
        if (lastSize && lastSize.rows === nextSize.rows && lastSize.cols === nextSize.cols) {
          return
        }

        lastPtySizeRef = nextSize
        const pty = ptyRef
        if (pty && !ptyKilledRef) {
          try {
            pty.resize(nextSize.cols, nextSize.rows)
          } catch (e) {
            console.warn("PTY resize failed:", e)
          }
        }
      }
    })
  }

  const safelyScrollToBottomAndFocus = (term: XTerm | null, shouldFocus = false) => {
    if (!term) return
    try {
      if (!term.element || !term.textarea) return
      term.scrollToBottom()
      if (shouldFocus) term.focus()
    } catch {
      // Ignore teardown timing issues from xterm internals.
    }
  }

  const updateTerminalInputState = (active: boolean) => {
    const helperTextarea =
      xtermRef?.textarea ?? terminalRef?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")

    if (helperTextarea) {
      if (active) {
        helperTextarea.removeAttribute("tabindex")
        helperTextarea.removeAttribute("aria-hidden")
      } else {
        helperTextarea.setAttribute("tabindex", "-1")
        helperTextarea.setAttribute("aria-hidden", "true")
      }
    }

    if (!active && terminalRef) {
      const activeElement = terminalRef.ownerDocument.activeElement
      if (activeElement instanceof HTMLElement && terminalRef.contains(activeElement)) {
        activeElement.blur()
      }
    }
  }

  createEffect(() => {
    if (hasInitializedSessionStateRef) return
    const initialSession = session()
    if (!initialSession) return

    hasInitializedSessionStateRef = true
    awaitingPromptTitleRef = false
    hasNamedFromPromptRef = !DEFAULT_SESSION_NAME_PATTERN.test(initialSession.name)
    hasFlushedPendingLaunchRef = false
    hasRecordedStartupMetricRef = false
    inputBufferRef = ""
    captureModeRef = "text"
    captureEscapePendingRef = false
    spawnStartedAtRef = null
    lastPtySizeRef = null
    lastPersistedActivityAtRef = initialSession.lastActiveAt ?? 0
    startupDurationMsRef = typeof initialSession.startupDurationMs === "number" ? initialSession.startupDurationMs ?? null : null
    ptyKilledRef = false
  })

  createEffect(() => {
    const s = session()
    if (!s || DEFAULT_SESSION_NAME_PATTERN.test(s.name)) return
    hasNamedFromPromptRef = true
  })

  createEffect(() => {
    const s = session()
    startupDurationMsRef = typeof s?.startupDurationMs === "number" ? s.startupDurationMs : null
  })

  onMount(() => {
    if (!terminalRef) return

    const getBootSession = () => session()
    const getBootProjectId = () => sessionProjectId()
    const getBootProjectPath = () => sessionProjectPath()

    let cancelled = false
    const fitTimeouts: number[] = []
    let term: XTerm | null = null
    let fitAddon: FitAddon | null = null
    let writeFlushScheduled = false
    let isWriteInFlight = false
    const pendingWriteChunks: string[] = []
    let removeVisibilityChangeListener: (() => void) | null = null

    const scheduleTerminalFlush = () => {
      if (writeFlushScheduled || isWriteInFlight) return
      writeFlushScheduled = true

      queueMicrotask(() => {
        writeFlushScheduled = false
        if (!term || isWriteInFlight || pendingWriteChunks.length === 0) return

        isWriteInFlight = true
        const chunk = pendingWriteChunks.join("")
        pendingWriteChunks.length = 0

        term.write(chunk, () => {
          isWriteInFlight = false
          if (!cancelled && pendingWriteChunks.length > 0) {
            scheduleTerminalFlush()
          }
        })
      })
    }

    const queueTerminalWrite = (data: string) => {
      if (!data) return
      pendingWriteChunks.push(data)
      scheduleTerminalFlush()
    }

    const pasteFromClipboard = async () => {
      if (!isActive()) return
      if (!term || !supportsClipboardRead()) return

      try {
        const text = await navigator.clipboard.readText()
        if (!text) return
        const safePasteText = sanitizeClipboardPasteText(text)
        if (!safePasteText) return
        safelyScrollToBottomAndFocus(term, true)
        const pty = ptyRef
        if (pty && !ptyKilledRef) {
          try { pty.write(safePasteText) } catch { /* ignore */ }
        } else {
          term.paste(safePasteText)
        }
        safelyScrollToBottomAndFocus(term, false)
      } catch (error) {
        console.error("Failed to paste clipboard text into terminal", error)
      }
    }

    const bootTerminal = async () => {
      try {
        if (cancelled || !terminalRef) {
          return
        }

        const hostInfo = await nativeApi.invoke("get_terminal_host_info") as TerminalHostInfo
        const isWindows = hostInfo.os === "windows"
        const windowsBuildNumber =
          typeof hostInfo.windowsBuildNumber === "number" && hostInfo.windowsBuildNumber > 0
            ? hostInfo.windowsBuildNumber
            : null
        const windowsPtyOptions =
          isWindows && windowsBuildNumber
            ? {
              backend: "conpty" as const,
              buildNumber: windowsBuildNumber,
            }
            : undefined

        const terminalFontFamily =
          getComputedStyle(terminalRef.ownerDocument.documentElement).getPropertyValue("--font-family-mono").trim() ||
          '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", Consolas, monospace'

        term = new XTerm({
          cursorBlink: true,
          cursorStyle: "bar",
          cursorInactiveStyle: "outline",
          altClickMovesCursor: false,
          macOptionIsMeta: hostInfo.os === "macos",
          rightClickSelectsWord: false,
          fontSize: 14,
          fontFamily: terminalFontFamily,
          fontWeight: "400",
          fontWeightBold: "700",
          lineHeight: 1.22,
          letterSpacing: 0,
          theme: getShadcnTerminalTheme(),
          scrollback: 100000,
          smoothScrollDuration: 0,
          convertEol: false,
          drawBoldTextInBrightColors: true,
          fastScrollSensitivity: 7,
          scrollSensitivity: 1.2,
          minimumContrastRatio: 1.2,
          windowsPty: windowsPtyOptions,
          documentOverride: terminalRef.ownerDocument,
          allowProposedApi: true,
        })

        fitAddon = new FitAddon()
        const searchAddon = new SearchAddon()
        const serializeAddon = new SerializeAddon()
        const unicode11Addon = new Unicode11Addon()
        const clipboardAddon = new ClipboardAddon()
        term.loadAddon(fitAddon)
        term.loadAddon(new WebLinksAddon())
        term.loadAddon(searchAddon)
        term.loadAddon(serializeAddon)
        term.loadAddon(unicode11Addon)
        try { term.loadAddon(clipboardAddon) } catch (error) { console.warn("Clipboard addon unavailable.", error) }

        term.unicode.activeVersion = '11'

        term.open(terminalRef)

        removeVisibilityChangeListener = null

        const helperTextarea = terminalRef.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")
        helperTextarea?.setAttribute("autocomplete", "off")
        helperTextarea?.setAttribute("autocorrect", "off")
        helperTextarea?.setAttribute("autocapitalize", "off")
        helperTextarea?.setAttribute("spellcheck", "false")
        helperTextarea?.setAttribute("data-gramm", "false")
        updateTerminalInputState(isActive())

        if (isActive()) {
          safelyScrollToBottomAndFocus(term, true)
        }

        xtermRef = term
        fitAddonRef = fitAddon
        searchAddonRef = searchAddon
        serializeAddonRef = serializeAddon

        void initPty()

        term.onData(handleData)
        term.onBinary(handleBinaryData)
        term.attachCustomKeyEventHandler((event) => {
          const activeTerm = term
          if (!activeTerm) return true
          if (!isActive()) {
            if (event.type === "keydown") {
              event.preventDefault()
              event.stopPropagation()
            }
            return false
          }
          if (event.type !== "keydown") return true

          // Let tab management shortcuts bubble to panel container
          if (
            (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "t") ||
            (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "w") ||
            (event.ctrlKey && event.key === "PageUp") ||
            (event.ctrlKey && event.key === "PageDown") ||
            (event.ctrlKey && event.shiftKey && event.key === "`")
          ) {
            return false
          }

          if (event.key === "f" && (hostInfo.os === "macos" ? event.metaKey : event.ctrlKey) && !event.shiftKey && !event.altKey) {
            event.preventDefault()
            event.stopPropagation()
            setShowSearch(true)
            setTimeout(() => searchInputRef?.focus(), 50)
            return false
          }

          if (isCopyShortcut(event, hostInfo.os) && activeTerm.hasSelection() && typeof navigator?.clipboard?.writeText === "function") {
            event.preventDefault()
            event.stopPropagation()
            const selectedText = activeTerm.getSelection()
            if (selectedText) {
              void navigator.clipboard.writeText(selectedText).catch((error) => {
                console.error("Failed to copy terminal selection", error)
              })
            }
            return false
          }

          if (!supportsClipboardRead()) return true
          if (!isPasteShortcut(event, hostInfo.os)) return true

          event.preventDefault()
          event.stopPropagation()
          void pasteFromClipboard()
          return false
        })
        term.attachCustomWheelEventHandler((event) => {
          if (!isActive()) return false
          term?.focus()
          event.stopPropagation()
          return true
        })

        term.element?.addEventListener("pointerdown", handlePointerDown)
        term.element?.addEventListener("contextmenu", handleContextMenu, true)
      } catch (err) {
        if (!cancelled) {
          if (terminalRef) {
            terminalRef.textContent = `Error: ${String(err)}`
          }
        }
      }
    }

    const handleWindowResize = () => fitTerminal()
    window.addEventListener("resize", handleWindowResize)

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal()
    })
    resizeObserver.observe(terminalRef)

    const initPty = async () => {
      if (!term || spawnInFlightRef) {
        return
      }

      if (cancelled) return

      const bootSessionForPty = getBootSession() as any
      if (!bootSessionForPty) return

      const resolvedShell = resolveShell(bootSessionForPty.shell, availableShells())

      spawnInFlightRef = true
      setLaunchError(null)
      setTerminalStatus("launching")
      
      try {
        const existingPty = ptyRef
        if (existingPty && !ptyKilledRef) {
          ptyKilledRef = true
          try { existingPty.kill() } catch { /* ignore */ }
        }
        ptyRef = null

        try {
          fitAddonRef?.fit()
        } catch {
          // Keep startup moving even if the container has not been measured yet.
        }
        const spawnRows = Math.max(24, term.rows || 24)
        const spawnCols = Math.max(80, term.cols || 80)

        if (spawnRows === 0 || spawnCols === 0) {
          throw new Error("Invalid terminal dimensions")
        }

        spawnStartedAtRef = Date.now()
        
        term.clear()
        
        const restoredOutput = await api.loadSessionOutput(sessionId).catch(() => "")
        if (restoredOutput) {
          queueTerminalWrite(restoredOutput)
        }

        const isNewTerminal = !restoredOutput
        const fallbackShells = isNewTerminal ? availableShells().slice(1) : undefined

        const pty = await spawnNativePty({
          sessionId,
          shell: resolvedShell,
          fallbackShells,
          cwd: props.cwd || getBootProjectPath() || undefined,
          rows: spawnRows,
          cols: spawnCols,
          cursor: restoredOutput.length,
          env: {
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            TERM_PROGRAM: "shob",
          },
        })

        if (pty.shell && pty.shell !== resolvedShell) {
          if (bootSessionForPty.isWorkTerminal) {
            void appStore.updateWorkTerminal(sessionId, {
              shell: pty.shell,
              title: getShellBasename(pty.shell)
            })
          }
        }

        ptyRef = pty
        ptyKilledRef = false
        lastPtySizeRef = { rows: spawnRows, cols: spawnCols }
        setTerminalStatus("running")

        fitTerminal()
        fitTimeouts.push(
          ...FIT_SETTLE_DELAYS_MS.map((delay) =>
            window.setTimeout(() => {
              fitTerminal()
            }, delay + 40),
          ),
        )

        pty.onData((chunk) => {
          const data = decodePtyChunk(chunk, decoderRef)
          if (!data) return

          if (
            sessionProjectId() &&
            spawnStartedAtRef &&
            !hasRecordedStartupMetricRef &&
            startupDurationMsRef === null
          ) {
            hasRecordedStartupMetricRef = true
            const startupDurationMs = Math.max(0, Date.now() - spawnStartedAtRef)
            void Promise.resolve(recordSessionStartup(sessionProjectId()!, sessionId, startupDurationMs, Date.now())).catch(console.error)
          }

          if (sessionProjectId()) {
            const now = Date.now()
            if (now - lastPersistedActivityAtRef >= ACTIVITY_THROTTLE_MS) {
              void Promise.resolve(recordSessionActivity(sessionProjectId()!, sessionId, now)).catch(console.error)
              lastPersistedActivityAtRef = now
            }
          }

          window.dispatchEvent(
            new CustomEvent("gg-pty-data", {
              detail: { sessionId, data },
            }),
          )
          queueTerminalWrite(data)
        })

        pty.onExit(() => {
          setTerminalStatus("exited")
        })

        const bootSession = getBootSession()
        if (bootSession && bootSession.pendingLaunchCommand && !hasFlushedPendingLaunchRef) {
          const pendingLaunchKey = `${sessionId}:${bootSession.pendingLaunchCommand}`
          if (launchedPendingCommandKeys.has(pendingLaunchKey)) {
            hasFlushedPendingLaunchRef = true
            if (getBootProjectId()) {
              await updateSession(getBootProjectId()!, sessionId, { pendingLaunchCommand: null })
            }
            return
          }

          launchedPendingCommandKeys.add(pendingLaunchKey)
          hasFlushedPendingLaunchRef = true
          awaitingPromptTitleRef = true
          if (getBootProjectId()) {
            await updateSession(getBootProjectId()!, sessionId, { pendingLaunchCommand: null })
          }
          if (!ptyKilledRef) {
            try { pty.write(`${bootSession.pendingLaunchCommand}\r`) } catch { /* ignore */ }
          }
        }
      } catch (err) {
        console.error("[Terminal] initPty error:", err)
        setTerminalStatus("failed")
        setLaunchError(String(err))
      } finally {
        spawnInFlightRef = false
      }
    }
    initPtyRef = initPty

    const handlePointerDown = (event: PointerEvent) => {
      if (!isActive()) return
      if (event.button !== 0) return
      if ((event.target as HTMLElement | null)?.closest("a")) return
      term?.focus()
    }

    const handleContextMenu = (event: MouseEvent) => {
      if (!isActive()) return
      if ((event.target as HTMLElement | null)?.closest("a")) return
      if (!supportsClipboardRead()) return

      event.preventDefault()
      event.stopPropagation()
      term?.focus()
      void pasteFromClipboard()
    }

    const extractNamingInput = (rawInput: string) => {
      let output = ""

      for (let index = 0; index < rawInput.length; index += 1) {
        const char = rawInput[index]
        const code = char.charCodeAt(0)

        if (captureModeRef === "text") {
          if (char === "\x1b") {
            captureModeRef = "escape"
            continue
          }

          if (char === "\r" || char === "\n" || char === "\b" || char === "\u007f") {
            output += char
            continue
          }

          if (code >= 0x20) {
            output += char
          }
          continue
        }

        if (captureModeRef === "escape") {
          if (char === "[") {
            captureModeRef = "csi"
          } else if (char === "]") {
            captureModeRef = "osc"
          } else if (char === "P") {
            captureModeRef = "dcs"
          } else if (char === "_" || char === "^" || char === "X") {
            captureModeRef = "string"
          } else {
            captureModeRef = "text"
          }
          continue
        }

        if (captureModeRef === "csi") {
          if (code >= 0x40 && code <= 0x7e) {
            captureModeRef = "text"
          }
          continue
        }

        if (
          captureModeRef === "osc" ||
          captureModeRef === "dcs" ||
          captureModeRef === "string"
        ) {
          if (captureEscapePendingRef) {
            captureEscapePendingRef = false
            if (char === "\\") {
              captureModeRef = "text"
            } else if (char === "\x1b") {
              captureEscapePendingRef = true
            }
            continue
          }

          if (char === "\x07") {
            captureModeRef = "text"
            continue
          }

          if (char === "\x1b") {
            captureEscapePendingRef = true
          }
        }
      }

      return output
    }

    const commitBufferedInput = (rawInput: string) => {
      const currentSession = session()
      const currentProjectId = sessionProjectId()
      if (!currentSession) return

      if ((currentSession as any).isWorkTerminal) {
        const submittedText = normalizeInputForSessionTitle(rawInput).trim()
        if (!submittedText) return
        const normalizedText = toSessionTitle(submittedText)
        if (!normalizedText) return

        if (!hasNamedFromPromptRef) {
          hasNamedFromPromptRef = true
          void appStore.updateWorkTerminal(sessionId, { title: normalizedText })
        }
        return
      }

      if (!currentProjectId) return

      const submittedText = normalizeInputForSessionTitle(rawInput).trim()
      if (!submittedText) return
      const now = Date.now()

      const normalizedText = toSessionTitle(submittedText)
      if (!normalizedText) return
      void Promise.resolve(recordSessionCommand(currentProjectId, sessionId, now)).catch(console.error)
      lastPersistedActivityAtRef = now

      const cliInvocation = parseCliInvocation(submittedText)

      if (cliInvocation) {
        awaitingPromptTitleRef = true

        if (currentSession.cliTool !== cliInvocation.cliTool) {
          void Promise.resolve(updateSession(currentProjectId, sessionId, { cliTool: cliInvocation.cliTool })).catch(console.error)
        }

        if (cliInvocation.promptText && !hasNamedFromPromptRef) {
          awaitingPromptTitleRef = false
          hasNamedFromPromptRef = true
          void Promise.resolve(renameSession(currentProjectId, sessionId, toSessionTitle(cliInvocation.promptText))).catch(console.error)
        }
      } else if (!hasNamedFromPromptRef && (awaitingPromptTitleRef || Boolean(currentSession.cliTool))) {
        awaitingPromptTitleRef = false
        hasNamedFromPromptRef = true
        void Promise.resolve(renameSession(currentProjectId, sessionId, normalizedText)).catch(console.error)
      }
    }

    const handleData = (data: string) => {
      if (!isActive()) return
      const currentProjectId = sessionProjectId()
      const currentSession = session()

      if (currentProjectId) {
        const now = Date.now()
        if (now - lastPersistedActivityAtRef >= ACTIVITY_THROTTLE_MS) {
          void Promise.resolve(recordSessionActivity(currentProjectId, sessionId, now)).catch(console.error)
          lastPersistedActivityAtRef = now
        }
      }

      const shouldCaptureForNaming =
        Boolean(currentProjectId) &&
        Boolean(currentSession) &&
        (!hasNamedFromPromptRef || awaitingPromptTitleRef || Boolean(currentSession?.cliTool))

      if (shouldCaptureForNaming) {
        const cappedData = data.length > MAX_NAMING_CAPTURE_CHARS ? data.slice(0, MAX_NAMING_CAPTURE_CHARS) : data
        const normalizedData = extractNamingInput(cappedData)

        for (let index = 0; index < normalizedData.length; index += 1) {
          const char = normalizedData[index]

          if (char === "\r" || char === "\n") {
            if (inputBufferRef) {
              commitBufferedInput(inputBufferRef)
              inputBufferRef = ""
            }
            continue
          }

          if (char === "\u007f" || char === "\b") {
            inputBufferRef = inputBufferRef.slice(0, -1)
            continue
          }

          if (char >= " ") {
            inputBufferRef += char
          }
        }
      }

      const pty = ptyRef
      if (pty && !ptyKilledRef) {
        try { pty.write(data) } catch { /* ignore */ }
      }
    }

    const handleBinaryData = (data: string) => {
      if (!isActive()) return
      if (!data) return
      const pty = ptyRef
      if (pty && !ptyKilledRef) {
        try { pty.write(data) } catch { /* ignore */ }
      }
    }

    let hasBooted = false
    const tryBoot = () => {
      if (hasBooted || cancelled) return
      if (!isActive()) return
      if (!session()) return
      hasBooted = true
      void bootTerminal()
    }

    // Boot now if active, or defer until first activation or session availability
    tryBoot()
    createEffect(() => {
      if (isActive() && session() && !hasBooted) {
        tryBoot()
      }
    })

    onCleanup(() => {
      cancelled = true
      removeVisibilityChangeListener?.()

      for (const timeoutId of fitTimeouts) {
        clearTimeout(timeoutId)
      }
      window.removeEventListener("resize", handleWindowResize)
      resizeObserver.disconnect()
      if (fitRafRef !== null) {
        cancelAnimationFrame(fitRafRef)
        fitRafRef = null
      }
      writeFlushScheduled = false
      pendingWriteChunks.length = 0
      term?.element?.removeEventListener("pointerdown", handlePointerDown)
      term?.element?.removeEventListener("contextmenu", handleContextMenu, true)
      spawnInFlightRef = false
      const pty = ptyRef
      if (pty) {
        try { pty.dispose() } catch { /* ignore */ }
      }
      ptyRef = null
      term?.dispose()
      if (xtermRef === term) {
        xtermRef = null
      }
      fitAddonRef = null
      searchAddonRef = null
      serializeAddonRef = null
    })
  })

  onMount(() => {
    const handleRerunCurrentCli = (event: Event) => {
      const detail = (event as CustomEvent<RerunCliEventDetail>).detail
      if (!detail || detail.sessionId !== sessionId) return
      const currentSession = session()
      const currentProjectPath = sessionProjectPath()
      if (!currentSession) return

      const term = xtermRef
      if (!term) return

      const run = async () => {
        if (spawnInFlightRef) return

        const resolvedShell = resolveShell(currentSession.shell, availableShells())

        const hostInfo = await nativeApi.invoke("get_terminal_host_info") as TerminalHostInfo
        const isWindows = hostInfo.os === "windows"

        spawnInFlightRef = true
        try {
          const existingPty = ptyRef
          if (existingPty && !ptyKilledRef) {
            ptyKilledRef = true
            try { existingPty.kill() } catch { /* ignore */ }
          }
          ptyRef = null

          if (isWindows) {
            await new Promise(resolve => window.setTimeout(resolve, 100))
          }

          fitAddonRef?.fit()
          const spawnRows = Math.max(24, term.rows || 24)
          const spawnCols = Math.max(80, term.cols || 80)

          if (spawnRows === 0 || spawnCols === 0) {
            throw new Error("Invalid terminal dimensions")
          }

          const pty = await spawnNativePty({
            sessionId,
            shell: resolvedShell,
            cwd: currentProjectPath || undefined,
            rows: spawnRows,
            cols: spawnCols,
            env: {
              TERM: "xterm-256color",
              COLORTERM: "truecolor",
              TERM_PROGRAM: "shob",
            },
          })
          ptyRef = pty
          ptyKilledRef = false
          lastPtySizeRef = { rows: spawnRows, cols: spawnCols }
          fitTerminal()
          let rerunWriteScheduled = false
          let rerunIsWriting = false
          const rerunPendingChunks: string[] = []
          const scheduleRerunFlush = () => {
            if (rerunWriteScheduled || rerunIsWriting) return
            rerunWriteScheduled = true
            queueMicrotask(() => {
              rerunWriteScheduled = false
              if (!xtermRef || rerunIsWriting || rerunPendingChunks.length === 0) return
              rerunIsWriting = true
              const chunk = rerunPendingChunks.join("")
              rerunPendingChunks.length = 0
              xtermRef.write(chunk, () => {
                rerunIsWriting = false
                if (rerunPendingChunks.length > 0) scheduleRerunFlush()
              })
            })
          }
          pty.onData((chunk) => {
            const data = decodePtyChunk(chunk, decoderRef)
            if (!data) return
            window.dispatchEvent(
              new CustomEvent("gg-pty-data", {
                detail: { sessionId, data },
              }),
            )
            rerunPendingChunks.push(data)
            scheduleRerunFlush()
          })
          if (!ptyKilledRef) {
            try { pty.write(`${detail.command}\r`) } catch { /* ignore */ }
          }
          awaitingPromptTitleRef = true
        } catch (error) {
          term.writeln(`\x1b[31mError: ${error}\x1b[0m`)
        } finally {
          spawnInFlightRef = false
        }
      }

      void run()
    }

    window.addEventListener("gg-rerun-cli-current-session", handleRerunCurrentCli as EventListener)
    onCleanup(() => window.removeEventListener("gg-rerun-cli-current-session", handleRerunCurrentCli as EventListener))
  })

  createEffect(() => {
    const active = isActive()
    updateTerminalInputState(active)

    const term = xtermRef
    if (!term) return

    if (!active) {
      setShowSearch(false)
      return
    }

    window.setTimeout(() => {
      if (!isActive()) return
      updateTerminalInputState(true)
      fitTerminal()
      safelyScrollToBottomAndFocus(term, true)
    }, 0)
  })

  const handleSearchNext = () => {
    if (searchAddonRef && searchQuery()) {
      searchAddonRef.findNext(searchQuery())
    }
  }

  const handleSearchPrev = () => {
    if (searchAddonRef && searchQuery()) {
      searchAddonRef.findPrevious(searchQuery())
    }
  }

  const handleSaveOutput = () => {
    if (serializeAddonRef) {
      const output = serializeAddonRef.serialize()
      const blob = new Blob([output], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `terminal-output-${sessionId}-${Date.now()}.txt`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleClearTerminal = () => {
    if (xtermRef) {
      xtermRef.clear()
    }
  }

  const handleRetry = () => {
    void initPtyRef?.()
  }

  const handleChooseShell = async (chosenShell: string) => {
    const currentSession = session()
    if (!currentSession) return

    if ((currentSession as any).isWorkTerminal) {
      await appStore.updateWorkTerminal(sessionId, {
        shell: chosenShell,
        title: getShellBasename(chosenShell),
      })
    } else {
      const currentProjectId = sessionProjectId()
      if (currentProjectId) {
        await appStore.updateSession(currentProjectId, sessionId, { shell: chosenShell })
      }
    }
    void initPtyRef?.()
  }

  return (
    <div
      class="terminal-container absolute inset-0 h-full w-full min-h-0 min-w-0 overflow-hidden bg-background"
      data-active={isActive() ? "true" : "false"}
      style={{
        display: isActive() ? "flex" : "none",
        "pointer-events": isActive() ? "auto" : "none",
      }}
    >
      <div class="absolute right-2 top-2 z-10 flex items-center gap-0.5 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 terminal-toolbar">
        <button
          type="button"
          onClick={() => {
            setShowSearch(true)
            setTimeout(() => searchInputRef?.focus(), 50)
          }}
          class="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Search (Ctrl+F)"
        >
          <Search class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleClearTerminal}
          class="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Clear Terminal"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleSaveOutput}
          class="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Save Output"
        >
          <Save class="h-3.5 w-3.5" />
        </button>
      </div>

      <Show when={showSearch()}>
        <div class="absolute right-2 top-10 z-20 flex items-center gap-1 rounded-md border bg-popover px-2 py-1.5 shadow-md">
          <input
            ref={searchInputRef}
            class="w-40 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Find..."
            value={searchQuery()}
            onInput={(e) => {
              setSearchQuery(e.currentTarget.value)
              if (searchAddonRef && e.currentTarget.value) {
                searchAddonRef.findNext(e.currentTarget.value)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) handleSearchPrev()
                else handleSearchNext()
              } else if (e.key === "Escape") {
                setShowSearch(false)
                xtermRef?.focus()
              }
            }}
          />
          <div class="flex items-center gap-0.5 border-l pl-1">
            <button
              type="button"
              onClick={handleSearchPrev}
              class="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted"
            >
              <ArrowUp class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleSearchNext}
              class="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted"
            >
              <ArrowDown class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSearch(false)
                xtermRef?.focus()
              }}
              class="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </Show>

      <Show when={!xtermRef && terminalStatus() !== "failed"}>
        <div class="absolute inset-0 flex items-center justify-center text-12-regular text-text-weak pointer-events-none">
          Starting terminal...
        </div>
      </Show>

      <div
        ref={terminalRef}
        class="terminal-wrapper h-full w-full min-h-0 min-w-0 overflow-hidden"
        style={{
          "background-color": "var(--term-bg)",
          display: terminalStatus() === "failed" ? "none" : "block",
        }}
      />

      <Show when={terminalStatus() === "failed"}>
        <div class="absolute inset-0 flex flex-col items-center justify-center bg-background p-6 text-center select-text">
          <div class="max-w-md w-full bg-background-stronger border border-border rounded-xl p-6 shadow-2xl flex flex-col items-center gap-4">
            <div class="h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <X class="h-6 w-6" />
            </div>
            <div class="flex flex-col gap-1.5">
              <h3 class="text-14-semibold text-foreground">Failed to launch terminal shell</h3>
              <p class="text-12-regular text-muted-foreground break-all">
                {launchError() || "An unexpected error occurred while starting the shell process."}
              </p>
            </div>
            <div class="flex items-center gap-2 mt-2 w-full">
              <button
                onClick={handleRetry}
                class="flex-1 h-9 px-4 rounded-md text-13-medium bg-primary text-primary-foreground hover:bg-primary/95 transition-colors cursor-pointer"
              >
                Retry
              </button>
              <div class="relative flex-1">
                <select
                  onChange={(e) => handleChooseShell(e.currentTarget.value)}
                  class="w-full h-9 px-3 rounded-md border border-input bg-background hover:bg-accent text-13-medium outline-none cursor-pointer"
                >
                  <option value="" disabled selected>Choose Shell</option>
                  <For each={availableShells()}>
                    {(sh) => (
                      <option value={sh}>{getShellBasename(sh)}</option>
                    )}
                  </For>
                </select>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
