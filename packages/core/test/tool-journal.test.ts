import { expect, test } from "bun:test"
import { Effect } from "effect"
import { EventV2 } from "@shob/core/event"
import { SessionEvent } from "@shob/core/session/event"
import { ConfigToolExecution } from "@shob/core/config/tool-execution"
import { ToolEventJournal, coalesceProgress, type JournalEvent } from "@shob/core/session/tool-journal"

const progress = (callID: string, text: string): JournalEvent => ({
  definition: SessionEvent.Tool.Progress,
  data: {
    sessionID: "ses_x",
    timestamp: 0,
    assistantMessageID: "msg_x",
    callID,
    structured: {},
    content: [{ type: "text", text }],
  } as never,
})

const called = (callID: string): JournalEvent => ({
  definition: SessionEvent.Tool.Called,
  data: {
    sessionID: "ses_x",
    timestamp: 0,
    assistantMessageID: "msg_x",
    callID,
    tool: "bash",
    input: {},
    provider: { executed: false },
  } as never,
})

test("coalesceProgress merges consecutive same-call progress events and preserves order", () => {
  const events = [called("a"), progress("a", "line1\n"), progress("a", "line2\n"), called("b"), progress("b", "x\n")]
  const out = coalesceProgress(events)
  expect(out.map((event) => event.definition.type)).toEqual([
    "session.next.tool.called",
    "session.next.tool.progress",
    "session.next.tool.called",
    "session.next.tool.progress",
  ])
  const merged = out[1].data as { content: ReadonlyArray<{ text: string }> }
  expect(merged.content.map((part) => part.text).join("")).toBe("line1\nline2\n")
  const last = out[3].data as { content: ReadonlyArray<{ text: string }> }
  expect(last.content[0]?.text).toBe("x\n")
})

test("state transition events flush immediately while progress stays buffered", async () => {
  const batches: Array<Array<string>> = []
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const journal = yield* ToolEventJournal.make("ses_x", (batch) =>
          Effect.sync(() => {
            batches.push(batch.map((event) => event.definition.type))
          }), ConfigToolExecution.DEFAULTS)
        yield* journal.append(called("a"))
        expect(journal.pendingCount()).toBe(0)
        expect(batches).toEqual([["session.next.tool.called"]])
        yield* journal.append(progress("a", "1"))
        expect(journal.pendingCount()).toBe(1)
      }),
    ),
  )
})

test("buffered journal buffers progress and persists ordered batches, draining the tail", async () => {
  const batches: Array<Array<string>> = []
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const journal = yield* ToolEventJournal.make("ses_x", (batch) =>
          Effect.sync(() => {
            batches.push(batch.map((event) => event.definition.type))
          }), ConfigToolExecution.DEFAULTS)
        yield* journal.append(progress("a", "1"))
        yield* journal.append(progress("b", "2"))
        expect(journal.pendingCount()).toBe(2)
        yield* journal.flush()
        expect(journal.pendingCount()).toBe(0)
        yield* journal.append(progress("c", "3"))
        yield* journal.drain()
      }),
    ),
  )
  expect(batches).toEqual([
    ["session.next.tool.progress", "session.next.tool.progress"],
    ["session.next.tool.progress"],
  ])
})

test("backpressure forces a flush at the memory ceiling", async () => {
  const batches: Array<number> = []
  const config = { ...ConfigToolExecution.DEFAULTS, mode: "buffered" as const, journalMemoryLimit: 2 }
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const journal = yield* ToolEventJournal.make("ses_x", (batch) =>
          Effect.sync(() => {
            batches.push(batch.length)
          }), config)
        yield* journal.append(progress("a", "1"))
        yield* journal.append(progress("b", "2"))
        // Third append crosses the ceiling and triggers a synchronous flush.
        yield* journal.append(progress("c", "3"))
        yield* journal.drain()
      }),
    ),
  )
  expect(batches.length).toBeGreaterThanOrEqual(2)
  expect(batches[0]).toBe(2)
})

test("timer flush persists buffered events before explicit drain", async () => {
  const batches: Array<number> = []
  const config = { ...ConfigToolExecution.DEFAULTS, mode: "buffered" as const, journalFlushIntervalMs: 5 }
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const journal = yield* ToolEventJournal.make("ses_x", (batch) =>
          Effect.sync(() => {
            batches.push(batch.length)
          }), config)
        yield* journal.append(progress("a", "1"))
        yield* Effect.sleep(30)
        expect(batches.length).toBeGreaterThanOrEqual(1)
        yield* journal.drain()
      }),
    ),
  )
})
