import { describe, expect, test } from "bun:test"
import {
  activityKindForVisibleParts,
  activityLabel,
  activitySnapshotForVisibleParts,
  activityTitleForVisibleParts,
  displayPath,
  getAssistantActivityLabel,
  SPINNER_VERBS,
  type ActivityMessage,
  type ActivityPart,
} from "./session-activity"

const dict: Record<string, string> = {
  "ui.sessionTurn.status.delegating": "Delegating work",
  "ui.sessionTurn.status.gatheringContext": "Exploring",
  "ui.sessionTurn.status.makingEdits": "Making edits",
  "ui.sessionTurn.status.runningCommands": "Running commands",
}

const t = (key: string, params?: Record<string, string | number | boolean>) =>
  (dict[key] ?? key).replace(/{{\s*([^}]+?)\s*}}/g, (_, raw) => String(params?.[String(raw)] ?? ""))

function label(messages: ActivityMessage[], parts: Record<string, ActivityPart[]>) {
  return getAssistantActivityLabel({
    messages,
    getParts: (messageID) => parts[messageID],
    t,
  })
}

describe("assistant activity label", () => {
  test("shows the path for a running read", () => {
    const snap = activitySnapshotForVisibleParts([
      {
        type: "tool",
        tool: "read",
        state: { status: "running", input: { filePath: "C:/repo/packages/app/src/components/AgentView.tsx" } },
      },
    ])
    expect(snap.verb).toBe("Reading")
    expect(snap.path).toBe("packages/app/src/components/AgentView.tsx")
    expect(snap.title).toBe("Reading packages/app/src/components/AgentView.tsx")
  })

  test("shows the path for edit and write", () => {
    expect(
      activitySnapshotForVisibleParts([
        {
          type: "tool",
          tool: "edit",
          state: { status: "running", input: { filePath: "packages/ui/src/components/session-turn.tsx" } },
        },
      ]),
    ).toMatchObject({
      verb: "Editing",
      path: "packages/ui/src/components/session-turn.tsx",
      title: "Editing packages/ui/src/components/session-turn.tsx",
    })

    expect(
      activitySnapshotForVisibleParts([
        {
          type: "tool",
          tool: "write",
          state: { status: "running", input: { path: "packages/session-ui/src/components/session-activity.ts" } },
        },
      ]),
    ).toMatchObject({
      verb: "Writing",
      path: "packages/session-ui/src/components/session-activity.ts",
    })
  })

  test("prefers live reasoning after completed inspect tools", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant", time: {} }],
        {
          msg_1: [
            {
              type: "tool",
              tool: "read",
              state: { status: "completed", input: { filePath: "src/routes/profile/+page.svelte" } },
            },
            { type: "tool", tool: "read", state: { status: "completed", input: { filePath: "src/app.css" } } },
            { type: "reasoning", text: "## Checking SEO\n\nNeed to inspect the files." },
          ],
        },
      ),
    ).toBe("Reasoning · Checking SEO")
  })

  test("detects search work from tool input", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant" }],
        {
          msg_1: [
            {
              type: "tool",
              tool: "grep",
              state: { status: "running", input: { pattern: "createMemo" } },
            },
          ],
        },
      ),
    ).toBe("Searching createMemo")
  })

  test("uses the newest active tool", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant" }],
        {
          msg_1: [
            { type: "tool", tool: "grep", state: { status: "running", input: { pattern: "foo" } } },
            { type: "tool", tool: "bash", state: { status: "running", input: { description: "tests" } } },
          ],
        },
      ),
    ).toBe("Running tests")
  })

  test("detects streamed answer text", () => {
    expect(
      label(
        [{ id: "msg_1", role: "assistant", time: {} }],
        {
          msg_1: [{ type: "text", text: "Here is the fix" }],
        },
      ),
    ).toBe("Writing response")
  })

  test("falls back only when there is no live signal yet", () => {
    expect(label([{ id: "msg_1", role: "assistant", time: {} }], { msg_1: [] })).toBe("Getting started")
  })

  test("keeps the action label verbs available", () => {
    expect(SPINNER_VERBS).toContain("Working")
    expect(SPINNER_VERBS).toContain("Reasoning")
    expect(SPINNER_VERBS).toContain("Reading")
    expect(SPINNER_VERBS).toContain("Inspecting")
    expect(SPINNER_VERBS).toContain("Editing")
  })

  test("prefers running tools over completed ones and later reasoning", () => {
    expect(
      activityTitleForVisibleParts([
        { type: "tool", tool: "read", state: { status: "completed", input: { filePath: "src/app.css" } } },
        { type: "tool", tool: "grep", state: { status: "running", input: { pattern: "createMemo" } } },
        { type: "reasoning", text: "later reasoning" },
      ]),
    ).toBe("Searching createMemo")
  })

  test("after completed tools shows contextual synthesis instead of bare Working", () => {
    const snap = activitySnapshotForVisibleParts([
      { type: "tool", tool: "read", state: { status: "completed", input: { filePath: "src/app.css" } } },
    ])
    expect(snap.verb).toBe("Analyzing")
    expect(snap.path).toBe("src/app.css")
    expect(snap.title).toBe("Analyzing src/app.css")
  })

  test("after edit shows reviewing context with path", () => {
    const snap = activitySnapshotForVisibleParts([
      {
        type: "tool",
        tool: "edit",
        state: { status: "completed", input: { filePath: "packages/app/src/foo.ts" } },
      },
    ])
    expect(snap.verb).toBe("Reviewing edit")
    expect(snap.path).toBe("packages/app/src/foo.ts")
  })

  test("groups concurrent active reads with path hint", () => {
    const snap = activitySnapshotForVisibleParts([
      { type: "tool", tool: "read", state: { status: "running", input: { filePath: "a.ts" } } },
      { type: "tool", tool: "read", state: { status: "running", input: { filePath: "b.ts" } } },
    ])
    expect(snap.verb).toBe("Reading")
    expect(snap.path).toContain("+1 more")
    expect(snap.title).toBe("Reading 2 files")
  })

  test("displayPath keeps project-relative paths", () => {
    expect(displayPath("C:/Users/sera/Desktop/shobcoder/packages/app/src/pages/session.tsx")).toBe(
      "packages/app/src/pages/session.tsx",
    )
    expect(displayPath("src/foo.ts")).toBe("src/foo.ts")
  })

  test("derives labels from explicitly visible parts", () => {
    expect(activityLabel(activityKindForVisibleParts([]))).toBe("Working")
    expect(activityLabel(activityKindForVisibleParts([{ type: "reasoning", text: "thinking" }]))).toBe("Reasoning")
    expect(activityTitleForVisibleParts([])).toBe("Getting started")
    expect(activityTitleForVisibleParts([{ type: "reasoning", text: "thinking" }])).toMatch(/^(Reasoning|Thinking|Planning|Gathering|Figuring|Working|Considering|Putting|Looking|Making|Almost)/)
  })

  test("allows dynamic spinner fallback when no live signal exists", () => {
    expect(
      getAssistantActivityLabel({
        messages: [{ id: "msg_1", role: "assistant", time: {} }],
        getParts: () => [],
        t,
        fallback: "Checking",
      }),
    ).toBe("Checking")
  })
})
