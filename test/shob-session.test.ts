import { describe, expect, test } from "bun:test"
import {
  findReusableEmptyRootShobSession,
  normalizeShobSessionTitle,
  sessionHasUserPrompt,
  toLocalShobSession,
  type ShobSessionLike,
} from "../src/utils/shob-session.ts"

const session = (overrides: Partial<ShobSessionLike> = {}): ShobSessionLike => ({
  id: "ses_empty",
  time: {
    created: 100,
    updated: 100,
  },
  ...overrides,
})

describe("shob session helpers", () => {
  test("normalizes missing and placeholder titles to New session", () => {
    expect(normalizeShobSessionTitle()).toBe("New session")
    expect(normalizeShobSessionTitle("")).toBe("New session")
    expect(normalizeShobSessionTitle("Terminal")).toBe("New session")
    expect(normalizeShobSessionTitle("New session - 2026-06-06T01:23:57.000Z")).toBe("New session")
  })

  test("keeps generated titles for sidebar display", () => {
    expect(normalizeShobSessionTitle("Fix sidebar session cleanup")).toBe("Fix sidebar session cleanup")
    expect(toLocalShobSession(session({ title: "Implement reusable empty sessions" })).name).toBe(
      "Implement reusable empty sessions",
    )
  })

  test("detects whether a session has a user prompt", () => {
    expect(sessionHasUserPrompt(undefined)).toBe(false)
    expect(sessionHasUserPrompt([])).toBe(false)
    expect(sessionHasUserPrompt([{ role: "assistant" }])).toBe(false)
    expect(sessionHasUserPrompt([{ role: "assistant" }, { role: "user" }])).toBe(true)
  })

  test("reuses a known-empty root session", () => {
    const empty = session({ id: "ses_empty", time: { created: 100, updated: 120 } })
    const prompted = session({ id: "ses_prompted", time: { created: 200, updated: 220 } })

    expect(
      findReusableEmptyRootShobSession(
        [empty, prompted],
        {
          ses_empty: [],
          ses_prompted: [{ role: "user" }],
        },
        null,
      )?.id,
    ).toBe("ses_empty")
  })

  test("does not reuse prompted, child, archived, or unknown-message sessions", () => {
    const sessions = [
      session({ id: "ses_prompted" }),
      session({ id: "ses_child", parentID: "ses_parent" }),
      session({ id: "ses_archived", time: { created: 100, updated: 100, archived: 110 } }),
      session({ id: "ses_unknown" }),
    ]

    expect(
      findReusableEmptyRootShobSession(sessions, {
        ses_prompted: [{ role: "user" }],
        ses_child: [],
        ses_archived: [],
      }),
    ).toBeUndefined()
  })

  test("prefers the active empty session when several are reusable", () => {
    const older = session({ id: "ses_older", time: { created: 100, updated: 100 } })
    const newer = session({ id: "ses_newer", time: { created: 200, updated: 200 } })

    expect(
      findReusableEmptyRootShobSession(
        [older, newer],
        {
          ses_older: [],
          ses_newer: [],
        },
        "ses_older",
      )?.id,
    ).toBe("ses_older")
  })
})
