import { createServer } from "node:http"
import os from "node:os"
import type { IntegrationOAuthMethodRegistration } from "@shob/plugin/v2/effect/integration"
import type { PluginContext } from "@shob/plugin/v2/effect"
import { Deferred, Effect } from "effect"
import type { Scope } from "effect"
import { Credential } from "../../credential"
import { Integration } from "../../integration"
import { ProviderV2 } from "../../provider"
import { define } from "../internal"
import type { PluginInternal } from "../internal"

type FetchLike = (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>

const clientID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
const clientSecret = "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"
const authorizeURL = "https://accounts.google.com/o/oauth2/v2/auth"
const tokenURL = "https://oauth2.googleapis.com/token"
const loadURL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist"
const onboardURL = "https://cloudcode-pa.googleapis.com/v1internal:onboardUser"
const antigravityBaseURL = "https://daily-cloudcode-pa.googleapis.com"
const callbackPort = 1457
const methodID = Integration.MethodID.make("google-browser")
const antigravityUA = `antigravity/1.107.0 ${os.platform()}/${os.arch()}`
const loadUA = "google-api-nodejs-client/9.15.1"
const loadClient = "google-cloud-sdk vscode_cloudshelleditor/0.1"
const loadMetadata = JSON.stringify({ ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" })
const scopes = [
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

type AuthInfo =
  | {
      type: "oauth"
      access: string
      project?: string
    }
  | {
      type: "key"
      key: string
    }

const oauth = {
  integrationID: Integration.ID.make("antigravity"),
  method: {
    id: methodID,
    type: "oauth",
    label: "Antigravity (browser)",
  },
  authorize: () =>
    Effect.gen(function* () {
      const state = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")
      const code = yield* Deferred.make<string, Error>()
      const redirect = `http://localhost:${callbackPort}/auth/callback`
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", redirect)
        if (url.pathname !== "/auth/callback") {
          response.writeHead(404).end("Not found")
          return
        }
        const value = url.searchParams.get("code")
        if (!value || url.searchParams.get("state") !== state) {
          Effect.runFork(Deferred.fail(code, new Error(value ? "Invalid OAuth state" : "Missing authorization code")))
          response.writeHead(400).end("Antigravity authorization failed.")
          return
        }
        Effect.runFork(Deferred.succeed(code, value))
        response.writeHead(200, { "Content-Type": "text/html" }).end("Antigravity authorization complete.")
      })
      yield* Effect.callback<void, Error>((resume) => {
        server.once("error", (error) => resume(Effect.fail(error)))
        server.listen(callbackPort, "localhost", () => resume(Effect.void))
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => server.close()))
      return {
        mode: "auto" as const,
        url: buildAuthorizeURL(redirect, state),
        instructions: "Complete Google authorization in browser.",
        callback: Deferred.await(code).pipe(
          Effect.flatMap((value) => exchangeToken(value, redirect)),
          Effect.flatMap(credential),
        ),
      }
    }),
  refresh: (value) =>
    refreshToken(value.refresh).pipe(
      Effect.map((tokens) =>
        Credential.OAuth.make({
          type: "oauth",
          methodID: Integration.MethodID.make(value.methodID),
          access: tokens.access_token,
          refresh: tokens.refresh_token ?? value.refresh,
          expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
          metadata: value.metadata,
        }),
      ),
    ),
} satisfies IntegrationOAuthMethodRegistration

export const AntigravityPlugin = define({
  id: "antigravity",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.integration.transform((draft) => {
      draft.update("antigravity", (integration) => {
        integration.name = "Antigravity"
      })
      draft.method.update(oauth)
      draft.method.update({ integrationID: "antigravity", method: { type: "key", label: "Manually enter API Key" } })
    })
    yield* ctx.catalog.transform(
      Effect.fn(function* (catalog) {
        const auth = yield* activeAuth(ctx)
        const record = catalog.provider.get(ProviderV2.ID.antigravity)
        if (!record) return
        catalog.provider.update(ProviderV2.ID.antigravity, (provider) => {
          provider.integrationID = Integration.ID.make("antigravity")
          if (auth?.type === "key") provider.request.body.apiKey = auth.key
        })
      }),
    )
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== ProviderV2.ID.antigravity) return
        const auth = yield* activeAuth(ctx)
        if (auth?.type === "key") evt.options.apiKey = auth.key
        if (auth?.type === "oauth") {
          delete evt.options.apiKey
          evt.options.fetch = antigravityFetch(auth.access, auth.project, evt.options.fetch)
        }
      }),
    )
  }),
} satisfies PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>)

