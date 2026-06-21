import z from "zod"
import os from "os"
import { spawn as spawnNodeProcess } from "node:child_process"
import { Tool } from "./tool"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { lazy } from "@/util/lazy"
import { Language, type Node } from "web-tree-sitter"

import { AppFileSystem } from "@/filesystem"
import { fileURLToPath } from "url"
import { Flag } from "@/flag/flag"
import { Shell } from "@/shell/shell"

import { BashArity } from "@/permission/arity"
import { Truncate } from "./truncate"
import { Plugin } from "@/plugin"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = Flag.SHOB_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS || 2 * 60 * 1000
const BACKGROUND_STARTUP_TIMEOUT = 10_000
const PS = new Set(["powershell", "pwsh"])
const CWD = new Set(["cd", "push-location", "set-location"])
const FILES = new Set([
  ...CWD,
  "rm",
  "cp",
  "mv",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "cat",
  // Leave PowerShell aliases out for now. Common ones like cat/cp/mv/rm/mkdir
  // already hit the entries above, and alias normalization should happen in one
  // place later so we do not risk double-prompting.
  "get-content",
  "set-content",
  "add-content",
  "copy-item",
  "move-item",
  "remove-item",
  "new-item",
  "rename-item",
])
const FLAGS = new Set(["-destination", "-literalpath", "-path"])
const SWITCHES = new Set(["-confirm", "-debug", "-force", "-nonewline", "-recurse", "-verbose", "-whatif"])

const Parameters = z.object({
  command: z.string().describe("The command to execute"),
  timeout: z.number().describe("Optional timeout in milliseconds").optional(),
  background: z
    .boolean()
    .describe(
      "Run long-lived commands like dev servers or watch processes in the background. The tool returns after startup so the agent can continue.",
    )
    .optional(),
  workdir: z
    .string()
    .describe(
      `The working directory to run the command in. Defaults to the current directory. Use this instead of 'cd' commands.`,
    )
    .optional(),
  description: z
    .string()
    .describe(
      "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
    ),
})

type Part = {
  type: string
  text: string
}

type Scan = {
  dirs: Set<string>
  patterns: Set<string>
  always: Set<string>
}

export const log = Log.create({ service: "bash-tool" })

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

function parts(node: Node) {
  const out: Part[] = []
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (!child) continue
    if (child.type === "command_elements") {
      for (let j = 0; j < child.childCount; j++) {
        const item = child.child(j)
        if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue
        out.push({ type: item.type, text: item.text })
      }
      continue
    }
    if (
      child.type !== "command_name" &&
      child.type !== "command_name_expr" &&
      child.type !== "word" &&
      child.type !== "string" &&
      child.type !== "raw_string" &&
      child.type !== "concatenation"
    ) {
      continue
    }
    out.push({ type: child.type, text: child.text })
  }
  return out
}

function source(node: Node) {
  return (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim()
}

function commands(node: Node) {
  return node.descendantsOfType("command").filter((child): child is Node => Boolean(child))
}

function unquote(text: string) {
  if (text.length < 2) return text
  const first = text[0]
  const last = text[text.length - 1]
  if ((first === '"' || first === "'") && first === last) return text.slice(1, -1)
  return text
}

function home(text: string) {
  if (text === "~") return os.homedir()
  if (text.startsWith("~/") || text.startsWith("~\\")) return path.join(os.homedir(), text.slice(2))
  return text
}

function envValue(key: string) {
  if (process.platform !== "win32") return process.env[key]
  const name = Object.keys(process.env).find((item) => item.toLowerCase() === key.toLowerCase())
  return name ? process.env[name] : undefined
}

function auto(key: string, cwd: string, shell: string) {
  const name = key.toUpperCase()
  if (name === "HOME") return os.homedir()
  if (name === "PWD") return cwd
  if (name === "PSHOME") return path.dirname(shell)
}

function expand(text: string, cwd: string, shell: string) {
  const out = unquote(text)
    .replace(/\$\{env:([^}]+)\}/gi, (_, key: string) => envValue(key) || "")
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, key: string) => envValue(key) || "")
    .replace(/\$(HOME|PWD|PSHOME)(?=$|[\\/])/gi, (_, key: string) => auto(key, cwd, shell) || "")
  return home(out)
}

function provider(text: string) {
  const match = text.match(/^([A-Za-z]+)::(.*)$/)
  if (match) {
    if (match[1].toLowerCase() !== "filesystem") return
    return match[2]
  }
  const prefix = text.match(/^([A-Za-z]+):(.*)$/)
  if (!prefix) return text
  if (prefix[1].length === 1) return text
  return
}

