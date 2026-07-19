import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["SHOB_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["SHOB_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("SHOB_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  SHOB_AUTO_HEAP_SNAPSHOT: truthy("SHOB_AUTO_HEAP_SNAPSHOT"),
  SHOB_GIT_BASH_PATH: process.env["SHOB_GIT_BASH_PATH"],
  SHOB_CONFIG: process.env["SHOB_CONFIG"],
  SHOB_CONFIG_CONTENT: process.env["SHOB_CONFIG_CONTENT"],
  SHOB_DISABLE_AUTOUPDATE: truthy("SHOB_DISABLE_AUTOUPDATE"),
  SHOB_ALWAYS_NOTIFY_UPDATE: truthy("SHOB_ALWAYS_NOTIFY_UPDATE"),
  SHOB_DISABLE_PRUNE: truthy("SHOB_DISABLE_PRUNE"),
  SHOB_DISABLE_TERMINAL_TITLE: truthy("SHOB_DISABLE_TERMINAL_TITLE"),
  SHOB_SHOW_TTFD: truthy("SHOB_SHOW_TTFD"),
  SHOB_DISABLE_AUTOCOMPACT: truthy("SHOB_DISABLE_AUTOCOMPACT"),
  SHOB_DISABLE_MODELS_FETCH: truthy("SHOB_DISABLE_MODELS_FETCH"),
  SHOB_DISABLE_MOUSE: truthy("SHOB_DISABLE_MOUSE"),
  SHOB_FAKE_VCS: process.env["SHOB_FAKE_VCS"],
  SHOB_SERVER_PASSWORD: process.env["SHOB_SERVER_PASSWORD"],
  SHOB_SERVER_USERNAME: process.env["SHOB_SERVER_USERNAME"],
  SHOB_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("SHOB_DISABLE_FFF"),

  // Experimental
  SHOB_EXPERIMENTAL_FILEWATCHER: Config.boolean("SHOB_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SHOB_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("SHOB_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  SHOB_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("SHOB_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  SHOB_MODELS_URL: process.env["SHOB_MODELS_URL"],
  SHOB_MODELS_PATH: process.env["SHOB_MODELS_PATH"],
  SHOB_DB: process.env["SHOB_DB"],

  SHOB_WORKSPACE_ID: process.env["SHOB_WORKSPACE_ID"],
  SHOB_EXPERIMENTAL_WORKSPACES: enabledByExperimental("SHOB_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get SHOB_DISABLE_PROJECT_CONFIG() {
    return truthy("SHOB_DISABLE_PROJECT_CONFIG")
  },
  get SHOB_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("SHOB_EXPERIMENTAL_REFERENCES")
  },
  get SHOB_TUI_CONFIG() {
    return process.env["SHOB_TUI_CONFIG"]
  },
  get SHOB_CONFIG_DIR() {
    return process.env["SHOB_CONFIG_DIR"]
  },
  get SHOB_PURE() {
    return truthy("SHOB_PURE")
  },
  get SHOB_PERMISSION() {
    return process.env["SHOB_PERMISSION"]
  },
  get SHOB_PLUGIN_META_FILE() {
    return process.env["SHOB_PLUGIN_META_FILE"]
  },
  get SHOB_CLIENT() {
    return process.env["SHOB_CLIENT"] ?? "cli"
  },
}
