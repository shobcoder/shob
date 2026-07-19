import { app } from "electron"
import fs from "node:fs/promises"
import fsSync from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type SkillStoreItem = {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  installed: boolean
  managed: boolean
  location: string | null
}

const SHOB_SKILL_STORE_MARKER_FILE = ".shob-skill-store.json"
const SHOB_SKILL_STORE_SOURCE = "shob/builtin-skills"

function skillStoreRoot() {
  return path.join(os.homedir(), ".shob", "skills")
}

function displayNameFromSkillName(value: string) {
  return (
    value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || value
  )
}

function normalizeSkillDescription(value?: string | null) {
  return value?.replace(/\s+/g, " ").replace(/\.$/, "").trim() || "Built-in Shob skill"
}

function cleanFrontMatterValue(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
  }
  return trimmed
}

function parseSkillFrontMatter(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const result: { name?: string; description?: string } = {}
  if (!match) return result

  const lines = match[1].split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const block = lines[index].match(/^([A-Za-z0-9_-]+):\s*[>|]\s*$/)
    if (block) {
      const key = block[1]
      const chunks: string[] = []
      while (index + 1 < lines.length && (/^\s+/.test(lines[index + 1]) || lines[index + 1].trim() === "")) {
        index += 1
        const value = lines[index].trim()
        if (value) chunks.push(value)
      }
      if (key === "name") result.name = chunks.join(" ")
      if (key === "description") result.description = chunks.join(" ")
      continue
    }

    const field = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!field) continue
    const [, key, value] = field
    if (key === "name") result.name = cleanFrontMatterValue(value)
    if (key === "description") result.description = cleanFrontMatterValue(value)
  }

  return result
}

function builtInSkillRootCandidates() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const resourcesPath = process.resourcesPath || (app.isPackaged ? path.join(process.cwd(), "resources") : null)
  const packagedRoot = resourcesPath ? path.join(resourcesPath, "skills") : null
  const devRoots = [
    path.join(process.cwd(), "skills"),
    path.resolve(process.cwd(), "../../skills"),
    path.resolve(process.cwd(), "../skills"),
    // packages/desktop/src/main → repo root skills
    path.resolve(here, "../../../../skills"),
  ]
  return app.isPackaged
    ? ([packagedRoot, ...devRoots].filter(Boolean) as string[])
    : ([...devRoots, packagedRoot].filter(Boolean) as string[])
}

async function resolveBuiltInSkillRoot() {
  for (const candidate of builtInSkillRootCandidates()) {
    try {
      const stats = await fs.stat(candidate)
      if (stats.isDirectory()) return candidate
    } catch {
      // try next
    }
  }
  return null
}

type CatalogItem = {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  sourceDir: string
}

let catalogCache: CatalogItem[] | null = null

async function readBuiltInSkillCatalog() {
  if (catalogCache) return catalogCache

  const root = await resolveBuiltInSkillRoot()
  if (!root) {
    catalogCache = []
    return catalogCache
  }

  const entries = await fs.readdir(root, { withFileTypes: true })
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9._-]*$/i.test(entry.name))
      .map(async (entry) => {
        const sourceDir = path.join(root, entry.name)
        const skillFile = path.join(sourceDir, "SKILL.md")
        try {
          const skillMarkdown = await fs.readFile(skillFile, "utf8")
          const metadata = parseSkillFrontMatter(skillMarkdown)
          const name = metadata.name || entry.name
          return {
            id: entry.name,
            name,
            displayName: displayNameFromSkillName(name),
            description: normalizeSkillDescription(metadata.description),
            category: "Built-in",
            sourceDir,
          }
        } catch (error: unknown) {
          if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null
          throw error
        }
      }),
  )

  catalogCache = items
    .filter((item): item is CatalogItem => item !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  return catalogCache
}

function resolveManagedSkillDir(skillId: string, storeRoot = skillStoreRoot()) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(skillId)) throw new Error("Invalid skill id")
  const root = path.resolve(storeRoot)
  const target = path.resolve(root, skillId)
  if (target !== root && target.startsWith(`${root}${path.sep}`)) return { root, target }
  throw new Error("Invalid skill install path")
}

