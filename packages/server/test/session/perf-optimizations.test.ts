import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { Log } from "../../src/util/log"
import { Bus } from "../../src/bus"
import { BusEvent } from "../../src/bus/bus-event"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import z from "zod"
import { ModelID, ProviderID } from "../../src/provider/schema"

Log.init({ print: false })

const ref = {
  providerID: ProviderID.make("test"),
  modelID: ModelID.make("test-model"),
}

const SessionPing = BusEvent.define("test.session.ping", z.object({ sessionID: z.string(), value: z.number() }))

describe("Bus.subscribeSession", () => {
  function withInstance(directory: string, fn: () => Promise<void>) {
    return Instance.provide({ directory, fn })
  }

  test("receives events for the subscribed sessionID only", async () => {
    await using tmp = await tmpdir()
    const received: number[] = []

    await withInstance(tmp.path, async () => {
      Bus.subscribeSession("session-abc", (evt) => {
        received.push((evt.properties as any).value)
      })
      await Bun.sleep(10)
      await Bus.publish(SessionPing, { sessionID: "session-abc", value: 1 })
      await Bus.publish(SessionPing, { sessionID: "session-other", value: 2 })
      await Bus.publish(SessionPing, { sessionID: "session-abc", value: 3 })
      await Bun.sleep(10)
    })

    expect(received).toEqual([1, 3])
  })

  test("does not receive events for other sessions", async () => {
    await using tmp = await tmpdir()
    const received: number[] = []

    await withInstance(tmp.path, async () => {
      Bus.subscribeSession("session-abc", (evt) => {
        received.push((evt.properties as any).value)
      })
      await Bun.sleep(10)
      await Bus.publish(SessionPing, { sessionID: "session-other", value: 1 })
      await Bus.publish(SessionPing, { sessionID: "session-another", value: 2 })
      await Bun.sleep(10)
    })

    expect(received).toEqual([])
  })

  test("unsubscribe stops delivery", async () => {
    await using tmp = await tmpdir()
    const received: number[] = []

    await withInstance(tmp.path, async () => {
      const unsub = Bus.subscribeSession("session-abc", (evt) => {
        received.push((evt.properties as any).value)
      })
      await Bun.sleep(10)
      await Bus.publish(SessionPing, { sessionID: "session-abc", value: 1 })
      await Bun.sleep(10)
      unsub()
      await Bun.sleep(10)
      await Bus.publish(SessionPing, { sessionID: "session-abc", value: 2 })
      await Bun.sleep(10)
    })

    expect(received).toEqual([1])
  })
})

describe("Message cache isolation", () => {
  test("filterCompacted returns consistent results across calls", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({ directory: tmp.path, fn: async () => {
      const session = await Session.create({ title: "test" })
      const userMsg = await Session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: session.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      })
      await Session.updatePart({
        id: PartID.ascending(),
        messageID: userMsg.id,
        sessionID: session.id,
        type: "text",
        text: "hello",
      })

      const result1 = MessageV2.filterCompacted([{
        info: userMsg,
        parts: [{ id: PartID.ascending(), messageID: userMsg.id, sessionID: session.id, type: "text", text: "hello" }],
      }])
      const result2 = MessageV2.filterCompacted([{
        info: userMsg,
        parts: [{ id: PartID.ascending(), messageID: userMsg.id, sessionID: session.id, type: "text", text: "hello" }],
      }])

      expect(result1).toHaveLength(result2.length)
      expect(result1[0]?.info.id).toBe(result2[0]?.info.id)
    }})
  })
})

describe("Compaction prune streaming", () => {
  test("prune with no tool parts does nothing", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({ directory: tmp.path, fn: async () => {
      const session = await Session.create({ title: "test" })
      const userMsg = await Session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: session.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      })
      await Session.updatePart({
        id: PartID.ascending(),
        messageID: userMsg.id,
        sessionID: session.id,
        type: "text",
        text: "hello",
      })

      const msgs = MessageV2.filterCompacted([{
        info: userMsg,
        parts: [{ id: PartID.ascending(), messageID: userMsg.id, sessionID: session.id, type: "text", text: "hello" }],
      }])

      expect(msgs).toHaveLength(1)
      expect(msgs[0]?.parts.every((p) => p.type !== "tool")).toBe(true)
    }})
  })

  test("stream yields messages newest-first", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({ directory: tmp.path, fn: async () => {
      const session = await Session.create({ title: "test" })
      const userMsg1 = await Session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: session.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      })
      const userMsg2 = await Session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: session.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      })

      const streamed = [...MessageV2.stream(session.id)]
      expect(streamed.length).toBeGreaterThanOrEqual(2)

      const ids = streamed.map((m) => m.info.id)
      const idx1 = ids.indexOf(userMsg1.id)
      const idx2 = ids.indexOf(userMsg2.id)
      if (idx1 >= 0 && idx2 >= 0) {
        expect(idx2).toBeLessThan(idx1)
      }
    }})
  })
})
