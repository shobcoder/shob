import { Effect, Schema } from "effect"
import * as Tool from "./tool"

const BrowserAction = Schema.Literals([
  "open",
  "navigate",
  "show",
  "hide",
  "close",
  "state",
  "click",
  "type",
  "press",
  "scroll",
  "back",
  "forward",
  "reload",
  "extract",
  "evaluate",
  "screenshot",
])

export const Parameters = Schema.Struct({
  browserId: Schema.optional(Schema.String).annotate({
    description: "Optional browser container id, for example browser-1, browser-2, browser-3, or browser-4.",
  }),
  action: BrowserAction.annotate({
    description: "Browser action to perform. Defaults to state.",
    default: "state",
  }).pipe(Schema.withDecodingDefault(Effect.succeed("state" as const))),
  url: Schema.optional(Schema.String).annotate({ description: "URL or search query for open/navigate." }),
  ref: Schema.optional(Schema.String).annotate({
    description: "Element ref from browser state to click, focus, or type into.",
  }),
  text: Schema.optional(Schema.String).annotate({ description: "Text to type when action is type." }),
  key: Schema.optional(Schema.String).annotate({
    description: "Key to press when action is press, for example Enter, Tab, Escape, ArrowDown.",
  }),
  x: Schema.optional(Schema.Number).annotate({ description: "Viewport x coordinate for click when no ref is supplied." }),
  y: Schema.optional(Schema.Number).annotate({ description: "Viewport y coordinate for click when no ref is supplied." }),
  deltaX: Schema.optional(Schema.Number).annotate({ description: "Horizontal scroll amount." }),
  deltaY: Schema.optional(Schema.Number).annotate({ description: "Vertical scroll amount." }),
  javascript: Schema.optional(Schema.String).annotate({
    description: "JavaScript to run in the page when action is evaluate.",
  }),
  maxLength: Schema.optional(Schema.Number).annotate({ description: "Maximum text length for extract." }),
})

type BrowserElement = {
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

type BrowserState = {
  browserId: string
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  text?: string
  elements?: BrowserElement[]
}

type BrowserResponse = {
  ok: true
  action: string
  browserId: string
  state: BrowserState
  text?: string
  dataUrl?: string
  value?: unknown
}

type BrowserMetadata = {
  action: string
  available: boolean
  browserId?: string
  url?: string
  title?: string
}

function compact(value: string | null | undefined, fallback = "") {
  const text = (value ?? fallback).replace(/\s+/g, " ").trim()
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}

function formatElements(elements: BrowserElement[] | undefined) {
  const list = elements ?? []
  if (list.length === 0) return "Interactive elements: none detected"
  return [
    "Interactive elements:",
    ...list.slice(0, 80).map((element) => {
      const label = compact(element.text || element.placeholder || element.href || element.tag, element.tag)
      const role = [element.tag, element.role, element.type].filter(Boolean).join("/")
      const href = element.href ? ` href=${element.href}` : ""
      return `- [${element.ref}] ${role} "${label}" at ${element.x},${element.y} ${element.width}x${element.height}${href}`
    }),
  ].join("\n")
}

function formatState(state: BrowserState, extra?: string) {
  const lines = [
    `Browser: ${state.browserId}`,
    `Title: ${state.title || "(untitled)"}`,
    `URL: ${state.url || "(blank)"}`,
    `Visible: ${state.visible ? "yes" : "no"}`,
    `Loading: ${state.loading ? "yes" : "no"}`,
  ]
  if (extra) lines.push("", extra)
  lines.push("", formatElements(state.elements))
  if (state.text) lines.push("", "Visible text:", state.text.slice(0, 6000))
  return lines.join("\n")
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export const BrowserTool = Tool.define(
  "browser",
  Effect.succeed({
    description: [
      "Control OpenCode's embedded browser containers. Use this when a task needs a real browser session.",
      "There can be up to four isolated browser containers: browser-1 through browser-4.",
      "You can open pages, click by element ref or coordinate, type, press keys, scroll, go back/forward, reload, extract visible text, evaluate page JavaScript, and take screenshots.",
      "If browserId is omitted, OpenCode uses the active/default browser.",
    ].join("\n"),
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const baseUrl = process.env.OPENCODE_BROWSER_CONTROL_URL ?? process.env.SHOB_BROWSER_CONTROL_URL
        const token = process.env.OPENCODE_BROWSER_CONTROL_TOKEN ?? process.env.SHOB_BROWSER_CONTROL_TOKEN
        if (!baseUrl || !token) {
          const metadata: BrowserMetadata = { action: params.action, available: false }
          return {
            title: "Browser unavailable",
            output: "The embedded browser bridge is not running. Start OpenCode in the Electron desktop app to use this tool.",
            metadata,
          }
        }

        yield* ctx.ask({
          permission: "browser",
          patterns: [params.browserId ?? "*"],
          always: ["*"],
          metadata: {
            action: params.action,
            browserId: params.browserId,
            url: params.url,
          },
        })

        const response = yield* Effect.promise(async () => {
          const res = await fetch(`${baseUrl}/browser`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Opencode-Browser-Token": token,
            },
            body: JSON.stringify(params),
            signal: ctx.abort,
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            const message = typeof body?.error === "string" ? body.error : `Browser request failed with ${res.status}`
            throw new Error(message)
          }
          return body as BrowserResponse
        })

        const state = response.state
        const metadata: BrowserMetadata = {
          action: response.action || params.action,
          browserId: response.browserId,
          url: state.url,
          title: state.title,
          available: true,
        }

        if (response.dataUrl) {
          return {
            title: `Browser screenshot: ${state.title || state.url || state.browserId}`,
            output: formatState(state, "Screenshot captured."),
            metadata,
            attachments: [{ type: "file" as const, mime: "image/png", url: response.dataUrl }],
          }
        }

        if (response.action === "extract") {
          return {
            title: `Browser extract: ${state.title || state.url || state.browserId}`,
            output: formatState(state, response.text || "No visible text extracted."),
            metadata,
          }
        }

        if (response.action === "evaluate") {
          return {
            title: `Browser evaluate: ${state.title || state.url || state.browserId}`,
            output: formatState(state, `Result:\n${stringifyValue(response.value)}`),
            metadata,
          }
        }

        return {
          title: `Browser ${response.action}: ${state.title || state.url || state.browserId}`,
          output: formatState(state),
          metadata,
        }
      }),
  }),
)
