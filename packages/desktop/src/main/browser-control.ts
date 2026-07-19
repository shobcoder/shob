import crypto from "node:crypto"
import http from "node:http"
import { BrowserWindow, WebContentsView } from "electron"

type BrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

type BrowserAction =
  | "list"
  | "open"
  | "navigate"
  | "show"
  | "hide"
  | "close"
  | "state"
  | "click"
  | "type"
  | "press"
  | "scroll"
  | "back"
  | "forward"
  | "reload"
  | "extract"
  | "evaluate"
  | "screenshot"

export type BrowserControlRequest = {
  browserId?: string
  action?: BrowserAction
  detail?: "light" | "full"
  url?: string
  bounds?: BrowserBounds
  ref?: string
  text?: string
  key?: string
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  javascript?: string
  maxLength?: number
}

export type BrowserElementSnapshot = {
  ref: string
  tag: string
  role: string | null
  type: string | null
  text: string
  href: string | null
  placeholder: string | null
  x: number
  y: number
  width: number
  height: number
}

export type BrowserState = {
  browserId: string
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  text?: string
  elements?: BrowserElementSnapshot[]
}

export type BrowserControlResponse = {
  ok: true
  action: BrowserAction
  browserId: string
  state: BrowserState
  states?: BrowserState[]
  text?: string
  dataUrl?: string
  value?: unknown
}

type BrowserRuntime = {
  id: string
  view: WebContentsView
  visible: boolean
  window: BrowserWindow | null
  bounds: BrowserBounds
  lastRequestedUrl: string
  lastNavigationError: string | null
}

type BrowserControlOptions = {
  getWindow: () => BrowserWindow | null
  emit: (win: BrowserWindow | null, channel: string, payload: unknown) => void
}

const DEFAULT_URL = "https://www.google.com"
const DEFAULT_TEXT_LIMIT = 8_000
const DEFAULT_ELEMENT_LIMIT = 80
const MAX_BROWSERS = 4

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const number = Math.round(Number(value))
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function normalizeBrowserId(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return "browser-1"
  return raw.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 64) || "browser-1"
}

