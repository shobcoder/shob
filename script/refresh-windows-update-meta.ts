/**
 * After re-signing a Windows NSIS installer outside electron-builder, refresh
 * latest.yml sha512/size and regenerate the .blockmap when app-builder is available.
 *
 * Usage: bun script/refresh-windows-update-meta.ts <installer.exe> [latest.yml]
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync, writeFileSync, unlinkSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const installerPath = process.argv[2]
if (!installerPath) {
  console.error("Usage: bun script/refresh-windows-update-meta.ts <installer.exe> [latest.yml]")
  process.exit(1)
}

const installer = resolve(installerPath)
if (!existsSync(installer)) {
  console.error(`Installer not found: ${installer}`)
  process.exit(1)
}

const latestYmlPath = resolve(process.argv[3] ?? join(dirname(installer), "latest.yml"))
const blockmapPath = `${installer}.blockmap`

const fileBuffer = readFileSync(installer)
const sha512 = createHash("sha512").update(fileBuffer).digest("base64")
const size = statSync(installer).size
const fileName = installer.split(/[\\/]/).pop()!

if (existsSync(latestYmlPath)) {
  const original = readFileSync(latestYmlPath, "utf8")
  const updated = original
    .replace(/^(\s*sha512:\s*).+$/gm, `$1${sha512}`)
    .replace(/^(\s*size:\s*).+$/gm, `$1${size}`)

  if (updated === original) {
    console.warn(`No sha512/size fields updated in ${latestYmlPath}`)
  } else {
    writeFileSync(latestYmlPath, updated)
    console.log(`Updated ${latestYmlPath} for ${fileName} (size=${size})`)
  }
} else {
  console.warn(`latest.yml not found at ${latestYmlPath}; skipping yml refresh`)
}

if (existsSync(blockmapPath)) {
  unlinkSync(blockmapPath)
  console.log(`Removed stale blockmap ${blockmapPath}`)
}

const appBuilderCandidates = [
  join(process.cwd(), "node_modules", ".bin", "app-builder"),
  join(process.cwd(), "node_modules", ".bin", "app-builder.cmd"),
  join(process.cwd(), "packages", "desktop", "node_modules", ".bin", "app-builder"),
  join(process.cwd(), "packages", "desktop", "node_modules", ".bin", "app-builder.cmd"),
]

const appBuilder = appBuilderCandidates.find((candidate) => existsSync(candidate))
if (!appBuilder) {
  console.warn("app-builder not found; differential blockmap will not be regenerated (full updates still work)")
  process.exit(0)
}

const result = spawnSync(appBuilder, ["blockmap", "--input", installer], {
  encoding: "utf8",
  shell: process.platform === "win32",
})

if (result.status !== 0) {
  console.warn(`app-builder blockmap failed (exit ${result.status}): ${result.stderr || result.stdout}`)
  process.exit(0)
}

console.log(`Regenerated blockmap for ${fileName}`)
