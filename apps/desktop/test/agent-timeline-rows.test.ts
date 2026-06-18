import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Message, Part, SessionStatus, UserMessage } from "@shob-ai/sdk/v2/client"
import {
  buildAgentTimelineOrphanRows,
  buildAgentTimelineRows,
  buildAgentTimelineTurnRows,
  reuseAgentTimelineRows,
} from "../src/components/agent-timeline-rows"

const sessionID = "ses_test"
const userID = "msg_user"
const assistantID = "msg_assistant"

function user(id = userID, overrides: Partial<UserMessage> = {}): UserMessage {
  return {
    id,
    sessionID,
    role: "user",
    time: { created: 1 },
    agent: "build",
    model: { providerID: "openai", modelID: "gpt" },
    ...overrides,
  } as UserMessage
}

function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id: assistantID,
    sessionID,
    role: "assistant",
    parentID: userID,
    time: { created: 2 },
    agent: "build",
    providerID: "openai",
    modelID: "gpt",
    path: {},
    summary: {},
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ...overrides,
  } as AssistantMessage
}

function text(id: string, finished = true): Part {
  return {
    id,
    sessionID,
    messageID: assistantID,
    type: "text",
    text: "answer",
    time: finished ? { start: 1, end: 2 } : { start: 1 },
  } as Part
}

function reasoning(id: string, finished = true): Part {
  return {
    id,
    sessionID,
    messageID: assistantID,
    type: "reasoning",
    text: "thinking",
    time: finished ? { start: 1, end: 2 } : { start: 1 },
  } as Part
}

function tool(
  id: string,
  status: "pending" | "running" | "completed" | "error" = "completed",
  toolName = "read",
  input: Record<string, unknown> = {},
): Part {
  const base = {
    id,
    sessionID,
    messageID: assistantID,
    type: "tool",
    tool: toolName,
    callID: id,
  }
  return {
    ...base,
    state:
      status === "error"
        ? { status, input: {}, error: "failed", time: { start: 1, end: 2 } }
        : {
            status,
            input,
            output: status === "completed" ? "" : undefined,
            time: status === "completed" ? { start: 1, end: 2 } : { start: 1 },
          },
  } as Part
}

function rows(input: {
  messages?: Message[]
  parts?: Part[]
  status?: SessionStatus
  sessionError?: unknown
}) {
  const messages = input.messages ?? [user(), assistant()]
  const parts = input.parts ?? []
  return buildAgentTimelineRows({
    messages,
    getParts: (messageID) => (messageID === assistantID ? parts : []),
    status: input.status ?? { type: "busy" },
    sessionError: input.sessionError,
    showReasoningSummaries: true,
  })
}

function assistantPartIDs(result: ReturnType<typeof rows>) {
  return result
    .filter((row) => row.type === "assistant-part")
    .flatMap((row) => (row.group.type === "part" ? [row.group.ref.partID] : row.group.refs.map((ref) => ref.partID)))
}

function thinkingActivity(result: ReturnType<typeof rows>) {
  const row = result.find((item) => item.type === "thinking")
  return row?.type === "thinking" ? row.activityKind : undefined
}

function thinkingTitle(result: ReturnType<typeof rows>) {
  const row = result.find((item) => item.type === "thinking")
  return row?.type === "thinking" ? row.activityTitle : undefined
}

