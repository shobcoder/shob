import { useFilteredList } from "@shob-ai/ui/hooks"
import { useSpring } from "@shob-ai/ui/motion-spring"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
  Component,
  createResource,
  type JSX,
} from "solid-js"
import { createStore, reconcile, unwrap } from "solid-js/store"
import { useLocal } from "@/context/local"
import { selectionFromLines, type SelectedLineRange } from "@/context/file/types"
import { useFile } from "./mock-session-layout"
import {
  ContentPart,
  DEFAULT_PROMPT,
  isPromptEqual,
  Prompt,
  usePrompt,
  ImageAttachmentPart,
  AgentPart,
  FileAttachmentPart,
  PastePart,
} from "@/context/prompt"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useComments } from "@/context/comments"
import { Button } from "@shob-ai/ui/button"
import { DockShellForm, DockTray } from "@shob-ai/ui/dock-surface"
import { Icon } from "@shob-ai/ui/icon"
import { ProviderIcon } from "@shob-ai/ui/provider-icon"
import { Tooltip, TooltipKeybind } from "@shob-ai/ui/tooltip"
import { IconButton } from "@shob-ai/ui/icon-button"
import { Select } from "@shob-ai/ui/select"
import { Spinner } from "@shob-ai/ui/spinner"
import { showToast } from "@shob-ai/ui/toast"
import { useDialog } from "@shob-ai/ui/context/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DialogSelectModel } from "@/components/dialog-select-model"
import { useProviders } from "@/hooks/use-providers"
import { useCommand } from "@/context/command"
import { Persist, persisted } from "@/utils/persist"
import { usePermission } from "@/context/permission"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSessionLayout, createSessionTabs } from "./mock-session-layout"
import { createTextFragment, getCursorPosition, setCursorPosition, setRangeEdge } from "./prompt-input/editor-dom"
import { createGithubPill, parseTextWithGithubLinks } from "./prompt-input/github-pill"
import { createPromptAttachments } from "./prompt-input/attachments"
import { ACCEPTED_FILE_TYPES } from "./prompt-input/files"
import {
  canNavigateHistoryAtCursor,
  navigatePromptHistory,
  prependHistoryEntry,
  type PromptHistoryComment,
  type PromptHistoryEntry,
  type PromptHistoryStoredEntry,
  promptLength,
} from "./prompt-input/history"
import { createPromptSubmit, type FollowupDraft } from "./prompt-input/submit"
import { PromptPopover, type AtOption, type SlashCommand } from "./prompt-input/slash-popover"
import { PromptContextItems } from "./prompt-input/context-items"
import { PromptImageAttachments } from "./prompt-input/image-attachments"
import { PromptDragOverlay } from "./prompt-input/drag-overlay"
import { promptPlaceholder } from "./prompt-input/placeholder"
import { ImagePreview } from "@shob-ai/ui/image-preview"
import { PromptPasteAttachments } from "./prompt-input/paste-attachments"
import { useQueries } from "@tanstack/solid-query"
import { useQueryOptions, pathKey } from "./mock-session-layout"
import { formatServerError } from "@/utils/server-errors"
import { uuid } from "@/utils/uuid"
import type { ElectronBrowserElementSelection } from "@/electron"

interface PromptInputProps {
  class?: string
  ref?: (el: HTMLDivElement) => void
  newSessionWorktree?: string
  onNewSessionWorktreeReset?: () => void
  edit?: { id: string; prompt: Prompt; context: FollowupDraft["context"] }
  composerHeader?: JSX.Element
  onEditLoaded?: () => void
  shouldQueue?: () => boolean
  onQueue?: (draft: FollowupDraft) => void
  onAbort?: () => void
  onSubmit?: () => void
}

const EXAMPLES = [
  "prompt.example.1",
  "prompt.example.2",
  "prompt.example.3",
  "prompt.example.4",
  "prompt.example.5",
  "prompt.example.6",
  "prompt.example.7",
  "prompt.example.8",
  "prompt.example.9",
  "prompt.example.10",
  "prompt.example.11",
  "prompt.example.12",
  "prompt.example.13",
  "prompt.example.14",
  "prompt.example.15",
  "prompt.example.16",
  "prompt.example.17",
  "prompt.example.18",
  "prompt.example.19",
  "prompt.example.20",
  "prompt.example.21",
  "prompt.example.22",
  "prompt.example.23",
  "prompt.example.24",
  "prompt.example.25",
] as const

const PROMPT_IMPROVE_TIMEOUT_MS = 45_000
const PROMPT_IMPROVE_MAX_ATTEMPTS = 4
const PROMPT_IMPROVE_RETRY_BASE_MS = 500

const createAbortError = () => new DOMException("Prompt improve aborted.", "AbortError")

const isAbortError = (error: unknown) =>
  error instanceof DOMException ? error.name === "AbortError" : error instanceof Error && error.name === "AbortError"

const errorStatus = (error: unknown) => {
  if (!(error instanceof Error) || typeof error.cause !== "object" || error.cause === null) return undefined
  const status = (error.cause as { status?: unknown }).status
  return typeof status === "number" ? status : undefined
}

const isTransientImproveError = (error: unknown) => {
  if (isAbortError(error)) return false
  const status = errorStatus(error)
  if (status !== undefined) return status === 408 || status === 425 || status === 429 || status >= 500
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("socket") ||
    message.includes("econn") ||
    message.includes("rate limit") ||
    message.includes("429")
  )
}

const waitForImproveRetry = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError())
      return
    }

    const onAbort = () => {
      window.clearTimeout(timer)
      reject(createAbortError())
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort, { once: true })
  })

const PromptImproveMark: Component<{ class?: string }> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    x="0px"
    y="0px"
    viewBox="0 0 48 48"
    aria-hidden="true"
    class={props.class}
  >
    <path
      fill="#3098de"
      d="M45.963,23.959C34.056,23.489,24.51,13.944,24.041,2.037L24,1l-0.041,1.037C23.49,13.944,13.944,23.489,2.037,23.959L1,24l1.037,0.041c11.907,0.47,21.452,10.015,21.922,21.922L24,47l0.041-1.037c0.47-11.907,10.015-21.452,21.922-21.922L47,24L45.963,23.959z"
    />
  </svg>
)