async function readSkillStoreFile(skillId: string, storeRoot = skillStoreRoot()) {
  const { target } = resolveManagedSkillDir(skillId, storeRoot)
  const filePath = path.join(target, "SKILL.md")
  try {
    return { filePath, content: await fs.readFile(filePath, "utf8") }
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { filePath, content: null as string | null }
    }
    throw error
  }
}

async function readManagedMarker(skillId: string, storeRoot = skillStoreRoot()) {
  const { target } = resolveManagedSkillDir(skillId, storeRoot)
  try {
    return await fs.readFile(path.join(target, SHOB_SKILL_STORE_MARKER_FILE), "utf8")
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}

function parseSkillStoreMarker(marker: string | null) {
  if (!marker) return null
  try {
    return JSON.parse(marker) as { source?: string }
  } catch {
    return null
  }
}

async function readSkillInstallState(skillId: string, storeRoot = skillStoreRoot()) {
  const { filePath, content } = await readSkillStoreFile(skillId, storeRoot)
  const marker = await readManagedMarker(skillId, storeRoot)
  const markerData = parseSkillStoreMarker(marker)
  return {
    filePath,
    content,
    installed: content !== null,
    managed: markerData?.source === SHOB_SKILL_STORE_SOURCE,
  }
}

export async function listSkillStore(): Promise<SkillStoreItem[]> {
  const catalog = await readBuiltInSkillCatalog()
  return Promise.all(
    catalog.map(async (item) => {
      const state = await readSkillInstallState(item.id)
      return {
        id: item.id,
        name: item.name,
        displayName: item.displayName,
        description: item.description,
        category: item.category,
        installed: state.installed,
        managed: state.managed && state.installed,
        location: state.installed ? state.filePath : null,
      }
    }),
  )
}

export async function installSkill(skillId: string): Promise<SkillStoreItem> {
  const catalog = await readBuiltInSkillCatalog()
  const item = catalog.find((entry) => entry.id === skillId)
  if (!item) throw new Error(`Unknown skill: ${skillId}`)

  const { target } = resolveManagedSkillDir(item.id)
  const state = await readSkillInstallState(item.id)
  if (state.content && !state.managed) {
    return {
      id: item.id,
      name: item.name,
      displayName: item.displayName,
      description: item.description,
      category: item.category,
      installed: true,
      managed: false,
      location: state.filePath,
    }
  }

  await fs.rm(target, { recursive: true, force: true })
  await fs.mkdir(path.dirname(target), { recursive: true })
  try {
    // Copy full skill folder so references/assets ship with the skill
    await fs.cp(item.sourceDir, target, { recursive: true })
    await fs.writeFile(
      path.join(target, SHOB_SKILL_STORE_MARKER_FILE),
      JSON.stringify(
        {
          source: SHOB_SKILL_STORE_SOURCE,
          skillId: item.id,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    )
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true })
    throw error
  }

  return {
    id: item.id,
    name: item.name,
    displayName: item.displayName,
    description: item.description,
    category: item.category,
    installed: true,
    managed: true,
    location: path.join(target, "SKILL.md"),
  }
}

export async function uninstallSkill(skillId: string): Promise<{ ok: true }> {
  const catalog = await readBuiltInSkillCatalog()
  const item = catalog.find((entry) => entry.id === skillId)
  if (!item) throw new Error(`Unknown skill: ${skillId}`)

  const { root, target } = resolveManagedSkillDir(item.id)
  const state = await readSkillInstallState(item.id)
  if (!state.content) return { ok: true }
  if (!state.managed) {
    throw new Error("This skill was not installed by Shob Skill Store.")
  }
  const resolvedTarget = path.resolve(target)
  if (resolvedTarget === root || !resolvedTarget.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing to remove a path outside the skill store.")
  }
  await fs.rm(resolvedTarget, { recursive: true, force: true })
  return { ok: true }
}

/** Ensure the skill store directory exists (does not auto-install skills). */
export function ensureSkillStoreRoot() {
  fsSync.mkdirSync(skillStoreRoot(), { recursive: true })
}
