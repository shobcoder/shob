import type { Hooks, PluginInput } from "@shob-ai/plugin"

function flattenText(content: any): string {
  if (content == null) return ""
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    const parts = []
    for (const p of content) {
      if (typeof p === "string") parts.push(p)
      else if (p && typeof p === "object" && typeof p.text === "string") parts.push(p.text)
    }
    return parts.join("\n")
  }
  return String(content)
}

function toContentBlocks(content: any) {
  if (content == null) return [{ type: "text", text: "" }]
  if (typeof content === "string") return [{ type: "text", text: content }]
  if (Array.isArray(content)) {
    const blocks = []
    for (const part of content) {
      if (typeof part === "string") {
        blocks.push({ type: "text", text: part })
      } else if (part && typeof part === "object") {
        if (part.type === "text" && typeof part.text === "string") {
          blocks.push({ type: "text", text: part.text })
        } else if (part.type === "image_url" || part.type === "image") {
          blocks.push({ type: "text", text: "[image omitted]" })
        } else if (typeof part.text === "string") {
          blocks.push({ type: "text", text: part.text })
        }
      }
    }
    return blocks.length ? blocks : [{ type: "text", text: "" }]
  }
  return [{ type: "text", text: String(content) }]
}

function safeParseJson(s: any) {
  if (s == null) return {}
  if (typeof s !== "string") return s
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

function convertMessages(messages: any[] = []) {
  const out = []
  const systemTexts = []

  for (const m of messages) {
    if (!m) continue
    const role = m.role

    if (role === "system") {
      const t = flattenText(m.content)
      if (t) systemTexts.push(t)
      continue
    }

    if (role === "tool") {
      const value = typeof m.content === "string" ? m.content : flattenText(m.content)
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: m.tool_call_id || "",
            toolName: m.name || "",
            output: { type: "text", value },
          },
        ],
      })
      continue
    }

    if (role === "assistant") {
      const blocks = []
      const text = flattenText(m.content)
      if (text) blocks.push({ type: "text", text })
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const fn = tc.function || {}
          blocks.push({
            type: "tool-call",
            toolCallId: tc.id || "",
            toolName: fn.name || "",
            input: safeParseJson(fn.arguments),
          })
        }
      }
      out.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "" }] })
      continue
    }

    out.push({ role: "user", content: toContentBlocks(m.content) })
  }

  return { messages: out, system: systemTexts.join("\n\n") }
}

function convertTools(tools: any) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined
  const result = []
  for (const t of tools) {
    if (!t) continue
    if (t.type === "function" && t.function) {
      result.push({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters || { type: "object" },
      })
    } else if (t.name && (t.input_schema || t.parameters)) {
      result.push({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema || t.parameters,
      })
    }
  }
  return result.length ? result : undefined
}

function openaiToCommandCode(model: string, body: any, stream: boolean) {
  const { messages, system } = convertMessages(body.messages)
  const params: any = {
    model,
    messages,
    stream: stream !== false,
    max_tokens: body.max_tokens ?? body.max_output_tokens ?? 64000,
    temperature: body.temperature ?? 0.3,
  }

  if (system) params.system = system

  const tools = convertTools(body.tools)
  if (tools) params.tools = tools
  if (body.top_p != null) params.top_p = body.top_p

  const today = new Date().toISOString().slice(0, 10)

  // Use crypto from global if in bun/node
  const threadId = crypto.randomUUID()

  return {
    threadId,
    memory: "",
    config: {
      workingDir: typeof process !== "undefined" ? process.cwd() : "",
      date: today,
      environment: typeof process !== "undefined" ? process.platform : "",
      structure: [],
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "",
      gitStatus: "",
      recentCommits: [],
    },
    params,
  }
}

// --- Response Translation ---

function ensureState(state: any, model: string) {
  if (!state.responseId) {
    state.responseId = `chatcmpl-${Date.now()}`
    state.created = Math.floor(Date.now() / 1000)
    state.model = state.model || model || "commandcode"
    state.chunkIndex = 0
    state.toolIndex = 0
    state.toolIndexById = new Map()
    state.openTools = new Set()
    state.openText = false
    state.finishReason = null
    state.usage = null
  }
}

