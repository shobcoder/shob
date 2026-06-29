export const COMMANDCODE_BASE_URL = "https://api.commandcode.ai/provider/v1"
export const COMMANDCODE_MODELS_URL = `${COMMANDCODE_BASE_URL}/models`
export const COMMANDCODE_GENERATE_URL = "https://api.commandcode.ai/alpha/generate"
export const COMMANDCODE_NPM = "@ai-sdk/openai-compatible"

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

export function withCommandCodeModels<TProvider extends BaseProvider & Record<string, any>>(result: Record<string, TProvider>) {
  const make = (id: string, name: string, opts?: { reasoning?: boolean; attachment?: boolean }): TProvider["models"][string] => {
    return {
      id,
      name,
      release_date: "2026-06-02",
      attachment: opts?.attachment ?? false,
      reasoning: opts?.reasoning ?? false,
      temperature: true,
      tool_call: true,
      limit: {
        context: 131072,
        output: 4096,
      },
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      provider: {
        npm: COMMANDCODE_NPM,
        api: COMMANDCODE_GENERATE_URL,
      },
    } as unknown as TProvider["models"][string]
  }

  const models: TProvider["models"] = {
    "deepseek/deepseek-v4-pro": make("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", { reasoning: true }),
    "deepseek/deepseek-v4-flash": make("deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", { reasoning: true }),
    "moonshotai/Kimi-K2.6": make("moonshotai/Kimi-K2.6", "Kimi K2.6"),
    "moonshotai/Kimi-K2.5": make("moonshotai/Kimi-K2.5", "Kimi K2.5"),
    "zai-org/GLM-5.1": make("zai-org/GLM-5.1", "GLM 5.1"),
    "zai-org/GLM-5": make("zai-org/GLM-5", "GLM 5"),
    "MiniMaxAI/MiniMax-M2.7": make("MiniMaxAI/MiniMax-M2.7", "MiniMax M2.7"),
    "MiniMaxAI/MiniMax-M2.5": make("MiniMaxAI/MiniMax-M2.5", "MiniMax M2.5"),
    "Qwen/Qwen3.6-Max-Preview": make("Qwen/Qwen3.6-Max-Preview", "Qwen 3.6 Max Preview"),
    "Qwen/Qwen3.6-Plus": make("Qwen/Qwen3.6-Plus", "Qwen 3.6 Plus"),
    "stepfun/Step-3.5-Flash": make("stepfun/Step-3.5-Flash", "Step 3.5 Flash"),
  }

  return {
    ...result,
    commandcode: {
      id: "commandcode",
      name: "Command Code",
      env: [],
      api: COMMANDCODE_BASE_URL,
      npm: COMMANDCODE_NPM,
      models,
    } as unknown as TProvider,
  }
}
