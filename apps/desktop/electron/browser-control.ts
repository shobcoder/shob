import { BrowserWindow, WebContentsView, session as electronSession, type WebContents } from "electron";
import crypto from "node:crypto";
import http from "node:http";

type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BrowserStateDetail = {
  includeText?: boolean;
  includeElements?: boolean;
};

type BrowserAction =
  | "open"
  | "navigate"
  | "show"
  | "hide"
  | "close"
  | "state"
  | "click"
  | "double_click"
  | "right_click"
  | "mouse_move"
  | "mouse_down"
  | "mouse_up"
  | "hover"
  | "drag"
  | "type"
  | "press"
  | "scroll"
  | "back"
  | "forward"
  | "reload"
  | "set_degen_mode"
  | "set_viewport"
  | "set_cursor_overlay"
  | "extract"
  | "evaluate"
  | "screenshot";

export type BrowserViewport = {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  userAgent: string | null;
  preset: string | null;
};

export type BrowserControlRequest = {
  action?: BrowserAction;
  detail?: "light" | "full";
  url?: string;
  bounds?: BrowserBounds;
  enabled?: boolean;
  ref?: string;
  text?: string;
  key?: string;
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
  javascript?: string;
  maxLength?: number;
  // Viewport / device emulation
  viewportWidth?: number;
  viewportHeight?: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
  userAgent?: string | null;
  preset?: string | null;
  // Mouse / drag
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  fromRef?: string;
  toRef?: string;
  button?: "left" | "right" | "middle";
  clickCount?: number;
  steps?: number;
  delayMs?: number;
  modifiers?: string[];
};

