import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Button } from "@shob/ui/button"
import { IconButton } from "@shob/ui/icon-button"
import { usePlatform, type BrowserAction, type BrowserState } from "@/context/platform"

const MAX_BROWSERS = 4
const DEFAULT_URL = "https://www.google.com"

type BrowserEntry = {
  id: string
  address: string
  state?: BrowserState
  editing: boolean
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

function labelFor(id: string, index: number) {
  const number = id.match(/(\d+)$/)?.[1]
  return `Browser ${number ?? index + 1}`
}

export function SessionBrowserStack(
  props: {
    visible: boolean
    width: number
    resizing: boolean
    onRequestVisible?: () => void
    onOpenChange?: (open: boolean) => void
  },
) {
  const platform = usePlatform()
  const [store, setStore] = createStore({
    browsers: [] as BrowserEntry[],
    maximized: undefined as string | undefined,
  })

  const supported = createMemo(() => platform.platform === "desktop" && !!platform.browserAction)
  const canAdd = createMemo(() => supported() && store.browsers.length < MAX_BROWSERS)
  const visibleBrowsers = createMemo(() => {
    if (!store.maximized) return store.browsers
    return store.browsers.filter((browser) => browser.id === store.maximized)
  })

  createEffect(() => {
    props.onOpenChange?.(supported() && props.visible)
  })

  const ensureBrowser = (state: BrowserState) => {
    setStore(
      "browsers",
      produce((browsers) => {
        const current = browsers.find((item) => item.id === state.browserId)
        if (current) {
          current.state = state
          if (!current.editing && state.url) current.address = state.url
          return
        }
        if (browsers.length >= MAX_BROWSERS) return
        browsers.push({
          id: state.browserId,
          address: state.url || DEFAULT_URL,
          state,
          editing: false,
        })
      }),
    )
  }

  createEffect(() => {
    if (!supported()) return
    void platform.browserAction?.({ action: "list", detail: "light" }).then((result) => {
      const states = result.states ?? []
      states.forEach(ensureBrowser)
      if (states.length > 0) props.onRequestVisible?.()
    })
    const stopState = platform.onBrowserState?.(ensureBrowser)
    const stopOpen = platform.onBrowserOpen?.((state) => {
      ensureBrowser(state)
      props.onRequestVisible?.()
    })
    const stopClose = platform.onBrowserClose?.((payload) => {
      setStore("browsers", (items) => items.filter((item) => item.id !== payload.browserId))
      if (store.maximized === payload.browserId) setStore("maximized", undefined)
    })
    onCleanup(() => {
      stopState?.()
      stopOpen?.()
      stopClose?.()
    })
  })

  const nextBrowserId = () => {
    const used = new Set(store.browsers.map((item) => item.id))
    for (let i = 1; i <= MAX_BROWSERS; i++) {
      const id = `browser-${i}`
      if (!used.has(id)) return id
    }
    return `browser-${store.browsers.length + 1}`
  }

  const openBrowser = (id = nextBrowserId(), url = DEFAULT_URL) => {
    if (!supported()) return
    setStore("browsers", (items) =>
      items.some((item) => item.id === id)
        ? items
        : [...items, { id, address: url, editing: false }],
    )
    props.onRequestVisible?.()
    void platform.browserAction?.({ browserId: id, action: "open", url, detail: "light" }).then((result) => {
      ensureBrowser(result.state)
    })
  }

  const closeBrowser = (id: string) => {
    setStore("browsers", (items) => items.filter((item) => item.id !== id))
    if (store.maximized === id) setStore("maximized", undefined)
    void platform.browserAction?.({ browserId: id, action: "close", detail: "light" }).catch(() => undefined)
  }

  return (
    <Show when={supported() && props.visible}>
      <aside
        id="agent-browser-panel"
        aria-label="Agent browsers"
        class="relative hidden md:flex h-full min-h-0 shrink-0 flex-col overflow-hidden"
        classList={{
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none":
            !props.resizing,
        }}
        style={{ width: `${props.width}px` }}
      >
        <div class="flex h-10 shrink-0 items-center justify-between border-b border-border-weaker-base bg-background-base px-3">
          <div class="text-13-medium text-text-base">
            {store.maximized ? "Browser full size" : "Browsers"}
          </div>
          <div class="flex items-center rounded-full bg-surface-raised-base p-0.5 shadow-sm border border-border-weaker-base">
            <Show when={store.maximized}>
              <button
                type="button"
                onClick={() => setStore("maximized", undefined)}
                class="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-12-medium text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-base"
              >
                Show all
              </button>
            </Show>
            <button
              type="button"
              disabled={!canAdd()}
              onClick={() => openBrowser()}
              class="flex items-center justify-center rounded-full w-6 h-6 text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-base disabled:opacity-50 disabled:pointer-events-none"
              aria-label="New browser"
              title="New browser"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-2">
          <Show
            when={visibleBrowsers().length > 0}
            fallback={
              <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-border-weaker-base bg-background-base px-4 text-center">
                <div class="text-12-medium text-text-base">No browsers open</div>
                <Button size="small" variant="ghost" disabled={!canAdd()} onClick={() => openBrowser()}>
                  New browser
                </Button>
              </div>
            }
          >
            <For each={visibleBrowsers()}>
              {(browser, index) => (
                <BrowserCard
                  browser={browser}
                  title={labelFor(browser.id, index())}
                  maximized={store.maximized === browser.id}
                  onClose={() => closeBrowser(browser.id)}
                  onToggleMaximize={() =>
                    setStore("maximized", store.maximized === browser.id ? undefined : browser.id)
                  }
                  onState={ensureBrowser}
                  onAddress={(address) => setStore("browsers", (item) => item.id === browser.id, "address", address)}
                  onEditing={(editing) => setStore("browsers", (item) => item.id === browser.id, "editing", editing)}
                />
              )}
            </For>
          </Show>
        </div>
      </aside>
    </Show>
  )
}

function BrowserCard(props: {
  browser: BrowserEntry
  title: string
  maximized: boolean
  onClose: () => void
  onToggleMaximize: () => void
  onState: (state: BrowserState) => void
  onAddress: (address: string) => void
  onEditing: (editing: boolean) => void
}) {
  const platform = usePlatform()
  const [isInspectorActive, setInspectorActive] = createSignal(false)
  let viewport: HTMLDivElement | undefined
  let frame: number | undefined
  let lastBounds = ""

  const invoke = (action: BrowserAction, extra = {}) => {
    const browserAction = platform.browserAction
    if (!browserAction) return Promise.reject(new Error("Browser API unavailable"))
    return browserAction({ browserId: props.browser.id, action, detail: "light", ...extra }).then((result) => {
      props.onState(result.state)
      return result
    })
  }

  const syncBounds = (force = false) => {
    if (!viewport?.isConnected) return
    const bounds = browserBounds(viewport)
    const key = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
    if (!force && key === lastBounds) return
    lastBounds = key
    void invoke("show", { bounds }).catch(() => undefined)
  }

  const scheduleSyncBounds = (force = false) => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      syncBounds(force)
    })
  }

  const navigate = () => {
    const url = props.browser.address.trim() || DEFAULT_URL
    props.onEditing(false)
    void invoke("open", { url }).catch(() => undefined)
  }

  createResizeObserver(
    () => viewport,
    () => scheduleSyncBounds(),
  )

  createEffect(() => {
    props.browser.id
    requestAnimationFrame(() => scheduleSyncBounds(true))
  })

  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    void platform.browserAction?.({ browserId: props.browser.id, action: "hide", detail: "light" }).catch(() => undefined)
  })

  return (
    <section
      class="min-h-0 overflow-hidden rounded-[8px] border border-border-weaker-base bg-background-base shadow-[var(--v2-elevation-raised)]"
      classList={{
        "flex-1": true,
      }}
    >
      <form
        class="flex h-11 shrink-0 items-center gap-2 border-b border-border-weaker-base bg-background-stronger px-2"
        onSubmit={(event) => {
          event.preventDefault()
          navigate()
        }}
      >
        <div class="flex h-8 shrink-0 items-center overflow-hidden rounded-full border border-border-weaker-base bg-background-base shadow-sm">
          <button
            type="button"
            class="flex size-8 items-center justify-center text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-base disabled:opacity-35"
            disabled={!props.browser.state?.canGoBack}
            onClick={() => void invoke("back")}
            aria-label="Back"
            title="Back"
          >
            <ArrowLeftIcon />
          </button>
          <div class="h-4 w-px bg-border-weaker-base" />
          <button
            type="button"
            class="flex size-8 items-center justify-center text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-base disabled:opacity-35"
            disabled={!props.browser.state?.canGoForward}
            onClick={() => void invoke("forward")}
            aria-label="Forward"
            title="Forward"
          >
            <ArrowRightIcon />
          </button>
        </div>
        <button
          type="button"
          class="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-weaker-base bg-background-base text-text-weak shadow-sm transition-colors hover:bg-surface-raised-base-hover hover:text-text-base"
          onClick={() => void invoke("reload")}
          aria-label="Reload"
          title="Reload"
        >
          <ReloadIcon />
        </button>
        <button
          type="button"
          class="h-8 shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 text-12-medium transition-colors border shadow-sm"
          classList={{
            "bg-sky-500/15 text-sky-400 border-sky-500/30": isInspectorActive(),
            "bg-background-base text-text-weak border-border-weaker-base hover:bg-surface-raised-base-hover hover:text-text-base": !isInspectorActive(),
          }}
          aria-label={isInspectorActive() ? "Disable Inspect mode" : "Enable Inspect mode"}
          aria-pressed={isInspectorActive()}
          title="Inspect mode: select page elements to get HTML + CSS"
          onClick={() => {
            const next = !isInspectorActive()
            setInspectorActive(next)
            if (next) {
              invoke("evaluate", { javascript: `
                new Promise((resolve) => {
                  if (window.__opencode_inspector_cleanup) {
                    window.__opencode_inspector_cleanup();
                  }
                  
                  const overlay = document.createElement('div');
                  overlay.style.position = 'fixed';
                  overlay.style.pointerEvents = 'none';
                  overlay.style.zIndex = '2147483647';
                  overlay.style.backgroundColor = 'rgba(56, 189, 248, 0.2)';
                  overlay.style.border = '1px solid rgb(56, 189, 248)';
                  overlay.style.transition = 'all 75ms';
                  overlay.style.display = 'none';
                  document.documentElement.appendChild(overlay);
                  
                  const moveHandler = (e) => {
                    const rect = e.target.getBoundingClientRect();
                    overlay.style.top = rect.top + 'px';
                    overlay.style.left = rect.left + 'px';
                    overlay.style.width = rect.width + 'px';
                    overlay.style.height = rect.height + 'px';
                    overlay.style.display = 'block';
                  };
                  
                  const clickHandler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const html = e.target.outerHTML;
                    const computed = window.getComputedStyle(e.target);
                    let css = '';
                    for (let i = 0; i < computed.length; i++) {
                       const prop = computed[i];
                       css += prop + ': ' + computed.getPropertyValue(prop) + ';\\n';
                    }
                    const result = 'HTML:\\n' + html + '\\n\\nCSS:\\n' + css;
                    
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(result).catch(() => {});
                    } else {
                      const textarea = document.createElement('textarea');
                      textarea.value = result;
                      document.body.appendChild(textarea);
                      textarea.select();
                      document.execCommand('copy');
                      textarea.remove();
                    }
                    
                    resolve(result);
                    if (window.__opencode_inspector_cleanup) {
                      window.__opencode_inspector_cleanup(true);
                    }
                  };
                  
                  document.addEventListener('mousemove', moveHandler, true);
                  document.addEventListener('click', clickHandler, true);
                  
                  window.__opencode_inspector_cleanup = (resolved) => {
                    overlay.remove();
                    document.removeEventListener('mousemove', moveHandler, true);
                    document.removeEventListener('click', clickHandler, true);
                    delete window.__opencode_inspector_cleanup;
                    if (!resolved) resolve(null);
                  };
                });
              `}).then((res: any) => {
                if (res && res.value && typeof res.value === "string") {
                  window.dispatchEvent(new CustomEvent("opencode-browser-element-selected", { detail: res.value }));
                }
                setInspectorActive(false);
              })
            } else {
              void invoke("evaluate", { javascript: "if (window.__opencode_inspector_cleanup) window.__opencode_inspector_cleanup();" })
            }
          }}
        >
          <CrosshairIcon />
          <span>Inspect</span>
        </button>
        <div class="min-w-0 flex-1">
          <input
            class="h-8 w-full rounded-full border border-border-weaker-base bg-background-base px-3 text-12-regular text-text-base outline-none transition-colors focus:border-border-strong-base"
            value={props.browser.address}
            placeholder={props.title}
            spellcheck={false}
            onFocus={() => props.onEditing(true)}
            onBlur={() => props.onEditing(false)}
            onInput={(event) => props.onAddress(event.currentTarget.value)}
          />
        </div>
        <button
          type="button"
          class="flex size-8 shrink-0 items-center justify-center rounded-full text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-base"
          aria-label={props.maximized ? "Restore browser size" : "Maximize browser"}
          title={props.maximized ? "Restore browser size" : "Maximize browser"}
          onClick={props.onToggleMaximize}
        >
          <Show when={props.maximized} fallback={<ExpandIcon />}>
            <CollapseIcon />
          </Show>
        </button>
        <IconButton
          icon="close-small"
          variant="ghost"
          class="h-8 w-8 rounded-full"
          aria-label="Close browser"
          onClick={props.onClose}
        />
      </form>
      <div class="relative h-[calc(100%-2.75rem)] min-h-0 bg-white">
        <div ref={viewport} class="absolute inset-0" />
      </div>
    </section>
  )
}

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.25 4.75L7 10L12.25 15.25" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.75 4.75L13 10L7.75 15.25" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

function ReloadIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M15.2 8.25C14.55 6.35 12.75 5 10.65 5C8 5 5.85 7.15 5.85 9.8C5.85 12.45 8 14.6 10.65 14.6C12.1 14.6 13.4 13.95 14.28 12.95"
        stroke="currentColor"
        stroke-width="1.55"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M15.65 4.85V8.25H12.25" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.75 3.75H4.25V7.25M12.25 16.25H15.75V12.75M4.25 4.25L8.25 8.25M15.75 15.75L11.75 11.75" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M8.25 4.25V8.25H4.25M11.75 15.75V11.75H15.75M4.75 7.75L8.25 4.25M15.25 12.25L11.75 15.75" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

function CrosshairIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="22" y1="12" x2="18" y2="12"></line>
      <line x1="6" y1="12" x2="2" y2="12"></line>
      <line x1="12" y1="6" x2="12" y2="2"></line>
      <line x1="12" y1="22" x2="12" y2="18"></line>
    </svg>
  )
}