export function antigravityFetch(access: string, savedProject?: string, upstream: FetchLike = fetch) {
  let project = savedProject
  return async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    project = project ?? (await resolveProject(access))
    const url = toURL(input)
    url.searchParams.delete("key")
    const stream = url.pathname.includes("streamGenerateContent")
    const model = modelFromURL(url)
    const payload = parseRecord(init?.body)
    const headers = new Headers(init?.headers)
    headers.set("Authorization", `Bearer ${access}`)
    headers.delete("x-goog-api-key")
    headers.set("User-Agent", antigravityUA)
    headers.set("x-request-source", "local")
    headers.set("Accept", stream ? "text/event-stream" : "application/json")
    const response = await upstream(antigravityURL(stream), {
      ...init,
      headers,
      body: model ? JSON.stringify(wrapBody(model, payload, project)) : init?.body,
    })
    return unwrapResponse(response)
  }
}

function buildAuthorizeURL(redirect: string, state: string) {
  return `${authorizeURL}?${new URLSearchParams({
    client_id: clientID,
    response_type: "code",
    redirect_uri: redirect,
    scope: scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  })}`
}

function exchangeToken(code: string, redirect: string) {
  return postToken({
    grant_type: "authorization_code",
    client_id: clientID,
    client_secret: clientSecret,
    code,
    redirect_uri: redirect,
  })
}

function refreshToken(refresh: string) {
  return postToken({
    grant_type: "refresh_token",
    client_id: clientID,
    client_secret: clientSecret,
    refresh_token: refresh,
  })
}

function postToken(body: Record<string, string>) {
  return Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(tokenURL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
        signal,
      })
      if (!response.ok) throw new Error(`Antigravity token request failed: ${response.status}`)
      return response.json() as Promise<TokenResponse>
    },
    catch: (cause) => cause,
  })
}

function credential(tokens: TokenResponse) {
  return Effect.promise(async () => {
    const project = await resolveProject(tokens.access_token)
    return Credential.OAuth.make({
      type: "oauth",
      methodID,
      refresh: tokens.refresh_token ?? tokens.access_token,
      access: tokens.access_token,
      expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      metadata: { project },
    })
  })
}

async function resolveProject(access: string) {
  const load = await loadCodeAssist(access)
  return completeOnboarding(access, load.project, load.tier)
}

async function loadCodeAssist(access: string) {
  const response = await fetch(loadURL, {
    method: "POST",
    headers: apiHeaders(access),
    body: JSON.stringify({ metadata: metadata() }),
  })
  if (!response.ok) throw new Error(`Antigravity loadCodeAssist failed: ${response.status}`)
  const data = (await response.json()) as Record<string, unknown>
  const rawProject = data.cloudaicompanionProject
  const project = typeof rawProject === "string" ? rawProject : asRecord(rawProject)?.id
  const tier =
    Array.isArray(data.allowedTiers)
      ? (data.allowedTiers
          .map(asRecord)
          .find((item) => item?.isDefault === true && typeof item.id === "string")?.id as string | undefined)
      : undefined
  if (typeof project !== "string") throw new Error("Antigravity project missing from loadCodeAssist")
  return { project: project.trim(), tier: tier ?? "legacy-tier" }
}

