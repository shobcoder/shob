import { Show, For, createEffect, createMemo, createSignal, onCleanup, onMount, on } from "solid-js"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useLayout } from "@/context/layout"
import { Terminal } from "./Terminal"
import { useStore } from "../store"
import { nativeApi } from "../services/native"

const DEFAULT_HEIGHT = 280
const MIN_HEIGHT = 100
const MAX_HEIGHT_RATIO = 0.6
const COLLAPSE_THRESHOLD = 50

function getShellBasename(shell: string): string {
  const unquotedShell = shell.trim().replace(/^['"]|['"]$/g, "").trim()
  const baseName = unquotedShell.split(/[\\/]/).pop() ?? unquotedShell
  return baseName.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "")
}

function getShellIconName(shell: string): "console" | "terminal" {
  const base = getShellBasename(shell)
  if (base.includes("bash") || base.includes("sh") || base.includes("zsh")) {
    return "console"
  }
  return "terminal"
}

function ResizeHandle(props: {
  onResize: (height: number) => void
  onResizeEnd?: () => void
  onCollapse: () => void
  getHeight: () => number
  getMax: () => number
}) {
  let startY = 0
  let startHeight = 0

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault()
    const target = e.currentTarget as HTMLDivElement
    target.setPointerCapture(e.pointerId)
    startY = e.clientY
    startHeight = props.getHeight()

    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"
    document.body.style.cursor = "row-resize"

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = startY - moveEvent.clientY
      const newHeight = Math.max(MIN_HEIGHT, Math.min(props.getMax(), startHeight + delta))
      props.onResize(newHeight)
    }

    const onPointerEnd = (endEvent: PointerEvent) => {
      if (target.hasPointerCapture(endEvent.pointerId)) {
        target.releasePointerCapture(endEvent.pointerId)
      }
      document.body.style.userSelect = ""
      document.body.style.overflow = ""
      document.body.style.cursor = ""
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerup", onPointerEnd)
      document.removeEventListener("pointercancel", onPointerEnd)

      props.onResizeEnd?.()
      if (props.getHeight() < COLLAPSE_THRESHOLD) {
        props.onCollapse()
      }
    }

    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup", onPointerEnd)
    document.addEventListener("pointercancel", onPointerEnd)
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={handlePointerDown}
      class="absolute inset-x-0 top-[-9px] z-10 h-[18px] cursor-row-resize touch-none hover:bg-border/30 transition-colors"
    >
      <div class="absolute inset-x-0 top-1/2 h-px bg-border opacity-0 hover:opacity-100 transition-opacity" />
    </div>
  )
}

