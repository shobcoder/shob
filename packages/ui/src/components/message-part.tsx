import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onMount,
  Show,
  Switch,
  onCleanup,
  Index,
  type JSX,
} from "solid-js"
import { createStore } from "solid-js/store"
import stripAnsi from "strip-ansi"
import { Dynamic } from "solid-js/web"
import {
  AgentPart,
  AssistantMessage,
  FilePart,
  Message as MessageType,
  Part as PartType,
  ReasoningPart,
  Session,
  TextPart,
  ToolPart,
  UserMessage,
  Todo,
  QuestionAnswer,
  QuestionInfo,
} from "@shob-ai/sdk/v2"
import { useData } from "../context"
import { useFileComponent } from "../context/file"
import { useDialog } from "../context/dialog"
import { type UiI18n, useI18n } from "../context/i18n"
import { BasicTool, GenericTool } from "./basic-tool"
import { Accordion } from "./accordion"
import { Collapsible } from "./collapsible"
import { StickyAccordionHeader } from "./sticky-accordion-header"
import { Card } from "./card"
import { FileIcon } from "./file-icon"
import { Icon } from "./icon"
import { ToolErrorCard } from "./tool-error-card"
import { Checkbox } from "./checkbox"
import { DiffChanges } from "./diff-changes"
import { Markdown } from "./markdown"
import { ImagePreview } from "./image-preview"
import { getDirectory as _getDirectory, getFilename } from "@shob-ai/util/path"
import { checksum } from "@shob-ai/util/encode"
import { Tooltip } from "./tooltip"
import { IconButton } from "./icon-button"
import { Spinner } from "./spinner"
import { TextShimmer } from "./text-shimmer"
import { patchFiles } from "./apply-patch-file"
import { animate } from "motion"
import { useLocation } from "@solidjs/router"
import { attached, inline, kind } from "./message-file"
import {
  groupAssistantDisplayParts,
  orderAssistantDisplayParts,
  sameAssistantPartGroups,
  type AssistantPartEntry,
  type AssistantPartGroup as PartGroup,
  type AssistantPartRef as PartRef,
} from "./message-part-order"
import { getReasoningDisplayState } from "./message-part-reasoning-state"
import { readPartText } from "./message-part-text"

function ShellSubmessage(props: { text: string; animate?: boolean }) {
  let widthRef: HTMLSpanElement | undefined
  let valueRef: HTMLSpanElement | undefined

  onMount(() => {
    if (!props.animate) return
    requestAnimationFrame(() => {
      if (widthRef) {
        animate(widthRef, { width: "auto" }, { type: "spring", visualDuration: 0.25, bounce: 0 })
      }
      if (valueRef) {
        animate(valueRef, { opacity: 1, filter: "blur(0px)" }, { duration: 0.32, ease: [0.16, 1, 0.3, 1] })
      }
    })
  })

  return (
    <span data-component="shell-submessage">
      <span ref={widthRef} data-slot="shell-submessage-width" style={{ width: props.animate ? "0px" : undefined }}>
        <span data-slot="basic-tool-tool-subtitle">
          <span
            ref={valueRef}
            data-slot="shell-submessage-value"
            style={props.animate ? { opacity: 0, filter: "blur(2px)" } : undefined}
          >
            {props.text}
          </span>
        </span>
      </span>
    </span>
  )
}

interface Diagnostic {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  message: string
  severity?: number
}

function getDiagnostics(
  diagnosticsByFile: Record<string, Diagnostic[]> | undefined,
  filePath: string | undefined,
): Diagnostic[] {
  if (!diagnosticsByFile || !filePath) return []
  const diagnostics = diagnosticsByFile[filePath] ?? []
  return diagnostics.filter((d) => d.severity === 1).slice(0, 3)
}

