import { formatPatch, structuredPatch } from "diff"

export type ViewDiff = {
  file: string
  patch: string
  before: string
  after: string
  additions: number
  deletions: number
}

export function buildViewDiff(file: string, before: string, after: string): ViewDiff {
  const patch = formatPatch(
    structuredPatch(file, file, before ?? "", after ?? "", "", "", { context: Number.MAX_SAFE_INTEGER }),
  )

  const additions = (after.match(/\n/g)?.length ?? 0)
  const deletions = (before.match(/\n/g)?.length ?? 0)

  return { file, patch, before, after, additions, deletions }
}
