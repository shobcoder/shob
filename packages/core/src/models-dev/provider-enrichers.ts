import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Global } from "../global"
import { InstallationVersion } from "../installation/version"
import type { ModelsDev } from "../models-dev"

const openAICompatible = "@ai-sdk/openai-compatible"
const clineModelsURL = "https://api.cline.bot/api/v1/ai/cline/models"
const clineAPIBaseURL = "https://api.cline.bot/api/v1"
const commandCodeBaseURL = "https://api.commandcode.ai/provider/v1"
const commandCodeGenerateURL = "https://api.commandcode.ai/alpha/generate"
const kiloModelsURL = "https://app.kilo.ai/api/openrouter/models"
const kiloAPIBaseURL = "https://api.kilo.ai/api/gateway"
const cacheTTL = 5 * 60 * 1000
const clineCachePath = path.join(Global.Path.cache, "cline-models.json")

type Catalog = Record<string, ModelsDev.Provider>
type CatalogModel = ModelsDev.Provider["models"][string]
type Modality = NonNullable<CatalogModel["modalities"]>["input"][number]

type RawRouterModel = {
  readonly id?: string
  readonly name?: string
  readonly created?: number
  readonly context_length?: number | null
  readonly top_provider?: {
    readonly max_completion_tokens?: number | null
    readonly context_length?: number | null
  } | null
  readonly architecture?: {
    readonly modality?: string | readonly string[]
    readonly input_modalities?: readonly string[]
    readonly output_modalities?: readonly string[]
  } | null
  readonly pricing?: {
    readonly prompt?: string | number | null
    readonly completion?: string | number | null
    readonly input_cache_read?: string | number | null
    readonly input_cache_write?: string | number | null
  } | null
  readonly supported_parameters?: readonly string[] | null
  readonly opencode?: {
    readonly family?: string
  } | null
}

type RawModelResponse = {
  readonly data?: readonly RawRouterModel[]
}

let cachedKiloModels: Record<string, CatalogModel> | undefined

export async function enrichProviders(input: Catalog) {
  const withCline = await withClineModels(input)
  const withCommandCode = withCommandCodeModels(withCline)
  const withAntigravity = withAntigravityModels(withCommandCode)
  return await withKiloModels(withAntigravity)
}

