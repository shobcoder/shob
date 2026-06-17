type BaseModel = {
  id: string
  name: string
  reasoning: boolean
}

type BaseProvider = {
  id: string
  name: string
  env: string[]
  models: Record<string, BaseModel>
}

export const ZAI_CODING_PLAN_ID = "zai-coding-plan"

export const ZAI_CODING_PLAN_API = process.env.ZAI_CODING_PLAN_API || "https://api.z.ai/api/anthropic"

const ZAI_NPM = "@ai-sdk/anthropic"

export function withZaiCodingPlanModels<TProvider extends BaseProvider & Record<string, any>>(
  result: Record<string, TProvider>,
): Record<string, TProvider> {
  const make = (
    id: string,
    name: string,
    opts?: { context?: number; output?: number; reasoning?: boolean },
  ): TProvider["models"][string] =>
    ({
      id,
      name,
      family: "glm",
      release_date: "2025-01-01",
      attachment: false,
      reasoning: opts?.reasoning ?? true,
      temperature: true,
      tool_call: true,
      cost: { input: 0, output: 0 },
      limit: {
        context: opts?.context ?? 200_000,
        output: opts?.output ?? 131_072,
      },
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      provider: { npm: ZAI_NPM, api: ZAI_CODING_PLAN_API },
    }) as unknown as TProvider["models"][string]

  const models: TProvider["models"] = {
    "glm-4.7": make("glm-4.7", "GLM-4.7"),
    "glm-4.6": make("glm-4.6", "GLM-4.6"),
    "glm-4.5-air": make("glm-4.5-air", "GLM-4.5 Air", { context: 128_000, output: 98_304 }),
    "glm-5.2": make("glm-5.2", "GLM-5.2"),
    "glm-5.1": make("glm-5.1", "GLM-5.1"),
    "glm-5-turbo": make("glm-5-turbo", "GLM-5 Turbo"),
  } as TProvider["models"]

  return {
    ...result,
    "zai-coding-plan": {
      id: ZAI_CODING_PLAN_ID,
      name: "Z.AI Coding Plan",
      env: ["ZAI_API_KEY"],
      api: ZAI_CODING_PLAN_API,
      npm: ZAI_NPM,
      models,
    } as unknown as TProvider,
  }
}
