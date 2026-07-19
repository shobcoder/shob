type ActivityParams = Record<string, string | number | boolean>

export type ActivityTranslator = (key: string, params?: ActivityParams) => string

export type ActivityMessage = {
  id: string
  role?: string
  time?: {
    created?: number
    completed?: number
  }
}

export type ActivityPart = {
  type: string
  text?: string
  tool?: string
  state?: {
    status?: string
    input?: unknown
    metadata?: unknown
    title?: string
  }
}

export type ActivityKind =
  | "working"
  | "reasoning"
  | "reading"
  | "inspecting"
  | "searching"
  | "editing"
  | "running"
  | "patching"
  | "delegating"
  | "waiting"
  | "loading"
  | "planning"
  | "responding"

export type ActivitySnapshot = {
  kind: ActivityKind
  /** Full status string for a11y / fallbacks, e.g. "Editing packages/app/foo.ts". */
  title: string
  /** Short verb for the shimmer label, e.g. "Editing". */
  verb: string
  /** File/path (or other target) shown in mono next to the verb. */
  path?: string
  /** Optional compact target (file, pattern, host) for UI secondary line. */
  detail?: string
}

const ACTIVITY_LABELS = {
  working: "Working",
  reasoning: "Reasoning",
  reading: "Reading",
  inspecting: "Inspecting",
  searching: "Searching",
  editing: "Editing",
  running: "Running",
  patching: "Patching",
  delegating: "Delegating",
  waiting: "Waiting for you",
  loading: "Loading",
  planning: "Planning",
  responding: "Writing response",
} satisfies Record<ActivityKind, string>

/** Rotating phrases when the agent is busy but not on a specific tool. */
export const WORKING_PHRASES = [
  "Thinking",
  "Planning next step",
  "Gathering thoughts",
  "Figuring this out",
  "Working on it",
  "Considering options",
  "Putting it together",
  "Almost there",
  "Looking closer",
  "Making progress",
] as const

export const SPINNER_VERBS = [...new Set([...Object.values(ACTIVITY_LABELS), ...WORKING_PHRASES])]

/** Pick a rotating working phrase (stable for ~3s buckets). */
export function rotatingWorkingPhrase(seed = Date.now()) {
  const index = Math.floor(Math.max(0, seed) / 3000) % WORKING_PHRASES.length
  return WORKING_PHRASES[index]!
}

function synthesisAfterTool(part: ActivityPart & { tool: string }): ToolActivity {
  const path =
    part.tool === "read" || part.tool === "edit" || part.tool === "write" || part.tool === "list"
      ? displayPath(filePathFromTool(part) ?? stringValue(record(part.state?.input), ["path"]), 72)
      : part.tool === "apply_patch"
        ? displayPath(patchFiles(part)[0], 72)
        : undefined
  const target = path ?? toolTarget(part)

  switch (part.tool) {
    case "read":
      return {
        verb: "Analyzing",
        path: target,
        title: withTarget("Analyzing", target),
      }
    case "edit":
      return {
        verb: "Reviewing edit",
        path: target,
        title: withTarget("Reviewing edit", target),
      }
    case "write":
      return {
        verb: "Reviewing write",
        path: target,
        title: withTarget("Reviewing write", target),
      }
    case "apply_patch":
      return {
        verb: "Reviewing patch",
        path: target,
        title: withTarget("Reviewing patch", target),
      }
    case "bash":
      return {
        verb: "Checking results",
        path: target,
        title: withTarget("Checking results", target),
      }
    case "grep":
    case "glob":
    case "codesearch":
      return {
        verb: "Reviewing search",
        path: target,
        title: withTarget("Reviewing search", target),
      }
    case "websearch":
    case "webfetch":
      return {
        verb: "Reviewing findings",
        path: target,
        title: withTarget("Reviewing findings", target),
      }
    case "list":
      return {
        verb: "Reviewing files",
        path: target,
        title: withTarget("Reviewing files", target),
      }
    case "task":
      return {
        verb: "Waiting on subagent",
        path: target,
        title: withTarget("Waiting on subagent", target),
      }
    case "skill":
      return {
        verb: "Using skill",
        path: target,
        title: withTarget("Using skill", target),
      }
    case "todowrite":
    case "todoread":
      return {
        verb: "Updating plan",
        path: target,
        title: withTarget("Updating plan", target),
      }
    default:
      return {
        verb: "Processing",
        path: target,
        title: withTarget("Processing", target),
      }
  }
}

