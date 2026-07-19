# Package dependencies — what wires to what

Every package that remains is listed below. "Wires to" = the workspace
(`workspace:*`) packages it depends on. Packages with no workspace deps depend
only on npm packages and are leaf/shared foundation packages.

Legend: **runtime** = needed to run; **dev** = needed to build/typecheck/test.

## Foundation (no workspace deps)

| Package | Path | Notes |
| --- | --- | --- |
| `@shob/schema` | `packages/schema` | Wire/storage contracts. Base of the graph. |
| `@shob/sdk` | `packages/sdk/js` | Generated client SDK (HTTP client for the server). |
| `@shob/script` | `packages/script` | Build/version helpers used by shob build. |
| `@shob/http-recorder` | `packages/http-recorder` | HTTP record/replay for tests. |
| `@shob/effect-drizzle-sqlite` | `packages/effect-drizzle-sqlite` | Drizzle + Effect + SQLite adapter. |
| `@shob/effect-sqlite-node` | `packages/effect-sqlite-node` | Node SQLite Effect integration. |
| `@shob/ui` | `packages/ui` | Shared SolidJS component library. |

## Forward graph (package → what it wires to)

### `@shob/llm` — `packages/llm`
- runtime: `@shob/schema`
- dev: `@shob/http-recorder`

### `@shob/plugin` — `packages/plugin`
- runtime: `@shob/sdk`

### `@shob/protocol` — `packages/protocol`
- runtime: `@shob/schema`

### `@shob/core` — `packages/core`
- runtime: `@shob/effect-drizzle-sqlite`, `@shob/effect-sqlite-node`,
  `@shob/llm`, `@shob/schema`, `@shob/plugin`
- dev: `@shob/http-recorder`

### `@shob/server` — `packages/server`
- runtime: `@shob/core`, `@shob/protocol`

### `shob` (server) — `packages/shob`
- runtime: `@shob/llm`, `@shob/plugin`, `@shob/protocol`,
  `@shob/schema`, `@shob/script`, `@shob/sdk`,
  `@shob/server`
- dev: `@shob/core`, `@shob/http-recorder`, `@shob/script`
- built to `dist/node/node.js` and embedded by the desktop main process via the
  `virtual:shob-server` module (see [architecture.md](./architecture.md)).

### `@shob/session-ui` — `packages/session-ui`
- runtime: `@shob/core`, `@shob/sdk`, `@shob/ui`

### `@shob/app` — `packages/app` (the renderer)
- runtime: `@shob/core`, `@shob/schema`, `@shob/sdk`,
  `@shob/session-ui`, `@shob/ui`

### `@shob/desktop` — `packages/desktop` (the Electron app)
- runtime: (npm only — electron-*, effect, marked, zip, …)
- dev: `@shob/app`, `@shob/ui`
- build-time: bundles `packages/shob/dist/node/node.js` through
  `virtual:shob-server` (declared in `electron.vite.config.ts`, not in
  package.json).

## Reverse graph (package ← who consumes it)

| Package | Consumed by |
| --- | --- |
| `@shob/schema` | protocol, core, llm, shob, app |
| `@shob/sdk` | app, session-ui, shob, plugin, (root) |
| `@shob/ui` | desktop, app, session-ui |
| `@shob/core` | app, session-ui, server, shob(dev) |
| `@shob/llm` | core, shob |
| `@shob/plugin` | core, shob |
| `@shob/protocol` | server, shob |
| `@shob/server` | shob |
| `@shob/script` | shob, (root) |
| `@shob/http-recorder` | core(dev), llm(dev), shob(dev) |
| `@shob/effect-drizzle-sqlite` | core |
| `@shob/effect-sqlite-node` | core |
| `@shob/session-ui` | app |
| `@shob/app` | desktop |
| `shob` (server dist) | desktop (build-time embed) |

## Dependency-direction layers (top → bottom)

```
desktop
  └─ app ───────────────────────┐
       ├─ session-ui ─┐          │
       │    ├─ core    │          │
       │    ├─ sdk     │          │
       │    └─ ui      │          │
       ├─ core ────────┤          │
       ├─ schema        │          │
       ├─ sdk           │          │
       └─ ui ───────────┘          │
  └─ ui                              │
  └─ (embeds) shob server ───────┘
        ├─ server ─ core ─ protocol
        ├─ llm ─ schema
        ├─ plugin ─ sdk
        ├─ protocol ─ schema
        ├─ schema
        ├─ sdk
        └─ script
             core ─ effect-drizzle-sqlite, effect-sqlite-node, llm, schema, plugin
```

Per the repo's dependency rule: runtime deps flow
`schema ← protocol ← server`, and `schema/core/protocol ← shob`. The
desktop renderer (app) may depend on schema/sdk but never on core/server at
runtime; core/server are reached only through the embedded shob server.
