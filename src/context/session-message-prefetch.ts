import { batch, onCleanup, untrack } from "solid-js"
import { produce, reconcile } from "solid-js/store"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { retry } from "@opencode-ai/util/retry"
import { message as clean } from "@/utils/diffs"
import type { useGlobalSDK } from "./global-sdk"
import type { useGlobalSync } from "./global-sync"
import {
  clearSessionPrefetch,
  getSessionPrefetch,
  isSessionPrefetchCurrent,
  runSessionPrefetch,
  setSessionPrefetch,
  shouldSkipSessionPrefetch,
} from "./global-sync/session-prefetch"
import { dropSessionCaches, pickSessionCacheEvictions } from "./global-sync/session-cache"

export type SessionPrefetchPriority = "high" | "low"

export const SHOB_PREFETCH_CHUNK = 200
export const SHOB_PREFETCH_CONCURRENCY = 2
export const SHOB_PREFETCH_PENDING_LIMIT = 10
export const SHOB_PREFETCH_ACTIVE_SPAN = 4
export const SHOB_PREFETCH_HOVER_SPAN = 2
export const SHOB_PREFETCH_MAX_SESSIONS_PER_DIR = 10

const SKIP_PARTS = new Set(["patch", "step-start", "step-finish"])

type GlobalSDK = ReturnType<typeof useGlobalSDK>
type GlobalSync = ReturnType<typeof useGlobalSync>

type PrefetchQueue = {
  inflight: Set<string>
  pending: string[]
  pendingSet: Set<string>
  running: number
}

type MessageResponseItem = {
  info?: Message
  parts?: Part[]
}

export type WarmSessionPlanItem<T> = {
  session: T
  priority: SessionPrefetchPriority
}

const hasSessionID = (sessionID: string | null | undefined): sessionID is string =>
  !!sessionID && sessionID.startsWith("ses")

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function sortParts(parts: Part[]) {
  return parts.filter((part) => !!part?.id).sort((a, b) => cmp(a.id, b.id))
}

export function mergeByID<T extends { id: string }>(current: readonly T[], incoming: readonly T[]) {
  const map = new Map<string, T>()
  for (const item of current) map.set(item.id, item)
  for (const item of incoming) map.set(item.id, item)
  return [...map.values()].sort((a, b) => cmp(a.id, b.id))
}

export function pickWarmSessionPlan<T extends { id: string }>(
  sessions: readonly T[],
  sessionID: string | undefined,
  span: number,
) {
  if (!sessionID) return [] as WarmSessionPlanItem<T>[]

  const index = sessions.findIndex((session) => session.id === sessionID)
  if (index === -1) return [] as WarmSessionPlanItem<T>[]

  const plan: WarmSessionPlanItem<T>[] = [{ session: sessions[index], priority: "high" }]
  for (let offset = 1; offset <= span; offset++) {
    const next = sessions[index + offset]
    if (next) plan.push({ session: next, priority: offset === 1 ? "high" : "low" })

    const previous = sessions[index - offset]
    if (previous) plan.push({ session: previous, priority: offset === 1 ? "high" : "low" })
  }

  return plan
}

export function buildPrefetchPage(input: { items: readonly MessageResponseItem[]; cursor?: string }) {
  const items = input.items.filter((item): item is { info: Message; parts?: Part[] } => !!item.info?.id)
  const messages = mergeByID(
    [],
    items.map((item) => clean(item.info)),
  )
  const parts = items.map((item) => ({
    id: item.info.id,
    parts: sortParts((item.parts ?? []).filter((part) => !SKIP_PARTS.has(part.type))),
  }))

  return {
    messages,
    parts,
    cursor: input.cursor,
    complete: !input.cursor,
  }
}

export function createPrefetchedSessionTracker(limit = SHOB_PREFETCH_MAX_SESSIONS_PER_DIR) {
  const prefetchedByDir = new Map<string, Set<string>>()

  const lruFor = (directory: string) => {
    const existing = prefetchedByDir.get(directory)
    if (existing) return existing
    const created = new Set<string>()
    prefetchedByDir.set(directory, created)
    return created
  }

  return {
    mark(directory: string, sessionID: string, preserve?: Iterable<string>) {
      return pickSessionCacheEvictions({
        seen: lruFor(directory),
        keep: sessionID,
        limit,
        preserve,
      })
    },
    prune(activeDirectories: Iterable<string>) {
      const active = new Set(activeDirectories)
      for (const directory of prefetchedByDir.keys()) {
        if (!active.has(directory)) prefetchedByDir.delete(directory)
      }
    },
    has(directory: string, sessionID: string) {
      return prefetchedByDir.get(directory)?.has(sessionID) ?? false
    },
    size(directory: string) {
      return prefetchedByDir.get(directory)?.size ?? 0
    },
  }
}

