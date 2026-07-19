import type { PluginContext } from "@shob/plugin/v2/effect"
import { Effect } from "effect"
import type { Scope } from "effect"
import { Integration } from "../../integration"
import { ProviderV2 } from "../../provider"
import { define } from "../internal"
import type { PluginInternal } from "../internal"

const generateURL = "https://api.commandcode.ai/alpha/generate"
const fallbackVersion = "0.31.2"

let cachedVersion: string | undefined
let lastVersionFetch = 0

export const CommandCodePlugin = define({
  id: "commandcode",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.integration.transform((draft) => {
      draft.update("commandcode", (integration) => {
        integration.name = "Command Code"
      })
      draft.method.update({ integrationID: "commandcode", method: { type: "key", label: "CommandCode API Key" } })
      draft.method.update({ integrationID: "commandcode", method: { type: "env", names: ["COMMANDCODE_API_KEY"] } })
    })
    yield* ctx.catalog.transform(
      Effect.fn(function* (catalog) {
        const key = yield* activeKey(ctx)
        const record = catalog.provider.get(ProviderV2.ID.commandcode)
        if (!record) return
        catalog.provider.update(ProviderV2.ID.commandcode, (provider) => {
          provider.integrationID = Integration.ID.make("commandcode")
          if (key) provider.request.body.apiKey = key
        })
      }),
    )
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== ProviderV2.ID.commandcode) return
        const key = yield* activeKey(ctx)
        if (key) evt.options.apiKey = key
        evt.options.fetch = commandCodeFetch(key, evt.options.fetch)
      }),
    )
  }),
} satisfies PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>)

export function commandCodeFetch(apiKey: string | undefined, upstream: typeof fetch = fetch) {
  return async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = parseRecord(init?.body)
    const model = stringValue(body.model) ?? "commandcode"
    const stream = body.stream !== false
    const headers = new Headers(init?.headers)
    headers.set("Content-Type", "application/json")
    if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`)
    headers.set("x-session-id", crypto.randomUUID())
    headers.set("x-command-code-version", await latestCommandCodeVersion())
    headers.set("x-cli-environment", "cli")
    if (stream) headers.set("Accept", "text/event-stream")

    const response = await upstream(generateURL, {
      ...init,
      method: "POST",
      headers,
      body: JSON.stringify(openAIToCommandCode(model, body, stream)),
    })
    if (!response.ok) return response
    if (stream) return wrapNdjsonAsOpenAISse(response, model)
    return await bufferedOpenAIResponse(response, model)
  }
}

export function openAIToCommandCode(model: string, body: Record<string, unknown>, stream: boolean) {
  const converted = convertMessages(Array.isArray(body.messages) ? body.messages : [])
  return {
    threadId: crypto.randomUUID(),
    memory: "",
    config: {
      workingDir: process.cwd(),
      date: new Date().toISOString().slice(0, 10),
      environment: process.platform,
      structure: [],
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "",
      gitStatus: "",
      recentCommits: [],
    },
    params: {
      model,
      messages: converted.messages,
      stream: stream !== false,
      max_tokens: numberValue(body.max_tokens) ?? numberValue(body.max_output_tokens) ?? 64_000,
      temperature: numberValue(body.temperature) ?? 0.3,
      ...(converted.system ? { system: converted.system } : {}),
      ...(convertTools(body.tools) ? { tools: convertTools(body.tools) } : {}),
      ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
    },
  }
}

export function wrapNdjsonAsOpenAISse(originalResponse: Response, model: string) {
  if (!originalResponse.body) return originalResponse
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  const state = { model, responseId: "", created: 0, chunkIndex: 0, toolIndex: 0, finishReason: "stop" }
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) emitConverted(line, state, controller)
    },
    flush(controller) {
      if (buffer.trim()) emitConverted(buffer, state, controller)
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
    },
  })
  return new Response(originalResponse.body.pipeThrough(stream), {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  })
}

async function bufferedOpenAIResponse(response: Response, model: string) {
  const reader = wrapNdjsonAsOpenAISse(response, model).body?.getReader()
  if (!reader) return response
  const decoder = new TextDecoder()
  let text = ""
  let reasoning = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.trim().startsWith("data:")) continue
      const data = line.trim().slice(5).trim()
      if (!data || data === "[DONE]") continue
      const parsed = parseRecord(data)
      const delta = asRecord(asArray(parsed.choices)[0])?.delta
      const content = asRecord(delta)?.content
      const reasoningContent = asRecord(delta)?.reasoning_content
      if (typeof content === "string") text += content
      if (typeof reasoningContent === "string") reasoning += reasoningContent
    }
  }
  return new Response(
    JSON.stringify({
      id: `commandcode-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text,
            ...(reasoning ? { reasoning_content: reasoning } : {}),
          },
          finish_reason: "stop",
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  )
}

function emitConverted(
  line: string,
  state: { model: string; responseId: string; created: number; chunkIndex: number; toolIndex: number; finishReason: string },
  controller: TransformStreamDefaultController<Uint8Array>,
) {
  const encoder = new TextEncoder()
  for (const chunk of convertCommandCodeToOpenAI(line, state)) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
  }
}

