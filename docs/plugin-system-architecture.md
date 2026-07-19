# Plugin System

This document explains how plugins work in Shob end-to-end: authoring APIs,
runtime hosts, discovery, boot order, domain transforms, lifecycle hooks, and
how V1 and V2 coexist.

It is written for people who need to **author**, **debug**, or **extend** the
plugin system — not only call `define()`.

---

## Table of contents

1. [Overview](#1-overview)
2. [Package map](#2-package-map)
3. [Mental model](#3-mental-model)
4. [V2 plugin system](#4-v2-plugin-system)
5. [V1 plugin system](#5-v1-plugin-system)
6. [Discovery and configuration](#6-discovery-and-configuration)
7. [Boot sequence](#7-boot-sequence)
8. [Domain transforms in depth](#8-domain-transforms-in-depth)
9. [Runtime hooks in depth](#9-runtime-hooks-in-depth)
10. [Scopes, dispose, and reloading](#10-scopes-dispose-and-reloading)
11. [Provider and auth plugins](#11-provider-and-auth-plugins)
12. [How a session turn uses plugins](#12-how-a-session-turn-uses-plugins)
13. [Authoring guide](#13-authoring-guide)
14. [Debugging and failure modes](#14-debugging-and-failure-modes)
15. [File index](#15-file-index)
16. [Related docs](#16-related-docs)

---

## 1. Overview

Shob is a coding agent. The **server** (embedded in the desktop app) owns
sessions, models, tools, and configuration. **Plugins** extend that server
in-process: they do not run as separate processes and they do not talk to the
renderer directly.

Plugins can:

- Register or reshape **agents**, **commands**, **skills**, and **references**
- Contribute to the **provider/model catalog**
- Wire **AI SDK** provider packages to concrete language models
- Register **OAuth / API-key auth** methods (integrations)
- Install **session lifecycle hooks** (V1): tools, permissions, chat params, events
- Register **workspace adapters** (V1 experimental)

There are **two generations** of plugin API:

| Generation | Package entry | Shape | Host |
| --- | --- | --- | --- |
| **V2** | `@shob/plugin/v2/effect`, `@shob/plugin/v2/promise` | `define({ id, effect \| setup })` | `@shob/core` `PluginV2` + `PluginHost` |
| **V1** | `@shob/plugin` | `(input, options?) => Promise<Hooks>` | `packages/shob` `Plugin.Service` |

**New domain work (catalog, agents, AI SDK, skills) targets V2.**  
**Many built-in auth integrations and external community plugins still use V1.**

The desktop renderer (`@shob/app`) never loads plugins. Only the embedded shob
server does.

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron desktop                                            │
│  main ──▶ embedded shob server (packages/shob + core)       │
│              ├── PluginV2 (V2 host)                         │
│              ├── PluginInternal (built-in V2 plugins)       │
│              ├── ConfigExternalPlugin (user V2 plugins)     │
│              └── Plugin.Service (V1 hooks + auth plugins)   │
│  renderer ──HTTP──▶ server (SDK). No plugin host here.      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Package map

### `@shob/plugin` — authoring SDK

Path: `packages/plugin`

This package is a **leaf contract**. It defines types and `define()` helpers.
It must not import `@shob/core` or `@shob/server`. Plugins authored against it
stay portable and testable without the full server graph.

Public exports (`package.json`):

| Export | Purpose |
| --- | --- |
| `@shob/plugin` | V1 plugin factory + `Hooks` + tool helpers |
| `@shob/plugin/tool` | Tool definition helpers |
| `@shob/plugin/tui` | Legacy TUI plugin surface |
| `@shob/plugin/v2/effect` | V2 Effect `define`, context, domain hooks |
| `@shob/plugin/v2/promise` | V2 Promise mirror of Effect API |

Important source layout:

```text
packages/plugin/src/
  index.ts                 # V1 Plugin / Hooks / PluginInput
  tool.ts                  # tool() helper
  tui.ts                   # legacy TUI API
  example.ts               # V1 tool example
  example-workspace.ts
  shell.ts
  v2/
    options.ts
    effect/                # Effect domain
      plugin.ts            # Plugin + define
      context.ts           # PluginContext
      registration.ts      # Registration / Reload / Hooks types
      agent.ts catalog.ts command.ts skill.ts ...
      aisdk.ts integration.ts ...
      README.md
      PLAN.md              # design intent / roadmap
    promise/               # Promise domain (async/await)
      plugin.ts context.ts ...
      README.md
```

### `@shob/core` — V2 runtime host

Path: `packages/core`

Owns the durable services plugins transform (agents, catalog, commands, skills,
integrations, AI SDK, config, npm, filesystem). Implements:

| Module | Role |
| --- | --- |
| `src/plugin.ts` (`PluginV2`) | `add` / `remove` / `wait` for plugins by ID |
| `src/plugin/host.ts` (`PluginHost`) | Builds the public `PluginContext` plugins see |
| `src/plugin/internal.ts` (`PluginInternal`) | Boots built-in V2 plugins in fixed order |
| `src/plugin/promise.ts` | Adapts Promise plugins → Effect plugins |
| `src/plugin/provider/*` | Built-in provider AI SDK plugins (~40) |
| `src/config/plugin/*` | Config-driven plugins (external, agent, skill, …) |

### `packages/shob` — V1 host + product built-ins

Path: `packages/shob/src/plugin`

| Module | Role |
| --- | --- |
| `index.ts` | V1 `Plugin.Service`: load hooks, `trigger`, events |
| `loader.ts` | Resolve/install/import external V1 plugins |
| `shared.ts` | Spec parsing, entrypoints, compatibility |
| `xai.ts`, `azure.ts`, `github-copilot/*`, … | Built-in V1 auth plugins |

### `@shob/sdk`

Plugins may use **generated types** from the SDK (providers, models, auth). They
should not reach into core service types. Core may still use branded IDs
internally; the host maps between public and internal shapes.

---

## 3. Mental model

### Isolation rule

```text
Plugin code  ──imports──▶  @shob/plugin (+ sdk types)
                 ✗ never imports @shob/core / server handlers

Core host    ──implements──▶  PluginContext
                 runs plugin.effect / plugin.setup inside a Scope
```

This keeps plugins from depending on private core APIs and lets the host swap
implementations behind a stable context.

### Two extension styles

```text
Transform (stateful domains)          Runtime hook (live operations)
────────────────────────────          ─────────────────────────────
Start from fresh domain draft         Intercept a live call
Run every registered transform        Earlier hooks mutate event
Commit rebuilt domain                 Later hooks see mutations
Examples: agents, catalog, skills     Examples: aisdk.sdk, aisdk.language
```

### Plugin identity

Every V2 plugin has a stable string `id`. Loading the same `id` again:

1. Closes the previous plugin scope (all registrations disposed)
2. Runs the new setup
3. Keeps **order position** for that ID (replace in place)

V1 plugins are not keyed the same way; they are collected as a list of `Hooks`
objects and invoked in registration order.

---

## 4. V2 plugin system

### 4.1 Defining a plugin (Effect)

```ts
import { define } from "@shob/plugin/v2/effect"
import { Effect } from "effect"

export const Plugin = define({
  id: "example",
  effect: Effect.fn(function* (ctx) {
    // Register transforms / hooks imperatively. Do not return a hooks object.
    yield* ctx.catalog.transform((catalog) => {
      catalog.provider.update("example", (provider) => {
        provider.name = "Example"
      })
    })
  }),
})
```

`define()` is an identity helper for typing — it returns the object you pass in.

Type shape (`packages/plugin/src/v2/effect/plugin.ts`):

```ts
interface Plugin<R = Scope.Scope> {
  readonly id: string
  readonly effect: (context: PluginContext) => Effect.Effect<void, never, R>
}
```

### 4.2 Defining a plugin (Promise)

```ts
import { define } from "@shob/plugin/v2/promise"

export const Plugin = define({
  id: "example",
  setup: async (ctx) => {
    await ctx.catalog.transform((catalog) => {
      catalog.provider.update("example", (provider) => {
        provider.name = "Example"
      })
    })
  },
})
```

Capabilities match Effect. The only difference is the async boundary:

- Registration returns `Promise<Registration>`
- `reload()` returns `Promise<void>`
- `Registration.dispose` is `() => Promise<void>`

Internally, core adapts Promise plugins with `PluginPromise.fromPromise`
(`packages/core/src/plugin/promise.ts`) so a single Effect loader can run both.

### 4.3 PluginContext

`PluginContext` is the only host surface V2 plugins receive:

```ts
interface PluginContext {
  readonly options: PluginOptions          // config options for this plugin
  readonly agent: AgentHooks & Reload
  readonly aisdk: AISDKHooks               // runtime only (no domain reload)
  readonly catalog: CatalogHooks & Reload
  readonly command: CommandHooks & Reload
  readonly integration: IntegrationHooks & Reload
  readonly plugin: PluginDomain            // nested add/remove
  readonly reference: ReferenceHooks & Reload
  readonly skill: SkillHooks & Reload
}
```

Built by `PluginHost.make` in `packages/core/src/plugin/host.ts`. The host:

- Injects core services (Catalog, AgentV2, AISDK, Integration, …)
- Exposes **mutable draft views** of domain state for transforms
- Converts public string IDs to branded core IDs where needed
- Bridges Effect and non-Effect callbacks for runtime hooks

**Note:** A public HTTP/SDK client is intentionally **not** on `PluginContext`
yet (see `v2/effect/README.md`). V1 still uses `PluginInput.client`.

### 4.4 Nested plugins

Plugins can load children:

```ts
// Effect
yield* ctx.plugin.add({
  id: "child",
  effect: Effect.fn(function* (childCtx) { /* ... */ }),
})

// Promise
await ctx.plugin.add({
  id: "child",
  setup: async (childCtx) => { /* ... */ },
})
```

`ConfigExternalPlugin` uses this pattern: the meta-plugin discovers modules and
calls `ctx.plugin.add` for each one.

### 4.5 PluginV2 service API

`packages/core/src/plugin.ts`:

```ts
interface Interface {
  add(id: ID, effect: Plugin["effect"]): Effect.Effect<void>
  remove(id: ID): Effect.Effect<void>
  wait(id: ID): Effect.Effect<void>
}
```

Behavior details:

| Operation | Behavior |
| --- | --- |
| `add` | Per-ID mutex. Detects load cycles. Closes existing scope for that ID. Forks a child `Scope`, runs `effect(host)`, publishes `Plugin.Event.Added` on success. Failures stored for `wait`ers. |
| `remove` | Closes child scope (registrations finalizers run). Cannot remove while loading. |
| `wait` | Resolves when plugin becomes active, or fails with the load exit. |

All plugin loads share a parent scope owned by the `PluginV2` service; shutting
down the location tears down every active plugin.

---

## 5. V1 plugin system

### 5.1 Defining a plugin

```ts
import type { Plugin } from "@shob/plugin"
import { tool } from "@shob/plugin/tool"

export const ExamplePlugin: Plugin = async (_ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string().describe("foo"),
        },
        async execute(args) {
          return `Hello ${args.foo}!`
        },
      }),
    },
  }
}
```

Type:

```ts
type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>
```

### 5.2 PluginInput

Given to every V1 factory at load time:

| Field | Meaning |
| --- | --- |
| `client` | Typed OpenCode/shob HTTP client (SDK) bound to the project directory |
| `project` | Project metadata |
| `directory` | Absolute project directory |
| `worktree` | Git worktree root |
| `serverUrl` | Base URL of the local server |
| `$` | Bun shell (when available) |
| `experimental_workspace.register` | Register workspace adapters |

### 5.3 Hooks surface

`Hooks` is a bag of optional callbacks. Important groups:

| Hook | Role |
| --- | --- |
| `dispose` | Cleanup when the plugin instance is torn down |
| `event` | Bus events for this directory |
| `config` | Notified with current config after load |
| `tool` | Map of custom tool definitions |
| `auth` | OAuth / device / key methods for a provider |
| `provider` | Provider model list customization |
| `chat.message` | Mutate inbound user message + parts |
| `chat.params` | Mutate temperature / topP / max tokens / options |
| `chat.headers` | Mutate request headers |
| `permission.ask` | Auto-allow / deny / ask |
| `command.execute.before` | Intercept slash commands |
| `tool.execute.before` / `after` | Tool call boundaries |
| `shell.env` | Inject environment for shell tools |
| `experimental.*` | Compaction, system prompt, small models, … |

### 5.4 Trigger model

The V1 host does not rebuild domains. Call sites ask:

```ts
yield* plugin.trigger("tool.execute.before", input, output)
// later hooks see mutations written into `output`
```

Rules:

- Hooks run **sequentially** in registration order
- Missing hooks are skipped
- Mutating `output` is the extension mechanism
- Failures in one hook are logged/handled by the call site (varies by trigger)

Event fan-out: the host listens to the V2 event bridge and calls each hook’s
`event` for events scoped to the same directory.

### 5.5 Module shapes the V1 loader accepts

1. **Modern module:** `{ id?, server: Plugin }` via `readV1Plugin`
2. **Legacy exports:** any export that is a function, or `{ server: function }`

Built-ins are direct imports in `packages/shob/src/plugin/index.ts`
(`internalPlugins`), not dynamic modules.

---

## 6. Discovery and configuration

### 6.1 Config schema (V2 config path)

`packages/core/src/config/plugin.ts`:

```ts
// Either a package string or an object
type Plugin = string | { package: string; options?: Record<string, unknown> }
plugins?: Plugin[]
```

Examples in `shob.json` / `shob.jsonc`:

```jsonc
{
  "plugins": [
    "@acme/shob-plugin",
    { "package": "./plugins/local.ts", "options": { "token": "…" } },
    { "package": "file:///abs/path/to/plugin.js" }
  ]
}
```

### 6.2 ConfigExternalPlugin (V2 user plugins)

`packages/core/src/config/plugin/external.ts` (`id: "config-plugin"`):

1. Iterate config document entries → collect `plugins` array
2. Resolve package:
   - `file://` → filesystem path
   - `./` / `../` → relative to the config file directory
   - bare name → npm package (installed via `Npm.add`)
3. For each **directory** config entry, glob:

   ```text
   {plugin,plugins}/*.{ts,js}
   ```

4. Dynamic `import(entrypoint)`
5. Decode default export as either Effect or Promise plugin
6. `ctx.plugin.add({ id, effect })` with `options` merged into context

Failures for individual plugins are ignored at the outer boundary
(`Effect.ignoreCause`) so one bad plugin does not block the whole batch —
still log/monitor carefully in development.

### 6.3 V1 discovery (`packages/shob`)

Config derives `plugin_origins` (winning specs after merge/dedup). Then:

1. `PluginLoader.resolve` — install/target, entrypoint for kind `server` | `tui`, npm compatibility check
2. `PluginLoader.load` — dynamic import
3. `applyPlugin` — invoke factories → push `Hooks`

Auto-discovery also scans local folders (via config plugin helpers) such as
`.shob/plugin(s)` depending on versioned config paths.

npm plugins can declare compatible shob versions; **file plugins skip** the
compatibility gate (treated as local development).

### 6.4 Pure / flags

Runtime flags can disable default plugins or pure-mode external plugins
(see `RuntimeFlags` usage in `packages/shob/src/plugin/index.ts`):

- `disableDefaultPlugins` — skip built-in V1 auth plugins
- `pure` — skip external plugin_origins load

---

## 7. Boot sequence

### 7.1 V2 internal boot (`PluginInternal`)

`packages/core/src/plugin/internal.ts` runs a **batched** sequential add:

```text
State.batch {
  1. ConfigReferencePlugin
  2. AgentPlugin          (built-in agents)
  3. CommandPlugin        (built-in commands)
  4. SkillPlugin          (built-in skills)
  5. ModelsDevPlugin      (base model catalog source)
  6. ConfigAgentPlugin    (config → agents)
  7. ConfigCommandPlugin
  8. ConfigSkillPlugin
  9. ProviderPlugins[]    (openai, anthropic, xai, … AI SDK wiring)
 10. ConfigExternalPlugin (user plugins — last among config extensions)
 11. ConfigProviderPlugin (config provider overrides)
 12. VariantPlugin
}
```

Design intent (`PLAN.md`):

```text
1. Built-in agents, commands, skills
2. Base data sources (models.dev)
3. Configuration projections
4. Provider-specific normalization / AI SDK
5. External user plugins
6. Core domain finalization (variants / overrides)
```

**Why batching matters:** During boot, registering many transforms does not
rebuild the catalog (or other domains) after every plugin. The batch collects
affected domains and rebuilds each **once**, then opens for live updates.

Outside a batch, register/dispose rebuilds the domain immediately.

### 7.2 Catalog transform pipeline (example)

```text
models.dev baseline
  → config provider overrides
  → built-in provider normalization
  → user catalog transforms
  → catalog finalization
```

Order is registration order. User plugins load after models.dev and most
built-ins so they can override names, models, and defaults.

### 7.3 V1 boot (`Plugin.Service` state init)

Per project instance directory:

```text
1. Create SDK client + PluginInput
2. Load internal V1 plugins (unless disabled)
3. Resolve external origins → load modules sequentially
4. Call each hook.config(cfg)
5. Subscribe to events → fan-out hook.event
6. Register dispose finalizers
```

Sequential external load keeps hook order deterministic.

---

## 8. Domain transforms in depth

### 8.1 Domains

| Domain | What transforms edit |
| --- | --- |
| `agent` | Agent definitions (mode, description, defaults) |
| `catalog` | Providers + models + default model selection |
| `command` | Slash / palette commands |
| `skill` | Skill documents / prompts |
| `reference` | Reference material sources |
| `integration` | Integration definitions + auth methods |

### 8.2 Semantics

From the V2 design (implemented by core domain services):

1. Calling `transform(callback)` creates an independent **registration**
2. Multiple transforms per plugin per domain are allowed
3. Order = plugin registration order, then transform order within the plugin
4. Rebuild algorithm:
   - Start from **fresh** domain state (not “last committed + delta”)
   - Run every active transform in order
   - Commit the result
5. Register or dispose **triggers rebuild** (or coalesces inside a batch)
6. Transforms may perform Effectful I/O (filesystem, network, other domains)
7. Reads of another domain see that domain’s latest **committed** state
8. Unexpected transform failures are defects (no typed error channel on the public API)

### 8.3 Draft API style (catalog example)

```ts
yield* ctx.catalog.transform((catalog) => {
  catalog.provider.update("acme", (provider) => {
    provider.name = "Acme"
  })
  catalog.model.update("acme", "fast", (model) => {
    model.name = "Acme Fast"
  })
  catalog.model.default.set("acme", "fast")
})
```

The host passes a **mutable draft** (`DeepMutable`) so plugins can write
natural JS mutations. Core commits after all transforms finish.

### 8.4 Reload

When a transform closes over external data that changes:

```ts
let data = yield* loadSomething()

yield* ctx.catalog.transform((catalog) => {
  apply(data, catalog)
})

// later, after data changes:
data = yield* loadSomething()
yield* ctx.catalog.reload()  // reruns ALL catalog transforms
```

Reload is **domain-scoped**, not registration-scoped. It rebuilds the whole
domain from all active transforms.

Available: `agent.reload`, `catalog.reload`, `command.reload`,
`integration.reload`, `reference.reload`, `skill.reload`.

---

## 9. Runtime hooks in depth

### 9.1 AI SDK hooks (V2)

Primary live extension for LLM providers:

```ts
// Effect example from packages/core/src/plugin/provider/xai.ts
yield* ctx.aisdk.sdk(Effect.fn(function* (evt) {
  if (evt.package !== "@ai-sdk/xai") return
  const mod = yield* Effect.promise(() => import("@ai-sdk/xai"))
  evt.sdk = mod.createXai(evt.options)
}))

yield* ctx.aisdk.language(Effect.fn(function* (evt) {
  if (evt.model.providerID !== "xai") return
  evt.language = evt.sdk.responses(evt.model.api.id)
}))
```

Flow when the session runner needs a model:

```text
Session needs language model
  → AISDK service builds event { model, package, options, sdk? }
  → all aisdk.sdk hooks run in order (may set evt.sdk)
  → all aisdk.language hooks run (may set evt.language)
  → runner streams with the resulting language model
```

Later hooks observe earlier mutations. First matching provider plugin usually
wins by setting `sdk` / `language`; others no-op on package/provider mismatch.

### 9.2 V1 runtime hooks

V1 hooks are invoked explicitly by session/tool/auth code paths via
`Plugin.trigger`. There is no automatic domain rebuild — pure side effects and
output mutation.

---

## 10. Scopes, dispose, and reloading

### Scope ownership

```text
PluginV2 parent Scope
  └── child Scope (per plugin id)
        ├── transform registrations
        ├── runtime hook registrations
        └── nested plugin child scopes
```

Closing the child scope:

- Runs Effect finalizers for every registration
- Removes transforms → domain rebuilds without them
- Unsubscribes runtime hooks

Early dispose:

```ts
const reg = yield* ctx.catalog.transform(...)
yield* reg.dispose  // Effect API
// or
await reg.dispose() // Promise API
```

`dispose` is idempotent in the design contract.

### Replace semantics

`PluginV2.add` with an existing ID:

1. Delete map entry + close old scope
2. Open new child scope + run new effect
3. Publish Added event

Callers waiting on `wait(id)` are notified of success or failure.

### Load cycle detection

If `add(id)` is re-entered while `id` is still loading, the host dies with
`Plugin load cycle detected for ${id}`. Nested plugins must use **different**
IDs.

---

## 11. Provider and auth plugins

These are easy to confuse because both touch “providers.”

### V2 provider plugins (`packages/core/src/plugin/provider/*`)

Focus: **AI SDK wiring** and catalog normalization.

- Register `aisdk.sdk` / `aisdk.language`
- Sometimes adjust catalog entries
- Loaded by `PluginInternal` for every built-in provider

### V1 auth plugins (`packages/shob/src/plugin/*`)

Focus: **how the user authenticates** to a provider.

Examples: xAI OAuth + device code, GitHub Copilot, Azure, Cloudflare, Codex.

They return `Hooks.auth` with methods (`oauth`, device, key, env) and optional
token loaders. The app UI lists methods from these hooks when connecting a
provider.

### Integrations (V2)

`ctx.integration.transform` can declare integration metadata and auth methods
using core’s integration domain (OAuth authorize/refresh, env, API key). This is
the V2-oriented path for auth configuration; migration from V1 auth hooks is
ongoing in spirit of the PLAN, not always complete for every provider.

---

## 12. How a session turn uses plugins

Simplified path for one user prompt:

```text
1. UI → SDK → Server SessionV2.prompt
2. Config / catalog already include plugin transforms
3. Agent resolution uses AgentV2 domain (plugin agents visible)
4. Model resolution uses Catalog + Provider services
5. AISDK hooks create language model instance (V2 provider plugins)
6. Optional V1 chat.params / chat.headers / chat.message hooks
7. Tool loop:
     - Tool registry includes V1 hook.tool definitions
     - tool.execute.before / after (V1)
     - shell.env (V1) for shell tools
8. permission.ask (V1) for gated tools
9. Events published → V1 hook.event listeners
10. Compaction path may call experimental.session.compacting (V1)
```

Plugins that only transform catalog/agents affect the turn **before** the model
is called. Plugins that only install AI SDK hooks affect **how** the model is
constructed. V1 hooks affect **request mutation and tools** mid-turn.

---

## 13. Authoring guide

### Choose V1 or V2

| You want to… | Prefer |
| --- | --- |
| Add models / rename providers / set defaults | V2 `catalog.transform` |
| Wire a new AI SDK package | V2 `aisdk.sdk` + `aisdk.language` |
| Add agents / skills / commands from files | V2 domain transforms |
| Custom tools for the agent | V1 `Hooks.tool` (today) |
| OAuth connect UX for a provider | V1 `Hooks.auth` (today) |
| Mutate chat params / permissions | V1 trigger hooks |

### Minimal V2 Effect template

```ts
import { define } from "@shob/plugin/v2/effect"
import { Effect } from "effect"

export default define({
  id: "acme.example",
  effect: Effect.fn(function* (ctx) {
    const opts = ctx.options

    yield* ctx.catalog.transform((catalog) => {
      // use opts, mutate catalog
    })

    yield* ctx.aisdk.sdk(
      Effect.fn(function* (event) {
        // only handle your package id
      }),
    )
  }),
})
```

Export as **default** so `ConfigExternalPlugin` can decode `mod.default`.

### Minimal V1 template

```ts
import type { Plugin } from "@shob/plugin"

export default async function (input, options): ReturnType<Plugin> {
  return {
    async event({ event }) {
      // react to bus events
    },
    "tool.execute.before": async (input, output) => {
      // sanitize args
    },
  }
}

// or module form:
// export default { id: "acme.v1", server: pluginFn }
```

### Local development workflow

1. Create `plugins/my-plugin.ts` in a project (or under config directory scan roots)
2. Reference it from `shob.json`:

   ```json
   { "plugins": ["./plugins/my-plugin.ts"] }
   ```

3. Restart / reload the desktop server process (plugin load is boot-time for most paths)
4. Confirm via logs or by observing catalog/auth UI changes

### Rules of thumb

- Prefer **narrow** `if` guards in AI SDK hooks (package ID / provider ID)
- Do not hold long-lived secrets in transform closures without refresh + `reload()`
- Keep transforms **pure-ish**: heavy I/O is allowed but failures defect the fiber
- Use distinct plugin IDs; never re-enter `add` with the same ID from inside itself
- Do not import `@shob/core` from a plugin package

---

## 14. Debugging and failure modes

| Symptom | Likely cause |
| --- | --- |
| Plugin never loads | Wrong path; not default-exported; pure/disabled flags; config not scanned |
| Catalog missing models | Transform order; models.dev failed; config disabled providers |
| Model call fails SDK create | No `aisdk.sdk` hook for that package; wrong package string |
| Wrong language API | `aisdk.language` not matching `providerID` |
| V1 hook not running | Not registered; trigger name mismatch; sequential earlier hook threw |
| “Plugin load cycle detected” | Nested `plugin.add` reused parent ID while loading |
| npm plugin skipped | Compatibility check failed against InstallationVersion |
| One plugin kills others | Uncaught defect in non-isolated path; prefer ignore boundaries in loaders |

Useful code anchors:

- V2 add/remove: `packages/core/src/plugin.ts`
- Host mapping: `packages/core/src/plugin/host.ts`
- Boot order: `packages/core/src/plugin/internal.ts`
- External V2 load: `packages/core/src/config/plugin/external.ts`
- V1 load + trigger: `packages/shob/src/plugin/index.ts`
- V1 resolve pipeline: `packages/shob/src/plugin/loader.ts`

Enable server logs around `"Plugin.load"` spans and `"failed to load plugin"`
messages when diagnosing external modules.

---

## 15. File index

### Authoring

| Path | Description |
| --- | --- |
| `packages/plugin/src/index.ts` | V1 types + Hooks |
| `packages/plugin/src/tool.ts` | Tool helper |
| `packages/plugin/src/v2/effect/*` | V2 Effect API |
| `packages/plugin/src/v2/promise/*` | V2 Promise API |
| `packages/plugin/src/example.ts` | V1 example plugin |

### Core runtime (V2)

| Path | Description |
| --- | --- |
| `packages/core/src/plugin.ts` | PluginV2 service |
| `packages/core/src/plugin/host.ts` | PluginHost / context |
| `packages/core/src/plugin/internal.ts` | Built-in boot |
| `packages/core/src/plugin/promise.ts` | Promise → Effect adapter |
| `packages/core/src/plugin/provider/*` | Provider AI SDK plugins |
| `packages/core/src/plugin/agent.ts` | Built-in agents plugin |
| `packages/core/src/plugin/command.ts` | Built-in commands plugin |
| `packages/core/src/plugin/skill.ts` | Built-in skills plugin |
| `packages/core/src/plugin/models-dev.ts` | models.dev source |
| `packages/core/src/plugin/variant.ts` | Variants |
| `packages/core/src/config/plugin/external.ts` | User plugin discovery |
| `packages/core/src/config/plugin/{agent,command,skill,provider,reference}.ts` | Config projections |

### Shob product (V1 + auth)

| Path | Description |
| --- | --- |
| `packages/shob/src/plugin/index.ts` | V1 Plugin service |
| `packages/shob/src/plugin/loader.ts` | External resolve/load |
| `packages/shob/src/plugin/shared.ts` | Specs, entrypoints, compat |
| `packages/shob/src/plugin/*.ts` | Built-in auth plugins |
| `packages/shob/src/config/plugin.ts` | V1 config helpers / origins |

### Design notes

| Path | Description |
| --- | --- |
| `packages/plugin/src/v2/effect/README.md` | Public V2 Effect usage |
| `packages/plugin/src/v2/promise/README.md` | Public V2 Promise usage |
| `packages/plugin/src/v2/effect/PLAN.md` | Target design / roadmap |

---

## 16. Related docs

| Doc | Relationship |
| --- | --- |
| [architecture.md](./architecture.md) | Desktop ↔ embedded server wiring |
| [architecture-overview.md](./architecture-overview.md) | Package roles including `@shob/plugin` |
| [package-dependencies.md](./package-dependencies.md) | Who depends on `plugin` / `core` / `shob` |
| [build-flow.md](./build-flow.md) | How the server binary is built and embedded |

---

## Appendix A — Dual-stack summary

```text
                    ┌──────────────────────┐
                    │   Config / folders   │
                    └──────────┬───────────┘
               ┌───────────────┴───────────────┐
               ▼                               ▼
        V2 ConfigExternal               V1 PluginLoader
               │                               │
               ▼                               ▼
        PluginV2.add  ◀── PluginInternal    Hooks[]
               │           (built-ins)         │
               ▼                               ▼
         PluginHost                      Plugin.trigger
               │                               │
       ┌───────┴────────┐              tools / auth / chat
       ▼                ▼
  Domain transforms   AISDK hooks
  (agents, catalog,   (sdk + language)
   skills, …)
```

Both stacks run in the **same server process**. They share the location/runtime
but use different registration and invocation mechanisms. Prefer V2 for new
domain contributions; use V1 when you need hooks that only exist on the V1
`Hooks` interface today.

---

## Appendix B — Glossary

| Term | Meaning |
| --- | --- |
| **Plugin** | Module that extends the server via V1 factory or V2 `define` |
| **Host** | Core/shob code that constructs context and runs plugins |
| **Transform** | Replayable contribution to a stateful domain |
| **Reload / rebuild** | Re-run all transforms for a domain |
| **Runtime hook** | Live interceptor (AI SDK, V1 triggers) |
| **Registration** | One install of a transform/hook; disposable |
| **Scope** | Effect lifetime boundary; close ⇒ dispose registrations |
| **Catalog** | Provider + model registry used for model selection |
| **Integration** | Auth/connection definition for a provider |
| **Origin** | Config-derived plugin specifier (npm/file/url) |

---

*Last updated for the desktop-only monorepo layout (`packages/plugin`, `packages/core`, `packages/shob`). As V1 hooks migrate into V2 domains, prefer the V2 READMEs and PLAN for forward-looking API names (`rebuild` vs `reload` naming may converge over time — the shipped API currently uses `reload` on domain objects).*
