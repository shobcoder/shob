import { describe, expect, test } from "bun:test"
import type { PartGroup } from "@shob/session-ui/message-part"
import { reuseTimelineRows } from "./row-reconciliation"
import { TimelineRow } from "./timeline-row"

const activity = (key: string, partIDs: string[], userMessageID = "user-1") =>
  new TimelineRow.AssistantPart({
    userMessageID,
    group: {
      key,
      type: "activity",
      refs: partIDs.map((partID) => ({ messageID: "assistant-1", partID })),
    } satisfies PartGroup,
    previousAssistantPart: false,
  })

const user = (userMessageID = "user-1") => new TimelineRow.UserMessage({ userMessageID, anchor: true })
const keys = (rows: TimelineRow.TimelineRow[]) => rows.map(TimelineRow.key)

describe("reuseTimelineRows", () => {
  test.each([
    {
      name: "reuses an unchanged activity group",
      previous: [activity("activity:a", ["a", "b"])],
      rows: [activity("activity:a", ["a", "b"])],
      expected: ["assistant-part:user-1:activity:a"],
      reused: [[0, 0]],
    },
    {
      name: "preserves the group key when a member is appended",
      previous: [activity("activity:a", ["a"])],
      rows: [activity("activity:a", ["a", "b"])],
      expected: ["assistant-part:user-1:activity:a"],
      reused: [],
    },
    {
      name: "preserves the group key when the first member is removed",
      previous: [activity("activity:a", ["a", "b"])],
      rows: [activity("activity:b", ["b"])],
      expected: ["assistant-part:user-1:activity:a"],
      reused: [],
    },
    {
      name: "lets only the natural owner retain an old key after a split",
      previous: [activity("activity:a", ["a", "b"])],
      rows: [activity("activity:a", ["a"]), activity("activity:b", ["b"])],
      expected: ["assistant-part:user-1:activity:a", "assistant-part:user-1:activity:b"],
      reused: [],
    },
    {
      name: "chooses the earliest prior key when groups merge",
      previous: [activity("activity:a", ["a"]), activity("activity:b", ["b"])],
      rows: [activity("activity:b", ["b", "a"])],
      expected: ["assistant-part:user-1:activity:a"],
      reused: [],
    },
    {
      name: "reserves an old key for its natural owner when two new groups compete",
      previous: [activity("activity:a", ["a", "b"])],
      rows: [activity("activity:b", ["b"]), activity("activity:a", ["a"])],
      expected: ["assistant-part:user-1:activity:b", "assistant-part:user-1:activity:a"],
      reused: [],
    },
    {
      name: "does not reuse activity identity across user messages",
      previous: [activity("activity:a", ["a", "b"], "user-1")],
      rows: [activity("activity:b", ["b"], "user-2")],
      expected: ["assistant-part:user-2:activity:b"],
      reused: [],
    },
    {
      name: "reuses an unaffected ordinary row",
      previous: [user()],
      rows: [user()],
      expected: ["user-message:user-1"],
      reused: [[0, 0]],
    },
    {
      name: "does not create accidental key collisions",
      previous: [activity("activity:a", ["a", "b", "c"])],
      rows: [activity("activity:b", ["b"]), activity("activity:a", ["a"]), activity("activity:c", ["c"])],
      expected: [
        "assistant-part:user-1:activity:b",
        "assistant-part:user-1:activity:a",
        "assistant-part:user-1:activity:c",
      ],
      reused: [],
    },
  ])("$name", ({ previous, rows, expected, reused }) => {
    const result = reuseTimelineRows([...previous], [...rows])

    expect(keys(result)).toEqual([...expected])
    expect(new Set(keys(result)).size).toBe(result.length)
    reused.forEach(([resultIndex, previousIndex]) => expect(result[resultIndex]).toBe(previous[previousIndex]))
  })
})
