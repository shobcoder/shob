import { describe, expect, test } from "bun:test"
import {
  resolveSessionChoiceKeyAction,
  type SessionChoiceKeyAction,
} from "../src/shob-ported/composer/session-choice-prompt.tsx"
import {
  CUSTOM_ANSWER_ID,
  buildQuestionAnswer,
  questionDefaultSelection,
  toggleQuestionSelection,
} from "../src/shob-ported/composer/session-question-dock.tsx"
import {
  buildPermissionChoiceOptions,
  permissionDecisionFromChoice,
} from "../src/shob-ported/composer/session-permission-dock.tsx"

type Question = NonNullable<Parameters<typeof questionDefaultSelection>[0]>

function question(overrides: Partial<Question> = {}): Question {
  return {
    question: "What should the plan produce?",
    header: "Plan",
    options: [
      { label: "App Safety Layer", description: "Add UI permission prompts." },
      { label: "Agent Instructions", description: "Update agent policy text." },
      { label: "Both" },
    ],
    ...overrides,
  }
}

describe("session choice prompt model", () => {
  test("single-select questions default to the first option", () => {
    const item = question()

    expect(questionDefaultSelection(item)).toEqual(["option:0"])
    expect(buildQuestionAnswer(item, ["option:0"], "")).toEqual(["App Safety Layer"])
  })

  test("multi-select questions toggle multiple choices", () => {
    const item = question({ multiple: true })
    let selected: string[] = []

    selected = toggleQuestionSelection(selected, "option:0", true)
    selected = toggleQuestionSelection(selected, "option:1", true)
    expect(selected).toEqual(["option:0", "option:1"])

    selected = toggleQuestionSelection(selected, "option:0", true)
    expect(selected).toEqual(["option:1"])
    expect(buildQuestionAnswer(item, selected, "")).toEqual(["Agent Instructions"])
  })

  test("custom answers are final choices and submit trimmed custom text", () => {
    const item = question({ options: [], custom: true })

    expect(questionDefaultSelection(item)).toEqual([CUSTOM_ANSWER_ID])
    expect(buildQuestionAnswer(item, [CUSTOM_ANSWER_ID], "  No file deletion without asking  ")).toEqual([
      "No file deletion without asking",
    ])
    expect(buildQuestionAnswer(item, [CUSTOM_ANSWER_ID], "   ")).toEqual([])
  })

  test("permission choices map to stable permission decisions", () => {
    const choices = buildPermissionChoiceOptions({
      allowAlways: "Allow always",
      allowOnce: "Allow once",
      deny: "Deny",
    })

    expect(choices.map((choice) => choice.id)).toEqual(["once", "always", "reject"])
    expect(choices[0]?.label).toBe("Allow once (Recommended)")
    expect(permissionDecisionFromChoice("once")).toBe("once")
    expect(permissionDecisionFromChoice("always")).toBe("always")
    expect(permissionDecisionFromChoice("reject")).toBe("reject")
    expect(permissionDecisionFromChoice("other")).toBeUndefined()
  })

  test("keyboard shortcuts resolve to the expected prompt actions", () => {
    const action = (input: Partial<Parameters<typeof resolveSessionChoiceKeyAction>[0]>) =>
      resolveSessionChoiceKeyAction({ key: "Enter", optionCount: 4, ...input }) as SessionChoiceKeyAction

    expect(action({ key: "2" })).toEqual({ type: "select", index: 1, preventDefault: true })
    expect(action({ key: "ArrowDown" })).toEqual({ type: "move", delta: 1, preventDefault: true })
    expect(action({ key: "ArrowUp" })).toEqual({ type: "move", delta: -1, preventDefault: true })
    expect(action({ key: "ArrowLeft", hasProgress: true, previousDisabled: false })).toEqual({
      type: "previous",
      preventDefault: true,
    })
    expect(action({ key: "ArrowRight", hasProgress: true, nextDisabled: false })).toEqual({
      type: "next",
      preventDefault: true,
    })
    expect(action({ key: "Enter" })).toEqual({ type: "continue", preventDefault: true })
    expect(action({ key: "Escape" })).toEqual({ type: "dismiss", preventDefault: true })
    expect(action({ key: "Escape", disabled: true })).toEqual({ type: "none", preventDefault: true })
    expect(action({ key: "Enter", inTextInput: true, shiftKey: true })).toEqual({
      type: "none",
      preventDefault: false,
    })
  })
})
