import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const modelsUrl = process.env.SHOB_MODELS_URL || "https://models.dev"

export const modelsData = await (async () => {
  if (process.env.MODELS_DEV_API_JSON) {
    return await Bun.file(process.env.MODELS_DEV_API_JSON).text()
  }
  try {
    const res = await fetch(`${modelsUrl}/api.json`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (e) {
    console.warn(`\n[WARNING] Failed to fetch models.dev snapshot: ${e}. Using local fixture fallback.\n`)
    return await Bun.file(path.join(dir, "test/tool/fixtures/models-api.json")).text()
  }
})()

console.log("Loaded models.dev snapshot")
