# Shob v2 Migration: Adopt OpenCode SDK v2, Plugin System v2, and Provider Rewrite

## Goal

Migrate Shob to use OpenCode's v2 architecture — plugin system, provider/model catalog, SDK client/server, and config schema — while preserving all 7 custom providers and the `@shob-ai/*` naming convention.

## Current State

### Custom Providers (7 total)

| Provider | File | Special Behavior |
|----------|------|-----------------|
| MiMo Free | `provider/mimo-free/` | JWT bootstrap, fingerprinting, session affinity, custom fetch |
| Antigravity | `provider/antigravity/` | Seeds models from Google provider |
| Qoder | `provider/qoder/` | 11 models, custom API endpoint |
| Cline | `provider/cline/` | Runtime model fetch from Cline API with caching |
| Command Code | `provider/commandcode/` | 11 models, custom API endpoint |
| NVIDIA NIM | `provider/nvidia-nim/` | 2 models, requires `NVIDIA_API_KEY` |
| Z.AI | `provider/zai/` | 6 models, uses Anthropic SDK |

### Current Architecture

- Providers use `with*Models()` enricher functions chained in `ModelsDev.get()`
- Custom fetch/auth logic lives in `provider.ts` `custom()` loaders
- Plugin system uses async `Plugin` functions with `Hooks` interface
- SDK uses v1 client/server with `@shob-ai/sdk` naming
- Config uses `shob.json` with `provider` (singular) structure

## Design

### 1. Package Structure

```
packages/
├── plugin/                    # @shob-ai/plugin v2
│   └── src/
│       ├── index.ts           # define(), Plugin, PluginHost types
│       └── v2/effect/
│           ├── plugin.ts      # define() function
│           ├── host.ts        # PluginHost interface
│           ├── catalog.ts     # CatalogDraft types
│           ├── aisdk.ts       # AISDKHooks types
│           └── registration.ts # Transformable, Hookable
├── sdk/                       # @shob-ai/sdk v2
│   └── js/src/
│       ├── v2/
│       │   ├── client.ts      # createOpencodeClient() v2
│       │   ├── server.ts      # createOpencodeServer() v2
│       │   ├── index.ts       # createOpencode() v2
│       │   └── gen/           # Generated types
│       ├── client.ts          # v1 (kept for backward compat)
│       └── server.ts          # v1 (kept for backward compat)
├── server/                    # @shob-ai/server
│   └── src/
│       ├── provider/
│       │   ├── provider.ts    # Adapted for v2 plugin loading
│       │   ├── models.ts      # Uses v2 plugin catalog
│       │   ├── schema.ts      # Updated branded types
│       │   └── plugins/       # NEW: v2 provider plugins
│       │       ├── index.ts
│       │       ├── mimo-free.ts
│       │       ├── antigravity.ts
│       │       ├── qoder.ts
│       │       ├── cline.ts
│       │       ├── commandcode.ts
│       │       ├── nvidia-nim.ts
│       │       └── zai.ts
│       └── config/config.ts   # Updated v2 config schema
├── ui/                        # Unchanged
└── util/                      # Unchanged
```

### 2. Plugin System v2

#### Core Types

```ts
// packages/plugin/src/v2/effect/plugin.ts
interface Plugin<R = never> {
  readonly id: string
  readonly effect: (host: PluginHost) => Effect.Effect<void, never, R | Scope.Scope>
}

function define<R>(plugin: Plugin<R>): Plugin<R>
```

#### PluginHost Interface

```ts
interface PluginHost {
  readonly catalog: Catalog       // Transform provider/model catalog
  readonly aisdk: AISDK           // Hook into AI SDK creation
  readonly integration: Integration // OAuth/auth methods
  readonly npm: Npm               // Runtime npm package install
  readonly event: Event           // Event system access
  readonly filesystem: FileSystem
  readonly location: Location
  readonly path: Path
  readonly reference: Reference
  readonly skill: Skill
  readonly agent: Agent
  readonly command: Command
}
```

#### Catalog Transform

```ts
interface CatalogDraft {
  readonly provider: {
    list(): readonly CatalogProviderRecord[]
    get(providerID: string): CatalogProviderRecord | undefined
    update(providerID: string, update: (provider: ProviderV2Info) => void): void
    remove(providerID: string): void
  }
  readonly model: {
    get(providerID: string, modelID: string): ModelV2Info | undefined
    update(providerID: string, modelID: string, update: (model: ModelV2Info) => void): void
    remove(providerID: string, modelID: string): void
    readonly default: {
      get(): { providerID: string; modelID: string } | undefined
      set(providerID: string, modelID: string): void
    }
  }
}
```

#### AISDK Hooks

```ts
interface AISDKHooks {
  readonly sdk: (event: {
    readonly model: ModelV2Info
    readonly package: string
    readonly options: Record<string, any>
    sdk?: any  // Set to provide SDK instance
  }) => Effect.Effect<void> | void

  readonly language: (event: {
    readonly model: ModelV2Info
    readonly sdk: any
    readonly options: Record<string, any>
    language?: LanguageModelV3  // Set to select model API
  }) => Effect.Effect<void> | void
}
```

### 3. Provider Plugins

#### Plugin Pattern

Each provider follows this structure:

