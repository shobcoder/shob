import { afterEach, expect, test } from "bun:test"
import { Effect } from "effect"
import fs from "fs/promises"
import path from "path"
import { Command } from "../../src/command"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

test("lists globally installed ~/.shob skills as slash commands", async () => {
  await using tmp = await tmpdir({ git: true })

  const originalHome = process.env.SHOB_TEST_HOME
  process.env.SHOB_TEST_HOME = tmp.path

  try {
    const skillDir = path.join(tmp.path, ".shob", "skills", "slash-shob-skill")
    await fs.mkdir(skillDir, { recursive: true })
    await Bun.write(
      path.join(skillDir, "SKILL.md"),
      `---
name: slash-shob-skill
description: A slash-visible Shob skill.
---

# Slash Shob Skill
`,
    )

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const commands = await Effect.runPromise(
          Command.Service.use((service) => service.list()).pipe(Effect.provide(Command.defaultLayer)),
        )
        const command = commands.find((item) => item.name === "slash-shob-skill")
        expect(command).toBeDefined()
        expect(command!.source).toBe("skill")
        expect(command!.description).toBe("A slash-visible Shob skill.")
      },
    })
  } finally {
    process.env.SHOB_TEST_HOME = originalHome
  }
})
