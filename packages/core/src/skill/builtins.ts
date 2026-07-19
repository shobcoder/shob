export * as BuiltinSkills from "./builtins"

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

/**
 * Resolve the packaged / dev built-in skills root (repo `skills/`).
 * Mirrors desktop packaging: resources/skills in production, repo skills/ in dev.
 */
export function directory() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const env = process.env.SHOB_SKILLS_DIR
  // Electron sets process.resourcesPath; Node does not.
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const resources =
    typeof resourcesPath === "string" && resourcesPath.length > 0 ? path.join(resourcesPath, "skills") : undefined

  const candidates = [
    env,
    path.join(process.cwd(), "skills"),
    // packages/core/src/skill → repo root skills/
    path.resolve(here, "../../../../skills"),
    // when cwd is packages/desktop during electron-vite
    path.resolve(process.cwd(), "../../skills"),
    path.resolve(process.cwd(), "../skills"),
    resources,
  ].filter((value): value is string => typeof value === "string" && value.length > 0)

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) return path.resolve(candidate)
    } catch {
      // try next
    }
  }

  return path.resolve(candidates[0] ?? path.join(process.cwd(), "skills"))
}
