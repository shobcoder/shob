import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"

type StartCommand = {
  type: "start"
  hostname: string
  port: number
  password: string
  serverModulePath: string
}

type StopCommand = { type: "stop" }
type SidecarCommand = StartCommand | StopCommand

type ParentPort = {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
}

type SidecarMessage =
  | { type: "ready"; hostname: string; port: number }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

function getParentPort(): ParentPort {
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort
  if (!port) throw new Error("Sidecar parent port unavailable")
  return port
}

const parentPort = getParentPort()

function post(message: SidecarMessage) {
  parentPort.postMessage(message)
}

process.on("unhandledRejection", (reason) => {
  try {
    parentPort.postMessage({ type: "error", error: { message: String(reason), stack: "" } })
  } catch {
    // Parent process may already be gone.
  }
  setTimeout(() => process.exit(1), 200)
})

function serializeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack, name: error.name }
  return { message: String(error), stack: "", name: "Error" }
}

function writeCrashFile(reason: string) {
  try {
    const file = `${tmpdir()}/shob-sidecar-crash.log`
    writeFileSync(file, `${new Date().toISOString()}\n${reason}\n`)
    console.error("[sidecar] crash written:", file, reason.slice(0, 300))
  } catch {
    // Crash file is best effort; the process will still exit.
  }
}

process.on("uncaughtException", (error) => {
  writeCrashFile(String(error?.stack ?? error))
  setTimeout(() => process.exit(1), 500)
})

async function start(command: StartCommand) {
  try {
    Object.assign(process.env, {
      SHOB_SERVER_USERNAME: "shob",
      SHOB_SERVER_PASSWORD: command.password,
      SHOB_DISABLE_EMBEDDED_WEB_UI: "true",
    })

    const serverUrl = pathToFileURL(command.serverModulePath).href
    const serverModule = await import(serverUrl)
    const { Server, Log } = serverModule

    await Log.init({ level: 'WARN' })

    const listener = await Server.listen({
      port: command.port,
      hostname: command.hostname,
    })

    post({ type: 'ready', hostname: command.hostname, port: listener.port })

    parentPort.on("message", (event: { data: unknown }) => {
      const msg = event.data as StopCommand | undefined
      if (msg?.type === "stop") {
        listener
          .stop(true)
          .then(() => {
            post({ type: "stopped" })
            process.exit(0)
          })
          .catch(() => process.exit(0))
      }
    })
  } catch (error) {
    console.error("[sidecar] start error:", error)
    writeCrashFile(error instanceof Error ? (error.stack ?? error.message) : String(error))
    post({ type: "error", error: serializeError(error) })
    setTimeout(() => process.exit(1), 500)
  }
}

parentPort.on("message", (event: { data: unknown }) => {
  const command = event.data as SidecarCommand | undefined
  if (!command) return
  if (command.type === "stop") {
    post({ type: "stopped" })
    process.exit(0)
  }
  if (command.type === "start") {
    void start(command)
  }
})
