import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useLayout } from "@/context/layout"
import { Terminal } from "./Terminal"
import { useStore } from "../store"

const DEFAULT_HEIGHT = 280
const MIN_HEIGHT = 100
const MAX_HEIGHT_RATIO = 0.6
const COLLAPSE_THRESHOLD = 50

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
  
  const currentProject = useStore((s) =>
    s.projects.find((p) => p.id === s.currentProjectId) ?? null,
  )
  const activeSessionId = useStore((s) => s.activeSessionId)

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

  onCleanup(() => {
    if (terminalResizeFrame !== undefined) window.cancelAnimationFrame(terminalResizeFrame)
  })

  const activeTerminalSessionId = createMemo(() => activeSessionId())

  return (
    <div
      class="relative w-full shrink-0 overflow-hidden bg-background-stronger"
      classList={{
        "border-t border-border-weak-base": opened(),
        "transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]": !isResizing(),
      }}
      style={{ height: opened() ? `${pane()}px` : "0px" }}
    >
      <div
        class="absolute inset-x-0 top-0 flex flex-col"
        classList={{
          "pointer-events-none": !opened(),
        }}
        style={{ height: `${pane()}px` }}
      >
        <div
          onPointerDown={() => setIsResizing(true)}
          onPointerUp={() => setIsResizing(false)}
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

        <div class="flex flex-col h-full">
          <div class="flex items-center h-10 px-2 border-b border-border-weaker-base bg-background-stronger shrink-0">
            <div class="flex items-center gap-1 h-full overflow-x-auto">
              <Show when={activeTerminalSessionId()} fallback={
                <div class="px-3 text-xs text-muted-foreground">Terminal</div>
              }>
                {(sessionId) => (
                  <div class="flex items-center gap-1 h-full">
                    <div class="flex items-center gap-1.5 px-3 h-full text-xs border-b-2 border-primary text-foreground">
                      <span class="truncate max-w-32">Terminal</span>
                    </div>
                  </div>
                )}
              </Show>
            </div>

            <div class="flex-1" />

            <div class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                onClick={() => layout.terminal.close()}
                title="Close terminal panel"
              >
                <Icon name="close-small" size="small" />
              </Button>
            </div>
          </div>

          <div class="flex-1 min-h-0 relative">
            <Show when={activeTerminalSessionId()} keyed>
              {(sessionId) => (
                <div class="absolute inset-0">
                  <Terminal sessionId={sessionId} />
                </div>
              )}
            </Show>
            <Show when={!activeTerminalSessionId()}>
              <div class="flex items-center justify-center h-full text-sm text-muted-foreground">
                No active session
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
