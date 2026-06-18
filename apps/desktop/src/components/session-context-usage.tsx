import { Show, createMemo } from "solid-js"
import { ProgressCircle } from "@shob-ai/ui/progress-circle"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContextMetrics } from "./session/session-context-metrics"

export function SessionContextUsage(props: {
  sessionId: string
  onClick?: () => void
}) {
  const sync = useSync()
  const providers = useProviders()

  const messages = createMemo(() => {
    return (sync.data.message[props.sessionId] ?? []) as any[]
  })

  const metrics = createMemo(() => getSessionContextMetrics(messages(), providers.all()))
  const ctx = createMemo(() => metrics().context)

  const cost = createMemo(() => {
    return "$" + metrics().totalCost.toFixed(4)
  })

  return (
    <Show when={props.sessionId}>
      <div class="group relative">
        <button
          type="button"
          data-action="prompt-context-usage"
          class="flex size-8 items-center justify-center rounded-lg border border-border/30 text-foreground outline-none transition-colors duration-150 hover:bg-accent/50"
          onClick={props.onClick}
          aria-label="Open context usage"
          title={ctx() ? `${fmt(ctx()?.total)} tokens \u00b7 ${ctx()?.usage ?? 0}% \u00b7 ${cost()}` : "Context"}
        >
          <ProgressCircle size={16} strokeWidth={2} percentage={ctx()?.usage ?? 0} />
        </button>
      </div>
    </Show>
  )
}

function fmt(value: number | undefined | null) {
  if (value === undefined || value === null) return "\u2014"
  return value.toLocaleString()
}