function idleBusyActivity(parts: readonly ActivityPart[], seed?: number): ActivitySnapshot {
  if (parts.length === 0) {
    // Stable until the UI soft-rotates, so unit tests stay deterministic.
    return { kind: "working", verb: "Getting started", title: "Getting started" }
  }
  const phrase = rotatingWorkingPhrase(seed ?? parts.length * 1700 + 900)
  return { kind: "working", verb: phrase, title: phrase }
}

const INSPECT_TOOLS = new Set(["list", "glob", "grep", "codesearch", "webfetch", "websearch"])
const EDIT_TOOLS = new Set(["edit", "write", "apply_patch"])
const SEARCH_TOOLS = new Set(["glob", "grep", "codesearch", "websearch"])
const ACTIVE_STATUSES = new Set(["pending", "running"])

function cleanTopic(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function stringValue(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
}

function numberValue(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
}

function compact(value: string | undefined, max = 48) {
  if (!value) return
  const clean = cleanTopic(value)
  if (!clean) return
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function sliceAtProjectRoot(path: string) {
  const lower = path.toLowerCase()
  // Segment-boundary only so "packages/ui/src/…" is not cut at nested "src/".
  for (const marker of ["packages/", "apps/"]) {
    if (lower.startsWith(marker)) return path
    const idx = lower.indexOf(`/${marker}`)
    if (idx >= 0) return path.slice(idx + 1)
  }
  return path
}

/** Normalize absolute/relative paths for status display (keep as much path as possible). */
export function displayPath(path: string | undefined, max = 72) {
  if (!path) return
  let clean = path.replace(/\\/g, "/").replace(/\/+$/g, "").trim()
  if (!clean) return

  const absolute = /^[A-Za-z]:\//.test(clean) || clean.startsWith("/") || clean.includes("/Users/") || clean.includes("/home/")
  // Drop Windows drive / leading slash noise for readability.
  clean = clean.replace(/^[A-Za-z]:\//, "")
  clean = clean.replace(/^\/+/, "")

  // Absolute paths: pull down to monorepo-ish roots when present.
  if (absolute) clean = sliceAtProjectRoot(clean)

  const parts = clean.split("/").filter(Boolean)
  if (parts.length === 0) return

  const full = parts.join("/")
  if (full.length <= max) return full

  // Keep the tail of the path so the filename + parents stay visible.
  let out = parts[parts.length - 1]!
  for (let i = parts.length - 2; i >= 0; i--) {
    const next = `${parts[i]}/${out}`
    if (next.length + 1 > max) break
    out = next
  }
  return out === full ? out : `…/${out}`
}

/** Short label for crowded multi-item summaries. */
function fileLabel(path: string | undefined, max = 48) {
  return displayPath(path, max)
}

function filePathFromTool(part: ActivityPart & { tool: string }) {
  const input = record(part.state?.input)
  const metadata = record(part.state?.metadata)
  return (
    stringValue(input, ["filePath", "path", "file", "filename", "target"]) ??
    stringValue(metadata, ["filePath", "path", "file", "filename", "filepath"])
  )
}

function host(url: string | undefined) {
  if (!url) return
  try {
    const parsed = new URL(url)
    return compact(parsed.hostname + (parsed.pathname === "/" ? "" : parsed.pathname), 40)
  } catch {
    return compact(url, 40)
  }
}

function withTarget(label: string, target: string | undefined) {
  return target ? `${label} ${target}` : label
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

function fileCount(value: unknown) {
  if (Array.isArray(value)) return value.length
  return 0
}

function humanizeTool(name: string) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
}

/** Structured topic only (headings / bold-only lines) — not arbitrary first lines. */
export function extractReasoningTopic(text: string) {
  const markdown = text.replace(/\r\n?/g, "\n")

  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (html?.[1]) {
    const value = cleanTopic(html[1].replace(/<[^>]+>/g, " "))
    if (value) return value
  }

  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m)
  if (atx?.[1]) {
    const value = cleanTopic(atx[1])
    if (value) return value
  }

  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m)
  if (setext?.[1]) {
    const value = cleanTopic(setext[1])
    if (value) return value
  }

  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m)
  if (strong?.[1]) {
    const value = cleanTopic(strong[1])
    if (value) return value
  }
}

