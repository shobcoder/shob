import { Effect, Fiber, Scope } from "effect"
import type { Data, Definition } from "@shob/schema/event"
import { ConfigToolExecution } from "../config/tool-execution"
import type { PublishOptions } from "../event"

export class ToolEventJournal {
  private constructor(
    readonly sessionID: string,
    private readonly persist: Persist,
    private readonly config: ConfigToolExecution.Resolved,
    private readonly pending: Array<JournalEvent>,
    private timer: Fiber.Fiber<void> | undefined,
  ) {}

  static make(
    sessionID: string,
    persist: Persist,
    config: ConfigToolExecution.Resolved,
  ): Effect.Effect<ToolEventJournal, never, Scope.Scope> {
    return Effect.gen(function* () {
      const pending: Array<JournalEvent> = []
      const journal = new ToolEventJournal(sessionID, persist, config, pending, undefined)
      if (config.mode === "buffered" && config.journalFlushIntervalMs > 0) {
        const fiber = yield* Effect.forkScoped(
          Effect.forever(
            journal
              .flush()
              .pipe(
                Effect.asVoid,
                Effect.andThen(Effect.sleep(config.journalFlushIntervalMs)),
                Effect.catchCause(() => Effect.void),
              ),
          ),
        )
        journal.timer = fiber
      }
      yield* Effect.addFinalizer(() => journal.drain())
      return journal
    })
  }

  pendingCount(): number {
    return this.pending.length
  }

  /**
   * Append an event. State transitions (started/completed/failed) flush immediately so the renderer and
   * projectors observe them without waiting for the timer; only the high-frequency progress firehose is
   * buffered and coalesced. Backpressure forces a flush at the memory ceiling.
   */
  append(event: JournalEvent): Effect.Effect<void> {
    const self = this
    return Effect.gen(function* () {
      self.pending.push(event)
      const isProgress = event.definition.type === "session.next.tool.progress"
      if (!isProgress || self.pending.length >= self.config.journalMemoryLimit) yield* self.flush()
    })
  }

  /** Force a synchronous flush of all buffered events, coalescing progress chunks. */
  flush(): Effect.Effect<void> {
    const self = this
    return Effect.gen(function* () {
      if (self.pending.length === 0) return
      const batch = self.pending.splice(0, self.pending.length)
      const coalesced = coalesceProgress(batch)
      if (coalesced.length === 0) return
      yield* self.persist(coalesced)
    })
  }

  /** Drain remaining buffered events and stop the flush timer. Used on graceful shutdown. */
  drain(): Effect.Effect<void> {
    const self = this
    return Effect.gen(function* () {
      if (self.timer) yield* Fiber.interrupt(self.timer)
      yield* self.flush()
    })
  }
}

export interface JournalEvent {
  readonly definition: Definition
  readonly data: Data<Definition>
  readonly options?: PublishOptions
}

export interface Persist {
  (events: ReadonlyArray<JournalEvent>): Effect.Effect<unknown>
}

/**
 * Per-session ordered in-memory journal that buffers tool lifecycle events and
 * flushes them to durable storage in ordered batches. In buffered mode the
 * renderer still observes events on the next flush boundary (coalesced with the
 * existing ~16ms UI flush), while SQLite persistence is amortized across many
 * events. A hard crash loses the uncommitted tail; restart reconciliation treats
 * any surviving running calls as interrupted.
 */
export const make = ToolEventJournal.make

/**
 * Merge consecutive Tool.Progress events for the same call into one bounded
 * event so SQLite and the renderer do not receive one event per chunk.
 */
export const coalesceProgress = (events: ReadonlyArray<JournalEvent>): Array<JournalEvent> => {
  const out: Array<JournalEvent> = []
  for (const event of events) {
    const last = out[out.length - 1]
    const isProgress = event.definition.type === "session.next.tool.progress"
    if (
      isProgress &&
      last &&
      last.definition.type === "session.next.tool.progress" &&
      (event.data as Record<string, unknown>).callID != null &&
      (event.data as Record<string, unknown>).callID === (last.data as Record<string, unknown>).callID
    ) {
      const merged = {
        ...(last.data as Record<string, unknown>),
        content: [
          ...((last.data as Record<string, unknown>).content as ReadonlyArray<unknown> ?? []),
          ...((event.data as Record<string, unknown>).content as ReadonlyArray<unknown> ?? []),
        ],
        structured: {
          ...((last.data as Record<string, unknown>).structured as Record<string, unknown> | undefined),
          ...((event.data as Record<string, unknown>).structured as Record<string, unknown> | undefined),
        },
      }
      out[out.length - 1] = { ...last, data: merged as Data<Definition> }
    } else {
      out.push(event)
    }
  }
  return out
}
