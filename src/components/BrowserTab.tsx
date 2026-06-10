import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Globe,
  Loader2,
  Monitor,
  MousePointer2,
  RotateCcw,
  RotateCw,
  Search,
  Smartphone,
  Tablet,
  X,
} from "lucide-solid"
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

type DevicePreset = {
  id: string
  label: string
  icon: "monitor" | "smartphone" | "tablet"
  width: number
  height: number
  dpr: number
  mobile: boolean
  userAgent: string | null
}

const RESPONSIVE_PRESET: DevicePreset = {
  id: "responsive",
  label: "Responsive",
  icon: "monitor",
  width: 0,
  height: 0,
  dpr: 1,
  mobile: false,
  userAgent: null,
}

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const UA_PIXEL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
const UA_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const UA_GALAXY =
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

const DEVICE_PRESETS: DevicePreset[] = [
  { id: "iphone-15", label: "iPhone 15", icon: "smartphone", width: 393, height: 852, dpr: 3, mobile: true, userAgent: UA_IPHONE },
  { id: "iphone-se", label: "iPhone SE", icon: "smartphone", width: 375, height: 667, dpr: 2, mobile: true, userAgent: UA_IPHONE },
  { id: "pixel-8", label: "Pixel 8", icon: "smartphone", width: 412, height: 915, dpr: 2.625, mobile: true, userAgent: UA_PIXEL },
  { id: "galaxy-s24", label: "Galaxy S24", icon: "smartphone", width: 384, height: 832, dpr: 3, mobile: true, userAgent: UA_GALAXY },
  { id: "ipad", label: "iPad", icon: "tablet", width: 820, height: 1180, dpr: 2, mobile: true, userAgent: UA_IPAD },
  { id: "ipad-mini", label: "iPad Mini", icon: "tablet", width: 768, height: 1024, dpr: 2, mobile: true, userAgent: UA_IPAD },
]

function browserBounds(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
}

function PresetIcon(props: { kind: "monitor" | "smartphone" | "tablet"; size?: number }) {
  return (
    <Show
      when={props.kind === "smartphone"}
      fallback={
        <Show when={props.kind === "tablet"} fallback={<Monitor size={props.size ?? 13} />}>
          <Tablet size={props.size ?? 13} />
        </Show>
      }
    >
      <Smartphone size={props.size ?? 13} />
    </Show>
  )
}

