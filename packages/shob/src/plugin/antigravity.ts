import type { Hooks, PluginInput } from "@shob/plugin"
import { createServer } from "http"

const OAUTH_DUMMY_KEY = "shob-dummy-key"
import os from "os"



const CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
const CLIENT_SECRET = "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"
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const LOAD_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist"
const ONBOARD_URL = "https://cloudcode-pa.googleapis.com/v1internal:onboardUser"
const OAUTH_PORT = 1457
const REFRESH_MS = 30_000
const ANTIGRAVITY_BASE = "https://daily-cloudcode-pa.googleapis.com"
const INTERNAL_REQUEST_HEADER = "x-request-source"
const ANTIGRAVITY_UA = `antigravity/1.107.0 ${os.platform()}/${os.arch()}`
const LOAD_UA = "google-api-nodejs-client/9.15.1"
const LOAD_CLIENT = "google-cloud-sdk vscode_cloudshelleditor/0.1"
const LOAD_META = JSON.stringify({ ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" })
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
]

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

type PendingOAuth = {
  state: string
  resolve: (result: TokenResponse) => void
  reject: (error: Error) => void
}

let oauthServer: ReturnType<typeof createServer> | undefined
let pendingOAuth: PendingOAuth | undefined
let sessionId = `${crypto.randomUUID()}${Date.now()}`

function generateState() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")
}

async function exchangeToken(code: string, redirectUri: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!response.ok) throw new Error(`Antigravity token exchange failed (${response.status})`)
  return response.json()
}

async function refreshToken(refresh: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refresh,
    }),
  })
  if (!response.ok) throw new Error(`Antigravity token refresh failed (${response.status})`)
  return response.json()
}

async function startOAuthServer() {
  if (oauthServer) return `http://localhost:${OAUTH_PORT}/auth/callback`

  oauthServer = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${OAUTH_PORT}`)
    if (url.pathname !== "/auth/callback") {
      res.writeHead(404)
      res.end("Not found")
      return
    }

    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (!code) {
      pendingOAuth?.reject(new Error("Missing authorization code"))
      pendingOAuth = undefined
      res.writeHead(400)
      res.end("Missing code")
      return
    }
    if (!pendingOAuth || state !== pendingOAuth.state) {
      pendingOAuth?.reject(new Error("Invalid OAuth state"))
      pendingOAuth = undefined
      res.writeHead(400)
      res.end("Invalid state")
      return
    }

    const current = pendingOAuth
    pendingOAuth = undefined
    exchangeToken(code, `http://localhost:${OAUTH_PORT}/auth/callback`)
      .then((tokens) => current.resolve(tokens))
      .catch((error) => current.reject(error instanceof Error ? error : new Error(String(error))))

    res.writeHead(200, { "Content-Type": "text/html" })
    res.end("Antigravity authorization complete. You can close this window.")
  })

  await new Promise<void>((resolve, reject) => {
    oauthServer?.listen(OAUTH_PORT, () => resolve())
    oauthServer?.on("error", reject)
  })

  return `http://localhost:${OAUTH_PORT}/auth/callback`
}

function stopOAuthServer() {
  if (!oauthServer) return
  oauthServer.close()
  oauthServer = undefined
}

function waitForOAuth(state: string) {
  return new Promise<TokenResponse>((resolve, reject) => {
    const id = setTimeout(() => {
      if (!pendingOAuth) return
      pendingOAuth = undefined
      reject(new Error("OAuth callback timeout"))
    }, 5 * 60 * 1000)

    pendingOAuth = {
      state,
      resolve(result) {
        clearTimeout(id)
        resolve(result)
      },
      reject(error) {
        clearTimeout(id)
        reject(error)
      },
    }
  })
}

function buildAuthorizeUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

function toUrl(requestInput: RequestInfo | URL) {
  if (requestInput instanceof URL) return new URL(requestInput)
  if (typeof requestInput === "string") return new URL(requestInput)
  return new URL(requestInput.url)
}

function getModel(url: URL) {
  const match = url.pathname.match(/\/models\/([^:]+):/)
  if (!match) return
  return decodeURIComponent(match[1])
}

function toAntigravityUrl(stream: boolean) {
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent"
  return new URL(`${ANTIGRAVITY_BASE}/v1internal:${action}`)
}

