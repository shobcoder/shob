import { describe, expect, test } from "bun:test"
import type { SyncStorage } from "@solid-primitives/storage"
import { base64Encode } from "@shob-ai/util/encode"
import type { Platform } from "../src/context/platform.tsx"
import { Persist } from "../src/utils/persist.ts"
import {
  listSessionPersistTargets,
  parseSessionStateKey,
  removePersistedSessionState,
} from "../src/utils/session-persisted-state.ts"

describe("session persisted state helpers", () => {
  test("lists all current and legacy persisted targets for a session", () => {
    expect(listSessionPersistTargets("/workspace/demo", "ses_123")).toEqual([
      Persist.session("/workspace/demo", "ses_123", "prompt"),
      { key: "/workspace/demo/prompt/ses_123.v2" },
      Persist.session("/workspace/demo", "ses_123", "terminal"),
      { key: "/workspace/demo/terminal/ses_123.v1" },
      Persist.session("/workspace/demo", "ses_123", "file-view"),
      { key: "/workspace/demo/file/ses_123.v1" },
      Persist.session("/workspace/demo", "ses_123", "comments"),
      { key: "/workspace/demo/comments/ses_123.v1" },
    ])
  })

  test("parses encoded layout session keys", () => {
    expect(parseSessionStateKey(`${base64Encode("/workspace/demo")}/ses_123`)).toEqual({
      directory: "/workspace/demo",
      sessionId: "ses_123",
    })
    expect(parseSessionStateKey("/workspace/demo")).toBeUndefined()
  })

  test("removes all persisted session targets from platform storage", () => {
    const removed: string[] = []
    const storage = () =>
      ({
        getItem() {
          return null
        },
        setItem() {},
        removeItem(key: string) {
          removed.push(key)
        },
      }) satisfies SyncStorage
    const platform: Platform = {
      platform: "desktop",
      openLink() {},
      restart: async () => {},
      back() {},
      forward() {},
      notify: async () => {},
      storage,
    }

    removePersistedSessionState({
      directory: "/workspace/demo",
      sessionId: "ses_123",
      platform,
    })

    expect(removed).toEqual([
      "session:ses_123:prompt",
      "/workspace/demo/prompt/ses_123.v2",
      "session:ses_123:terminal",
      "/workspace/demo/terminal/ses_123.v1",
      "session:ses_123:file-view",
      "/workspace/demo/file/ses_123.v1",
      "session:ses_123:comments",
      "/workspace/demo/comments/ses_123.v1",
    ])
  })
})
