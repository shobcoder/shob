import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"

const Parameters = z.object({
  action: z
    .enum([
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
    .default("state")
    .describe("Browser action to perform."),
  url: z.string().optional().describe("URL or search query for open/navigate."),
  ref: z.string().optional().describe("Element ref from browser state to click, focus, or type into."),
  text: z.string().optional().describe("Text to type when action is type."),
  key: z.string().optional().describe("Key to press when action is press, for example Enter, Tab, Escape, ArrowDown."),
  x: z.number().optional().describe("Viewport x coordinate for click when no ref is supplied."),
  y: z.number().optional().describe("Viewport y coordinate for click when no ref is supplied."),
  deltaX: z.number().optional().describe("Horizontal scroll amount."),
  deltaY: z.number().optional().describe("Vertical scroll amount."),
  javascript: z.string().optional().describe("JavaScript to run in the page when action is evaluate."),
  maxLength: z.number().optional().describe("Maximum text length for extract."),
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
  state: BrowserState
  text?: string
  dataUrl?: string
  value?: unknown
}

type BrowserMetadata = {
  action: string
  available: boolean
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
    `Title: ${state.title || "(untitled)"}`,
    `URL: ${state.url || "(blank)"}`,
    `Visible: ${state.visible ? "yes" : "no"}`,
    `Loading: ${state.loading ? "yes" : "no"}`,
  ]
  if (extra) lines.push("", extra)
  lines.push("", formatElements(state.elements))
  if (state.text) {
    lines.push("", "Visible text:", state.text.slice(0, 6000))
  }
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
      "Control Shob's embedded browser tab. Use this when a task needs a real browser session.",
      "You can open pages, show/hide/close the tab, click by element ref or coordinate, type, press keys, scroll, go back/forward, reload, extract visible text, evaluate page JavaScript, and take screenshots.",
      "The tool returns visible page text and interactive element refs that can be used in later browser calls.",
    ].join("\n"),
    parameters: Parameters,
    execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const baseUrl = process.env.SHOB_BROWSER_CONTROL_URL
        const token = process.env.SHOB_BROWSER_CONTROL_TOKEN
        if (!baseUrl || !token) {
          const metadata: BrowserMetadata = { action: params.action, available: false }
          return {
            title: "Browser unavailable",
            output: "The embedded browser bridge is not running. Start Shob in the Electron app to use this tool.",
            metadata,
          }
        }

        const response = yield* Effect.promise(async () => {
          const res = await fetch(`${baseUrl}/browser`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shob-Browser-Token": token,
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

        const action = response.action || params.action
        const state = response.state
        const metadata: BrowserMetadata = {
          action,
          url: state.url,
          title: state.title,
          available: true,
        }

        if (response.dataUrl) {
          return {
            title: `Browser screenshot: ${state.title || state.url || "page"}`,
            output: formatState(state, "Screenshot captured."),
            metadata,
            attachments: [
              {
                type: "file" as const,
                mime: "image/png",
                url: response.dataUrl,
              },
            ],
          }
        }

        if (action === "extract") {
          return {
            title: `Browser extract: ${state.title || state.url || "page"}`,
            output: formatState(state, response.text || "No visible text extracted."),
            metadata,
          }
        }

        if (action === "evaluate") {
          return {
            title: `Browser evaluate: ${state.title || state.url || "page"}`,
            output: formatState(state, `Result:\n${stringifyValue(response.value)}`),
            metadata,
          }
        }

        return {
          title: `Browser ${action}: ${state.title || state.url || "page"}`,
          output: formatState(state),
          metadata,
        }
      }).pipe(Effect.orDie),
  }),
)
