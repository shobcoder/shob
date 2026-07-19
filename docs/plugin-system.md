# Developer plugin host (`@shob/plugin`)

> **Building a full agent plugin (skills + MCP + tools + install package)?**  
> Start with **[agent-plugin-architecture.md](./agent-plugin-architecture.md)** — the product-level architecture.  
> For skills only, see **[skills-system.md](./skills-system.md)**.

This document covers the **server developer plugin host**: how packages use
`@shob/plugin` (V1 hooks and V2 Effect/Promise `define`) to extend the Shob
**server** (providers, catalog, agents, auth hooks, etc.). It is one *engine*
under the full agent plugin model, not the whole product surface.

---

## Quick distinction

| | **Skills** (agent) | **Plugins** (server host) |
| --- | --- | --- |
| What users extend | `SKILL.md` folders, skill tool | npm/file modules with `define` / hooks |
| Who loads them | Skill discovery + `skill` tool | `PluginV2` / V1 `Plugin.Service` |
| Purpose | On-demand instructions for the model | Wire providers, tools, catalog, auth |
| Doc | [skills-system.md](./skills-system.md) | This file |

---

## Overview

Shob’s server can be extended in-process by **plugins**:

- Register or reshape agents, commands, skills *sources*, references, catalog
- Wire AI SDK packages to language models
- V1: OAuth/auth hooks, tools, chat/permission lifecycle callbacks

Two generations:

| Generation | Entry | Host |
| --- | --- | --- |
| **V2** | `@shob/plugin/v2/effect`, `…/v2/promise` | `@shob/core` `PluginV2` + `PluginHost` |
| **V1** | `@shob/plugin` factory → `Hooks` | `packages/shob` `Plugin.Service` |

Plugins never run in the Electron renderer. Only the embedded server does.

```text
@shob/plugin (contracts)
       ▲
       │ imports
  author packages
       │
       ▼
@shob/core PluginV2 + PluginInternal + ConfigExternalPlugin
packages/shob V1 Plugin.Service + auth built-ins
```

---

## Package map

### `@shob/plugin` — authoring only

Path: `packages/plugin`

| Export | Purpose |
| --- | --- |
| `@shob/plugin` | V1 `Plugin` / `Hooks` / tools |
| `@shob/plugin/v2/effect` | V2 Effect `define` + context |
| `@shob/plugin/v2/promise` | V2 Promise `define` + context |

Does **not** import `@shob/core`.

### `@shob/core` — V2 host

| Module | Role |
| --- | --- |
| `src/plugin.ts` | `add` / `remove` / `wait` |
| `src/plugin/host.ts` | Builds `PluginContext` |
| `src/plugin/internal.ts` | Boot order for built-ins |
| `src/plugin/provider/*` | Provider AI SDK plugins |
| `src/config/plugin/external.ts` | User V2 modules from config |
| `src/config/plugin/skill.ts` | Registers skill *sources* (feeds Skills system) |

### `packages/shob` — V1 host

| Module | Role |
| --- | --- |
| `src/plugin/index.ts` | Load hooks, `trigger`, events |
| `src/plugin/loader.ts` | npm/file resolve + import |
| `src/plugin/xai.ts` etc. | Built-in auth |

---

## V2 authoring

### Effect

```ts
import { define } from "@shob/plugin/v2/effect"
import { Effect } from "effect"

export default define({
  id: "example",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform((catalog) => {
      catalog.provider.update("example", (p) => {
        p.name = "Example"
      })
    })
  }),
})
```

### Promise

```ts
import { define } from "@shob/plugin/v2/promise"

export default define({
  id: "example",
  setup: async (ctx) => {
    await ctx.catalog.transform((catalog) => {
      catalog.provider.update("example", (p) => {
        p.name = "Example"
      })
    })
  },
})
```

### Extension styles

1. **Transform** — rebuild stateful domains: `agent`, `catalog`, `command`, `skill` (sources), `reference`, `integration`.  
   `ctx.catalog.reload()` re-runs all transforms for that domain.