```ts
export const ProviderPlugin = define({
  id: "shob:provider-name",
  effect: Effect.fn(function* (ctx) {
    // 1. Catalog transform: register provider + models
    yield* ctx.catalog.transform(
      Effect.fn(function* (draft) {
        draft.provider.update(providerID, (provider) => { ... })
        draft.model.update(providerID, modelID, (model) => { ... })
      }),
    )

    // 2. AISDK hook: create SDK instance (if custom routing needed)
    yield* ctx.aisdk.hook(
      "sdk",
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== providerID) return
        // Custom SDK creation
      }),
    )
  }),
})
```

#### Provider Mapping

| Provider | Plugin ID | Catalog Transform | AISDK Hook | Special |
|----------|-----------|-------------------|------------|---------|
| MiMo Free | `shob:mimo-free` | Add provider + 1 model | Custom fetch with JWT | `createMimoFreeFetch()` |
| Antigravity | `shob:antigravity` | Seed 6 models from Google | Standard openai-compatible | Model variants |
| Qoder | `shob:qoder` | Add provider + 11 models | Standard openai-compatible | Custom API endpoint |
| Cline | `shob:cline` | Runtime fetch + cache | Standard openai-compatible | 5min cache |
| Command Code | `shob:commandcode` | Add provider + 11 models | Standard openai-compatible | Custom API endpoint |
| NVIDIA NIM | `shob:nvidia-nim` | Add provider + 2 models | Standard openai-compatible | `NVIDIA_API_KEY` |
| Z.AI | `shob:zai` | Add provider + 6 models | Uses anthropic SDK | Custom API endpoint |

#### MiMo Free Plugin (Most Complex)

```ts
export const MimoFreePlugin = define({
  id: "shob:mimo-free",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (draft) {
        draft.provider.update("mimo-free", (provider) => {
          provider.name = "MiMo Code"
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.xiaomimimo.com/api/free-ai/openai/chat",
          }
          provider.request = { headers: {}, body: {} }
        })
        draft.model.update("mimo-free", "mimo-auto", (model) => {
          model.name = "MiMo-V2.5-Pro"
          model.capabilities = { tools: true, input: ["text"], output: ["text"] }
          model.enabled = true
          model.limit = { context: 131_072, output: 32_768 }
        })
      }),
    )

    yield* ctx.aisdk.hook(
      "sdk",
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== "mimo-free") return
        const { createMimoFreeFetch } = yield* Effect.promise(
          () => import("../mimo-free/fetch")
        )
        evt.options.fetch = createMimoFreeFetch()
        const mod = yield* Effect.promise(() => import("@ai-sdk/openai-compatible"))
        evt.sdk = mod.createOpenAICompatible({ ...evt.options, name: "mimo-free" })
      }),
    )
  }),
})
```

#### Cline Plugin (Dynamic Models)

```ts
export const ClinePlugin = define({
  id: "shob:cline",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (draft) {
        const models = yield* Effect.promise(() => fetchClineModels())
        draft.provider.update("cline", (provider) => {
          provider.name = "Cline"
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.cline.bot/api/v1",
          }
        })
        for (const model of models) {
          draft.model.update("cline", model.id, (m) => {
            m.name = model.name
            m.capabilities = { tools: true, input: ["text"], output: ["text"] }
            m.enabled = true
            m.limit = { context: model.context, output: model.output }
          })
        }
      }),
    )
  }),
})
```

### 4. SDK v2

#### Client

```ts
function createOpencodeClient(options: {
  baseUrl: string
  directory?: string
  experimental_workspaceID?: string
}): Client
```

- Generated from OpenAPI spec
- Workspace routing via `x-shob-workspace` header
- Incompatible server detection (text/html response check)

#### Server Launcher

```ts
function createOpencodeServer(options: {
  port?: number
  hostname?: string
  config?: Record<string, any>
  signal?: AbortSignal
}): Promise<{ url: string; close(): void }>
```

- Spawns `shob serve` subprocess
- Config passed via `OPENCODE_CONFIG_CONTENT` env var
- Waits for stdout readiness signal

### 5. Config Schema Changes

| V1 | V2 | Change |
|---|---|---|
| `provider` | `providers` | Renamed |
| `plugin` (string[]) | `plugins` (object[]) | `{ package, options? }` |
| `permission` (map) | `permissions` (array) | Ordered rules |
| `agent` | `agents` | Renamed |
| `disabled_providers` | `experimental.policies` | Policy statements |
| `mcp` | `mcp.servers` | Restructured |
| `small_model` | Removed | Agent-level override |

### 6. Migration Order

1. **Phase 1: Plugin System** — Port v2 `define()`, `PluginHost`, `CatalogDraft` into `@shob-ai/plugin`
2. **Phase 2: Provider Plugins** — Rewrite all 7 providers as v2 plugins, wire into server
3. **Phase 3: SDK v2** — Add v2 client/server to `@shob-ai/sdk`, keep v1
4. **Phase 4: Config** — Update schema to v2 structure with migration helper
5. **Phase 5: Cleanup** — Remove old enricher functions, old plugin patterns

## Verification

- All 7 custom providers load and resolve models correctly
- MiMo Free JWT auth flow works end-to-end
- Cline dynamic model fetch populates catalog
- SDK v2 client connects to server
- SDK v2 server launcher spawns correctly
- Config migration from v1 to v2 preserves all settings
- Existing tests pass after migration