function dynamic(text: string, ps: boolean) {
  if (text.startsWith("(") || text.startsWith("@(")) return true
  if (text.includes("$(") || text.includes("${") || text.includes("`")) return true
  if (ps) return /\$(?!env:)/i.test(text)
  return text.includes("$")
}

function prefix(text: string) {
  const match = /[?*\[]/.exec(text)
  if (!match) return text
  if (match.index === 0) return
  return text.slice(0, match.index)
}

function pathArgs(list: Part[], ps: boolean) {
  if (!ps) {
    return list
      .slice(1)
      .filter((item) => !item.text.startsWith("-") && !(list[0]?.text === "chmod" && item.text.startsWith("+")))
      .map((item) => item.text)
  }

  const out: string[] = []
  let want = false
  for (const item of list.slice(1)) {
    if (want) {
      out.push(item.text)
      want = false
      continue
    }
    if (item.type === "command_parameter") {
      const flag = item.text.toLowerCase()
      if (SWITCHES.has(flag)) continue
      want = FLAGS.has(flag)
      continue
    }
    out.push(item.text)
  }
  return out
}

function preview(text: string) {
  if (text.length <= MAX_METADATA_LENGTH) return text
  return text.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
}

const parse = Effect.fn("BashTool.parse")(function* (command: string, ps: boolean) {
  const tree = yield* Effect.promise(() => grammar(ps).then((p) => p.parse(command)))
  if (!tree) throw new Error("Failed to parse command")
  return tree.rootNode
})

const ask = Effect.fn("BashTool.ask")(function* (ctx: Tool.Context, scan: Scan) {
  if (scan.dirs.size > 0) {
    const globs = Array.from(scan.dirs).map((dir) => {
      if (process.platform === "win32") return AppFileSystem.normalizePathPattern(path.join(dir, "*"))
      return path.join(dir, "*")
    })
    yield* ctx.ask({
      permission: "external_directory",
      patterns: globs,
      always: globs,
      metadata: {},
    })
  }

  if (scan.patterns.size === 0) return
  yield* ctx.ask({
    permission: "bash",
    patterns: Array.from(scan.patterns),
    always: Array.from(scan.always),
    metadata: {},
  })
})

function cmd(shell: string, name: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  if (process.platform === "win32" && PS.has(name)) {
    return ChildProcess.make(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd,
      env,
      stdin: "ignore",
      detached: false,
    })
  }

  return ChildProcess.make(command, [], {
    shell,
    cwd,
    env,
    stdin: "ignore",
    detached: process.platform !== "win32",
  })
}

function nodeCmd(shell: string, name: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  if (process.platform === "win32" && PS.has(name)) {
    return {
      command: shell,
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
      options: { cwd, env, windowsHide: true, detached: false },
    }
  }

  return {
    command,
    args: [] as string[],
    options: { shell, cwd, env, windowsHide: true, detached: process.platform !== "win32" },
  }
}

function looksLikeBackgroundCommand(command: string, description: string) {
  const normalized = command
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
  const purpose = description.toLowerCase()
  if (!normalized) return false
  if (/[;&|]\s*(nohup|setsid|start-process)\b/.test(normalized) || /(?:^|\s)&\s*$/.test(normalized)) return false
  if (/\b(test|build|install|ci|lint|typecheck|format|generate)\b/.test(normalized)) return false

  const patterns = [
    /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|serve|watch)\b/,
    /\b(npm|pnpm|yarn|bun)\s+start\b/,
    /\b(vite|next|nuxt|astro|remix|vitepress|svelte-kit|webpack-dev-server|wrangler)\s+(dev|serve)\b/,
    /\bwebpack\s+serve\b/,
    /\breact-scripts\s+start\b/,
    /\bng\s+serve\b/,
    /\b(nodemon|tsx\s+watch|ts-node-dev|air)\b/,
    /\btsc\b.*\b--watch\b/,
  ]
  if (patterns.some((pattern) => pattern.test(normalized))) return true
  return /\b(start|run|launch)\b/.test(purpose) && /\b(dev server|development server|server|watcher|watch mode)\b/.test(purpose)
}

