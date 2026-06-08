import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { ArrowLeft, ArrowRight, Crosshair, Globe, Loader2, RotateCw, Search, X } from "lucide-solid"
import { nativeApi } from "@/services/native"
import type {
  ElectronBrowserAction,
  ElectronBrowserActionResult,
  ElectronBrowserElementSelection,
  ElectronBrowserState,
} from "@/electron"

type BrowserTabProps = {
  active: () => boolean
  panelResizing?: () => boolean
}

const EMPTY_STATE: ElectronBrowserState = {
  visible: false,
  url: "",
  title: "",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  degenMode: false,
  error: null,
  text: "",
  elements: [],
}

function browserBounds(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
}

export function BrowserTab(props: BrowserTabProps) {
  const [state, setState] = createSignal<ElectronBrowserState>(EMPTY_STATE)
  const [address, setAddress] = createSignal("")
  const [editingAddress, setEditingAddress] = createSignal(false)
  let viewportRef: HTMLDivElement | undefined
  let addressInputRef: HTMLInputElement | undefined
  let resizeObserver: ResizeObserver | undefined
  let syncFrame: number | undefined
  let resizeSyncTimer: number | undefined
  let forceNextBoundsSync = false
  let lastResizeSyncAt = 0
  let wasPanelResizing = false
  let lastSyncedBoundsKey = ""
  let stateUnlisten: (() => void) | undefined
  let openUnlisten: (() => void) | undefined
  let selectionUnlisten: (() => void) | undefined

  const invoke = (action: ElectronBrowserAction, payload: Record<string, unknown> = {}) =>
    nativeApi.invoke("browser_action", { action, detail: "light", ...payload }).then((result: ElectronBrowserActionResult) => {
      setState(result.state)
      if (result.state.url && !editingAddress()) setAddress(result.state.url)
      return result
    })

  const panelResizing = () => props.panelResizing?.() === true

  const syncBounds = (force = false) => {
    if (!props.active() || !viewportRef) return
    const bounds = browserBounds(viewportRef)
    const boundsKey = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
    if (!force && boundsKey === lastSyncedBoundsKey) return
    lastSyncedBoundsKey = boundsKey
    if (panelResizing()) lastResizeSyncAt = performance.now()
    void invoke("show", { bounds }).catch((error) => {
      console.error("[browser-tab] show failed:", error)
    })
  }

  const scheduleSyncBounds = (force = false) => {
    if (force) forceNextBoundsSync = true
    if (panelResizing() && !force) {
      const elapsed = performance.now() - lastResizeSyncAt
      const delay = Math.max(0, 90 - elapsed)
      if (delay > 0) {
        if (resizeSyncTimer === undefined) {
          resizeSyncTimer = window.setTimeout(() => {
            resizeSyncTimer = undefined
            scheduleSyncBounds()
          }, delay)
        }
        return
      }
    }
    if (syncFrame !== undefined) return
    syncFrame = requestAnimationFrame(() => {
      syncFrame = undefined
      const forceSync = forceNextBoundsSync
      forceNextBoundsSync = false
      syncBounds(forceSync)
    })
  }

  const scheduleObservedBounds = () => scheduleSyncBounds()

  const navigate = () => {
    const url = address().trim()
    setEditingAddress(false)
    setState((current) => ({ ...current, loading: true, error: null }))
    void invoke("open", { url: url || undefined }).catch((error) => {
      console.error("[browser-tab] navigate failed:", error)
    })
  }

  const run = (action: ElectronBrowserAction) => {
    if (action === "reload" || action === "back" || action === "forward") {
      setState((current) => ({ ...current, loading: true }))
    }
    void invoke(action).catch((error) => {
      console.error(`[browser-tab] ${action} failed:`, error)
    })
  }

  const toggleDegenMode = () => {
    void invoke("set_degen_mode", { enabled: !state().degenMode }).catch((error) => {
      console.error("[browser-tab] set_degen_mode failed:", error)
    })
  }

  createEffect(() => {
    if (!props.active()) {
      lastSyncedBoundsKey = ""
      void invoke("hide").catch(() => undefined)
      return
    }

    scheduleSyncBounds()
    void invoke("state")
      .then((result) => {
        if (!result.state.url) navigate()
      })
      .catch((error) => {
        console.error("[browser-tab] state failed:", error)
      })
  })

  createEffect(() => {
    const resizing = panelResizing()
    if (wasPanelResizing && !resizing) {
      lastSyncedBoundsKey = ""
      scheduleSyncBounds(true)
    }
    wasPanelResizing = resizing
  })

  createEffect(() => {
    if (!viewportRef || resizeObserver) return
    resizeObserver = new ResizeObserver(scheduleObservedBounds)
    resizeObserver.observe(viewportRef)
    window.addEventListener("resize", scheduleObservedBounds)
  })

  createEffect(() => {
    void nativeApi.listen<ElectronBrowserState>("browser:state", (event) => {
      setState(event.payload)
      if (event.payload.url && !editingAddress()) setAddress(event.payload.url)
    }).then((unlisten) => {
      stateUnlisten = unlisten
    })
    void nativeApi.listen<ElectronBrowserState>("browser:open", (event) => {
      setState(event.payload)
      if (event.payload.url && !editingAddress()) setAddress(event.payload.url)
      scheduleSyncBounds()
    }).then((unlisten) => {
      openUnlisten = unlisten
    })
    void nativeApi.listen<ElectronBrowserElementSelection>("browser:element-selected", (event) => {
      window.dispatchEvent(new CustomEvent("shob-browser-element-selected", { detail: event.payload }))
    }).then((unlisten) => {
      selectionUnlisten = unlisten
    })
  })

  onCleanup(() => {
    if (syncFrame !== undefined) cancelAnimationFrame(syncFrame)
    if (resizeSyncTimer !== undefined) window.clearTimeout(resizeSyncTimer)
    window.removeEventListener("resize", scheduleObservedBounds)
    resizeObserver?.disconnect()
    stateUnlisten?.()
    openUnlisten?.()
    selectionUnlisten?.()
    void invoke("hide").catch(() => undefined)
  })

  return (
    <div class="h-full min-h-0 flex flex-col bg-background-base text-text-base">
      <style>{`
        @keyframes shob-browser-progress {
          0% { transform: translateX(-120%); width: 32%; }
          45% { width: 56%; }
          100% { transform: translateX(320%); width: 32%; }
        }
      `}</style>
      <form
        class="shrink-0 flex items-center gap-1.5 border-b border-border-weaker-base bg-background-base px-2 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          navigate()
        }}
      >
        <button
          type="button"
          class="size-7 shrink-0 inline-flex items-center justify-center rounded-md text-text-weak hover:bg-surface-raised-base-hover hover:text-text disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={!state().canGoBack}
          aria-label="Back"
          onClick={() => run("back")}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          class="size-7 shrink-0 inline-flex items-center justify-center rounded-md text-text-weak hover:bg-surface-raised-base-hover hover:text-text disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={!state().canGoForward}
          aria-label="Forward"
          onClick={() => run("forward")}
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          class="size-7 shrink-0 inline-flex items-center justify-center rounded-md text-text-weak hover:bg-surface-raised-base-hover hover:text-text"
          aria-label="Reload"
          onClick={() => run("reload")}
        >
          <Show when={state().loading} fallback={<RotateCw size={14} />}>
            <Loader2 size={14} class="animate-spin text-sky-400" />
          </Show>
        </button>
        <button
          type="button"
          class="h-7 shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors"
          classList={{
            "bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/45": state().degenMode,
            "text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong": !state().degenMode,
          }}
          aria-label={state().degenMode ? "Disable Degen mode" : "Enable Degen mode"}
          aria-pressed={state().degenMode}
          title="Degen mode: select page elements and attach them to the prompt"
          onClick={toggleDegenMode}
        >
          <Crosshair size={14} />
          <span>Degen</span>
        </button>
        <div class="min-w-0 flex-1 flex items-center gap-2 rounded-md border border-border-weaker-base bg-background-stronger px-2 h-8">
          <Show when={state().loading} fallback={<Globe size={14} class="shrink-0 text-text-weak" />}>
            <Loader2 size={14} class="shrink-0 animate-spin text-text-weak" />
          </Show>
          <input
            ref={addressInputRef}
            class="min-w-0 flex-1 bg-transparent text-13-regular text-text-strong outline-none placeholder:text-text-weak"
            value={address()}
            placeholder="Search or enter address"
            spellcheck={false}
            onFocus={() => setEditingAddress(true)}
            onBlur={() => setEditingAddress(false)}
            onInput={(event) => setAddress(event.currentTarget.value)}
          />
          <Show when={address().length > 0}>
            <button
              type="button"
              class="size-6 shrink-0 inline-flex items-center justify-center rounded text-text-weak hover:bg-surface-raised-base-hover hover:text-text"
              aria-label="Clear address"
              onClick={() => {
                setEditingAddress(true)
                setAddress("")
                addressInputRef?.focus()
              }}
            >
              <X size={13} />
            </button>
          </Show>
          <button
            type="submit"
            class="size-6 shrink-0 inline-flex items-center justify-center rounded text-text-weak hover:bg-surface-raised-base-hover hover:text-text"
            aria-label="Go"
          >
            <Search size={13} />
          </button>
        </div>
      </form>
      <div class="h-0.5 shrink-0 overflow-hidden bg-transparent">
        <div
          class="h-full rounded-full bg-sky-400 opacity-0 transition-opacity"
          classList={{ "opacity-100": state().loading }}
          style={{
            animation: state().loading ? "shob-browser-progress 1.15s ease-in-out infinite" : "none",
          }}
        />
      </div>
      <div ref={viewportRef} class="relative min-h-0 flex-1 overflow-hidden bg-background-base" />
    </div>
  )
}
