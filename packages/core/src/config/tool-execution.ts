export * as ConfigToolExecution from "./tool-execution"

import { Schema } from "effect"
import { PositiveInt } from "../schema"

export class Info extends Schema.Class<Info>("ConfigV2.ToolExecution")({
  /** Execution mode. "buffered" batches SQLite persistence of tool events for lower dispatch latency; "durable" persists each event immediately. */
  mode: Schema.Literals(["durable", "buffered"]).pipe(Schema.optional).annotate({
    description: "Tool event persistence mode. Buffered batches persistence for lower latency; durable persists immediately.",
  }),
  /** Maximum number of tool events buffered in memory before a forced flush. */
  journal_batch_size: PositiveInt.pipe(Schema.optional).annotate({
    description: "Number of buffered tool events per batch before an immediate flush.",
  }),
  /** Maximum milliseconds a tool event may stay buffered before a timed flush. */
  journal_flush_interval_ms: PositiveInt.pipe(Schema.optional).annotate({
    description: "Maximum milliseconds buffered tool events wait before a timed flush.",
  }),
  /** Soft ceiling on the number of buffered events; backpressure applies beyond it. */
  journal_memory_limit: PositiveInt.pipe(Schema.optional).annotate({
    description: "Soft in-memory ceiling for buffered tool events before backpressure applies.",
  }),
  /** Coalesced shell output chunk size in bytes before a progress event is emitted. */
  shell_chunk_bytes: PositiveInt.pipe(Schema.optional).annotate({
    description: "Coalesced shell stdout/stderr chunk size in bytes before a progress event is emitted.",
  }),
  /** UI coalescing interval in milliseconds for live shell output rendering. */
  shell_ui_coalesce_ms: PositiveInt.pipe(Schema.optional).annotate({
    description: "Interval in milliseconds the UI coalesces live shell output before rendering.",
  }),
}) {}

export type Mode = "durable" | "buffered"

export interface Resolved {
  readonly mode: Mode
  readonly journalBatchSize: number
  readonly journalFlushIntervalMs: number
  readonly journalMemoryLimit: number
  readonly shellChunkBytes: number
  readonly shellUiCoalesceMs: number
}

export const DEFAULTS: Resolved = {
  mode: "buffered",
  journalBatchSize: 64,
  journalFlushIntervalMs: 16,
  journalMemoryLimit: 4096,
  shellChunkBytes: 4096,
  shellUiCoalesceMs: 16,
}

/** Merge user-provided config with safe built-in defaults. */
export const resolve = (info: Info | undefined): Resolved => ({
  mode: info?.mode ?? DEFAULTS.mode,
  journalBatchSize: info?.journal_batch_size ?? DEFAULTS.journalBatchSize,
  journalFlushIntervalMs: info?.journal_flush_interval_ms ?? DEFAULTS.journalFlushIntervalMs,
  journalMemoryLimit: info?.journal_memory_limit ?? DEFAULTS.journalMemoryLimit,
  shellChunkBytes: info?.shell_chunk_bytes ?? DEFAULTS.shellChunkBytes,
  shellUiCoalesceMs: info?.shell_ui_coalesce_ms ?? DEFAULTS.shellUiCoalesceMs,
})