describe("agent timeline rows", () => {
  test("live unfinished reasoning hides later tool and text rows", () => {
    const result = rows({ parts: [reasoning("reasoning_1", false), tool("tool_1", "running"), text("text_1", false)] })

    expect(result.map((row) => row.type)).toEqual(["user", "assistant-part", "thinking"])
    expect(assistantPartIDs(result)).toEqual(["reasoning_1"])
  })

  test("finished reasoning allows the next running tool row", () => {
    const result = rows({ parts: [reasoning("reasoning_1"), tool("tool_1", "running"), text("text_1", false)] })

    expect(assistantPartIDs(result)).toEqual(["reasoning_1", "tool_1"])
  })

  test("running tool hides later text", () => {
    const result = rows({ parts: [tool("tool_1", "running"), text("text_1", false)] })

    expect(result.map((row) => row.type)).toEqual(["user", "assistant-part", "thinking"])
    expect(assistantPartIDs(result)).toEqual(["tool_1"])
  })

  test("thinking row stays visible for the active busy turn", () => {
    expect(rows({ parts: [] }).map((row) => row.type)).toEqual(["user", "thinking"])
    expect(rows({ parts: [reasoning("reasoning_1", false)] }).map((row) => row.type)).toEqual([
      "user",
      "assistant-part",
      "thinking",
    ])
  })

  test("thinking row activity prioritizes visible inspected group over later reasoning", () => {
    const result = rows({
      parts: [
        tool("tool_1", "completed", "read", { filePath: "src/routes/profile/+page.svelte" }),
        tool("tool_2", "completed", "read", { filePath: "src/app.css" }),
        reasoning("reasoning_1", false),
      ],
    })

    expect(assistantPartIDs(result)).toEqual(["tool_1", "tool_2", "reasoning_1"])
    expect(thinkingActivity(result)).toBe("inspecting")
    expect(thinkingTitle(result)).toBe("Inspecting 2 items")
  })

  test("thinking row activity follows the visible current action", () => {
    const read = rows({ parts: [tool("tool_read", "running", "read", { filePath: "src/app.css" })] })
    const search = rows({ parts: [tool("tool_search", "running", "grep", { pattern: "createMemo" })] })
    const edit = rows({ parts: [tool("tool_edit", "running", "edit", { filePath: "src/index.css" })] })
    const run = rows({ parts: [tool("tool_run", "running", "bash", { description: "tests" })] })

    expect(thinkingActivity(read)).toBe("reading")
    expect(thinkingTitle(read)).toBe("Reading app.css")
    expect(thinkingActivity(search)).toBe("inspecting")
    expect(thinkingTitle(search)).toBe("Searching createMemo")
    expect(thinkingActivity(edit)).toBe("editing")
    expect(thinkingTitle(edit)).toBe("Editing index.css")
    expect(thinkingActivity(run)).toBe("running")
    expect(thinkingTitle(run)).toBe("Running tests")
    expect(thinkingActivity(rows({ parts: [tool("tool_patch", "running", "apply_patch")] }))).toBe("patching")
    expect(thinkingActivity(rows({ parts: [reasoning("reasoning_1", false)] }))).toBe("reasoning")
    expect(thinkingTitle(rows({ parts: [reasoning("reasoning_1", false)] }))).toBe("Reasoning")
    expect(thinkingActivity(rows({ parts: [] }))).toBe("working")
    expect(thinkingTitle(rows({ parts: [] }))).toBe("Working")
  })

  test("completed transcripts show all parts even with missing timestamps", () => {
    const result = rows({
      parts: [reasoning("reasoning_1", false), tool("tool_1", "running"), text("text_1", false)],
      status: { type: "idle" },
    })

    expect(assistantPartIDs(result)).toEqual(["reasoning_1", "tool_1", "text_1"])
    expect(result.map((row) => row.type)).not.toContain("thinking")
  })

  test("retry, error, diff summary, and orphan rows are placed by turn state", () => {
    const diffUser = user(userID, { summary: { diffs: [{ file: "src/a.ts" }] } } as Partial<UserMessage>)
    const orphan = assistant({ id: "msg_orphan", parentID: undefined })

    expect(rows({ messages: [diffUser, assistant()], parts: [], status: { type: "retry" } }).map((row) => row.type)).toEqual([
      "user",
      "retry",
    ])

    expect(
      rows({
        messages: [diffUser, assistant()],
        parts: [],
        status: { type: "busy" },
        sessionError: { name: "Boom" },
      }).map((row) => row.type),
    ).toEqual(["user", "error"])

    expect(rows({ messages: [diffUser, assistant(), orphan], parts: [], status: { type: "idle" } }).map((row) => row.type)).toEqual([
      "user",
      "diff-summary",
      "orphan-assistant",
    ])
  })

  test("reuses unchanged rows across streaming updates", () => {
    const first = rows({ parts: [reasoning("reasoning_1", false)] })
    const second = reuseAgentTimelineRows(first, rows({ parts: [reasoning("reasoning_1", false)] }))
    const changed = reuseAgentTimelineRows(first, rows({ parts: [reasoning("reasoning_1"), tool("tool_1", "running")] }))

    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
    expect(second[2]).toBe(first[2])
    expect(changed[0]).toBe(first[0])
    expect(changed[1]).not.toBe(first[1])
    expect(changed).toHaveLength(3)
    expect(assistantPartIDs(changed)).toEqual(["reasoning_1", "tool_1"])
  })

  test("turn builder reads only the active turn assistant parts", () => {
    const calls: string[] = []
    const secondUser = user("msg_user_2")
    const secondAssistant = assistant({ id: "msg_assistant_2", parentID: secondUser.id })

    const result = buildAgentTimelineTurnRows({
      userMessage: secondUser,
      assistantMessages: [secondAssistant],
      getParts: (messageID) => {
        calls.push(messageID)
        return messageID === secondAssistant.id ? [text("text_2")] : []
      },
      status: { type: "busy" },
      active: true,
      previousUserMessage: true,
      showReasoningSummaries: true,
    })

    expect(calls).toEqual([secondAssistant.id])
    expect(result.map((row) => row.type)).toEqual(["user", "assistant-part", "thinking"])
    expect(result[0]?.type === "user" ? result[0].previousUserMessage : false).toBe(true)
  })

  test("orphan helper keeps assistant messages without known user parents", () => {
    const result = buildAgentTimelineOrphanRows([
      user(),
      assistant(),
      assistant({ id: "msg_orphan_1", parentID: undefined }),
      assistant({ id: "msg_orphan_2", parentID: "msg_missing" }),
    ])

    expect(result).toMatchObject([
      { type: "orphan-assistant", messageID: "msg_orphan_1", previousOrphan: false },
      { type: "orphan-assistant", messageID: "msg_orphan_2", previousOrphan: true },
    ])
  })
})