function DiagnosticsDisplay(props: { diagnostics: Diagnostic[] }): JSX.Element {
  const i18n = useI18n()
  return (
    <Show when={props.diagnostics.length > 0}>
      <div data-component="diagnostics">
        <For each={props.diagnostics}>
          {(diagnostic) => (
            <div data-slot="diagnostic">
              <span data-slot="diagnostic-label">{i18n.t("ui.messagePart.diagnostic.error")}</span>
              <span data-slot="diagnostic-location">
                [{diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}]
              </span>
              <span data-slot="diagnostic-message">{diagnostic.message}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

export interface MessageProps {
  message: MessageType
  parts: PartType[]
  actions?: UserActions
  showAssistantCopyPartID?: string | null
  showReasoningSummaries?: boolean
}

export type SessionAction = (input: { sessionID: string; messageID: string }) => Promise<void> | void

export type UserActions = {
  fork?: SessionAction
  revert?: SessionAction
}

export interface MessagePartProps {
  part: PartType
  message: MessageType
  hideDetails?: boolean
  defaultOpen?: boolean
  showAssistantCopyPartID?: string | null
  turnDurationMs?: number
}

export type PartComponent = Component<MessagePartProps>

export const PART_MAPPING: Record<string, PartComponent | undefined> = {}

const TEXT_RENDER_PACE_MS = 24
const TEXT_RENDER_SNAP = /[\s.,!?;:)\]]/

function step(size: number) {
  if (size <= 12) return 2
  if (size <= 48) return 4
  if (size <= 96) return 8
  return Math.min(24, Math.ceil(size / 8))
}

function next(text: string, start: number) {
  const end = Math.min(text.length, start + step(text.length - start))
  const max = Math.min(text.length, end + 8)
  for (let i = end; i < max; i++) {
    if (TEXT_RENDER_SNAP.test(text[i] ?? "")) return i + 1
  }
  return end
}

function createPacedValue(getValue: () => string, live?: () => boolean) {
  const [value, setValue] = createSignal(getValue())
  let shown = getValue()
  let timeout: ReturnType<typeof setTimeout> | undefined

  const clear = () => {
    if (!timeout) return
    clearTimeout(timeout)
    timeout = undefined
  }

  const sync = (text: string) => {
    shown = text
    setValue(text)
  }

  const run = () => {
    timeout = undefined
    const text = getValue()
    if (!live?.()) {
      sync(text)
      return
    }
    if (!text.startsWith(shown) || text.length <= shown.length) {
      sync(text)
      return
    }
    const end = next(text, shown.length)
    sync(text.slice(0, end))
    if (end < text.length) timeout = setTimeout(run, TEXT_RENDER_PACE_MS)
  }

  createEffect(() => {
    const text = getValue()
    if (!live?.()) {
      clear()
      sync(text)
      return
    }
    if (!text.startsWith(shown) || text.length < shown.length) {
      clear()
      sync(text)
      return
    }
    if (text.length === shown.length || timeout) return
    timeout = setTimeout(run, TEXT_RENDER_PACE_MS)
  })

  onCleanup(() => {
    clear()
  })

  return value
}

function PacedMarkdown(props: { text: string; cacheKey: string; streaming: boolean }) {
  const value = createPacedValue(
    () => props.text,
    () => props.streaming,
  )

  return (
    <Show when={value()}>
      <Markdown text={value()} cacheKey={props.cacheKey} streaming={props.streaming} />
    </Show>
  )
}

function relativizeProjectPath(path: string, directory?: string) {
  if (!path) return ""
  if (!directory) return path
  if (directory === "/") return path
  if (directory === "\\") return path
  if (path === directory) return ""

  const separator = directory.includes("\\") ? "\\" : "/"
  const prefix = directory.endsWith(separator) ? directory : directory + separator
  if (!path.startsWith(prefix)) return path
  return path.slice(directory.length)
}

function getDirectory(path: string | undefined) {
  const data = useData()
  return relativizeProjectPath(_getDirectory(path), data.directory)
}

import type { IconProps } from "./icon"

export type ToolInfo = {
  icon: IconProps["name"]
  title: string
  subtitle?: string
}

function agentTitle(i18n: UiI18n, type?: string) {
  if (!type) return i18n.t("ui.tool.agent.default")
  return i18n.t("ui.tool.agent", { type })
}

const agentTones: Record<string, string> = {
  ask: "var(--icon-agent-ask-base)",
  build: "var(--icon-agent-build-base)",
  docs: "var(--icon-agent-docs-base)",
  plan: "var(--icon-agent-plan-base)",
}

const agentPalette = [
  "var(--icon-agent-ask-base)",
  "var(--icon-agent-build-base)",
  "var(--icon-agent-docs-base)",
  "var(--icon-agent-plan-base)",
  "var(--syntax-info)",
  "var(--syntax-success)",
  "var(--syntax-warning)",
  "var(--syntax-property)",
  "var(--syntax-constant)",
  "var(--text-diff-add-base)",
  "var(--text-diff-delete-base)",
  "var(--icon-warning-base)",
]

function tone(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return agentPalette[hash % agentPalette.length]
}

function taskAgent(
  raw: unknown,
  list?: readonly { name: string; color?: string }[],
): { name?: string; color?: string } {
  if (typeof raw !== "string" || !raw) return {}
  const key = raw.toLowerCase()
  const item = list?.find((entry) => entry.name === raw || entry.name.toLowerCase() === key)
  return {
    name: item?.name ?? `${raw[0]!.toUpperCase()}${raw.slice(1)}`,
    color: item?.color ?? agentTones[key] ?? tone(key),
  }
}

export function getToolInfo(tool: string, input: any = {}): ToolInfo {
  const i18n = useI18n()
  switch (tool) {
    case "read":
      return {
        icon: "glasses",
        title: "Read",
        subtitle: input.filePath ? getFilename(input.filePath) : undefined,
      }
    case "list":
      return {
        icon: "bullet-list",
        title: "Listed",
        subtitle: input.path ? getFilename(input.path) : undefined,
      }
    case "glob":
      return {
        icon: "magnifying-glass-menu",
        title: "Searched",
        subtitle: input.pattern,
      }
    case "grep":
      return {
        icon: "magnifying-glass-menu",
        title: "Searched",
        subtitle: input.pattern,
      }
    case "webfetch":
      return {
        icon: "window-cursor",
        title: "Fetched",
        subtitle: input.url,
      }
    case "websearch":
      return {
        icon: "window-cursor",
        title: "Searched web",
        subtitle: input.query,
      }
    case "browser":
      return {
        icon: "browser",
        title: "Used browser",
        subtitle: input.url,
      }
    case "codesearch":
      return {
        icon: "code",
        title: "Searched code",
        subtitle: input.query,
      }
    case "task": {
      const type =
        typeof input.subagent_type === "string" && input.subagent_type
          ? input.subagent_type[0]!.toUpperCase() + input.subagent_type.slice(1)
          : undefined
      return {
        icon: "task",
        title: agentTitle(i18n, type),
        subtitle: input.description,
      }
    }
    case "bash":
      return {
        icon: "console",
        title: "Ran",
        subtitle: input.description,
      }
    case "edit":
      return {
        icon: "code-lines",
        title: "Edited",
        subtitle: input.filePath ? getFilename(input.filePath) : undefined,
      }
    case "write":
      return {
        icon: "code-lines",
        title: "Edited",
        subtitle: input.filePath ? getFilename(input.filePath) : undefined,
      }
    case "apply_patch":
      return {
        icon: "code-lines",
        title: "Edited",
        subtitle: input.files?.length
          ? `${input.files.length} ${i18n.t(input.files.length > 1 ? "ui.common.file.other" : "ui.common.file.one")}`
          : undefined,
      }
    case "todowrite":
      return {
        icon: "checklist",
        title: i18n.t("ui.tool.todos"),
      }
    case "question":
      return {
        icon: "bubble-5",
        title: i18n.t("ui.tool.questions"),
      }
    case "skill":
      return {
        icon: "brain",
        title: input.name || i18n.t("ui.tool.skill"),
      }
    default:
      return {
        icon: "mcp",
        title: tool,
      }
  }
}

function urls(text: string | undefined) {
  if (!text) return []
  const seen = new Set<string>()
  return [...text.matchAll(/https?:\/\/[^\s<>"'`)\]]+/g)]
    .map((item) => item[0].replace(/[),.;:!?]+$/g, ""))
    .filter((item) => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function sessionLink(id: string | undefined, path: string, href?: (id: string) => string | undefined) {
  if (!id) return

  const direct = href?.(id)
  if (direct) return direct

  const idx = path.indexOf("/session")
  if (idx === -1) return
  return `${path.slice(0, idx)}/session/${id}`
}

function currentSession(path: string) {
  return path.match(/\/session\/([^/?#]+)/)?.[1]
}

function taskSession(
  input: Record<string, any>,
  path: string,
  sessions: Session[] | undefined,
  agents?: readonly { name: string; color?: string }[],
) {
  const parentID = currentSession(path)
  if (!parentID) return
  const description = typeof input.description === "string" ? input.description : ""
  const agent = taskAgent(input.subagent_type, agents).name
  return (sessions ?? [])
    .filter((session) => session.parentID === parentID && !session.time?.archived)
    .filter((session) => (description ? session.title.startsWith(description) : true))
    .filter((session) => (agent ? session.title.includes(`@${agent}`) : true))
    .sort((a, b) => (b.time.created ?? 0) - (a.time.created ?? 0))[0]?.id
}

const CONTEXT_GROUP_TOOLS = new Set(["read", "glob", "grep", "list", "bash", "edit", "write", "apply_patch", "webfetch", "websearch", "codesearch", "task", "question", "skill"])
const HIDDEN_TOOLS = new Set(["todowrite"])

function list<T>(value: T[] | undefined | null, fallback: T[]) {
  if (Array.isArray(value)) return value
  return fallback
}

function same<T>(a: readonly T[] | undefined, b: readonly T[] | undefined) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  return a.every((x, i) => x === b[i])
}

function index<T extends { id: string }>(items: readonly T[]) {
  return new Map(items.map((item) => [item.id, item] as const))
}

function renderable(part: PartType, showReasoningSummaries = true) {
  if (part.type === "tool") {
    if (HIDDEN_TOOLS.has(part.tool)) return false
    if (part.tool === "question") return part.state.status !== "pending" && part.state.status !== "running"
    return true
  }
  if (part.type === "text") return !!part.text?.trim()
  if (part.type === "reasoning") return showReasoningSummaries && !!part.text?.trim()
  return !!PART_MAPPING[part.type]
}

export function assistantDisplayPartEntries(input: {
  messages: AssistantMessage[]
  getParts: (messageID: string) => PartType[] | undefined
  showReasoningSummaries?: boolean
}): AssistantPartEntry<PartType>[] {
  return input.messages.flatMap((message) =>
    list(input.getParts(message.id), [])
      .filter((part) => renderable(part, input.showReasoningSummaries ?? true))
      .map((part) => ({
        messageID: message.id,
        messageCompleted: typeof message.time.completed === "number",
        part,
      })),
  )
}

export function visibleAssistantDisplayPartEntries(input: {
  messages: AssistantMessage[]
  getParts: (messageID: string) => PartType[] | undefined
  showReasoningSummaries?: boolean
  live?: boolean
}) {
  return orderAssistantDisplayParts(assistantDisplayPartEntries(input), { live: input.live ?? false })
}

function toolDefaultOpen(tool: string, shell = false, edit = false) {
  if (tool === "bash") return shell
  if (tool === "edit" || tool === "write" || tool === "apply_patch") return edit
  if (tool === "task") return true
}

function partDefaultOpen(part: PartType, shell = false, edit = false) {
  if (part.type !== "tool") return
  return toolDefaultOpen(part.tool, shell, edit)
}

function live(status?: string) {
  return status === "pending" || status === "running"
}

function spanOf(part: ToolPart) {
  if (part.state.status === "pending") return
  const start = part.state.time.start
  const end = "end" in part.state.time && typeof part.state.time.end === "number" ? part.state.time.end : start
  return { start, end }
}

function scoreOf(part: ToolPart) {
  if (part.state.status === "completed" || part.state.status === "error") {
    return {
      rank: 3,
      at: part.state.time.end,
    }
  }
  if (part.state.status === "running") {
    return {
      rank: 2,
      at: part.state.time.start,
    }
  }
  return {
    rank: 1,
    at: 0,
  }
}

function keyOf(part: ToolPart) {
  if (part.callID) return `call:${part.callID}`
  return `input:${part.tool}:${JSON.stringify(part.state.input ?? {})}`
}

function statsOf(parts: ToolPart[]) {
  const latest = new Map<string, ToolPart>()
  parts.forEach((part) => {
    const key = keyOf(part)
    const prev = latest.get(key)
    if (!prev) {
      latest.set(key, part)
      return
    }
    const nextScore = scoreOf(part)
    const prevScore = scoreOf(prev)
    if (nextScore.at > prevScore.at) {
      latest.set(key, part)
      return
    }
    if (nextScore.at < prevScore.at) return
    if (nextScore.rank > prevScore.rank) latest.set(key, part)
  })

  let running = false
  let start: number | undefined
  let end: number | undefined

  latest.forEach((part) => {
    if (live(part.state.status)) running = true
    const span = spanOf(part)
    if (!span) return
    if (start === undefined || span.start < start) start = span.start
    if (end === undefined || span.end > end) end = span.end
  })

  if (start === undefined) return { running, span: undefined as { start: number; end: number } | undefined }
  return { running, span: { start, end: end ?? start } }
}

function formatElapsed(ms: number) {
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`
  }
  const total = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

const INSPECT_TOOLS = new Set(["read", "list", "glob", "grep", "webfetch", "websearch", "codesearch"])

function plural(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function sentence(phrases: string[]) {
  if (!phrases.length) return ""
  const [first, ...rest] = phrases
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(", ")
}

function latestTools(parts: ToolPart[]) {
  const latest = new Map<string, ToolPart>()
  parts.forEach((part) => {
    const key = keyOf(part)
    const prev = latest.get(key)
    if (!prev) {
      latest.set(key, part)
      return
    }

    const nextScore = scoreOf(part)
    const prevScore = scoreOf(prev)
    if (nextScore.at > prevScore.at || (nextScore.at === prevScore.at && nextScore.rank > prevScore.rank)) {
      latest.set(key, part)
    }
  })
  return [...latest.values()]
}

function toolInput(part: ToolPart): Record<string, any> {
  return ((part.state as any).input ?? {}) as Record<string, any>
}

function toolMetadata(part: ToolPart): Record<string, any> {
  return ((part.state as any).metadata ?? {}) as Record<string, any>
}

function editedFiles(part: ToolPart) {
  const input = toolInput(part)
  const metadata = toolMetadata(part)

  if (part.tool === "apply_patch") {
    const files = patchFiles(metadata.files)
    if (files.length > 0) return files.map((file) => file.relativePath || file.filePath).filter(Boolean)

    const inputFiles = input.files
    if (Array.isArray(inputFiles)) {
      return inputFiles.filter((file): file is string => typeof file === "string" && file.length > 0)
    }
  }

  const path = metadata.filediff?.file || input.filePath
  if (typeof path === "string" && path.length > 0) return [path]
  if (part.tool === "edit" || part.tool === "write" || part.tool === "apply_patch") return [keyOf(part)]
  return []
}

function summarizeContextTools(parts: ToolPart[], fallbackCount: number, active: boolean) {
  const latest = latestTools(parts)
  const edited = new Set<string>()
  let commands = 0
  let inspected = 0
  let agents = 0
  let questions = 0
  let skills = 0
  let other = 0

  for (const part of latest) {
    if (part.tool === "bash") {
      commands++
      continue
    }

    if (part.tool === "edit" || part.tool === "write" || part.tool === "apply_patch") {
      editedFiles(part).forEach((file) => edited.add(file))
      continue
    }

    if (INSPECT_TOOLS.has(part.tool)) {
      inspected++
      continue
    }

    if (part.tool === "task") {
      agents++
      continue
    }

    if (part.tool === "question") {
      questions++
      continue
    }

    if (part.tool === "skill") {
      skills++
      continue
    }

    other++
  }

  const phrases: string[] = []
  if (edited.size > 0) phrases.push(`${active ? "editing" : "edited"} ${plural(edited.size, "file")}`)
  if (commands > 0) phrases.push(`${active ? "running" : "ran"} ${plural(commands, "command")}`)
  if (inspected > 0) phrases.push(`${active ? "inspecting" : "inspected"} ${plural(inspected, "item")}`)
  if (agents > 0) phrases.push(`${active ? "using" : "used"} ${plural(agents, "agent")}`)
  if (questions > 0) phrases.push(`${active ? "asking" : "answered"} ${plural(questions, "question")}`)
  if (skills > 0) phrases.push(`${active ? "loading" : "loaded"} ${plural(skills, "skill")}`)
  if (other > 0) phrases.push(`${active ? "using" : "used"} ${plural(other, "tool")}`)

  const fallback = latest.length || fallbackCount
  return sentence(phrases) || (active ? "Working" : `Used ${plural(fallback, "tool")}`)
}

const DOTS_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

function DotsSpinner(props: { class?: string }) {
  const [frame, setFrame] = createSignal(0)

  onMount(() => {
    const timer = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % DOTS_FRAMES.length)
    }, 80)
    onCleanup(() => window.clearInterval(timer))
  })

  return (
    <span class={props.class} aria-hidden="true">
      {DOTS_FRAMES[frame()]}
    </span>
  )
}

function ContextTools(props: {
  running: () => boolean
  generating?: () => boolean
  span: () => { start: number; end: number } | undefined
  count: number
  tools: ToolPart[]
  children: JSX.Element
}) {
  const initialBusy = props.running() || !!props.generating?.()
  const [open, setOpen] = createSignal(initialBusy)
  const [busy, setBusy] = createSignal(initialBusy)
  const [now, setNow] = createSignal(Date.now())
  let settle: ReturnType<typeof setTimeout> | undefined

  createEffect(() => {
    const active = props.running() || !!props.generating?.()
    if (active) {
      if (settle) {
        clearTimeout(settle)
        settle = undefined
      }
      if (!busy()) setBusy(true)
      return
    }
    if (settle) clearTimeout(settle)
    settle = setTimeout(() => {
      setBusy(false)
      setOpen(false)
      settle = undefined
    }, 1600)
  })

  onCleanup(() => {
    if (!settle) return
    clearTimeout(settle)
    settle = undefined
  })

  const elapsed = createMemo(() => {
    const span = props.span()
    if (!span) return "0s"
    const end = props.running() ? now() : span.end
    return formatElapsed(end - span.start)
  })

  createEffect(() => {
    if (!busy()) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    onCleanup(() => clearInterval(timer))
  })

  createEffect((prev?: boolean) => {
    const active = busy()
    if (active && !prev && !open()) setOpen(true)
    if (!active && prev && open()) setOpen(false)
    return active
  })

  const change = (next: boolean) => {
    if (busy() && !next) return
    setOpen(next)
  }

  const summary = createMemo(() => summarizeContextTools(props.tools, props.count, props.running()))

  return (
    <Collapsible
      open={open()}
      onOpenChange={change}
      data-component="context-tool-group"
      data-status={props.running() ? "running" : "completed"}
      aria-label={`${summary()}${props.span() ? `, ${elapsed()}` : ""}`}
    >
      <Collapsible.Trigger>
        <div data-slot="context-tool-group-trigger">
          <div data-slot="context-tool-group-main">
            <span data-slot="context-tool-group-title">
              <span data-slot="context-tool-group-icon">
                <Icon name={props.running() ? "terminal-active" : "terminal"} size="small" />
              </span>
              <span>{summary()}</span>
              <Show when={props.running()}>
                <DotsSpinner class="text-[14px] leading-none text-icon-interactive-base font-mono ml-1.5" />
              </Show>
            </span>
            <Collapsible.Arrow />
          </div>
          <span data-slot="context-tool-group-line" />
        </div>
      </Collapsible.Trigger>
      <Collapsible.Content>{props.children}</Collapsible.Content>
    </Collapsible>
  )
}

export type { PartGroup as AssistantPartGroup, PartRef as AssistantPartRef }

export function AssistantPartGroupView(props: {
  group: PartGroup
  messages: AssistantMessage[]
  getParts?: (messageID: string) => PartType[] | undefined
  showAssistantCopyPartID?: string | null
  turnDurationMs?: number
  generating?: boolean
  shellToolDefaultOpen?: boolean
  editToolDefaultOpen?: boolean
}) {
  const data = useData()
  const emptyParts: PartType[] = []
  const msgs = createMemo(() => index(props.messages))
  const part = createMemo(
    () =>
      new Map(
        props.messages.map((message) => [
          message.id,
          index(list(props.getParts?.(message.id) ?? data.store.part?.[message.id], emptyParts)),
        ] as const),
      ),
  )
  const entryType = createMemo(() => props.group.type)

  return (
    <Switch>
      <Match when={entryType() === "context"}>
        {(() => {
          const refs = createMemo(() => {
            const entry = props.group
            if (entry.type !== "context") return [] as PartRef[]
            return entry.refs
          })

          return (
            <Show when={refs().length > 0}>
              {(() => {
                const allPartsList = createMemo(() => {
                  return refs()
                    .map((ref) => part().get(ref.messageID)?.get(ref.partID))
                    .filter((item): item is PartType => !!item)
                })
                const allToolsList = createMemo(() => {
                  return allPartsList().filter((item): item is ToolPart => item.type === "tool")
                })
                const stats = createMemo(() => {
                  return statsOf(allToolsList())
                })
                return (
                  <Show when={allPartsList().length > 0}>
                    <ContextTools
                      running={() => stats().running}
                      generating={() => !!props.generating}
                      span={() => stats().span}
                      count={allToolsList().length}
                      tools={allToolsList()}
                    >
                      <div data-component="context-tool-batch">
                        <For each={refs()}>
                          {(ref) => {
                            const message = createMemo(() => msgs().get(ref.messageID))
                            const item = createMemo(() => part().get(ref.messageID)?.get(ref.partID))
                            return (
                              <Show when={message() && item()}>
                                <Part
                                  part={item()!}
                                  message={message()!}
                                  showAssistantCopyPartID={props.showAssistantCopyPartID}
                                  turnDurationMs={props.turnDurationMs}
                                  defaultOpen={partDefaultOpen(
                                    item()!,
                                    props.shellToolDefaultOpen,
                                    props.editToolDefaultOpen,
                                  )}
                                />
                              </Show>
                            )
                          }}
                        </For>
                      </div>
                    </ContextTools>
                  </Show>
                )
              })()}
            </Show>
          )
        })()}
      </Match>
      <Match when={entryType() === "part"}>
        {(() => {
          const message = createMemo(() => {
            const entry = props.group
            if (entry.type !== "part") return
            return msgs().get(entry.ref.messageID)
          })
          const item = createMemo(() => {
            const entry = props.group
            if (entry.type !== "part") return
            return part().get(entry.ref.messageID)?.get(entry.ref.partID)
          })

          return (
            <Show when={message()}>
              <Show when={item()}>
                <Part
                  part={item()!}
                  message={message()!}
                  showAssistantCopyPartID={props.showAssistantCopyPartID}
                  turnDurationMs={props.turnDurationMs}
                  defaultOpen={partDefaultOpen(item()!, props.shellToolDefaultOpen, props.editToolDefaultOpen)}
                />
              </Show>
            </Show>
          )
        })()}
      </Match>
    </Switch>
  )
}

export function AssistantParts(props: {
  messages: AssistantMessage[]
  showAssistantCopyPartID?: string | null
  turnDurationMs?: number
  working?: boolean
  showReasoningSummaries?: boolean
  shellToolDefaultOpen?: boolean
  editToolDefaultOpen?: boolean
}) {
  const data = useData()
  const emptyParts: PartType[] = []
  const grouped = createMemo(
    () =>
      groupAssistantDisplayParts(
        assistantDisplayPartEntries({
          messages: props.messages,
          getParts: (messageID) => list(data.store.part?.[messageID], emptyParts),
          showReasoningSummaries: props.showReasoningSummaries ?? true,
        }),
        isContextGroupTool,
        { live: !!props.working },
      ),
    [] as PartGroup[],
    { equals: sameAssistantPartGroups },
  )

  return (
    <Index each={grouped()}>
      {(group, index) => (
        <AssistantPartGroupView
          group={group()}
          messages={props.messages}
          showAssistantCopyPartID={props.showAssistantCopyPartID}
          turnDurationMs={props.turnDurationMs}
          generating={!!props.working && index === grouped().length - 1}
          shellToolDefaultOpen={props.shellToolDefaultOpen}
          editToolDefaultOpen={props.editToolDefaultOpen}
        />
      )}
    </Index>
  )
}

function isContextGroupTool(part: PartType): part is ToolPart {
  return part.type === "tool" && CONTEXT_GROUP_TOOLS.has(part.tool)
}

function ExaOutput(props: { output?: string }) {
  const links = createMemo(() => urls(props.output))

  return (
    <Show when={links().length > 0}>
      <div data-component="exa-tool-output">
        <div data-slot="exa-tool-links">
          <For each={links()}>
            {(url) => (
              <a
                data-slot="exa-tool-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {url}
              </a>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}

export function registerPartComponent(type: string, component: PartComponent) {
  PART_MAPPING[type] = component
}

export function Message(props: MessageProps) {
  return (
    <Switch>
      <Match when={props.message.role === "user" && props.message}>
        {(userMessage) => (
          <UserMessageDisplay message={userMessage() as UserMessage} parts={props.parts} actions={props.actions} />
        )}
      </Match>
      <Match when={props.message.role === "assistant" && props.message}>
        {(assistantMessage) => (
          <AssistantMessageDisplay
            message={assistantMessage() as AssistantMessage}
            parts={props.parts}
            showAssistantCopyPartID={props.showAssistantCopyPartID}
            showReasoningSummaries={props.showReasoningSummaries}
          />
        )}
      </Match>
    </Switch>
  )
}

export function AssistantMessageDisplay(props: {
  message: AssistantMessage
  parts: PartType[]
  showAssistantCopyPartID?: string | null
  showReasoningSummaries?: boolean
}) {
  const grouped = createMemo(
    () =>
      groupAssistantDisplayParts(
        assistantDisplayPartEntries({
          messages: [props.message],
          getParts: () => props.parts,
          showReasoningSummaries: props.showReasoningSummaries ?? true,
        }),
        isContextGroupTool,
        { live: typeof props.message.time.completed !== "number" },
      ),
    [] as PartGroup[],
    { equals: sameAssistantPartGroups },
  )

  return (
    <Index each={grouped()}>
      {(group, index) => (
        <AssistantPartGroupView
          group={group()}
          messages={[props.message]}
          getParts={() => props.parts}
          showAssistantCopyPartID={props.showAssistantCopyPartID}
          generating={typeof props.message.time.completed !== "number" && index === grouped().length - 1}
        />
      )}
    </Index>
  )
}

export function UserMessageDisplay(props: { message: UserMessage; parts: PartType[]; actions?: UserActions }) {
  const data = useData()
  const dialog = useDialog()
  const i18n = useI18n()
  const [state, setState] = createStore({
    copied: false,
    busy: false,
  })
  const copied = () => state.copied
  const busy = () => state.busy

  const textPart = createMemo(
    () => props.parts?.find((p) => p.type === "text" && !(p as TextPart).synthetic) as TextPart | undefined,
  )

  const text = createMemo(() => textPart()?.text || "")

  const files = createMemo(() => (props.parts?.filter((p) => p.type === "file") as FilePart[]) ?? [])

  const attachments = createMemo(() => files().filter(attached))

  const inlineFiles = createMemo(() => files().filter(inline))

  const agents = createMemo(() => (props.parts?.filter((p) => p.type === "agent") as AgentPart[]) ?? [])

  const model = createMemo(() => {
    const providerID = props.message.model?.providerID
    const modelID = props.message.model?.modelID
    if (!providerID || !modelID) return ""
    const match = data.store.provider?.all?.find((p) => p.id === providerID)
    return match?.models?.[modelID]?.name ?? modelID
  })
  const timefmt = createMemo(() => new Intl.DateTimeFormat(i18n.locale(), { timeStyle: "short" }))

  const stamp = createMemo(() => {
    const created = props.message.time?.created
    if (typeof created !== "number") return ""
    return timefmt().format(created)
  })

  const metaHead = createMemo(() => {
    const agent = props.message.agent
    const items = [agent ? agent[0]?.toUpperCase() + agent.slice(1) : "", model()]
    return items.filter((x) => !!x).join("\u00A0\u00B7\u00A0")
  })

  const metaTail = stamp

  const openImagePreview = (url: string, alt?: string) => {
    dialog.show(() => <ImagePreview src={url} alt={alt} />)
  }

  const handleCopy = async () => {
    const content = text()
    if (!content) return
    await navigator.clipboard.writeText(content)
    setState("copied", true)
    setTimeout(() => setState("copied", false), 2000)
  }

  const revert = () => {
    const act = props.actions?.revert
    if (!act || busy()) return
    setState("busy", true)
    void Promise.resolve()
      .then(() =>
        act({
          sessionID: props.message.sessionID,
          messageID: props.message.id,
        }),
      )
      .finally(() => setState("busy", false))
  }

  return (
    <div data-component="user-message">
      <Show when={attachments().length > 0}>
        <div data-slot="user-message-attachments">
          <For each={attachments()}>
            {(file) => {
              const type = kind(file)
              const name = file.filename ?? i18n.t("ui.message.attachment.alt")

              return (
                <div
                  data-slot="user-message-attachment"
                  data-type={type}
                  data-clickable={type === "image" ? "true" : undefined}
                  title={type === "file" ? name : undefined}
                  onClick={() => {
                    if (type === "image") openImagePreview(file.url, name)
                  }}
                >
                  <Show
                    when={type === "image"}
                    fallback={
                      <div data-slot="user-message-attachment-file">
                        <FileIcon node={{ path: name, type: "file" }} />
                        <span data-slot="user-message-attachment-name">{name}</span>
                      </div>
                    }
                  >
                    <img data-slot="user-message-attachment-image" src={file.url} alt={name} />
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
      <Show when={text()}>
        <>
          <div data-slot="user-message-body">
            <div data-slot="user-message-text">
              <HighlightedText text={text()} references={inlineFiles()} agents={agents()} />
            </div>
          </div>
          <div data-slot="user-message-copy-wrapper">
            <Show when={metaHead() || metaTail()}>
              <span data-slot="user-message-meta-wrap">
                <Show when={metaHead()}>
                  <span data-slot="user-message-meta" class="text-12-regular text-text-weak cursor-default">
                    {metaHead()}
                  </span>
                </Show>
                <Show when={metaHead() && metaTail()}>
                  <span data-slot="user-message-meta-sep" class="text-12-regular text-text-weak cursor-default">
                    {"\u00A0\u00B7\u00A0"}
                  </span>
                </Show>
                <Show when={metaTail()}>
                  <span data-slot="user-message-meta-tail" class="text-12-regular text-text-weak cursor-default">
                    {metaTail()}
                  </span>
                </Show>
              </span>
            </Show>
            <Show when={props.actions?.revert}>
              <Tooltip value={i18n.t("ui.message.revertMessage")} placement="top" gutter={4}>
                <IconButton
                  icon="reset"
                  size="normal"
                  variant="ghost"
                  disabled={!!busy()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation()
                    revert()
                  }}
                  aria-label={i18n.t("ui.message.revertMessage")}
                />
              </Tooltip>
            </Show>
            <Tooltip
              value={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyMessage")}
              placement="top"
              gutter={4}
            >
              <IconButton
                icon={copied() ? "check" : "copy"}
                size="normal"
                variant="ghost"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation()
                  handleCopy()
                }}
                aria-label={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyMessage")}
              />
            </Tooltip>
          </div>
        </>
      </Show>
    </div>
  )
}

type HighlightSegment = { text: string; type?: "file" | "agent" }

function HighlightedText(props: { text: string; references: FilePart[]; agents: AgentPart[] }) {
  const segments = createMemo(() => {
    const text = props.text

    const allRefs: { start: number; end: number; type: "file" | "agent" }[] = [
      ...props.references
        .filter((r) => r.source?.text?.start !== undefined && r.source?.text?.end !== undefined)
        .map((r) => ({ start: r.source!.text!.start, end: r.source!.text!.end, type: "file" as const })),
      ...props.agents
        .filter((a) => a.source?.start !== undefined && a.source?.end !== undefined)
        .map((a) => ({ start: a.source!.start, end: a.source!.end, type: "agent" as const })),
    ].sort((a, b) => a.start - b.start)

    const result: HighlightSegment[] = []
    let lastIndex = 0

    for (const ref of allRefs) {
      if (ref.start < lastIndex) continue

      if (ref.start > lastIndex) {
        result.push({ text: text.slice(lastIndex, ref.start) })
      }

      result.push({ text: text.slice(ref.start, ref.end), type: ref.type })
      lastIndex = ref.end
    }

    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex) })
    }

    return result
  })

  return <For each={segments()}>{(segment) => <span data-highlight={segment.type}>{segment.text}</span>}</For>
}

export function Part(props: MessagePartProps) {
  const component = createMemo(() => PART_MAPPING[props.part.type])
  return (
    <Show when={component()}>
      <Dynamic
        component={component()}
        part={props.part}
        message={props.message}
        hideDetails={props.hideDetails}
        defaultOpen={props.defaultOpen}
        showAssistantCopyPartID={props.showAssistantCopyPartID}
        turnDurationMs={props.turnDurationMs}
      />
    </Show>
  )
}

export interface ToolProps {
  input: Record<string, any>
  metadata: Record<string, any>
  tool: string
  output?: string
  status?: string
  durationMs?: number
  hideDetails?: boolean
  defaultOpen?: boolean
  forceOpen?: boolean
  locked?: boolean
}

export type ToolComponent = Component<ToolProps>

const state: Record<
  string,
  {
    name: string
    render?: ToolComponent
  }
> = {}

export function registerTool(input: { name: string; render?: ToolComponent }) {
  state[input.name] = input
  return input
}

export function getTool(name: string) {
  return state[name]?.render
}

export const ToolRegistry = {
  register: registerTool,
  render: getTool,
}

function ToolFileAccordion(props: { path: string; actions?: JSX.Element; children: JSX.Element }) {
  const value = createMemo(() => props.path || "tool-file")

  return (
    <Accordion
      multiple
      data-scope="apply-patch"
      style={{ "--sticky-accordion-offset": "40px" }}
      defaultValue={[value()]}
    >
      <Accordion.Item value={value()}>
        <StickyAccordionHeader>
          <Accordion.Trigger>
            <div data-slot="apply-patch-trigger-content">
              <div data-slot="apply-patch-file-info">
                <FileIcon node={{ path: props.path, type: "file" }} />
                <div data-slot="apply-patch-file-name-container">
                  <Show when={props.path.includes("/")}>
                    <span data-slot="apply-patch-directory">{`\u202A${getDirectory(props.path)}\u202C`}</span>
                  </Show>
                  <span data-slot="apply-patch-filename">{getFilename(props.path)}</span>
                </div>
              </div>
              <div data-slot="apply-patch-trigger-actions">
                {props.actions}
                <Icon name="chevron-grabber-vertical" size="small" />
              </div>
            </div>
          </Accordion.Trigger>
        </StickyAccordionHeader>
        <Accordion.Content>{props.children}</Accordion.Content>
      </Accordion.Item>
    </Accordion>
  )
}

PART_MAPPING["tool"] = function ToolPartDisplay(props) {
  const data = useData()
  const i18n = useI18n()
  const part = () => props.part as ToolPart
  if (part().tool === "todowrite") return null

  const hideQuestion = createMemo(
    () => part().tool === "question" && (part().state.status === "pending" || part().state.status === "running"),
  )

  const emptyInput: Record<string, any> = {}
  const emptyMetadata: Record<string, any> = {}

  const input = () => part().state?.input ?? emptyInput
  // @ts-expect-error
  const partMetadata = () => part().state?.metadata ?? emptyMetadata
  const taskId = createMemo(() => {
    if (part().tool !== "task") return
    const value = partMetadata().sessionId
    if (typeof value === "string" && value) return value
  })
  const taskHref = createMemo(() => {
    if (part().tool !== "task") return
    let pathname = ""
    try {
      pathname = useLocation().pathname
    } catch {
      pathname = ""
    }
    return sessionLink(taskId(), pathname, data.sessionHref)
  })
  const taskSubtitle = createMemo(() => {
    if (part().tool !== "task") return undefined
    const value = input().description
    if (typeof value === "string" && value) return value
    return taskId()
  })

  const render = createMemo(() => ToolRegistry.render(part().tool) ?? GenericTool)
  const durationMs = createMemo(() => {
    const state = part().state
    if (state.status === "completed" || state.status === "error") {
      const start = state.time.start
      const end = "end" in state.time && typeof state.time.end === "number" ? state.time.end : start
      if (typeof start === "number" && typeof end === "number") {
        return end - start
      }
    }
    return undefined
  })

  return (
    <Show when={!hideQuestion()}>
      <div
        data-component="tool-part-wrapper"
        data-tool={part().tool}
        data-status={part().state.status ?? "completed"}
      >
        <Switch>
          <Match when={part().state.status === "error" && (part().state as any).error}>
            {(error) => {
              const cleaned = error().replace("Error: ", "")
              if (part().tool === "question" && cleaned.includes("dismissed this question")) {
                return (
                  <div style="width: 100%; display: flex; justify-content: flex-end;">
                    <span class="text-13-regular text-text-weak cursor-default">
                      {i18n.t("ui.messagePart.questions.dismissed")}
                    </span>
                  </div>
                )
              }
              return (
                <ToolErrorCard
                  tool={part().tool}
                  error={error()}
                  defaultOpen={props.defaultOpen}
                  subtitle={taskSubtitle()}
                  href={taskHref()}
                />
              )
            }}
          </Match>
          <Match when={true}>
            <Dynamic
              component={render()}
              input={input()}
              tool={part().tool}
              metadata={partMetadata()}
              // @ts-expect-error
              output={part().state.output}
              status={part().state.status}
              durationMs={durationMs()}
              hideDetails={props.hideDetails}
              defaultOpen={props.defaultOpen}
            />
          </Match>
        </Switch>
      </div>
    </Show>
  )
}

export function MessageDivider(props: { label: string }) {
  return (
    <div data-component="compaction-part">
      <div data-slot="compaction-part-divider">
        <span data-slot="compaction-part-line" />
        <span data-slot="compaction-part-label" class="text-12-regular text-text-weak">
          {props.label}
        </span>
        <span data-slot="compaction-part-line" />
      </div>
    </div>
  )
}

PART_MAPPING["compaction"] = function CompactionPartDisplay() {
  const i18n = useI18n()
  return <MessageDivider label={i18n.t("ui.messagePart.compaction")} />
}

PART_MAPPING["text"] = function TextPartDisplay(props) {
  const data = useData()
  const i18n = useI18n()
  const numfmt = createMemo(() => new Intl.NumberFormat(i18n.locale()))
  const part = () => props.part as TextPart
  const interrupted = createMemo(
    () =>
      props.message.role === "assistant" && (props.message as AssistantMessage).error?.name === "MessageAbortedError",
  )

  const model = createMemo(() => {
    if (props.message.role !== "assistant") return ""
    const message = props.message as AssistantMessage
    const match = data.store.provider?.all?.find((p) => p.id === message.providerID)
    return match?.models?.[message.modelID]?.name ?? message.modelID
  })

  const duration = createMemo(() => {
    if (props.message.role !== "assistant") return ""
    const message = props.message as AssistantMessage
    const completed = message.time.completed
    const ms =
      typeof props.turnDurationMs === "number"
        ? props.turnDurationMs
        : typeof completed === "number"
          ? completed - message.time.created
          : -1
    if (!(ms >= 0)) return ""
    const total = Math.round(ms / 1000)
    if (total < 60) return i18n.t("ui.message.duration.seconds", { count: numfmt().format(total) })
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return i18n.t("ui.message.duration.minutesSeconds", {
      minutes: numfmt().format(minutes),
      seconds: numfmt().format(seconds),
    })
  })

  const meta = createMemo(() => {
    if (props.message.role !== "assistant") return ""
    const agent = (props.message as AssistantMessage).agent
    const items = [
      agent ? agent[0]?.toUpperCase() + agent.slice(1) : "",
      model(),
      duration(),
      interrupted() ? i18n.t("ui.message.interrupted") : "",
    ]
    return items.filter((x) => !!x).join(" \u00B7 ")
  })

  const streaming = createMemo(
    () => props.message.role === "assistant" && typeof (props.message as AssistantMessage).time.completed !== "number",
  )
  const text = () => readPartText(data.store.part_text_accum_delta, part())
  const isLastTextPart = createMemo(() => {
    const last = (data.store.part?.[props.message.id] ?? [])
      .filter((item): item is TextPart => item?.type === "text" && !!item.text?.trim())
      .at(-1)
    return last?.id === part().id
  })
  const showCopy = createMemo(() => {
    if (props.message.role !== "assistant") return isLastTextPart()
    if (props.showAssistantCopyPartID === null) return false
    if (typeof props.showAssistantCopyPartID === "string") return props.showAssistantCopyPartID === part().id
    return isLastTextPart()
  })
  const [copied, setCopied] = createSignal(false)

  const handleCopy = async () => {
    const content = text()
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Show when={text()}>
      <div data-component="text-part">
        <div data-slot="text-part-body">
          <Show
            when={streaming()}
            fallback={<Markdown text={text()} cacheKey={part().id} streaming={false} />}
          >
            <PacedMarkdown text={text()} cacheKey={part().id} streaming={streaming()} />
          </Show>
        </div>
        <Show when={showCopy()}>
          <div data-slot="text-part-copy-wrapper" data-interrupted={interrupted() ? "" : undefined}>
            <Tooltip
              value={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyResponse")}
              placement="top"
              gutter={4}
            >
              <IconButton
                icon={copied() ? "check" : "copy"}
                size="normal"
                variant="ghost"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCopy}
                aria-label={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyResponse")}
              />
            </Tooltip>
            <Show when={meta()}>
              <span data-slot="text-part-meta" class="text-12-regular text-text-weak cursor-default">
                {meta()}
              </span>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  )
}

PART_MAPPING["reasoning"] = function ReasoningPartDisplay(props) {
  const data = useData()
  const i18n = useI18n()
  const part = () => props.part as ReasoningPart
  const streaming = createMemo(
    () => props.message.role === "assistant" && typeof (props.message as AssistantMessage).time.completed !== "number",
  )
  const rawText = () => readPartText(data.store.part_text_accum_delta, part())
  const display = createMemo(() => getReasoningDisplayState(rawText(), { streaming: streaming() }))
  const displayKeys = createMemo(() => {
    if (!display().visible) return []
    return [display().defaultOpen ? "open" : "collapsed"]
  })
  const text = () => display().text

  const durationMs = createMemo(() => {
    if (streaming()) return undefined
    const start = part().time?.start
    const end = part().time?.end
    if (typeof start === "number" && typeof end === "number") return end - start
    if (props.turnDurationMs !== undefined) return props.turnDurationMs
    return undefined
  })

  const seconds = createMemo(() => {
    const ms = durationMs()
    if (ms === undefined) return undefined
    return Math.max(1, Math.round(ms / 1000))
  })

  const title = createMemo(() => {
    if (streaming()) return i18n.t("ui.sessionTurn.status.thinking")
    const s = seconds()
    return s ? `Thought for ${s} second${s === 1 ? "" : "s"}` : "Thought process"
  })

  return (
    <For each={displayKeys()}>
      {() => (
        <div data-component="reasoning-part">
          <BasicTool
            icon="brain"
            status={streaming() ? "running" : "completed"}
            defaultOpen={display().defaultOpen}
            autoOpenOnPending={display().autoOpenOnPending}
            trigger={{
              title: title(),
            }}
          >
            <div data-component="tool-output" data-scrollable>
              <Show when={streaming()} fallback={<Markdown text={text()} cacheKey={part().id} streaming={false} />}>
                <PacedMarkdown text={text()} cacheKey={part().id} streaming={streaming()} />
              </Show>
            </div>
          </BasicTool>
        </div>
      )}
    </For>
  )
}

ToolRegistry.register({
  name: "read",
  render(props) {
    const data = useData()
    const i18n = useI18n()
    const args: string[] = []
    if (props.input.offset) args.push("offset=" + props.input.offset)
    if (props.input.limit) args.push("limit=" + props.input.limit)
    const pathLine = createMemo(() => {
      const fp = props.input.filePath
      if (typeof fp !== "string" || !fp) return ""
      return relativizeProjectPath(fp, data.directory) || fp
    })
    const loaded = createMemo(() => {
      if (props.status !== "completed") return []
      const value = props.metadata.loaded
      if (!value || !Array.isArray(value)) return []
      return value.filter((p): p is string => typeof p === "string")
    })
    return (
      <>
        <BasicTool
          {...props}
          icon="glasses"
          filePath={props.input.filePath}
          trigger={{
            title: "Read",
            subtitle: pathLine(),
            args,
          }}
        />
        <For each={loaded()}>
          {(filepath) => (
            <div data-component="tool-loaded-file">
              <Icon name="enter" size="small" />
              <span>
                {i18n.t("ui.tool.loaded")} {relativizeProjectPath(filepath, data.directory)}
              </span>
            </div>
          )}
        </For>
      </>
    )
  },
})

ToolRegistry.register({
  name: "list",
  render(props) {
    const path = props.input.path || "/"
    return (
      <BasicTool
        {...props}
        icon="bullet-list"
        trigger={{ title: "Listed", subtitle: path }}
      >
        <Show when={props.output}>
          <div data-component="tool-output" data-scrollable>
            <Markdown text={props.output!} />
          </div>
        </Show>
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "glob",
  render(props) {
    const pat = props.input.pattern
    const sub = typeof pat === "string" && pat ? pat : props.input.path || "/"
    return (
      <BasicTool
        {...props}
        icon="magnifying-glass-menu"
        trigger={{
          title: "Searched",
          subtitle: sub,
        }}
      >
        <Show when={props.output}>
          <div data-component="tool-output" data-scrollable>
            <Markdown text={props.output!} />
          </div>
        </Show>
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "grep",
  render(props) {
    const detail = createMemo(() => {
      const bits: string[] = []
      if (props.input.pattern) bits.push('"' + props.input.pattern + '"')
      const base = props.input.path
      const dir = typeof base === "string" && base && base !== "/" ? base : ""
      if (dir) bits.push("in " + dir)
      if (props.input.include) bits.push("glob: " + props.input.include)
      if (!bits.length) return ""
      return bits.join(", ")
    })
    return (
      <BasicTool
        {...props}
        icon="magnifying-glass-menu"
        trigger={{
          title: "Searched",
          subtitle: detail(),
        }}
      >
        <Show when={props.output}>
          <div data-component="tool-output" data-scrollable>
            <Markdown text={props.output!} />
          </div>
        </Show>
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "webfetch",
  render(props) {
    const pending = createMemo(() => props.status === "pending" || props.status === "running")
    const url = createMemo(() => {
      const value = props.input.url
      if (typeof value !== "string") return ""
      return value
    })
    return (
      <BasicTool
        {...props}
        hideDetails
        icon="window-cursor"
        trigger={
          <div data-slot="basic-tool-tool-info-structured">
            <div data-slot="basic-tool-tool-info-main">
              <span data-slot="basic-tool-tool-title">
                <TextShimmer text={pending() ? "Fetching" : "Fetched"} active={pending()} />
              </span>
              <Show when={!pending() && url()}>
                <a
                  data-slot="basic-tool-tool-subtitle"
                  class="clickable subagent-link"
                  href={url()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {url()}
                </a>
              </Show>
            </div>
            <Show when={!pending() && url()}>
              <div data-component="tool-action">
                <Icon name="square-arrow-top-right" size="small" />
              </div>
            </Show>
          </div>
        }
      />
    )
  },
})

ToolRegistry.register({
  name: "websearch",
  render(props) {
    const query = createMemo(() => {
      const value = props.input.query
      if (typeof value !== "string") return ""
      return value
    })

    return (
      <BasicTool
        {...props}
        icon="window-cursor"
        trigger={{
          title: "Searched web",
          subtitle: query(),
          subtitleClass: "exa-tool-query",
        }}
      >
        <ExaOutput output={props.output} />
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "browser",
  render(props) {
    const pending = createMemo(() => props.status === "pending" || props.status === "running")
    const action = createMemo(() => {
      const value = props.input.action ?? props.metadata.action
      return typeof value === "string" && value ? value : "state"
    })
    const title = createMemo(() => {
      if (pending()) return "Using browser"
      switch (action()) {
        case "open":
          return "Opened browser"
        case "navigate":
          return "Navigated browser"
        case "show":
          return "Showed browser"
        case "hide":
          return "Hid browser"
        case "close":
          return "Closed browser"
        case "state":
          return "Checked browser"
        case "click":
          return "Clicked browser"
        case "type":
          return "Typed in browser"
        case "press":
          return "Pressed browser key"
        case "scroll":
          return "Scrolled browser"
        case "back":
          return "Went back"
        case "forward":
          return "Went forward"
        case "reload":
          return "Reloaded browser"
        case "extract":
          return "Extracted browser"
        case "evaluate":
          return "Evaluated browser"
        case "screenshot":
          return "Captured browser"
        default:
          return "Used browser"
      }
    })
    const subtitle = createMemo(() => {
      const values = [
        props.input.url,
        props.metadata.title,
        props.metadata.url,
        props.input.ref,
        props.input.key,
        props.input.text,
      ]
      return values.find((value): value is string => typeof value === "string" && value.length > 0)
    })

    return (
      <BasicTool
        {...props}
        icon="browser"
        trigger={{
          title: title(),
          subtitle: subtitle(),
        }}
      >
        <Show when={props.output}>
          <div data-component="tool-output" data-scrollable>
            <Markdown text={props.output!} />
          </div>
        </Show>
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "codesearch",
  render(props) {
    const query = createMemo(() => {
      const value = props.input.query
      if (typeof value !== "string") return ""
      return value
    })

    return (
      <BasicTool
        {...props}
        icon="code"
        trigger={{
          title: "Searched code",
          subtitle: query(),
          subtitleClass: "exa-tool-query",
        }}
      >
        <ExaOutput output={props.output} />
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "task",
  render(props) {
    const data = useData()
    const i18n = useI18n()
    let location: any
    try {
      location = useLocation()
    } catch {
      location = { pathname: "" }
    }
    const childSessionId = createMemo(() => {
      const value = props.metadata.sessionId
      if (typeof value === "string" && value) return value
      return taskSession(props.input, location.pathname, data.store.session, data.store.agent)
    })
    const agent = createMemo(() => taskAgent(props.input.subagent_type, data.store.agent))
    const title = createMemo(() => agent().name ?? i18n.t("ui.tool.agent.default"))
    const subtitle = createMemo(() => {
      const value = props.input.description
      if (typeof value === "string" && value) return value
      return childSessionId()
    })
    const running = createMemo(() => props.status === "pending" || props.status === "running")

    const href = createMemo(() => sessionLink(childSessionId(), location.pathname, data.sessionHref))
    const clickable = createMemo(() => !!(childSessionId() && (data.navigateToSession || href())))

    const open = () => {
      const id = childSessionId()
      if (!id) return
      if (data.navigateToSession) {
        data.navigateToSession(id)
        return
      }
      const value = href()
      if (value) window.location.assign(value)
    }

    const navigate = (event: MouseEvent) => {
      if (!data.navigateToSession) return
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      event.preventDefault()
      open()
    }

    return (
      <div class="py-1 flex items-center">
        <Show 
          when={clickable()} 
          fallback={
            <div class="flex items-center gap-1.5 border border-border-weak-base bg-surface-raised-base rounded-full px-2.5 py-1 text-[13px] font-medium w-fit">
              <Show when={running()} fallback={<Icon name="task" size="small" class="text-icon-agent-base" />}>
                <span class="w-[14px] h-[14px] flex items-center justify-center">
                  <DotsSpinner class="text-[14px] leading-none text-icon-interactive-base font-mono" />
                </span>
              </Show>
              <span class="text-text-interactive-base">{title()}</span>
              <Show when={subtitle()}>
                <span class="text-text-strong font-normal truncate max-w-[300px]">{subtitle()}</span>
              </Show>
            </div>
          }
        >
          <a
            href={href()}
            onClick={navigate}
            class="group flex items-center gap-1.5 border border-border-weak-base bg-surface-raised-base hover:bg-surface-raised-base-hover hover:border-border transition-colors rounded-full pl-2.5 pr-1.5 py-1 text-[13px] font-medium w-fit cursor-pointer"
          >
            <Show when={running()} fallback={<Icon name="task" size="small" class="text-icon-agent-base" />}>
              <span class="w-[14px] h-[14px] flex items-center justify-center">
                <DotsSpinner class="text-[14px] leading-none text-icon-interactive-base font-mono" />
              </span>
            </Show>
            <span class="text-text-interactive-base transition-colors group-hover:text-text-interactive-base">
              {title()}
            </span>
            <Show when={subtitle()}>
              <span class="text-text-strong font-normal truncate max-w-[300px]">{subtitle()}</span>
            </Show>
            
            <div class="flex items-center gap-1 ml-1.5 pl-2 border-l border-border-weak-base text-text-weaker group-hover:text-text-interactive-base transition-colors">
              <span class="text-[11px] font-medium">View full exploration</span>
              <Icon name="arrow-up-right" size="small" />
            </div>
          </a>
        </Show>
      </div>
    )
  },
})

ToolRegistry.register({
  name: "bash",
  render(props) {
    const i18n = useI18n()
    const pending = () => props.status === "pending" || props.status === "running"
    const sawPending = pending()
    const cmd = createMemo(() => props.input.command ?? props.metadata.command ?? "")
    const text = createMemo(() => {
      const out = stripAnsi(props.output || props.metadata.output || "")
      return `$ ${cmd()}${out ? "\n\n" + out : ""}`
    })
    const statusKind = createMemo(() => (pending() ? "running" : props.status === "error" ? "error" : "completed"))
    const statusLabel = createMemo(() => {
      if (statusKind() === "running") return "Running"
      if (statusKind() === "error") return "Failed"
      return "Success"
    })
    const [copied, setCopied] = createSignal(false)

    const handleCopy = async () => {
      const content = text()
      if (!content) return
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    return (
      <BasicTool
        {...props}
        icon="console"
        trigger={{
          title: pending() ? "Running command" : "Ran command",
        }}
      >
        <div data-component="bash-output">
          <div data-slot="bash-title">Shell</div>
          <div data-slot="bash-copy">
            <Tooltip
              value={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copy")}
              placement="top"
              gutter={4}
            >
              <IconButton
                icon={copied() ? "check" : "copy"}
                size="small"
                variant="secondary"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCopy}
                aria-label={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copy")}
              />
            </Tooltip>
          </div>
          <div data-slot="bash-scroll" data-scrollable>
            <pre data-slot="bash-pre">
              <code>{text()}</code>
            </pre>
          </div>
          <div data-slot="bash-status" data-status={statusKind()}>
            <Show when={statusKind() === "completed"}>
              <span aria-hidden="true">{"\u2713"}</span>
            </Show>
            <span>{statusLabel()}</span>
          </div>
        </div>
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "edit",
  render(props) {
    const fileComponent = useFileComponent()
    const diagnostics = createMemo(() => getDiagnostics(props.metadata.diagnostics, props.input.filePath))
    const path = createMemo(() => props.metadata?.filediff?.file || props.input.filePath || "")
    const filename = () => getFilename(props.input.filePath ?? "")
    const additions = () => props.metadata.filediff?.additions
    const deletions = () => props.metadata.filediff?.deletions
    return (
      <div data-component="edit-tool">
        <BasicTool
          {...props}
          icon="code-lines"
          defer
          filePath={props.input.filePath}
          additions={additions()}
          deletions={deletions()}
          trigger={{
            title: "Edited",
            subtitle: filename(),
          }}
        >
          <Show when={path()}>
            <ToolFileAccordion
              path={path()}
              actions={
                <Show when={props.status !== "pending" && props.status !== "running" && props.metadata.filediff}>
                  <DiffChanges changes={props.metadata.filediff!} />
                </Show>
              }
            >
              <div data-component="edit-content">
                <Dynamic
                  component={fileComponent}
                  mode="diff"
                  before={{
                    name: props.metadata?.filediff?.file || props.input.filePath,
                    contents: props.metadata?.filediff?.before || props.input.oldString,
                  }}
                  after={{
                    name: props.metadata?.filediff?.file || props.input.filePath,
                    contents: props.metadata?.filediff?.after || props.input.newString,
                  }}
                />
              </div>
            </ToolFileAccordion>
          </Show>
          <DiagnosticsDisplay diagnostics={diagnostics()} />
        </BasicTool>
      </div>
    )
  },
})

ToolRegistry.register({
  name: "write",
  render(props) {
    const fileComponent = useFileComponent()
    const diagnostics = createMemo(() => getDiagnostics(props.metadata.diagnostics, props.input.filePath))
    const path = createMemo(() => props.input.filePath || "")
    const filename = () => getFilename(props.input.filePath ?? "")
    return (
      <div data-component="write-tool">
        <BasicTool
          {...props}
          icon="code-lines"
          defer
          filePath={props.input.filePath}
          trigger={{
            title: "Edited",
            subtitle: filename(),
          }}
        >
          <Show when={props.input.content && path()}>
            <ToolFileAccordion path={path()}>
              <div data-component="write-content">
                <Dynamic
                  component={fileComponent}
                  mode="text"
                  file={{
                    name: props.input.filePath,
                    contents: props.input.content,
                    cacheKey: checksum(props.input.content),
                  }}
                  overflow="scroll"
                />
              </div>
            </ToolFileAccordion>
          </Show>
          <DiagnosticsDisplay diagnostics={diagnostics()} />
        </BasicTool>
      </div>
    )
  },
})

ToolRegistry.register({
  name: "apply_patch",
  render(props) {
    const i18n = useI18n()
    const fileComponent = useFileComponent()
    const files = createMemo(() => patchFiles(props.metadata.files))
    const pending = createMemo(() => props.status === "pending" || props.status === "running")
    const single = createMemo(() => {
      const list = files()
      if (list.length !== 1) return
      return list[0]
    })
    const [expanded, setExpanded] = createSignal<string[]>([])
    let seeded = false

    createEffect(() => {
      const list = files()
      if (list.length === 0) return
      if (seeded) return
      seeded = true
      setExpanded(list.filter((f) => f.type !== "delete").map((f) => f.filePath))
    })

    const subtitle = createMemo(() => {
      const count = files().length
      if (count === 0) return ""
      return `${count} ${i18n.t(count > 1 ? "ui.common.file.other" : "ui.common.file.one")}`
    })

    return (
      <Show
        when={single()}
        fallback={
          <div data-component="apply-patch-tool">
            <BasicTool
              {...props}
              icon="code-lines"
              defer
              trigger={{
                title: "Edited",
                subtitle: subtitle(),
              }}
            >
              <Show when={files().length > 0}>
                <Accordion
                  multiple
                  data-scope="apply-patch"
                  style={{ "--sticky-accordion-offset": "40px" }}
                  value={expanded()}
                  onChange={(value) => setExpanded(Array.isArray(value) ? value : value ? [value] : [])}
                >
                  <For each={files()}>
                    {(file) => {
                      const active = createMemo(() => expanded().includes(file.filePath))
                      const [visible, setVisible] = createSignal(false)

                      createEffect(() => {
                        if (!active()) {
                          setVisible(false)
                          return
                        }

                        requestAnimationFrame(() => {
                          if (!active()) return
                          setVisible(true)
                        })
                      })

                      return (
                        <Accordion.Item value={file.filePath} data-type={file.type}>
                          <StickyAccordionHeader>
                            <Accordion.Trigger>
                              <div data-slot="apply-patch-trigger-content">
                                <div data-slot="apply-patch-file-info">
                                  <FileIcon node={{ path: file.relativePath, type: "file" }} />
                                  <div data-slot="apply-patch-file-name-container">
                                    <Show when={file.relativePath.includes("/")}>
                                      <span data-slot="apply-patch-directory">{`\u202A${getDirectory(file.relativePath)}\u202C`}</span>
                                    </Show>
                                    <span data-slot="apply-patch-filename">{getFilename(file.relativePath)}</span>
                                  </div>
                                </div>
                                <div data-slot="apply-patch-trigger-actions">
                                  <Switch>
                                    <Match when={file.type === "add"}>
                                      <span data-slot="apply-patch-change" data-type="added">
                                        {i18n.t("ui.patch.action.created")}
                                      </span>
                                    </Match>
                                    <Match when={file.type === "delete"}>
                                      <span data-slot="apply-patch-change" data-type="removed">
                                        {i18n.t("ui.patch.action.deleted")}
                                      </span>
                                    </Match>
                                    <Match when={file.type === "move"}>
                                      <span data-slot="apply-patch-change" data-type="modified">
                                        {i18n.t("ui.patch.action.moved")}
                                      </span>
                                    </Match>
                                    <Match when={true}>
                                      <DiffChanges changes={{ additions: file.additions, deletions: file.deletions }} />
                                    </Match>
                                  </Switch>
                                  <Icon name="chevron-grabber-vertical" size="small" />
                                </div>
                              </div>
                            </Accordion.Trigger>
                          </StickyAccordionHeader>
                          <Accordion.Content>
                            <Show when={visible()}>
                              <div data-component="apply-patch-file-diff">
                                <Dynamic component={fileComponent} mode="diff" fileDiff={file.view.fileDiff} />
                              </div>
                            </Show>
                          </Accordion.Content>
                        </Accordion.Item>
                      )
                    }}
                  </For>
                </Accordion>
              </Show>
            </BasicTool>
          </div>
        }
      >
        <div data-component="apply-patch-tool">
          <BasicTool
            {...props}
            icon="code-lines"
            defer
            filePath={single()!.relativePath}
            additions={single()!.additions}
            deletions={single()!.deletions}
            trigger={{
              title: "Edited",
              subtitle: getFilename(single()!.relativePath),
            }}
          >
            <ToolFileAccordion
              path={single()!.relativePath}
              actions={
                <Switch>
                  <Match when={single()!.type === "add"}>
                    <span data-slot="apply-patch-change" data-type="added">
                      {i18n.t("ui.patch.action.created")}
                    </span>
                  </Match>
                  <Match when={single()!.type === "delete"}>
                    <span data-slot="apply-patch-change" data-type="removed">
                      {i18n.t("ui.patch.action.deleted")}
                    </span>
                  </Match>
                  <Match when={single()!.type === "move"}>
                    <span data-slot="apply-patch-change" data-type="modified">
                      {i18n.t("ui.patch.action.moved")}
                    </span>
                  </Match>
                  <Match when={true}>
                    <DiffChanges changes={{ additions: single()!.additions, deletions: single()!.deletions }} />
                  </Match>
                </Switch>
              }
            >
              <div data-component="apply-patch-file-diff">
                <Dynamic component={fileComponent} mode="diff" fileDiff={single()!.view.fileDiff} />
              </div>
            </ToolFileAccordion>
          </BasicTool>
        </div>
      </Show>
    )
  },
})

ToolRegistry.register({
  name: "todowrite",
  render(props) {
    const i18n = useI18n()
    const todos = createMemo(() => {
      const meta = props.metadata?.todos
      if (Array.isArray(meta)) return meta

      const input = props.input.todos
      if (Array.isArray(input)) return input

      return []
    })

    const subtitle = createMemo(() => {
      const list = todos()
      if (list.length === 0) return ""
      return `${list.filter((t: Todo) => t.status === "completed").length}/${list.length}`
    })

    return (
      <BasicTool
        {...props}
        defaultOpen
        icon="checklist"
        trigger={{
          title: i18n.t("ui.tool.todos"),
          subtitle: subtitle(),
        }}
      >
        <Show when={todos().length}>
          <div data-component="todos">
            <For each={todos()}>
              {(todo: Todo) => (
                <Checkbox readOnly checked={todo.status === "completed"}>
                  <span
                    data-slot="message-part-todo-content"
                    data-completed={todo.status === "completed" ? "completed" : undefined}
                  >
                    {todo.content}
                  </span>
                </Checkbox>
              )}
            </For>
          </div>
        </Show>
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "question",
  render(props) {
    const i18n = useI18n()
    const questions = createMemo(() => (props.input.questions ?? []) as QuestionInfo[])
    const answers = createMemo(() => (props.metadata.answers ?? []) as QuestionAnswer[])
    const completed = createMemo(() => answers().length > 0)

    const subtitle = createMemo(() => {
      const count = questions().length
      if (count === 0) return ""
      if (completed()) return i18n.t("ui.question.subtitle.answered", { count })
      return `${count} ${i18n.t(count > 1 ? "ui.common.question.other" : "ui.common.question.one")}`
    })

    return (
      <BasicTool
        {...props}
        defaultOpen={completed()}
        icon="bubble-5"
        trigger={{
          title: i18n.t("ui.tool.questions"),
          subtitle: subtitle(),
        }}
      >
        <Show when={completed()}>
          <div data-component="question-answers">
            <For each={questions()}>
              {(q, i) => {
                const answer = () => answers()[i()] ?? []
                return (
                  <div data-slot="question-answer-item">
                    <div data-slot="question-text">{q.question}</div>
                    <div data-slot="answer-text">{answer().join(", ") || i18n.t("ui.question.answer.none")}</div>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </BasicTool>
    )
  },
})

ToolRegistry.register({
  name: "skill",
  render(props) {
    const i18n = useI18n()
    const title = createMemo(() => props.input.name || i18n.t("ui.tool.skill"))
    const running = createMemo(() => props.status === "pending" || props.status === "running")

    const titleContent = () => <TextShimmer text={title()} active={running()} />

    const trigger = () => (
      <div data-slot="basic-tool-tool-info-structured">
        <div data-slot="basic-tool-tool-info-main">
          <span data-slot="basic-tool-tool-title" class="capitalize agent-title">
            {titleContent()}
          </span>
        </div>
      </div>
    )

    return <BasicTool icon="brain" status={props.status} trigger={trigger()} hideDetails />
  },
})
