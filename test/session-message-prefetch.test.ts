import { describe, expect, test } from "bun:test"
import {
  buildPrefetchPage,
  createPrefetchedSessionTracker,
  mergeByID,
  pickWarmSessionPlan,
} from "../src/context/session-message-prefetch"
import {
  clearSessionPrefetch,
  runSessionPrefetch,
  shouldSkipSessionPrefetch,
} from "../src/context/global-sync/session-prefetch"

const message = (id: string, role: "user" | "assistant" = "user") =>
  ({
    id,
    sessionID: "ses_test",
    role,
    time: { created: 1 },
  }) as any

const part = (id: string, type = "text") =>
  ({
    id,
    messageID: "msg",
    sessionID: "ses_test",
    type,
  }) as any

describe("session message prefetch helpers", () => {
  test("plans active and neighboring sessions with opencode-like priority", () => {
    const sessions = ["a", "b", "c", "d", "e"].map((id) => ({ id }))

    expect(pickWarmSessionPlan(sessions, "c", 2)).toEqual([
      { session: { id: "c" }, priority: "high" },
      { session: { id: "d" }, priority: "high" },
      { session: { id: "b" }, priority: "high" },
      { session: { id: "e" }, priority: "low" },
      { session: { id: "a" }, priority: "low" },
    ])
  })

  test("merges cached and incoming rows by id", () => {
    expect(
      mergeByID(
        [
          { id: "b", value: "old" },
          { id: "c", value: "kept" },
        ],
        [
          { id: "a", value: "new" },
          { id: "b", value: "updated" },
        ],
      ),
    ).toEqual([
      { id: "a", value: "new" },
      { id: "b", value: "updated" },
      { id: "c", value: "kept" },
    ])
  })

  test("builds first-page cache data and filters non-rendered parts", () => {
    const page = buildPrefetchPage({
      cursor: "next",
      items: [
        { info: message("msg_b"), parts: [part("part_b2", "step-start"), part("part_b1")] },
        { info: undefined, parts: [part("part_missing")] },
        { info: message("msg_a", "assistant"), parts: [part("part_a")] },
      ],
    })

    expect(page.complete).toBe(false)
    expect(page.cursor).toBe("next")
    expect(page.messages.map((item) => item.id)).toEqual(["msg_a", "msg_b"])
    expect(page.parts).toEqual([
      { id: "msg_b", parts: [part("part_b1")] },
      { id: "msg_a", parts: [part("part_a")] },
    ])
  })

  test("tracks prefetched sessions with LRU eviction and preserve support", () => {
    const tracker = createPrefetchedSessionTracker(2)

    expect(tracker.mark("dir", "ses_a")).toEqual([])
    expect(tracker.mark("dir", "ses_b")).toEqual([])
    expect(tracker.mark("dir", "ses_c", ["ses_a"])).toEqual(["ses_b"])
    expect(tracker.has("dir", "ses_a")).toBe(true)
    expect(tracker.has("dir", "ses_b")).toBe(false)
    expect(tracker.has("dir", "ses_c")).toBe(true)

    tracker.prune(["other"])
    expect(tracker.size("dir")).toBe(0)
  })

  test("dedupes inflight prefetch work by directory and session", async () => {
    clearSessionPrefetch("dir", ["ses_a"])
    let runs = 0

    const first = runSessionPrefetch({
      directory: "dir",
      sessionID: "ses_a",
      task: async () => {
        runs += 1
        await Promise.resolve()
        return { limit: 1, complete: true, at: Date.now() }
      },
    })
    const second = runSessionPrefetch({
      directory: "dir",
      sessionID: "ses_a",
      task: async () => {
        runs += 1
        return { limit: 2, complete: true, at: Date.now() }
      },
    })

    expect(first).toBe(second)
    await first
    expect(runs).toBe(1)
    clearSessionPrefetch("dir", ["ses_a"])
  })

  test("skips fresh cached first pages but refreshes stale partial data", () => {
    const now = 20_000

    expect(
      shouldSkipSessionPrefetch({
        message: true,
        chunk: 200,
        info: { limit: 200, complete: false, at: now },
        now,
      }),
    ).toBe(true)

    expect(
      shouldSkipSessionPrefetch({
        message: true,
        chunk: 200,
        info: { limit: 80, complete: false, at: 0 },
        now,
      }),
    ).toBe(false)
  })
})
