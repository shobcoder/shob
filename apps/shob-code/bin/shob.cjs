#!/usr/bin/env node

const childProcess = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"]

function run(target) {
  const child = childProcess.spawn(target, process.argv.slice(2), {
    stdio: "inherit",
    windowsHide: false,
  })

  child.on("error", (error) => {
    console.error(error.message)
    process.exit(1)
  })

  const forwarders = {}
  for (const signal of forwardedSignals) {
    forwarders[signal] = () => {
      try {
        child.kill(signal)
      } catch { }
    }
    process.on(signal, forwarders[signal])
  }

  child.on("exit", (code, signal) => {
    for (const signalName of forwardedSignals) {
      process.removeListener(signalName, forwarders[signalName])
    }
    if (signal) return process.kill(process.pid, signal)
    process.exit(typeof code === "number" ? code : 0)
  })
}

const envPath = process.env.SHOB_BIN_PATH
if (envPath) run(envPath)

const scriptDir = path.dirname(fs.realpathSync(__filename))
const binary = process.platform === "win32" ? "shob.exe" : "shob"
const bundled = path.join(scriptDir, "..", "dist", "bin", binary)

if (!fs.existsSync(bundled)) {
  console.error("Shob CLI binary was not found. Run `bun run build` in apps/shob-code before publishing.")
  process.exit(1)
}

run(bundled)
