import type { Hooks, PluginInput } from "@shob-ai/plugin"

export async function CommandCodeAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "commandcode",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth.type !== "api") return {}
        return {
          apiKey: auth.key,
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