function parseJson(body?: BodyInit | null) {
  if (typeof body !== "string") return
  return JSON.parse(body) as Record<string, any>
}

function normalizeContents(contents: any[] | undefined) {
  if (!Array.isArray(contents)) return contents

  const ids = new Map<string, string[]>()

  return contents.map((item) => {
    if (!Array.isArray(item?.parts)) return item

    let role = item.role
    const parts = item.parts
      .filter((part: any) => {
        if (part?.thought && !part?.functionCall) return false
        if (part?.thoughtSignature && !part?.functionCall && !part?.text) return false
        return true
      })
      .map((part: any) => {
        if (part?.functionCall) {
          const name = String(part.functionCall.name ?? "tool")
          const id = String(part.functionCall.id ?? `toolu_${crypto.randomUUID()}`)
          const list = ids.get(name) ?? []
          list.push(id)
          ids.set(name, list)
          return {
            ...part,
            functionCall: {
              ...part.functionCall,
              id,
            },
          }
        }

        if (part?.functionResponse) {
          role = "user"
          const name = String(part.functionResponse.name ?? "tool")
          const list = ids.get(name) ?? []
          const id = String(part.functionResponse.id ?? list.at(0) ?? `toolu_${crypto.randomUUID()}`)
          if (list.length > 0) list.shift()
          ids.set(name, list)
          return {
            ...part,
            functionResponse: {
              ...part.functionResponse,
              id,
            },
          }
        }

        return part
      })

    return {
      ...item,
      role,
      parts,
    }
  })
}

function wrapBody(model: string, body: Record<string, any>, project: string) {
  const req = body.request ?? body
  const contents = normalizeContents(req?.contents)
  const nextReq = {
    ...req,
    ...(contents ? { contents } : {}),
    sessionId: req?.sessionId ?? sessionId,
    safetySettings: undefined,
    toolConfig: Array.isArray(req?.tools) && req.tools.length > 0 ? { functionCallingConfig: { mode: "VALIDATED" } } : req?.toolConfig,
  }
  return {
    project,
    model,
    userAgent: "antigravity",
    requestType: "agent",
    requestId: `agent-${crypto.randomUUID()}`,
    request: nextReq,
  }
}

function getApiHeaders(access: string) {
  return {
    Authorization: `Bearer ${access}`,
    "Content-Type": "application/json",
    "User-Agent": LOAD_UA,
    "X-Goog-Api-Client": LOAD_CLIENT,
    "Client-Metadata": LOAD_META,
  }
}

function getMeta() {
  return { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" }
}

async function loadCodeAssist(access: string) {
  const res = await fetch(LOAD_URL, {
    method: "POST",
    headers: getApiHeaders(access),
    body: JSON.stringify({ metadata: getMeta() }),
  })
  if (!res.ok) throw new Error(`Antigravity loadCodeAssist failed (${res.status})`)
  const data = (await res.json()) as Record<string, any>
  const raw = data.cloudaicompanionProject
  const project = typeof raw === "string" ? raw : raw?.id
  let tier = "legacy-tier"
  if (Array.isArray(data.allowedTiers)) {
    for (const item of data.allowedTiers) {
      if (!item?.isDefault || !item?.id) continue
      tier = String(item.id).trim()
      break
    }
  }
  if (!project) throw new Error("Antigravity project missing from loadCodeAssist")
  return { project: String(project).trim(), tier }
}

async function onboardUser(access: string, tier: string) {
  const res = await fetch(ONBOARD_URL, {
    method: "POST",
    headers: getApiHeaders(access),
    body: JSON.stringify({ tierId: tier, metadata: getMeta() }),
  })
  if (!res.ok) throw new Error(`Antigravity onboardUser failed (${res.status})`)
  return (await res.json()) as Record<string, any>
}

async function completeOnboarding(access: string, project: string, tier: string) {
  for (let i = 0; i < 10; i++) {
    const data = await onboardUser(access, tier)
    if (data.done !== true) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      continue
    }
    const raw = data.response?.cloudaicompanionProject
    const next = typeof raw === "string" ? raw : raw?.id
    return next ? String(next).trim() : project
  }
  return project
}

function unwrapJson(body: string) {
  const obj = JSON.parse(body)
  if (!obj || typeof obj !== "object" || !("response" in obj)) return body
  return JSON.stringify((obj as Record<string, any>).response)
}