function backgroundReady(output: string) {
  return [
    /\b(local|network):\s+https?:\/\//i,
    /\bhttps?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\])(?::\d+)?/i,
    /\b(server|app|vite|next|nuxt|astro|webpack|wrangler)\b.*\b(ready|started|listening|running|compiled)\b/i,
    /\bready in \d+(?:\.\d+)?\s*(ms|s)\b/i,
    /\bcompiled successfully\b/i,
    /\bwatching for file changes\b/i,
  ].some((pattern) => pattern.test(output))
}

function stopCommand(pid: number | undefined) {
  if (!pid) return "Stop the background process from your terminal/process manager."
  if (process.platform === "win32") return `taskkill /PID ${pid} /T /F`
  return `kill -TERM -${pid} || kill ${pid}`
}

const runtime = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  return Parser
})

// Load each grammar independently and lazily so a given platform only ever pays
// for the shell it actually uses (Linux/macOS never load the PowerShell grammar,
// Windows loads only the grammar for the shell it selected).
const bashParser = lazy(async () => {
  const Parser = await runtime()
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const language = await Language.load(resolveWasm(bashWasm))
  const parser = new Parser()
  parser.setLanguage(language)
  return parser
})

const psParser = lazy(async () => {
  const Parser = await runtime()
  const { default: psWasm } = await import("tree-sitter-powershell/tree-sitter-powershell.wasm" as string, {
    with: { type: "wasm" },
  })
  const language = await Language.load(resolveWasm(psWasm))
  const parser = new Parser()
  parser.setLanguage(language)
  return parser
})

const grammar = (ps: boolean) => (ps ? psParser() : bashParser())

