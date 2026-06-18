import { spawn } from "node:child_process"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import net from "node:net"
import fs from "node:fs"
import { app, utilityProcess } from "electron"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")
const monorepoRoot = path.resolve(projectRoot, "..", "..")
const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

const START_TIMEOUT_MS = 120000
const SIDECAR_CRASH_FILE = path.join(os.tmpdir(), "shob-sidecar-crash.log")

function readSidecarCrash(): string | null {
  try {
    if (fs.existsSync(SIDECAR_CRASH_FILE)) {
      const content = fs.readFileSync(SIDECAR_CRASH_FILE, "utf8").trim()
      fs.unlinkSync(SIDECAR_CRASH_FILE)
      if (content) return content
    }
  } catch {
    // Ignore stale or inaccessible crash logs.
  }
  return null
}
const HEALTH_POLL_INTERVAL_MS = 100
const HEALTH_TIMEOUT_MS = 30000
const HEALTH_FETCH_TIMEOUT_MS = 3000
const SIDECAR_SERVICE_NAME = "shob-server"

type StartServerOptions = {
  packaged?: boolean
  serverEntry?: string
}

function platformDataEnv(): Record<string, string> {
  if (process.platform !== "darwin") return {}
  const home = os.homedir()
  // The server appends its app namespace ("shob") onto each XDG base, so point
  // the bases at the macOS parent dirs — they resolve to ~/Library/Application
  // Support/shob (data/config/state) and ~/Library/Caches/shob (cache).
  const appSupport = path.join(home, "Library", "Application Support")
  const caches = path.join(home, "Library", "Caches")
  const defaults: Record<string, string> = {
    XDG_DATA_HOME: appSupport,
    XDG_CONFIG_HOME: appSupport,
    XDG_STATE_HOME: appSupport,
    XDG_CACHE_HOME: caches,
  }
  return Object.fromEntries(Object.entries(defaults).filter(([key]) => !process.env[key]))
}

export interface ServerInstance {
  url: string
  port: number
  hostname: string
  stop: () => Promise<void>
}

function resolveBun(): string {
  const candidates = process.platform === "win32"
    ? ["bun.exe", "bun.cmd", "bun"]
    : ["bun"]

  if (process.env.PATH) {
    for (const dir of process.env.PATH.split(path.delimiter)) {
      for (const name of candidates) {
        const candidate = path.join(dir, name)
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate
          }
        } catch {
          // Ignore inaccessible PATH entries and keep scanning.
        }
      }
    }
  }

  return "bun"
}

async function findFreePort(hostname: string = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, hostname, () => {
      const addr = server.address()
      if (!addr || typeof addr === "string") {
        server.close()
        reject(new Error("Failed to get port from server address"))
        return
      }
      const port = addr.port
      server.close(() => resolve(port))
    })
  })
}

async function waitForHealth(url: string, timeoutMs = HEALTH_TIMEOUT_MS): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), HEALTH_FETCH_TIMEOUT_MS)
      const res = await fetch(`${url}/global/health`, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) return
    } catch {
      // Retry until the sidecar is healthy or the startup timeout expires.
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS))
  }
  throw new Error(`Server health check timed out after ${timeoutMs}ms`)
}

function getSidecarScript(): string {
  return path.join(__dirname, "sidecar.js")
}

function getServerBundlePath(): string {
  return path.join(resourcesPath ?? path.resolve(projectRoot, ".."), "dist-server", "node.js")
}

