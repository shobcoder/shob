import type { AssistantMessage, Message, Part, SessionStatus } from "@shob-ai/sdk/v2/client"
import {
  groupAssistantDisplayParts,
  orderAssistantDisplayParts,
  type AssistantPartEntry,
  type AssistantPartGroup,
} from "../../../../packages/ui/src/components/message-part-order"
import {
  activityKindForVisibleParts,
  activityTitleForVisibleParts,
  type ActivityKind,
} from "../../../../packages/ui/src/components/session-activity"

type UserMessage = Extract<Message, { role: "user" }>

type BuildAgentTimelineTurnRowsInput = {
  userMessage: UserMessage
  assistantMessages: AssistantMessage[]
  getParts: (messageID: string) => Part[] | undefined
  status: SessionStatus
  sessionError?: unknown
  active: boolean
  previousUserMessage: boolean
  showReasoningSummaries?: boolean
}

export type AgentTimelineRow =
  | {
      type: "user"
      key: string
      userMessageID: string
      previousUserMessage: boolean
    }
  | {
      type: "assistant-part"
      key: string
      userMessageID: string
      group: AssistantPartGroup
      active: boolean
      lastAssistantPart: boolean
      previousAssistantPart: boolean
    }
  | {
      type: "thinking"
      key: string
      userMessageID: string
      activityKind: ActivityKind
      activityTitle: string
    }
  | {
      type: "retry"
      key: string
      userMessageID: string
    }
  | {
      type: "diff-summary"
      key: string
      userMessageID: string
    }
  | {
      type: "error"
      key: string
      userMessageID: string
      error: unknown
    }
  | {
      type: "orphan-assistant"
      key: string
      messageID: string
      previousOrphan: boolean
    }

function sameRef(a: { messageID: string; partID: string }, b: { messageID: string; partID: string }) {
  return a.messageID === b.messageID && a.partID === b.partID
}

function sameGroup(a: AssistantPartGroup, b: AssistantPartGroup) {
  if (a === b) return true
  if (a.key !== b.key || a.type !== b.type) return false
  if (a.type === "part") return b.type === "part" && sameRef(a.ref, b.ref)
  if (b.type !== "context" || a.refs.length !== b.refs.length) return false
  return a.refs.every((ref, index) => sameRef(ref, b.refs[index]!))
}

export function sameAgentTimelineRow(a: AgentTimelineRow, b: AgentTimelineRow) {
  if (a === b) return true
  if (a.key !== b.key || a.type !== b.type) return false

  switch (a.type) {
    case "user":
      return b.type === "user" && a.previousUserMessage === b.previousUserMessage
    case "assistant-part":
      return (
        b.type === "assistant-part" &&
        a.userMessageID === b.userMessageID &&
        a.active === b.active &&
        a.lastAssistantPart === b.lastAssistantPart &&
        a.previousAssistantPart === b.previousAssistantPart &&
        sameGroup(a.group, b.group)
      )
    case "thinking":
      return (
        b.type === "thinking" &&
        a.userMessageID === b.userMessageID &&
        a.activityKind === b.activityKind &&
        a.activityTitle === b.activityTitle
      )
    case "retry":
    case "diff-summary":
      return b.type === a.type && a.userMessageID === b.userMessageID
    case "error":
      return b.type === "error" && a.userMessageID === b.userMessageID && a.error === b.error
    case "orphan-assistant":
      return b.type === "orphan-assistant" && a.messageID === b.messageID && a.previousOrphan === b.previousOrphan
  }
}

export function reuseAgentTimelineRows(previous: AgentTimelineRow[] | undefined, rows: AgentTimelineRow[]) {
  if (!previous?.length) return rows
  const byKey = new Map(previous.map((row) => [row.key, row] as const))
  return rows.map((row) => {
    const existing = byKey.get(row.key)
    return existing && sameAgentTimelineRow(existing, row) ? existing : row
  })
}

const CONTEXT_GROUP_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "list",
  "bash",
  "edit",
  "write",
  "apply_patch",
  "webfetch",
  "websearch",
  "codesearch",
  "task",
  "question",
  "skill",
])

const HIDDEN_TOOLS = new Set(["todowrite"])

function parentID(message: Message) {
  return "parentID" in message && typeof message.parentID === "string" ? message.parentID : undefined
}

function assistantError(message: AssistantMessage) {
  const error = (message as { error?: { name?: string } }).error
  if (!error || error.name === "MessageAbortedError" || error.name === "ContextOverflowError") return
  return error
}

function isContextPart(part: Part) {
  if (part.type === "reasoning") return true
  return part.type === "tool" && CONTEXT_GROUP_TOOLS.has(part.tool)
}

export function isRenderableAgentTimelinePart(part: Part, showReasoningSummaries = true) {
  if (part.type === "tool") {
    if (HIDDEN_TOOLS.has(part.tool)) return false
    if (part.tool === "question") return part.state.status !== "pending" && part.state.status !== "running"
    return true
  }
  if (part.type === "text") return !!part.text?.trim()
  if (part.type === "reasoning") return showReasoningSummaries && !!part.text?.trim()
  return false
}

