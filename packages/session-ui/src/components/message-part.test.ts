import { describe, expect, test } from "bun:test"
import type { Part, ToolPart } from "@shob/sdk/v2"
import { dict } from "@shob/ui/i18n/en"
import { groupParts, toolActivitySummary, toolTranscriptVisible } from "./tool-activity"
import { readPartText } from "./message-part-text"

const tool = (id: string, name: string, status: "pending" | "completed" = "completed"): ToolPart => ({
  id,
  sessionID: "session-1",
  messageID: "message-1",
  type: "tool",
  callID: `call-${id}`,
  tool: name,
  state:
    status === "pending"
      ? { status, input: {}, raw: "" }
      : { status, input: {}, output: "", title: "", metadata: {}, time: { start: 1, end: 2 } },
})

const text = (id: string): Part => ({
  id,
  sessionID: "session-1",
  messageID: "message-1",
  type: "text",
  text: "Assistant text",
})

const i18n = {
  t(key: string, params?: Record<string, string | number | boolean>) {
    return (dict[key] ?? key).replace(/{{\s*([^}]+?)\s*}}/g, (_, name: string) => String(params?.[name] ?? ""))
  },
}

describe("readPartText", () => {
  test("returns empty string when accum is undefined and part text is undefined", () => {
    expect(readPartText(undefined, { id: "part_1" })).toBe("")
  })

  test("returns trimmed part text when accum is undefined", () => {
    expect(readPartText(undefined, { id: "part_1", text: "  hello  " })).toBe("hello")
  })

  test("prefers accum value over part text when accum has a hit", () => {
    expect(readPartText({ part_1: "  from accum  " }, { id: "part_1", text: "from part" })).toBe("from accum")
  })

  test("falls back to part text when accum misses", () => {
    expect(readPartText({ other_part: "ignored" }, { id: "part_1", text: "  from part  " })).toBe("from part")
  })

  test("returns empty string for whitespace-only text", () => {
    expect(readPartText(undefined, { id: "part_1", text: "   \n\t  " })).toBe("")
  })

  test("trims leading and trailing whitespace", () => {
    expect(readPartText(undefined, { id: "part_1", text: "\n  body  \n" })).toBe("body")
  })
})

describe("tool activity grouping", () => {
  test("groups every consecutive tool and keeps a stable first-part key", () => {
    expect(
      groupParts([
        { messageID: "message-1", part: tool("bash-1", "bash") },
        { messageID: "message-1", part: tool("edit-1", "edit") },
      ]),
    ).toEqual([
      {
        key: "activity:bash-1",
        type: "activity",
        refs: [
          { messageID: "message-1", partID: "bash-1" },
          { messageID: "message-1", partID: "edit-1" },
        ],
      },
    ])
  })

  test("creates single-tool groups and breaks them around assistant content", () => {
    expect(
      groupParts([
        { messageID: "message-1", part: tool("read-1", "read") },
        { messageID: "message-1", part: text("text-1") },
        { messageID: "message-1", part: tool("plugin-1", "custom_plugin") },
      ]).map((group) => [group.type, group.key]),
    ).toEqual([
      ["activity", "activity:read-1"],
      ["part", "part:message-1:text-1"],
      ["activity", "activity:plugin-1"],
    ])
  })

  test("summarizes mixed completed activity in Codex category order", () => {
    expect(toolActivitySummary([tool("bash-1", "bash"), tool("edit-1", "edit")], i18n)).toBe(
      "Edited a file, ran a command",
    )
  })

  test("uses running wording and pluralization while any member is active", () => {
    expect(
      toolActivitySummary(
        [tool("bash-1", "bash", "pending"), tool("bash-2", "bash"), tool("web-1", "websearch")],
        i18n,
      ),
    ).toBe("Running commands, searching the web")
  })

  test("keeps hidden todo and active question tools out of the transcript", () => {
    expect(toolTranscriptVisible(tool("todo-1", "todowrite"))).toBe(false)
    expect(toolTranscriptVisible(tool("question-1", "question", "pending"))).toBe(false)
    expect(toolTranscriptVisible(tool("question-2", "question"))).toBe(true)
  })
})