function isTool(part: ActivityPart): part is ActivityPart & { tool: string } {
  return part.type === "tool" && typeof part.tool === "string"
}

function toolStatus(part: ActivityPart) {
  return typeof part.state?.status === "string" ? part.state.status : undefined
}

function isActiveTool(part: ActivityPart & { tool: string }) {
  const status = toolStatus(part)
  return !status || ACTIVE_STATUSES.has(status)
}

export function activityLabel(kind: ActivityKind | undefined = "working") {
  return ACTIVITY_LABELS[kind]
}

export function activityKindForPart(part: ActivityPart | undefined): ActivityKind | undefined {
  if (!part) return

  if (isTool(part)) {
    switch (part.tool) {
      case "read":
        return "reading"
      case "list":
        return "inspecting"
      case "glob":
      case "grep":
      case "codesearch":
      case "websearch":
        return "searching"
      case "webfetch":
        return "inspecting"
      case "bash":
        return "running"
      case "edit":
      case "write":
        return "editing"
      case "apply_patch":
        return "patching"
      case "task":
        return "delegating"
      case "question":
        return "waiting"
      case "skill":
        return "loading"
      case "todowrite":
      case "todoread":
        return "planning"
      default:
        return "working"
    }
  }

  if (part.type === "reasoning" && part.text?.trim()) return "reasoning"
  if (part.type === "text" && part.text?.trim()) return "responding"
}

export function activityKindForVisibleParts(parts: readonly ActivityPart[]): ActivityKind {
  const tools = parts.filter(isTool)
  const activeTools = tools.filter(isActiveTool)
  const focus = activeTools.length > 0 ? activeTools : tools
  const latestTool = focus.at(-1)

  if (latestTool) {
    const inspectOnly = focus.every((part) => part.tool === "read" || INSPECT_TOOLS.has(part.tool))
    if (latestTool.tool === "read" && focus.length > 1 && inspectOnly) return "inspecting"
    return activityKindForPart(latestTool) ?? "working"
  }

  for (let index = parts.length - 1; index >= 0; index--) {
    const kind = activityKindForPart(parts[index])
    if (kind) return kind
  }

  return "working"
}

function patchFiles(part: ActivityPart & { tool: string }) {
  const input = record(part.state?.input)
  const metadata = record(part.state?.metadata)
  const raw = input.files ?? metadata.files
  if (!Array.isArray(raw)) return [] as string[]
  return raw.flatMap((item) => {
    if (typeof item === "string") return [item]
    const row = record(item)
    const path = stringValue(row, ["path", "filePath", "file", "filename"])
    return path ? [path] : []
  })
}

