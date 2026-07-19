import { createServer } from "node:http"
import type { IntegrationOAuthMethodRegistration } from "@shob/plugin/v2/effect/integration"
import type { PluginContext } from "@shob/plugin/v2/effect"
import { Deferred, Effect } from "effect"
import type { Scope } from "effect"
import { Credential } from "../../credential"
import { InstallationVersion } from "../../installation/version"
import { Integration } from "../../integration"
import { ProviderV2 } from "../../provider"
import { define } from "../internal"
import type { PluginInternal } from "../internal"

type FetchLike = (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>

const appBaseURL = "https://app.cline.bot"
const authorizeURL = "https://api.cline.bot/api/v1/auth/authorize"
const tokenExchangeURL = "https://api.cline.bot/api/v1/auth/token"
const refreshURL = "https://api.cline.bot/api/v1/auth/refresh"
const callbackPort = 1458
const redirectURI = `http://localhost:${callbackPort}/auth/callback`
const methodID = Integration.MethodID.make("browser")

type Tokens = {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  email?: string
}

const oauth = {
  integrationID: Integration.ID.make("cline"),
  method: {
    id: methodID,
    type: "oauth",
    label: "Cline (browser)",
  },
  authorize: () =>
    Effect.gen(function* () {
      const code = yield* Deferred.make<string, Error>()
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", redirectURI)
        if (url.pathname !== "/auth/callback") {
          response.writeHead(404).end("Not found")
          return
        }
        const error = url.searchParams.get("error_description") ?? url.searchParams.get("error")
        const value = url.searchParams.get("code")
        if (error || !value) {
          Effect.runFork(Deferred.fail(code, new Error(error ?? "Missing authorization code")))
          response.writeHead(error ? 200 : 400, { "Content-Type": "text/html" }).end("Cline authorization failed.")
          return
        }
        Effect.runFork(Deferred.succeed(code, value))
        response.writeHead(200, { "Content-Type": "text/html" }).end("Cline authorization complete.")
      })
      yield* Effect.callback<void, Error>((resume) => {
        server.once("error", (error) => resume(Effect.fail(error)))
        server.listen(callbackPort, "localhost", () => resume(Effect.void))
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => server.close()))
      return {
        mode: "auto" as const,
        url: buildAuthURL(),
        instructions: "Complete authorization in your browser. This window will close automatically.",
        callback: Deferred.await(code).pipe(
          Effect.flatMap(exchangeCode),
          Effect.map((tokens) => credential(tokens)),
        ),
      }
    }),
  refresh: (value) =>
    refreshClineToken(value.refresh).pipe(
      Effect.map((tokens) => Credential.OAuth.make({ ...credential(tokens), metadata: value.metadata })),
    ),
} satisfies IntegrationOAuthMethodRegistration

export const ClinePlugin = define({
  id: "cline",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.integration.transform((draft) => {
      draft.update("cline", (integration) => {
        integration.name = "Cline"
      })
      draft.method.update(oauth)
      draft.method.update({ integrationID: "cline", method: { type: "key", label: "Cline API key / token" } })
      draft.method.update({ integrationID: "cline", method: { type: "env", names: ["CLINE_API_KEY"] } })
    })
    yield* ctx.catalog.transform(
      Effect.fn(function* (catalog) {
        const token = yield* activeToken(ctx)
        const record = catalog.provider.get(ProviderV2.ID.cline)
        if (!record) return
        catalog.provider.update(ProviderV2.ID.cline, (provider) => {
          provider.integrationID = Integration.ID.make("cline")
          Object.assign(provider.request.headers, buildClineHeaders(token))
        })
      }),
    )
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== ProviderV2.ID.cline) return
        const token = yield* activeToken(ctx)
        evt.options.fetch = clineFetch(token, evt.options.fetch)
        Object.assign(evt.options.headers ?? (evt.options.headers = {}), buildClineHeaders(token))
      }),
    )
  }),
} satisfies PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>)

export function buildClineHeaders(token: string | undefined, extraHeaders: Record<string, string> = {}) {
  return {
    "HTTP-Referer": "https://cline.bot",
    "X-Title": "Cline",
    "User-Agent": `9Router/${InstallationVersion}`,
    "X-PLATFORM": process.platform || "unknown",
    "X-PLATFORM-VERSION": process.version || "unknown",
    "X-CLIENT-TYPE": "9router",
    "X-CLIENT-VERSION": InstallationVersion,
    "X-CORE-VERSION": InstallationVersion,
    "X-IS-MULTIROOT": "false",
    ...(token ? { Authorization: `Bearer ${accessToken(token)}` } : {}),
    ...extraHeaders,
  }
}

