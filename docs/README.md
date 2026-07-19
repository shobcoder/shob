# Shob Desktop — Docs

This repository is slimmed down to a **desktop-only** build. The CLI, TUI,
GitHub workflows, cloud/SST infra, and unrelated packages have been removed.
Everything that remains is either the desktop app itself or a package the
desktop app needs at build time or runtime.

| Doc | What it covers |
| --- | --- |
| [architecture.md](./architecture.md) | How the desktop app is wired together (main / preload / renderer / embedded server) |
| [package-dependencies.md](./package-dependencies.md) | Full package graph — which package depends on (wires to) which |
| [build-flow.md](./build-flow.md) | The build & dev pipeline, step by step |
| [agent-plugin-architecture.md](./agent-plugin-architecture.md) | **Shobcoder agent plugin system**: skills + MCP + tools + hooks, package format, roadmap |
| [skills-system.md](./skills-system.md) | Agent skills only (`SKILL.md`, discovery, `skill` tool) |
| [plugin-system.md](./plugin-system.md) | Developer server plugins (`@shob/plugin` V1/V2 host internals) |

## Quick start

```bash
bun install          # installs all workspace packages
bun run dev:desktop  # runs the Electron app (electron-vite dev)
```

## TL;DR of the wiring

```
┌──────────────────────────────────────────────────────────────┐
│ Electron app  (packages/desktop)                              │
│                                                              │
│  Main process ──virtual:shob-server──▶ shob server   │
│              (bundles packages/shob/dist/node/node.js)   │
│                                                              │
│  Preload ──window.api──▶ Main (IPC)                          │
│                                                              │
│  Renderer ──@shob/app (SolidJS)──▶ HTTP localhost     │
│           └─ @shob/ui, session-ui                     │
└──────────────────────────────────────────────────────────────┘
```

- The **main process** embeds the shob **server** (`packages/shob`,
  built to `dist/node/node.js`) and runs it locally.
- The **renderer** is the SolidJS web app (`packages/app`) which talks to the
  embedded server over HTTP using the generated client SDK
  (`@shob/sdk`).
- The **preload** exposes a small `window.api` surface that the renderer uses
  for IPC with the main process.