function toolTarget(part: ActivityPart & { tool: string }) {
  const input = record(part.state?.input)
  const metadata = record(part.state?.metadata)
  // Prefer live title from tool renderer when present.
  const title = typeof part.state?.title === "string" ? compact(part.state.title, 54) : undefined

  switch (part.tool) {
    case "read":
    case "edit":
    case "write":
      return displayPath(filePathFromTool(part), 72) ?? title
    case "list":
      return displayPath(stringValue(input, ["path"]) ?? stringValue(metadata, ["path"]), 64) ?? title
    case "glob":
      return compact(stringValue(input, ["pattern", "glob"]), 52) ?? title
    case "grep": {
      const pattern = compact(stringValue(input, ["pattern", "query"]), 40)
      const path = displayPath(stringValue(input, ["path", "include"]), 36)
      if (pattern && path) return compact(`${pattern} in ${path}`, 64)
      return pattern ?? path ?? title
    }
    case "codesearch":
    case "websearch":
      return compact(stringValue(input, ["query", "q", "search"]), 52) ?? title
    case "webfetch":
      return host(stringValue(input, ["url", "href"])) ?? title
    case "bash": {
      const description = compact(stringValue(input, ["description"]), 54)
      if (description) return description
      const command = stringValue(input, ["command", "cmd"])
      if (!command) return title
      // Drop noisy wrappers / multi-line tails.
      const first = command.split(/\r?\n/).find((line) => line.trim())?.trim() ?? command
      return compact(first.replace(/\s+/g, " "), 54)
    }
    case "apply_patch": {
      const files = patchFiles(part)
      if (files.length === 1) return displayPath(files[0], 72)
      if (files.length > 1) return plural(files.length, "file")
      const count = fileCount(input.files) || fileCount(metadata.files)
      return count > 0 ? plural(count, "file") : title
    }
    case "task":
      return compact(stringValue(input, ["description", "prompt", "name"]), 54) ?? title
    case "skill":
      return compact(stringValue(input, ["name", "skill", "id"]), 40) ?? title
    case "todowrite":
    case "todoread": {
      const todos = input.todos ?? metadata.todos
      const count = fileCount(todos)
      if (count > 0) return plural(count, "task")
      return title
    }
    default:
      return (
        displayPath(filePathFromTool(part), 72) ??
        title ??
        compact(stringValue(input, ["query", "pattern", "description", "name"]), 46)
      )
  }
}

type ToolActivity = {
  verb: string
  path?: string
  title: string
}

function singleToolActivity(part: ActivityPart & { tool: string }): ToolActivity {
  const target = toolTarget(part)

  switch (part.tool) {
    case "read":
      return { verb: "Reading", path: target, title: withTarget("Reading", target) }
    case "list":
      return { verb: "Listing", path: target, title: withTarget("Listing", target) }
    case "glob":
      return { verb: "Finding", path: target, title: withTarget("Finding", target) }
    case "grep":
      return { verb: "Searching", path: target, title: withTarget("Searching", target) }
    case "codesearch":
      return {
        verb: "Searching code",
        path: target,
        title: target ? `Searching code for ${target}` : "Searching code",
      }
    case "webfetch":
      return { verb: "Fetching", path: target, title: withTarget("Fetching", target) }
    case "websearch":
      return {
        verb: "Searching web",
        path: target,
        title: target ? `Searching web for ${target}` : "Searching web",
      }
    case "bash":
      return { verb: "Running", path: target, title: withTarget("Running", target) }
    case "edit":
      return { verb: "Editing", path: target, title: withTarget("Editing", target) }
    case "write":
      return { verb: "Writing", path: target, title: withTarget("Writing", target) }
    case "apply_patch": {
      const files = patchFiles(part)
      if (files.length === 1) {
        const one = displayPath(files[0], 72)
        return { verb: "Patching", path: one, title: withTarget("Patching", one) }
      }
      return { verb: "Patching", path: target, title: withTarget("Patching", target) }
    }
    case "task":
      return { verb: "Delegating", path: target, title: withTarget("Delegating", target) }
    case "question":
      return { verb: "Waiting for your answer", title: "Waiting for your answer" }
    case "skill":
      return { verb: "Loading skill", path: target, title: withTarget("Loading skill", target) }
    case "todowrite":
      return { verb: "Updating todos", path: target, title: withTarget("Updating todos", target) }
    case "todoread":
      return { verb: "Checking todos", path: target, title: withTarget("Checking todos", target) }
    default: {
      const verb = humanizeTool(part.tool)
      return { verb, path: target, title: withTarget(verb, target) }
    }
  }
}

