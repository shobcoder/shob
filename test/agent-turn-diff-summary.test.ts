import { describe, expect, test } from "bun:test"
import { createAgentTurnDiffSummary } from "../src/components/agent-turn-diff-summary"

describe("agent turn diff summary", () => {
  test("de-duplicates repeated files by the latest entry", () => {
    const summary = createAgentTurnDiffSummary([
      { file: "src/a.ts", additions: 1, deletions: 1, patch: "" },
      { file: "src/b.ts", additions: 2, deletions: 0, patch: "" },
      { file: "src/a.ts", additions: 8, deletions: 3, patch: "" },
    ])

    expect(summary.files).toEqual([
      { file: "src/b.ts", additions: 2, deletions: 0 },
      { file: "src/a.ts", additions: 8, deletions: 3 },
    ])
  })

  test("totals additions and deletions after de-duplication", () => {
    const summary = createAgentTurnDiffSummary([
      { file: "one.ts", additions: 3, deletions: 2, patch: "" },
      { file: "two.ts", additions: 4, deletions: 5, patch: "" },
      { file: "one.ts", additions: 10, deletions: 1, patch: "" },
    ])

    expect(summary.additions).toBe(14)
    expect(summary.deletions).toBe(6)
    expect(summary.count).toBe(2)
  })

  test("shows three files by default and computes overflow", () => {
    const summary = createAgentTurnDiffSummary([
      { file: "one.ts", additions: 1, deletions: 0, patch: "" },
      { file: "two.ts", additions: 1, deletions: 0, patch: "" },
      { file: "three.ts", additions: 1, deletions: 0, patch: "" },
      { file: "four.ts", additions: 1, deletions: 0, patch: "" },
      { file: "five.ts", additions: 1, deletions: 0, patch: "" },
    ])

    expect(summary.visible.map((diff) => diff.file)).toEqual(["one.ts", "two.ts", "three.ts"])
    expect(summary.overflow).toBe(2)
  })

  test("handles single-file and empty input", () => {
    const single = createAgentTurnDiffSummary({ file: "src/only.ts", additions: 7, deletions: 0, patch: "" })
    const empty = createAgentTurnDiffSummary(undefined)

    expect(single.count).toBe(1)
    expect(single.visible).toEqual([{ file: "src/only.ts", additions: 7, deletions: 0 }])
    expect(single.overflow).toBe(0)
    expect(empty).toEqual({
      additions: 0,
      count: 0,
      deletions: 0,
      files: [],
      overflow: 0,
      visible: [],
    })
  })
})