export function clineFetch(token?: string, upstream: FetchLike = fetch) {
  return async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    headers.delete("authorization")
    headers.delete("Authorization")
    for (const [key, value] of Object.entries(buildClineHeaders(token))) headers.set(key, value)
    const response = await upstream(normalizeClineRequest(input), { ...init, headers })
    return normalizeClineResponse(response)
  }
}

function buildAuthURL() {
  return `${authorizeURL}?${new URLSearchParams({
    client_type: "extension",
    callback_url: redirectURI,
    redirect_uri: redirectURI,
  })}`
}

function exchangeCode(code: string) {
  return Effect.tryPromise({
    try: async (signal) => {
      try {
        return parseInlineCode(code)
      } catch {}
      const response = await fetch(tokenExchangeURL, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          client_type: "extension",
          redirect_uri: redirectURI,
        }),
        signal,
      })
      if (!response.ok) throw new Error(`Cline token exchange failed: ${response.status}`)
      return tokensFromResponse(await response.json())
    },
    catch: (cause) => cause,
  })
}

function refreshClineToken(refreshToken: string) {
  return Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(refreshURL, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          refreshToken,
          grantType: "refresh_token",
          clientType: "extension",
        }),
        signal,
      })
      if (!response.ok) throw new Error(`Cline token refresh failed: ${response.status}`)
      return tokensFromResponse(await response.json())
    },
    catch: (cause) => cause,
  })
}

function parseInlineCode(code: string): Tokens {
  const padded = code + "=".repeat((4 - (code.length % 4)) % 4)
  const decoded = Buffer.from(padded, "base64").toString("utf8")
  const lastBrace = decoded.lastIndexOf("}")
  if (lastBrace === -1) throw new Error("No JSON found in Cline authorization code")
  return tokensFromResponse(JSON.parse(decoded.slice(0, lastBrace + 1)) as unknown)
}

function tokensFromResponse(payload: unknown): Tokens {
  const data =
    payload && typeof payload === "object" && "data" in payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload
  if (!data || typeof data !== "object" || !("accessToken" in data) || typeof data.accessToken !== "string") {
    throw new Error("Missing Cline access token")
  }
  return {
    accessToken: data.accessToken,
    refreshToken: "refreshToken" in data && typeof data.refreshToken === "string" ? data.refreshToken : undefined,
    expiresAt: "expiresAt" in data && typeof data.expiresAt === "string" ? data.expiresAt : undefined,
    email: "email" in data && typeof data.email === "string" ? data.email : undefined,
  }
}

function credential(tokens: Tokens) {
  return Credential.OAuth.make({
    type: "oauth",
    methodID,
    refresh: tokens.refreshToken ?? tokens.accessToken,
    access: tokens.accessToken,
    expires: expiresAt(tokens.expiresAt),
    metadata: tokens.email ? { email: tokens.email } : undefined,
  })
}

function expiresAt(value?: string) {
  if (!value) return Date.now() + 3600 * 1000
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : Date.now() + 3600 * 1000
}

function accessToken(token: string) {
  const trimmed = token.trim()
  return trimmed.startsWith("workos:") ? trimmed : `workos:${trimmed}`
}

function normalizeClineRequest(input: Parameters<typeof fetch>[0]) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  if (url.includes("/chat/completions")) return "https://api.cline.bot/api/v1/chat/completions"
  return input
}

async function normalizeClineResponse(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) return response
  const payload = await response.clone().json().catch(() => undefined)
  if (!payload || typeof payload !== "object" || !("data" in payload)) return response
  const normalized = JSON.stringify(payload.data)
  const headers = new Headers(response.headers)
  headers.set("content-length", String(Buffer.byteLength(normalized)))
  return new Response(normalized, { status: response.status, statusText: response.statusText, headers })
}

function jsonHeaders() {
  return { "Content-Type": "application/json", Accept: "application/json" }
}

function activeToken(ctx: PluginContext) {
  return Effect.gen(function* () {
    const connection = yield* ctx.integration.connection.active("cline")
    const credential = connection
      ? yield* ctx.integration.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
      : undefined
    if (credential?.type === "key") return credential.key
    if (credential?.type === "oauth") return credential.access
    return undefined
  })
}
