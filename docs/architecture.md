# Architecture

The desktop app is an Electron application built from three processes, plus an
embedded HTTP server. The repo no longer ships a CLI or a TUI — the only way to
run shob is through this desktop app.

## Processes

### 1. Main process — `packages/desktop/src/main/`

Entry: `src/main/index.ts` (+ `src/main/sidecar.ts`).

Responsibilities:

- Creates and manages Electron windows (`windows.ts`, `window-registry.ts`).
- Loads the **embedded shob server** through the virtual module
  `virtual:shob-server`. At build time this is resolved (in
  `electron.vite.config.ts`) to `packages/shob/dist/node/node.js`, i.e. the
  shob **server** build (not the CLI build, which has been removed).
- Registers IPC handlers in `src/main/ipc.ts` (the renderer only ever calls
  `window.api`, exposed by the preload).
- Handles auto-update (`updater*.ts`), app menu (`menu.ts`),
  attachment picker, logging, store, and WSL support (`wsl/`).

### 2. Preload — `packages/desktop/src/preload/`

`src/preload/index.ts` exposes a typed `window.api` object to the renderer.
The renderer must only call `window.api` — it never reaches into Node/Electron
APIs directly. Main-process IPC handlers live in `src/main/ipc.ts`.

### 3. Renderer — `packages/desktop/src/renderer/`

`src/renderer/index.html` is the entry. The renderer IS the web app
`@shob/app` (SolidJS), plugged in via `@shob/app/vite` in
`electron.vite.config.ts`. It renders the full chat/session UI using
`@shob/ui`, `@shob/session-ui`, and talks to the embedded
shob server over HTTP through the generated client `@shob/sdk`.

## Embedded server — `packages/shob`

`packages/shob` is the **server**. Only its server entry is used by the
desktop:

- `packages/shob/src/node.ts` exports `Config`, `Server`, `bootstrap`,
  `Database`.
- `packages/shob/script/build-node.ts` bundles `src/node.ts` (with
  `Bun.build`, target `node`) into `packages/shob/dist/node/node.js`.
- The desktop main process imports that bundle via `virtual:shob-server`.

The shob CLI entry (`src/index.ts`), the TUI (`packages/tui`), and all
`src/cli/*` command code have been removed. The server's shared utilities
(`src/util/record.ts`, `src/util/error.ts`) were previously re-exported from the
TUI package; they are now inlined so the server has no dependency on a TUI.

## Request flow at runtime

```
Renderer (SolidJS app)
   │  HTTP (localhost) via @shob/sdk
   ▼
Embedded shob server (main process, dist/node/node.js)
   │  @shob/server  →  @shob/core  →  @shob/llm
   ▼
LLM providers / tools / MCP / sessions (SQLite via core)
```

- The renderer never spawns the server; the main process owns it.
- The renderer uses `@shob/sdk` (generated) to call the server's HTTP API
  (`@shob/protocol` surface, served by `@shob/server`).
- `@shob/core` owns the database (Drizzle + SQLite), session runner,
  providers, tools, and permissions.
