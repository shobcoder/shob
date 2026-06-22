# Shob v2 Migration: Detailed Implementation Plan

## Overview

This plan covers migrating Shob from the current enricher-function pattern to OpenCode's v2 plugin system, porting all 7 custom providers as v2 plugins, adding SDK v2 client/server, updating the config schema, and cleaning up legacy code.

---

## Phase 1: Plugin System v2

**Goal:** Create the `@shob-ai/plugin/v2/effect` entrypoint with `define()`, `PluginHost`, `CatalogDraft`, `AISDKHooks`, and `Transformable`/`Hookable`.

### Step 1.1: Create v2 directory structure

**Source reference:** `C:\Users\sera\Downloads\opencode\packages\plugin\src\v2\effect/`

**Destination:** `C:\Users\sera\Desktop\shob\packages\plugin\src\v2\effect/`

| File | What to create | Source to reference |
|------|---------------|-------------------|
| `registration.ts` | `Transform<Draft>`, `Registration`, `Transformable<Draft>`, `Hookable<Hooks>` | OpenCode `registration.ts:1-16` |
| `plugin.ts` | `Plugin<R>` interface, `define<R>()` function | OpenCode `plugin.ts:1-11` |
| `host.ts` | `PluginHost` interface (Shob-specific subset) | OpenCode `host.ts:1-27` |
| `catalog.ts` | `CatalogProviderRecord`, `CatalogDraft`, `Catalog` interfaces | OpenCode `catalog.ts:1-41` |
| `aisdk.ts` | `AISDKHooks`, `AISDK` interfaces | OpenCode `aisdk.ts:1-21` |
| `index.ts` | Re-export all | OpenCode `index.ts:1-17` |

### Step 1.2: Create `plugin.ts`

**Exact code pattern (from OpenCode `plugin.ts`):**
```ts
import type { Effect, Scope } from "effect"
import type { PluginHost } from "./host.js"

export interface Plugin<R = never> {
  readonly id: string
  readonly effect: (host: PluginHost) => Effect.Effect<void, never, R | Scope.Scope>
}

export function define<R>(plugin: Plugin<R>) {
  return plugin
}
```

**Shob adaptation:** Use the same exact code. No changes needed — it's a pure type + identity function.

### Step 1.3: Create `registration.ts`

**Exact code (from OpenCode `registration.ts`):**
```ts
import type { Effect, Scope } from "effect"

export type Transform<Draft> = (draft: Draft) => Effect.Effect<void> | void

export interface Registration {
  readonly dispose: Effect.Effect<void>
}

export interface Transformable<Draft> {
  transform(callback: Transform<Draft>): Effect.Effect<Registration, never, Scope.Scope>
  rebuild(): Effect.Effect<void>
}

export interface Hookable<Hooks> {
  hook<Name extends keyof Hooks>(name: Name, callback: Hooks[Name]): Effect.Effect<Registration, never, Scope.Scope>
}
```

### Step 1.4: Create `catalog.ts`

**Exact code (from OpenCode `catalog.ts`):**
```ts
import type { ModelV2Info, ProviderV2Info } from "@shob-ai/sdk/v2/types"
import type { Effect } from "effect"
import type { Transformable } from "./registration.js"

export interface CatalogProviderRecord {
  readonly provider: ProviderV2Info
  readonly models: ReadonlyMap<string, ModelV2Info>
}

export interface CatalogDraft {
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

export interface Catalog extends Transformable<CatalogDraft> {
  readonly provider: {
    get(id: string): Effect.Effect<ProviderV2Info | undefined>
    list(): Effect.Effect<ProviderV2Info[]>
    available(): Effect.Effect<ProviderV2Info[]>
  }
  readonly model: {
    get(providerID: string, modelID: string): Effect.Effect<ModelV2Info | undefined>
    list(): Effect.Effect<ModelV2Info[]>
    available(): Effect.Effect<ModelV2Info[]>
    default(): Effect.Effect<ModelV2Info | undefined>
    small(providerID: string): Effect.Effect<ModelV2Info | undefined>
  }
}
```

