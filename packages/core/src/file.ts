export * as File from "./file"

import { Revert } from "@shob/schema/revert"

export const Diff = Revert.FileDiff
export type Diff = typeof Diff.Type