// TODO: we may wanna rename this tool so it works better on other shells
export const BashTool = Tool.define(
  "bash",
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner
    const fs = yield* AppFileSystem.Service
    const plugin = yield* Plugin.Service

    const cygpath = Effect.fn("BashTool.cygpath")(function* (shell: string, text: string) {
      const lines = yield* spawner
        .lines(ChildProcess.make(shell, ["-lc", 'cygpath -w -- "$1"', "_", text]))
        .pipe(Effect.catch(() => Effect.succeed([] as string[])))
      const file = lines[0]?.trim()
      if (!file) return
      return AppFileSystem.normalizePath(file)
    })

    const resolvePath = Effect.fn("BashTool.resolvePath")(function* (text: string, root: string, shell: string) {
      if (process.platform === "win32") {
        if (Shell.posix(shell) && text.startsWith("/") && AppFileSystem.windowsPath(text) === text) {
          const file = yield* cygpath(shell, text)
          if (file) return file
        }
        return AppFileSystem.normalizePath(path.resolve(root, AppFileSystem.windowsPath(text)))
      }
      return path.resolve(root, text)
    })

    const argPath = Effect.fn("BashTool.argPath")(function* (arg: string, cwd: string, ps: boolean, shell: string) {
      const text = ps ? expand(arg, cwd, shell) : home(unquote(arg))
      const file = text && prefix(text)
      if (!file || dynamic(file, ps)) return
      const next = ps ? provider(file) : file
      if (!next) return
      return yield* resolvePath(next, cwd, shell)
    })

    const collect = Effect.fn("BashTool.collect")(function* (root: Node, cwd: string, ps: boolean, shell: string) {
      const scan: Scan = {
        dirs: new Set<string>(),
        patterns: new Set<string>(),
        always: new Set<string>(),
      }

      for (const node of commands(root)) {
        const command = parts(node)
        const tokens = command.map((item) => item.text)
        const cmd = ps ? tokens[0]?.toLowerCase() : tokens[0]

        if (cmd && FILES.has(cmd)) {
          for (const arg of pathArgs(command, ps)) {
            const resolved = yield* argPath(arg, cwd, ps, shell)
            log.info("resolved path", { arg, resolved })
            if (!resolved || Instance.containsPath(resolved)) continue
            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
            scan.dirs.add(dir)
          }
        }

        if (tokens.length && (!cmd || !CWD.has(cmd))) {
          scan.patterns.add(source(node))
          scan.always.add(BashArity.prefix(tokens).join(" ") + " *")
        }
      }

      return scan
    })

    const shellEnv = Effect.fn("BashTool.shellEnv")(function* (ctx: Tool.Context, cwd: string) {
      const extra = yield* plugin.trigger(
        "shell.env",
        { cwd, sessionID: ctx.sessionID, callID: ctx.callID },
        { env: {} },
      )
      return {
        ...process.env,
        ...extra.env,
      }
    })

    const run = Effect.fn("BashTool.run")(function* (
      input: {
        shell: string
        name: string
        command: string
        cwd: string
        env: NodeJS.ProcessEnv
        timeout: number
        description: string
      },
      ctx: Tool.Context,
    ) {
      let output = ""
      let expired = false
      let aborted = false

      yield* ctx.metadata({
        metadata: {
          output: "",
          description: input.description,
        },
      })

      const code: number | null = yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(cmd(input.shell, input.name, input.command, input.cwd, input.env))

          yield* Effect.forkScoped(
            Stream.runForEach(Stream.decodeText(handle.all), (chunk) => {
              output += chunk
              return ctx.metadata({
                metadata: {
                  output: preview(output),
                  description: input.description,
                },
              })
            }),
          )

          const abort = Effect.callback<void>((resume) => {
            if (ctx.abort.aborted) return resume(Effect.void)
            const handler = () => resume(Effect.void)
            ctx.abort.addEventListener("abort", handler, { once: true })
            return Effect.sync(() => ctx.abort.removeEventListener("abort", handler))
          })

          const timeout = Effect.sleep(`${input.timeout + 100} millis`)

          const exit = yield* Effect.raceAll([
            handle.exitCode.pipe(Effect.map((code) => ({ kind: "exit" as const, code }))),
            abort.pipe(Effect.map(() => ({ kind: "abort" as const, code: null }))),
            timeout.pipe(Effect.map(() => ({ kind: "timeout" as const, code: null }))),
          ])

          if (exit.kind === "abort") {
            aborted = true
            yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
          }
          if (exit.kind === "timeout") {
            expired = true
            yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
          }

          return exit.kind === "exit" ? exit.code : null
        }),
      ).pipe(Effect.orDie)

      const meta: string[] = []
      if (expired) meta.push(`bash tool terminated command after exceeding timeout ${input.timeout} ms`)
      if (aborted) meta.push("User aborted the command")
      if (meta.length > 0) {
        output += "\n\n<bash_metadata>\n" + meta.join("\n") + "\n</bash_metadata>"
      }

      return {
        title: input.description,
        metadata: {
          output: preview(output),
          exit: code,
          description: input.description,
        },
        output,
      }
    })

    const runBackground = Effect.fn("BashTool.runBackground")(function* (
      input: {
        shell: string
        name: string
        command: string
        cwd: string
        env: NodeJS.ProcessEnv
        description: string
      },
      ctx: Tool.Context,
    ) {
      let output = ""

      yield* ctx.metadata({
        metadata: {
          output: "",
          description: input.description,
          background: true,
        },
      })

      const result = yield* Effect.promise(
        () =>
          new Promise<{
            running: boolean
            reason: "ready" | "startup-timeout" | "exit" | "abort" | "error"
            pid?: number
            exit: number | null
            signal?: NodeJS.Signals | null
            error?: string
          }>((resolve) => {
            const launch = nodeCmd(input.shell, input.name, input.command, input.cwd, input.env)
            const child = spawnNodeProcess(launch.command, launch.args, {
              ...launch.options,
              stdio: ["ignore", "pipe", "pipe"],
            } as Parameters<typeof spawnNodeProcess>[2])
            let settled = false

            const append = (chunk: Buffer | string) => {
              output += chunk.toString()
              if (output.length > MAX_METADATA_LENGTH) output = output.slice(-MAX_METADATA_LENGTH)
              if (!settled && backgroundReady(output)) finish({ running: true, reason: "ready", pid: child.pid, exit: null })
            }

            const cleanup = () => {
              clearTimeout(timer)
              ctx.abort.removeEventListener("abort", onAbort)
            }

            const finish = (next: {
              running: boolean
              reason: "ready" | "startup-timeout" | "exit" | "abort" | "error"
              pid?: number
              exit: number | null
              signal?: NodeJS.Signals | null
              error?: string
            }) => {
              if (settled) return
              settled = true
              cleanup()
              if (next.running) child.unref()
              resolve(next)
            }

            const onAbort = () => {
              if (settled) return
              try {
                child.kill()
              } catch {
                // Process may have already exited.
              }
              finish({ running: false, reason: "abort", pid: child.pid, exit: null })
            }

            const timer = setTimeout(() => {
              finish({ running: true, reason: "startup-timeout", pid: child.pid, exit: null })
            }, BACKGROUND_STARTUP_TIMEOUT)

            child.stdout?.on("data", append)
            child.stderr?.on("data", append)
            child.once("error", (error) => {
              append(String(error))
              finish({
                running: false,
                reason: "error",
                pid: child.pid,
                exit: null,
                error: error instanceof Error ? error.message : String(error),
              })
            })
            child.once("exit", (code, signal) => {
              if (!settled) {
                finish({ running: false, reason: "exit", pid: child.pid, exit: code, signal })
                return
              }
              log.info("background command exited", {
                pid: child.pid,
                code,
                signal,
                command: input.command,
              })
            })
            ctx.abort.addEventListener("abort", onAbort, { once: true })
          }),
      )

      const meta: string[] = []
      if (result.running) {
        meta.push("bash tool started this long-running command in the background so the agent can continue.")
        if (result.reason === "startup-timeout") {
          meta.push(`No explicit ready signal was detected within ${BACKGROUND_STARTUP_TIMEOUT} ms, but the process is still running.`)
        }
        if (result.pid) meta.push(`Background PID: ${result.pid}`)
        meta.push(`Stop command: ${stopCommand(result.pid)}`)
      }
      if (!result.running && result.reason === "abort") meta.push("User aborted the command before it finished starting.")
      if (!result.running && result.reason === "error" && result.error) meta.push(`Failed to start background command: ${result.error}`)
      if (result.signal) meta.push(`Process exited from signal ${result.signal}`)
      if (meta.length > 0) {
        output += "\n\n<bash_metadata>\n" + meta.join("\n") + "\n</bash_metadata>"
      }

      yield* ctx.metadata({
        metadata: {
          output: preview(output),
          exit: result.exit,
          description: input.description,
          background: result.running,
          pid: result.running ? result.pid : undefined,
          stop: result.running ? stopCommand(result.pid) : undefined,
        },
      })

      return {
        title: input.description,
        metadata: {
          output: preview(output),
          exit: result.exit,
          description: input.description,
          background: result.running,
          pid: result.running ? result.pid : undefined,
          stop: result.running ? stopCommand(result.pid) : undefined,
        },
        output,
      }
    })

    return async () => {
      const shell = Shell.acceptable()
      const name = Shell.name(shell)
      // Warm the tree-sitter grammar for the selected shell so the first command
      // doesn't pay the WASM cold-start during permission scanning.
      void grammar(PS.has(name)).catch(() => {})
      const chain =
        name === "powershell"
          ? "If the commands depend on each other and must run sequentially, avoid '&&' in this shell because Windows PowerShell 5.1 does not support it. Use PowerShell conditionals such as `cmd1; if ($?) { cmd2 }` when later commands must depend on earlier success."
          : "If the commands depend on each other and must run sequentially, use a single Bash call with '&&' to chain them together (e.g., `git add . && git commit -m \"message\" && git push`). For instance, if one operation must complete before another starts (like mkdir before cp, Write before Bash for git operations, or git add before git commit), run these operations sequentially instead."
      log.info("bash tool using shell", { shell })

      return {
        description: DESCRIPTION.replaceAll("${directory}", Instance.directory)
          .replaceAll("${os}", process.platform)
          .replaceAll("${shell}", name)
          .replaceAll("${chaining}", chain)
          .replaceAll("${maxLines}", String(Truncate.MAX_LINES))
          .replaceAll("${maxBytes}", String(Truncate.MAX_BYTES)),
        parameters: Parameters,
        execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
          Effect.gen(function* () {
            const cwd = params.workdir
              ? yield* resolvePath(params.workdir, Instance.directory, shell)
              : Instance.directory
            if (params.timeout !== undefined && params.timeout < 0) {
              throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
            }
            const timeout = params.timeout ?? DEFAULT_TIMEOUT
            const ps = PS.has(name)
            const root = yield* parse(params.command, ps)
            const scan = yield* collect(root, cwd, ps, shell)
            if (!Instance.containsPath(cwd)) scan.dirs.add(cwd)
            yield* ask(ctx, scan)
            const background = params.background ?? looksLikeBackgroundCommand(params.command, params.description)
            if (background) {
              return yield* runBackground(
                {
                  shell,
                  name,
                  command: params.command,
                  cwd,
                  env: yield* shellEnv(ctx, cwd),
                  description: params.description,
                },
                ctx,
              )
            }

            return yield* run(
              {
                shell,
                name,
                command: params.command,
                cwd,
                env: yield* shellEnv(ctx, cwd),
                timeout,
                description: params.description,
              },
              ctx,
            )
          }),
      }
    }
  }),
)
