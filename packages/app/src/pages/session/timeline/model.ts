import type { Message, UserMessage } from "@shob/sdk/v2"
import { createEffect, createMemo, on, onCleanup, untrack, type Accessor } from "solid-js"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { same } from "@/utils/same"

const emptyUserMessages: UserMessage[] = []
const sessionFreshness = 15_000

export function createTimelineModel(input: {
  sessionID: Accessor<string | undefined>
  revertMessageID: Accessor<string | undefined>
}) {
  const serverSync = useServerSync()
  const sync = useSync()
  let refreshFrame: number | undefined
  let refreshTimer: number | undefined

  // Imperative sync (not createResource): reading a resource under the layout
  // <Suspense> suspends Solid Router's navigation transition and deadlocks the
  // first open for cold sessions. Message readiness is derived from the store.
  createEffect(
    on(
      () => input.sessionID(),
      (id) => {
        clearRefresh()
        if (!id) return

        const cached = untrack(() => sync().data.message[id] !== undefined)
        const stale = cached && !serverSync().session.fresh(id, sessionFreshness)

        refreshFrame = requestAnimationFrame(() => {
          refreshFrame = undefined
          refreshTimer = window.setTimeout(() => {
            refreshTimer = undefined
            if (input.sessionID() !== id) return
            untrack(() => {
              if (stale) void sync().session.sync(id, { force: true })
            })
          }, 0)
        })

        void sync().session.sync(id)
      },
    ),
  )

  const messages = createMemo(() => {
    const id = input.sessionID()
    return id ? (sync().data.message[id] ?? []) : []
  })
  const ready = createMemo(() => {
    const id = input.sessionID()
    return !id || sync().data.message[id] !== undefined
  })
  const userMessages = createMemo(() => selectUserMessages(messages()), emptyUserMessages, { equals: same })
  const visibleUserMessages = createMemo(
    () => {
      return selectVisibleUserMessages(userMessages(), input.revertMessageID())
    },
    emptyUserMessages,
    { equals: same },
  )
  const more = createMemo(() => {
    const id = input.sessionID()
    return id ? sync().session.history.more(id) : false
  })
  const loading = createMemo(() => {
    const id = input.sessionID()
    return id ? sync().session.history.loading(id) : false
  })
  const loadOlder = async (options?: { before?: () => void; after?: (done: boolean) => void }) => {
    return loadOlderTimeline({
      sessionID: input.sessionID,
      more,
      loading,
      loadMore: (sessionID) => sync().session.history.loadMore(sessionID),
      before: options?.before,
      after: options?.after,
    })
  }

  onCleanup(clearRefresh)

  return {
    history: { loadOlder, loading, more },
    lastUserMessage: createMemo(() => visibleUserMessages().at(-1)),
    messages,
    ready,
    userMessages,
    visibleUserMessages,
  }

  function clearRefresh() {
    if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame)
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
    refreshFrame = undefined
    refreshTimer = undefined
  }
}

export function selectUserMessages(messages: Message[]) {
  return messages.filter((message): message is UserMessage => message.role === "user")
}

export function selectVisibleUserMessages(messages: UserMessage[], revertMessageID?: string) {
  if (!revertMessageID) return messages
  return messages.filter((message) => message.id < revertMessageID)
}

export async function loadOlderTimeline(input: {
  sessionID: Accessor<string | undefined>
  more: Accessor<boolean>
  loading: Accessor<boolean>
  loadMore: (sessionID: string) => Promise<void>
  before?: () => void
  after?: (done: boolean) => void
}) {
  const id = input.sessionID()
  if (!id || !input.more() || input.loading()) return

  input.before?.()
  await input.loadMore(id).catch((error) => {
    if (input.sessionID() === id) input.after?.(true)
    throw error
  })
  if (input.sessionID() !== id) return
  input.after?.(true)
}
