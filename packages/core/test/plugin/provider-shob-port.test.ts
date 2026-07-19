import { AISDK } from "@shob/core/aisdk"
import { Catalog } from "@shob/core/catalog"
import { ModelV2 } from "@shob/core/model"
import type { ModelsDev } from "@shob/core/models-dev"
import { enrichProviders } from "@shob/core/models-dev/provider-enrichers"
import { PluginV2 } from "@shob/core/plugin"
import { PluginHost } from "@shob/core/plugin/host"
import { ProviderPlugins } from "@shob/core/plugin/provider"
import { AntigravityPlugin, antigravityFetch } from "@shob/core/plugin/provider/antigravity"
import { ClinePlugin, clineFetch } from "@shob/core/plugin/provider/cline"
import { openAIToCommandCode, wrapNdjsonAsOpenAISse } from "@shob/core/plugin/provider/commandcode"
import { KiloPlugin } from "@shob/core/plugin/provider/kilo"
import { ProviderV2 } from "@shob/core/provider"
import { describe, expect, mock, test } from "bun:test"
import { Effect } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

describe("Shob provider port", () => {
  test("registers all imported provider plugins", () => {
    expect(ProviderPlugins.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        PluginV2.ID.make("kilo"),
        PluginV2.ID.make("cline"),
        PluginV2.ID.make("commandcode"),
        PluginV2.ID.make("antigravity"),
      ]),
    )
  })

  test("enriches models.dev providers for the four imported providers", async () => {
    const fetchMock = mock((url: string | URL | Request) => {
      const value = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url
      if (value.includes("api.cline.bot")) return Promise.resolve(Response.json({ data: [] }))
      if (value.includes("app.kilo.ai")) {
        return Promise.resolve(
          Response.json({
            data: [
              {
                id: "kilo-auto/free",
                name: "Kilo Auto Free",
                supported_parameters: ["tools", "temperature"],
                architecture: { input_modalities: ["text"], output_modalities: ["text"] },
              },
            ],
          }),
        )
      }
      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
      const result = await enrichProviders({
        google: provider("google", "Google", {
          "gemini-3.1-pro-preview": model("gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview", "@ai-sdk/google"),
          "gemini-3-flash-preview": model("gemini-3-flash-preview", "Gemini 3 Flash Preview", "@ai-sdk/google"),
        }),
        openrouter: provider("openrouter", "OpenRouter", {
          "openrouter/free": model("openrouter/free", "OpenRouter Free", "@ai-sdk/openai-compatible"),
        }),
        kilo: provider("kilo", "Kilo", {
          "legacy-kilo": model("legacy-kilo", "Legacy Kilo", "@ai-sdk/openai-compatible"),
        }),
      })

      expect(result.cline?.models["openrouter/free"]?.provider?.api).toBe("https://api.cline.bot/api/v1")
      expect(result.commandcode?.models["deepseek/deepseek-v4-pro"]?.reasoning).toBe(true)
      expect(result.antigravity?.models["gemini-3.1-pro-high"]?.name).toBe("Gemini 3 Pro High")
      expect(result.kilo?.models["kilo-auto/free"]?.provider?.api).toBe("https://api.kilo.ai/api/gateway")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it.effect("routes Kilo responses-only models through responses()", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const aisdk = yield* AISDK.Service
      const host = yield* PluginHost.make(plugin)
      yield* KiloPlugin.effect(host)
      const result = yield* aisdk.runLanguage({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.kilo, ModelV2.ID.make("kilo-auto/free")),
          api: { id: ModelV2.ID.make("kilo-auto/free"), type: "aisdk", package: "@ai-sdk/openai-compatible" },
        }),
        sdk: {
          languageModel: (id: string) => ({ kind: "language", id }),
          responses: (id: string) => ({ kind: "responses", id }),
        },
        options: {},
      })
      expect(result.language as unknown).toEqual({ kind: "responses", id: "kilo-auto/free" })
    }),
  )

  test("normalizes Cline requests and wrapped responses", async () => {
    const observed: { url?: string; authorization?: string } = {}
    const response = await clineFetch("abc", async (url, init) => {
      observed.url = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url
      observed.authorization = new Headers(init?.headers).get("Authorization") ?? undefined
      return Response.json({ data: { ok: true } })
    })("https://example.test/chat/completions", { headers: { Authorization: "old" } })

    expect(observed).toEqual({
      url: "https://api.cline.bot/api/v1/chat/completions",
      authorization: "Bearer workos:abc",
    })
    expect(await response.json()).toEqual({ ok: true })
  })

  test("translates Command Code requests and NDJSON responses", async () => {
    const payload = openAIToCommandCode(
      "commandcode",
      {
        messages: [
          { role: "system", content: "system" },
          { role: "user", content: "hello" },
        ],
        max_tokens: 12,
      },
      true,
    )
    expect(payload.params).toMatchObject({
      model: "commandcode",
      system: "system",
      max_tokens: 12,
    })

    const response = wrapNdjsonAsOpenAISse(
      new Response('{"type":"text-delta","text":"hi"}\n{"type":"finish","finishReason":"stop"}\n'),
      "commandcode",
    )
    expect(await response.text()).toContain('"content":"hi"')
  })

  test("wraps Antigravity requests and unwraps responses", async () => {
    const observed: { url?: string; authorization?: string; body?: Record<string, unknown> } = {}
    const response = await antigravityFetch("access", "project-1", async (url, init) => {
      observed.url = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url
      observed.authorization = new Headers(init?.headers).get("Authorization") ?? undefined
      observed.body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ response: { candidates: [] } })
    })("https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent?key=abc", {
      method: "POST",
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }),
    })

    expect(observed.url).toBe("https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent")
    expect(observed.authorization).toBe("Bearer access")
    expect(observed.body).toMatchObject({ project: "project-1", model: "gemini" })
    expect(await response.json()).toEqual({ candidates: [] })
  })

  it.effect("registers Cline and Antigravity integration methods", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const host = yield* PluginHost.make(plugin)
      yield* ClinePlugin.effect(host)
      yield* AntigravityPlugin.effect(host)
      const cline = yield* host.integration.connection.active("cline")
      const antigravity = yield* host.integration.connection.active("antigravity")
      expect(cline).toBeUndefined()
      expect(antigravity).toBeUndefined()
    }),
  )

  it.effect("keeps runtime fetch functions out of public provider catalog data", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const catalog = yield* Catalog.Service
      const host = yield* PluginHost.make(plugin)
      yield* ClinePlugin.effect(host)
      yield* AntigravityPlugin.effect(host)
      yield* catalog.transform((draft) => {
        draft.provider.update(ProviderV2.ID.cline, (provider) => {
          provider.api = { type: "aisdk", package: "@ai-sdk/openai-compatible" }
        })
        draft.provider.update(ProviderV2.ID.antigravity, (provider) => {
          provider.api = { type: "aisdk", package: "@ai-sdk/google" }
        })
      })

      expect((yield* catalog.provider.get(ProviderV2.ID.cline))?.request.body.fetch).toBeUndefined()
      expect((yield* catalog.provider.get(ProviderV2.ID.antigravity))?.request.body.fetch).toBeUndefined()
    }),
  )
})

function provider(id: string, name: string, models: ModelsDev.Provider["models"]): ModelsDev.Provider {
  return {
    id,
    name,
    env: [],
    npm: "@ai-sdk/openai-compatible",
    api: "https://example.test",
    models,
  }
}

function model(id: string, name: string, npm: string): ModelsDev.Provider["models"][string] {
  return {
    id,
    name,
    release_date: "2026-01-01",
    attachment: false,
    reasoning: false,
    temperature: true,
    tool_call: true,
    limit: { context: 128_000, output: 4096 },
    modalities: { input: ["text"], output: ["text"] },
    provider: { npm, api: "https://example.test" },
  }
}
