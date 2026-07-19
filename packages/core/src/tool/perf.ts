export * as ToolPerf from "./perf"

import { Effect } from "effect"

/** Monotonic clock in milliseconds with sub-millisecond precision where available. */
export const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()

export interface Span {
  readonly name: string
  readonly startedAt: number
  readonly endedAt?: number
  readonly meta?: Record<string, unknown>
}

/** Open a span and return a marker that closes it, returning elapsed milliseconds. */
export const span = (name: string, meta?: Record<string, unknown>) => {
  const startedAt = now()
  return {
    name,
    startedAt,
    meta,
    end: (endMeta?: Record<string, unknown>): Span & { readonly elapsedMs: number } => {
      const endedAt = now()
      return { name, startedAt, endedAt, meta: { ...meta, ...endMeta }, elapsedMs: endedAt - startedAt }
    },
  }
}

export interface ToolTimings {
  readonly parseMs: number
  readonly admissionMs: number
  readonly registryMs: number
  readonly permissionMs: number
  readonly executionStartMs: number
  readonly firstOutputMs?: number
  readonly settlementMs: number
  readonly commitMs?: number
  readonly deliveryMs?: number
}

const reporter = (timings: ToolTimings, context: Record<string, unknown>) =>
  Effect.logDebug("tool.execution.timings", { ...timings, ...context })

/** Wrap an effect with a named span, reporting the collected timings on completion. */
export const trace = <A, E>(
  build: (mark: (stage: keyof ToolTimings, value?: number) => void) => Effect.Effect<A, E>,
  context: Record<string, unknown> = {},
) =>
  Effect.gen(function* () {
    const base = now()
    const values = {} as Record<string, number>
    const mark = (stage: keyof ToolTimings, value?: number) => {
      values[stage] = value ?? now() - base
    }
    const result = yield* build(mark)
    const timings: ToolTimings = {
      parseMs: values.parseMs ?? 0,
      admissionMs: values.admissionMs ?? 0,
      registryMs: values.registryMs ?? 0,
      permissionMs: values.permissionMs ?? 0,
      executionStartMs: values.executionStartMs ?? 0,
      firstOutputMs: values.firstOutputMs,
      settlementMs: values.settlementMs ?? 0,
      commitMs: values.commitMs,
      deliveryMs: values.deliveryMs,
    }
    yield* reporter(timings, context)
    return result
  })
