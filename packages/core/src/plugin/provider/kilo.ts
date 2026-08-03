import type { IntegrationOAuthMethodRegistration } from "@shob/plugin/v2/effect/integration"
import type { PluginContext } from "@shob/plugin/v2/effect"
import { Effect } from "effect"
import type { Scope } from "effect"
import { Credential } from "../../credential"
import { Integration } from "../../integration"
import { ProviderV2 } from "../../provider"
import { define } from "../internal"
import type { PluginInternal } from "../internal"

const startURL = "https://api.kilo.ai/api/device-auth/codes"
const pollURL = "https://api.kilo.ai/api/device-auth/codes"
const methodID = Integration.MethodID.make("browser")
const pollInterval = 3500
const defaultExpires = 300_000

type StartResponse = {
  code: string
  verificationUrl: string
  expiresIn?: number
}

type PollResponse = {
  status?: string
  token?: string
}

const responsesOnly = [
  "kilo-auto/free",
  "x-ai/grok-code-fast-1:optimized:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "inclusionai/ling-2.6-1t:free",
  "inclusionai/ling-2.6-flash:free",
  "tencent/hy3-preview:free",
]

const oauth = {
  integrationID: Integration.ID.make("kilo"),
  method: {
    id: methodID,
    type: "oauth",
    label: "Kilo (browser)",
  },
  authorize: () =>
    Effect.gen(function* () {
      const init = yield* request<StartResponse>(startURL, { method: "POST", headers: jsonHeaders() })
      return {
        mode: "auto" as const,
        url: init.verificationUrl,
        instructions: `Code: ${init.code}`,
        callback: poll(init),
      }
    }),
  refresh: (credential) => Effect.succeed(credential),
} satisfies IntegrationOAuthMethodRegistration

export const KiloPlugin = define({
  id: "kilo",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.integration.transform((draft) => {
      draft.update("kilo", (integration) => {
        integration.name = "Kilo"
      })
      draft.method.update(oauth)
      draft.method.update({ integrationID: "kilo", method: { type: "key", label: "Kilo token" } })
    })
    yield* ctx.catalog.transform(
      Effect.fn(function* (evt) {
        const credential = yield* activeKiloCredential(ctx)
        for (const item of evt.provider.list()) {
          if (item.provider.api.type !== "aisdk") continue
          if (item.provider.api.package !== "@ai-sdk/openai-compatible") continue
          if (item.provider.api.url !== "https://api.kilo.ai/api/gateway") continue
          evt.provider.update(item.provider.id, (provider) => {
            provider.integrationID = Integration.ID.make("kilo")
            provider.request.headers["HTTP-Referer"] = "https://shob.olova.dev/"
            provider.request.headers["X-Title"] = "opencode"
            if (credential) provider.request.body.apiKey = credential
          })
        }
      }),
    )
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== ProviderV2.ID.kilo) return
        const credential = yield* activeKiloCredential(ctx)
        if (credential) evt.options.apiKey = credential
      }),
    )
    yield* ctx.aisdk.language(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== ProviderV2.ID.kilo) return
        const id = String(evt.model.api.id).trim()
        if (!id.startsWith("kilo-") && !responsesOnly.includes(id)) return
        if (typeof evt.sdk.responses !== "function") {
          throw new Error(`Kilo model ${id} requires responses API, but responses() is unavailable`)
        }
        evt.language = evt.sdk.responses(id)
      }),
    )
  }),
} satisfies PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>)

function jsonHeaders() {
  return { "Content-Type": "application/json" }
}

function request<A>(url: string, init?: RequestInit) {
  return Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { ...init, signal })
      if (!response.ok) throw new Error(`Kilo request failed: ${response.status}`)
      return response.json() as Promise<A>
    },
    catch: (cause) => cause,
  })
}

function poll(init: StartResponse) {
  return Effect.gen(function* () {
    const expires = Date.now() + (init.expiresIn ? init.expiresIn * 1000 : defaultExpires)
    while (Date.now() < expires) {
      const response = yield* Effect.tryPromise({
        try: (signal) => fetch(`${pollURL}/${init.code}`, { signal }),
        catch: (cause) => cause,
      })
      if (response.status === 403 || response.status === 410) {
        return yield* Effect.fail(new Error("Kilo authorization failed"))
      }
      if (response.ok) {
        const data = (yield* Effect.promise(() => response.json())) as PollResponse
        if (data.status === "approved" && data.token) return credential(data.token)
      }
      yield* Effect.sleep(pollInterval)
    }
    return yield* Effect.fail(new Error("Kilo authorization timed out"))
  })
}

function credential(token: string) {
  return Credential.OAuth.make({
    type: "oauth",
    methodID,
    refresh: token,
    access: token,
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
  })
}

function activeKiloCredential(ctx: PluginContext) {
  return Effect.gen(function* () {
    const connection = yield* ctx.integration.connection.active("kilo")
    const credential = connection
      ? yield* ctx.integration.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
      : undefined
    if (credential?.type === "key") return credential.key
    if (credential?.type === "oauth") return credential.access
    return undefined
  })
}
