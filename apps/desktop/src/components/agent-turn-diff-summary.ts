import type { SnapshotFileDiff } from "@shob-ai/sdk/v2/client"

export const AGENT_REVIEW_OPEN_EVENT = "gg-open-review-workspace"
export const AGENT_TURN_DIFF_VISIBLE_LIMIT = 3

export type AgentTurnDiff = Pick<SnapshotFileDiff, "file" | "additions" | "deletions">

export type AgentTurnDiffSummary = {
  additions: number
  count: number
  deletions: number
  files: AgentTurnDiff[]
  overflow: number
  visible: AgentTurnDiff[]
}

function isAgentTurnDiff(value: unknown): value is AgentTurnDiff {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.file === "string" &&
    item.file.length > 0 &&
    typeof item.additions === "number" &&
    typeof item.deletions === "number"
  )
}

export function createAgentTurnDiffSummary(
  value: unknown,
  visibleLimit = AGENT_TURN_DIFF_VISIBLE_LIMIT,
): AgentTurnDiffSummary {
  const input = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  const seen = new Set<string>()
  const files: AgentTurnDiff[] = []

  for (let index = input.length - 1; index >= 0; index--) {
    const diff = input[index]
    if (!isAgentTurnDiff(diff)) continue
    if (seen.has(diff.file)) continue
    seen.add(diff.file)
    files.unshift({
      file: diff.file,
      additions: diff.additions,
      deletions: diff.deletions,
    })
  }

  const count = files.length
  const limit = Math.max(0, visibleLimit)
  const visible = files.slice(0, limit)

  return {
    additions: files.reduce((sum, diff) => sum + diff.additions, 0),
    count,
    deletions: files.reduce((sum, diff) => sum + diff.deletions, 0),
    files,
    overflow: Math.max(0, count - visible.length),
    visible,
  }
}