export function BottomTerminalPanel() {
  const layout = useLayout()
  const appStore = useStore()
  const [showShellMenu, setShowShellMenu] = createSignal(false)

  const [isResizing, setIsResizing] = createSignal(false)
  const [viewHeight, setViewHeight] = createSignal(
    typeof window === "undefined" ? 1000 : (window.visualViewport?.height ?? window.innerHeight)
  )
  let terminalResizeFrame: number | undefined
  let pendingTerminalHeight: number | undefined

  const opened = createMemo(() => layout.terminal.opened())
  const height = createMemo(() => layout.terminal.height())
  const max = () => viewHeight() * MAX_HEIGHT_RATIO
  const pane = () => Math.min(height(), max())

  const projectId = () => appStore.currentProjectId
  const terminals = () => (projectId() ? appStore.workTerminals[projectId()!] || [] : [])
  const layoutState = () => (projectId() ? appStore.terminalLayouts[projectId()!] : null)
  const activeTerminalId = () => layoutState()?.activeTerminalId ?? null

  const commitTerminalResize = () => {
    terminalResizeFrame = undefined
    if (pendingTerminalHeight === undefined) return
    layout.terminal.resize(pendingTerminalHeight)
    pendingTerminalHeight = undefined
  }

  const scheduleTerminalResize = (next: number) => {
    pendingTerminalHeight = next
    if (terminalResizeFrame !== undefined) return
    terminalResizeFrame = window.requestAnimationFrame(commitTerminalResize)
  }

  const finishTerminalResize = () => {
    if (terminalResizeFrame !== undefined) {
      window.cancelAnimationFrame(terminalResizeFrame)
      terminalResizeFrame = undefined
    }
    if (pendingTerminalHeight !== undefined) {
      layout.terminal.resize(pendingTerminalHeight)
      pendingTerminalHeight = undefined
    }
    setIsResizing(false)
  }

  onMount(() => {
    if (typeof window === "undefined") return

    const sync = () => setViewHeight(window.visualViewport?.height ?? window.innerHeight)
    sync()
    window.addEventListener("resize", sync)
    const port = window.visualViewport
    if (port) port.addEventListener("resize", sync)

    onCleanup(() => {
      window.removeEventListener("resize", sync)
      if (port) port.removeEventListener("resize", sync)
    })
  })

  createEffect(() => {
    window.dispatchEvent(
      new CustomEvent("gg-terminal-panel-state", {
        detail: { isOpen: opened() },
      }),
    )
  })

  createEffect(() => {
    const handleToggle = () => {
      layout.terminal.toggle()
    }
    window.addEventListener("gg-toggle-terminal-panel", handleToggle)
    onCleanup(() => window.removeEventListener("gg-toggle-terminal-panel", handleToggle))
  })

  // Auto-create default terminal if panel is opened but no terminals exist
  createEffect(on(opened, (isOpen) => {
    if (isOpen && terminals().length === 0 && appStore.currentProjectId) {
      const isWindows = window.shob?.platform === "windows"
      const defaultShell = appStore.availableShells[0] || (isWindows ? "powershell.exe" : "/bin/sh")
      void appStore.createWorkTerminal(appStore.currentProjectId, defaultShell).then((newTerm) => {
        void appStore.saveTerminalLayout(appStore.currentProjectId!, { activeTerminalId: newTerm.id })
      })
    }
  }))

  onCleanup(() => {
    if (terminalResizeFrame !== undefined) window.cancelAnimationFrame(terminalResizeFrame)
  })

  const handleRemoveTerminal = async (id: string, event?: Event) => {
    event?.stopPropagation()
    const pId = projectId()
    if (!pId) return
    await appStore.deleteWorkTerminal(id)

    const remaining = appStore.workTerminals[pId] || []
    if (remaining.length === 0) {
      layout.terminal.close()
    }
  }

  const handleSelectTab = async (id: string) => {
    const pId = projectId()
    if (pId) {
      await appStore.saveTerminalLayout(pId, { activeTerminalId: id })
    }
  }

  const handleCloseTab = async (id: string) => {
    const pId = projectId()
    if (!pId) return

    const list = terminals()
    const isActive = id === activeTerminalId()

    await appStore.deleteWorkTerminal(id)

    const nextList = terminals()
    if (nextList.length === 0) {
      layout.terminal.close()
      await appStore.saveTerminalLayout(pId, { activeTerminalId: null })
    } else if (isActive) {
      const idx = list.findIndex((t) => t.id === id)
      let nextActiveId = nextList[0].id
      if (idx !== -1) {
        if (idx < nextList.length) {
          nextActiveId = nextList[idx].id
        } else {
          nextActiveId = nextList[nextList.length - 1].id
        }
      }
      await appStore.saveTerminalLayout(pId, { activeTerminalId: nextActiveId })
    }
  }

  const handleAddTerminal = async (shell?: string) => {
    const pId = projectId()
    if (!pId) return

    const targetShell =
      shell ||
      appStore.availableShells[0] ||
      (window.shob?.platform === "windows" ? "powershell.exe" : "/bin/sh")
    const newTerm = await appStore.createWorkTerminal(pId, targetShell)
    await appStore.saveTerminalLayout(pId, { activeTerminalId: newTerm.id })
  }

  const handleKillActive = () => {
    const activeId = activeTerminalId()
    if (activeId) {
      nativeApi.terminal().kill(activeId).catch(console.error)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const isCtrlShiftT = e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t"
    const isCtrlShiftBacktick = e.ctrlKey && e.shiftKey && e.key === "`"
    const isCtrlShiftW = e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "w"
    const isCtrlPageUp = e.ctrlKey && e.key === "PageUp"
    const isCtrlPageDown = e.ctrlKey && e.key === "PageDown"

    if (isCtrlShiftT || isCtrlShiftBacktick) {
      e.preventDefault()
      e.stopPropagation()
      void handleAddTerminal()
    } else if (isCtrlShiftW) {
      e.preventDefault()
      e.stopPropagation()
      const currentActiveId = activeTerminalId()
      if (currentActiveId) {
        void handleCloseTab(currentActiveId)
      }
    } else if (isCtrlPageUp) {
      e.preventDefault()
      e.stopPropagation()
      const list = terminals()
      const currentActiveId = activeTerminalId()
      const idx = list.findIndex((t) => t.id === currentActiveId)
      if (idx !== -1 && list.length > 1) {
        const prevIdx = (idx - 1 + list.length) % list.length
        void handleSelectTab(list[prevIdx].id)
      }
    } else if (isCtrlPageDown) {
      e.preventDefault()
      e.stopPropagation()
      const list = terminals()
      const currentActiveId = activeTerminalId()
      const idx = list.findIndex((t) => t.id === currentActiveId)
      if (idx !== -1 && list.length > 1) {
        const nextIdx = (idx + 1) % list.length
        void handleSelectTab(list[nextIdx].id)
      }
    }
  }

  return (
    <div
      class="relative w-full shrink-0 overflow-hidden bg-background-stronger"
      classList={{
        "border-t border-border-weak-base": opened(),
        "transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]": !isResizing(),
      }}
      style={{
        height: opened()
          ? layout.terminal.maximized()
            ? "100%"
            : `${pane()}px`
          : "0px",
      }}
    >
      <div
        class="absolute inset-x-0 top-0 flex flex-col"
        classList={{
          "pointer-events-none": !opened(),
        }}
        style={{
          height: layout.terminal.maximized()
            ? "100%"
            : `${pane()}px`,
        }}
      >
        <div
          onPointerDown={() => setIsResizing(true)}
          onPointerUp={() => setIsResizing(false)}
          class="relative z-50"
        >
          <ResizeHandle
            onResize={(next) => {
              setIsResizing(true)
              scheduleTerminalResize(next)
            }}
            onResizeEnd={finishTerminalResize}
            onCollapse={() => {
              layout.terminal.close()
            }}
            getHeight={() => pane()}
            getMax={() => max()}
          />
        </div>

        <div class="flex flex-col h-full" onKeyDown={handleKeyDown}>
          <div class="flex items-center h-[38px] pr-2 bg-background-stronger/40 backdrop-blur-2xl border-t border-white/5 shrink-0 relative z-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            {/* Tabs List */}
            <div class="flex items-end gap-0.5 h-full overflow-x-auto select-none no-scrollbar flex-1 px-2 pt-2">
              <For each={terminals()}>
                {(term) => {
                  const isActive = () => term.id === activeTerminalId()
                  const iconName = () => getShellIconName(term.shell)

                  return (
                    <div
                      onClick={() => handleSelectTab(term.id)}
                      class="group flex items-center gap-2 px-3 h-full text-xs font-medium cursor-pointer transition-colors rounded-t-md relative min-w-[120px] max-w-[200px]"
                      classList={{
                        "bg-background text-foreground z-10": isActive(),
                        "bg-transparent text-muted-foreground hover:bg-background/40 hover:text-foreground": !isActive(),
                      }}
                    >
                      <Icon name={iconName()} size="small" classList={{ "text-primary": isActive() }} />
                      <span class="truncate flex-1 font-mono">{term.title}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleCloseTab(term.id)
                        }}
                        class="p-1 rounded-md transition-all hover:bg-muted/60"
                        classList={{
                          "opacity-100": isActive(),
                          "opacity-0 group-hover:opacity-100": !isActive(),
                        }}
                        title="Close Tab"
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </div>
                  )
                }}
              </For>

              {/* New Tab (Chrome-like) */}
              <button
                type="button"
                onClick={() => handleAddTerminal()}
                class="flex h-7 w-7 mb-0.5 ml-1 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground shrink-0 transition-colors"
                title="New Terminal (Ctrl+Shift+T)"
              >
                <Icon name="plus-small" size="small" />
              </button>
            </div>

            {/* Controls */}
            <div class="flex items-center gap-1.5 ml-2 pl-2 shrink-0">
              {/* Maximize/Restore */}
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted border border-border/50 shadow-sm transition-all rounded-md"
                onClick={() => layout.terminal.toggleMaximize()}
                title={layout.terminal.maximized() ? "Restore panel size" : "Maximize panel"}
              >
                <Icon name={layout.terminal.maximized() ? "collapse" : "expand"} size="small" />
              </Button>

              {/* Close/Collapse Panel */}
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted border border-border/50 shadow-sm transition-all rounded-md"
                onClick={() => layout.terminal.close()}
                title="Collapse panel"
              >
                <Icon name="close-small" size="small" />
              </Button>
            </div>
          </div>

          <div class="flex-1 min-h-0 relative">
            <For each={terminals()}>
              {(term) => (
                <Terminal
                  sessionId={term.id}
                  isActiveOverride={() => term.id === activeTerminalId()}
                />
              )}
            </For>
            <Show when={terminals().length === 0}>
              <div class="flex items-center justify-center h-full text-sm text-muted-foreground">
                No active terminal tabs
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
