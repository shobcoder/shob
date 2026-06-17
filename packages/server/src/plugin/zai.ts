import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { randomBytes } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { Log } from "../util/log"
import { ZAI_CODING_PLAN_ID } from "../provider/zai/models"

const log = Log.create({ service: "plugin.zai" })

const ZCODE_API_BASE = process.env.ZCODE_API_BASE_URL || "https://zcode.z.ai/api/v1"
const ZAI_BIZ_BASE = process.env.ZAI_BIZ_BASE_URL || "https://api.z.ai"

const POLL_INTERVAL_MS = 2_000
const POLL_TIMEOUT_MS = 5 * 60 * 1_000

type PollData = {
  status?: string
  token?: string
  zai?: { access_token?: string; refresh_token?: string; expires_in?: number }
}

async function readJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}))
}

async function initFlow(pollToken: string) {
  const res = await fetch(`${ZCODE_API_BASE}/oauth/cli/init`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pollToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "zai" }),
  })
  if (!res.ok) throw new Error(`Z.AI OAuth init failed: ${res.status} ${res.statusText}`)
  const json = await readJson(res)
  const flowId = json.data?.flow_id as string | undefined
  const authorizeUrl = json.data?.authorize_url as string | undefined
  if (!flowId || !authorizeUrl) throw new Error("Z.AI OAuth init returned incomplete data")
  return { flowId, authorizeUrl }
}

async function pollOnce(pollToken: string, flowId: string): Promise<PollData> {
  const res = await fetch(`${ZCODE_API_BASE}/oauth/cli/poll/${encodeURIComponent(flowId)}`, {
    headers: { Authorization: `Bearer ${pollToken}` },
  })
  if (!res.ok) throw new Error(`Z.AI OAuth poll failed: ${res.status}`)
  const json = await readJson(res)
  return (json.data ?? {}) as PollData
}

async function fetchBizToken(accessToken: string): Promise<string> {
  const res = await fetch(`${ZAI_BIZ_BASE}/api/auth/z/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: accessToken }),
  })
  if (!res.ok) throw new Error("Z.AI business token exchange failed")
  const json = await readJson(res)
  const bizToken = json.data?.access_token ?? json.data?.accessToken
  if (!bizToken) throw new Error("Z.AI business credentials missing from response")
  return bizToken as string
}

async function getOrgAndProject(bizToken: string) {
  const res = await fetch(`${ZAI_BIZ_BASE}/api/biz/customer/getCustomerInfo`, {
    headers: { Authorization: `Bearer ${bizToken}` },
  })
  if (!res.ok) throw new Error("Z.AI failed to fetch organization info")
  const json = await readJson(res)
  const orgs: any[] = json.data?.organizations ?? []
  const org = orgs.find((o) => o.organizationName?.includes("默认机构")) ?? orgs[0]
  if (!org) throw new Error("Z.AI: no available organization found")
  const projects: any[] = org.projects ?? []
  const proj = projects.find((p) => p.projectName?.includes("默认项目")) ?? projects[0]
  if (!proj) throw new Error("Z.AI: no available project found")
  return { orgId: org.organizationId as string, projId: proj.projectId as string }
}

async function getOrCreateApiKey(bizToken: string, orgId: string, projId: string): Promise<string> {
  const keyUrl = `${ZAI_BIZ_BASE}/api/biz/v1/organization/${orgId}/projects/${projId}/api_keys`
  const authHeader = { Authorization: `Bearer ${bizToken}` }

  const listRes = await fetch(keyUrl, { headers: authHeader })
  if (!listRes.ok) throw new Error("Z.AI failed to fetch API keys")
  const keys: any[] = (await readJson(listRes)).data ?? []

  let keyObj = keys.find((k) => k.name === "zcode-api-key")
  if (!keyObj) {
    const createRes = await fetch(keyUrl, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "zcode-api-key" }),
    })
    if (!createRes.ok) throw new Error("Z.AI failed to create API key")
    keyObj = (await readJson(createRes)).data
  }

  const apiKey = keyObj?.apiKey
  if (!apiKey) throw new Error("Z.AI failed to obtain API key")

  const copyRes = await fetch(`${keyUrl}/copy/${encodeURIComponent(apiKey)}`, { headers: authHeader })
  if (!copyRes.ok) throw new Error("Z.AI failed to fetch secret key")
  const secretKey = (await readJson(copyRes)).data?.secretKey
  if (!secretKey) throw new Error("Z.AI failed to decrypt secret key")

  return `${apiKey}.${secretKey}`
}

async function exchangeForApiKey(accessToken: string): Promise<string> {
  const bizToken = await fetchBizToken(accessToken)
  const { orgId, projId } = await getOrgAndProject(bizToken)
  return getOrCreateApiKey(bizToken, orgId, projId)
}

export async function ZaiAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: ZAI_CODING_PLAN_ID,
      methods: [
        {
          label: "Z.AI Coding Plan (Sign in)",
          type: "oauth",
          authorize: async () => {
            const pollToken = randomBytes(32).toString("hex")
            const { flowId, authorizeUrl } = await initFlow(pollToken)
            return {
              url: authorizeUrl,
              instructions: "Sign in to Z.AI in your browser, then return here.",
              method: "auto" as const,
              callback: async () => {
                const deadline = Date.now() + POLL_TIMEOUT_MS
                while (Date.now() < deadline) {
                  let data: PollData = {}
                  try {
                    data = await pollOnce(pollToken, flowId)
                  } catch (error) {
                    log.warn("zai poll attempt error", { error })
                  }
                  if (data.status === "ready") {
                    const accessToken = data.zai?.access_token
                    if (!accessToken) {
                      log.error("zai poll ready but access token missing")
                      return { type: "failed" as const }
                    }
                    try {
                      const key = await exchangeForApiKey(accessToken)
                      return { type: "success" as const, key }
                    } catch (error) {
                      log.error("zai api key exchange failed", { error })
                      return { type: "failed" as const }
                    }
                  }
                  if (data.status === "failed") return { type: "failed" as const }
                  await sleep(POLL_INTERVAL_MS)
                }
                log.warn("zai oauth flow timed out")
                return { type: "failed" as const }
              },
            }
          },
        },
        {
          label: "Z.AI API Key",
          type: "api",
        },
      ],
    },
  }
}
