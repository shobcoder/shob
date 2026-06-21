import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { builtinModules } from "node:module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const serverDir = path.join(rootDir, "packages", "server")
const migrationDir = path.join(serverDir, "migration")

const ENTRY = path.join(serverDir, "src", "node.ts")
const OUTDIR = path.join(rootDir, "dist-server")
const OUT_ENTRY = path.join(OUTDIR, "node.js")

// Packages that genuinely CANNOT be bundled (native .node/.dll binaries or other
// non-statically-analyzable code) and must therefore be shipped on disk next to
// node.js. Every entry here is:
//   1. left external in the Bun build (kept as a bare `import`), AND
//   2. copied into dist-server/node_modules/<pkg> so the bare import resolves, AND
//   3. allow-listed by the post-build verifier below.
// Anything NOT in this list MUST end up fully bundled.
const EXTERNAL_PACKAGES = []

// Packages we force-resolve to their ESM build (the `module` field) instead of
// the default `main`. With target:"node" Bun prefers `main`, but some pure-JS
// packages ship a UMD `main` that does dynamic `require("./impl/...")` internally
// — Bun leaves those as runtime requires that don't exist next to node.js, so the
// packaged app crashes with e.g. "Cannot find module './impl/format'". The ESM
// build uses static imports, so it inlines cleanly with nothing left to ship.
// jsonc-parser is the known case (its umd/main.js is a UMD wrapper).
const PREFER_ESM_PACKAGES = ["jsonc-parser"]

// Resolve PREFER_ESM_PACKAGES bare imports to the file named by their `module`
// field so Bun bundles the static-import ESM variant rather than the UMD `main`.
const preferEsmPlugin = {
  name: "prefer-esm",
  async setup(build) {
    for (const pkg of PREFER_ESM_PACKAGES) {
      const pkgDir = path.join(rootDir, "node_modules", pkg)
      const meta = JSON.parse(await fs.readFile(path.join(pkgDir, "package.json"), "utf8"))
      if (!meta.module) {
        fail(`"${pkg}" is in PREFER_ESM_PACKAGES but has no "module" field in package.json`)
      }
      const esmEntry = path.join(pkgDir, meta.module)
      const filter = new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
      build.onResolve({ filter }, () => ({ path: esmEntry }))
    }
  },
}

const log = (msg) => console.log(`[sidecar] ${msg}`)
const fail = (msg, detail) => {
  console.error(`\n[sidecar] ✖ ${msg}`)
  if (detail) console.error(detail)
  console.error("")
  process.exit(1)
}

function timestampFromName(name) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
  if (!match) return 0
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

async function loadMigrations() {
  let entries
  try {
    entries = await fs.readdir(migrationDir, { withFileTypes: true })
  } catch (err) {
    fail(`could not read migration directory: ${migrationDir}`, String(err))
  }

  const dirs = entries
    .filter((entry) => entry.isDirectory() && /^\d{14}/.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  const migrations = await Promise.all(
    dirs.map(async (name) => {
      const sqlPath = path.join(migrationDir, name, "migration.sql")
      const sql = await fs.readFile(sqlPath, "utf8").catch((err) =>
        fail(`migration ${name} is missing migration.sql`, String(err)),
      )
      if (!sql.trim()) fail(`migration ${name} has an empty migration.sql`)
      return { name, timestamp: timestampFromName(name), sql }
    }),
  )

  if (migrations.length === 0) {
    fail("no migrations found — the packaged app would start with an empty schema")
  }
  return migrations
}

function packageRootOf(spec) {
  const parts = spec.split("/")
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

function isBuiltin(spec) {
  const name = spec.startsWith("node:") ? spec.slice(5) : spec
  return spec.startsWith("node:") || builtinModules.includes(name)
}

function isRelative(spec) {
  return spec.startsWith(".") || spec.startsWith("/") || path.isAbsolute(spec)
}

// Pull every *static* (eager) module specifier out of the bundle: these are the
// imports/re-exports evaluated the instant node.js loads, so an unshipped one is
// a guaranteed startup crash. Dynamic import()/require() are intentionally not
// matched — they are lazy and only fail on a specific code path.
//
// Matching is anchored to the start of a line (Bun emits each static import as
// its own statement on its own line) so we never mistake a `from "..."` buried
// inside a string literal or function body for a real top-level import.
function staticSpecifiers(code) {
  const specs = new Set()
  const patterns = [
    /^\s*import\b[^\n]*?\bfrom\s*["']([^"']+)["']/gm, // import x from "y"
    /^\s*export\b[^\n]*?\bfrom\s*["']([^"']+)["']/gm, // export ... from "y"
    /^\s*import\s*["']([^"']+)["']\s*;?\s*$/gm, // import "y" (side-effect)
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(code))) specs.add(m[1])
  }
  return [...specs]
}