2. **Runtime hooks** — live interceptors, mainly:
   - `ctx.aisdk.sdk`
   - `ctx.aisdk.language`

### PluginContext

```ts
options, agent, aisdk, catalog, command, integration, plugin, reference, skill
```

Built in `packages/core/src/plugin/host.ts`. Registrations are **scope-owned**;
removing a plugin closes its scope and drops registrations.

### PluginV2 lifecycle

- `add(id, effect)` — mutex per id; replace closes previous scope; publishes Added
- `remove(id)` — close scope
- `wait(id)` — await load success/failure
- Load cycle if `add` re-enters same id while loading → defect

---

## V2 boot order (`PluginInternal`)

Batched sequential load (`packages/core/src/plugin/internal.ts`):

```text
1. ConfigReferencePlugin
2. AgentPlugin / CommandPlugin / SkillPlugin (built-ins)
3. ModelsDevPlugin
4. Config agent/command/skill projections
5. ProviderPlugins (AI SDK)
6. ConfigExternalPlugin (user packages)
7. ConfigProviderPlugin / VariantPlugin
```

Batching coalesces domain rebuilds during boot.

---

## V2 user discovery

`ConfigExternalPlugin`:

1. `plugins` array in config docs  
2. Glob `{plugin,plugins}/*.{ts,js}` under directory config entries  
3. Resolve path / `file://` / npm via `Npm.add`  
4. Dynamic import; accept `{ id, effect }` or `{ id, setup }`  
5. `ctx.plugin.add(...)`

Config entry shape: `string | { package, options? }`.

---

## V1 authoring

```ts
import type { Plugin } from "@shob/plugin"

const plugin: Plugin = async (input, options) => ({
  tool: { /* … */ },
  auth: { /* … */ },
  "tool.execute.before": async (input, output) => { /* … */ },
})
```

`PluginInput`: SDK `client`, project, directory, worktree, `serverUrl`, shell, workspace register.

`Hooks` include: `event`, `config`, `tool`, `auth`, `provider`, `chat.*`, `permission.ask`, tool/command lifecycle, experimental compaction/system transforms.

Host: sequential `Plugin.trigger(name, input, output)`; mutations on `output`.

Built-in V1 auth plugins (Codex, Copilot, xAI OAuth, …) live under `packages/shob/src/plugin/*`. External V1 packages go through `PluginLoader` (install → entry → compatibility → import).

---

## Relation to Skills

A V2 plugin **can** register skill **sources** (e.g. `SkillPlugin` embeds
`customize-shob`; `ConfigSkillPlugin` adds dirs/URLs). That only *feeds* the
Skills domain.

The **agent-facing** skill catalog, discovery paths, and `skill` tool are
documented in **[skills-system.md](./skills-system.md)**.

```text
Developer plugin ──skill.transform──▶ SkillV2 sources
                                            │
                                            ▼
                                     skill list + skill tool  ← agent uses this
```

---

## File index (developer host)

| Path | Role |
| --- | --- |
| `packages/plugin/src/v2/effect/*` | V2 Effect API |
| `packages/plugin/src/v2/promise/*` | V2 Promise API |
| `packages/plugin/src/index.ts` | V1 Hooks |
| `packages/core/src/plugin.ts` | PluginV2 |
| `packages/core/src/plugin/host.ts` | Host context |
| `packages/core/src/plugin/internal.ts` | Boot |
| `packages/core/src/config/plugin/external.ts` | User V2 load |
| `packages/shob/src/plugin/index.ts` | V1 service |
| `packages/shob/src/plugin/loader.ts` | V1 external load |
| `packages/plugin/src/v2/effect/README.md` | Short V2 Effect guide |
| `packages/plugin/src/v2/effect/PLAN.md` | Design roadmap |

---

## Related

- **[skills-system.md](./skills-system.md)** — agent Skills / SKILL.md (what you usually mean by “agent plugins”)
- [architecture-overview.md](./architecture-overview.md) — package roles
- [package-dependencies.md](./package-dependencies.md) — dependency graph
