import { createMemo, createSignal, For, Show, type JSX } from "solid-js"
import type { AssistantMessage, Message, Part, UserMessage } from "@shob-ai/sdk/v2/client"
import { RefreshCw } from "lucide-solid"
import { showToast } from "@shob-ai/ui/toast"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContextMetrics } from "./session-context-metrics"
import { estimateSessionContextBreakdown, type SessionContextBreakdownKey } from "./session-context-breakdown"

const BREAKDOWN_COLOR: Record<SessionContextBreakdownKey, string> = {
  system: "var(--syntax-info)",
  user: "var(--syntax-success)",
  assistant: "var(--syntax-property)",
  tool: "var(--syntax-warning)",
  other: "var(--syntax-comment)",
}

const BREAKDOWN_LABELS: Record<SessionContextBreakdownKey, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
  other: "Other",
}

function Stat(props: { label: string; value: JSX.Element; detail?: JSX.Element }) {
  return (
    <div class="min-w-0 rounded-md border border-border-weaker-base bg-surface-raised-base px-3 py-2">
      <div class="text-[11px] text-text-weak">{props.label}</div>
      <div class="mt-1 truncate text-[13px] font-medium text-text-strong">{props.value}</div>
      <Show when={props.detail}>
        <div class="mt-0.5 truncate text-[11px] text-text-weaker">{props.detail}</div>
      </Show>
    </div>
  )
}

function Section(props: { title: string; right?: JSX.Element; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-3">
        <div class="text-[11px] font-medium text-text-weak">{props.title}</div>
        <Show when={props.right}>
          <div class="shrink-0 text-[11px] text-text-weaker">{props.right}</div>
        </Show>
      </div>
      {props.children}
    </section>
  )
}

const fmt = (value: number | null | undefined) => {
  if (value === undefined || value === null) return "\u2014"
  return value.toLocaleString()
}

const fmtPercent = (value: number | null | undefined) => {
  if (value === undefined || value === null) return "\u2014"
  return value.toLocaleString() + "%"
}

const fmtTime = (value: number | undefined) => {
  if (!value) return "\u2014"
  return new Date(value).toLocaleString()
}

const fmtTimeShort = (value: number | undefined) => {
  if (!value) return ""
  return new Date(value).toLocaleTimeString()
}

const fmtCost = (value: number) => "$" + value.toFixed(4)

const assistantTokens = (message: Message) => {
  if (message.role !== "assistant") return undefined
  const assistant = message as AssistantMessage
  return (
    assistant.tokens.total ||
    assistant.tokens.input +
      assistant.tokens.output +
      assistant.tokens.reasoning +
      assistant.tokens.cache.read +
      assistant.tokens.cache.write
  )
}

