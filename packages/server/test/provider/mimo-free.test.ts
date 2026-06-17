import { beforeEach, expect, mock, test } from "bun:test"
import {
  MIMO_BOOTSTRAP_URL,
  MIMO_CHAT_URL,
  MIMO_SYSTEM_MARKER,
  bootstrapMimoJwt,
  createMimoFreeFetch,
  generateMimoFingerprint,
  generateMimoSessionID,
  injectMimoSystemMarker,
  resetMimoJwtCache,
} from "../../src/provider/mimo-free/fetch"
import { withMimoFreeModels } from "../../src/provider/mimo-free/models"

function jwt(exp: number) {
  return `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`
}

beforeEach(() => resetMimoJwtCache())

test("MiMo identity values are stable and correctly formatted", () => {
  expect(generateMimoFingerprint()).toMatch(/^[a-f0-9]{64}$/)
  expect(generateMimoFingerprint()).toBe(generateMimoFingerprint())
  expect(generateMimoSessionID()).toMatch(/^ses_[a-z0-9]{24}$/)
})

test("MiMo marker injection is idempotent", () => {
  const first = injectMimoSystemMarker({ messages: [{ role: "user", content: "hello" }] }) as any
  const second = injectMimoSystemMarker(first) as any
  expect(first.messages[0].content).toBe(MIMO_SYSTEM_MARKER)
  expect(second.messages.filter((message: any) => message.content === MIMO_SYSTEM_MARKER)).toHaveLength(1)
})

test("MiMo Free registers the no-cost mimo-auto model", () => {
  const seed = {
    id: "seed",
    name: "Seed",
    env: [],
    models: {
      seed: {
        id: "seed",
        name: "Seed",
        release_date: "2026-01-01",
        attachment: false,
        reasoning: false,
        temperature: true,
        tool_call: true,
        limit: { context: 1, output: 1 },
      },
    },
  }
  const providers = withMimoFreeModels({ openai: seed })
  expect(providers["mimo-free"].name).toBe("MiMo Code")
  expect(Object.keys(providers["mimo-free"].models)).toEqual(["mimo-auto"])
  expect(providers["mimo-free"].models["mimo-auto"].name).toBe("MiMo-V2.5-Pro")
  expect((providers["mimo-free"].models["mimo-auto"] as any).cost.input).toBe(0)
})

test("MiMo bootstrap caches a valid JWT", async () => {
  const token = jwt(Math.floor(Date.now() / 1000) + 3600)
  const fetcher = mock(async () => Response.json({ jwt: token })) as unknown as typeof fetch
  expect(await bootstrapMimoJwt(fetcher)).toBe(token)
  expect(await bootstrapMimoJwt(fetcher)).toBe(token)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher).toHaveBeenCalledWith(MIMO_BOOTSTRAP_URL, expect.any(Object))
})

test("MiMo fetch injects auth and retries once after a 403", async () => {
  const first = jwt(Math.floor(Date.now() / 1000) + 3600)
  const second = jwt(Math.floor(Date.now() / 1000) + 7200)
  const fetcher = mock()
    .mockResolvedValueOnce(Response.json({ jwt: first }))
    .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
    .mockResolvedValueOnce(Response.json({ jwt: second }))
    .mockResolvedValueOnce(new Response("ok")) as unknown as typeof fetch

  const response = await createMimoFreeFetch(fetcher)("https://unused.invalid/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "mimo-auto", messages: [{ role: "user", content: "hello" }] }),
  })

  expect(response.status).toBe(200)
  expect(fetcher).toHaveBeenCalledTimes(4)
  const call = (fetcher as any).mock.calls[3]
  expect(call[0]).toBe(MIMO_CHAT_URL)
  expect(new Headers(call[1].headers).get("authorization")).toBe(`Bearer ${second}`)
  expect(new Headers(call[1].headers).get("x-mimo-source")).toBe("mimocode-cli-free")
  expect(JSON.parse(call[1].body).messages[0].content).toBe(MIMO_SYSTEM_MARKER)
})