export type BrowserElementSnapshot = {
  ref: string;
  tag: string;
  role: string | null;
  type: string | null;
  text: string;
  href: string | null;
  placeholder: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserState = {
  visible: boolean;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  degenMode: boolean;
  error?: string | null;
  text?: string;
  elements?: BrowserElementSnapshot[];
  viewport?: BrowserViewport;
};

export type BrowserControlResponse = {
  ok: true;
  action: BrowserAction;
  state: BrowserState;
  text?: string;
  dataUrl?: string;
  value?: unknown;
};

export type BrowserElementSelection = {
  url: string;
  title: string;
  selector: string;
  tag: string;
  role: string | null;
  type: string | null;
  text: string;
  value: string | null;
  href: string | null;
  src: string | null;
  alt: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  id: string | null;
  className: string | null;
  outerHTML: string;
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
};

type BrowserControlOptions = {
  getWindow: () => BrowserWindow | null;
  emit: (channel: string, payload: unknown) => void;
};

export type BrowserTheme = {
  mode: "light" | "dark";
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  codeBackground: string;
  codeForeground: string;
};

const DEFAULT_URL = "https://www.google.com";
const DEFAULT_TEXT_LIMIT = 8_000;
const DEFAULT_ELEMENT_LIMIT = 80;
const PARTITION = "persist:shob-browser";
const DEFAULT_BROWSER_THEME: BrowserTheme = {
  mode: "dark",
  background: "#101010",
  surface: "#1c1c1c",
  foreground: "#ededed",
  muted: "#a0a0a0",
  border: "#282828",
  codeBackground: "#151515",
  codeForeground: "#d4d4d4",
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeUrl(input: unknown) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return DEFAULT_URL;
  if (/^https:\/\/(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])([/:?#].*)?$/i.test(raw)) {
    return raw.replace(/^https:\/\//i, "http://");
  }
  if (/^(https?|file):\/\//i.test(raw)) return raw;
  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])([/:?#].*)?$/i.test(raw)) {
    return `http://${raw}`;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw)) {
    return `https://${raw}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeCssColor(value: string | undefined, fallback: string) {
  const color = (value ?? "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\([\d\s.,%+-]+\)$/i.test(color)) return color;
  if (/^hsla?\([\d\s.,%+-]+\)$/i.test(color)) return color;
  return fallback;
}

function normalizeTheme(next: Partial<BrowserTheme>, current: BrowserTheme) {
  return {
    mode: next.mode === "light" || next.mode === "dark" ? next.mode : current.mode,
    background: safeCssColor(next.background, current.background),
    surface: safeCssColor(next.surface, current.surface),
    foreground: safeCssColor(next.foreground, current.foreground),
    muted: safeCssColor(next.muted, current.muted),
    border: safeCssColor(next.border, current.border),
    codeBackground: safeCssColor(next.codeBackground, current.codeBackground),
    codeForeground: safeCssColor(next.codeForeground, current.codeForeground),
  };
}

function errorPageHost(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function errorPageStatus(message: string) {
  const code = message.match(/\bERR_[A-Z0-9_]+\b/)?.[0] ?? "ERR_FAILED";
  const number = message.match(/\((-?\d+)\)/)?.[1];
  return number ? `${code} (${number})` : code;
}

function errorPagePrimaryMessage(url: string, status: string) {
  const host = errorPageHost(url);
  if (status.includes("ERR_CONNECTION_REFUSED")) return `${host} refused to connect.`;
  if (status.includes("ERR_NAME_NOT_RESOLVED")) return `${host}'s server IP address could not be found.`;
  if (status.includes("ERR_CONNECTION_TIMED_OUT")) return `${host} took too long to respond.`;
  if (status.includes("ERR_INTERNET_DISCONNECTED")) return "No internet connection.";
  return `The webpage at ${url} might be temporarily down or it may have moved permanently to a new web address.`;
}

function errorPageDataUrl(url: string, message: string, theme: BrowserTheme) {
  const background = safeCssColor(theme.background, theme.mode === "dark" ? "#202124" : "#ffffff");
  const foreground = safeCssColor(theme.foreground, theme.mode === "dark" ? "#e8eaed" : "#202124");
  const muted = safeCssColor(theme.muted, theme.mode === "dark" ? "#bdc1c6" : "#5f6368");
  const border = safeCssColor(theme.border, theme.mode === "dark" ? "#3c4043" : "#dadce0");
  const button = theme.mode === "dark" ? "#8ab4f8" : "#1a73e8";
  const buttonText = theme.mode === "dark" ? "#202124" : "#ffffff";
  const status = errorPageStatus(message);
  const primary = errorPagePrimaryMessage(url, status);
  const host = errorPageHost(url);
  const isLocalhost = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?$/i.test(host);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(status)}</title>
    <style>
      :root { color-scheme: ${theme.mode}; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", Roboto, Arial, sans-serif;
        background: ${background};
        color: ${foreground};
      }
      main {
        width: min(640px, calc(100vw - 56px));
        margin: 13vh auto 0;
      }
      .icon {
        width: 72px;
        height: 72px;
        position: relative;
        margin-bottom: 28px;
        border: 2px solid ${muted};
        border-radius: 4px;
        color: ${muted};
      }
      .icon::before {
        content: "";
        position: absolute;
        right: -2px;
        top: -2px;
        width: 22px;
        height: 22px;
        border-left: 2px solid ${muted};
        border-bottom: 2px solid ${muted};
        background: ${background};
      }
      .icon::after {
        content: ":(";
        position: absolute;
        left: 12px;
        bottom: 10px;
        font-size: 18px;
        letter-spacing: 0;
      }
      h1 {
        margin: 0 0 18px;
        font-size: 24px;
        font-weight: 400;
        line-height: 1.25;
      }
      p {
        margin: 0 0 14px;
        font-size: 15px;
        line-height: 1.55;
        color: ${muted};
      }
      ul {
        margin: 0 0 22px 20px;
        padding: 0;
        color: ${muted};
        font-size: 15px;
        line-height: 1.6;
      }
      .summary {
        color: ${foreground};
      }
      .status {
        margin-top: 18px;
        color: ${muted};
        font-size: 12px;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 28px;
      }
      button {
        min-width: 80px;
        border: 0;
        border-radius: 4px;
        padding: 8px 16px;
        background: ${button};
        color: ${buttonText};
        font: inherit;
        font-size: 13px;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 2px solid ${button};
        outline-offset: 2px;
      }
      details {
        color: ${muted};
        font-size: 12px;
      }
      summary {
        cursor: pointer;
        color: ${button};
      }
      pre {
        margin: 10px 0 0;
        padding: 10px 12px;
        border: 1px solid ${border};
        border-radius: 4px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="icon" aria-hidden="true"></div>
      <h1>This site can't be reached</h1>
      <p class="summary">${escapeHtml(primary)}</p>
      <p>Try:</p>
      <ul>
        <li>Checking the connection</li>
        ${isLocalhost ? "<li>Checking that your local dev server is running on this port</li>" : "<li>Checking the proxy and the firewall</li>"}
      </ul>
      <div class="status">${escapeHtml(status)}</div>
      <div class="actions">
        <button id="reload" type="button">Reload</button>
        <details>
          <summary>Details</summary>
          <pre>${escapeHtml(message)}</pre>
        </details>
      </div>
    </main>
    <script>
      document.getElementById("reload").addEventListener("click", () => {
        location.href = ${JSON.stringify(url).replace(/</g, "\\u003c")};
      });
    </script>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function degenModeScript(enabled: boolean, messagePrefix: string) {
  return `(() => {
    const enabled = ${JSON.stringify(enabled)};
    const messagePrefix = ${JSON.stringify(messagePrefix)};
    const stateKey = "__shobBrowserDegenState";
    const previous = window[stateKey];
    if (previous && typeof previous.cleanup === "function") previous.cleanup();
    if (!enabled) return false;

    const cssEscape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => "\\\\" + char);
    };
    const attrSelector = (name, value) => "[" + name + "=" + JSON.stringify(String(value)) + "]";
    const short = (value, max) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, max);
    const textOf = (el) => short(el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.textContent || "", 3000);
    const selectorFor = (el) => {
      if (!(el instanceof Element)) return "";
      if (el.id) return "#" + cssEscape(el.id);
      const path = [];
      let node = el;
      while (node && node instanceof Element && path.length < 7) {
        let part = node.localName || node.tagName.toLowerCase();
        const testId = node.getAttribute("data-testid") || node.getAttribute("data-test") || node.getAttribute("data-qa");
        if (testId) {
          part += attrSelector(node.getAttribute("data-testid") ? "data-testid" : node.getAttribute("data-test") ? "data-test" : "data-qa", testId);
          path.unshift(part);
          break;
        }
        if (node.id) {
          part += "#" + cssEscape(node.id);
          path.unshift(part);
          break;
        }
        const parent = node.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter((child) => child.localName === node.localName);
          if (sameTag.length > 1) {
            part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
          }
        }
        path.unshift(part);
        node = parent;
      }
      return path.join(" > ");
    };

    const overlay = document.createElement("div");
    overlay.setAttribute("data-shob-browser-degen-overlay", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      display: "none",
      zIndex: "2147483647",
      pointerEvents: "none",
      border: "2px solid #38bdf8",
      borderRadius: "4px",
      boxShadow: "0 0 0 99999px rgba(14, 165, 233, 0.055), 0 0 0 1px rgba(255,255,255,0.55) inset",
      transition: "left 60ms ease, top 60ms ease, width 60ms ease, height 60ms ease"
    });

    const badge = document.createElement("div");
    badge.textContent = "Click to attach element";
    badge.setAttribute("data-shob-browser-degen-badge", "true");
    Object.assign(badge.style, {
      position: "fixed",
      display: "none",
      zIndex: "2147483647",
      pointerEvents: "none",
      padding: "5px 8px",
      borderRadius: "999px",
      background: "rgba(2, 132, 199, 0.96)",
      color: "white",
      font: "12px/1.2 Inter, ui-sans-serif, system-ui, sans-serif",
      boxShadow: "0 8px 24px rgba(0,0,0,0.22)"
    });

    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(badge);

    let selected = null;
    const updateOverlay = (el) => {
      if (!(el instanceof Element)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      selected = el;
      overlay.style.display = "block";
      overlay.style.left = Math.max(0, rect.left) + "px";
      overlay.style.top = Math.max(0, rect.top) + "px";
      overlay.style.width = Math.max(1, rect.width) + "px";
      overlay.style.height = Math.max(1, rect.height) + "px";
      badge.style.display = "block";
      badge.style.left = Math.max(8, Math.min(window.innerWidth - 170, rect.left)) + "px";
      badge.style.top = Math.max(8, rect.top - 34) + "px";
    };

    const payloadFor = (el) => {
      const rect = el.getBoundingClientRect();
      const tag = (el.localName || el.tagName || "").toLowerCase();
      const inputType = el.getAttribute("type");
      const inputValue =
        "value" in el && inputType !== "password" && inputType !== "hidden"
          ? short(el.value, 800)
          : null;
      return {
        url: location.href,
        title: document.title,
        selector: selectorFor(el),
        tag,
        role: el.getAttribute("role"),
        type: inputType,
        text: textOf(el),
        value: inputValue,
        href: el.href || el.getAttribute("href"),
        src: el.src || el.getAttribute("src"),
        alt: el.getAttribute("alt"),
        placeholder: el.getAttribute("placeholder"),
        ariaLabel: el.getAttribute("aria-label"),
        id: el.id || null,
        className: typeof el.className === "string" ? short(el.className, 500) : null,
        outerHTML: short(el.outerHTML, 2400),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        timestamp: Date.now()
      };
    };

    const onMove = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target === overlay || target === badge || target.closest("[data-shob-browser-degen-overlay],[data-shob-browser-degen-badge]")) return;
      updateOverlay(target);
    };
    const onClick = (event) => {
      const target = selected || event.target;
      if (!(target instanceof Element)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      updateOverlay(target);
      console.log(messagePrefix + JSON.stringify(payloadFor(target)));
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseover", onMove, true);
    document.addEventListener("click", onClick, true);
    window[stateKey] = {
      cleanup() {
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("mouseover", onMove, true);
        document.removeEventListener("click", onClick, true);
        overlay.remove();
        badge.remove();
        if (window[stateKey] === this) delete window[stateKey];
      }
    };
    return true;
  })()`;
}

function safeBounds(bounds: BrowserBounds | undefined) {
  return {
    x: clampInt(bounds?.x, 0, -20_000, 20_000),
    y: clampInt(bounds?.y, 0, -20_000, 20_000),
    width: clampInt(bounds?.width, 1, 1, 20_000),
    height: clampInt(bounds?.height, 1, 1, 20_000),
  };
}

function sameBounds(a: BrowserBounds | null, b: BrowserBounds) {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function copyBounds(next: BrowserBounds) {
  return { x: next.x, y: next.y, width: next.width, height: next.height };
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
  };
  return aliases[key.toLowerCase()] ?? key;
}

export function createBrowserControl(options: BrowserControlOptions) {
  let view: WebContentsView | null = null;
  let visible = false;
  let bounds: BrowserBounds = { x: 0, y: 0, width: 1, height: 1 };
  let appliedBounds: BrowserBounds | null = null;
  let server: http.Server | null = null;
  let endpointUrl: string | null = null;
  let lastRequestedUrl = "";
  let lastNavigationError: string | null = null;
  let browserTheme = DEFAULT_BROWSER_THEME;
  let degenMode = false;
  let cursorOverlay = true;
  let lastCursor = { x: 0, y: 0 };
  let viewport: BrowserViewport = {
    width: 0,
    height: 0,
    deviceScaleFactor: 1,
    mobile: false,
    userAgent: null,
    preset: "responsive",
  };
  const token = crypto.randomBytes(32).toString("base64url");
  const degenMessagePrefix = `__SHOB_BROWSER_DEGEN_PICK__${token}:`;
  const lightStateDetail: BrowserStateDetail = { includeText: false, includeElements: false };
  const fullStateDetail: BrowserStateDetail = { includeText: true, includeElements: true };

  const setTheme = (next: Partial<BrowserTheme>) => {
    browserTheme = normalizeTheme(next, browserTheme);
    if (view && !view.webContents.isDestroyed()) {
      view.setBackgroundColor(browserTheme.background);
    }
  };

  const getSession = () => {
    const browserSession = electronSession.fromPartition(PARTITION);
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    return browserSession;
  };

  const emitState = async (channel = "browser:state", detail: BrowserStateDetail = fullStateDetail) => {
    options.emit(channel, await getState(detail));
  };

  const syncDegenMode = async () => {
    if (!view || view.webContents.isDestroyed()) return false;
    return executeInPage<boolean>(degenModeScript(degenMode, degenMessagePrefix), false);
  };

  const ensureCursorScript = async () => {
    if (!view || view.webContents.isDestroyed()) return;
    if (!cursorOverlay) {
      await executeInPage(
        `(() => { try {
          const el = document.getElementById("__shob-agent-cursor__");
          if (el) el.remove();
          if (window.__shobCursor) delete window.__shobCursor;
          return true;
        } catch (e) { return false; } })()`,
        false,
      );
      return;
    }
    await executeInPage(
      `(() => {
        try {
          if (window.__shobCursor && document.getElementById("__shob-agent-cursor__")) return true;
          const ID = "__shob-agent-cursor__";
          const existing = document.getElementById(ID);
          if (existing) existing.remove();
          const wrap = document.createElement("div");
          wrap.id = ID;
          wrap.setAttribute("aria-hidden", "true");
          Object.assign(wrap.style, {
            position: "fixed",
            left: "0px",
            top: "0px",
            width: "28px",
            height: "28px",
            pointerEvents: "none",
            zIndex: "2147483647",
            transform: "translate(-9999px, -9999px)",
            transition: "transform 90ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "transform",
            filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.28))",
          });
          wrap.innerHTML = [
            '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">',
              '<path d="M3 3L10 22L12.0513 15.8461C12.6485 14.0544 14.0544 12.6485 15.846 12.0513L22 10L3 3Z" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>',
            '</svg>',
            '<div data-ripple style="position:absolute;left:2px;top:2px;width:8px;height:8px;border-radius:9999px;border:2px solid rgba(255,255,255,0.92);opacity:0;pointer-events:none;transform:scale(1);"></div>',
            '<div data-label style="position:absolute;left:30px;top:18px;padding:2px 6px;border-radius:999px;background:rgba(255,255,255,0.96);color:#111827;font:11px/1.2 ui-sans-serif,system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity 200ms ease-out;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,0.18);">agent</div>',
          ].join("");
          (document.body || document.documentElement).appendChild(wrap);

          let labelTimer = null;
          let rippleTimer = null;

          window.__shobCursor = {
            moveTo(x, y, kind, label) {
              const el = document.getElementById(ID);
              if (!el) return;
              el.style.transform = "translate(" + (x - 2) + "px, " + (y - 2) + "px)";
              if (kind === "down") {
                el.style.transition = "transform 60ms ease-out";
                el.querySelector("svg").style.transform = "scale(0.82)";
              } else if (kind === "up") {
                el.querySelector("svg").style.transform = "scale(1)";
                el.style.transition = "transform 90ms cubic-bezier(0.22, 1, 0.36, 1)";
              } else if (kind === "click") {
                const ripple = el.querySelector("[data-ripple]");
                if (ripple) {
                  ripple.style.transition = "none";
                  ripple.style.opacity = "0.9";
                  ripple.style.transform = "scale(1)";
                  // force reflow
                  void ripple.offsetWidth;
                  ripple.style.transition = "transform 420ms ease-out, opacity 420ms ease-out";
                  ripple.style.opacity = "0";
                  ripple.style.transform = "scale(4.5)";
                  if (rippleTimer) clearTimeout(rippleTimer);
                  rippleTimer = setTimeout(() => {
                    ripple.style.transition = "none";
                    ripple.style.transform = "scale(1)";
                  }, 440);
                }
              }
              if (label) {
                const lab = el.querySelector("[data-label]");
                if (lab) {
                  lab.textContent = label;
                  lab.style.opacity = "1";
                  if (labelTimer) clearTimeout(labelTimer);
                  labelTimer = setTimeout(() => { lab.style.opacity = "0"; }, 900);
                }
              }
            }
          };
          return true;
        } catch (e) { return false; }
      })()`,
      false,
    );
  };

  const emitCursor = (x: number, y: number, kind: "move" | "down" | "up" | "click", label?: string) => {
    lastCursor = { x, y };
    if (!cursorOverlay) return;
    if (!view || view.webContents.isDestroyed()) return;
    const xJs = JSON.stringify(Math.round(x));
    const yJs = JSON.stringify(Math.round(y));
    const kJs = JSON.stringify(kind);
    const lJs = JSON.stringify(label ?? null);
    // Best-effort, do not await
    void executeInPage(
      `(() => { try {
        if (!window.__shobCursor) return false;
        window.__shobCursor.moveTo(${xJs}, ${yJs}, ${kJs}, ${lJs});
        return true;
      } catch (e) { return false; } })()`,
      false,
    );
  };

  const attachLifecycle = (contents: WebContents) => {
    const publish = () => {
      void emitState("browser:state", { includeText: false, includeElements: false });
    };
    contents.on("did-start-loading", () => {
      if (!contents.getURL().startsWith("data:text/html")) lastNavigationError = null;
      publish();
    });
    contents.on("did-stop-loading", () => {
      if (cursorOverlay) void ensureCursorScript();
      if (degenMode) void syncDegenMode();
      // Re-apply mobile viewport meta tag after navigation if device emulation is on
      if (viewport.mobile && viewport.width > 0) {
        const w = JSON.stringify(viewport.width);
        const dpr = JSON.stringify(viewport.deviceScaleFactor);
        void executeInPage(
          `(() => { try {
            try { Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => ${dpr} }); } catch (e) {}
            let meta = document.querySelector('meta[name="viewport"][data-shob-emulated="1"]');
            if (!meta) {
              meta = document.createElement("meta");
              meta.setAttribute("name", "viewport");
              meta.setAttribute("data-shob-emulated", "1");
              document.head && document.head.appendChild(meta);
            }
            meta.setAttribute("content", "width=" + ${w} + ", initial-scale=1, maximum-scale=1, user-scalable=no");
            return true;
          } catch (e) { return false; } })()`,
          false,
        );
      }
      publish();
    });
    contents.on("page-title-updated", publish);
    contents.on("did-navigate", () => {
      if (!contents.getURL().startsWith("data:text/html")) lastNavigationError = null;
      if (cursorOverlay) void ensureCursorScript();
      if (degenMode) void syncDegenMode();
      publish();
    });
    contents.on("did-navigate-in-page", () => {
      publish();
    });
    contents.on("console-message", (_event, _level, message) => {
      if (typeof message !== "string" || !message.startsWith(degenMessagePrefix)) return;
      try {
        const payload = JSON.parse(message.slice(degenMessagePrefix.length)) as BrowserElementSelection;
        options.emit("browser:element-selected", payload);
      } catch (error) {
        console.warn("[shob] browser degen selection failed:", error);
      }
    });
    contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (errorCode === -3) return;
      if (isMainFrame) {
        lastNavigationError = `${errorDescription || "Navigation failed"} (${errorCode})${validatedURL ? `: ${validatedURL}` : ""}`;
        if (validatedURL && !validatedURL.startsWith("data:text/html")) {
          void contents.loadURL(errorPageDataUrl(validatedURL, lastNavigationError, browserTheme)).catch((error) => {
            console.warn("[shob] browser error page failed:", error);
          });
        }
      }
      publish();
    });
    contents.setWindowOpenHandler(({ url }) => {
      void contents.loadURL(url).catch((error) => console.warn("[shob] browser popup navigation failed:", error));
      return { action: "deny" };
    });
  };

  const applyBounds = (nextView: WebContentsView) => {
    if (sameBounds(appliedBounds, bounds)) return false;
    nextView.setBounds(bounds);
    appliedBounds = copyBounds(bounds);
    return true;
  };

  const ensureView = () => {
    if (view && !view.webContents.isDestroyed()) return view;

    appliedBounds = null;
    visible = false;
    view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        session: getSession(),
      },
    });
    view.setBackgroundColor(browserTheme.background);
    applyBounds(view);
    attachLifecycle(view.webContents);
    return view;
  };

  const addToWindow = () => {
    const win = options.getWindow();
    if (!win || win.isDestroyed()) throw new Error("Browser window is not available");
    const nextView = ensureView();
    const wasVisible = visible;
    if (!visible) {
      try {
        win.contentView.addChildView(nextView);
      } catch (error) {
        console.warn("[shob] browser attach failed:", error);
      }
      visible = true;
    }
    applyBounds(nextView);
    return { becameVisible: !wasVisible };
  };

  const removeFromWindow = () => {
    const win = options.getWindow();
    if (win && view && !win.isDestroyed()) {
      try {
        win.contentView.removeChildView(view);
      } catch {
        // The view may already be detached.
      }
    }
    visible = false;
  };

  const hide = async () => {
    removeFromWindow();
    options.emit("browser:state", await getState({ includeText: false, includeElements: false }));
  };

  const safeHide = async () => {
    await hide().catch((error) => {
      console.warn("[shob] browser hide state failed:", error);
    });
  };

  const executeInPage = async <T>(source: string, fallback: T): Promise<T> => {
    const nextView = ensureView();
    if (nextView.webContents.isDestroyed()) return fallback;
    try {
      return await nextView.webContents.executeJavaScript(source, true);
    } catch (error) {
      console.warn("[shob] browser page script failed:", error);
      return fallback;
    }
  };

  const getPageText = async (maxLength = DEFAULT_TEXT_LIMIT) =>
    executeInPage<string>(
      `(() => {
        const text = document.body?.innerText || document.documentElement?.innerText || "";
        return text.replace(/\\n{3,}/g, "\\n\\n").slice(0, ${clampInt(maxLength, DEFAULT_TEXT_LIMIT, 0, 200_000)});
      })()`,
      "",
    );

  const getElements = async (limit = DEFAULT_ELEMENT_LIMIT) =>
    executeInPage<BrowserElementSnapshot[]>(
      `(() => {
        const selectors = [
          "a[href]",
          "button",
          "input",
          "textarea",
          "select",
          "[role=button]",
          "[role=link]",
          "[contenteditable=true]",
          "[tabindex]:not([tabindex='-1'])"
        ].join(",");
        const elements = Array.from(document.querySelectorAll(selectors));
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        let index = 0;
        return elements.flatMap((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const hidden =
            rect.width < 1 ||
            rect.height < 1 ||
            rect.bottom < 0 ||
            rect.right < 0 ||
            rect.top > viewportHeight ||
            rect.left > viewportWidth ||
            style.visibility === "hidden" ||
            style.display === "none" ||
            style.pointerEvents === "none";
          if (hidden) return [];
          const htmlEl = el;
          let ref = htmlEl.getAttribute("data-shob-browser-ref");
          if (!ref) {
            ref = "e" + (++index).toString(36);
            htmlEl.setAttribute("data-shob-browser-ref", ref);
          }
          const tag = el.tagName.toLowerCase();
          const label = el.getAttribute("aria-label") || el.getAttribute("title") || "";
          const text = (label || el.innerText || el.value || el.getAttribute("alt") || "").replace(/\\s+/g, " ").trim();
          return [{
            ref,
            tag,
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
    );

  const getState = async (detail?: BrowserStateDetail): Promise<BrowserState> => {
    if (!view || view.webContents.isDestroyed()) {
      return {
        visible,
        url: "",
        title: "",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        degenMode,
        text: "",
        elements: [],
        viewport,
      };
    }

    const contents = view.webContents;
    const currentUrl = contents.getURL();
    const state: BrowserState = {
      visible,
      url: currentUrl && currentUrl !== "about:blank" && !currentUrl.startsWith("data:text/html") ? currentUrl : lastRequestedUrl,
      title: contents.getTitle(),
      loading: contents.isLoading(),
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
      degenMode,
      error: lastNavigationError,
      viewport,
    };
    if (detail?.includeText) state.text = await getPageText();
    if (detail?.includeElements) state.elements = await getElements();
    return state;
  };

  const focusRef = async (ref: string | undefined) => {
    if (!ref) return;
    const selector = JSON.stringify(`[data-shob-browser-ref="${ref.replace(/"/g, '\\"')}"]`);
    await executeInPage(
      `(() => {
        const el = document.querySelector(${selector});
        if (!el) return false;
        el.scrollIntoView({ block: "center", inline: "center" });
        if (typeof el.focus === "function") el.focus();
        return true;
      })()`,
      false,
    );
  };

  const pointForRef = async (ref: string | undefined) => {
    if (!ref) return null;
    const selector = JSON.stringify(`[data-shob-browser-ref="${ref.replace(/"/g, '\\"')}"]`);
    return executeInPage<{ x: number; y: number } | null>(
      `(() => {
        const el = document.querySelector(${selector});
        if (!el) return null;
        el.scrollIntoView({ block: "center", inline: "center" });
        const rect = el.getBoundingClientRect();
        if (typeof el.focus === "function") el.focus();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        };
      })()`,
      null,
    );
  };

  const handle = async (request: BrowserControlRequest = {}): Promise<BrowserControlResponse> => {
    const action = request.action ?? "state";
    const responseDetail = request.detail === "light" ? lightStateDetail : fullStateDetail;
    let forceLoading = false;

    if (request.bounds) {
      bounds = safeBounds(request.bounds);
      if (view && !view.webContents.isDestroyed()) applyBounds(view);
    }

    switch (action) {
      case "open":
      case "navigate": {
        const nextView = ensureView();
        const target = normalizeUrl(request.url);
        lastRequestedUrl = target;
        lastNavigationError = null;
        addToWindow();
        void nextView.webContents.loadURL(target)
          .then(() => emitState("browser:open", lightStateDetail))
          .catch((error) => {
            lastNavigationError = error instanceof Error ? error.message : String(error);
            void nextView.webContents.loadURL(errorPageDataUrl(target, lastNavigationError, browserTheme)).catch(() => undefined);
            void emitState("browser:state", lightStateDetail);
          });
        const state = await getState(responseDetail);
        return {
          ok: true,
          action,
          state: {
            ...state,
            url: state.url || target,
            loading: true,
          },
        };
      }
      case "show": {
        const result = addToWindow();
        if (result.becameVisible) {
          await emitState("browser:open", lightStateDetail);
        }
        return { ok: true, action, state: await getState(request.bounds ? lightStateDetail : responseDetail) };
      }
      case "hide": {
        removeFromWindow();
        return { ok: true, action, state: await getState(lightStateDetail) };
      }
      case "close": {
        removeFromWindow();
        degenMode = false;
        if (view && !view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
        view = null;
        appliedBounds = null;
        return { ok: true, action, state: await getState(lightStateDetail) };
      }
      case "click":
      case "double_click":
      case "right_click": {
        const nextView = ensureView();
        addToWindow();
        const point = await pointForRef(request.ref);
        const x = point?.x ?? clampInt(request.x, Math.floor(bounds.width / 2), -20_000, 20_000);
        const y = point?.y ?? clampInt(request.y, Math.floor(bounds.height / 2), -20_000, 20_000);
        const button: "left" | "right" | "middle" =
          action === "right_click" ? "right" : (request.button ?? "left");
        const clickCount = action === "double_click" ? 2 : (request.clickCount ?? 1);
        const modifiers = Array.isArray(request.modifiers) ? request.modifiers as any : undefined;
        nextView.webContents.sendInputEvent({ type: "mouseMove", x, y, modifiers });
        emitCursor(x, y, "move");
        for (let i = 0; i < clickCount; i++) {
          nextView.webContents.sendInputEvent({ type: "mouseDown", x, y, button, clickCount: i + 1, modifiers });
          nextView.webContents.sendInputEvent({ type: "mouseUp", x, y, button, clickCount: i + 1, modifiers });
        }
        emitCursor(x, y, "click", action === "double_click" ? "double-click" : action === "right_click" ? "right-click" : "click");
        break;
      }
      case "mouse_move":
      case "hover": {
        const nextView = ensureView();
        addToWindow();
        const point = await pointForRef(request.ref);
        const x = point?.x ?? clampInt(request.x, Math.floor(bounds.width / 2), -20_000, 20_000);
        const y = point?.y ?? clampInt(request.y, Math.floor(bounds.height / 2), -20_000, 20_000);
        nextView.webContents.sendInputEvent({ type: "mouseMove", x, y });
        emitCursor(x, y, "move", action === "hover" ? "hover" : undefined);
        break;
      }
      case "mouse_down": {
        const nextView = ensureView();
        addToWindow();
        const point = await pointForRef(request.ref);
        const x = point?.x ?? clampInt(request.x, Math.floor(bounds.width / 2), -20_000, 20_000);
        const y = point?.y ?? clampInt(request.y, Math.floor(bounds.height / 2), -20_000, 20_000);
        const button: "left" | "right" | "middle" = request.button ?? "left";
        nextView.webContents.sendInputEvent({ type: "mouseDown", x, y, button, clickCount: 1 });
        emitCursor(x, y, "down");
        break;
      }
      case "mouse_up": {
        const nextView = ensureView();
        addToWindow();
        const point = await pointForRef(request.ref);
        const x = point?.x ?? clampInt(request.x, Math.floor(bounds.width / 2), -20_000, 20_000);
        const y = point?.y ?? clampInt(request.y, Math.floor(bounds.height / 2), -20_000, 20_000);
        const button: "left" | "right" | "middle" = request.button ?? "left";
        nextView.webContents.sendInputEvent({ type: "mouseUp", x, y, button, clickCount: 1 });
        emitCursor(x, y, "up");
        break;
      }
      case "drag": {
        const nextView = ensureView();
        addToWindow();
        const fromPoint = request.fromRef ? await pointForRef(request.fromRef) : null;
        const toPoint = request.toRef ? await pointForRef(request.toRef) : null;
        const fx = fromPoint?.x ?? clampInt(request.fromX ?? request.x, 0, -20_000, 20_000);
        const fy = fromPoint?.y ?? clampInt(request.fromY ?? request.y, 0, -20_000, 20_000);
        const tx = toPoint?.x ?? clampInt(request.toX, 0, -20_000, 20_000);
        const ty = toPoint?.y ?? clampInt(request.toY, 0, -20_000, 20_000);
        const button: "left" | "right" | "middle" = request.button ?? "left";
        const steps = Math.max(2, Math.min(60, clampInt(request.steps, 20, 2, 200)));
        const delayMs = Math.max(0, Math.min(50, clampInt(request.delayMs, 8, 0, 200)));
        nextView.webContents.sendInputEvent({ type: "mouseMove", x: fx, y: fy });
        emitCursor(fx, fy, "move", "drag");
        nextView.webContents.sendInputEvent({ type: "mouseDown", x: fx, y: fy, button, clickCount: 1 });
        emitCursor(fx, fy, "down");
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const ix = Math.round(fx + (tx - fx) * t);
          const iy = Math.round(fy + (ty - fy) * t);
          nextView.webContents.sendInputEvent({ type: "mouseMove", x: ix, y: iy });
          emitCursor(ix, iy, "move");
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        }
        nextView.webContents.sendInputEvent({ type: "mouseUp", x: tx, y: ty, button, clickCount: 1 });
        emitCursor(tx, ty, "up");
        break;
      }
      case "type": {
        const nextView = ensureView();
        addToWindow();
        await focusRef(request.ref);
        nextView.webContents.insertText(String(request.text ?? ""));
        break;
      }
      case "press": {
        const nextView = ensureView();
        addToWindow();
        const key = keyForInput(String(request.key || "Enter"));
        nextView.webContents.sendInputEvent({ type: "keyDown", keyCode: key });
        nextView.webContents.sendInputEvent({ type: "keyUp", keyCode: key });
        break;
      }
      case "scroll": {
        const deltaX = clampInt(request.deltaX, 0, -100_000, 100_000);
        const deltaY = clampInt(request.deltaY, 600, -100_000, 100_000);
        await executeInPage(`window.scrollBy(${deltaX}, ${deltaY}); true`, true);
        break;
      }
      case "back":
        if (view && !view.webContents.isDestroyed() && view.webContents.canGoBack()) {
          const nextView = ensureView();
          nextView.webContents.goBack();
          forceLoading = true;
        }
        break;
      case "forward":
        if (view && !view.webContents.isDestroyed() && view.webContents.canGoForward()) {
          const nextView = ensureView();
          nextView.webContents.goForward();
          forceLoading = true;
        }
        break;
      case "reload": {
        const nextView = ensureView();
        nextView.webContents.reload();
        forceLoading = true;
        break;
      }
      case "set_degen_mode":
        degenMode = Boolean(request.enabled);
        addToWindow();
        await syncDegenMode();
        break;
      case "set_viewport": {
        const nextView = ensureView();
        addToWindow();
        const presetRaw = typeof request.preset === "string" ? request.preset : null;
        const width = clampInt(request.viewportWidth, 0, 0, 10_000);
        const height = clampInt(request.viewportHeight, 0, 0, 10_000);
        const dpr = Number.isFinite(request.deviceScaleFactor)
          ? Math.max(1, Math.min(4, Number(request.deviceScaleFactor)))
          : 1;
        const mobile = Boolean(request.mobile);
        viewport = {
          width,
          height,
          deviceScaleFactor: dpr,
          mobile,
          userAgent: typeof request.userAgent === "string" ? request.userAgent : null,
          preset: presetRaw,
        };
        try {
          if (viewport.userAgent) {
            nextView.webContents.setUserAgent(viewport.userAgent);
          } else {
            // Reset to default UA
            nextView.webContents.setUserAgent(nextView.webContents.session.getUserAgent());
          }
        } catch (error) {
          console.warn("[shob] browser setUserAgent failed:", error);
        }
        // Inject CSS-level device emulation: clamp viewport via meta + scale via JS.
        // We let bounds handle the actual painted region via the frontend frame.
        const dprJs = JSON.stringify(dpr);
        const widthJs = JSON.stringify(width);
        const heightJs = JSON.stringify(height);
        const mobileJs = JSON.stringify(mobile);
        await executeInPage(
          `(() => {
            try {
              const w = ${widthJs}, h = ${heightJs}, dpr = ${dprJs}, mobile = ${mobileJs};
              // Override devicePixelRatio for the page
              if (dpr > 0) {
                try { Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => dpr }); } catch (e) {}
              }
              // Inject (or update) a meta viewport so responsive sites lay out correctly
              let meta = document.querySelector('meta[name="viewport"][data-shob-emulated="1"]');
              if (mobile && w > 0) {
                if (!meta) {
                  meta = document.createElement("meta");
                  meta.setAttribute("name", "viewport");
                  meta.setAttribute("data-shob-emulated", "1");
                  document.head && document.head.appendChild(meta);
                }
                meta.setAttribute("content", "width=" + w + ", initial-scale=1, maximum-scale=1, user-scalable=no");
              } else if (meta) {
                meta.remove();
              }
              return true;
            } catch (e) { return false; }
          })()`,
          false,
        );
        if (mobile) {
          // Reload so UA-sniffing scripts pick up the mobile UA
          try { nextView.webContents.reloadIgnoringCache(); } catch (e) { /* noop */ }
        }
        break;
      }
      case "set_cursor_overlay": {
        cursorOverlay = Boolean(request.enabled);
        addToWindow();
        await ensureCursorScript();
        break;
      }
      case "extract": {
        const text = await getPageText(request.maxLength ?? DEFAULT_TEXT_LIMIT);
        return { ok: true, action, state: await getState({ includeText: false, includeElements: true }), text };
      }
      case "evaluate": {
        const value = await executeInPage(String(request.javascript ?? "undefined"), null);
        return { ok: true, action, state: await getState({ includeText: true, includeElements: true }), value };
      }
      case "screenshot": {
        const nextView = ensureView();
        const image = await nextView.webContents.capturePage();
        return { ok: true, action, state: await getState({ includeText: true, includeElements: true }), dataUrl: image.toDataURL() };
      }
      case "state":
        break;
      default:
        throw new Error(`Unsupported browser action: ${action}`);
    }

    const state = await getState(responseDetail);
    return { ok: true, action, state: forceLoading ? { ...state, loading: true } : state };
  };

  const start = async () => {
    if (endpointUrl) return { url: endpointUrl, token };
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        void (async () => {
          try {
            if (req.method !== "POST" || req.url !== "/browser") {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Not found" }));
              return;
            }
            if (req.headers["x-shob-browser-token"] !== token) {
              res.writeHead(401, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Unauthorized" }));
              return;
            }
            const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
            const result = await handle(body);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }
        })();
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unable to start browser control server");
    endpointUrl = `http://127.0.0.1:${address.port}`;
    return { url: endpointUrl, token };
  };

  const stop = async () => {
    removeFromWindow();
    if (view && !view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
    view = null;
    if (!server) return;
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    endpointUrl = null;
  };

  return {
    start,
    stop,
    hide: safeHide,
    setTheme,
    handle,
  };
}
