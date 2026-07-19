# Build & dev flow

## Develop

```bash
bun run dev:desktop     # root script -> bun --cwd packages/desktop dev
```

Inside `packages/desktop`, `dev` runs `electron-vite dev`. The `predev` hook
first:

1. `bun ./scripts/copy-icons.ts` — copies app icons for the dev channel.
2. `cd ../shob && bun script/build-node.ts` — builds the embedded server to
   `packages/shob/dist/node/node.js` (the desktop main process loads this
   via `virtual:shob-server`).

## Build the embedded server — `packages/shob`

`packages/shob/script/build-node.ts` runs `Bun.build` with:

- `target: "node"`, `format: "esm"`, entrypoint `src/node.ts`
- `external: ["jsonc-parser", "@lydell/node-pty"]`
- a `define` block injecting the channel + models snapshot (from `generate.ts`)
- a virtual module resolver that maps `virtual:shob-server` →
  `packages/shob/dist/node/node.js`
- a `writeBundle` hook that copies any `.wasm` assets next to the bundle

Output: `packages/shob/dist/node/node.js` (+ sibling chunks/wasm).

> Only the **server** entry (`src/node.ts`) is built and embedded. The shob
> CLI entry, the TUI, and `src/cli/*` have been removed.

## Build the desktop app — `packages/desktop`

```bash
bun --cwd packages/desktop run build
```

`build` = `electron-vite build`. The `prebuild` hook runs:

1. `scripts/copy-icons.ts <channel>`
2. `scripts/copy-metainfo.ts <channel>`
3. `cd ../shob && bun script/build-node.ts` (rebuilds the embedded server)

Then `electron-vite build` builds three targets (see `electron.vite.config.ts`):

| Target | Input | Notes |
| --- | --- | --- |
| main | `src/main/index.ts`, `src/main/sidecar.ts` | Externalizes the platform `node-pty` binary; resolves `virtual:shob-server` to the shob server dist; copies `.wasm` assets into `out/main/chunks`. |
| preload | `src/preload/index.ts` | Output as CommonJS (`preload/index.js`). |
| renderer | `src/renderer/index.html` | Uses `@shob/app/vite` (the SolidJS app). `publicDir` = `packages/app/public`. Sourcemaps on. |

Optional Sentry source-map upload runs only when `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, `SENTRY_PROJECT` are set.

## Package installers — `packages/desktop`

```bash
bun --cwd packages/desktop run package:win   # or :mac / :linux
```

`package:*` runs `electron-builder --config electron-builder.config.ts` for the
target platform. Config lives in `electron-builder.config.ts`.

## Typecheck

```bash
bun run typecheck   # root -> bun turbo typecheck
```

Each package has its own `typecheck` script (`tsgo -b` or `tsgo --noEmit`).
Run from package directories (e.g. `packages/shob`), never from the repo
root for tests.

## Known environment notes

- `bun install` runs native build scripts for `tree-sitter-powershell` /
  `tree-sitter-bash` (via `node-gyp`), which require Python. If Python is
  unavailable, run `bun install --ignore-scripts` to link all workspace packages
  (the desktop build bundles the shob server dist and does not require
  those native bindings at build time).
- `packages/app/src/custom-elements.d.ts` is a git symlink (mode `120000`) to
  `packages/ui/src/custom-elements.d.ts`. On Windows with git symlinks
  disabled it may appear as a text file containing the target path, which can
  trip `tsgo`. Enabling `core.symlinks` (or checking out with symlink support)
  restores it.
