import type { Hooks, PluginInput } from "@shob/plugin"

export async function CommandCodeAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "commandcode",
      loader: async () => ({}),
      methods: [
        {
          label: "CommandCode API Key",
          type: "api",
        },
      ],
    },
  }
}
