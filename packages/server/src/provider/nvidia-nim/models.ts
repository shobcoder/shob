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

const NVIDIA_NIM_API = "https://integrate.api.nvidia.com/v1"
const NVIDIA_NIM_NPM = "@ai-sdk/openai-compatible"

export function withNvidiaNimModels<TProvider extends BaseProvider & Record<string, any>>(
  result: Record<string, TProvider>,
): Record<string, TProvider> {
  const make = (
    id: string,
    name: string,
    opts?: { family?: string; context?: number; output?: number; reasoning?: boolean; attachment?: boolean },
  ): TProvider["models"][string] =>
    ({
      id,
      name,
      family: opts?.family ?? "nvidia",
      release_date: "2026-06-13",
      attachment: opts?.attachment ?? false,
      reasoning: opts?.reasoning ?? false,
      temperature: true,
      tool_call: true,
      cost: {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
      },
      limit: {
        context: opts?.context ?? 131_072,
        output: opts?.output ?? 32_768,
      },
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      provider: {
        npm: NVIDIA_NIM_NPM,
        api: NVIDIA_NIM_API,
      },
    }) as unknown as TProvider["models"][string]

  const models: TProvider["models"] = {
    "minimaxai/minimax-m2.7": make("minimaxai/minimax-m2.7", "Minimax M2.7", {
      family: "minimax",
      reasoning: true,
    }),
    "z-ai/glm4.7": make("z-ai/glm4.7", "GLM 4.7", {
      family: "glm",
      reasoning: true,
    }),
  } as TProvider["models"]

  return {
    ...result,
    nvidia: {
      id: "nvidia",
      name: "NVIDIA NIM",
      env: ["NVIDIA_API_KEY"],
      api: NVIDIA_NIM_API,
      npm: NVIDIA_NIM_NPM,
      models,
    } as unknown as TProvider,
  }
}