function convertCommandCodeToOpenAI(
  chunk: unknown,
  state: { model: string; responseId: string; created: number; chunkIndex: number; toolIndex: number; finishReason: string },
) {
  const event = typeof chunk === "string" ? parseEventLine(chunk) : chunk
  const item = asRecord(event)
  if (!item) return []
  if (item.object === "chat.completion.chunk") return [item]
  const type = stringValue(item.type)
  if (!type) return []
  ensureState(state, stringValue(item.model))
  if (type === "text-delta") {
    const text = stringValue(item.text) ?? stringValue(item.delta) ?? ""
    if (!text) return []
    const delta = state.chunkIndex === 0 ? { role: "assistant", content: text } : { content: text }
    state.chunkIndex++
    return [chunkObject(state, delta)]
  }
  if (type === "reasoning-delta") {
    const text = stringValue(item.text) ?? ""
    if (!text) return []
    const delta = state.chunkIndex === 0 ? { role: "assistant", reasoning_content: text } : { reasoning_content: text }
    state.chunkIndex++
    return [chunkObject(state, delta)]
  }
  if (type === "finish-step") {
    state.finishReason = finishReason(stringValue(item.finishReason))
    return []
  }
  if (type === "finish") return [chunkObject(state, {}, state.finishReason)]
  if (type === "error") {
    const message = stringValue(item.message) ?? JSON.stringify(item.error ?? "unknown")
    return [chunkObject(state, { content: `\n\n[CommandCode error: ${message}]` }), chunkObject(state, {}, "stop")]
  }
  return []
}

function ensureState(state: { model: string; responseId: string; created: number }, model?: string) {
  if (state.responseId) return
  state.responseId = `chatcmpl-${Date.now()}`
  state.created = Math.floor(Date.now() / 1000)
  state.model = model ?? state.model
}

function chunkObject(
  state: { model: string; responseId: string; created: number },
  delta: Record<string, unknown>,
  finishReason: string | null = null,
) {
  return {
    id: state.responseId,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

function convertMessages(messages: readonly unknown[]) {
  const system = messages.flatMap((message) => {
    const item = asRecord(message)
    return item?.role === "system" ? [flattenText(item.content)] : []
  })
  return {
    system: system.filter(Boolean).join("\n\n"),
    messages: messages.flatMap<Record<string, unknown>>((message) => {
      const item = asRecord(message)
      if (!item || item.role === "system") return []
      if (item.role === "tool") {
        return [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: stringValue(item.tool_call_id) ?? "",
                toolName: stringValue(item.name) ?? "",
                output: { type: "text", value: flattenText(item.content) },
              },
            ],
          },
        ]
      }
      if (item.role === "assistant") {
        return [{ role: "assistant", content: [{ type: "text", text: flattenText(item.content) }] }]
      }
      return [{ role: "user", content: [{ type: "text", text: flattenText(item.content) }] }]
    }),
  }
}

function convertTools(tools: unknown) {
  const converted = asArray(tools).flatMap((tool) => {
    const item = asRecord(tool)
    const fn = asRecord(item?.function)
    if (item?.type === "function" && fn) {
      return [
        {
          name: stringValue(fn.name) ?? "",
          description: stringValue(fn.description),
          input_schema: asRecord(fn.parameters) ?? { type: "object" },
        },
      ]
    }
    if (typeof item?.name === "string") {
      return [
        {
          name: item.name,
          description: stringValue(item.description),
          input_schema: asRecord(item.input_schema) ?? asRecord(item.parameters) ?? { type: "object" },
        },
      ]
    }
    return []
  })
  return converted.length > 0 ? converted : undefined
}

function flattenText(content: unknown): string {
  if (content === undefined || content === null) return ""
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return String(content)
  return content
    .flatMap((part) => {
      if (typeof part === "string") return [part]
      const item = asRecord(part)
      return typeof item?.text === "string" ? [item.text] : []
    })
    .join("\n")
}

function parseEventLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed === "[DONE]") return undefined
  return parseRecord(trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed)
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return asRecord(value) ?? {}
  try {
    return asRecord(JSON.parse(value)) ?? {}
  } catch {
    return {}
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function finishReason(reason: string | undefined) {
  if (reason === "tool-calls" || reason === "tool_use") return "tool_calls"
  if (reason === "content-filter") return "content_filter"
  if (reason === "length") return "length"
  return "stop"
}

async function latestCommandCodeVersion() {
  const now = Date.now()
  if (cachedVersion && now - lastVersionFetch < 60 * 60 * 1000) return cachedVersion
  try {
    const response = await fetch("https://registry.npmjs.org/command-code/latest")
    const body = (await response.json()) as { version?: string }
    if (response.ok && body.version) {
      cachedVersion = body.version
      lastVersionFetch = now
      return cachedVersion
    }
  } catch {}
  return cachedVersion ?? fallbackVersion
}

function activeKey(ctx: PluginContext) {
  return Effect.gen(function* () {
    const connection = yield* ctx.integration.connection.active("commandcode")
    const credential = connection
      ? yield* ctx.integration.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
      : undefined
    if (credential?.type === "key") return credential.key
    return process.env.COMMANDCODE_API_KEY
  })
}
