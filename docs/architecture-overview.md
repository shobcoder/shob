# Architecture Overview

This document maps the whole monorepo: what each package **is**, **which files** matter, and **where / what it is used for**. It complements [ui-path-introduction.md](file:///c:/Users/sera/Desktop/shobcoder/docs/ui-path-introduction.md), which focuses only on the frontend UI layer.

The product is a coding agent. A backend **server** runs durable sessions and talks to LLM providers; a web/desktop **app** renders the conversation; an **SDK** is the typed HTTP client used by both the app and external tooling; **plugins** extend the server with agents, models, commands, skills, and integrations.

---

## 1. Dependency Map

Runtime dependency direction (arrow = "depends on"). Per `AGENTS.md`, dependencies flow `Schema → Protocol → Server`, and `Core/Protocol/Server → Schema`. Client code may depend on `Schema` and `Protocol` but never `Core` or `Server`; `sdk-next` composes `Client + Core + Server`.

```mermaid
graph TD
    schema[@shob/schema] --> protocol[@shob/protocol]
    schema --> llm[@shob/llm]
    schema --> core[@shob/core]
    llm --> core
    plugin[@shob/plugin] --> sdk[@shob/sdk]
    core --> server[@shob/server]
    protocol --> server
    core --> shob[shob]
    server --> shob
    sdk --> shob
    plugin --> shob
    llm --> shob
    core --> app[@shob/app]
    sdk --> app
    sessionui[@shob/session-ui] --> app
    ui[@shob/ui] --> app
    ui --> sessionui
    shob --> desktop[@shob/desktop]
    app --> desktop
    effectdrizzle[@shob/effect-drizzle-sqlite] --> core
    effectsqlite[@shob/effect-sqlite-node] --> effectdrizzle
    httprecorder[@shob/http-recorder] -.devDep.-> shob
    script[@shob/script] -.buildDep.-> shob
```

Leaf packages (`ui`, `effect-drizzle-sqlite`, `effect-sqlite-node`, `http-recorder`, `script`) have **zero** `@shob/*` dependencies.

---

## 2. Backend Core

### `@shob/core` — [packages/core](file:///c:/Users/sera/Desktop/shobcoder/packages/core)
The **runtime domain core**. Owns durable services, the V2 session engine, config, agents, plugins, locations, tools, permissions, filesystems, and host integrations (PTY, git, npm, OAuth, image, share). It is the package that actually *runs* sessions: `SessionV2.prompt(...)` admits a durable `session_input` row and wakes `SessionExecution`.

**Key files** (all under `packages/core/src`):
- `agent.ts` — `AgentV2` (agent registry / selection).
- `config.ts` — `Config`; loads `shob.json`/`shob.jsonc` up the directory tree, migrates V1. Sub-configs live in `config/` (`agent.ts`, `provider.ts`, `plugin.ts`, `command.ts`, `compaction.ts`, `mcp.ts`, …), each self-exported via `export * as ConfigXxx from "./config/xxx"`.
- `location.ts` — `Location` (`Info`, `Ref`, bound/unbound nodes).
- `session.ts` — `SessionV2` (central session service: `list`/`create`/`get`/`messages`/`prompt`/`compact`/`interrupt`/`revert`/`wait`).
- `plugin.ts` — `PluginV2` (`add`/`remove`/`wait`).
- `model.ts` / `provider.ts` / `project.ts` / `workspace.ts` — `ModelV2`, `ProviderV2`, `ProjectV2`, `WorkspaceV2`.
- `system-context/` — the System Context algebra (refreshable `Source<A>` producers → opaque `SystemContext`, durable `Snapshot`, `Key` branding).
- `session/` — V2 session internals: `runner/` (`SessionRunner`, `llm.ts`, `model.ts`, `to-llm-message.ts`), `execution.ts` (`SessionExecution`, process-global coordinator), `run-coordinator.ts`, `store.ts`, `projector.ts` (emits V1 `session`-shaped events), `input.ts` (`SessionInput.admit`), `message.ts`, `history.ts`, `compaction.ts`, `event.ts`.
- `tool/` — tool registry + built-ins (`bash`, `edit`, `apply-patch`, `read`, `write`, `grep`, `glob`, `skill`, `todowrite`, `question`, `webfetch`, `websearch`).
- `plugin/` — plugin runtime: `host.ts`, `promise.ts`, `internal.ts`, `provider/` (≈40 provider facades: `openai.ts`, `anthropic.ts`, `amazon-bedrock.ts`, `google.ts`, `azure.ts`, `xai.ts`, `kilo.ts`, `cline.ts`, `github-copilot.ts`, `antigravity.ts`, …), `skill/`, `variant.ts`.
- `database/` — Drizzle SQLite (`database.ts` `Database.Service`, `migration/`).
- `effect/` — Effect composition: `layer-node.ts` (`LayerNode`), `app-node.ts` (`makeLocationNode`/`makeGlobalNode`), `app-node-platform.ts` (`httpClient`, `filesystem`).

**Public API**: wildcard `@shob/core/<module>` (e.g. `@shob/core/agent`, `@shob/core/session`, `@shob/core/config`, `@shob/core/location`, `@shob/core/plugin`). Four pinned explicit exports: `@shob/core/effect/layer-node`, `@shob/core/effect/app-node`, `@shob/core/session/runner`, `@shob/core/system-context`.

**Consumed by**: `shob` (broadest), `server`, `app` (service facades + `util/*`), and their tests.

### `@shob/llm` — [packages/llm](file:///c:/Users/sera/Desktop/shobcoder/packages/llm)
Effect-Schema-first, **provider/transport-agnostic LLM core**. Builds, lowers, executes, and parses LLM requests into a common event stream. Deliberately independent of session concerns (auth, permissions, plugins live in `shob`/`core`).

**Key files** (under `packages/llm/src`):
- `index.ts` — barrel: `LLM`, `LLMClient`, `Auth`, `Provider`, `isContextOverflow`.
- `llm.ts` — request constructors (`LLM.request`/`generate`/`stream`/`generateObject`).
- `schema/` — canonical runtime model: `ids.ts` (branded `ModelID`/`ProviderID`), `options.ts`, `messages.ts`, `events.ts`, `errors.ts`.
- `route/` — the "four-axis" route system: `client.ts`, `protocol.ts`, `endpoint.ts`, `auth.ts`, `framing.ts`, `executor.ts`, `transport/` (`http.ts`, `websocket.ts`).
- `protocols/` — provider-native protocols: `openai-chat.ts`, `openai-responses.ts`, `anthropic-messages.ts`, `gemini.ts`, `bedrock-converse.ts`, `openai-compatible-chat.ts`.
- `providers/` — configured provider facades: `OpenAI`, `Anthropic`, `Azure`, `AmazonBedrock`, `Google`, `XAI`, `OpenRouter`, `Cloudflare`, `GitHubCopilot`, `OpenAICompatible`.
- `tool.ts`, `tool-runtime.ts`, `provider.ts`, `cache-policy.ts`.

**Public API**: `@shob/llm`, `@shob/llm/route`, `@shob/llm/provider`, `@shob/llm/providers`, `@shob/llm/protocols`.

**Consumed by**: `core` (`session/runner/*`, `tool/*`, `compaction.ts`), `shob` (`session/llm.ts`, `llm/*`, `processor.ts`).

### `@shob/schema` — [packages/schema](file:///c:/Users/sera/Desktop/shobcoder/packages/schema)
The **lowest layer**. Browser-safe Effect-Schema wire + storage contracts shared by protocol, server, core, and generated SDKs. No service layers or side effects. Only depends on `effect`. Current contracts live at root (`Session`, `Permission`, …); legacy compatibility contracts use a `V1` suffix (`SessionV1`, `PermissionV1`).

**Key files** (under `packages/schema/src`):
- `index.ts` — barrel re-exporting namespaces: `Agent`, `Command`, `Connection`, `Credential`, `Event`, `FileSystem`, `Integration`, `LLM`, `Location`, `Model`, `Permission`, `Project`, `Provider`, `Reference`, `Session`, `SessionInput`, `SessionMessage`, `Skill`, `Pty`, `Question`, `Workspace`, `Prompt`/`Source`/`FileAttachment`, …
- `schema.ts` — shared primitives (`PositiveInt`, `NonNegativeInt`, `RelativePath`, `AbsolutePath`, `optional`, `statics`, `DateTimeUtcFromMillis`).
- Domain modules: `agent.ts`, `model.ts`, `provider.ts`, `location.ts`, `project.ts`, `command.ts`, `credential.ts`, `connection.ts`, `reference.ts`, `skill.ts`, `permission.ts`, `permission-saved.ts`, `prompt.ts`, `question.ts`, `pty.ts`, `revert.ts`.
- Event manifests: `event.ts`, `event-manifest.ts`, `durable-event-manifest.ts`, `legacy-event.ts`, `server-event.ts`, `tui-event.ts`, `ide-event.ts`, `lsp-event.ts`, `mcp-event.ts`, `vcs-event.ts`, `workspace-event.ts`, `session-event.ts`.
- Session/LLM wire: `session.ts`, `session-input.ts`, `session-message.ts`, `session-delivery.ts`, `llm.ts`.

**Public API**: `@shob/schema` (barrel) and `@shob/schema/<module>` (e.g. `@shob/schema/agent`, `@shob/schema/session`, `@shob/schema/event`).

**Consumed by**: `protocol`, `server`, `llm`, `core`, `shob`, and generated SDKs.

### `@shob/protocol` — [packages/protocol](file:///c:/Users/sera/Desktop/shobcoder/packages/protocol)
The **HTTP API contract** layer, built on `effect/unstable/httpapi`. Defines `HttpApiGroup`s, shared middleware, and error types. It is a pure transport contract — consumed only by the server tier, never by `core`/`llm`.

**Key files** (under `packages/protocol/src`):
- `api.ts` — `makeApi(...)` / `makeDefaultApi(...)`: composes all groups (Health, Location, Agent, Session, Message, Model, Provider, Integration, Credential, Permission, FileSystem, Command, Skill, Event, Pty, Question, Reference, ProjectCopy) and applies `Authorization` + `SchemaErrorMiddleware`.
- `errors.ts` — tagged HTTP errors: `InvalidRequestError` (400), `UnauthorizedError` (401), `ConflictError` (409), `SessionNotFoundError`, `ProviderNotFoundError`, `PtyNotFoundError`, `QuestionNotFoundError`, `ForbiddenError`, `ProjectCopyError`, …
- `groups/` — one module per domain (`agent.ts`, `session.ts`, `message.ts`, `model.ts`, `provider.ts`, `integration.ts`, `credential.ts`, `permission.ts`, `fs.ts`, `command.ts`, `skill.ts`, `event.ts`, `pty.ts`, `question.ts`, `reference.ts`, `location.ts`, `project-copy.ts`, `health.ts`).
- `middleware/` — `authorization.ts` (`Authorization`), `schema-error.ts` (`SchemaErrorMiddleware`).

**Public API**: `@shob/protocol/api`, `@shob/protocol/errors`, `@shob/protocol/middleware/authorization`, `@shob/protocol/middleware/schema-error`, `@shob/protocol/groups/<domain>`.

**Consumed by**: `server`, `shob`.

---

## 3. Server & SDK

### `@shob/server` — [packages/server](file:///c:/Users/sera/Desktop/shobcoder/packages/server)
The **HTTP API server assembly**. Wires the generated `HttpApi` (`@shob/protocol`) into a runnable Effect layer by composing all handler groups with middleware and core service layers. `private: true`.

**Key files** (under `packages/server/src`):
- `api.ts` — `makeDefaultApi` from `@shob/protocol/api`, wiring `LocationMiddleware` + `SessionLocationMiddleware`. Exports `Api`.
- `routes.ts` — builds the runnable `HttpApiBuilder.layer(Api, …)`, stacks all layers (`handlers`, `locationLayer`, `sessionLocationLayer`, `authorizationLayer`, `schemaErrorLayer`, `auth`, core `serviceLayer`), exports `createRoutes` / `createEmbeddedRoutes` / `routes` / `webHandler`.
- `handlers.ts` — `Layer.mergeAll(...)` of every handler module.
- `handlers/*.ts` — one `HttpApiGroup` implementation per domain (`agent.ts`, `session.ts`, `message.ts`, `model.ts`, `provider.ts`, `integration.ts`, `credential.ts`, `permission.ts`, `fs.ts`, `command.ts`, `skill.ts`, `event.ts`, `pty.ts`, `question.ts`, `reference.ts`, `location.ts`, `project-copy.ts`, `health.ts`).
- `auth.ts` — `ServerAuth` (Basic-auth via `SHOB_SERVER_USERNAME`/`SHOB_SERVER_PASSWORD`).
- `cors.ts` — `CorsOptions` / `CorsConfig` / `isAllowedCorsOrigin` / `isAllowedRequestOrigin`.
- `location.ts` — `LocationMiddleware` (resolves `Location.Ref` from query/`x-shob-*` headers).
- `pty-environment.ts` — `PtyEnvironment` (PTY env resolver).
- `middleware/` — `authorization.ts`, `schema-error.ts`, `session-location.ts`.

**Public API**: `@shob/server/api`, `@shob/server/handlers`, `@shob/server/cors`, `@shob/server/location`, `@shob/server/pty-environment`, `@shob/server/middleware/*`.

**Consumed by**: `shob` (sole consumer — `src/server/routes/instance/httpapi/*`).

### `@shob/sdk` — [packages/sdk/js](file:///c:/Users/sera/Desktop/shobcoder/packages/sdk/js)
The **typed HTTP client + server launcher SDK**. Provides a generated `OpencodeClient` and `createOpencodeServer` (spawns the `shob serve` process), plus a combined `createOpencode()`. V1 (`@shob/sdk`) and V2 (`@shob/sdk/v2`, generated from `openapi.json` via `@hey-api/openapi-ts`).

**Key files** (under `packages/sdk/js`):
- `src/index.ts` — re-exports `client` + `server`; `createOpencode()`.
- `src/client.ts` — legacy V1 client (`createOpencodeClient`, `OpencodeClient`).
- `src/server.ts` — legacy V1 server launcher (`createOpencodeServer`, `createOpencodeTui`).
- `src/error-interceptor.ts`, `src/process.ts`.
- `src/v2/index.ts`, `src/v2/client.ts` (rewrites `x-shob-directory`/`x-shob-workspace` headers, rejects `text/html`), `src/v2/server.ts`, `src/v2/data.ts` (`message.user(...)`).
- `src/v2/gen/` — **generated, do not edit** (`types.gen.ts` ~13.6k lines of wire types, `sdk.gen.ts` client, `client/`, `core/`).

**Public API**: `@shob/sdk`, `@shob/sdk/client`, `@shob/sdk/server`, `@shob/sdk/v2`, `@shob/sdk/v2/client`, `@shob/sdk/v2/server`, `@shob/sdk/v2/types`.

**Consumed by**: `plugin` (types only, via `@shob/sdk/v2/types`), `app` (heaviest), `shob`, `core`, `session-ui`.

> **Regeneration**: After changing the public `Protocol` or Server `HttpApi`, run `bun run generate` from `packages/client` (you should NOT edit `src/v2/gen/**` directly). See `AGENTS.md`.

### `@shob/plugin` — [packages/plugin](file:///c:/Users/sera/Desktop/shobcoder/packages/plugin)
The **plugin authoring SDK**. Defines the type contracts and `define()` helpers that V1 (callback-hook) and V2 plugins use to register capabilities (agents, catalogs, commands, skills, integrations, references, tools, AI-SDK models). Ships two parallel flavors: an **Effect** domain (`/v2/effect`, plugin `effect` returns `Effect.Effect`) and a **Promise** domain (`/v2/promise`, plugin `setup` returns `Promise<void>`).

**Key files** (under `packages/plugin/src`):
- `index.ts` — legacy V1 plugin API: `Plugin`, `PluginInput`, `PluginOptions`, `Config`, `Hooks` (lifecycle hooks: `event`, `config`, `tool`, `auth`, `provider`, `chat.message`, `permission.ask`, `command.execute.before`, `tool.execute.before/after`, `shell.env`, `experimental.*`).
- `tool.ts` — `tool()` factory, `ToolContext`, `ToolDefinition` (Zod schemas).
- `tui.ts` — TUI plugin surface (`TuiPlugin`, `TuiPluginApi`, UI types).
- `shell.ts` — `BunShell` scripting surface.
- `example.ts`, `example-workspace.ts` — reference plugin implementations.
- `v2/effect/` — Effect domain: `plugin.ts` (`Plugin`/`define`/`PluginDomain`), `context.ts` (`PluginContext`), `registration.ts` (`Registration`/`Reload`/`Hooks`), plus one draft module per capability: `agent.ts`, `catalog.ts`, `command.ts`, `skill.ts`, `reference.ts`, `integration.ts`, `aisdk.ts`, `event.ts`, `filesystem.ts`, `location.ts`, `npm.ts`, `path.ts`.
- `v2/promise/` — Promise mirror of the above (`plugin.ts` with `setup`, plus `agent/catalog/command/skill/reference/integration/aisdk.ts`).
- `v2/options.ts` — `PluginOptions`.

**Public API**: `@shob/plugin`, `@shob/plugin/tool`, `@shob/plugin/tui`, `@shob/plugin/v2/effect`, `@shob/plugin/v2/effect/plugin`, `@shob/plugin/v2/effect/integration`, `@shob/plugin/v2/promise`.

**Consumed by**: `core` (host/consumer — `config/plugin/external.ts`, `plugin.ts`, `plugin/promise.ts`, `plugin/host.ts`, `plugin/provider/*`), `shob` (built-in provider/integration plugins: `src/plugin/index.ts`, `provider/auth.ts`, `xai.ts`, `azure.ts`, `kilo.ts`, `cline.ts`, `github-copilot/*`, `antigravity.ts`, …).

### `shob` — [packages/shob](file:///c:/Users/sera/Desktop/shobcoder/packages/shob)
The **main backend server binary**. Houses the HTTP server (`Server.listen`), durable session/agent orchestration, provider/LLM integrations, MCP, plugins, config, and domain logic. Not installed as a global bin; built from `src/node.ts` via `bun run script/build-node.ts` → `dist/node`. In the desktop app it is launched through `virtual:shob-server` (a bundled `shob` build).

**Key files** (under `packages/shob/src`):
- `node.ts` — build entry; re-exports `Config`, `Server`, `bootstrap`, `Database`.
- `server/server.ts` — `Server.listen(opts)` (backs the `serve` command), built on `effect/unstable/http` + `@effect/platform-node`.
- `bootstrap.ts` — per-project `InstanceRuntime` bootstrap.
- `config/config.ts`, `command/index.ts`, `project/instance-runtime.ts`.
- `server/routes/instance/httpapi/*` — wires `@shob/server` (`api.ts`, `server.ts`, `middleware/authorization.ts`, `handlers/pty.ts`).
- `plugin/*` — built-in provider/integration plugins (`index.ts`, `tool/registry.ts`, `provider/auth.ts`, `xai.ts`, `azure.ts`, `kilo.ts`, `cline.ts`, `antigravity.ts`, `github-copilot/copilot.ts`, `openai/codex.ts`, …).
- `session/llm.ts`, `llm/native-request.ts`, `llm/native-runtime.ts`, `llm/ai-sdk.ts` — decide AI-SDK vs native route runtime, bridging to `@shob/llm`.
- `acp/*` — agent client protocol.

**Consumed by**: `desktop` (via `virtual:shob-server`), `app` (indirectly, through `@shob/sdk` over HTTP). Does **not** import `ui`/`session-ui`/`app`/`desktop`.

---

## 4. Frontend & Desktop

### `@shob/ui` — [packages/ui](file:///c:/Users/sera/Desktop/shobcoder/packages/ui)
General-purpose **SolidJS design-system library**: buttons, dialogs, diffs, markdown primitives, theming, icon sprites, hooks, i18n. A leaf package — **zero** `@shob/*` imports. Shared by `app` and `session-ui`. See [ui-path-introduction.md](file:///c:/Users/sera/Desktop/shobcoder/docs/ui-path-introduction.md) for the V1/V2 component map.

**Key files**: `src/components/*.tsx` (per-component exports), `src/context/` (`I18nProvider`, `DialogProvider`, `FileComponentProvider`, `MarkedProvider`, `ThemeProvider`), `src/hooks/`, `src/theme/`, `src/styles/` (`index.css`, `tailwind/`, `colors.css`, `theme.css`), `src/v2/components/*.tsx` + `src/v2/styles/`.

### `@shob/session-ui` — [packages/session-ui](file:///c:/Users/sera/Desktop/shobcoder/packages/session-ui)
The **session/message rendering layer**. Builds on `@shob/ui` + `@shob/sdk` to render message parts, streaming markdown (Web Worker + Shiki), file diffs, line comments, and the "pierre" diff viewer.

**Key files** (under `packages/session-ui/src`):
- `components/markdown.tsx`, `markdown-stream.ts`, `markdown-worker*.ts` — streaming markdown.
- `components/message-part.tsx`, `message-part-text.ts`, `message-file.ts`, `file.tsx` — message content.
- `components/apply-patch-file.ts`, `line-comment.tsx`, `session-diff.ts`, `basic-tool.tsx`, `dock-prompt.tsx`, `message-nav.tsx`.
- `pierre/index.ts` — the pierre diff viewer subsystem.
- `context/index.ts` — Solid context providers.
- `v2/components/*.tsx` — V2 session UI (`session-review-v2.tsx`, `basic-tool-v2.tsx`, `tool-error-card-v2.tsx`, …).

**Consumed by**: `app`.

### `@shob/app` — [packages/app](file:///c:/Users/sera/Desktop/shobcoder/packages/app)
The **web frontend (SolidJS SPA)**. Renders session/timeline UI, settings, directory layouts; talks to the backend entirely through `@shob/sdk/v2`. Runs in the browser and as the desktop renderer.

**Key files** (under `packages/app/src`):
- `index.ts` — public barrel (`AppBaseProviders`, `AppInterface`, `ServerConnection`, …).
- `app.tsx` — root: `AppInterface`/`AppBaseProviders`, wires all context providers + router (`/`, `/settings`, `/server/:serverKey/session/:id`, `/new-session`). See routing detail in [ui-path-introduction.md](file:///c:/Users/sera/Desktop/shobcoder/docs/ui-path-introduction.md).
- `entry.tsx` — HTML mount point (Platform, Sentry, backend connection).
- `pages/` — `home.tsx`, `session.tsx`, `layout-new.tsx` (V2 default), `layout.tsx` (legacy), `session/{composer,timeline,v2}/*`.
- `components/settings-v2/` — V2 settings pages.
- `context/` — command, comments, file, server, server-sync, global, highlights, language, layout, models, notification, permission, platform, prompt, server, settings, tabs, sdk, wsl.

**Consumed by**: `desktop` (renderer).

### `@shob/desktop` — [packages/desktop](file:///c:/Users/sera/Desktop/shobcoder/packages/desktop)
The **Electron desktop shell**. Owns the native main process (windows, IPC, auto-updater, deep links, WSL sidecar, browser control) and spawns the `shob` backend as a sidecar. Renderer UI is `@shob/app`.

**Key files** (under `packages/desktop/src`):
- `main/index.ts` — Electron main entry (`app.whenReady()`, IPC, deep links, updater, WSL, `spawnLocalServer`).
- `preload/index.ts` — `contextBridge` → `window.api` (the only IPC surface the renderer may use).
- `main/server.ts` — `spawnLocalServer(...)` forks the sidecar.
- `main/sidecar.ts` — utility-process entry: `await import("virtual:shob-server")` then `Server.listen(...)`.
- `main/{windows,menu,updater,wsl,store,migrate,logging,browser-control}.ts`.

**Consumes**: `@shob/app` (renderer), `@shob/ui`, and the bundled `shob` backend via `virtual:shob-server`.

---

## 5. Supporting (Generic) Packages

These are leaf/internal utilities with **no** `@shob/*` dependencies.

- **`@shob/effect-drizzle-sqlite`** — [packages/effect-drizzle-sqlite](file:///c:/Users/sera/Desktop/shobcoder/packages/effect-drizzle-sqlite): generic Drizzle + Effect + SQLite adapter (`make`/`makeWithDefaults`, `effect-sqlite/session.ts`, `effect-sqlite/migrator.ts`, `sqlite-core/effect/*` query builders). Used by `core`'s storage layer.
- **`@shob/effect-sqlite-node`** — [packages/effect-sqlite-node](file:///c:/Users/sera/Desktop/shobcoder/packages/effect-sqlite-node): thin Effect `SqlClient` over Node's `node:sqlite` (`make`/`layer`, WAL, single-connection semaphored execution). The concrete driver under `effect-drizzle-sqlite`.
- **`@shob/http-recorder`** — [packages/http-recorder](file:///c:/Users/sera/Desktop/shobcoder/packages/http-recorder): VCR-style record/replay of Effect HTTP + WebSocket traffic with deterministic cassettes, request matching, and redaction. Dev/test dependency of `shob`.
- **`@shob/script`** — [packages/script](file:///c:/Users/sera/Desktop/shobcoder/packages/script): shared build/release script library. Computes channel/version/preview/release flags and team list from git + root `package.json`. Imported by `shob`'s `build-node.ts`.

---

## 6. Quick "Which file for what" Index

| I want to… | Look here |
|---|---|
| Understand the HTTP API surface | `packages/protocol/src/api.ts`, `packages/protocol/src/groups/*` |
| Implement an API endpoint | `packages/server/src/handlers/<domain>.ts` |
| Run the server / `serve` command | `packages/shob/src/server/server.ts` (`Server.listen`) |
| Talk to the backend from code | `@shob/sdk/v2/client` (`createOpencodeClient`) |
| Author a plugin (Effect style) | `packages/plugin/src/v2/effect/*` (`define`) |
| Author a plugin (Promise style) | `packages/plugin/src/v2/promise/*` (`define`) |
| Register an LLM provider plugin | `packages/shob/src/plugin/provider/*` + `packages/core/src/plugin/provider/*` |
| Change a wire/storage contract | `packages/schema/src/<domain>.ts` (then regenerate SDK) |
| Run a session turn | `packages/core/src/session/runner/*`, `packages/core/src/session/execution.ts` |
| Change the LLM request/response model | `packages/llm/src/schema/*`, `packages/llm/src/protocols/*` |
| Build the web UI | `packages/app/src/app.tsx`, `packages/app/src/pages/*` |
| Build a design-system component | `packages/ui/src/components/*.tsx` / `packages/ui/src/v2/components/*.tsx` |
| Render a message/diff | `packages/session-ui/src/components/*` |
| Wire the desktop shell | `packages/desktop/src/main/*` |
| Persist data (Drizzle/SQLite) | `packages/effect-drizzle-sqlite`, `packages/effect-sqlite-node`, `packages/core/src/database` |
