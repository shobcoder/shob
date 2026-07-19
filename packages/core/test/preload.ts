import path from "path"

process.env.SHOB_DB = ":memory:"
process.env.SHOB_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.SHOB_DISABLE_MODELS_FETCH = "true"
