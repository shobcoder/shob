import type { AssistantMessage, Message } from "@shob-ai/sdk/v2/client"

type Provider = {
  id: string
  name?: string
  models: Record<string, Model | undefined>
}

type Model = {
  name?: string
  limit: {
    context: number
    input?: number
    output?: number
  }
}

export type Context = {
  message: AssistantMessage
  provider?: Provider
  model?: Model
  providerLabel: string
  modelLabel: string
  limit: number | undefined
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  total: number
  usage: number | null
  remaining: number | null
  autoCompactAt: number | null
  autoCompactUsage: number | null
  autoCompactRemaining: number | null
}

export type Metrics = {
  totalCost: number
  context: Context | undefined
}

const COMPACTION_BUFFER = 20_000

const tokenTotal = (msg: AssistantMessage) => {
  return (
    msg.tokens.total ||
    msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write
  )
}

const autoCompactLimit = (model: Model | undefined) => {
  const context = model?.limit.context
  if (!context) return null

  const output = model.limit.output ?? 0
  const reserved = Math.min(COMPACTION_BUFFER, output || COMPACTION_BUFFER)
  const usable = model.limit.input ? model.limit.input - reserved : context - (output || reserved)
  return Math.max(0, Math.min(context, usable))
}

const lastAssistantWithTokens = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    if (tokenTotal(msg) <= 0) continue
    return msg as AssistantMessage
  }
}

const build = (messages: Message[] = [], providers: Provider[] = []): Metrics => {
  const totalCost = messages.reduce((sum, msg) => sum + (msg.role === "assistant" ? msg.cost : 0), 0)
  const message = lastAssistantWithTokens(messages)
  if (!message) return { totalCost, context: undefined }

  const provider = providers.find((item) => item.id === message.providerID)
  const model = provider?.models[message.modelID]
  const limit = model?.limit.context
  const total = tokenTotal(message)
  const autoCompactAt = autoCompactLimit(model)

  return {
    totalCost,
    context: {
      message,
      provider,
      model,
      providerLabel: provider?.name ?? message.providerID,
      modelLabel: model?.name ?? message.modelID,
      limit,
      input: message.tokens.input,
      output: message.tokens.output,
      reasoning: message.tokens.reasoning,
      cacheRead: message.tokens.cache.read,
      cacheWrite: message.tokens.cache.write,
      total,
      usage: limit ? Math.round((total / limit) * 100) : null,
      remaining: limit ? Math.max(0, limit - total) : null,
      autoCompactAt,
      autoCompactUsage: autoCompactAt ? Math.round((total / autoCompactAt) * 100) : null,
      autoCompactRemaining: autoCompactAt ? Math.max(0, autoCompactAt - total) : null,
    },
  }
}

export function getSessionContextMetrics(messages: Message[] = [], providers: Provider[] = []) {
  return build(messages, providers)
}
