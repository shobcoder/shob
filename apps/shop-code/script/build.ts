#!/usr/bin/env bun

import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const dir = path.resolve(import.meta.dirname, "..")
const root = path.resolve(dir, "../..")
const server = path.resolve(dir, "../../packages/server")
const pkg = await Bun.file(path.join(dir, "package.json")).json()
const version = String(pkg.version ?? "0.0.0")
const channel = process.env.SHOB_CHANNEL || "local"

process.chdir(dir)
for (let attempt = 0; attempt < 6; attempt++) {
  try {
    await fs.promises.rm("dist", { recursive: true, force: true, maxRetries: 3, retryDelay: 250 })
    break
  } catch (error) {
    if (attempt === 5) throw error
    await Bun.sleep(500)
  }
}
await $`mkdir -p dist/bin`

const migrationRoot = path.join(server, "migration")
const migrationDirs = fs.existsSync(migrationRoot)
  ? (await fs.promises.readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d{14}/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  : []

const migrations = await Promise.all(
  migrationDirs.map(async (name) => {
    const sql = await Bun.file(path.join(migrationRoot, name, "migration.sql")).text()
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
    const timestamp = match
      ? Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6]),
        )
      : 0
    return { sql, timestamp, name }
  }),
)

const localParserWorker = path.resolve(dir, "node_modules/@opentui/core/parser.worker.js")
const rootParserWorker = path.resolve(root, "node_modules/@opentui/core/parser.worker.js")
const parserWorker = fs.realpathSync(fs.existsSync(localParserWorker) ? localParserWorker : rootParserWorker)
const workerPath = path.join(server, "src/cli/cmd/tui/worker.ts")
const outFile = path.join(dir, "dist/bin", process.platform === "win32" ? "shob.exe" : "shob")
const compileTarget =
  `bun-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}` as Bun.Build.CompileTarget

const result = await Bun.build({
  entrypoints: [path.join(server, "src/index.ts"), parserWorker, workerPath],
  tsconfig: path.join(server, "tsconfig.json"),
  plugins: [createSolidTransformPlugin()],
  external: ["node-gyp"],
  conditions: ["browser"],
  compile: {
    autoloadBunfig: false,
    autoloadDotenv: false,
    autoloadTsconfig: true,
    autoloadPackageJson: true,
    target: compileTarget,
    outfile: outFile,
    execArgv: [`--user-agent=shob/${version}`, "--use-system-ca", "--"],
    windows: {},
  },
  define: {
    SHOB_VERSION: JSON.stringify(version),
    SHOB_CHANNEL: JSON.stringify(channel),
    SHOB_MIGRATIONS: JSON.stringify(migrations),
    SHOB_WORKER_PATH: JSON.stringify(workerPath.replaceAll("\\", "/")),
    SHOB_LIBC: process.platform === "linux" ? JSON.stringify(process.env.SHOB_LIBC || "glibc") : "undefined",
    OTUI_TREE_SITTER_WORKER_PATH: JSON.stringify(parserWorker.replaceAll("\\", "/")),
  },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

await $`${outFile} --version`