**Dependency:** `ModelV2Info` and `ProviderV2Info` must exist in `@shob-ai/sdk/v2/types`. See Step 4.1.

### Step 1.5: Create `aisdk.ts`

**Exact code (from OpenCode `aisdk.ts`):**
```ts
import type { LanguageModelV3 } from "@ai-sdk/provider"
import type { ModelV2Info } from "@shob-ai/sdk/v2/types"
import type { Effect } from "effect"
import type { Hookable } from "./registration.js"

export interface AISDKHooks {
  readonly sdk: (event: {
    readonly model: ModelV2Info
    readonly package: string
    readonly options: Record<string, any>
    sdk?: any
  }) => Effect.Effect<void> | void
  readonly language: (event: {
    readonly model: ModelV2Info
    readonly sdk: any
    readonly options: Record<string, any>
    language?: LanguageModelV3
  }) => Effect.Effect<void> | void
}

export interface AISDK extends Hookable<AISDKHooks> {}
```

### Step 1.6: Create `host.ts`

**Shob-specific `PluginHost`** (simplified from OpenCode — only the capabilities Shob needs):

```ts
import type { AISDK } from "./aisdk.js"
import type { Catalog } from "./catalog.js"

export interface PluginHost {
  readonly catalog: Catalog
  readonly aisdk: AISDK
}
```

**Decision:** Start minimal with just `catalog` and `aisdk`. Other host capabilities (agent, command, skill, etc.) can be added later when Shob needs them.

### Step 1.7: Create `index.ts`

**Exact code (from OpenCode `index.ts`, Shob subset):**
```ts
export type { PluginHost } from "./host.js"
export { define } from "./plugin.js"
export type { Plugin } from "./plugin.js"
export type { Registration } from "./registration.js"
export type { AISDK, AISDKHooks } from "./aisdk.js"
export type { Catalog, CatalogDraft, CatalogProviderRecord } from "./catalog.js"
export type { Hookable, Transform, Transformable } from "./registration.js"
```

### Step 1.8: Update `packages/plugin/package.json`

**Add v2/effect export:**

```jsonc
{
  "exports": {
    ".": "./src/index.ts",
    "./tool": "./src/tool.ts",
    "./tui": "./src/tui.ts",
    "./v2/effect": "./src/v2/effect/index.ts"  // NEW
  }
}
```

**Add dependency:** `@ai-sdk/provider` (for `LanguageModelV3` type).

```jsonc
{
  "dependencies": {
    "@ai-sdk/provider": "3.0.8",  // NEW
    "@shob-ai/sdk": "file:../sdk/js",
    "effect": "4.0.0-beta.65",
    "zod": "4.4.3"
  }
}
```

### Step 1.9: Verification

- Run `npx tsc --noEmit` in `packages/plugin/` to verify types compile
- Confirm `@shob-ai/plugin/v2/effect` is importable
- Confirm `define()` returns its argument (identity function)
- Confirm `Transformable`, `Hookable`, `CatalogDraft` types are correct

**Risk:** `ModelV2Info`/`ProviderV2Info` may not exist in Shob SDK yet → must create stub types in Phase 4/SDK v2 step first.

**Mitigation:** Create the SDK v2 types stubs (Step 4.1) before or simultaneously with this phase.

---

## Phase 2: Provider Plugins

**Goal:** Rewrite all 7 custom providers as v2 `define()` plugins, register them in the server plugin loader.

### General Pattern (from OpenCode examples)

Each plugin follows:
```ts
import { Effect } from "effect"
import { define } from "@shob-ai/plugin/v2/effect"

export const XPlugin = define({
  id: "shob:provider-name",
  effect: Effect.fn(function* (ctx) {
    // 1. Catalog transform: register provider + models
    yield* ctx.catalog.transform(
      Effect.fn(function* (draft) {
        // Register/update provider
        draft.provider.update("providerID", (provider) => { ... })
        // Register/update models
        draft.model.update("providerID", "modelID", (model) => { ... })
      }),
    )

    // 2. AISDK hook: custom SDK creation (if needed)
    yield* ctx.aisdk.hook(
      "sdk",
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== "providerID") return
        // Custom SDK instance
      }),
    )
  }),
})
```

