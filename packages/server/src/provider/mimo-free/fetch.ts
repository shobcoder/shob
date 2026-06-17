import { createHash } from "crypto"
import os from "os"

export const MIMO_BOOTSTRAP_URL = "https://api.xiaomimimo.com/api/free-ai/bootstrap"
export const MIMO_CHAT_URL = "https://api.xiaomimimo.com/api/free-ai/openai/chat"
export const MIMO_SYSTEM_MARKER =
  "You are MiMoCode, an interactive CLI tool that helps users with software engineering tasks."

const JWT_FALLBACK_TTL_MS = 3_000_000
const JWT_EXPIRY_BUFFER_MS = 300_000
const SESSION_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"

const BOOTSTRAP_MAX_ATTEMPTS = 6
const CHAT_MAX_RETRIES = 4
const BASE_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 30_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function parseRetryAfter(header: string | null) {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(header)
  if (!Number.isNaN(at)) return Math.max(0, at - Date.now())
  return undefined
}

function backoffDelay(attempt: number, retryAfterMs?: number) {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, MAX_BACKOFF_MS)
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)
  return exp + Math.random() * exp * 0.25
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 408 || status >= 500
}

let cachedJwt: string | undefined
let jwtExpiresAt = 0
let bootstrapRequest: Promise<string> | undefined

export function generateMimoFingerprint() {
  let username = "unknown-user"
  try {
    username = os.userInfo().username
  } catch {}
  const cpu = (os.cpus()[0]?.model || "unknown-cpu").trim()
  const seed = `${os.hostname()}|${os.platform()}|${os.arch()}|${cpu}|${username}`
  return createHash("sha256").update(seed).digest("hex")
}

export function generateMimoSessionID() {
  let id = "ses_"
  for (let i = 0; i < 24; i++) id += SESSION_CHARS[Math.floor(Math.random() * SESSION_CHARS.length)]
  return id
}

export function parseMimoJwtExpiry(jwt: string) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString())
    if (typeof payload.exp === "number") return payload.exp * 1000
  } catch {}
  return Date.now() + JWT_FALLBACK_TTL_MS
}

export function injectMimoSystemMarker(body: unknown) {
  if (!body || typeof body !== "object") return body
  const value = body as { messages?: Array<{ role?: string; content?: unknown }> }
  if (!Array.isArray(value.messages)) return body
  const exists = value.messages.some(
    (message) =>
      message?.role === "system" &&
      typeof message.content === "string" &&
      message.content.includes(MIMO_SYSTEM_MARKER),
  )
  if (exists) return body
  return {
    ...value,
    messages: [{ role: "system", content: MIMO_SYSTEM_MARKER }, ...value.messages],
  }
}

export function resetMimoJwtCache() {
  cachedJwt = undefined
  jwtExpiresAt = 0
  bootstrapRequest = undefined
}

export async function bootstrapMimoJwt(fetcher: typeof fetch = fetch) {
  if (cachedJwt && Date.now() < jwtExpiresAt - JWT_EXPIRY_BUFFER_MS) return cachedJwt
  if (bootstrapRequest) return bootstrapRequest

  bootstrapRequest = (async () => {
    let lastError: unknown
    for (let attempt = 0; attempt < BOOTSTRAP_MAX_ATTEMPTS; attempt++) {
      let response: Response
      try {
        response = await fetcher(MIMO_BOOTSTRAP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client: generateMimoFingerprint() }),
        })
      } catch (error) {
        lastError = error
        if (attempt === BOOTSTRAP_MAX_ATTEMPTS - 1) break
        await sleep(backoffDelay(attempt))
        continue
      }

      if (response.ok) {
        const data = (await response.json()) as { jwt?: string }
        if (!data.jwt) throw new Error("MiMo bootstrap returned no JWT")
        cachedJwt = data.jwt
        jwtExpiresAt = parseMimoJwtExpiry(data.jwt)
        return data.jwt
      }

      lastError = new Error(`MiMo bootstrap failed: ${response.status}`)
      if (!isRetryableStatus(response.status) || attempt === BOOTSTRAP_MAX_ATTEMPTS - 1) break
      await sleep(backoffDelay(attempt, parseRetryAfter(response.headers.get("retry-after"))))
    }
    throw lastError instanceof Error ? lastError : new Error("MiMo bootstrap failed")
  })()

  try {
    return await bootstrapRequest
  } finally {
    bootstrapRequest = undefined
  }
}

export function createMimoFreeFetch(fetcher: typeof fetch = fetch) {
  const sessionID = generateMimoSessionID()

  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const send = async (jwt: string) => {
      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Bearer ${jwt}`)
      headers.set("Content-Type", "application/json")
      headers.set("X-Mimo-Source", "mimocode-cli-free")
      headers.set("x-session-affinity", sessionID)

      let body = init?.body
      if (typeof body === "string") {
        try {
          body = JSON.stringify(injectMimoSystemMarker(JSON.parse(body)))
        } catch {}
      }
      return fetcher(MIMO_CHAT_URL, { ...init, method: "POST", headers, body })
    }

    let response = await send(await bootstrapMimoJwt(fetcher))

    for (let attempt = 0; attempt < CHAT_MAX_RETRIES; attempt++) {
      if (response.status === 401 || response.status === 403) {
        resetMimoJwtCache()
        response = await send(await bootstrapMimoJwt(fetcher))
        continue
      }
      if (isRetryableStatus(response.status)) {
        await sleep(backoffDelay(attempt, parseRetryAfter(response.headers.get("retry-after"))))
        response = await send(await bootstrapMimoJwt(fetcher))
        continue
      }
      break
    }

    return response
  }
}
