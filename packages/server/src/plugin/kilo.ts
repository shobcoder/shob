import type { Hooks, PluginInput } from "@shob-ai/plugin"
import { setTimeout as sleep } from "node:timers/promises"
import { Log } from "../util/log"

const log = Log.create({ service: "plugin.kilo" })

const START_URL = "https://api.kilo.ai/api/device-auth/codes"
const POLL_URL = "https://api.kilo.ai/api/device-auth/codes"
const POLL_MS = 3000
const DEFAULT_EXPIRES_S = 300
const SAFETY_MS = 500

type Start = {
  code: string
  verificationUrl: string
  expiresIn?: number
}

type Poll = {
  status?: string
  token?: string
}

async function start() {
  const res = await fetch(START_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) throw new Error(`Kilo auth init failed (${res.status})`)
  return (await res.json()) as Start
}

async function done(code: string) {
  const res = await fetch(`${POLL_URL}/${code}`)
  if (res.status === 202) return { state: "pending" as const }
  if (res.status === 403) return { state: "failed" as const }
  if (res.status === 410) return { state: "failed" as const }
  if (!res.ok) return { state: "failed" as const }
  const data = (await res.json()) as Poll
  if (data.status === "approved" && data.token) return { state: "success" as const, token: data.token }
  return { state: "pending" as const }
}

export async function KiloAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "kilo",
      methods: [
        {
          label: "Kilo (browser)",
          type: "oauth",
          authorize: async () => {
            const init = await start()
            const exp = (init.expiresIn ?? DEFAULT_EXPIRES_S) * 1000
            return {
              url: init.verificationUrl,
              instructions: `Code: ${init.code}`,
              method: "auto" as const,
              callback: async () => {
                const end = Date.now() + exp
                while (Date.now() < end) {
                  const out = await done(init.code)
                  if (out.state === "success") {
                    return {
                      type: "success" as const,
                      key: out.token,
                    }
                  }
                  if (out.state === "failed") {
                    log.warn("kilo oauth failed", { code: init.code })
                    return { type: "failed" as const }
                  }
                  await sleep(POLL_MS + SAFETY_MS)
                }
                return { type: "failed" as const }
              },
            }
          },
        },
        {
          label: "Kilo token",
          type: "api",
        },
      ],
    },
  }
}