### Step 2.1: Create plugin directory

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins/`

### Step 2.2: MiMo Free Plugin (most complex)

**Source:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\mimo-free/models.ts` + `fetch.ts`

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins\mimo-free.ts`

**Transformation:**
- The current `withMimoFreeModels()` enricher seeds a provider from `xiaomi`/`openai` models. In v2, this becomes a `draft.provider.update()` that creates the provider entry.
- The custom `createMimoFreeFetch()` logic stays in `mimo-free/fetch.ts` (unchanged).
- The AISDK hook creates a `createOpenAICompatible` SDK with the custom fetch.

**Key code:**
```ts
import { Effect } from "effect"
import { define } from "@shob-ai/plugin/v2/effect"

export const MimoFreePlugin = define({
  id: "shob:mimo-free",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (draft) {
        draft.provider.update("mimo-free", (provider) => {
          provider.name = "MiMo Code"
          provider.env = []
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.xiaomimimo.com/api/free-ai/openai/chat",
          }
          provider.request = { headers: {}, body: {} }
        })
        draft.model.update("mimo-free", "mimo-auto", (model) => {
          model.name = "MiMo-V2.5-Pro"
          model.family = "mimo"
          model.capabilities = {
            temperature: true, reasoning: true, attachment: false, toolcall: true,
            input: { text: true, audio: false, image: false, video: false, pdf: false },
            output: { text: true, audio: false, image: false, video: false, pdf: false },
            interleaved: false,
          }
          model.enabled = true
          model.limit = { context: 131_072, output: 32_768 }
          model.cost = { input: 0, output: 0, cache: { read: 0, write: 0 } }
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

**Dependencies:** Existing `mimo-free/fetch.ts` (unchanged).

### Step 2.3: Antigravity Plugin

**Source:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\antigravity\models.ts`

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins\antigravity.ts`

**Transformation:** Currently seeds 6 models from Google. In v2, this uses `draft.model.update()` to create model variants.

```ts
export const AntigravityPlugin = define({
  id: "shob:antigravity",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (draft) {
        draft.provider.update("antigravity", (provider) => {
          provider.name = "Antigravity"
          provider.env = []
          // API details from Google provider
        })
        // Seed 6 models from Google's catalog
        const models = [
          { id: "gemini-3.1-pro-high", name: "Gemini 3 Pro High", seedFrom: "gemini-3.1-pro-preview" },
          { id: "gemini-3.1-pro-low", name: "Gemini 3 Pro Low", seedFrom: "gemini-3.1-pro-preview" },
          { id: "gemini-3-flash", name: "Gemini 3 Flash", seedFrom: "gemini-3-flash-preview" },
          { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", seedFrom: "gemini-3.1-pro-preview" },
          { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 Thinking", seedFrom: "gemini-3.1-pro-preview" },
          { id: "gpt-oss-120b-medium", name: "GPT OSS 120B Medium", seedFrom: "gemini-3.1-pro-preview" },
        ]
        for (const m of models) {
          const source = draft.model.get("google", m.seedFrom)
          if (!source) continue
          draft.model.update("antigravity", m.id, (model) => {
            Object.assign(model, { ...source, id: m.id, name: m.name })
          })
        }
      }),
    )
  }),
})
```

### Step 2.4: Qoder Plugin

**Source:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\qoder\models.ts`

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins\qoder.ts`

**Transformation:** 11 models with custom API endpoint `https://api3.qoder.sh/algo`.

### Step 2.5: Cline Plugin (dynamic models)

**Source:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\cline\models.ts` + `provider.ts` `clineFetch`

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins\cline.ts`

**Key difference:** Models are fetched at runtime from `https://api.cline.bot/api/v1/ai/cline/models` with 5-minute cache.

```ts
export const ClinePlugin = define({
  id: "shob:cline",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform(
      Effect.fn(function* (draft) {
        const { fetchClineModels } = yield* Effect.promise(
          () => import("../cline/models")
        )
        const rawModels = yield* Effect.tryPromise({
          try: () => fetchClineModels(),
          catch: () => [],
        })
        draft.provider.update("cline", (provider) => {
          provider.name = "Cline"
          provider.env = ["CLINE_API_KEY"]
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://api.cline.bot/api/v1",
          }
        })
        for (const raw of rawModels) {
          // Convert raw model to draft format
          draft.model.update("cline", raw.id, (model) => {
            model.name = raw.name || raw.id
            model.enabled = true
            // ... capabilities from raw
          })
        }
      }),
    )
  }),
})
```

**Dependencies:** Existing `cline/models.ts` `fetchClineModels()` function.

### Step 2.6: Command Code Plugin

**Source:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\commandcode\models.ts`

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins\commandcode.ts`

Same pattern as Qoder — 11 models, custom endpoint `https://api.commandcode.ai/alpha/generate`.

### Step 2.7: NVIDIA NIM Plugin

**Source:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\nvidia-nim\models.ts`

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins\nvidia-nim.ts`

2 models, requires `NVIDIA_API_KEY` env var.

### Step 2.8: Z.AI Plugin

**Source:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\zai\models.ts`

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins\zai.ts`

6 models, uses `@ai-sdk/anthropic` SDK with custom endpoint.

**Key difference:** Requires AISDK hook to use `createAnthropic` instead of `createOpenAICompatible`:

```ts
yield* ctx.aisdk.hook(
  "sdk",
  Effect.fn(function* (evt) {
    if (evt.model.providerID !== "zai-coding-plan") return
    const mod = yield* Effect.promise(() => import("@ai-sdk/anthropic"))
    evt.sdk = mod.createAnthropic(evt.options)
  }),
)
```

### Step 2.9: Create plugin index

**Destination:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\plugins\index.ts`

```ts
import { MimoFreePlugin } from "./mimo-free.js"
import { AntigravityPlugin } from "./antigravity.js"
import { QoderPlugin } from "./qoder.js"
import { ClinePlugin } from "./cline.js"
import { CommandCodePlugin } from "./commandcode.js"
import { NvidiaNimPlugin } from "./nvidia-nim.js"
import { ZaiPlugin } from "./zai.js"
import type { Plugin } from "@shob-ai/plugin/v2/effect"

export const PROVIDER_PLUGINS: Plugin[] = [
  MimoFreePlugin,
  AntigravityPlugin,
  QoderPlugin,
  ClinePlugin,
  CommandCodePlugin,
  NvidiaNimPlugin,
  ZaiPlugin,
]
```

### Step 2.10: Wire plugins into server plugin loader

**File to modify:** `C:\Users\sera\Desktop\shob\packages\server\src\plugin\index.ts`

**Change:** In the `INTERNAL_PLUGINS` array (line 58), add the v2 provider plugins. The `applyPlugin` function (line 108) needs to detect v2 plugins (they have an `effect` property, not a `server` function) and run them through a v2 host runtime.

**New code in `applyPlugin`:**
```ts
function isV2Plugin(value: unknown): value is V2Plugin {
  return typeof value === "object" && value !== null && "effect" in value && "id" in value
}

// In applyPlugin:
if (isV2Plugin(load)) {
  // Run v2 plugin through host runtime
  yield* runV2Plugin(load, host)
  return
}
```

### Step 2.11: Modify `models.ts` to use v2 plugins

**File to modify:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\models.ts`

**Change:** Replace the `ModelsDev.get()` enricher chain (lines 160-166):
```ts
// BEFORE:
export async function get() {
  const result = await Data()
  const enriched = await withClineModels(
    withCommandCodeModels(withQoderModels(withAntigravityModels(result as Record<string, Provider>))),
  )
  return withNvidiaNimModels(withZaiCodingPlanModels(withMimoFreeModels(enriched)))
}

// AFTER:
export async function get() {
  const result = await Data()
  // v2 plugins transform the catalog via draft.provider.update() / draft.model.update()
  // No more enricher chain needed — plugins handle it during init
  return result as Record<string, Provider>
}
```

**Risk:** The v2 plugin catalog transform runs asynchronously and may not complete before `get()` is called. The plugin host must ensure transforms complete before the catalog is read.

**Mitigation:** The `Catalog.rebuild()` method ensures all transforms are applied. The provider service should call `rebuild()` before reading the catalog.

### Step 2.12: Verification

- All 7 providers appear in the model list
- MiMo Free JWT auth works end-to-end
- Cline dynamic model fetch populates catalog
- Z.AI uses Anthropic SDK (not openai-compatible)
- NVIDIA NIM requires `NVIDIA_API_KEY`
- Qoder/Command Code models load with correct endpoints
- Antigravity models seed from Google catalog

---

## Phase 3: SDK v2

**Goal:** Add v2 client/server to `@shob-ai/sdk`, keep v1.

### Step 3.1: Ensure v2 types exist

**File:** `C:\Users\sera\Desktop\shob\packages\sdk\js\src\v2/`

Check if `gen/types.gen.ts` already exists with `ProviderV2Info`, `ModelV2Info`. If not, generate from OpenAPI spec.

### Step 3.2: Verify SDK exports

**File to modify:** `C:\Users\sera\Desktop\shob\packages\sdk\js\package.json`

Add missing export if needed:
```jsonc
{
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./server": "./src/server.ts",
    "./v2": "./src/v2/index.ts",
    "./v2/client": "./src/v2/client.ts",
    "./v2/gen/client": "./src/v2/gen/client/index.ts",
    "./v2/server": "./src/v2/server.ts",
    "./v2/types": "./src/v2/gen/types.gen.ts"  // ADD if missing
  }
}
```

### Step 3.3: Verify v2 client

**File:** `C:\Users\sera\Desktop\shob\packages\sdk\js\src\v2\client.ts`

Already exists (ported from OpenCode). Verify:
- `createOpencodeClient()` works with `baseUrl` option
- Request rewriting for `x-opencode-directory` and `x-opencode-workspace` works
- HTML response detection works

### Step 3.4: Verify v2 server

**File:** `C:\Users\sera\Desktop\shob\packages\sdk\js\src\v2\server.ts`

Already exists. Verify:
- `createOpencodeServer()` spawns `shob serve` subprocess
- `OPENCODE_CONFIG_CONTENT` env var is set
- Timeout handling works

### Step 3.5: Verification

- `import { createOpencodeClient } from "@shob-ai/sdk/v2/client"` works
- `import { createOpencodeServer } from "@shob-ai/sdk/v2/server"` works
- Types are importable from `@shob-ai/sdk/v2/types`

---

## Phase 4: Config Schema Migration

**Goal:** Update `shob.json` schema to v2 structure with migration helper.

### Step 4.1: Add migration helper

**File to modify:** `C:\Users\sera\Desktop\shob\packages\server\src\config\config.ts`

Add a `migrateV1toV2()` function that transforms:

| V1 | V2 |
|---|---|
| `provider` (singular) | `providers` (plural) |
| `plugin` (string[]) | `plugins` (object[]) |
| `permission` (map) | `permissions` (array) |
| `agent` | `agents` |
| `disabled_providers` | `experimental.policies` |
| `mcp` | `mcp.servers` |
| `small_model` | Removed |

**Pattern:** The migration runs once when loading a v1 config, writes back as v2.

```ts
export function migrateV1toV2(config: any): any {
  const result = { ...config }
  if (result.provider && !result.providers) {
    result.providers = result.provider
    delete result.provider
  }
  if (result.plugin && !result.plugins) {
    result.plugins = result.plugin.map((p: string) =>
      typeof p === "string" ? { package: p } : p
    )
    delete result.plugin
  }
  // ... other migrations
  return result
}
```

### Step 4.2: Update Info schema

**File:** `C:\Users\sera\Desktop\shob\packages\server\src\config\config.ts`

Update the `Info` zod schema to support both v1 and v2 shapes during transition:

```ts
export const Info = z.object({
  // ... existing fields ...
  providers: z.record(z.string(), Provider).optional(), // NEW: v2
  provider: z.record(z.string(), Provider).optional(),  // KEPT: v1 compat
  plugins: z.array(z.union([z.string(), z.object({ package: z.string(), options: z.record(z.string(), z.any()).optional() })])).optional(), // NEW: v2
  plugin: PluginSpec.array().optional(), // KEPT: v1 compat
  // ...
}).transform((data) => {
  // Auto-migrate v1 to v2
  if (data.provider && !data.providers) data.providers = data.provider
  if (data.plugin && !data.plugins) {
    data.plugins = data.plugin.map(p => typeof p === "string" ? { package: p } : { package: p[0], options: p[1] })
  }
  return data
})
```

### Step 4.3: Update provider loading to use `providers` key

**File:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\provider.ts`

Change line ~1196:
```ts
// BEFORE:
const configProviders = Object.entries(cfg.provider ?? {})

// AFTER:
const configProviders = Object.entries(cfg.providers ?? cfg.provider ?? {})
```

### Step 4.4: Verification

- Existing `shob.json` with `provider` key still works (auto-migrated)
- New `shob.json` with `providers` key works
- `plugin` array (v1) auto-migrates to `plugins` objects (v2)
- Config migration is idempotent (running twice doesn't double-migrate)

---

## Phase 5: Cleanup

**Goal:** Remove old enricher functions, old plugin patterns, consolidate.

### Step 5.1: Remove enricher functions

**Files to delete or gut:**
- `C:\Users\sera\Desktop\shob\packages\server\src\provider\mimo-free\models.ts` → keep only if used by plugin; otherwise delete
- `C:\Users\sera\Desktop\shob\packages\server\src\provider\antigravity\models.ts` → delete
- `C:\Users\sera\Desktop\shob\packages\server\src\provider\cline\models.ts` → keep `fetchClineModels()` used by plugin; remove `withClineModels()`
- `C:\Users\sera\Desktop\shob\packages\server\src\provider\qoder\models.ts` → delete
- `C:\Users\sera\Desktop\shob\packages\server\src\provider\commandcode\models.ts` → delete
- `C:\Users\sera\Desktop\shob\packages\server\src\provider\nvidia-nim\models.ts` → delete
- `C:\Users\sera\Desktop\shob\packages\server\src\provider\zai\models.ts` → delete

### Step 5.2: Remove enricher imports from `models.ts`

**File:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\models.ts`

Remove lines 11-17:
```ts
import { withAntigravityModels } from "./antigravity/models"
import { withQoderModels } from "./qoder/models"
import { withCommandCodeModels } from "./commandcode/models"
import { withClineModels } from "./cline/models"
import { withMimoFreeModels } from "./mimo-free/models"
import { withNvidiaNimModels } from "./nvidia-nim/models"
import { withZaiCodingPlanModels } from "./zai/models"
```

### Step 5.3: Remove custom loaders from `provider.ts`

**File:** `C:\Users\sera\Desktop\shob\packages\server\src\provider\provider.ts`

Remove from `custom()` function (lines 218-916):
- `mimo-free` entry (line 901)
- `cline` entry (line 882)
- `qoder` entry (line 910)
- `anthropic` entry (line 220) — now handled by plugin
- `opencode` entry (line 229) — now handled by plugin
- `openai` entry (line 252) — now handled by plugin

**Keep:** All other custom loaders that don't have plugins yet.

### Step 5.4: Remove built-in plugin auth hooks that are now provider plugins

**File:** `C:\Users\sera\Desktop\shob\packages\server\src\plugin\index.ts`

Remove from `INTERNAL_PLUGINS`:
- `AntigravityAuthPlugin`
- `QoderAuthPlugin`
- `CommandCodeAuthPlugin`
- `ClineAuthPlugin`

These are auth hooks, not provider plugins. They should be kept if they handle OAuth. Review each:
- If the auth plugin only provides API key loading → can be removed (provider plugin handles it)
- If the auth plugin provides OAuth flow → keep

### Step 5.5: Verify no regressions

- All existing tests pass
- Type checking passes
- No unused imports
- Bundle size is reasonable

---

## Dependency Graph

```
Phase 1 (Plugin System v2)
  └─ Step 1.4 (catalog.ts) depends on Step 4.1 (SDK v2 types)
  └─ Step 1.5 (aisdk.ts) depends on Step 4.1 (SDK v2 types)

Phase 2 (Provider Plugins)
  └─ Depends on Phase 1 complete
  └─ Step 2.10 (wire plugins) depends on Step 2.9 (plugin index)
  └─ Step 2.11 (modify models.ts) depends on Step 2.10

Phase 3 (SDK v2)
  └─ Independent of Phase 1/2 (types only needed)

Phase 4 (Config Migration)
  └─ Independent of Phase 1/2

Phase 5 (Cleanup)
  └─ Depends on Phase 2 complete
  └─ Last phase
```

**Recommended order:**
1. Phase 3 (SDK v2 types) — quick, independent
2. Phase 1 (Plugin System v2) — depends on Phase 3 types
3. Phase 4 (Config Migration) — independent, can run in parallel with Phase 2
4. Phase 2 (Provider Plugins) — largest phase, depends on Phase 1
5. Phase 5 (Cleanup) — last

---

## Risk Areas

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `ModelV2Info`/`ProviderV2Info` types don't match Shob's internal types | Catalog transform won't compile | Create adapter layer between OpenCode v2 types and Shob's `Provider.Model` |
| Plugin host runtime not implemented | Plugins won't execute | Implement minimal host in `plugin/index.ts` with `catalog.transform()` and `aisdk.hook()` |
| V2 plugins run after catalog is read | Custom providers missing from list | Ensure `Catalog.rebuild()` completes before provider list is served |
| Cline dynamic fetch fails | No Cline models | Keep fallback to read from cache file |
| MiMo Free JWT flow breaks | Free models unavailable | Test end-to-end with mock JWT endpoint |
| Config migration breaks existing configs | Users lose settings | Make migration idempotent, test with real config files |
| v1 plugin compatibility broken | External plugins stop working | Keep v1 plugin loading alongside v2 |

---

## Files Summary

### Files to Create (Phase 1)
- `packages/plugin/src/v2/effect/registration.ts`
- `packages/plugin/src/v2/effect/plugin.ts`
- `packages/plugin/src/v2/effect/host.ts`
- `packages/plugin/src/v2/effect/catalog.ts`
- `packages/plugin/src/v2/effect/aisdk.ts`
- `packages/plugin/src/v2/effect/index.ts`

### Files to Create (Phase 2)
- `packages/server/src/provider/plugins/index.ts`
- `packages/server/src/provider/plugins/mimo-free.ts`
- `packages/server/src/provider/plugins/antigravity.ts`
- `packages/server/src/provider/plugins/qoder.ts`
- `packages/server/src/provider/plugins/cline.ts`
- `packages/server/src/provider/plugins/commandcode.ts`
- `packages/server/src/provider/plugins/nvidia-nim.ts`
- `packages/server/src/provider/plugins/zai.ts`

### Files to Modify
- `packages/plugin/package.json` — add v2/effect export + @ai-sdk/provider dep
- `packages/server/src/plugin/index.ts` — add v2 plugin detection + host runtime
- `packages/server/src/provider/models.ts` — remove enricher chain
- `packages/server/src/provider/provider.ts` — remove migrated custom loaders
- `packages/server/src/config/config.ts` — add v2 config schema + migration
- `packages/sdk/js/package.json` — add v2/types export if missing

### Files to Delete (Phase 5)
- `packages/server/src/provider/antigravity/models.ts`
- `packages/server/src/provider/qoder/models.ts`
- `packages/server/src/provider/commandcode/models.ts`
- `packages/server/src/provider/nvidia-nim/models.ts`
- `packages/server/src/provider/zai/models.ts`

### Files to Keep (partial cleanup)
- `packages/server/src/provider/mimo-free/fetch.ts` — still used by plugin
- `packages/server/src/provider/mimo-free/models.ts` — delete after plugin is verified
- `packages/server/src/provider/cline/models.ts` — keep `fetchClineModels()`, remove `withClineModels()`
