import { formatPatch, structuredPatch } from "diff"

export type ViewDiff = {
  file: string
  patch: string
  before: string
  after: string
  additions: number
  deletions: number
}

export function normalize(input: { file: string; before: string; after: string }): ViewDiff {
  const patch = formatPatch(
    structuredPatch(input.file, input.file, input.before ?? "", input.after ?? "", "", "", {
      context: Number.MAX_SAFE_INTEGER,
    }),
  )
  return {
    file: input.file,
    patch,
    before: input.before ?? "",
    after: input.after ?? "",
    additions: (input.after.match(/\n/g)?.length ?? 0),
    deletions: (input.before.match(/\n/g)?.length ?? 0),
  }
}

export function text(diff: ViewDiff, side: "deletions" | "additions") {
  return side === "deletions" ? diff.before : diff.after
}