async function startPackagedServer(
  hostname: string,
  port: number,
  options: StartServerOptions,
): Promise<ServerInstance> {
  const sidecarScript = getSidecarScript()
  const serverBundlePath = getServerBundlePath()

  if (!fs.existsSync(sidecarScript)) {
    throw new Error(`Sidecar script not found at ${sidecarScript}`)
  }
  if (!fs.existsSync(serverBundlePath)) {
    throw new Error(`Server bundle not found at ${serverBundlePath}`)
  }

  console.log(`[shob] starting packaged server on ${hostname}:${port}`)
  console.log(`[shob] sidecar: ${sidecarScript}`)
  console.log(`[shob] server bundle: ${serverBundlePath}`)

  // Ensure externalized deps (like @lydell/node-pty) can be resolved from the
  // server bundle by pointing NODE_PATH at the asar's node_modules.
  const appPath = app.getAppPath()
  const nodePath = [
    path.join(appPath, "node_modules"),
    process.env.NODE_PATH,
  ].filter(Boolean).join(path.delimiter)

  const child = utilityProcess.fork(sidecarScript, [], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...platformDataEnv(),
      NODE_PATH: nodePath,
      SHOB_DISABLE_EMBEDDED_WEB_UI: "true",
    },
    serviceName: SIDECAR_SERVICE_NAME,
    stdio: "pipe",
  })

  let exited = false
  let exitCode: number | null = null
  const stderrChunks: string[] = []

  child.stdout?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trimEnd()
    if (msg) console.log("[sidecar:stdout]", msg)
  })
  child.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trimEnd()
    if (msg) {
      stderrChunks.push(msg)
      console.warn("[sidecar:stderr]", msg)
    }
  })

  const url = await new Promise<string>((resolve, reject) => {
    let resolved = false

    child.once("exit", (code) => {
      exited = true
      exitCode = code
      console.warn(`[shob] sidecar exited with code ${code}`)
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        let detail = readSidecarCrash() ?? ""
        if (!detail && stderrChunks.length > 0) {
          detail = stderrChunks.join("\n")
        }
        const suffix = detail ? `\n${detail}` : ""
        reject(new Error(`Sidecar exited unexpectedly with code ${code}${suffix}`))
      }
    })

    child.on("error", (err: unknown) => {
      console.error("[shob] sidecar error:", err)
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        if (!exited) child.kill()
        reject(new Error(`Server start timed out after ${START_TIMEOUT_MS}ms`))
      }
    }, START_TIMEOUT_MS)

    const onMessage = (msg: any) => {
      if (!msg) return

      if (msg.type === "ready" && msg.port) {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        child.off("message", onMessage)
        resolve(`http://${msg.hostname ?? hostname}:${msg.port}`)
      }

      if (msg.type === "error") {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        child.off("message", onMessage)
        reject(new Error(msg.error?.message ?? "Unknown sidecar error"))
      }
    }

    child.on("message", onMessage)

    child.postMessage({
      type: "start",
      hostname,
      port,
      password: "",
      serverModulePath: serverBundlePath,
    })
  })

  console.log(`[shob] server listening at ${url}`)

  try {
    await waitForHealth(url)
    console.log(`[shob] server health check passed`)
  } catch (err) {
    if (!exited) child.kill()
    throw err
  }

  const actualPort = Number(new URL(url).port)

  return {
    url,
    port: actualPort,
    hostname,
    stop: async () => {
      if (exited) return
      return new Promise<void>((resolve) => {
        const onExit = () => resolve()
        child.once("exit", onExit)

        child.postMessage({ type: "stop" })

        setTimeout(() => {
          if (!exited) {
            child.off("exit", onExit)
            child.kill()
            resolve()
          }
        }, 5000)
      })
    },
  }
}

async function startDevServer(
  hostname: string,
  port: number,
  options: StartServerOptions,
): Promise<ServerInstance> {
  const bunPath = resolveBun()
  const serverEntry = options.serverEntry ?? path.resolve(monorepoRoot, "packages", "server", "src", "index.ts")

  console.log(`[shob] starting server on ${hostname}:${port} with ${bunPath}`)

  const proc = spawn(bunPath, [
    "--conditions=browser",
    serverEntry,
    "serve",
    `--hostname=${hostname}`,
    `--port=${port}`,
  ], {
    cwd: monorepoRoot,
    env: {
      ...process.env,
      ...platformDataEnv(),
      SHOB_DISABLE_EMBEDDED_WEB_UI: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error(`Server start timed out after ${START_TIMEOUT_MS}ms`))
    }, START_TIMEOUT_MS)

    let output = ""
    let resolved = false

    proc.stdout?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk)
      if (resolved) return
      output += chunk.toString()
      const match = output.match(/shob server listening on (https?:\/\/[^\s]+)/)
      if (match && match[1]) {
        resolved = true
        clearTimeout(timeout)
        resolve(match[1])
      }
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk)
      output += chunk.toString()
    })

    proc.on("exit", (code) => {
      clearTimeout(timeout)
      if (!resolved) {
        reject(new Error(`Server exited with code ${code}. Output:\n${output}`))
      }
    })

    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  console.log(`[shob] server listening at ${url}`)

  try {
    await waitForHealth(url)
    console.log(`[shob] server health check passed`)
  } catch (err) {
    proc.kill()
    throw err
  }

  return {
    url,
    port,
    hostname,
    stop: async () => {
      return new Promise<void>((resolve) => {
        if (proc.exitCode !== null || proc.killed) {
          resolve()
          return
        }
        const onExit = () => {
          proc.off("exit", onExit)
          resolve()
        }
        proc.on("exit", onExit)
        const killed = proc.kill("SIGTERM")
        if (!killed) {
          proc.off("exit", onExit)
          resolve()
          return
        }
        setTimeout(() => {
          if (proc.exitCode === null && !proc.killed) {
            proc.kill("SIGKILL")
          }
          resolve()
        }, 5000)
      })
    },
  }
}

export async function startServer(options: StartServerOptions = {}): Promise<ServerInstance> {
  const hostname = "127.0.0.1"
  const port = await findFreePort(hostname)
  const packaged = options.packaged ?? projectRoot.endsWith("app.asar")

  if (packaged) {
    return startPackagedServer(hostname, port, options)
  }
  return startDevServer(hostname, port, options)
}