// Catch the jsonc-parser class of bug forever: any eager bare import that is not
// a Node builtin and not an intentionally-shipped external means the packaged
// app will crash on launch. Fail the build now, where it's cheap to fix.
function verifyNoUnshippedImports(code) {
  const allowedExternal = new Set(EXTERNAL_PACKAGES)
  const offenders = staticSpecifiers(code)
    .filter((spec) => !isRelative(spec) && !isBuiltin(spec))
    .filter((spec) => !allowedExternal.has(packageRootOf(spec)))

  if (offenders.length > 0) {
    fail(
      "bundle has eager imports of packages that aren't bundled or shipped:",
      offenders.map((s) => `    • ${s}`).join("\n") +
        "\n\n  Fix by either bundling them (remove from EXTERNAL_PACKAGES) or, for" +
        "\n  true native modules, adding the package to EXTERNAL_PACKAGES so it is" +
        "\n  copied into dist-server/node_modules and shipped.",
    )
  }
}

// Catch the "./impl/format" class of bug: a fully-bundled file should contain NO
// runtime require()/require2()/__require() of a *relative* path — every relative
// dependency must be inlined. A leftover one (typically from a UMD module Bun
// couldn't statically follow) means the packaged app crashes with "Cannot find
// module './...'". If this fires, add the offending package to PREFER_ESM_PACKAGES
// (if it ships an ESM build) or to EXTERNAL_PACKAGES.
function verifyNoUnbundledRequires(code) {
  const re = /\b(?:require\d*|__require)\s*\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g
  const offenders = new Set()
  let m
  while ((m = re.exec(code))) offenders.add(m[1])

  if (offenders.size > 0) {
    fail(
      "bundle has runtime require() of relative paths that weren't inlined:",
      [...offenders].map((s) => `    • ${s}`).join("\n") +
        "\n\n  This usually comes from a UMD package. Add it to PREFER_ESM_PACKAGES" +
        "\n  (if it ships a \"module\"/ESM build) or to EXTERNAL_PACKAGES.",
    )
  }
}

// Verify every asset Bun emitted next to node.js (e.g. the tree-sitter .wasm
// grammars) is present and non-empty, so a truncated or dropped asset is caught
// at build time rather than crashing the packaged app.
async function verifyAssets() {
  const entries = await fs.readdir(OUTDIR, { withFileTypes: true })
  const assets = entries.filter(
    (e) => e.isFile() && e.name !== "node.js" && !e.name.endsWith(".map"),
  )
  for (const asset of assets) {
    const stat = await fs.stat(path.join(OUTDIR, asset.name))
    if (stat.size === 0) fail(`emitted asset is empty: ${asset.name}`)
  }
  return assets.length
}

async function copyExternals() {
  if (EXTERNAL_PACKAGES.length === 0) return
  for (const pkg of EXTERNAL_PACKAGES) {
    const src = path.join(rootDir, "node_modules", pkg)
    const dest = path.join(OUTDIR, "node_modules", pkg)
    const exists = await fs.stat(src).catch(() => null)
    if (!exists) {
      fail(`external package "${pkg}" not found in node_modules — run install first`, src)
    }
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.cp(src, dest, { recursive: true, dereference: true })
    log(`shipped external dependency → node_modules/${pkg}`)
  }
}

async function main() {
  const entryExists = await fs.stat(ENTRY).catch(() => null)
  if (!entryExists) fail(`entrypoint not found: ${ENTRY}`)

  const migrations = await loadMigrations()
  log(`loaded ${migrations.length} migrations`)

  await fs.rm(OUTDIR, { recursive: true, force: true })
  await fs.mkdir(OUTDIR, { recursive: true })

  const result = await Bun.build({
    target: "node",
    entrypoints: [ENTRY],
    outdir: OUTDIR,
    format: "esm",
    sourcemap: "none",
    external: EXTERNAL_PACKAGES,
    plugins: [preferEsmPlugin],
    define: {
      SHOB_MIGRATIONS: JSON.stringify(migrations),
    },
  })

  if (!result.success) {
    for (const message of result.logs) console.error(message)
    fail("Bun.build reported failure")
  }

  await copyExternals()

  // Post-build self-checks: prove the bundle will actually run when packaged.
  const out = await fs.stat(OUT_ENTRY).catch(() => null)
  if (!out || out.size === 0) fail("expected output node.js was not produced or is empty")

  const code = await fs.readFile(OUT_ENTRY, "utf8")
  verifyNoUnshippedImports(code)
  verifyNoUnbundledRequires(code)
  const assetCount = await verifyAssets()

  const kb = (out.size / 1024).toFixed(0)
  log(`bundle ${kb} KB, ${assetCount} asset(s), externals: ${EXTERNAL_PACKAGES.length || "none"}`)
  log(`built server bundle → ${OUTDIR}`)
}

main().catch((err) => fail("unexpected build error", err?.stack || String(err)))
