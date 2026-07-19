import type { Hooks, PluginInput } from "@shob/plugin"
import { createServer } from "http"
const OAUTH_DUMMY_KEY = "shob-dummy-key"
import { InstallationVersion } from "@shob/core/installation/version"


const CLINE_CONFIG = {
  appBaseUrl: "https://app.cline.bot",
  apiBaseUrl: "https://api.cline.bot",
  authorizeUrl: "https://api.cline.bot/api/v1/auth/authorize",
  tokenExchangeUrl: "https://api.cline.bot/api/v1/auth/token",
  refreshUrl: "https://api.cline.bot/api/v1/auth/refresh",
}

const OAUTH_PORT = 1458
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/auth/callback`
const TOKEN_REFRESH_MARGIN_MS = 60_000

type ClineTokens = {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  email?: string
  firstName?: string
  lastName?: string
}

type PendingOAuth = {
  resolve: (code: string) => void
  reject: (error: Error) => void
}

let oauthServer: ReturnType<typeof createServer> | undefined
let pendingOAuth: PendingOAuth | undefined

export function getClineAccessToken(token: unknown) {
  if (typeof token !== "string") return ""
  const trimmed = token.trim()
  if (!trimmed) return ""
  return trimmed.startsWith("workos:") ? trimmed : `workos:${trimmed}`
}

export function getClineAuthorizationHeader(token: unknown) {
  const accessToken = getClineAccessToken(token)
  return accessToken ? `Bearer ${accessToken}` : ""
}

export function buildClineHeaders(token: unknown, extraHeaders: Record<string, string> = {}) {
  const authorization = getClineAuthorizationHeader(token)
  const headers: Record<string, string> = {
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline",
    "User-Agent": `9Router/${InstallationVersion}`,
    "X-PLATFORM": process.platform || "unknown",
    "X-PLATFORM-VERSION": process.version || "unknown",
    "X-CLIENT-TYPE": "9router",
    "X-CLIENT-VERSION": InstallationVersion,
    "X-CORE-VERSION": InstallationVersion,
    "X-IS-MULTIROOT": "false",
    ...extraHeaders,
  }
  if (authorization) headers.Authorization = authorization
  return headers
}

function buildAuthUrl() {
  const params = new URLSearchParams({
    client_type: "extension",
    callback_url: REDIRECT_URI,
    redirect_uri: REDIRECT_URI,
  })
  return `${CLINE_CONFIG.authorizeUrl}?${params.toString()}`
}

function parseInlineCode(code: string): ClineTokens {
  let base64 = code
  const padding = 4 - (base64.length % 4)
  if (padding !== 4) base64 += "=".repeat(padding)
  const decoded = Buffer.from(base64, "base64").toString("utf8")
  const lastBrace = decoded.lastIndexOf("}")
  if (lastBrace === -1) throw new Error("No JSON found in decoded code")
  const tokenData = JSON.parse(decoded.substring(0, lastBrace + 1))
  if (!tokenData.accessToken) throw new Error("Missing Cline access token")
  return tokenData
}

async function exchangeCode(code: string): Promise<ClineTokens> {
  try {
    return parseInlineCode(code)
  } catch (inlineError) {
    console.warn("cline inline token parse failed, falling back to token exchange", { error: inlineError })
  }

  const response = await fetch(CLINE_CONFIG.tokenExchangeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_type: "extension",
      redirect_uri: REDIRECT_URI,
    }),
  })
  if (!response.ok) {
    const error = await response.text().catch(() => "")
    throw new Error(`Cline token exchange failed: ${error || response.status}`)
  }
  const payload = await response.json()
  const data = payload?.data || payload
  return {
    accessToken: data?.accessToken,
    refreshToken: data?.refreshToken,
    expiresAt: data?.expiresAt,
    email: data?.userInfo?.email || data?.email || "",
  }
}

async function refreshClineToken(refreshToken: string): Promise<ClineTokens> {
  const response = await fetch(CLINE_CONFIG.refreshUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      refreshToken,
      grantType: "refresh_token",
      clientType: "extension",
    }),
  })
  if (!response.ok) {
    const error = await response.text().catch(() => "")
    throw new Error(`Cline token refresh failed: ${error || response.status}`)
  }
  const payload = await response.json()
  const data = payload?.data || payload
  return {
    accessToken: data?.accessToken,
    refreshToken: data?.refreshToken || refreshToken,
    expiresAt: data?.expiresAt,
    email: data?.userInfo?.email || data?.email || "",
  }
}

function expiresAtMs(expiresAt?: string) {
  if (!expiresAt) return Date.now() + 3600 * 1000
  const ms = new Date(expiresAt).getTime()
  return Number.isFinite(ms) ? ms : Date.now() + 3600 * 1000
}

const HTML_SUCCESS = `<!doctype html><html><head><title>Cline Authorization Successful</title></head><body><h1>Authorization Successful</h1><p>You can close this window and return to Shob.</p><script>setTimeout(() => window.close(), 2000)</script></body></html>`
const HTML_ERROR = (error: string) =>
  `<!doctype html><html><head><title>Cline Authorization Failed</title></head><body><h1>Authorization Failed</h1><pre>${error}</pre></body></html>`

async function startOAuthServer() {
  if (oauthServer) return

  oauthServer = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${OAUTH_PORT}`)
    if (url.pathname !== "/auth/callback") {
      res.writeHead(404)
      res.end("Not found")
      return
    }

    const error = url.searchParams.get("error")
    const errorDescription = url.searchParams.get("error_description")
    const code = url.searchParams.get("code")

    if (error) {
      const message = errorDescription || error
      pendingOAuth?.reject(new Error(message))
      pendingOAuth = undefined
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(HTML_ERROR(message))
      return
    }

    if (!code) {
      const message = "Missing authorization code"
      pendingOAuth?.reject(new Error(message))
      pendingOAuth = undefined
      res.writeHead(400, { "Content-Type": "text/html" })
      res.end(HTML_ERROR(message))
      return
    }

    const pending = pendingOAuth
    pendingOAuth = undefined
    pending?.resolve(code)
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(HTML_SUCCESS)
  })

  await new Promise<void>((resolve, reject) => {
    oauthServer!.listen(OAUTH_PORT, () => {
      console.info("cline oauth server started", { port: OAUTH_PORT })
      resolve()
    })
    oauthServer!.on("error", reject)
  })
}

