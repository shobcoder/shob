import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@shob/core/effect/app-node-builder"
import { Location } from "@shob/core/location"
import { Project } from "@shob/core/project"
import { AbsolutePath } from "@shob/core/schema"
import { WorkspaceV2 } from "@shob/core/workspace"
import { testEffect } from "./lib/effect"

const workspaceID = WorkspaceV2.ID.make("wrk_test")
const ref = { directory: AbsolutePath.make("/repo/packages/app"), workspaceID }
const projectLayer = Layer.succeed(
  Project.Service,
  Project.Service.of({
    directories: () => Effect.succeed([]),
    resolve: () =>
      Effect.succeed({
        id: Project.ID.make("project"),
        directory: AbsolutePath.make("/repo"),
        vcs: { type: "git", store: AbsolutePath.make("/repo/.git") },
      }),
    commit: () => Effect.void,
  }),
)
const it = testEffect(AppNodeBuilder.build(Location.boundNode(ref), [[Project.node, projectLayer]]))

describe("Location", () => {
  it.effect("resolves the current project and vcs information", () =>
    Effect.gen(function* () {
      const location = yield* Location.Service

      expect(location.directory).toBe(AbsolutePath.make("/repo/packages/app"))
      expect(location.workspaceID).toBe(workspaceID)
      expect(location.project.id).toBe(Project.ID.make("project"))
      expect(location.project.directory).toBe(AbsolutePath.make("/repo"))
      expect(location.vcs).toEqual({
        type: "git",
        store: AbsolutePath.make("/repo/.git"),
      })
    }),
  )
})