function unwrapSse(res: Response) {
  if (!res.body) return res
  if (!res.headers.get("content-type")?.includes("text/event-stream")) return res

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buf = ""
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      buf += decoder.decode(chunk, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          ctrl.enqueue(encoder.encode(`${line}\n`))
          continue
        }
        const raw = line.slice(6).trim()
        if (!raw || raw === "[DONE]") {
          ctrl.enqueue(encoder.encode(`${line}\n`))
          continue
        }
        const obj = JSON.parse(raw)
        const next = obj?.response ?? obj
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(next)}\n`))
      }
    },
    flush(ctrl) {
      if (buf) ctrl.enqueue(encoder.encode(buf))
    },
  })

  return new Response(res.body.pipeThrough(stream), {
    status: res.status,
    statusText: res.statusText,
    headers: new Headers(res.headers),
  })
}

async function unwrap(res: Response) {
  if (res.headers.get("content-type")?.includes("text/event-stream")) return unwrapSse(res)
  if (!res.headers.get("content-type")?.includes("application/json")) return res
  const body = await res.text()
  const next = unwrapJson(body)
  const headers = new Headers(res.headers)
  headers.delete("content-length")
  return new Response(next, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

export async function AntigravityAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "antigravity",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth.type !== "oauth") return {}

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            const current = await getAuth()
            if (current.type !== "oauth") return fetch(requestInput, init)
            const authWithProject = current as typeof current & { accountId?: string }

            let access = current.access
            let project = authWithProject.accountId
            if (current.expires - Date.now() < REFRESH_MS) {
              const next = await refreshToken(current.refresh)
              const refresh = next.refresh_token ?? current.refresh
              const expires = Date.now() + (next.expires_in ?? 3600) * 1000
              await input.client.auth.set({
                path: { id: "antigravity" },
                body: {
                  type: "oauth",
                  refresh,
                  access: next.access_token,
                  expires,
                  ...(authWithProject.accountId && { accountId: authWithProject.accountId }),
                },
              })
              access = next.access_token
            }
            if (!project) {
              const load = await loadCodeAssist(access)
              project = await completeOnboarding(access, load.project, load.tier)
              await input.client.auth.set({
                path: { id: "antigravity" },
                body: {
                  type: "oauth",
                  refresh: current.refresh,
                  access,
                  expires: current.expires,
                  ...(project && { accountId: project }),
                },
              })
              authWithProject.accountId = project
            }

            const headers = new Headers(init?.headers)
            headers.set("Authorization", `Bearer ${access}`)
            headers.delete("x-goog-api-key")
            headers.set("User-Agent", ANTIGRAVITY_UA)
            headers.set(INTERNAL_REQUEST_HEADER, "local")

            const url = toUrl(requestInput)
            url.searchParams.delete("key")
            const stream = url.pathname.includes("streamGenerateContent")
            const model = getModel(url)
            const nextUrl = toAntigravityUrl(stream)
            const payload = parseJson(init?.body)
            const body = model && payload ? JSON.stringify(wrapBody(model, payload, project!)) : init?.body
            headers.set("Accept", stream ? "text/event-stream" : "application/json")

            const res = await fetch(nextUrl, {
              ...init,
              headers,
              body,
            })
            return unwrap(res)
          },
        }
      },
      methods: [
        {
          label: "Antigravity (browser)",
          type: "oauth",
          authorize: async () => {
            const redirectUri = await startOAuthServer()
            const state = generateState()
            const callbackPromise = waitForOAuth(state)
            return {
              url: buildAuthorizeUrl(redirectUri, state),
              instructions: "Complete Google authorization in browser",
              method: "auto" as const,
              callback: async () => {
                try {
                  const tokens = await callbackPromise
                  stopOAuthServer()
                  if (!tokens.refresh_token) return { type: "failed" as const }
                  const load = await loadCodeAssist(tokens.access_token)
                  const project = await completeOnboarding(tokens.access_token, load.project, load.tier)
                  return {
                    type: "success" as const,
                    refresh: tokens.refresh_token,
                    access: tokens.access_token,
                    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                    accountId: project,
                  }
                } catch (error) {
                  stopOAuthServer()
                  console.warn("antigravity oauth failed", { error })
                  return { type: "failed" as const }
                }
              },
            }
          },
        },
        {
          label: "Manually enter API Key",
          type: "api",
        },
      ],
    },
  }
}