function uniquePaths(tools: readonly (ActivityPart & { tool: string })[]) {
  const seen = new Set<string>()
  for (const tool of tools) {
    const path =
      tool.tool === "read" || tool.tool === "edit" || tool.tool === "write"
        ? displayPath(filePathFromTool(tool), 72)
        : tool.tool === "apply_patch"
          ? displayPath(patchFiles(tool)[0], 72)
          : toolTarget(tool)
    if (path) seen.add(path)
  }
  return [...seen]
}

function uniqueTargets(tools: readonly (ActivityPart & { tool: string })[]) {
  const seen = new Set<string>()
  for (const tool of tools) {
    const target = toolTarget(tool)
    if (target) seen.add(target)
  }
  return [...seen]
}

function groupedToolActivity(tools: readonly (ActivityPart & { tool: string })[]): ToolActivity {
  if (tools.length === 0) return { verb: "Working", title: "Working" }
  if (tools.length === 1) return singleToolActivity(tools[0]!)

  const latest = tools.at(-1)!
  const sameTool = tools.every((part) => part.tool === latest.tool)
  const paths = uniquePaths(tools)
  const targets = uniqueTargets(tools)

  if (sameTool && latest.tool === "read") {
    if (paths.length === 1) return { verb: "Reading", path: paths[0], title: withTarget("Reading", paths[0]) }
    return {
      verb: "Reading",
      path: `${paths[0] ?? ""} +${tools.length - 1} more`.trim(),
      title: `Reading ${plural(tools.length, "file")}`,
    }
  }

  if (sameTool && EDIT_TOOLS.has(latest.tool)) {
    const verb = latest.tool === "write" && tools.every((t) => t.tool === "write") ? "Writing" : "Editing"
    if (paths.length === 1) return { verb, path: paths[0], title: withTarget(verb, paths[0]) }
    return {
      verb,
      path: `${paths[0] ?? ""} +${Math.max(paths.length, tools.length) - 1} more`.trim(),
      title: `${verb} ${plural(Math.max(paths.length, tools.length), "file")}`,
    }
  }

  if (sameTool && latest.tool === "bash") {
    if (targets.length === 1) return { verb: "Running", path: targets[0], title: withTarget("Running", targets[0]) }
    return { verb: "Running", title: `Running ${plural(tools.length, "command")}` }
  }

  if (sameTool && SEARCH_TOOLS.has(latest.tool)) {
    if (targets.length === 1)
      return { verb: "Searching", path: targets[0], title: withTarget("Searching", targets[0]) }
    return { verb: "Searching", title: `Searching ${plural(tools.length, "query")}` }
  }

  const inspectOnly = tools.every((part) => part.tool === "read" || INSPECT_TOOLS.has(part.tool))
  if (inspectOnly) {
    if (paths.length === 1) return { verb: "Inspecting", path: paths[0], title: withTarget("Inspecting", paths[0]) }
    if (targets.length === 1)
      return { verb: "Inspecting", path: targets[0], title: withTarget("Inspecting", targets[0]) }
    return { verb: "Inspecting", title: `Inspecting ${plural(tools.length, "item")}` }
  }

  const editOnly = tools.every((part) => EDIT_TOOLS.has(part.tool))
  if (editOnly) {
    if (paths.length === 1) return { verb: "Editing", path: paths[0], title: withTarget("Editing", paths[0]) }
    return {
      verb: "Editing",
      path: paths[0] ? `${paths[0]} +${Math.max(paths.length, tools.length) - 1} more` : undefined,
      title: `Editing ${plural(Math.max(paths.length, tools.length), "file")}`,
    }
  }

  // Mixed batch: surface the newest live action (most accurate "now").
  return singleToolActivity(latest)
}

function trailingNonToolKind(parts: readonly ActivityPart[]): ActivityKind | undefined {
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index]
    if (!part || isTool(part)) return
    const kind = activityKindForPart(part)
    if (kind) return kind
  }
}

