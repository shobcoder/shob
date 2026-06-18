import { createMemo, For, Match, Show, Switch } from "solid-js"

export function DiffChanges(props: {
  class?: string
  changes: { additions: number; deletions: number } | { additions: number; deletions: number }[]
  variant?: "default" | "bars"
}) {
  const variant = () => props.variant ?? "default"

  const additions = createMemo(() =>
    Array.isArray(props.changes)
      ? props.changes.reduce((acc, diff) => acc + (diff.additions ?? 0), 0)
      : props.changes.additions,
  )
  const deletions = createMemo(() =>
    Array.isArray(props.changes)
      ? props.changes.reduce((acc, diff) => acc + (diff.deletions ?? 0), 0)
      : props.changes.deletions,
  )
  const total = createMemo(() => (additions() ?? 0) + (deletions() ?? 0))

  const blockCounts = createMemo(() => {
    const TOTAL_BLOCKS = 5
    const adds = additions() ?? 0
    const dels = deletions() ?? 0

    if (adds === 0 && dels === 0) return { added: 0, deleted: 0, neutral: TOTAL_BLOCKS }

    const sum = adds + dels
    if (sum < 5) {
      const added = adds > 0 ? 1 : 0
      const deleted = dels > 0 ? 1 : 0
      return { added, deleted, neutral: TOTAL_BLOCKS - added - deleted }
    }

    const added = Math.max(1, Math.round((adds / sum) * TOTAL_BLOCKS))
    const deleted = Math.max(1, Math.round((dels / sum) * TOTAL_BLOCKS))
    const adjustedDeleted = Math.max(0, Math.min(TOTAL_BLOCKS - added, deleted))
    return { added, deleted: adjustedDeleted, neutral: Math.max(0, TOTAL_BLOCKS - added - adjustedDeleted) }
  })

  const ADD_COLOR = "var(--icon-diff-add-base)"
  const DELETE_COLOR = "var(--icon-diff-delete-base)"
  const NEUTRAL_COLOR = "var(--icon-weak-base)"

  const visibleBlocks = createMemo(() => {
    const counts = blockCounts()
    const blocks = [
      ...Array(counts.added).fill(ADD_COLOR),
      ...Array(counts.deleted).fill(DELETE_COLOR),
      ...Array(counts.neutral).fill(NEUTRAL_COLOR),
    ]
    return blocks.slice(0, 5)
  })

  return (
    <Show when={variant() === "default" ? total() > 0 : true}>
      <div class={`flex items-center gap-2 ${props.class ?? ""}`}>
        <Switch>
          <Match when={variant() === "bars"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 14" fill="none" class="w-[18px] h-[14px] shrink-0">
              <g>
                <For each={visibleBlocks()}>{(color, i) => <rect x={i() * 4} width="2" height="14" rx="1" fill={color} />}</For>
              </g>
            </svg>
          </Match>
          <Match when={true}>
            <span class="text-sm font-mono" style="color: var(--text-diff-add-base)">{`+${additions()}`}</span>
            <span class="text-sm font-mono" style="color: var(--text-diff-delete-base)">{`-${deletions()}`}</span>
          </Match>
        </Switch>
      </div>
    </Show>
  )
}