export function createSessionMessagePrefetcher(input: {
  globalSDK: GlobalSDK
  globalSync: GlobalSync
  chunk?: number
  concurrency?: number
  pendingLimit?: number
  cacheLimit?: number
}) {
  const chunk = input.chunk ?? SHOB_PREFETCH_CHUNK
  const concurrency = input.concurrency ?? SHOB_PREFETCH_CONCURRENCY
  const pendingLimit = input.pendingLimit ?? SHOB_PREFETCH_PENDING_LIMIT
  const queues = new Map<string, PrefetchQueue>()
  const token = { value: 0 }
  const tracker = createPrefetchedSessionTracker(input.cacheLimit ?? SHOB_PREFETCH_MAX_SESSIONS_PER_DIR)
  const preserveByDir = new Map<string, Set<string>>()

  const queueFor = (directory: string) => {
    const existing = queues.get(directory)
    if (existing) return existing

    const created: PrefetchQueue = {
      inflight: new Set(),
      pending: [],
      pendingSet: new Set(),
      running: 0,
    }
    queues.set(directory, created)
    return created
  }

  const clearStale = (directory: string, stale: string[]) => {
    if (stale.length === 0) return
    clearSessionPrefetch(directory, stale)
    for (const sessionID of stale) input.globalSync.todo.set(sessionID, undefined)
  }

  async function prefetchMessages(directory: string, sessionID: string, value: number) {
    const [store, setStore] = input.globalSync.child(directory, { bootstrap: false })
    const client = input.globalSDK.createClient({ directory, throwOnError: true })

    return runSessionPrefetch({
      directory,
      sessionID,
      task: (revision) =>
        retry(() => client.session.messages({ sessionID, limit: chunk }))
          .then((response) => {
            if (token.value !== value) return
            if (!isSessionPrefetchCurrent(directory, sessionID, revision)) return

            const cursor = response.response.headers.get("x-next-cursor") ?? undefined
            const page = buildPrefetchPage({ items: response.data ?? [], cursor })
            const stale = tracker.mark(directory, sessionID, preserveByDir.get(directory))
            const meta = {
              limit: page.messages.length,
              cursor: page.cursor,
              complete: page.complete,
              at: Date.now(),
            }

            const current = store.message[sessionID] ?? []
            const mergedMessages = mergeByID(
              current.filter((item): item is Message & { id: string } => !!item?.id),
              page.messages,
            )

            if (!isSessionPrefetchCurrent(directory, sessionID, revision)) return

            batch(() => {
              if (stale.length > 0) {
                clearStale(directory, stale)
                setStore(
                  produce((draft) => {
                    dropSessionCaches(draft as Parameters<typeof dropSessionCaches>[0], stale)
                  }),
                )
              }

              setStore("message", sessionID, reconcile(mergedMessages, { key: "id" }))
              setSessionPrefetch({ directory, sessionID, ...meta })

              for (const item of page.parts) {
                const currentParts = store.part[item.id] ?? []
                const mergedParts = mergeByID(
                  currentParts.filter((part): part is Part & { id: string } => !!part?.id),
                  item.parts,
                )
                if (mergedParts.length) setStore("part", item.id, reconcile(mergedParts, { key: "id" }))
              }
            })

            return meta
          })
          .catch(() => undefined),
    })
  }

  const pump = (directory: string) => {
    const queue = queueFor(directory)
    if (queue.running >= concurrency) return

    const sessionID = queue.pending.shift()
    if (!sessionID) return

    queue.pendingSet.delete(sessionID)
    queue.inflight.add(sessionID)
    queue.running += 1

    const value = token.value
    void prefetchMessages(directory, sessionID, value).finally(() => {
      queue.running -= 1
      queue.inflight.delete(sessionID)
      pump(directory)
      if (queue.running === 0 && queue.pending.length === 0) queues.delete(directory)
    })
  }

  const prefetchSession = (directory: string | undefined | null, sessionID: string | undefined | null, priority: SessionPrefetchPriority = "low") => {
    if (!directory || !hasSessionID(sessionID)) return

    const [store] = input.globalSync.child(directory, { bootstrap: false })
    const cached = untrack(() =>
      shouldSkipSessionPrefetch({
        message: store.message[sessionID] !== undefined,
        info: getSessionPrefetch(directory, sessionID),
        chunk,
      }),
    )
    if (cached) return

    const queue = queueFor(directory)
    if (queue.inflight.has(sessionID)) return
    if (queue.pendingSet.has(sessionID)) {
      if (priority !== "high") return
      const index = queue.pending.indexOf(sessionID)
      if (index > 0) {
        queue.pending.splice(index, 1)
        queue.pending.unshift(sessionID)
      }
      return
    }

    if (priority === "high") queue.pending.unshift(sessionID)
    else queue.pending.push(sessionID)
    queue.pendingSet.add(sessionID)

    while (queue.pending.length > pendingLimit) {
      const dropped = queue.pending.pop()
      if (dropped) queue.pendingSet.delete(dropped)
    }

    pump(directory)
  }

  onCleanup(() => {
    token.value += 1
    queues.clear()
    preserveByDir.clear()
  })

  return {
    prefetchSession,
    warmSessions<T extends { id: string }>(
      directory: string | undefined | null,
      sessions: readonly T[],
      sessionID: string | undefined | null,
      span = SHOB_PREFETCH_ACTIVE_SPAN,
    ) {
      if (!directory || !sessionID) return
      for (const item of pickWarmSessionPlan(sessions, sessionID, span)) {
        prefetchSession(directory, item.session.id, item.priority)
      }
    },
    preserve(directory: string | undefined | null, sessionIDs: Iterable<string | undefined | null>) {
      if (!directory) return
      const ids = Array.from(sessionIDs).filter((sessionID): sessionID is string => hasSessionID(sessionID))
      if (ids.length === 0) {
        preserveByDir.delete(directory)
        return
      }
      preserveByDir.set(directory, new Set(ids))
    },
    prune(activeDirectories: Iterable<string>) {
      const active = new Set(Array.from(activeDirectories).filter(Boolean))
      tracker.prune(active)
      for (const [directory, queue] of queues) {
        if (active.has(directory)) continue
        queue.pending.length = 0
        queue.pendingSet.clear()
        if (queue.running === 0) queues.delete(directory)
      }
      for (const directory of preserveByDir.keys()) {
        if (!active.has(directory)) preserveByDir.delete(directory)
      }
    },
    reset() {
      token.value += 1
      queues.clear()
      preserveByDir.clear()
    },
  }
}