function assistantEntries(input: {
  assistants: AssistantMessage[]
  getParts: (messageID: string) => Part[] | undefined
  showReasoningSummaries: boolean
}): AssistantPartEntry<Part>[] {
  return input.assistants.flatMap((message) =>
    (input.getParts(message.id) ?? [])
      .filter((part) => isRenderableAgentTimelinePart(part, input.showReasoningSummaries))
      .map((part) => ({
        messageID: message.id,
        messageCompleted: typeof message.time.completed === "number",
        part,
      })),
  )
}

function hasVisibleDiffSummary(message: UserMessage) {
  const diffs = (message as { summary?: { diffs?: unknown } }).summary?.diffs
  return Array.isArray(diffs) && diffs.length > 0
}

function groupAssistantMessages(messages: Message[]) {
  const grouped = new Map<string, AssistantMessage[]>()
  for (const message of messages) {
    if (message.role !== "assistant") continue
    const id = parentID(message)
    if (!id) continue
    const list = grouped.get(id)
    if (list) list.push(message as AssistantMessage)
    else grouped.set(id, [message as AssistantMessage])
  }
  return grouped
}

export function buildAgentTimelineTurnRows(input: BuildAgentTimelineTurnRowsInput) {
  const showReasoningSummaries = input.showReasoningSummaries ?? true
  const error =
    input.assistantMessages.map(assistantError).find(Boolean) ?? (input.active ? input.sessionError : undefined)
  const entries = assistantEntries({
    assistants: input.assistantMessages,
    getParts: input.getParts,
    showReasoningSummaries,
  })
  const visibleEntries = orderAssistantDisplayParts(entries, { live: input.active })
  const visibleParts = visibleEntries.map((entry) => entry.part)
  const groups = groupAssistantDisplayParts(entries, isContextPart, { live: input.active })
  const rows: AgentTimelineRow[] = [
    {
      type: "user",
      key: `user:${input.userMessage.id}`,
      userMessageID: input.userMessage.id,
      previousUserMessage: input.previousUserMessage,
    },
  ]

  groups.forEach((group, groupIndex) => {
    rows.push({
      type: "assistant-part",
      key: `assistant:${input.userMessage.id}:${group.key}`,
      userMessageID: input.userMessage.id,
      group,
      active: input.active,
      lastAssistantPart: groupIndex === groups.length - 1,
      previousAssistantPart: groupIndex > 0,
    })
  })

  if (input.active && input.status.type !== "retry" && !error) {
    rows.push({
      type: "thinking",
      key: `thinking:${input.userMessage.id}`,
      userMessageID: input.userMessage.id,
      activityKind: activityKindForVisibleParts(visibleParts),
      activityTitle: activityTitleForVisibleParts(visibleParts),
    })
  }

  if (input.active && input.status.type === "retry") {
    rows.push({
      type: "retry",
      key: `retry:${input.userMessage.id}`,
      userMessageID: input.userMessage.id,
    })
  }

  if (error) {
    rows.push({
      type: "error",
      key: `error:${input.userMessage.id}`,
      userMessageID: input.userMessage.id,
      error,
    })
  }

  if (hasVisibleDiffSummary(input.userMessage) && (!input.active || input.status.type === "idle")) {
    rows.push({
      type: "diff-summary",
      key: `diff:${input.userMessage.id}`,
      userMessageID: input.userMessage.id,
    })
  }

  return rows
}

export function buildAgentTimelineOrphanRows(messages: Message[]) {
  const userIDs = new Set(
    messages.filter((message): message is UserMessage => message.role === "user").map((message) => message.id),
  )
  const rows: AgentTimelineRow[] = []
  let orphanCount = 0

  for (const message of messages) {
    if (message.role === "user") continue
    const id = parentID(message)
    if (id && userIDs.has(id)) continue
    rows.push({
      type: "orphan-assistant",
      key: `orphan:${message.id}`,
      messageID: message.id,
      previousOrphan: orphanCount > 0,
    })
    orphanCount++
  }

  return rows
}

export function buildAgentTimelineRows(input: {
  messages: Message[]
  getParts: (messageID: string) => Part[] | undefined
  status: SessionStatus
  sessionError?: unknown
  activeUserMessageID?: string
  showReasoningSummaries?: boolean
}) {
  const showReasoningSummaries = input.showReasoningSummaries ?? true
  const userMessages = input.messages.filter((message): message is UserMessage => message.role === "user")
  const activeUserMessageID = input.activeUserMessageID ?? userMessages.at(-1)?.id
  const working = input.status.type !== "idle"
  const assistantsByParent = groupAssistantMessages(input.messages)
  const rows = userMessages.flatMap((message, index) =>
    buildAgentTimelineTurnRows({
      userMessage: message,
      assistantMessages: assistantsByParent.get(message.id) ?? [],
      getParts: input.getParts,
      status: input.status,
      sessionError: activeUserMessageID === message.id ? input.sessionError : undefined,
      active: working && message.id === activeUserMessageID,
      previousUserMessage: index > 0,
      showReasoningSummaries,
    }),
  )

  return [...rows, ...buildAgentTimelineOrphanRows(input.messages)]
}