function normalizeUrl(input: unknown) {
  const raw = typeof input === "string" ? input.trim() : ""
  if (!raw) return DEFAULT_URL
  if (/^https:\/\/(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])([/:?#].*)?$/i.test(raw)) {
    return raw.replace(/^https:\/\//i, "http://")
  }
  if (/^(https?|file):\/\//i.test(raw)) return raw
  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])([/:?#].*)?$/i.test(raw)) return `http://${raw}`
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw)) return `https://${raw}`
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`
}

function safeBounds(bounds: BrowserBounds | undefined) {
  return {
    x: clampInt(bounds?.x, 0, -20_000, 20_000),
    y: clampInt(bounds?.y, 0, -20_000, 20_000),
    width: clampInt(bounds?.width, 1, 1, 20_000),
    height: clampInt(bounds?.height, 1, 1, 20_000),
  }
}

function keyForInput(key: string) {
  const aliases: Record<string, string> = {
    enter: "Enter",
    return: "Enter",
    escape: "Escape",
    esc: "Escape",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    space: "Space",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
  }
  return aliases[key.toLowerCase()] ?? key
}

export function createBrowserControl(options: BrowserControlOptions) {
  const browsers = new Map<string, BrowserRuntime>()
  const trackedWindows = new WeakSet<BrowserWindow>()
  let activeBrowserId = "browser-1"
  let server: http.Server | null = null
  let endpointUrl: string | null = null
  const token = crypto.randomBytes(32).toString("base64url")

  const emit = (runtime: BrowserRuntime | undefined, channel: string, payload: unknown) => {
    options.emit(runtime?.window ?? options.getWindow(), channel, payload)
  }

  const hideWindowBrowsers = (win: BrowserWindow) => {
    for (const runtime of browsers.values()) {
      if (runtime.window === win) hideRuntime(runtime)
    }
  }

  const attachWindowLifecycle = (win: BrowserWindow | null) => {
    if (!win || win.isDestroyed() || trackedWindows.has(win)) return
    trackedWindows.add(win)
    win.webContents.on("did-start-loading", () => hideWindowBrowsers(win))
    win.webContents.once("destroyed", () => hideWindowBrowsers(win))
    win.once("closed", () => hideWindowBrowsers(win))
  }

  const attachLifecycle = (runtime: BrowserRuntime) => {
    const contents = runtime.view.webContents
    contents.on("did-start-loading", () => void emitState(runtime, "browser:state", false))
    contents.on("did-stop-loading", () => void emitState(runtime, "browser:state", false))
    contents.on("page-title-updated", () => void emitState(runtime, "browser:state", false))
    contents.on("did-navigate", () => void emitState(runtime, "browser:state", false))
    contents.on("did-navigate-in-page", () => void emitState(runtime, "browser:state", false))
    contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      runtime.lastNavigationError = `${errorDescription} (${errorCode}) ${validatedURL}`
      void emitState(runtime, "browser:state", false)
    })
  }

  const makeRuntime = (id: string, win: BrowserWindow | null) => {
    if (!win && !options.getWindow()) throw new Error("Window not found")
    if (!browsers.has(id) && browsers.size >= MAX_BROWSERS) throw new Error("Maximum browser count reached")
    const target = win ?? options.getWindow()
    attachWindowLifecycle(target)
    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:opencode-browser-${id}`,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    view.setBackgroundColor("#ffffff")
    const runtime: BrowserRuntime = {
      id,
      view,
      visible: false,
      window: target,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      lastRequestedUrl: "",
      lastNavigationError: null,
    }
    attachLifecycle(runtime)
    browsers.set(id, runtime)
    return runtime
  }

  const runtimeFor = (id: string, win: BrowserWindow | null) => {
    const runtime = browsers.get(id)
    if (runtime) {
      runtime.window = win ?? runtime.window ?? options.getWindow()
      attachWindowLifecycle(runtime.window)
      return runtime
    }
    return makeRuntime(id, win)
  }

  const applyBounds = (runtime: BrowserRuntime) => {
    runtime.view.setBounds(runtime.bounds)
  }

  const showRuntime = (runtime: BrowserRuntime, win: BrowserWindow | null) => {
    const target = win ?? runtime.window ?? options.getWindow()
    if (!target) throw new Error("Window not found")
    attachWindowLifecycle(target)
    runtime.window = target
    if (!runtime.visible) {
      target.contentView.addChildView(runtime.view)
      runtime.visible = true
    }
    applyBounds(runtime)
    activeBrowserId = runtime.id
  }

  const hideRuntime = (runtime: BrowserRuntime) => {
    if (!runtime.visible) return
    runtime.window?.contentView.removeChildView(runtime.view)
    runtime.visible = false
  }

  const executeInPage = async <T>(runtime: BrowserRuntime, source: string, fallback: T) => {
    if (runtime.view.webContents.isDestroyed()) return fallback
    try {
      return (await runtime.view.webContents.executeJavaScript(source, true)) as T
    } catch {
      return fallback
    }
  }

  const getPageText = (runtime: BrowserRuntime, maxLength = DEFAULT_TEXT_LIMIT) =>
    executeInPage<string>(
      runtime,
      `(() => {
        const text = document.body?.innerText || document.documentElement?.innerText || "";
        return text.replace(/\\n{3,}/g, "\\n\\n").slice(0, ${clampInt(maxLength, DEFAULT_TEXT_LIMIT, 0, 200_000)});
      })()`,
      "",
    )

  const getElements = (runtime: BrowserRuntime, limit = DEFAULT_ELEMENT_LIMIT) =>
    executeInPage<BrowserElementSnapshot[]>(
      runtime,
      `(() => {
        const selectors = ["a[href]", "button", "input", "textarea", "select", "[role=button]", "[role=link]", "[contenteditable=true]", "[tabindex]:not([tabindex='-1'])"].join(",");
        const elements = Array.from(document.querySelectorAll(selectors));
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        let index = 0;
        return elements.flatMap((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.right < 0 || rect.top > viewportHeight || rect.left > viewportWidth || style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") return [];
          let ref = el.getAttribute("data-opencode-browser-ref");
          if (!ref) {
            ref = "e" + (++index).toString(36);
            el.setAttribute("data-opencode-browser-ref", ref);
          }
          const label = el.getAttribute("aria-label") || el.getAttribute("title") || "";
          const text = (label || el.innerText || el.value || el.getAttribute("alt") || "").replace(/\\s+/g, " ").trim();
          return [{
            ref,
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            type: el.getAttribute("type"),
            text: text.slice(0, 140),
            href: el.href || el.getAttribute("href"),
            placeholder: el.getAttribute("placeholder"),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }];
        }).slice(0, ${clampInt(limit, DEFAULT_ELEMENT_LIMIT, 0, 300)});
      })()`,
      [],
    )

  const getState = async (runtime: BrowserRuntime, full: boolean): Promise<BrowserState> => {
    const contents = runtime.view.webContents
    const currentUrl = contents.getURL()
    const state: BrowserState = {
      browserId: runtime.id,
      visible: runtime.visible,
      url: currentUrl && currentUrl !== "about:blank" ? currentUrl : runtime.lastRequestedUrl,
      title: contents.getTitle(),
      loading: contents.isLoading(),
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
    }
    if (full) {
      state.text = await getPageText(runtime)
      state.elements = await getElements(runtime)
    }
    return state
  }

  const emitState = async (runtime: BrowserRuntime, channel: string, full: boolean) => {
    emit(runtime, channel, await getState(runtime, full))
  }

  const pointForRef = async (runtime: BrowserRuntime, ref: string | undefined) => {
    if (!ref) return null
    const selector = JSON.stringify(`[data-opencode-browser-ref="${ref.replace(/"/g, '\\"')}"]`)
    return executeInPage<{ x: number; y: number } | null>(
      runtime,
      `(() => {
        const el = document.querySelector(${selector});
        if (!el) return null;
        el.scrollIntoView({ block: "center", inline: "center" });
        const rect = el.getBoundingClientRect();
        if (typeof el.focus === "function") el.focus();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      })()`,
      null,
    )
  }

  const handle = async (request: BrowserControlRequest = {}, win: BrowserWindow | null = options.getWindow()) => {
    const action = request.action ?? "state"
    if (action === "list") {
      const states = await Promise.all([...browsers.values()].map((runtime) => getState(runtime, false)))
      return {
        ok: true,
        action,
        browserId: activeBrowserId,
        state: states[0] ?? {
          browserId: activeBrowserId,
          visible: false,
          url: "",
          title: "",
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
        states,
      } satisfies BrowserControlResponse
    }
    const id = normalizeBrowserId(request.browserId ?? activeBrowserId)
    const runtime = runtimeFor(id, win)
    const full = request.detail !== "light"

    if (request.bounds) runtime.bounds = safeBounds(request.bounds)

    switch (action) {
      case "open":
      case "navigate": {
        const target = normalizeUrl(request.url)
        runtime.lastRequestedUrl = target
        runtime.lastNavigationError = null
        showRuntime(runtime, win)
        void runtime.view.webContents.loadURL(target).then(() => emitState(runtime, "browser:open", false))
        return {
          ok: true,
          action,
          browserId: id,
          state: { ...(await getState(runtime, full)), url: target, loading: true },
        } satisfies BrowserControlResponse
      }
      case "show":
        showRuntime(runtime, win)
        emit(runtime, "browser:open", await getState(runtime, false))
        break
      case "hide":
        hideRuntime(runtime)
        break
      case "close":
        const state = await getState(runtime, false)
        hideRuntime(runtime)
        runtime.view.webContents.close({ waitForBeforeUnload: false })
        browsers.delete(id)
        emit(runtime, "browser:close", { browserId: id })
        return { ok: true, action, browserId: id, state } satisfies BrowserControlResponse
      case "click": {
        showRuntime(runtime, win)
        const point = await pointForRef(runtime, request.ref)
        const x = point?.x ?? clampInt(request.x, Math.floor(runtime.bounds.width / 2), -20_000, 20_000)
        const y = point?.y ?? clampInt(request.y, Math.floor(runtime.bounds.height / 2), -20_000, 20_000)
        runtime.view.webContents.sendInputEvent({ type: "mouseMove", x, y })
        runtime.view.webContents.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 })
        runtime.view.webContents.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 })
        break
      }
      case "type":
        showRuntime(runtime, win)
        await pointForRef(runtime, request.ref)
        runtime.view.webContents.insertText(String(request.text ?? ""))
        break
      case "press":
        showRuntime(runtime, win)
        runtime.view.webContents.sendInputEvent({ type: "keyDown", keyCode: keyForInput(String(request.key || "Enter")) })
        runtime.view.webContents.sendInputEvent({ type: "keyUp", keyCode: keyForInput(String(request.key || "Enter")) })
        break
      case "scroll":
        await executeInPage(
          runtime,
          `window.scrollBy(${clampInt(request.deltaX, 0, -100_000, 100_000)}, ${clampInt(request.deltaY, 600, -100_000, 100_000)}); true`,
          true,
        )
        break
      case "back":
        if (runtime.view.webContents.canGoBack()) runtime.view.webContents.goBack()
        break
      case "forward":
        if (runtime.view.webContents.canGoForward()) runtime.view.webContents.goForward()
        break
      case "reload":
        runtime.view.webContents.reload()
        break
      case "extract": {
        const text = await getPageText(runtime, request.maxLength ?? DEFAULT_TEXT_LIMIT)
        return { ok: true, action, browserId: id, state: await getState(runtime, true), text } satisfies BrowserControlResponse
      }
      case "evaluate": {
        const value = await executeInPage(runtime, String(request.javascript ?? "undefined"), null)
        return { ok: true, action, browserId: id, state: await getState(runtime, true), value } satisfies BrowserControlResponse
      }
      case "screenshot": {
        const image = await runtime.view.webContents.capturePage()
        return {
          ok: true,
          action,
          browserId: id,
          state: await getState(runtime, true),
          dataUrl: image.toDataURL(),
        } satisfies BrowserControlResponse
      }
      case "state":
        break
    }

    return { ok: true, action, browserId: id, state: await getState(runtime, full) } satisfies BrowserControlResponse
  }

  const start = async () => {
    if (endpointUrl) return { url: endpointUrl, token }
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      req.on("end", () => {
        void (async () => {
          try {
            if (req.method !== "POST" || req.url !== "/browser") {
              res.writeHead(404, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ error: "Not found" }))
              return
            }
            if (req.headers["x-opencode-browser-token"] !== token) {
              res.writeHead(401, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ error: "Unauthorized" }))
              return
            }
            const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}
            const result = await handle(body)
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify(result))
          } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
          }
        })()
      })
    })
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Unable to start browser control server")
    endpointUrl = `http://127.0.0.1:${address.port}`
    return { url: endpointUrl, token }
  }

  const hideAll = () => {
    for (const runtime of browsers.values()) hideRuntime(runtime)
  }

  const stop = async () => {
    hideAll()
    for (const runtime of browsers.values()) {
      if (!runtime.view.webContents.isDestroyed()) runtime.view.webContents.close({ waitForBeforeUnload: false })
    }
    browsers.clear()
    if (!server) return
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
    endpointUrl = null
  }

  return { start, stop, hideAll, handle }
}
