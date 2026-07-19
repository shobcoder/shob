import type { Part, ToolPart } from "@shob/sdk/v2"

export type PartRef = {
  messageID: string
  partID: string
}

export type PartGroup =
  | {
      key: string
      type: "part"
      ref: PartRef
    }
  | {
      key: string
      type: "activity"
      refs: PartRef[]
    }

function sameRef(a: PartRef, b: PartRef) {
  return a.messageID === b.messageID && a.partID === b.partID
}

function sameGroup(a: PartGroup, b: PartGroup) {
  if (a === b) return true
  if (a.key !== b.key) return false
  if (a.type !== b.type) return false
  if (a.type === "part") {
    if (b.type !== "part") return false
    return sameRef(a.ref, b.ref)
  }
  if (b.type !== "activity") return false
  if (a.refs.length !== b.refs.length) return false
  return a.refs.every((ref, index) => sameRef(ref, b.refs[index]!))
}

export function sameGroups(a: readonly PartGroup[] | undefined, b: readonly PartGroup[] | undefined) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  return a.every((item, index) => sameGroup(item, b[index]!))
}

export function groupParts(parts: { messageID: string; part: Part }[]) {
  const result: PartGroup[] = []
  let start = -1

  const flush = (end: number) => {
    if (start < 0) return
    const first = parts[start]
    const last = parts[end]
    if (!first || !last) {
      start = -1
      return
    }
    result.push({
      key: `activity:${first.part.id}`,
      type: "activity",
      refs: parts.slice(start, end + 1).map((item) => ({
        messageID: item.messageID,
        partID: item.part.id,
      })),
    })
    start = -1
  }

  parts.forEach((item, index) => {
    if (item.part.type === "tool") {
      if (start < 0) start = index
      return
    }

    flush(index - 1)
    result.push({
      key: `part:${item.messageID}:${item.part.id}`,
      type: "part",
      ref: {
        messageID: item.messageID,
        partID: item.part.id,
      },
    })
  })

  flush(parts.length - 1)
  return result
}

export function toolTranscriptVisible(part: ToolPart) {
  if (part.tool === "todowrite") return false
  if (part.tool !== "question") return true
  return part.state.status !== "pending" && part.state.status !== "running"
}

export type ToolActivityCategory = "edit" | "command" | "explore" | "web" | "task" | "question" | "skill" | "tool"

const CATEGORY_ORDER: ToolActivityCategory[] = [
  "edit",
  "command",
  "web",
  "explore",
  "task",
  "question",
  "skill",
  "tool",
]

const CATEGORY: Record<string, ToolActivityCategory> = {
  edit: "edit",
  write: "edit",
  apply_patch: "edit",
  bash: "command",
  read: "explore",
  list: "explore",
  glob: "explore",
  grep: "explore",
  webfetch: "web",
  websearch: "web",
  task: "task",
  question: "question",
  skill: "skill",
}

export function toolActivityCategory(part: ToolPart) {
  return CATEGORY[part.tool] ?? "tool"
}

function activityCount(part: ToolPart) {
  if (part.tool !== "apply_patch") return 1
  if (!("metadata" in part.state) || !Array.isArray(part.state.metadata?.files)) return 1
  return Math.max(1, part.state.metadata.files.length)
}

export function toolActivitySummary(
  parts: readonly ToolPart[],
  i18n: { t: (key: string, params?: Record<string, string | number | boolean>) => string },
) {
  const running = parts.some((part) => part.state.status === "pending" || part.state.status === "running")
  const counts = new Map<ToolActivityCategory, number>()
  parts.forEach((part) => {
    const category = toolActivityCategory(part)
    counts.set(category, (counts.get(category) ?? 0) + activityCount(part))
  })
  return CATEGORY_ORDER.filter((category) => counts.has(category))
    .map((category) => [category, counts.get(category) ?? 0] as const)
    .map(([category, count], index) => {
      const phrase = i18n.t(
        `ui.toolActivity.${category}.${running ? "running" : "done"}.${count === 1 ? "one" : "other"}`,
        { count },
      )
      if (index === 0) return phrase
      return phrase[0]!.toLocaleLowerCase() + phrase.slice(1)
    })
    .join(", ")
}
