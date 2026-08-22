import { run as runTui, type TuiInput } from "@shob/tui"
import { Global } from "@shob/core/global"
import { AppNodeBuilder } from "@shob/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