async function completeOnboarding(access: string, project: string, tier: string) {
  for (const _ of Array.from({ length: 10 })) {
    const response = await fetch(onboardURL, {
      method: "POST",
      headers: apiHeaders(access),
      body: JSON.stringify({ tierId: tier, metadata: metadata() }),
    })
    if (!response.ok) throw new Error(`Antigravity onboardUser failed: ${response.status}`)
    const data = (await response.json()) as Record<string, unknown>
    if (data.done !== true) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      continue
    }
    const raw = asRecord(data.response)?.cloudaicompanionProject
    const next = typeof raw === "string" ? raw : asRecord(raw)?.id
    return typeof next === "string" ? next.trim() : project
  }
  return project
}

function apiHeaders(access: string) {
  return {
    Authorization: `Bearer ${access}`,
    "Content-Type": "application/json",
    "User-Agent": loadUA,
    "X-Goog-Api-Client": loadClient,
    "Client-Metadata": loadMetadata,
  }
}

function metadata() {
  return { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" }
}

function toURL(input: Parameters<typeof fetch>[0]) {
  if (input instanceof URL) return new URL(input)
  if (typeof input === "string") return new URL(input)
  return new URL(input.url)
}

function modelFromURL(url: URL) {
  const match = url.pathname.match(/\/models\/([^:]+):/)
  return match ? decodeURIComponent(match[1]!) : undefined
}

function antigravityURL(stream: boolean) {
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent"
  return `${antigravityBaseURL}/v1internal:${action}`
}

function wrapBody(model: string, body: Record<string, unknown>, project: string) {
  const request = asRecord(body.request) ?? body
  return {
    project,
    model,
    userAgent: "antigravity",
    requestType: "agent",
    requestId: `agent-${crypto.randomUUID()}`,
    request: {
      ...request,
      sessionId: typeof request.sessionId === "string" ? request.sessionId : crypto.randomUUID(),
      safetySettings: undefined,
      toolConfig: Array.isArray(request.tools) && request.tools.length > 0 ? { functionCallingConfig: { mode: "VALIDATED" } } : request.toolConfig,
    },
  }
}

async function unwrapResponse(response: Response) {
  if (response.headers.get("content-type")?.includes("text/event-stream")) return unwrapSSE(response)
  if (!response.headers.get("content-type")?.includes("application/json")) return response
  const body = await response.text()
  const parsed = parseRecord(body)
  const next = "response" in parsed ? JSON.stringify(parsed.response) : body
  const headers = new Headers(response.headers)
  headers.delete("content-length")
  return new Response(next, { status: response.status, statusText: response.statusText, headers })
}

function unwrapSSE(response: Response) {
  if (!response.body) return response
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          controller.enqueue(encoder.encode(`${line}\n`))
          continue
        }
        const raw = line.slice(6).trim()
        if (!raw || raw === "[DONE]") {
          controller.enqueue(encoder.encode(`${line}\n`))
          continue
        }
        const parsed = parseRecord(raw)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed.response ?? parsed)}\n`))
      }
    },
    flush(controller) {
      if (buffer) controller.enqueue(encoder.encode(buffer))
    },
  })
  return new Response(response.body.pipeThrough(stream), {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  })
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return asRecord(value) ?? {}
  try {
    return asRecord(JSON.parse(value)) ?? {}
  } catch {
    return {}
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function activeAuth(ctx: PluginContext): Effect.Effect<AuthInfo | undefined> {
  return Effect.gen(function* () {
    const connection = yield* ctx.integration.connection.active("antigravity")
    const credential = connection
      ? yield* ctx.integration.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
      : undefined
    if (credential?.type === "key") return { type: "key", key: credential.key }
    if (credential?.type === "oauth") {
      const project = typeof credential.metadata?.project === "string" ? credential.metadata.project : undefined
      return { type: "oauth", access: credential.access, project }
    }
    return undefined
  })
}
