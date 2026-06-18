import type { Platform } from "@/context/platform"
import { decode64 } from "@/utils/base64"
import { Persist, removePersisted } from "@/utils/persist"

const SESSION_PERSISTED_STATE_KEYS = [
  { key: "prompt", legacy: "prompt", version: "v2" },
  { key: "terminal", legacy: "terminal", version: "v1" },
  { key: "file-view", legacy: "file", version: "v1" },
  { key: "comments", legacy: "comments", version: "v1" },
] as const

export function listSessionPersistTargets(directory: string, sessionId: string) {
  return SESSION_PERSISTED_STATE_KEYS.flatMap((entry) => [
    Persist.session(directory, sessionId, entry.key),
    { key: `${directory}/${entry.legacy}/${sessionId}.${entry.version}` },
  ])
}

export function removePersistedSessionState(input: {
  directory: string
  sessionId: string
  platform?: Platform
}) {
  for (const target of listSessionPersistTargets(input.directory, input.sessionId)) {
    void removePersisted(target, input.platform)
  }
}

export function parseSessionStateKey(sessionKey: string) {
  const split = sessionKey.indexOf("/")
  if (split <= 0 || split >= sessionKey.length - 1) return

  const directory = decode64(sessionKey.slice(0, split))
  const sessionId = sessionKey.slice(split + 1)
  if (!directory || !sessionId) return

  return { directory, sessionId }
}

export function removePersistedSessionStateForKeys(sessionKeys: Iterable<string>, platform?: Platform) {
  for (const key of sessionKeys) {
    const parsed = parseSessionStateKey(key)
    if (!parsed) continue
    removePersistedSessionState({ ...parsed, platform })
  }
}