function stopOAuthServer() {
  if (!oauthServer) return
  oauthServer.close(() => {
    console.info("cline oauth server stopped")
  })
  oauthServer = undefined
}

function waitForOAuthCallback() {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        if (pendingOAuth) {
          pendingOAuth = undefined
          reject(new Error("OAuth callback timeout - authorization took too long"))
        }
      },
      5 * 60 * 1000,
    )

    pendingOAuth = {
      resolve: (code) => {
        clearTimeout(timeout)
        resolve(code)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

function copyHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.delete("authorization")
  headers.delete("Authorization")
  return headers
}

function normalizeClineRequest(input: RequestInfo | URL) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input.url)
  if (url.includes("/chat/completions")) return "https://api.cline.bot/api/v1/chat/completions"
  return input
}

async function normalizeClineResponse(response: Response) {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) return response
  const payload = await response.clone().json().catch(() => undefined)
  if (!payload || typeof payload !== "object" || !("data" in payload)) return response
  const normalized = JSON.stringify((payload as { data: unknown }).data)
  const headers = new Headers(response.headers)
  headers.set("content-length", String(Buffer.byteLength(normalized)))
  return new Response(normalized, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function ClineAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "cline",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth?.type !== "oauth") return {}

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            let currentAuth = await getAuth()
            if (currentAuth?.type !== "oauth") return fetch(requestInput, init)

            if (!currentAuth.access || currentAuth.expires - TOKEN_REFRESH_MARGIN_MS <= Date.now()) {
              console.info("refreshing cline access token")
              const refreshed = await refreshClineToken(currentAuth.refresh)
              await input.client.auth.set({
                path: { id: "cline" },
                body: {
                  type: "oauth",
                  refresh: refreshed.refreshToken || currentAuth.refresh,
                  access: refreshed.accessToken,
                  expires: expiresAtMs(refreshed.expiresAt),
                },
              })
              currentAuth = {
                ...currentAuth,
                refresh: refreshed.refreshToken || currentAuth.refresh,
                access: refreshed.accessToken,
                expires: expiresAtMs(refreshed.expiresAt),
              }
            }

            const headers = copyHeaders(init)
            for (const [key, value] of Object.entries(buildClineHeaders(currentAuth.access))) {
              headers.set(key, value)
            }

            let response = await fetch(normalizeClineRequest(requestInput), { ...init, headers })
            if (response.status !== 401) return normalizeClineResponse(response)

            console.info("cline request unauthorized, refreshing and retrying once")
            const refreshed = await refreshClineToken(currentAuth.refresh)
            await input.client.auth.set({
              path: { id: "cline" },
              body: {
                type: "oauth",
                refresh: refreshed.refreshToken || currentAuth.refresh,
                access: refreshed.accessToken,
                expires: expiresAtMs(refreshed.expiresAt),
              },
            })
            for (const [key, value] of Object.entries(buildClineHeaders(refreshed.accessToken))) {
              headers.set(key, value)
            }
            response = await fetch(normalizeClineRequest(requestInput), { ...init, headers })
            return normalizeClineResponse(response)
          },
        }
      },
      methods: [
        {
          label: "Cline (browser)",
          type: "oauth",
          authorize: async () => {
            await startOAuthServer()
            const callbackPromise = waitForOAuthCallback()
            return {
              url: buildAuthUrl(),
              instructions: "Complete authorization in your browser. This window will close automatically.",
              method: "auto" as const,
              callback: async () => {
                try {
                  const code = await callbackPromise
                  const tokens = await exchangeCode(code)
                  if (!tokens.accessToken) return { type: "failed" as const }
                  return {
                    type: "success" as const,
                    refresh: tokens.refreshToken || "",
                    access: tokens.accessToken,
                    expires: expiresAtMs(tokens.expiresAt),
                  }
                } finally {
                  stopOAuthServer()
                }
              },
            }
          },
        },
        {
          label: "Cline API key / token",
          type: "api",
        },
      ],
    },
  }
}
