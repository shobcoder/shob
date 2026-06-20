import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "../../config/config"
import { Provider } from "../../provider/provider"
import { ModelsDev } from "../../provider/models"
import { ProviderAuth } from "../../provider/auth"
import { ProviderID } from "../../provider/schema"
import { AppRuntime } from "../../effect/app-runtime"
import { mapValues } from "remeda"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Log } from "../../util/log"

const log = Log.create({ service: "server" })

const CompatibleFetchedModel = z.object({
  id: z.string(),
  name: z.string().optional(),
})

const GITLAWB_OPENGATEWAY_CATALOG_URL = "https://gitlawb.com/opengateway"

function isGitlawbOpenGateway(baseURL: string) {
  try {
    const url = new URL(baseURL)
    return ["opengateway.gitlawb.com", "opengateway.fly.dev"].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function normalizeAnthropicCompatibleBaseURL(value: string) {
  const url = value.trim().replace(/\/+$/, "")
  if (/\/v1\/messages$/i.test(url)) return url.replace(/\/messages$/i, "")
  if (/\/messages$/i.test(url)) return url.replace(/\/messages$/i, "")
  if (/\/v1$/i.test(url)) return url
  return `${url}/v1`
}

function parseCompatibleModels(input: unknown) {
  const list =
    typeof input === "object" && input !== null && Array.isArray((input as { data?: unknown }).data)
      ? (input as { data: unknown[] }).data
      : Array.isArray(input)
        ? input
        : undefined

  if (!list) return

  return list
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => {
      const id = typeof item.id === "string" ? item.id : typeof item.name === "string" ? item.name : undefined
      if (!id) return
      const name =
        typeof item.display_name === "string"
          ? item.display_name
          : typeof item.name === "string" && item.name !== id
            ? item.name
            : undefined
      return name ? { id, name } : { id }
    })
    .filter((item): item is { id: string; name?: string } => item !== undefined)
}

async function fetchGitlawbOpenGatewayCatalog() {
  const response = await fetch(GITLAWB_OPENGATEWAY_CATALOG_URL, {
    headers: {
      Accept: "text/html",
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenGateway catalog: ${response.status} ${response.statusText}`)
  }

  const plainText = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")
  const ids = Array.from(
    new Set(
      Array.from(plainText.matchAll(/\bmodel:\s*([A-Za-z0-9][A-Za-z0-9._:/-]*)/g), (match) => match[1].trim()),
    ),
  )
  if (ids.length === 0) {
    throw new Error("OpenGateway catalog did not contain any model IDs")
  }

  return ids.map((id) => ({ id }))
}

export const ProviderRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List providers",
        description: "Get a list of all available AI providers, including both available and connected ones.",
        operationId: "provider.list",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    all: Provider.Info.array(),
                    default: z.record(z.string(), z.string()),
                    connected: z.array(z.string()),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const config = await Config.get()
        const disabled = new Set(config.disabled_providers ?? [])
        const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined

        const allProviders = await ModelsDev.get()
        const filteredProviders: Record<string, (typeof allProviders)[string]> = {}
        for (const [key, value] of Object.entries(allProviders)) {
          if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
            filteredProviders[key] = value
          }
        }

        const connected = await Provider.list()
        const providers = Object.assign(
          Provider.applyHiddenModels(
            mapValues(filteredProviders, (x) => Provider.fromModelsDevProvider(x)),
            config.hidden_models,
          ),
          connected,
        )
        return c.json({
          all: Object.values(providers),
          default: mapValues(providers, (item) => Provider.sort(Object.values(item.models))[0].id),
          connected: Object.keys(connected),
        })
      },
    )
    .post(
      "/openai-compatible/models",
      describeRoute({
        summary: "Fetch OpenAI-compatible models",
        description: "Fetch model IDs from an OpenAI-compatible provider's /models endpoint.",
        operationId: "provider.openaiCompatible.models",
        responses: {
          200: {
            description: "Fetched models",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    data: z.array(CompatibleFetchedModel),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          baseURL: z.string(),
          apiKey: z.string(),
          headers: z.record(z.string(), z.string()).optional(),
        }),
      ),
      async (c) => {
        const input = c.req.valid("json")
        const baseURL = input.baseURL.trim().replace(/\/+$/, "")
        if (!/^https?:\/\//.test(baseURL)) {
          return c.json({ error: "Base URL must start with http:// or https://" }, 400)
        }

        const isOpenGateway = isGitlawbOpenGateway(baseURL)
        if (isOpenGateway) {
          try {
            return c.json({ data: await fetchGitlawbOpenGatewayCatalog() })
          } catch (error) {
            return c.json(
              {
                error: error instanceof Error ? error.message : String(error),
              },
              400,
            )
          }
        }

        const response = await fetch(`${baseURL}/models`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${input.apiKey}`,
            ...(input.headers ?? {}),
          },
        }).catch((error) => {
          throw new Error(error instanceof Error ? error.message : String(error))
        })

        const text = await response.text()
        if (!response.ok) {
          return c.json(
            {
              error: `Failed to fetch models: ${response.status} ${response.statusText}`,
              body: text,
            },
            400,
          )
        }

        const data = (() => {
          try {
            return JSON.parse(text) as unknown
          } catch {
            return undefined
          }
        })()
        if (!data) {
          return c.json({ error: "Invalid JSON response from API" }, 400)
        }
        const models = parseCompatibleModels(data)
        if (!models) {
          return c.json({ error: "Invalid response format from API" }, 400)
        }

        return c.json({ data: models })
      },
    )
    .post(
      "/anthropic-compatible/models",
      describeRoute({
        summary: "Fetch Anthropic-compatible models",
        description: "Fetch model IDs from an Anthropic-compatible provider's /models endpoint.",
        operationId: "provider.anthropicCompatible.models",
        responses: {
          200: {
            description: "Fetched models",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    data: z.array(CompatibleFetchedModel),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          baseURL: z.string(),
          apiKey: z.string(),
          headers: z.record(z.string(), z.string()).optional(),
        }),
      ),
      async (c) => {
        const input = c.req.valid("json")
        const baseURL = normalizeAnthropicCompatibleBaseURL(input.baseURL)
        if (!/^https?:\/\//.test(baseURL)) {
          return c.json({ error: "Base URL must start with http:// or https://" }, 400)
        }

        const response = await fetch(`${baseURL}/models`, {
          headers: {
            Accept: "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": input.apiKey,
            Authorization: `Bearer ${input.apiKey}`,
            ...(input.headers ?? {}),
          },
        }).catch((error) => {
          throw new Error(error instanceof Error ? error.message : String(error))
        })

        const text = await response.text()
        if (!response.ok) {
          return c.json(
            {
              error: `Failed to fetch models: ${response.status} ${response.statusText}`,
              body: text,
            },
            400,
          )
        }

        const data = (() => {
          try {
            return JSON.parse(text) as unknown
          } catch {
            return undefined
          }
        })()
        if (!data) {
          return c.json({ error: "Invalid JSON response from API" }, 400)
        }
        const models = parseCompatibleModels(data)
        if (!models) {
          return c.json({ error: "Invalid response format from API" }, 400)
        }

        return c.json({ data: models })
      },
    )
    .get(
      "/auth",
      describeRoute({
        summary: "Get provider auth methods",
        description: "Retrieve available authentication methods for all AI providers.",
        operationId: "provider.auth",
        responses: {
          200: {
            description: "Provider auth methods",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), z.array(ProviderAuth.Method))),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await AppRuntime.runPromise(ProviderAuth.Service.use((svc) => svc.methods())))
      },
    )
    .post(
      "/:providerID/oauth/authorize",
      describeRoute({
        summary: "OAuth authorize",
        description: "Initiate OAuth authorization for a specific AI provider to get an authorization URL.",
        operationId: "provider.oauth.authorize",
        responses: {
          200: {
            description: "Authorization URL and method",
            content: {
              "application/json": {
                schema: resolver(ProviderAuth.Authorization.optional()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          method: z.number().meta({ description: "Auth method index" }),
          inputs: z.record(z.string(), z.string()).optional().meta({ description: "Prompt inputs" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const { method, inputs } = c.req.valid("json")
        const result = await AppRuntime.runPromise(
          ProviderAuth.Service.use((svc) =>
            svc.authorize({
              providerID,
              method,
              inputs,
            }),
          ),
        )
        return c.json(result)
      },
    )
    .post(
      "/:providerID/oauth/callback",
      describeRoute({
        summary: "OAuth callback",
        description: "Handle the OAuth callback from a provider after user authorization.",
        operationId: "provider.oauth.callback",
        responses: {
          200: {
            description: "OAuth callback processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          method: z.number().meta({ description: "Auth method index" }),
          code: z.string().optional().meta({ description: "OAuth authorization code" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const { method, code } = c.req.valid("json")
        await AppRuntime.runPromise(
          ProviderAuth.Service.use((svc) =>
            svc.callback({
              providerID,
              method,
              code,
            }),
          ),
        )
        return c.json(true)
      },
    ),
)