export const PromptInput: Component<PromptInputProps> = (props) => {
  const sdk = useSDK()
  const queryOptions = useQueryOptions()

  const sync = useSync()
  const local = useLocal()
  const files = useFile()
  const prompt = usePrompt()
  const layout = useLayout()
  const comments = useComments()
  const dialog = useDialog()
  const providers = useProviders()
  const command = useCommand()
  const permission = usePermission()
  const language = useLanguage()
  const platform = usePlatform()
  const { params, tabs, view } = useSessionLayout()
  let editorRef!: HTMLDivElement
  let fileInputRef: HTMLInputElement | undefined
  let scrollRef!: HTMLDivElement
  let slashPopoverRef!: HTMLDivElement

  const mirror = { input: false }
  const inset = 56
  const space = `${inset}px`

  const scrollCursorIntoView = () => {
    const container = scrollRef
    const selection = window.getSelection()
    if (!container || !selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!editorRef.contains(range.startContainer)) return

    const cursor = getCursorPosition(editorRef)
    const length = promptLength(prompt.current().filter((part) => part.type !== "image"))
    if (cursor >= length) {
      container.scrollTop = container.scrollHeight
      return
    }

    const rect = range.getClientRects().item(0) ?? range.getBoundingClientRect()
    if (!rect.height) return

    const containerRect = container.getBoundingClientRect()
    const top = rect.top - containerRect.top + container.scrollTop
    const bottom = rect.bottom - containerRect.top + container.scrollTop
    const padding = 12

    if (top < container.scrollTop + padding) {
      container.scrollTop = Math.max(0, top - padding)
      return
    }

    if (bottom > container.scrollTop + container.clientHeight - inset) {
      container.scrollTop = bottom - container.clientHeight + inset
    }
  }

  const queueScroll = (count = 2) => {
    requestAnimationFrame(() => {
      scrollCursorIntoView()
      if (count > 1) queueScroll(count - 1)
    })
  }

  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: (tab: string) => tab,
    normalizeTab: (tab) => tab,
  }).activeFileTab

  const commentInReview = (path: string) => {
    const sessionID = params.sessionId
    if (!sessionID) return false

    const diffs = sync.data.session_diff[sessionID]
    if (!diffs) return false
    return diffs.some((diff) => diff.file === path)
  }

  const openComment = (item: { path: string; commentID?: string; commentOrigin?: "review" | "file" }) => {
    if (!item.commentID) return

    const focus = { file: item.path, id: item.commentID }
    comments.setActive(focus)

    const queueCommentFocus = (attempts = 6) => {
      const schedule = (left: number) => {
        requestAnimationFrame(() => {
          comments.setFocus({ ...focus })
          if (left <= 0) return
          requestAnimationFrame(() => {
            const current = comments.focus()
            if (!current) return
            if (current.file !== focus.file || current.id !== focus.id) return
            schedule(left - 1)
          })
        })
      }

      schedule(attempts)
    }

    const wantsReview = item.commentOrigin === "review" || (item.commentOrigin !== "file" && commentInReview(item.path))
    if (wantsReview) {
      if (!view().reviewPanel.opened()) view().reviewPanel.open()
      layout.fileTree.setTab("changes")
      tabs().setActive("review")
      queueCommentFocus()
      return
    }

    if (!view().reviewPanel.opened()) view().reviewPanel.open()
    layout.fileTree.setTab("all")
    // const tab = files.tab(item.path)
    // void tabs().open(tab)
    // tabs().setActive(tab)
    // void Promise.resolve(files.load(item.path)).finally(() => queueCommentFocus())
  }

  const recent = createMemo(() => {
    const all = tabs().all()
    const active = activeFileTab()
    const order = active ? [active, ...all.filter((x) => x !== active)] : all
    const seen = new Set<string>()
    const paths: string[] = []

    for (const tab of order) {
      const path = tab
      if (!path) continue
      if (seen.has(path)) continue
      seen.add(path)
      paths.push(path)
    }

    return paths
  })
  const info = createMemo(() => (params.sessionId ? sync.session.get(params.sessionId) : undefined))
  const working = createMemo(() => {
    const sessionID = params.sessionId
    const status = sessionID ? sync.data.session_status[sessionID]?.type ?? "idle" : "idle"
    return status !== "idle"
  })
  const imageAttachments = createMemo(() =>
    prompt.current().filter((part): part is ImageAttachmentPart => part.type === "image"),
  )
  const pasteAttachments = createMemo(() =>
    prompt.current().filter((part): part is PastePart => part.type === "paste"),
  )

  const [store, setStore] = createStore<{
    popover: "at" | "slash" | null
    historyIndex: number
    savedPrompt: PromptHistoryEntry | null
    placeholder: number
    draggingType: "image" | "@mention" | null
    mode: "normal" | "shell"
    browserMode: boolean
    applyingHistory: boolean
  }>({
    popover: null,
    historyIndex: -1,
    savedPrompt: null as PromptHistoryEntry | null,
    placeholder: Math.floor(Math.random() * EXAMPLES.length),
    draggingType: null,
    mode: "normal",
    browserMode: false,
    applyingHistory: false,
  })

  const buttonsSpring = useSpring(() => (store.mode === "normal" ? 1 : 0), { visualDuration: 0.2, bounce: 0 })
  const motion = (value: number) => ({
    opacity: value,
    transform: `scale(${0.98 + value * 0.02})`,
    filter: `blur(${(1 - value) * 2}px)`,
    "pointer-events": value > 0.5 ? ("auto" as const) : ("none" as const),
  })
  const buttons = createMemo(() => motion(buttonsSpring()))
  const shell = createMemo(() => motion(1 - buttonsSpring()))
  const control = createMemo(() => ({ height: "28px", ...buttons() }))

  const commentCount = createMemo(() => {
    if (store.mode === "shell") return 0
    return prompt.context.items().filter((item) => !!item.comment?.trim()).length
  })
  const blank = createMemo(() => {
    const text = prompt
      .current()
      .map((part) => ("content" in part ? part.content : ""))
      .join("")
    return text.trim().length === 0 && imageAttachments().length === 0 && commentCount() === 0
  })
  const visibleEditorBlank = createMemo(() => {
    const text = prompt
      .current()
      .filter((part) => part.type !== "image" && part.type !== "paste")
      .map((part) => ("content" in part ? part.content : ""))
      .join("")
    return text.trim().length === 0
  })
  const promptPlainText = (parts: Prompt) => parts.map((part) => ("content" in part ? part.content : "")).join("")
  const promptText = createMemo(() => promptPlainText(prompt.current()))
  const [improvingPrompt, setImprovingPrompt] = createSignal(false)
  const improveModel = createMemo(() => local.model.current())
  const improveUnavailableReason = createMemo(() => {
    if (improvingPrompt()) return "Improving prompt..."
    if (store.mode !== "normal") return "Switch to prompt mode to improve prompts"
    if (working()) return "Wait for the current run to finish"
    if (promptText().trim().length === 0) return "Type a prompt to improve"
    if (!improveModel()) return "Select a model first"
    return undefined
  })
  const improveStatusText = () => "Improving prompt"
  let improveRequestID = 0
  let improveAbort: AbortController | undefined

  const abortImproveRequest = () => {
    improveRequestID += 1
    improveAbort?.abort()
    improveAbort = undefined
  }

  onCleanup(abortImproveRequest)

  createEffect(
    on(
      () => params.sessionId,
      () => {
        if (!improvingPrompt()) return
        abortImproveRequest()
        setImprovingPrompt(false)
      },
      { defer: true },
    ),
  )
  const stopping = createMemo(() => working() && blank())
  const tip = () => {
    if (stopping()) {
      return (
        <div class="flex items-center gap-2">
          <span>{language.t("prompt.action.stop")}</span>
          <span class="text-icon-base text-12-medium text-[10px]!">{language.t("common.key.esc")}</span>
        </div>
      )
    }

    return (
      <div class="flex items-center gap-2">
        <span>{language.t("prompt.action.send")}</span>
        <Icon name="enter" size="small" class="text-icon-base" />
      </div>
    )
  }

  const contextItems = createMemo(() => {
    const items = prompt.context.items()
    if (store.mode !== "shell") return items
    return items.filter((item) => !item.comment?.trim())
  })

  const hasUserPrompt = createMemo(() => {
    const sessionID = params.sessionId
    if (!sessionID) return false
    const messages = sync.data.message[sessionID]
    if (!messages) return false
    return messages.some((m) => m.role === "user")
  })

  const [history, setHistory] = persisted(
    Persist.global("prompt-history", ["prompt-history.v1"]),
    createStore<{
      entries: PromptHistoryStoredEntry[]
    }>({
      entries: [],
    }),
  )
  const [shellHistory, setShellHistory] = persisted(
    Persist.global("prompt-history-shell", ["prompt-history-shell.v1"]),
    createStore<{
      entries: PromptHistoryStoredEntry[]
    }>({
      entries: [],
    }),
  )

  const suggest = createMemo(() => !hasUserPrompt())

  const placeholder = createMemo(() =>
    promptPlaceholder({
      mode: store.mode,
      commentCount: commentCount(),
      example: suggest() ? (store.mode === "shell" ? "git status" : language.t(EXAMPLES[store.placeholder])) : "",
      suggest: suggest(),
      t: (key, params) => language.t(key as Parameters<typeof language.t>[0], params as never),
    }),
  )

  const historyComments = () => {
    const byID = new Map(comments.all().map((item) => [`${item.file}\n${item.id}`, item] as const))
    return prompt.context.items().flatMap((item) => {
      if (item.type !== "file") return []
      const comment = item.comment?.trim()
      if (!comment) return []

      const selection = item.commentID ? byID.get(`${item.path}\n${item.commentID}`)?.selection : undefined
      const nextSelection =
        selection ??
        (item.selection
          ? ({
              start: item.selection.startLine,
              end: item.selection.endLine,
            } satisfies SelectedLineRange)
          : undefined)
      if (!nextSelection) return []

      return [
        {
          id: item.commentID ?? item.key,
          path: item.path,
          selection: { ...nextSelection },
          comment,
          time: item.commentID ? (byID.get(`${item.path}\n${item.commentID}`)?.time ?? Date.now()) : Date.now(),
          origin: item.commentOrigin,
          preview: item.preview,
        } satisfies PromptHistoryComment,
      ]
    })
  }

  const applyHistoryComments = (items: PromptHistoryComment[]) => {
    comments.replace(
      items.map((item) => ({
        id: item.id,
        file: item.path,
        selection: { ...item.selection },
        comment: item.comment,
        time: item.time,
      })),
    )
    prompt.context.replaceComments(
      items.map((item) => ({
        type: "file" as const,
        path: item.path,
        selection: selectionFromLines(item.selection),
        comment: item.comment,
        commentID: item.id,
        commentOrigin: item.origin,
        preview: item.preview,
      })),
    )
  }

  const applyHistoryPrompt = (entry: PromptHistoryEntry, position: "start" | "end") => {
    const p = entry.prompt
    const length = position === "start" ? 0 : promptLength(p)
    setStore("applyingHistory", true)
    applyHistoryComments(entry.comments)
    prompt.set(p, length)
    requestAnimationFrame(() => {
      editorRef.focus()
      setCursorPosition(editorRef, length)
      setStore("applyingHistory", false)
      queueScroll()
    })
  }

  const getCaretState = () => {
    const selection = window.getSelection()
    const textLength = promptLength(prompt.current())
    if (!selection || selection.rangeCount === 0) {
      return { collapsed: false, cursorPosition: 0, textLength }
    }
    const anchorNode = selection.anchorNode
    if (!anchorNode || !editorRef.contains(anchorNode)) {
      return { collapsed: false, cursorPosition: 0, textLength }
    }
    return {
      collapsed: selection.isCollapsed,
      cursorPosition: getCursorPosition(editorRef),
      textLength,
    }
  }

  const escBlur = () => platform.platform === "desktop" && platform.os === "macos"

  const pick = () => {
    setAttachMenuOpen(false)
    fileInputRef?.click()
  }

  const setMode = (mode: "normal" | "shell") => {
    setStore("mode", mode)
    setStore("popover", null)
    requestAnimationFrame(() => editorRef?.focus())
  }

  const shellModeKey = "mod+shift+x"
  const normalModeKey = "mod+shift+e"
  const openBrowserTab = () => {
    window.dispatchEvent(new CustomEvent("shob-open-browser-tab"))
  }
  const toggleBrowserMode = () => {
    if (store.mode !== "normal" || improvingPrompt()) return
    const next = !store.browserMode
    setStore("browserMode", next)
    setStore("popover", null)
    requestAnimationFrame(() => editorRef?.focus())
  }

  command.register("prompt-input", () => [
    {
      id: "file.attach",
      title: language.t("prompt.action.attachFile"),
      category: language.t("command.category.file"),
      keybind: "mod+u",
      disabled: store.mode !== "normal",
      onSelect: pick,
    },
    {
      id: "prompt.mode.shell",
      title: language.t("command.prompt.mode.shell"),
      category: language.t("command.category.session"),
      keybind: shellModeKey,
      disabled: store.mode === "shell",
      onSelect: () => setMode("shell"),
    },
    {
      id: "prompt.mode.normal",
      title: language.t("command.prompt.mode.normal"),
      category: language.t("command.category.session"),
      keybind: normalModeKey,
      disabled: store.mode === "normal",
      onSelect: () => setMode("normal"),
    },
    {
      id: "browser.open",
      title: "Open Browser",
      description: "Open the embedded browser tab",
      category: "Tools",
      slash: "browser",
      onSelect: openBrowserTab,
    },
    {
      id: "prompt.mode.browser",
      title: "Toggle Browser Mode",
      description: "Allow this agent prompt to use the embedded browser",
      category: "Tools",
      disabled: store.mode !== "normal",
      onSelect: toggleBrowserMode,
    },
  ])

  const closePopover = () => setStore("popover", null)

  const resetHistoryNavigation = (force = false) => {
    if (!force && (store.historyIndex < 0 || store.applyingHistory)) return
    setStore("historyIndex", -1)
    setStore("savedPrompt", null)
  }

  const compactBrowserValue = (value: string | null | undefined, maxLength = 1_200) =>
    (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength)

  const browserSelectionAttachmentContent = (selection: ElectronBrowserElementSelection) => {
    const attributes = [
      selection.id ? `id="${selection.id}"` : "",
      selection.className ? `class="${compactBrowserValue(selection.className, 500)}"` : "",
      selection.role ? `role="${selection.role}"` : "",
      selection.type ? `type="${selection.type}"` : "",
      selection.ariaLabel ? `aria-label="${compactBrowserValue(selection.ariaLabel, 500)}"` : "",
      selection.placeholder ? `placeholder="${compactBrowserValue(selection.placeholder, 500)}"` : "",
      selection.href ? `href="${compactBrowserValue(selection.href, 900)}"` : "",
      selection.src ? `src="${compactBrowserValue(selection.src, 900)}"` : "",
      selection.alt ? `alt="${compactBrowserValue(selection.alt, 500)}"` : "",
    ].filter(Boolean)
    const tag = compactBrowserValue(selection.tag, 80) || "element"
    const content = [
      "Selected browser element",
      `URL: ${selection.url}`,
      selection.title ? `Page title: ${selection.title}` : "",
      `Selector: ${selection.selector || "(not available)"}`,
      `Element: <${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`,
      `Bounds: x=${selection.x}, y=${selection.y}, width=${selection.width}, height=${selection.height}`,
      selection.text ? `Visible text:\n${selection.text}` : "",
      selection.value ? `Value:\n${selection.value}` : "",
      selection.outerHTML ? `HTML snippet:\n${selection.outerHTML}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")

    return content.slice(0, 8_000)
  }

  const attachBrowserSelection = (selection: ElectronBrowserElementSelection) => {
    if (improvingPrompt()) return

    const content = browserSelectionAttachmentContent(selection)
    const lines = content.split("\n")
    const attachment: PastePart = {
      type: "paste",
      id: uuid(),
      filename: "Browser element.txt",
      content,
      preview: lines.slice(0, 3).join("\n"),
      lineCount: lines.length,
      charCount: content.length,
    }
    const cursor = prompt.cursor() ?? promptLength(prompt.current())

    prompt.set([...prompt.current(), attachment], cursor)
    resetHistoryNavigation()
    setStore("mode", "normal")
    setStore("browserMode", true)
    showToast({
      title: "Browser element attached",
      description: compactBrowserValue(selection.selector || selection.text || selection.url, 120),
    })
    requestAnimationFrame(() => {
      editorRef?.focus()
      queueScroll()
    })
  }

  onMount(() => {
    const handleBrowserElementSelected = (event: Event) => {
      const selection = (event as CustomEvent<ElectronBrowserElementSelection>).detail
      if (!selection?.url) return
      attachBrowserSelection(selection)
    }

    window.addEventListener("shob-browser-element-selected", handleBrowserElementSelected)
    onCleanup(() => window.removeEventListener("shob-browser-element-selected", handleBrowserElementSelected))
  })

  const clearEditor = () => {
    editorRef.innerHTML = ""
  }

  const setEditorText = (text: string) => {
    clearEditor()
    editorRef.textContent = text
  }

  const focusEditorEnd = () => {
    requestAnimationFrame(() => {
      editorRef.focus()
      const range = document.createRange()
      const selection = window.getSelection()
      range.selectNodeContents(editorRef)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
  }

  const currentCursor = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.contains(selection.anchorNode)) return null
    return getCursorPosition(editorRef)
  }

  const restoreFocus = () => {
    requestAnimationFrame(() => {
      const cursor = prompt.cursor() ?? promptLength(prompt.current())
      editorRef.focus()
      setCursorPosition(editorRef, cursor)
      queueScroll()
    })
  }

  const renderEditorWithCursor = (parts: Prompt) => {
    const cursor = currentCursor()
    renderEditor(parts)
    if (cursor !== null) setCursorPosition(editorRef, cursor)
  }

  createEffect(() => {
    const sessionID = params.sessionId
    if (sessionID) return
    if (!suggest()) return
    const interval = setInterval(() => {
      setStore("placeholder", (prev) => (prev + 1) % EXAMPLES.length)
    }, 6500)
    onCleanup(() => clearInterval(interval))
  })

  const [composing, setComposing] = createSignal(false)
  const isImeComposing = (event: KeyboardEvent) => event.isComposing || composing() || event.keyCode === 229

  const handleBlur = () => {
    closePopover()
    setComposing(false)
  }

  const handleCompositionStart = () => {
    setComposing(true)
  }

  const handleCompositionEnd = () => {
    setComposing(false)
    requestAnimationFrame(() => {
      if (composing()) return
      reconcile(prompt.current().filter((part) => part.type !== "image" && part.type !== "paste"))
    })
  }

  const agentList = createMemo(() =>
    sync.data.agent
      .filter((agent) => !agent.hidden && agent.mode !== "primary")
      .map((agent): AtOption => ({ type: "agent", name: agent.name, display: agent.name })),
  )
  const agentNames = createMemo(() => local.agent.list().map((agent) => agent.name))
  const agentModeClass = createMemo(() => {
    const name = local.agent.current()?.name?.toLowerCase()
    if (name === "build") return "agent-terminal-agent-build"
    if (name === "plan") return "agent-terminal-agent-plan"
    return ""
  })

  const handleAtSelect = (option: AtOption | undefined) => {
    if (!option) return
    if (option.type === "agent") {
      addPart({ type: "agent", name: option.name, content: "@" + option.name, start: 0, end: 0 })
    } else {
      addPart({ type: "file", path: option.path, content: "@" + option.path, start: 0, end: 0 })
    }
  }

  const atKey = (x: AtOption | undefined) => {
    if (!x) return ""
    return x.type === "agent" ? `agent:${x.name}` : `file:${x.path}`
  }

  const {
    flat: atFlat,
    active: atActive,
    setActive: setAtActive,
    onInput: atOnInput,
    onKeyDown: atOnKeyDown,
  } = useFilteredList<AtOption>({
    items: async (query) => {
      const agents = agentList()
      const open = recent()
      const seen = new Set(open)
      const pinned: AtOption[] = open.map((path) => ({ type: "file", path, display: path, recent: true }))
      if (!query.trim()) return [...agents, ...pinned]
      const paths: string[] = []
      const fileOptions: AtOption[] = paths
        .filter((path) => !seen.has(path))
        .map((path) => ({ type: "file", path, display: path }))
      return [...agents, ...pinned, ...fileOptions]
    },
    key: atKey,
    filterKeys: ["display"],
    groupBy: (item) => {
      if (item.type === "agent") return "agent"
      if (item.recent) return "recent"
      return "file"
    },
    sortGroupsBy: (a, b) => {
      const rank = (category: string) => {
        if (category === "agent") return 0
        if (category === "recent") return 1
        return 2
      }
      return rank(a.category) - rank(b.category)
    },
    onSelect: handleAtSelect,
  })

  const slashCommands = createMemo<SlashCommand[]>(() => {
    const builtin = command.options
      .filter((opt) => !opt.disabled && !opt.id.startsWith("suggested.") && opt.slash)
      .map((opt) => ({
        id: opt.id,
        trigger: opt.slash!,
        title: opt.title,
        description: opt.description,
        keybind: opt.keybind,
        type: "builtin" as const,
      }))

    const custom = sync.data.command.map((cmd) => ({
      id: `custom.${cmd.name}`,
      trigger: cmd.name,
      title: cmd.name,
      description: cmd.description,
      type: "custom" as const,
      source: cmd.source,
    }))

    return [...custom, ...builtin]
  })

  const handleSlashSelect = (cmd: SlashCommand | undefined) => {
    if (!cmd) return
    closePopover()
    const images = imageAttachments()
    const pastes = pasteAttachments()

    if (cmd.type === "custom") {
      const text = `/${cmd.trigger} `
      setEditorText(text)
      prompt.set([{ type: "text", content: text, start: 0, end: text.length }, ...images, ...pastes], text.length)
      focusEditorEnd()
      return
    }

    clearEditor()
    prompt.set([...DEFAULT_PROMPT, ...images, ...pastes], 0)
    command.trigger(cmd.id, "slash")
  }

  const buildImprovedPromptParts = (text: string): Prompt => {
    const current = prompt.current()
    const markers = current.filter((part): part is FileAttachmentPart | AgentPart => part.type === "file" || part.type === "agent")
    const missing = markers.filter((part) => part.content && !text.includes(part.content))
    const guardedText = missing.length ? `${missing.map((part) => part.content).join(" ")}\n${text}` : text
    const used = new Set<number>()
    const parts: Prompt = []
    let position = 0

    const pushText = (content: string) => {
      if (!content) return
      parts.push({ type: "text", content, start: position, end: position + content.length })
      position += content.length
    }

    while (position < guardedText.length) {
      let next:
        | {
            index: number
            markerIndex: number
            marker: FileAttachmentPart | AgentPart
          }
        | undefined

      markers.forEach((marker, markerIndex) => {
        if (used.has(markerIndex) || !marker.content) return
        const index = guardedText.indexOf(marker.content, position)
        if (index < 0) return
        if (!next || index < next.index || (index === next.index && marker.content.length > next.marker.content.length)) {
          next = { index, markerIndex, marker }
        }
      })

      if (!next) {
        pushText(guardedText.slice(position))
        break
      }

      pushText(guardedText.slice(position, next.index))
      parts.push({
        ...next.marker,
        start: next.index,
        end: next.index + next.marker.content.length,
      })
      used.add(next.markerIndex)
      position = next.index + next.marker.content.length
    }

    if (parts.length === 0) parts.push({ type: "text", content: guardedText, start: 0, end: guardedText.length })
    return [...parts, ...imageAttachments(), ...pasteAttachments()]
  }

  const improvePrompt = async () => {
    if (improvingPrompt()) return

    const liveParts = parseFromDOM()
    const nextPrompt = [...liveParts, ...imageAttachments(), ...pasteAttachments()]
    const liveText = promptPlainText(nextPrompt)
    const liveCursor = getCursorPosition(editorRef)
    if (!isPromptEqual(prompt.current(), nextPrompt) || prompt.cursor() !== liveCursor) {
      mirror.input = true
      prompt.set(nextPrompt, liveCursor)
    }

    const model = improveModel()
    const reason =
      store.mode !== "normal"
        ? "Switch to prompt mode to improve prompts"
        : working()
          ? "Wait for the current run to finish"
          : liveText.trim().length === 0
            ? "Type a prompt to improve"
            : !model
              ? "Select a model first"
              : undefined

    if (reason) {
      showToast({ variant: "error", title: "Cannot improve prompt", description: reason })
      restoreFocus()
      return
    }

    const requestID = improveRequestID + 1
    improveRequestID = requestID
    improveAbort?.abort()
    const abort = new AbortController()
    improveAbort = abort
    const timeout = window.setTimeout(() => abort.abort(), PROMPT_IMPROVE_TIMEOUT_MS)

    setImprovingPrompt(true)
    closePopover()

    try {
      let response: { data?: { prompt?: string } } | undefined
      for (let attempt = 1; attempt <= PROMPT_IMPROVE_MAX_ATTEMPTS; attempt++) {
        try {
          response = await (sdk.client as any).client.post({
            url: "/prompt/improve",
            throwOnError: true,
            signal: abort.signal,
            body: {
              prompt: liveText.trim(),
              model: {
                providerID: model.provider.id,
                modelID: model.id,
              },
              variant: local.model.variant.current() ?? undefined,
            },
          })
          break
        } catch (error) {
          if (
            requestID !== improveRequestID ||
            attempt >= PROMPT_IMPROVE_MAX_ATTEMPTS ||
            !isTransientImproveError(error)
          ) {
            throw error
          }
          await waitForImproveRetry(PROMPT_IMPROVE_RETRY_BASE_MS * attempt, abort.signal)
        }
      }
      if (requestID !== improveRequestID) return

      const body = response?.data
      const improved = body?.prompt?.trim()
      if (!improved) throw new Error("The model returned an empty prompt.")
      const next = buildImprovedPromptParts(improved)
      prompt.set(next, promptLength(next))
      resetHistoryNavigation(true)
      requestAnimationFrame(() => {
        editorRef.focus()
        setCursorPosition(editorRef, promptLength(next))
        queueScroll()
      })
      showToast({ title: "Prompt improved" })
    } catch (error) {
      if (requestID !== improveRequestID) return

      const aborted = isAbortError(error)
      const description = aborted
        ? "Prompt improve timed out. Try again, or choose a faster model."
        : formatServerError(error, language.t, "Could not improve the prompt.")
      showToast({ variant: "error", title: "Improve prompt failed", description })
      restoreFocus()
    } finally {
      window.clearTimeout(timeout)
      if (requestID === improveRequestID) {
        if (improveAbort === abort) improveAbort = undefined
        setImprovingPrompt(false)
      }
    }
  }

  const {
    flat: slashFlat,
    active: slashActive,
    setActive: setSlashActive,
    onInput: slashOnInput,
    onKeyDown: slashOnKeyDown,
  } = useFilteredList<SlashCommand>({
    items: slashCommands,
    key: (x) => x?.id,
    filterKeys: ["trigger", "title"],
    onSelect: handleSlashSelect,
  })



  const createPill = (part: FileAttachmentPart | AgentPart) => {
    const pill = document.createElement("span")
    pill.textContent = part.content
    pill.setAttribute("data-type", part.type)
    if (part.type === "file") pill.setAttribute("data-path", part.path)
    if (part.type === "agent") pill.setAttribute("data-name", part.name)
    pill.setAttribute("contenteditable", "false")
    pill.style.userSelect = "text"
    pill.style.cursor = "default"
    return pill
  }

  const isNormalizedEditor = () =>
    Array.from(editorRef.childNodes).every((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ""
        if (!text.includes("\u200B")) return true
        if (text !== "\u200B") return false

        const prev = node.previousSibling
        const next = node.nextSibling
        const prevIsBr = prev?.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).tagName === "BR"
        return !!prevIsBr && !next
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return false
      const el = node as HTMLElement
      if (el.dataset.type === "file") return true
      if (el.dataset.type === "agent") return true
      if (el.dataset.type === "github-link") return true
      return el.tagName === "BR"
    })

  const renderEditor = (parts: Prompt) => {
    clearEditor()
    for (const part of parts) {
      if (part.type === "text") {
        editorRef.appendChild(parseTextWithGithubLinks(part.content))
        continue
      }
      if (part.type === "file" || part.type === "agent") {
        editorRef.appendChild(createPill(part))
      }
    }

    const last = editorRef.lastChild
    if (last?.nodeType === Node.ELEMENT_NODE && (last as HTMLElement).tagName === "BR") {
      editorRef.appendChild(document.createTextNode("\u200B"))
    }
  }

  // Auto-scroll active command into view when navigating with keyboard
  createEffect(() => {
    const activeId = slashActive()
    if (!activeId || !slashPopoverRef) return

    requestAnimationFrame(() => {
      const element = slashPopoverRef.querySelector(`[data-slash-id="${activeId}"]`)
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  })
  const selectPopoverActive = () => {
    if (store.popover === "at") {
      const items = atFlat()
      if (items.length === 0) return
      const active = atActive()
      const item = items.find((entry) => atKey(entry) === active) ?? items[0]
      handleAtSelect(item)
      return
    }

    if (store.popover === "slash") {
      const items = slashFlat()
      if (items.length === 0) return
      const active = slashActive()
      const item = items.find((entry) => entry.id === active) ?? items[0]
      handleSlashSelect(item)
    }
  }

  const reconcile = (input: Prompt) => {
    if (mirror.input) {
      mirror.input = false
      if (isNormalizedEditor()) return

      renderEditorWithCursor(input)
      return
    }

    const dom = parseFromDOM()
    if (isNormalizedEditor() && isPromptEqual(input, dom)) return

    renderEditorWithCursor(input)
  }

  createEffect(
    on(
      () => prompt.current(),
      (parts) => {
        if (composing()) return
        reconcile(parts.filter((part) => part.type !== "image" && part.type !== "paste"))
      },
    ),
  )

  const parseFromDOM = (): Prompt => {
    const parts: Prompt = []
    let position = 0
    let buffer = ""

    const flushText = () => {
      let content = buffer
      if (content.includes("\r")) content = content.replace(/\r\n?/g, "\n")
      if (content.includes("\u200B")) content = content.replace(/\u200B/g, "")
      buffer = ""
      if (!content) return
      parts.push({ type: "text", content, start: position, end: position + content.length })
      position += content.length
    }

    const pushFile = (file: HTMLElement) => {
      const content = file.textContent ?? ""
      parts.push({
        type: "file",
        path: file.dataset.path!,
        content,
        start: position,
        end: position + content.length,
      })
      position += content.length
    }

    const pushAgent = (agent: HTMLElement) => {
      const content = agent.textContent ?? ""
      parts.push({
        type: "agent",
        name: agent.dataset.name!,
        content,
        start: position,
        end: position + content.length,
      })
      position += content.length
    }

    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        buffer += node.textContent ?? ""
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return

      const el = node as HTMLElement
      if (el.dataset.type === "file") {
        flushText()
        pushFile(el)
        return
      }
      if (el.dataset.type === "agent") {
        flushText()
        pushAgent(el)
        return
      }
      if (el.dataset.type === "github-link") {
        buffer += el.dataset.url ?? ""
        return
      }
      if (el.tagName === "BR") {
        buffer += "\n"
        return
      }

      for (const child of Array.from(el.childNodes)) {
        visit(child)
      }
    }

    const children = Array.from(editorRef.childNodes)
    children.forEach((child, index) => {
      const isBlock = child.nodeType === Node.ELEMENT_NODE && ["DIV", "P"].includes((child as HTMLElement).tagName)
      visit(child)
      if (isBlock && index < children.length - 1) {
        buffer += "\n"
      }
    })

    flushText()

    if (parts.length === 0) parts.push(...DEFAULT_PROMPT)
    return parts
  }

  const handleInput = () => {
    if (improvingPrompt()) return

    const rawParts = parseFromDOM()
    const images = imageAttachments()
    const cursorPosition = getCursorPosition(editorRef)
    const rawText =
      rawParts.length === 1 && rawParts[0]?.type === "text"
        ? rawParts[0].content
        : rawParts.map((p) => ("content" in p ? p.content : "")).join("")
    const hasNonText = rawParts.some((part) => part.type !== "text")
    const textContent = (editorRef.textContent ?? "").replace(/\u200B/g, "")
    const shouldReset =
      textContent.length === 0 &&
      rawText.replace(/\n/g, "").length === 0 &&
      !hasNonText &&
      images.length === 0 &&
      pasteAttachments().length === 0

    if (shouldReset) {
      closePopover()
      resetHistoryNavigation()
      if (prompt.dirty()) {
        mirror.input = true
        prompt.set(DEFAULT_PROMPT, 0)
      }
      queueScroll()
      return
    }

    const shellMode = store.mode === "shell"

    if (!shellMode) {
      const atMatch = rawText.substring(0, cursorPosition).match(/@(\S*)$/)
      const slashMatch = rawText.match(/^\/(\S*)$/)

      if (atMatch) {
        atOnInput(atMatch[1])
        setStore("popover", "at")
      } else if (slashMatch) {
        slashOnInput(slashMatch[1])
        setStore("popover", "slash")
      } else {
        closePopover()
      }
    } else {
      closePopover()
    }

    resetHistoryNavigation()

    mirror.input = true
    const pastes = pasteAttachments()
    prompt.set([...rawParts, ...images, ...pastes], cursorPosition)
    queueScroll()
  }

  const showPasteInTextField = (paste: PastePart) => {
    const rawParts = parseFromDOM().filter((part) => part.type !== "text" || part.content.length > 0)
    const images = imageAttachments()
    const remainingPastes = pasteAttachments().filter((part) => part.id !== paste.id)
    const rawText = promptPlainText(rawParts)
    const prefix = rawText.length > 0 && !rawText.endsWith("\n") ? "\n" : ""
    const content = `${prefix}${paste.content}`
    const start = promptLength(rawParts)
    const textPart = { type: "text" as const, content, start, end: start + content.length }
    const next = [...rawParts, textPart, ...images, ...remainingPastes]
    const cursor = promptLength(rawParts) + content.length

    prompt.set(next, cursor)
    resetHistoryNavigation()
    requestAnimationFrame(() => {
      editorRef.focus()
      setCursorPosition(editorRef, cursor)
      queueScroll()
    })
  }

  const addPart = (part: ContentPart) => {
    if (part.type === "image") return false

    const selection = window.getSelection()
    if (!selection) return false

    if (selection.rangeCount === 0 || !editorRef.contains(selection.anchorNode)) {
      editorRef.focus()
      const cursor = prompt.cursor() ?? promptLength(prompt.current())
      setCursorPosition(editorRef, cursor)
    }

    if (selection.rangeCount === 0) return false
    const range = selection.getRangeAt(0)
    if (!editorRef.contains(range.startContainer)) return false

    if (part.type === "file" || part.type === "agent") {
      const cursorPosition = getCursorPosition(editorRef)
      const rawText = prompt
        .current()
        .map((p) => ("content" in p ? p.content : ""))
        .join("")
      const textBeforeCursor = rawText.substring(0, cursorPosition)
      const atMatch = textBeforeCursor.match(/@(\S*)$/)
      const pill = createPill(part)
      const gap = document.createTextNode(" ")

      if (atMatch) {
        const start = atMatch.index ?? cursorPosition - atMatch[0].length
        setRangeEdge(editorRef, range, "start", start)
        setRangeEdge(editorRef, range, "end", cursorPosition)
      }

      range.deleteContents()
      range.insertNode(gap)
      range.insertNode(pill)
      range.setStartAfter(gap)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    if (part.type === "text") {
      const fragment = parseTextWithGithubLinks(part.content)
      const last = fragment.lastChild
      range.deleteContents()
      range.insertNode(fragment)
      if (last) {
        if (last.nodeType === Node.TEXT_NODE) {
          const text = last.textContent ?? ""
          if (text === "\u200B") {
            range.setStart(last, 0)
          }
          if (text !== "\u200B") {
            range.setStart(last, text.length)
          }
        }
        if (last.nodeType !== Node.TEXT_NODE) {
          const isBreak = last.nodeType === Node.ELEMENT_NODE && (last as HTMLElement).tagName === "BR"
          const next = last.nextSibling
          const emptyText = next?.nodeType === Node.TEXT_NODE && (next.textContent ?? "") === ""
          if (isBreak && (!next || emptyText)) {
            const placeholder = next && emptyText ? next : document.createTextNode("\u200B")
            if (!next) last.parentNode?.insertBefore(placeholder, null)
            placeholder.textContent = "\u200B"
            range.setStart(placeholder, 0)
          } else {
            range.setStartAfter(last)
          }
        }
      }
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    handleInput()
    closePopover()
    return true
  }

  const addToHistory = (prompt: Prompt, mode: "normal" | "shell") => {
    const currentHistory = mode === "shell" ? shellHistory : history
    const setCurrentHistory = mode === "shell" ? setShellHistory : setHistory
    const next = prependHistoryEntry(currentHistory.entries, prompt, mode === "shell" ? [] : historyComments())
    if (next === currentHistory.entries) return
    setCurrentHistory("entries", next)
  }

  createEffect(
    on(
      () => props.edit?.id,
      (id) => {
        const edit = props.edit
        if (!id || !edit) return

        for (const item of prompt.context.items()) {
          prompt.context.remove(item.key)
        }

        for (const item of edit.context) {
          prompt.context.add({
            type: item.type,
            path: item.path,
            selection: item.selection,
            comment: item.comment,
            commentID: item.commentID,
            commentOrigin: item.commentOrigin,
            preview: item.preview,
          })
        }

        setStore("mode", "normal")
        setStore("popover", null)
        setStore("historyIndex", -1)
        setStore("savedPrompt", null)
        prompt.set(edit.prompt, promptLength(edit.prompt))
        requestAnimationFrame(() => {
          editorRef.focus()
          setCursorPosition(editorRef, promptLength(edit.prompt))
          queueScroll()
        })
        props.onEditLoaded?.()
      },
      { defer: true },
    ),
  )

  const navigateHistory = (direction: "up" | "down") => {
    const result = navigatePromptHistory({
      direction,
      entries: store.mode === "shell" ? shellHistory.entries : history.entries,
      historyIndex: store.historyIndex,
      currentPrompt: prompt.current(),
      currentComments: historyComments(),
      savedPrompt: store.savedPrompt,
    })
    if (!result.handled) return false
    setStore("historyIndex", result.historyIndex)
    setStore("savedPrompt", result.savedPrompt)
    applyHistoryPrompt(result.entry, result.cursor)
    return true
  }

  const { addAttachments, removeAttachment, removePaste, handlePaste } = createPromptAttachments({
    editor: () => editorRef,
    isDialogActive: () => !!dialog.active,
    setDraggingType: (type) => setStore("draggingType", type),
    focusEditor: () => {
      editorRef.focus()
      setCursorPosition(editorRef, promptLength(prompt.current()))
    },
    addPart,
    readClipboardImage: platform.readClipboardImage,
  })

  const variants = createMemo(() => {
    const list = local.model.variant.list()
    // Filter out medium/default to avoid duplicates since default maps to Medium
    const filtered = list.filter((x) => x !== "medium" && x !== "default")
    return ["default", ...filtered]
  })
  const variantLabel = (x: string) => {
    switch (x) {
      case "default":
        return "Medium"
      case "low":
        return "Low"
      case "medium":
        return "Medium"
      case "high":
        return "High"
      case "extra-high":
        return "Extra High"
      default:
        return x.charAt(0).toUpperCase() + x.slice(1)
    }
  }
  const accepting = createMemo(() => {
    const id = params.sessionId
    if (!id) return permission.isAutoAcceptingDirectory(sdk.directory)
    return permission.isAutoAccepting(id, sdk.directory)
  })

  const { abort, handleSubmit } = createPromptSubmit({
    info,
    imageAttachments,
    commentCount,
    autoAccept: () => accepting(),
    mode: () => store.mode,
    browserMode: () => store.browserMode,
    working,
    editor: () => editorRef,
    queueScroll,
    promptLength,
    addToHistory,
    resetHistoryNavigation: () => {
      resetHistoryNavigation(true)
    },
    setMode: (mode) => setStore("mode", mode),
    setPopover: (popover) => setStore("popover", popover),
    newSessionWorktree: () => props.newSessionWorktree,
    onNewSessionWorktreeReset: props.onNewSessionWorktreeReset,
    shouldQueue: props.shouldQueue,
    onQueue: props.onQueue,
    onAbort: props.onAbort,
    onSubmit: props.onSubmit,
  })

  const handleKeyDown = (event: KeyboardEvent) => {
    if (improvingPrompt()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault()
      if (store.mode !== "normal") return
      pick()
      return
    }

    if (event.key === "Backspace") {
      const selection = window.getSelection()
      if (selection && selection.isCollapsed) {
        const node = selection.anchorNode
        const offset = selection.anchorOffset
        if (node && node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? ""
          if (/^\u200B+$/.test(text) && offset > 0) {
            const range = document.createRange()
            range.setStart(node, 0)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
          }
        }
      }
    }

    if (event.key === "!" && store.mode === "normal") {
      const cursorPosition = getCursorPosition(editorRef)
      if (cursorPosition === 0) {
        setStore("mode", "shell")
        setStore("popover", null)
        event.preventDefault()
        return
      }
    }

    if (event.key === "Escape") {
      if (store.popover) {
        closePopover()
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (store.mode === "shell") {
        setStore("mode", "normal")
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (working()) {
        void abort()
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (escBlur()) {
        editorRef.blur()
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }

    if (store.mode === "shell") {
      const { collapsed, cursorPosition, textLength } = getCaretState()
      if (event.key === "Backspace" && collapsed && cursorPosition === 0 && textLength === 0) {
        setStore("mode", "normal")
        event.preventDefault()
        return
      }
    }

    // Handle Shift+Enter BEFORE IME check - Shift+Enter is never used for IME input
    // and should always insert a newline regardless of composition state
    if (event.key === "Enter" && event.shiftKey) {
      addPart({ type: "text", content: "\n", start: 0, end: 0 })
      event.preventDefault()
      return
    }

    if (event.key === "Enter" && isImeComposing(event)) {
      return
    }

    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey

    if (store.popover) {
      if (event.key === "Tab") {
        selectPopoverActive()
        event.preventDefault()
        return
      }
      const nav = event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter"
      const ctrlNav = ctrl && (event.key === "n" || event.key === "p")
      if (nav || ctrlNav) {
        if (store.popover === "at") {
          atOnKeyDown(event)
          event.preventDefault()
          return
        }
        if (store.popover === "slash") {
          slashOnKeyDown(event)
        }
        event.preventDefault()
        return
      }
    }

    if (ctrl && event.code === "KeyG") {
      if (store.popover) {
        closePopover()
        event.preventDefault()
        return
      }
      if (working()) {
        void abort()
        event.preventDefault()
      }
      return
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const { collapsed } = getCaretState()
      if (!collapsed) return

      const cursorPosition = getCursorPosition(editorRef)
      const textContent = prompt
        .current()
        .map((part) => ("content" in part ? part.content : ""))
        .join("")
      const direction = event.key === "ArrowUp" ? "up" : "down"
      if (!canNavigateHistoryAtCursor(direction, textContent, cursorPosition, store.historyIndex >= 0)) return
      if (navigateHistory(direction)) {
        event.preventDefault()
      }
      return
    }

    // Note: Shift+Enter is handled earlier, before IME check
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (event.repeat) return
      if (
        working() &&
        prompt
          .current()
          .map((part) => ("content" in part ? part.content : ""))
          .join("")
          .trim().length === 0 &&
        imageAttachments().length === 0 &&
        commentCount() === 0
      ) {
        return
      }
      void handleSubmit(event)
    }
  }

  const [agentsQuery, globalProvidersQuery, providersQuery] = useQueries(() => ({
    queries: [
      queryOptions.agents(pathKey(sdk.directory)),
      queryOptions.providers(null),
      queryOptions.providers(pathKey(sdk.directory)),
    ],
  }))

  const agentsLoading = () => agentsQuery.isLoading
  const agentsShouldFadeIn = createMemo((prev) => prev ?? agentsLoading())
  const providersLoading = () => agentsLoading() || providersQuery.isLoading || globalProvidersQuery.isLoading
  const providersShouldFadeIn = createMemo((prev) => prev ?? providersLoading())

  const [promptReady] = createResource(
    () => prompt.ready(),
    (p) => p,
  )
  const [attachMenuOpen, setAttachMenuOpen] = createSignal(false)

  return (
    <div
      class="agent-terminal-prompt relative size-full _max-h-[320px] flex flex-col gap-0"
      data-improving={improvingPrompt() ? "true" : undefined}
    >
      {(promptReady(), null)}
      <PromptPopover
        popover={store.popover}
        setSlashPopoverRef={(el) => (slashPopoverRef = el)}
        atFlat={atFlat()}
        atActive={atActive() ?? undefined}
        atKey={atKey}
        setAtActive={setAtActive}
        onAtSelect={handleAtSelect}
        slashFlat={slashFlat()}
        slashActive={slashActive() ?? undefined}
        setSlashActive={setSlashActive}
        onSlashSelect={handleSlashSelect}
        commandKeybind={command.keybind}
        t={(key) => language.t(key as Parameters<typeof language.t>[0])}
      />
      <DockShellForm
        onSubmit={(event) => {
          if (improvingPrompt()) {
            event.preventDefault()
            return
          }
          void handleSubmit(event)
        }}
        classList={{
          "group/prompt-input": true,
          "border-ring! border-dashed!": store.draggingType !== null,
          "border-ring! shadow-[0_0_16px_rgba(59,130,246,0.2)]!": store.mode === "shell",
          [props.class ?? ""]: !!props.class,
        }}
        class="agent-terminal-prompt-shell border border-border/60 rounded-2xl flex flex-col w-full overflow-visible! transition-all duration-300"
      >
        {props.composerHeader}
        <PromptDragOverlay
          type={store.draggingType}
          label={language.t(store.draggingType === "@mention" ? "prompt.dropzone.file.label" : "prompt.dropzone.label")}
        />
        <PromptContextItems
          items={contextItems()}
          active={(item) => {
            const active = comments.active()
            return !!item.commentID && item.commentID === active?.id && item.path === active?.file
          }}
          openComment={openComment}
          remove={(item) => {
            if (item.commentID) comments.remove(item.path, item.commentID)
            prompt.context.remove(item.key)
          }}
          t={(key) => language.t(key as Parameters<typeof language.t>[0])}
        />
        <PromptImageAttachments
          attachments={imageAttachments()}
          onOpen={(attachment) =>
            dialog.show(() => <ImagePreview src={attachment.dataUrl} alt={attachment.filename} />)
          }
          onRemove={removeAttachment}
          removeLabel={language.t("prompt.attachment.remove")}
        />
        <PromptPasteAttachments
          pastes={pasteAttachments()}
          onShowInTextField={showPasteInTextField}
          onRemove={removePaste}
        />
        <div
          class="agent-terminal-prompt-line relative flex items-start gap-3 p-4"
          onMouseDown={(e) => {
            if (improvingPrompt()) return
            const target = e.target
            if (!(target instanceof HTMLElement)) return
            if (target.closest('[data-action="prompt-attach"], [data-action="prompt-improve"]')) {
              return
            }
            editorRef?.focus()
          }}
        >
          <div class="agent-terminal-input-wrap flex min-w-0 flex-1 items-start gap-3 text-left">
            <span class="agent-terminal-caret select-none font-mono text-[16px] leading-5" aria-hidden="true">
              {store.mode === "shell" ? ">" : ""}
            </span>
            <div
              class="agent-terminal-input-scroll relative flex-1 max-h-[240px] overflow-y-auto no-scrollbar text-left"
              ref={(el) => (scrollRef = el)}
            >
              <div
                data-component="prompt-input"
                ref={(el) => {
                  editorRef = el
                  props.ref?.(el)
                }}
                role="textbox"
                aria-multiline="true"
                aria-label={placeholder()}
                aria-placeholder={placeholder()}
                aria-disabled={improvingPrompt()}
                contenteditable={improvingPrompt() ? "false" : "true"}
                autocapitalize="sentences"
                autocorrect="on"
                spellcheck={store.mode === "normal" && !improvingPrompt() ? "true" : "false"}
                inputMode="text"
                tabIndex={improvingPrompt() ? -1 : undefined}
                // @ts-expect-error
                autocomplete="off"
                enterkeyhint="send"
                lang="en"
                onInput={handleInput}
                onPaste={handlePaste}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                style={{ "text-align": "left" }}
                classList={{
                  "select-text": true,
                  "w-full text-left text-[15px] leading-relaxed text-foreground focus:outline-none whitespace-pre-wrap caret-primary": true,
                  "[&_[data-type=file]]:text-syntax-property": true,
                  "[&_[data-type=agent]]:text-syntax-type": true,
                }}
              />
              <div
                class="absolute top-0 inset-x-0 text-left text-[15px] leading-relaxed text-muted-foreground/40 pointer-events-none whitespace-nowrap truncate"
                style={{ display: visibleEditorBlank() ? undefined : "none", "text-align": "left" }}
              >
                {placeholder()}
              </div>
              <Show when={improvingPrompt()}>
                <div class="agent-terminal-prompt-improve-overlay" role="status" aria-live="polite">
                  <div class="agent-terminal-prompt-improve-badge">
                    <Spinner class="agent-terminal-prompt-improve-spinner" />
                  </div>
                  <div class="agent-terminal-prompt-improve-copy">
                    <span class="agent-terminal-prompt-improve-title">{improveStatusText()}</span>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>

        <div 
          class="agent-terminal-toolbar flex items-center justify-between gap-2 px-4 py-2.5 min-h-[48px] rounded-b-2xl"
          onMouseDown={(e) => {
            // Prevent toolbar from stealing focus from editor
            if (e.target instanceof HTMLElement && !e.target.closest('[data-action="prompt-attach"]')) {
              e.preventDefault()
            }
          }}
        >
          <div class="agent-terminal-toolbar-primary flex min-w-0 flex-1 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILE_TYPES.join(",")}
              class="hidden"
              onChange={(e) => {
                if (improvingPrompt()) {
                  e.currentTarget.value = ""
                  return
                }
                const list = e.currentTarget.files
                if (list) void addAttachments(Array.from(list))
                e.currentTarget.value = ""
                restoreFocus()
              }}
            />
            <DropdownMenu open={attachMenuOpen()} onOpenChange={setAttachMenuOpen} placement="top-start" gutter={8}>
              <TooltipKeybind
                placement="top"
                title="Add photos, files, or browser"
                keybind={command.keybind("file.attach")}
              >
                <DropdownMenuTrigger
                  data-action="prompt-attach"
                  type="button"
                  class="size-8 flex items-center justify-center rounded-lg border border-border/30 hover:bg-accent/50 text-foreground transition-colors duration-150 cursor-pointer outline-none shrink-0 data-expanded:bg-accent/50 data-expanded:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={store.mode !== "normal" || improvingPrompt()}
                  aria-label="Open add menu"
                >
                  <Icon name="plus" class="size-4" />
                </DropdownMenuTrigger>
              </TooltipKeybind>
              <DropdownMenuContent class="z-[140] w-[228px] rounded-xl border border-border-weak-base bg-surface-raised-base/95 p-1.5 text-[13px] shadow-2xl backdrop-blur">
                <button
                  type="button"
                  class="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] text-text-base outline-none transition-colors hover:bg-surface-raised-base-hover focus-visible:bg-surface-raised-base-hover"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation()
                    pick()
                  }}
                >
                  <Icon name="photo" class="size-4 text-text-weaker" />
                  <span class="min-w-0 flex-1 truncate font-medium">Add photos & files</span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={store.browserMode ? "true" : "false"}
                  class="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] text-text-base outline-none transition-colors hover:bg-surface-raised-base-hover focus-visible:bg-surface-raised-base-hover"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleBrowserMode()
                  }}
                >
                  <Icon name="browser" class="size-4" />
                  <span class="min-w-0 flex-1 truncate font-medium">Browser mode</span>
                  <span
                    class="relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-150"
                    classList={{
                      "border-sky-400/60 bg-sky-500/40": store.browserMode,
                      "border-border-weak-base bg-surface-base": !store.browserMode,
                    }}
                    aria-hidden="true"
                  >
                    <span
                      class="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-text-base shadow-sm transition-transform duration-150"
                      classList={{
                        "translate-x-[18px]": store.browserMode,
                        "translate-x-0.5": !store.browserMode,
                      }}
                    />
                  </span>
                </button>
              </DropdownMenuContent>
            </DropdownMenu>

            <Show when={!providersLoading() && store.mode !== "shell"}>
              <TooltipKeybind
                placement="top"
                gutter={4}
                title={language.t("command.model.choose")}
                keybind={command.keybind("model.choose")}
              >
                <button
                  type="button"
                  disabled={improvingPrompt()}
                  class="h-8 px-3 flex items-center gap-2 rounded-lg border border-border/30 hover:bg-accent/50 text-[12px] font-mono text-foreground transition-colors duration-150 cursor-pointer outline-none shrink-0"
                  data-action="prompt-model"
                  onClick={() => {
                    if (improvingPrompt()) return
                    dialog.show(() => <DialogSelectModel model={local.model} />)
                    restoreFocus()
                  }}
                >
                  <Show when={local.model.current()?.provider?.id} fallback={<Icon name="sparkles" class="size-3.5 opacity-80" />}>
                    <ProviderIcon
                      id={local.model.current()?.provider?.id ?? ""}
                      class="size-3.5 shrink-0 opacity-80"
                    />
                  </Show>
                  <span class="truncate">
                    {local.model.current()?.name ?? language.t("dialog.model.select.title")}
                  </span>
                </button>
              </TooltipKeybind>
            </Show>

            <Show when={!agentsLoading()}>
              <TooltipKeybind
                placement="top"
                gutter={4}
                title={language.t("command.agent.cycle")}
                keybind={command.keybind("agent.cycle")}
              >
                <Select
                  size="normal"
                  placement="top-start"
                  gutter={8}
                  options={agentNames()}
                  current={local.agent.current()?.name ?? ""}
                  groupBy={() => "Mode"}
                  disabled={improvingPrompt()}
                  onSelect={(value) => {
                    if (improvingPrompt()) return
                    local.agent.set(value)
                    restoreFocus()
                  }}
                  class={`h-8 min-w-0 px-3 flex items-center gap-2 rounded-lg border border-border/30 hover:bg-accent/50 text-[12px] font-mono text-foreground transition-colors duration-150 cursor-pointer outline-none shrink-0 overflow-hidden ${agentModeClass()}`}
                  valueClass="min-w-0 flex-1 truncate text-left"
                  triggerStyle={{ border: "none", background: "transparent", height: "100%", "font-family": "inherit" }}
                  triggerProps={{ "data-action": "prompt-agent" }}
                  triggerVariant="composer"
                  variant="ghost"
                  label={(name) => <span class="min-w-0 truncate capitalize">{name}</span>}
                />
              </TooltipKeybind>
            </Show>

            <Show when={!providersLoading() && store.mode !== "shell" && variants().length > 1}>
              <TooltipKeybind
                placement="top"
                gutter={4}
                title={language.t("command.model.variant.cycle")}
                keybind={command.keybind("model.variant.cycle")}
              >
                <Select
                  size="normal"
                  placement="top-start"
                  gutter={8}
                  options={variants()}
                  current={local.model.variant.current() ?? "default"}
                  label={variantLabel}
                  groupBy={() => "Reasoning"}
                  disabled={improvingPrompt()}
                  onSelect={(value) => {
                    if (improvingPrompt()) return
                    local.model.variant.set(value === "default" ? undefined : value)
                    restoreFocus()
                  }}
                  class="h-8 min-w-0 px-3 flex items-center gap-2 rounded-lg border border-border/30 hover:bg-accent/50 text-[12px] font-mono text-foreground transition-colors duration-150 cursor-pointer outline-none shrink-0 overflow-hidden"
                  valueClass="min-w-0 flex-1 truncate text-left"
                  triggerStyle={{ border: "none", background: "transparent", height: "100%", "font-family": "inherit" }}
                  triggerProps={{ "data-action": "prompt-model-variant" }}
                  triggerVariant="composer"
                  variant="ghost"
                />
              </TooltipKeybind>
            </Show>
          </div>

          <div class="agent-terminal-toolbar-divider" aria-hidden="true" />

          <div class="agent-terminal-toolbar-secondary flex items-center gap-2 shrink-0">
            <Tooltip placement="top" value={improveUnavailableReason() ?? "Improve prompt"}>
              <button
                data-action="prompt-improve"
                type="button"
                disabled={improvingPrompt()}
                class="size-8 flex items-center justify-center rounded-lg! border border-border/30 hover:bg-accent/50 text-foreground transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                classList={{
                  "is-busy": improvingPrompt(),
                }}
                aria-disabled={improveUnavailableReason() ? "true" : undefined}
                aria-label={improveUnavailableReason() ?? "Improve prompt"}
                aria-busy={improvingPrompt()}
                title={improveUnavailableReason() ?? "Improve prompt"}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void improvePrompt()
                }}
              >
                <PromptImproveMark class="size-4" />
              </button>
            </Tooltip>
            <Show when={!blank()}>
              <div class="agent-terminal-prompt-count flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-card/30 border border-border/15 text-[10px] font-mono text-muted-foreground select-none animate-fade-in backdrop-blur-sm">
                <span>{promptLength(prompt.current().filter((p) => p.type !== "image"))} ch</span>
                <button
                  type="button"
                  disabled={improvingPrompt()}
                  onClick={() => {
                    if (improvingPrompt()) return
                    clearEditor()
                    prompt.set(DEFAULT_PROMPT, 0)
                    resetHistoryNavigation(true)
                    requestAnimationFrame(() => editorRef?.focus())
                  }}
                  class="size-3.5 flex items-center justify-center rounded-full hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none"
                  aria-label="Clear text"
                >
                  <Icon name="close-small" class="size-2.5" />
                </button>
              </div>
            </Show>
            <Tooltip placement="top" inactive={!working() && blank()} value={tip()}>
              <IconButton
                data-action="prompt-submit"
                type="submit"
                disabled={improvingPrompt() || (!working() && blank())}
                tabIndex={store.mode === "normal" ? undefined : -1}
                icon={stopping() ? "stop" : "arrow-up"}
                variant="primary"
                class="size-9 rounded-lg! flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
                aria-label={stopping() ? language.t("prompt.action.stop") : language.t("prompt.action.send")}
              />
            </Tooltip>
          </div>
        </div>
      </DockShellForm>

    </div>
  )
}