function commandCodeModel(id: string, name: string, options: { reasoning?: boolean; attachment?: boolean } = {}) {
  return {
    id,
    name,
    release_date: "2026-06-02",
    attachment: options.attachment ?? false,
    reasoning: options.reasoning ?? false,
    temperature: true,
    tool_call: true,
    cost: {
      input: 0,
      output: 0,
    },
    limit: {
      context: 131_072,
      output: 4096,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
    provider: {
      npm: openAICompatible,
      api: commandCodeGenerateURL,
    },
  } satisfies CatalogModel
}

export function withCommandCodeModels(result: Catalog): Catalog {
  return {
    ...result,
    commandcode: {
      id: "commandcode",
      name: "Command Code",
      env: ["COMMANDCODE_API_KEY"],
      api: commandCodeBaseURL,
      npm: openAICompatible,
      models: {
        "deepseek/deepseek-v4-pro": commandCodeModel("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", {
          reasoning: true,
        }),
        "deepseek/deepseek-v4-flash": commandCodeModel("deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", {
          reasoning: true,
        }),
        "moonshotai/Kimi-K2.6": commandCodeModel("moonshotai/Kimi-K2.6", "Kimi K2.6"),
        "moonshotai/Kimi-K2.5": commandCodeModel("moonshotai/Kimi-K2.5", "Kimi K2.5"),
        "zai-org/GLM-5.1": commandCodeModel("zai-org/GLM-5.1", "GLM 5.1"),
        "zai-org/GLM-5": commandCodeModel("zai-org/GLM-5", "GLM 5"),
        "MiniMaxAI/MiniMax-M2.7": commandCodeModel("MiniMaxAI/MiniMax-M2.7", "MiniMax M2.7"),
        "MiniMaxAI/MiniMax-M2.5": commandCodeModel("MiniMaxAI/MiniMax-M2.5", "MiniMax M2.5"),
        "Qwen/Qwen3.6-Max-Preview": commandCodeModel("Qwen/Qwen3.6-Max-Preview", "Qwen 3.6 Max Preview"),
        "Qwen/Qwen3.6-Plus": commandCodeModel("Qwen/Qwen3.6-Plus", "Qwen 3.6 Plus"),
        "stepfun/Step-3.5-Flash": commandCodeModel("stepfun/Step-3.5-Flash", "Step 3.5 Flash"),
      },
    },
  }
}

export function withAntigravityModels(result: Catalog): Catalog {
  const google = result.google
  if (!google) return result
  const fallback = google.models["gemini-3.1-pro-preview"] ?? Object.values(google.models)[0]
  if (!fallback) return result

  const make = (id: string, seedID?: string, options: { reasoning?: boolean } = {}) => {
    const seed = (seedID ? google.models[seedID] : undefined) ?? fallback
    return {
      ...seed,
      id,
      name:
        id === "gemini-3.1-pro-high"
          ? "Gemini 3 Pro High"
          : id === "gemini-3.1-pro-low"
            ? "Gemini 3 Pro Low"
            : id === "gemini-3-flash"
              ? "Gemini 3 Flash"
              : id === "claude-sonnet-4-6"
                ? "Claude Sonnet 4.6"
                : id === "claude-opus-4-6-thinking"
                  ? "Claude Opus 4.6 Thinking"
                  : "GPT OSS 120B Medium",
      reasoning: options.reasoning ?? seed.reasoning,
      provider: {
        npm: "@ai-sdk/google",
        api: "https://generativelanguage.googleapis.com",
      },
    } satisfies CatalogModel
  }

  return {
    ...result,
    antigravity: {
      ...(result.antigravity ?? google),
      id: "antigravity",
      name: "Antigravity",
      env: [],
      models: {
        "gemini-3.1-pro-high": make("gemini-3.1-pro-high", "gemini-3.1-pro-preview"),
        "gemini-3.1-pro-low": make("gemini-3.1-pro-low", "gemini-3.1-pro-preview"),
        "gemini-3-flash": make("gemini-3-flash", "gemini-3-flash-preview", { reasoning: false }),
        "claude-sonnet-4-6": make("claude-sonnet-4-6", "gemini-3.1-pro-preview"),
        "claude-opus-4-6-thinking": make("claude-opus-4-6-thinking", "gemini-3.1-pro-preview"),
        "gpt-oss-120b-medium": make("gpt-oss-120b-medium", "gemini-3.1-pro-preview"),
      },
    },
  }
}

export async function withClineModels(result: Catalog): Promise<Catalog> {
  const rawModels: readonly RawRouterModel[] = await fetchClineModels().catch(readCachedClineModels)
  const models = Object.fromEntries(rawModels.flatMap((raw) => {
    const model = routerModel(raw, { api: clineAPIBaseURL, npm: openAICompatible })
    return model ? [[model.id, model]] : []
  }))

  const fallbackModels =
    Object.keys(models).length > 0
      ? models
      : Object.fromEntries(
          Object.entries(result.openrouter?.models ?? {}).map(([id, model]) => [
            id,
            {
              ...model,
              id,
              provider: { npm: openAICompatible, api: clineAPIBaseURL },
            },
          ]),
        )

  if (Object.keys(fallbackModels).length === 0) return result
  return {
    ...result,
    cline: {
      id: "cline",
      name: "Cline",
      env: ["CLINE_API_KEY"],
      npm: openAICompatible,
      api: clineAPIBaseURL,
      models: fallbackModels,
    },
  }
}

export async function withKiloModels(result: Catalog): Promise<Catalog> {
  const kilo = result.kilo
  if (!kilo) return result
  const models = cachedKiloModels ?? (await fetchKiloModels().catch(() => undefined))
  const next = models && Object.keys(models).length > 0 ? { ...kilo, models } : kilo
  cachedKiloModels = next.models

  const extra = [
    "kilo-auto/free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "poolside/laguna-m.1:free",
    "moonshotai/kimi-k2.6:free",
    "openrouter/owl-alpha",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "poolside/laguna-xs.2:free",
    "openrouter/free",
  ]
  const base = Object.values(next.models)[0]
  const merged = { ...next.models }
  for (const id of extra) {
    const existing = merged[id]
    if (existing) {
      merged[id] = kiloModel(existing, id)
      continue
    }
    const source = result.openrouter?.models[id] ?? base
    if (source) merged[id] = kiloModel(source, id)
  }

  return {
    ...result,
    kilo: {
      ...next,
      api: kiloAPIBaseURL,
      npm: openAICompatible,
      models: Object.fromEntries(Object.entries(merged).map(([id, model]) => [id, kiloModel(model, id)])),
    },
  }
}

async function fresh(filepath: string) {
  return Date.now() - (await stat(filepath).then((item) => item.mtimeMs).catch(() => 0)) < cacheTTL
}

async function readCachedClineModels() {
  const cached = await readFile(clineCachePath, "utf8")
    .then((content) => JSON.parse(content) as unknown)
    .catch(() => undefined)
  if (Array.isArray(cached)) return cached.filter(isRawRouterModel)
  if (cached && typeof cached === "object" && "data" in cached && Array.isArray(cached.data)) {
    return cached.data.filter(isRawRouterModel)
  }
  return []
}

async function fetchClineModels() {
  if (await fresh(clineCachePath)) {
    const cached = await readCachedClineModels()
    if (cached.length > 0) return cached
  }
  const response = await fetch(clineModelsURL, {
    headers: clineHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Cline models fetch failed: ${response.status}`)
  const payload = (await response.json()) as RawModelResponse | readonly RawRouterModel[]
  const data = Array.isArray(payload) ? payload : "data" in payload ? payload.data : undefined
  if (!Array.isArray(data)) throw new Error("Invalid Cline models response")
  await writeJson(clineCachePath, { data })
  return data.filter(isRawRouterModel)
}

async function fetchKiloModels() {
  const response = await fetch(kiloModelsURL, {
    headers: { "User-Agent": "shob" },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Kilo models fetch failed: ${response.status}`)
  const payload = (await response.json()) as RawModelResponse
  if (!Array.isArray(payload.data)) return {}
  return Object.fromEntries(
    payload.data.flatMap((raw) => {
      const model = routerModel(raw, { api: kiloAPIBaseURL, npm: openAICompatible })
      return model ? [[model.id, model]] : []
    }),
  )
}

async function writeJson(filepath: string, value: unknown) {
  await mkdir(path.dirname(filepath), { recursive: true })
  await writeFile(filepath, JSON.stringify(value, null, 2)).catch(() => undefined)
}

function routerModel(raw: RawRouterModel, provider: { api: string; npm: string }): CatalogModel | undefined {
  if (!raw.id) return
  const params = raw.supported_parameters ?? []
  const context = raw.context_length ?? raw.top_provider?.context_length ?? 4096
  const output = raw.top_provider?.max_completion_tokens ?? 4096
  const input = modalities(raw, "input")
  const outputModalities = modalities(raw, "output")
  return {
    id: raw.id,
    name: raw.name || raw.id,
    family: raw.opencode?.family,
    release_date:
      typeof raw.created === "number" && raw.created > 0
        ? new Date(raw.created * 1000).toISOString().split("T")[0]!
        : "2020-01-01",
    attachment: input.includes("image") || input.includes("pdf"),
    reasoning: params.includes("include_reasoning") || params.includes("reasoning"),
    temperature: params.length === 0 || params.includes("temperature"),
    tool_call: params.length === 0 || params.includes("tools"),
    cost: {
      input: price(raw.pricing?.prompt),
      output: price(raw.pricing?.completion),
      cache_read: price(raw.pricing?.input_cache_read),
      cache_write: price(raw.pricing?.input_cache_write),
    },
    limit: {
      context,
      input: context,
      output,
    },
    modalities: {
      input,
      output: outputModalities,
    },
    provider,
  }
}

function kiloModel(model: CatalogModel, id: string): CatalogModel {
  return {
    ...model,
    id,
    provider: {
      npm: openAICompatible,
      api: kiloAPIBaseURL,
    },
  }
}

function modalities(raw: RawRouterModel, side: "input" | "output"): Modality[] {
  return (["text", "audio", "image", "video", "pdf"] as const).filter((modality) =>
    includesModality(raw, modality, side),
  )
}

function includesModality(raw: RawRouterModel, modality: Modality, side: "input" | "output") {
  const explicit = side === "input" ? raw.architecture?.input_modalities : raw.architecture?.output_modalities
  if (explicit?.includes(modality)) return true
  const generic = raw.architecture?.modality
  if (Array.isArray(generic)) return generic.includes(modality)
  return typeof generic === "string" ? generic.includes(modality) : modality === "text"
}

function price(value: unknown) {
  if (value === undefined || value === null || value === "") return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed * 1_000_000 : 0
}

function clineHeaders(extra: Record<string, string> = {}) {
  return {
    Accept: "application/json",
    "User-Agent": `9Router/${InstallationVersion}`,
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline",
    "X-CLIENT-TYPE": "9router",
    "X-CLIENT-VERSION": InstallationVersion,
    "X-CORE-VERSION": InstallationVersion,
    "X-IS-MULTIROOT": "false",
    ...extra,
  }
}

function isRawRouterModel(value: unknown): value is RawRouterModel {
  return Boolean(value && typeof value === "object")
}
