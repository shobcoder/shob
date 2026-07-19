import { AgentV2 } from "@shob/core/agent"
import { AISDK } from "@shob/core/aisdk"
import { Catalog } from "@shob/core/catalog"
import { CommandV2 } from "@shob/core/command"
import { Credential } from "@shob/core/credential"
import { AppNodeBuilder } from "@shob/core/effect/app-node-builder"
import { LayerNodePlatform } from "@shob/core/effect/app-node-platform"
import { LayerNode } from "@shob/core/effect/layer-node"
import { EventV2 } from "@shob/core/event"
import { FileSystem } from "@shob/core/filesystem"
import { FSUtil } from "@shob/core/fs-util"
import { Integration } from "@shob/core/integration"
import { Location } from "@shob/core/location"
import { Npm } from "@shob/core/npm"
import { PluginV2 } from "@shob/core/plugin"
import { Reference } from "@shob/core/reference"
import { SkillV2 } from "@shob/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
