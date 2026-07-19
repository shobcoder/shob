# AGENTS.md

Guidance for working in this repository. Read `docs/` (especially
`docs/README.md`, `docs/architecture.md`, `docs/build-flow.md`,
`docs/package-dependencies.md`, `docs/architecture-overview.md`, and
`docs/ui-path-introduction.md`) for the full picture; this file distills the
rules agents must follow.

## Project context

- This repo is a **desktop-only** build. The CLI, TUI, and cloud/SST infra have
  been removed. The only way to run shob is the Electron desktop app, which
  embeds the `shob` server and renders the `@shob/app` SolidJS web app.
- It is a Bun + Turborepo monorepo. Dependencies are wired as `workspace:*`.
- `bun install` runs native build scripts (`tree-sitter-*`, `node-pty`) that
  need Python. If Python is unavailable, use `bun install --ignore-scripts`
  (the desktop build bundles the server dist and does not need those bindings).

### Common commands

- `bun install` — install all workspace packages.
- `bun run dev:desktop` — run the Electron app (`electron-vite dev`). The
  `predev` hook builds the embedded server to `packages/shob/dist/node/node.js`
  via `virtual:shob-server`.
- `bun run typecheck` — `bun turbo typecheck` across packages.
- `bun run lint` — `oxlint` at the repo root.

### Build / generate

- To regenerate the **legacy JavaScript SDK**, run
  `./packages/sdk/js/script/build.ts`.
- After changing the public `Protocol` or Server `HttpApi`, run
  `bun run generate` from `packages/client`. Do not edit `src/generated` or
  `src/generated-effect` directly. The `@shob/sdk` V2 client/types under
  `packages/sdk/js/src/v2/gen/**` are also generated — never edit them by hand.
- The embedded server is built by `packages/shob/script/build-node.ts`
  (`Bun.build`, `target: "node"`, entry `src/node.ts`) into
  `packages/shob/dist/node/node.js`. The desktop main process loads it through
  the `virtual:shob-server` module (declared in `electron.vite.config.ts`).

### Branch & base

- The default branch is `dev`.
- Local `main` ref may not exist; use `dev` or `origin/dev` for diffs.

## Repository layout (quick map)

Runtime dependency direction: `schema ← protocol ← server`, and
`schema/core/protocol ← shob`. Client/renderer code may depend on `schema` and
`sdk` but never `core` or `server` directly; `core`/`server` are reached only
through the embedded shob server over HTTP.

| Package | Path | Role |
| --- | --- | --- |
| `@shob/schema` | `packages/schema` | Lowest layer: Effect-Schema wire/storage contracts. No services. |
| `@shob/llm` | `packages/llm` | Provider/transport-agnostic LLM core (request/route/execute). |
| `@shob/protocol` | `packages/protocol` | HTTP API contract (`HttpApiGroup`s, middleware, errors). |
| `@shob/core` | `packages/core` | Runtime domain core: V2 session engine, config, tools, DB, permissions. |
| `@shob/server` | `packages/server` | HTTP API server assembly wiring protocol → handlers. |
| `shob` | `packages/shob` | Backend server binary; built to `dist/node/node.js`, embedded by desktop. |
| `@shob/sdk` | `packages/sdk/js` | Typed HTTP client + server launcher SDK (generated). |
| `@shob/plugin` | `packages/plugin` | Plugin authoring SDK (Effect + Promise domains, `define()`). |
| `@shob/ui` | `packages/ui` | Leaf: SolidJS design-system primitives. No `@shob/*` deps. |
| `@shob/session-ui` | `packages/session-ui` | Session/message rendering (markdown, diffs, tools). |
| `@shob/app` | `packages/app` | SolidJS SPA renderer; the desktop UI. Talks to backend via `@shob/sdk/v2`. |
| `@shob/desktop` | `packages/desktop` | Electron shell: main, preload, renderer; spawns shob sidecar. |
| `@shob/effect-drizzle-sqlite` | `packages/effect-drizzle-sqlite` | Drizzle + Effect + SQLite adapter. |
| `@shob/effect-sqlite-node` | `packages/effect-sqlite-node` | Node `node:sqlite` Effect `SqlClient`. |
| `@shob/http-recorder` | `packages/http-recorder` | HTTP record/replay for tests (dev dep). |
| `@shob/script` | `packages/script` | Shared build/version helpers. |

"Which file for what" index lives in `docs/architecture-overview.md` §6.

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use
slashes or type prefixes such as `feat/` or `fix/`.

Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes
are optional; use the affected package or area when helpful, e.g. `core`, `shob`,
`tui`, `app`, `desktop`, `sdk`, or `plugin`.

Examples: `fix(tui): simplify thinking toggle styling`, `docs: update contributing guide`, `chore(sdk): regenerate types`.

## Frontend / UI conventions

The frontend is **SolidJS + Tailwind CSS + Kobalte**, spanning `ui`,
`session-ui`, and `app`. The desktop renderer is `@shob/app`.

- **V1/V2 co-location**: the codebase is transitioning V1 (legacy) → V2 (new).
  V2 components live beside V1 with a `-v2` suffix (e.g. `button-v2.tsx`) and are
  imported through the same entrypoints (`@shob/ui`, `@shob/ui/v2`,
  `@shob/session-ui`). Do not duplicate shared primitives — `icon.tsx` is shared
  and imported as `Icon` / `IconV2`.
