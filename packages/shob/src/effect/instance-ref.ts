import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@shob/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~shob/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~shob/WorkspaceRef", {
  defaultValue: () => undefined,
})
