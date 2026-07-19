import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@shob/core/effect/app-node-builder"
import { SkillPlugin } from "@shob/core/plugin/skill"
import { SkillV2 } from "@shob/core/skill"
import { testEffect } from "../lib/effect"
import { host } from "./host"

const it = testEffect(AppNodeBuilder.build(SkillV2.node))

describe("SkillPlugin.Plugin", () => {
  it.effect("loads without embedding skills (desktop install store owns built-ins)", () =>
    Effect.gen(function* () {
      const skill = yield* SkillV2.Service
      yield* SkillPlugin.Plugin.effect(host({ skill: { ...skill, reload: skill.reload } }))
      expect(yield* skill.list()).toEqual([])
    }),
  )
})