export function BrowserTab(props: BrowserTabProps) {
  const [state, setState] = createSignal<ElectronBrowserState>(EMPTY_STATE)
  const [address, setAddress] = createSignal("")
  const [editingAddress, setEditingAddress] = createSignal(false)
  const [presetId, setPresetId] = createSignal<string>("responsive")
  const [rotated, setRotated] = createSignal(false)
  const [showDeviceMenu, setShowDeviceMenu] = createSignal(false)
  const [selectedEl, setSelectedEl] = createSignal<ElectronBrowserElementSelection | null>(null)
  const [showSelectionPreview, setShowSelectionPreview] = createSignal(true)
  const [cursorOverlay, setCursorOverlay] = createSignal(true)
  let viewportRef: HTMLDivElement | undefined
  let frameRef: HTMLDivElement | undefined
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

  const currentPreset = createMemo(
    () => (presetId() === RESPONSIVE_PRESET.id ? RESPONSIVE_PRESET : DEVICE_PRESETS.find((p) => p.id === presetId()) ?? RESPONSIVE_PRESET),
  )

  const presetDimensions = createMemo(() => {
    const p = currentPreset()
    if (p.width === 0 || p.height === 0) return null
    const w = rotated() ? p.height : p.width
    const h = rotated() ? p.width : p.height
    return { width: w, height: h, dpr: p.dpr, mobile: p.mobile, userAgent: p.userAgent, preset: p.id }
  })

  const invoke = (action: ElectronBrowserAction, payload: Record<string, unknown> = {}) =>
    nativeApi.invoke("browser_action", { action, detail: "light", ...payload }).then((result: ElectronBrowserActionResult) => {
      setState(result.state)
      if (result.state.url && !editingAddress()) setAddress(result.state.url)
      return result
    })

  const panelResizing = () => props.panelResizing?.() === true

  const browserBoundsTarget = () => {
    if (!presetDimensions()) return viewportRef
    return frameRef?.isConnected ? frameRef : viewportRef
  }

  const selectedElementPreview = createMemo(() => (showSelectionPreview() ? selectedEl() : null))

  const syncBounds = (force = false) => {
    if (!props.active()) return
    const target = browserBoundsTarget()
    if (!target) return
    const bounds = browserBounds(target)
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

  const applyViewport = () => {
    const dims = presetDimensions()
    if (!dims) {
      void invoke("set_viewport", {
        viewportWidth: 0,
        viewportHeight: 0,
        deviceScaleFactor: 1,
        mobile: false,
        userAgent: null,
        preset: "responsive",
      }).catch((error) => console.warn("[browser-tab] set_viewport failed:", error))
      return
    }
    void invoke("set_viewport", {
      viewportWidth: dims.width,
      viewportHeight: dims.height,
      deviceScaleFactor: dims.dpr,
      mobile: dims.mobile,
      userAgent: dims.userAgent,
      preset: dims.preset,
    }).catch((error) => console.warn("[browser-tab] set_viewport failed:", error))
  }

  const selectPreset = (id: string) => {
    setPresetId(id)
    setShowDeviceMenu(false)
    setRotated(false)
    requestAnimationFrame(() => {
      applyViewport()
      scheduleSyncBounds(true)
    })
  }

  const toggleRotate = () => {
    if (!presetDimensions()) return
    setRotated((r) => !r)
    requestAnimationFrame(() => {
      applyViewport()
      scheduleSyncBounds(true)
    })
  }

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

  const toggleCursorOverlay = () => {
    const next = !cursorOverlay()
    setCursorOverlay(next)
    void invoke("set_cursor_overlay", { enabled: next }).catch((error) => {
      console.error("[browser-tab] set_cursor_overlay failed:", error)
    })
  }

  const copySelector = () => {
    const sel = selectedEl()?.selector
    if (!sel) return
    void navigator.clipboard?.writeText(sel).catch(() => undefined)
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
    // Push current cursor overlay preference to the backend
    void invoke("set_cursor_overlay", { enabled: cursorOverlay() }).catch(() => undefined)
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

  // Resync bounds whenever the chosen device preset or rotation changes
  createEffect(() => {
    presetId()
    rotated()
    if (!props.active()) return
    requestAnimationFrame(() => scheduleSyncBounds(true))
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
      setSelectedEl(event.payload)
      setShowSelectionPreview(true)
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
        @keyframes shob-fade-in-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
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
        <button
          type="button"
          class="size-7 shrink-0 inline-flex items-center justify-center rounded-md transition-colors"
          classList={{
            "bg-yellow-300/15 text-yellow-200 ring-1 ring-yellow-300/40": cursorOverlay(),
            "text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong": !cursorOverlay(),
          }}
          aria-label={cursorOverlay() ? "Hide agent cursor" : "Show agent cursor"}
          aria-pressed={cursorOverlay()}
          title={cursorOverlay() ? "Hide agent cursor overlay" : "Show agent cursor overlay"}
          onClick={toggleCursorOverlay}
        >
          <MousePointer2 size={14} />
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

        {/* Device preset dropdown */}
        <div class="relative shrink-0">
          <button
            type="button"
            class="h-7 inline-flex items-center gap-1.5 rounded-md px-2 text-[12px] text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
            classList={{
              "bg-sky-500/10 text-sky-300 ring-1 ring-sky-400/30": currentPreset().id !== "responsive",
            }}
            aria-label="Device viewport"
            title="Mobile / responsive viewport"
            onClick={() => setShowDeviceMenu((v) => !v)}
          >
            <PresetIcon kind={currentPreset().icon} />
            <Show when={currentPreset().id !== RESPONSIVE_PRESET.id}>
              <span class="hidden sm:inline">{currentPreset().label}</span>
            </Show>
            <Show when={presetDimensions()}>
              {(dims) => (
                <span class="text-text-weak text-[10px] tabular-nums">
                  {dims().width}×{dims().height}
                </span>
              )}
            </Show>
          </button>
          <Show when={showDeviceMenu()}>
            <div
              class="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-border-weaker-base bg-background-stronger py-1 shadow-lg"
              style={{ animation: "shob-fade-in-up 120ms ease-out" }}
            >
              <For each={DEVICE_PRESETS}>
                {(preset) => (
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] text-text hover:bg-surface-raised-base-hover"
                    classList={{ "bg-surface-raised-base-hover": presetId() === preset.id }}
                    onClick={() => selectPreset(preset.id)}
                  >
                    <span class="flex items-center gap-2">
                      <PresetIcon kind={preset.icon} size={12} />
                      <span>{preset.label}</span>
                    </span>
                    <Show when={preset.width > 0}>
                      <span class="text-text-weak text-[10px] tabular-nums">
                        {preset.width}×{preset.height}
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Rotate */}
        <button
          type="button"
          class="size-7 shrink-0 inline-flex items-center justify-center rounded-md text-text-weak hover:bg-surface-raised-base-hover hover:text-text disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={!presetDimensions()}
          aria-label="Rotate viewport"
          title="Rotate viewport"
          onClick={toggleRotate}
        >
          <RotateCcw size={14} />
        </button>
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

      {/* Viewport area. In responsive mode the WebContentsView fills the entire region.
          In device mode, we center a fixed-size frame and sync bounds to that frame. */}
      <div
        ref={viewportRef}
        class="relative min-h-0 flex-1 overflow-auto"
        classList={{
          "bg-background-base": !presetDimensions(),
          "bg-[#0a0a0a] flex items-start justify-center p-4": !!presetDimensions(),
        }}
      >
        <Show when={presetDimensions()} fallback={null}>
          {(dims) => (
            <div class="flex flex-col items-center gap-2">
              <div class="text-[10px] uppercase tracking-wider text-text-weak tabular-nums">
                {currentPreset().label} · {dims().width}×{dims().height} · DPR {dims().dpr}
                {rotated() ? " · Landscape" : ""}
              </div>
              <div
                ref={(element) => {
                  frameRef = element
                }}
                class="rounded-[18px] bg-background-base shadow-[0_10px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
                style={{
                  width: `${dims().width}px`,
                  height: `${dims().height}px`,
                }}
              />
            </div>
          )}
        </Show>

        {/* Selected element preview (Degen mode) */}
        <Show when={selectedElementPreview()}>
          {(el) => (
            <div
              class="absolute bottom-3 right-3 z-40 w-80 max-w-[calc(100%-1.5rem)] rounded-lg border border-sky-400/40 bg-background-stronger/95 backdrop-blur p-3 shadow-xl"
              style={{ animation: "shob-fade-in-up 140ms ease-out" }}
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <Crosshair size={12} class="shrink-0 text-sky-400" />
                  <span class="text-[10px] uppercase tracking-wider text-sky-300">Selected element</span>
                </div>
                <button
                  type="button"
                  class="size-5 shrink-0 inline-flex items-center justify-center rounded text-text-weak hover:bg-surface-raised-base-hover hover:text-text"
                  aria-label="Dismiss"
                  onClick={() => setShowSelectionPreview(false)}
                >
                  <X size={11} />
                </button>
              </div>
              <div class="mt-2 flex items-center gap-1.5">
                <span class="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] text-sky-200">
                  &lt;{el().tag}&gt;
                </span>
                <Show when={el().role}>
                  <span class="rounded bg-surface-raised-base px-1.5 py-0.5 text-[10px] text-text-weak">
                    role={el().role}
                  </span>
                </Show>
                <Show when={el().type}>
                  <span class="rounded bg-surface-raised-base px-1.5 py-0.5 text-[10px] text-text-weak">
                    type={el().type}
                  </span>
                </Show>
              </div>
              <Show when={el().text}>
                <div class="mt-2 line-clamp-2 text-[12px] text-text" title={el().text}>
                  {el().text}
                </div>
              </Show>
              <Show when={el().href}>
                <div class="mt-1 truncate font-mono text-[10px] text-text-weak" title={el().href ?? ""}>
                  → {el().href}
                </div>
              </Show>
              <div
                class="mt-2 truncate rounded bg-background-base/80 px-2 py-1 font-mono text-[10px] text-text-weak"
                title={el().selector}
              >
                {el().selector}
              </div>
              <div class="mt-1 flex items-center gap-2 text-[10px] text-text-weak tabular-nums">
                <span>
                  {el().width}×{el().height}
                </span>
                <span>·</span>
                <span>
                  ({el().x}, {el().y})
                </span>
              </div>
              <div class="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  class="rounded-md bg-sky-500/15 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-500/25"
                  onClick={copySelector}
                >
                  Copy selector
                </button>
                <button
                  type="button"
                  class="rounded-md bg-surface-raised-base px-2 py-1 text-[11px] text-text-weak hover:bg-surface-raised-base-hover hover:text-text"
                  onClick={() => setSelectedEl(null)}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}