export function SessionContextTab(props: { sessionId: string }) {
  const sync = useSync()
  const sdk = useSDK()
  const providers = useProviders()
  const [compacting, setCompacting] = createSignal(false)
  const [showSystemPrompt, setShowSystemPrompt] = createSignal(false)

  const messages = createMemo<Message[]>(() => {
    return (sync.data.message[props.sessionId] ?? []) as Message[]
  })

  const partsFor = (messageID: string) => (sync.data.part[messageID] ?? []) as Part[]
  const userMessages = createMemo(() => messages().filter((m) => m.role === "user") as UserMessage[])
  const metrics = createMemo(() => getSessionContextMetrics(messages(), providers.all()))
  const ctx = createMemo(() => metrics().context)
  const info = createMemo(() => sync.session.get(props.sessionId))
  const busy = createMemo(() => (sync.data.session_status[props.sessionId]?.type ?? "idle") !== "idle")

  const counts = createMemo(() => {
    const all = messages()
    return {
      all: all.length,
      user: all.filter((x) => x.role === "user").length,
      assistant: all.filter((x) => x.role === "assistant").length,
    }
  })

  const compactionCount = createMemo(() => {
    return messages().reduce((sum, message) => sum + partsFor(message.id).filter((part) => part.type === "compaction").length, 0)
  })

  const systemPrompt = createMemo(() => {
    for (let i = userMessages().length - 1; i >= 0; i--) {
      const system = userMessages()[i].system
      if (system?.trim()) return system.trim()
    }
  })

  const breakdown = createMemo(() => {
    const c = ctx()
    if (!c?.input) return []
    return estimateSessionContextBreakdown({
      messages: messages(),
      parts: sync.data.part as Record<string, Part[] | undefined>,
      input: c.input,
      systemPrompt: systemPrompt(),
    })
  })

  const usage = createMemo(() => Math.min(100, Math.max(0, ctx()?.usage ?? 0)))
  const guardUsage = createMemo(() => Math.min(100, Math.max(0, ctx()?.autoCompactUsage ?? ctx()?.usage ?? 0)))
  const guardFull = createMemo(() => {
    const c = ctx()
    return Boolean(c?.autoCompactAt && c.total >= c.autoCompactAt)
  })
  const usageColor = createMemo(() => {
    if (guardFull()) return "var(--icon-critical-base)"
    if (guardUsage() >= 90) return "var(--syntax-warning)"
    return "var(--syntax-success)"
  })

  const compactNow = async () => {
    const c = ctx()
    if (!c || compacting() || busy()) return
    setCompacting(true)
    try {
      await sdk.client.session.summarize({
        sessionID: props.sessionId,
        providerID: c.message.providerID,
        modelID: c.message.modelID,
        auto: false,
      })
      showToast({ title: "Context compacted" })
      void sync.session.sync(props.sessionId)
    } catch (error) {
      showToast({
        variant: "error",
        title: "Compaction failed",
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setCompacting(false)
    }
  }

  return (
    <div class="h-full overflow-y-auto px-4 pt-4 pb-10">
      <div class="flex flex-col gap-6">
        <section class="rounded-lg border border-border-weaker-base bg-surface-raised-base px-4 py-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-[13px] font-semibold text-text-strong">{info()?.title ?? "Session context"}</div>
              <div class="mt-1 truncate text-[11px] text-text-weak">
                {ctx()?.providerLabel ?? "\u2014"} / {ctx()?.modelLabel ?? "\u2014"}
              </div>
            </div>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-weak-base bg-background-stronger px-2.5 text-[12px] font-medium text-text-base hover:bg-surface-raised-base-hover disabled:pointer-events-none disabled:opacity-50"
              disabled={!ctx() || compacting() || busy()}
              title={busy() ? "Session is busy" : "Compact context"}
              onClick={() => void compactNow()}
            >
              <RefreshCw size={13} class={compacting() ? "animate-spin" : ""} />
              {compacting() ? "Compacting" : "Compact"}
            </button>
          </div>

          <div class="mt-4">
            <div class="mb-1.5 flex items-center justify-between text-[11px] text-text-weaker">
              <span>{fmt(ctx()?.total)} / {fmt(ctx()?.limit)} tokens</span>
              <span>{fmtPercent(ctx()?.usage)}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-surface-base">
              <div
                class="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${usage()}%`,
                  "background-color": usageColor(),
                }}
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-weaker">
              <span>Remaining {fmt(ctx()?.remaining)}</span>
              <span>Auto compact at {fmt(ctx()?.autoCompactAt)}</span>
              <span>{guardFull() ? "Auto compact ready" : `${fmtPercent(guardUsage())} guard used`}</span>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-2 gap-2">
          <Stat label="Messages" value={counts().all.toLocaleString()} detail={`${counts().user} user / ${counts().assistant} assistant`} />
          <Stat label="Input Tokens" value={fmt(ctx()?.input)} detail={`${fmt(ctx()?.output)} output`} />
          <Stat label="Cache" value={`${fmt(ctx()?.cacheRead)} / ${fmt(ctx()?.cacheWrite)}`} detail="read / write" />
          <Stat label="Cost" value={fmtCost(metrics().totalCost)} detail={`${compactionCount()} compactions`} />
          <Stat label="Created" value={fmtTime(info()?.time.created)} />
          <Stat label="Last Activity" value={fmtTime(ctx()?.message.time.created)} />
        </div>

        <Show when={breakdown().length > 0}>
          <Section title="Breakdown">
            <div class="flex flex-col gap-2">
              <div class="flex h-2 overflow-hidden rounded-full bg-surface-base">
                <For each={breakdown()}>
                  {(segment) => (
                    <div
                      class="h-full min-w-[3px]"
                      style={{
                        width: `${segment.width}%`,
                        "background-color": BREAKDOWN_COLOR[segment.key],
                      }}
                    />
                  )}
                </For>
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-1">
                <For each={breakdown()}>
                  {(segment) => (
                    <div class="flex items-center gap-1 text-[11px] text-text-weak">
                      <span class="size-2 rounded-sm" style={{ "background-color": BREAKDOWN_COLOR[segment.key] }} />
                      <span>{BREAKDOWN_LABELS[segment.key]}</span>
                      <span class="text-text-weaker">{segment.percent.toLocaleString()}%</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Section>
        </Show>

        <Show when={systemPrompt()}>
          {(prompt) => (
            <Section
              title="System Prompt"
              right={
                <button
                  type="button"
                  class="rounded px-1.5 py-0.5 text-[11px] text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
                  onClick={() => setShowSystemPrompt((value) => !value)}
                >
                  {showSystemPrompt() ? "Hide" : "Show"}
                </button>
              }
            >
              <Show when={showSystemPrompt()}>
                <div class="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border-weaker-base bg-surface-base px-3 py-2 text-[12px] leading-5 text-text-base">
                  {prompt()}
                </div>
              </Show>
            </Section>
          )}
        </Show>

        <Section title={`Messages (${counts().all})`}>
          <div class="flex flex-col gap-1">
            <For each={messages()}>
              {(message) => {
                const isCompaction = partsFor(message.id).some((part) => part.type === "compaction")
                return (
                  <div class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded bg-surface-raised-base px-2 py-1.5 text-[11px]">
                    <span class="w-[68px] truncate font-medium text-text-strong">
                      {isCompaction ? "compact" : message.role}
                    </span>
                    <span class="truncate font-mono text-text-weaker">{message.id}</span>
                    <span class="text-text-weaker">{fmt(assistantTokens(message))}</span>
                    <span class="text-text-weaker">{fmtTimeShort(message.time?.created)}</span>
                  </div>
                )
              }}
            </For>
          </div>
        </Section>
      </div>
    </div>
  )
}
