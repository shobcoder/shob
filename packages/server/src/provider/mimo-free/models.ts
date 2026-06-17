type BaseModel = {
  id: string
  name: string
}

type BaseProvider = {
  id: string
  name: string
  env: string[]
  models: Record<string, BaseModel>
}

export function withMimoFreeModels<TProvider extends BaseProvider & Record<string, any>>(
  result: Record<string, TProvider>,
) {
  const seedProvider = result.xiaomi ?? result.openai ?? Object.values(result).at(0)
  const seed = seedProvider ? Object.values(seedProvider.models).at(0) : undefined
  if (!seed) return result

  const model = {
    ...seed,
    id: "mimo-auto",
    name: "MiMo-V2.5-Pro",
    family: "mimo",
    release_date: "2026-06-13",
    attachment: false,
    reasoning: true,
    temperature: true,
    tool_call: true,
    cost: {
      input: 0,
      output: 0,
      cache_read: 0,
      cache_write: 0,
    },
    limit: {
      context: 131072,
      output: 32768,
    },
    modalities: {
      input: ["text"],
      output: ["text"],
    },
    provider: {
      npm: "@ai-sdk/openai-compatible",
      api: "https://api.xiaomimimo.com/api/free-ai/openai/chat",
    },
  } as unknown as TProvider["models"][string]

  return {
    ...result,
    "mimo-free": {
      id: "mimo-free",
      name: "MiMo Code",
      env: [],
      models: { "mimo-auto": model },
    } as unknown as TProvider,
  }
}