- **V2 is the default**: `app.tsx` wraps the router in `<NewAppLayout>` and
  forces `data-new-layout` on. The active session route is
  `/server/:serverKey/session/:id`; legacy `/:dir` routes redirect into it. New
  UI work should target V2 components and the V2 layout
  (`packages/app/src/pages/layout-new.tsx`).
- **Package responsibilities**: put atomic/generic components in `@shob/ui`;
  put conversation/transcript/diff/tool rendering in `@shob/session-ui`; put
  pages, layouts, routing, and state providers in `@shob/app`. Keep `ui` a leaf
  package with zero `@shob/*` imports.
- **Styling**: app styles aggregate in `packages/app/src/index.css`
  (`@shob/ui/styles/tailwind`, `@shob/session-ui/styles`,
  `@shob/ui/v2/styles/tailwind.css`, `tw-animate-css`). V1 theme in
  `packages/ui/src/styles`, V2 theme in `packages/ui/src/v2/styles`.
- **Renderer isolation**: the renderer must only call `window.api` (exposed by
  `preload/index.ts`). It never reaches into Node/Electron APIs directly; main
  process IPC handlers live in `packages/desktop/src/main/ipc.ts`.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Do not extract single-use helpers preemptively. Inline the logic at the call
  site unless the helper is reused, hides a genuinely complex boundary, or has a
  clear independent name that improves the caller.
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or
  interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use
  type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the
  file (for example `export * as ConfigAgent from "./agent"`) when adding a new
  config module.
- In Effect generators, bind services to named variables before calling
  methods. Do not use nested service yields such as `yield* (yield* Foo.Service).bar()`.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Imports

- Never alias imports. Do not use `import { foo as bar } from "..."` or renamed
  imports like `resolve as pathResolve`.
- Never use star imports. Do not use `import * as Foo from "..."` or
  `import type * as Foo from "..."`.
- If a namespace-style value is needed, import the module's own exported
  namespace by name, for example
  `import { Project } from "@shob/core/project"`, then reference `Project.ID`.
- Prefer dynamic imports for heavy modules that are only needed in selected code
  paths, especially in startup-sensitive entrypoints. Destructure dynamic
  import bindings near the top of the narrowest scope that needs them so they
  read like normal imports. Avoid inline chains such as
  `await import("./module").then((mod) => mod.value())` or
  `(await import("./module")).value()`. Keep branch-specific imports inside the
  branch that needs them to preserve lazy loading.

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the
main function read as the happy path and move supporting details into small
helpers below it.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Keep helpers close to the code they support, below the main export when that
  improves readability.
- Do not over-abstract simple expressions into many single-use helpers; extract
  only when it names a real concept like `requireConfig` or `readMetadata`.
- Do not return `Effect` from helpers unless they actually perform effectful
  work. Synchronous parsing, validation, and option building should stay
  synchronous.
- Prefer Effect schema helpers such as `Schema.UnknownFromJsonString` and
  `Schema.decodeUnknownOption` over manual `JSON.parse` wrapped in `Effect.try`
  when parsing untrusted JSON strings.
- Add comments for non-obvious constraints and surprising behavior, not for
  obvious assignments or control flow.

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible, you shouldn't be using `globalThis.*` at all
  unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run
  from package dirs like `packages/shob` (e.g. `bun --cwd packages/shob test`).

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/shob`),
  never `tsc` directly. From the repo root use `bun run typecheck`
  (`bun turbo typecheck`).
- Note: `packages/app/src/custom-elements.d.ts` is a git symlink to
  `packages/ui/src/custom-elements.d.ts`; on Windows without symlink support it
  may appear as a text file and trip `tsgo`. Enabling `core.symlinks` restores
  it.

## V2 Session Core

- Keep durable prompt admission separate from model execution.
  `SessionV2.prompt(...)` admits one durable `session_input` row before
  scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false`
  requests admit-only behavior. The serialized runner promotes admitted inputs
  into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID
  reconciles an exact retry only when Session, prompt, and delivery mode match;
  conflicting reuse fails. Historical projected prompts lazily synthesize
  promoted inbox records during exact retry.
- Keep `SessionExecution` process-global and Session-ID based. Its local
  implementation owns the process-local Session coordinator and discovers
  placement through `SessionStore` plus `LocationServiceMap.get(session.location)`
  only when a drain starts; no layer should take a Session ID. V2 interruption
  targets the active process-local ownership chain for that Session; idle or
  missing interruption is a no-op.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and
  filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local
  placement; explicit workspace identity remains reserved for future placement
  semantics.
- Preserve one explicit `llm.stream(request)` call per provider turn and reload
  projected history before durable continuation. Do not bridge through legacy
  `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop.
- Keep local Session drains process-local until clustering is implemented.
  `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt
  wakeups, and allows different Sessions to run concurrently. Advisory wakes
  drain eligible durable inbox rows only; post-crash continuation recovery
  requires a separate explicit design before it may retry provider work. A drain
  has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the
  next safe provider-turn boundary while the current drain requires continuation.
  An explicit `queue` input remains pending until the Session would otherwise
  become idle; promote one queued input at that boundary, then reevaluate
  continuation before promoting another. Promoting any new user input resets the
  selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution
  ownership.
- Keep the System Context algebra, registry, and built-ins in
  `src/system-context`; keep Context Source producers with their observed
  domains, and keep Session History selection plus Context Epoch persistence
  Session-owned.
