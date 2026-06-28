export const COMMANDCODE_BASE_URL = "https://api.commandcode.ai/provider/v1"
export const COMMANDCODE_MODELS_URL = `${COMMANDCODE_BASE_URL}/models`
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

export function withCommandCodeModels<TProvider extends BaseProvider & Record<string, any>>(
  result: Record<string, TProvider>,
): Record<string, TProvider> {
  return {
    ...result,
    commandcode: {
      id: "commandcode",
      name: "CommandCode",
      env: ["COMMANDCODE_API_KEY"],
      api: COMMANDCODE_BASE_URL,
      npm: COMMANDCODE_NPM,
      models: {},
    } as unknown as TProvider,
  }
}
