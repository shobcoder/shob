import type { PermissionRequest, QuestionRequest, Session } from "@shob-ai/sdk/v2/client"

function sessionTreeRequest<T extends { sessionID: string }>(
  session: Session[],
  request: Record<string, T[]>,
  sessionID?: string,
  include?: (value: T) => boolean,
) {
  if (!sessionID) return

  const byParent = new Map<string, string[]>()
  for (const item of session) {
    const parent = item.parentID
    if (!parent) continue
    const list = byParent.get(parent)
    if (list) list.push(item.id)
    else byParent.set(parent, [item.id])
  }

  const seen = new Set([sessionID])
  const queue = [sessionID]
  while (queue.length > 0) {
    const current = queue.shift()!
    const children = byParent.get(current) ?? []
    for (const child of children) {
      if (seen.has(child)) continue
      seen.add(child)
      queue.push(child)
    }
  }

  const ids = Array.from(seen)
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i]
    const items = request[id] ?? []
    for (const item of items) {
      if (!include || include(item)) return item
    }
  }
}

export function sessionPermissionRequest(
  session: Session[],
  request: Record<string, PermissionRequest[]>,
  sessionID?: string,
  include?: (value: PermissionRequest) => boolean,
) {
  return sessionTreeRequest(session, request, sessionID, include)
}

export function sessionQuestionRequest(
  session: Session[],
  request: Record<string, QuestionRequest[]>,
  sessionID?: string,
  include?: (value: QuestionRequest) => boolean,
) {
  return sessionTreeRequest(session, request, sessionID, include)
}