function makeChunk(state: any, delta: any, finishReason: string | null = null) {
  return {
    id: state.responseId,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

function mapFinishReason(reason: string) {
  switch (reason) {
    case "stop":
      return "stop"
    case "length":
      return "length"
    case "tool-calls":
    case "tool_use":
      return "tool_calls"
    case "content-filter":
      return "content_filter"
    case "error":
      return "stop"
    default:
      return reason || "stop"
  }
}

function convertCommandCodeToOpenAI(chunk: any, state: any) {
  if (!chunk) return null

  // Already-OpenAI chunk: pass through
  if (chunk && typeof chunk === "object" && chunk.object === "chat.completion.chunk") {
    return chunk
  }

  // Parse string lines coming out of upstream
  let event = chunk
  if (typeof chunk === "string") {
    const line = chunk.trim()
    if (!line) return null
    // Tolerate raw "data: {...}" framing if the upstream wrapper inserts it
    const json = line.startsWith("data:") ? line.slice(5).trim() : line
    if (!json || json === "[DONE]") return null
    try {
      event = JSON.parse(json)
    } catch {
      return null
    }
  }

  if (!event || typeof event !== "object" || !event.type) return null

  ensureState(state, event.model)
  const out = []

  switch (event.type) {
    case "text-delta": {
      const text = event.text || event.delta || ""
      if (!text) break
      const delta = state.chunkIndex === 0 ? { role: "assistant", content: text } : { content: text }
      state.chunkIndex++
      state.openText = true
      out.push(makeChunk(state, delta))
      break
    }
    case "reasoning-delta": {
      const text = event.text || ""
      if (!text) break
      const delta = state.chunkIndex === 0 ? { role: "assistant", reasoning_content: text } : { reasoning_content: text }
      state.chunkIndex++
      out.push(makeChunk(state, delta))
      break
    }
    case "tool-input-start": {
      const id = event.id || event.toolCallId || `call_${Date.now()}_${state.toolIndex}`
      let idx = state.toolIndexById.get(id)
      if (idx == null) {
        idx = state.toolIndex++
        state.toolIndexById.set(id, idx)
      }
      state.openTools.add(id)
      const delta = {
        ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
        tool_calls: [
          {
            index: idx,
            id,
            type: "function",
            function: { name: event.toolName || "", arguments: "" },
          },
        ],
      }
      state.chunkIndex++
      out.push(makeChunk(state, delta))
      break
    }
    case "tool-input-delta": {
      const id = event.id || event.toolCallId
      const idx = state.toolIndexById.get(id)
      if (idx == null) break
      const delta = {
        tool_calls: [
          {
            index: idx,
            function: { arguments: event.delta || event.inputTextDelta || "" },
          },
        ],
      }
      out.push(makeChunk(state, delta))
      break
    }
    case "tool-call": {
      const id = event.toolCallId
      if (state.toolIndexById.has(id)) break
      const idx = state.toolIndex++
      state.toolIndexById.set(id, idx)
      const argsStr = typeof event.input === "string" ? event.input : JSON.stringify(event.input ?? {})
      const delta = {
        ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
        tool_calls: [
          {
            index: idx,
            id,
            type: "function",
            function: { name: event.toolName || "", arguments: argsStr },
          },
        ],
      }
      state.chunkIndex++
      out.push(makeChunk(state, delta))
      break
    }
    case "finish-step": {
      state.finishReason = mapFinishReason(event.finishReason)
      if (event.usage) state.usage = event.usage
      break
    }
    case "finish": {
      const finishReason = state.finishReason || mapFinishReason(event.finishReason || "stop")
      const finalChunk: any = makeChunk(state, {}, finishReason)
      const totalUsage = event.totalUsage || state.usage
      if (totalUsage) {
        finalChunk.usage = {
          prompt_tokens: totalUsage.inputTokens ?? 0,
          completion_tokens: totalUsage.outputTokens ?? 0,
          total_tokens:
            totalUsage.totalTokens ?? (totalUsage.inputTokens ?? 0) + (totalUsage.outputTokens ?? 0),
        }
      }
      out.push(finalChunk)
      break
    }
    case "error": {
      state.finishReason = "stop"
      const errVal = event.error ?? event.message ?? "unknown"
      const errStr = typeof errVal === "string" ? errVal : JSON.stringify(errVal)
      out.push(makeChunk(state, { content: `\n\n[CommandCode error: ${errStr}]` }))
      out.push(makeChunk(state, {}, "stop"))
      break
    }
    default:
      break
  }

  return out.length ? out : null
}

function wrapNdjsonAsOpenAISse(originalResponse: Response, model: string) {
  if (!originalResponse.body) return originalResponse

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  const state = { model }

  const emitChunks = (chunks: any[], controller: TransformStreamDefaultController<Uint8Array>) => {
    if (!chunks) return
    const list = Array.isArray(chunks) ? chunks : [chunks]
    for (const c of list) {
      if (c == null) continue
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`))
    }
  }

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      let nl
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        const trimmed = line.trim()
        if (trimmed) {
          emitChunks(convertCommandCodeToOpenAI(trimmed, state) || [], controller)
        }
      }
    },
    flush(controller) {
      buffer += decoder.decode()
      const trimmed = buffer.trim()
      if (trimmed) {
        emitChunks(convertCommandCodeToOpenAI(trimmed, state) || [], controller)
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
    },
  })

  const transformed = originalResponse.body.pipeThrough(transform)
  return new Response(transformed, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  })
}

let cachedCommandCodeVersion: string | null = null
let lastVersionFetch = 0

async function getLatestCommandCodeVersion(): Promise<string> {
  const now = Date.now()
  // Cache for 1 hour
  if (cachedCommandCodeVersion && now - lastVersionFetch < 60 * 60 * 1000) {
    return cachedCommandCodeVersion
  }

  try {
    const res = await fetch("https://registry.npmjs.org/command-code/latest")
    if (res.ok) {
      const data = await res.json() as { version?: string }
      if (data.version) {
        cachedCommandCodeVersion = data.version
        lastVersionFetch = now
        return data.version
      }
    }
  } catch {
    // Ignore fetch errors
  }

  // Fallback to the known latest version if fetch fails
  return cachedCommandCodeVersion || "0.31.2"
}

export async function CommandCodeAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "commandcode",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth.type !== "api") return {}

        return {
          apiKey: auth.key,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            const current = await getAuth()
            if (current.type !== "api") return fetch(requestInput, init)

            let parsedBody: any = {}
            if (init?.body) {
              try {
                parsedBody = JSON.parse(String(init.body))
              } catch {}
            }

            const model = parsedBody.model || "commandcode"
            const stream = parsedBody.stream !== false

            const payload = openaiToCommandCode(model, parsedBody, stream)

            const headers = new Headers(init?.headers)
            headers.set("Content-Type", "application/json")
            headers.set("Authorization", `Bearer ${current.key}`)
            headers.set("x-session-id", crypto.randomUUID())
            headers.set("x-command-code-version", await getLatestCommandCodeVersion())
            headers.set("x-cli-environment", "cli")
            if (stream) {
              headers.set("Accept", "text/event-stream")
            }

            const res = await fetch("https://api.commandcode.ai/alpha/generate", {
              ...init,
              method: "POST",
              headers,
              body: JSON.stringify(payload),
            })

            if (!res.ok) return res

            if (!stream) {
                // If not stream, we still process it as stream but return as accumulated
                // Currently CommandCode API always streams for alpha/generate.
                // If it streams, we should just return it.
                // But wrapNdjsonAsOpenAISse always outputs SSE. If stream is false, we should accumulate.
                // However, since we intercept fetch and it goes through plugin.ts into our normal pipeline,
                // if it's SSE and stream=false was requested, the SDK doesn't natively handle that unless we unwrap it.
                // We'll assume the same handling as Qoder where we buffer it if stream is false.

                if (!res.body) return res
                const reader = wrapNdjsonAsOpenAISse(res, model).body?.getReader()
                if (!reader) return res

                let text = ""
                let reasoningText = ""
                let done = false
                while (!done) {
                    const { value, done: readerDone } = await reader.read()
                    if (readerDone) break
                    const chunkStr = new TextDecoder().decode(value)
                    const lines = chunkStr.split("\n")
                    for (const line of lines) {
                        const trimmed = line.trim()
                        if (!trimmed || !trimmed.startsWith("data:")) continue
                        const data = trimmed.slice(5).trim()
                        if (data === "[DONE]") continue
                        try {
                            const parsed = JSON.parse(data)
                            const content = parsed.choices?.[0]?.delta?.content ?? ""
                            text += content
                            const reasoning = parsed.choices?.[0]?.delta?.reasoning_content ?? ""
                            reasoningText += reasoning
                        } catch {}
                    }
                }
                const responseObj = {
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
                                ...(reasoningText && { reasoning_content: reasoningText }),
                            },
                            finish_reason: "stop",
                        },
                    ],
                }
                return new Response(JSON.stringify(responseObj), {
                    headers: { "Content-Type": "application/json" },
                })
            }

            return wrapNdjsonAsOpenAISse(res, model)
          },
        }
      },
      methods: [
        {
          label: "CommandCode API Key",
          type: "api",
        },
      ],
    },
  }
}