/**
 * Build the live agent status label from timeline parts.
 * Prefers in-flight tools (pending/running) so completed work doesn't stick.
 */
function snapshotFromToolActivity(kind: ActivityKind, activity: ToolActivity): ActivitySnapshot {
  return {
    kind,
    verb: activity.verb,
    path: activity.path,
    title: activity.title,
    detail: activity.path ?? activity.title,
  }
}

export function activitySnapshotForVisibleParts(
  parts: readonly ActivityPart[],
  options?: { now?: number },
): ActivitySnapshot {
  const tools = parts.filter(isTool)
  // Prefer explicitly running/pending tools; treat missing status as active only
  // when no completed tools exist yet (early stream).
  const runningTools = tools.filter((part) => {
    const status = toolStatus(part)
    return status === "pending" || status === "running"
  })
  const activeTools =
    runningTools.length > 0
      ? runningTools
      : tools.every((part) => !toolStatus(part) || isActiveTool(part))
        ? tools.filter(isActiveTool)
        : []

  if (activeTools.length > 0) {
    const kind = activityKindForVisibleParts(activeTools)
    return snapshotFromToolActivity(kind, groupedToolActivity(activeTools))
  }

  // No live tools: if the newest content is reasoning/text, say that instead of
  // replaying a finished "Reading foo.ts" forever while the model thinks.
  const trailing = trailingNonToolKind(parts)
  if (trailing === "reasoning") {
    const reasoning = [...parts].reverse().find((part) => part.type === "reasoning" && part.text?.trim())
    const topic = reasoning?.text ? extractReasoningTopic(reasoning.text) : undefined
    // Rotate soft reasoning verbs when there is no structured topic.
    const soft = rotatingWorkingPhrase((options?.now ?? 0) + 1500)
    const verb = topic ? "Reasoning" : soft === "Working on it" ? "Reasoning" : soft
    const title = topic ? `Reasoning · ${compact(topic, 40)}` : verb
    return { kind: "reasoning", verb, path: topic, title, detail: topic }
  }
  if (trailing === "responding") {
    return {
      kind: "responding",
      verb: ACTIVITY_LABELS.responding,
      title: ACTIVITY_LABELS.responding,
    }
  }

  if (tools.length > 0) {
    const last = tools.at(-1)!
    if (toolStatus(last) === "error") {
      return {
        kind: "working",
        verb: "Recovering from error",
        title: "Recovering from tool error",
      }
    }
    // After a tool finishes, show contextual synthesis — not bare "Working".
    return snapshotFromToolActivity("working", synthesisAfterTool(last))
  }

  if (parts.length === 0) return idleBusyActivity(parts, options?.now)

  const kind = activityKindForVisibleParts(parts)
  if (kind === "working") return idleBusyActivity(parts, options?.now)
  const verb = activityLabel(kind)
  return { kind, verb, title: verb }
}

export function activityTitleForVisibleParts(parts: readonly ActivityPart[], options?: { now?: number }): string {
  return activitySnapshotForVisibleParts(parts, options).title
}

export function getAssistantActivityLabel(input: {
  messages: readonly ActivityMessage[]
  getParts: (messageID: string) => readonly ActivityPart[] | undefined
  t: ActivityTranslator
  fallback?: string
  visibleParts?: readonly ActivityPart[]
}) {
  if (input.visibleParts) return activityTitleForVisibleParts(input.visibleParts)

  const parts: ActivityPart[] = []

  for (let messageIndex = 0; messageIndex < input.messages.length; messageIndex++) {
    const message = input.messages[messageIndex]
    if (!message || message.role !== "assistant") continue
    parts.push(...(input.getParts(message.id) ?? []))
  }

  if (parts.length > 0) return activityTitleForVisibleParts(parts, { now: Date.now() })
  if (input.fallback) return input.fallback
  return activityTitleForVisibleParts([])
}
