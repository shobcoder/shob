export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"

/**
 * Built-in skills ship in the repo/packaged `skills/` folder and are
 * **installed** by the desktop skill store into `~/.shob/skills`.
 * Discovery loads them from there (and other user/project skill paths).
 *
 * This plugin intentionally does not embed skills into the process.
 */
export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (_ctx) {
    // no-op: skills are file-based + desktop install store
  }),
})
