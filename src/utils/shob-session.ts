import type { Session as LocalSession } from "@/types"
import { nativeApi } from "@/services/native"
import { sessionTitle } from "./session-title"

const FALLBACK_SESSION_TITLE = "New session"
const PLACEHOLDER_SESSION_TITLES = new Set([FALLBACK_SESSION_TITLE, "Terminal"])

export type ShobSessionLike = {
  id: string
  directory?: string
  parentID?: string
  title?: string
  time?: {
    created?: number
    updated?: number
    archived?: number
  }
}

export type ShobMessageLike = {
  role?: string
}

export const shobSessionUpdatedAt = (session: ShobSessionLike) =>
  session.time?.updated ?? session.time?.created ?? 0

export const sortShobSessionsById = <T extends { id: string }>(sessions: T[]) =>
  [...sessions].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))

export function normalizeShobSessionTitle(title?: string | null) {
  const normalized = sessionTitle(title ?? undefined)?.trim()
  if (!normalized || PLACEHOLDER_SESSION_TITLES.has(normalized)) return FALLBACK_SESSION_TITLE
  return normalized
}

export function sameWorkspaceDirectory(left?: string | null, right?: string | null) {
  if (!left || !right) return false
  const normalize = (value: string) => value.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase()
  return normalize(left) === normalize(right)
}

export function preserveIsolatedWorkspaceSessions<T extends { id: string; workspaceDirectory?: string | null }>(
  projectDirectory: string,
  incomingSessions: readonly T[],
  existingSessions: readonly T[],
) {
  const incomingIDs = new Set(incomingSessions.map((session) => session.id))
  const isolatedSessions = existingSessions.filter(
    (session) =>
      !incomingIDs.has(session.id) &&
      Boolean(session.workspaceDirectory) &&
      !sameWorkspaceDirectory(session.workspaceDirectory, projectDirectory),
  )

  return [...incomingSessions, ...isolatedSessions]
}

export function sessionHasUserPrompt(messages: readonly ShobMessageLike[] | undefined) {
  return Boolean(messages?.some((message) => message.role === "user"))
}

export function isKnownEmptyRootShobSession(
  session: ShobSessionLike,
  messages: readonly ShobMessageLike[] | undefined,
) {
  return !session.parentID && !session.time?.archived && messages !== undefined && !sessionHasUserPrompt(messages)
}

export function findReusableEmptyRootShobSession<T extends ShobSessionLike>(
  sessions: readonly T[],
  messagesBySessionId: Record<string, readonly ShobMessageLike[] | undefined>,
  preferredSessionId?: string | null,
) {
  const emptySessions = sessions.filter((session) =>
    isKnownEmptyRootShobSession(session, messagesBySessionId[session.id]),
  )
  const preferred = preferredSessionId
    ? emptySessions.find((session) => session.id === preferredSessionId)
    : undefined
  if (preferred) return preferred

  return [...emptySessions].sort((left, right) => {
    const leftUpdated = shobSessionUpdatedAt(left)
    const rightUpdated = shobSessionUpdatedAt(right)
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated
    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0
  })[0]
}

export function toLocalShobSession(
  session: ShobSessionLike,
  options: { shell?: string | null; pinned?: boolean; projectDirectory?: string } = {},
): LocalSession {
  const now = Date.now()
  const createdAt = session.time?.created ?? now
  const lastActiveAt = session.time?.updated ?? createdAt

  const workspaceDirectory = session.directory ?? null
  const workspaceMode =
    workspaceDirectory && options.projectDirectory && !sameWorkspaceDirectory(workspaceDirectory, options.projectDirectory)
      ? "worktree"
      : "local"

  return {
    id: session.id,
    name: normalizeShobSessionTitle(session.title),
    workspaceMode,
    workspaceDirectory,
    managedWorktreeDirectory: workspaceMode === "worktree" ? workspaceDirectory : null,
    worktreeState: workspaceMode === "worktree" ? "ready" : undefined,
    parentSessionId: session.parentID ?? null,
    shell: options.shell ?? nativeApi.defaultShell(),
    cliTool: "opencode",
    pendingLaunchCommand: null,
    pinned: options.pinned ?? false,
    createdAt,
    lastActiveAt,
    commandCount: 0,
    startupDurationMs: null,
  }
}
