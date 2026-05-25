import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { spawn as spawnProcess, execFile } from "node:child_process";
import { promisify } from "node:util";
import pty from "@lydell/node-pty";
import chokidar from "chokidar";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  appendSessionOutput,
  closeSessionDatabase,
  deleteProject as deletePersistedProject,
  initSessionDatabase,
  loadProjects as loadPersistedProjects,
  loadSessionOutput as loadPersistedSessionOutput,
  saveProject as savePersistedProject,
  saveSessionOutput as savePersistedSessionOutput,
} from "./session-db.js";
import { startServer, type ServerInstance } from "./server.js";

const execFileAsync = promisify(execFile);
const isDev = !app.isPackaged;
const MAX_EDITOR_PREVIEW_BYTES = 512 * 1024;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ProjectWatcher = Awaited<ReturnType<typeof chokidar.watch>> | null;
type PtyRuntime = {
  proc: any;
  outputQueue: { chunks: string[]; scheduled: boolean };
  persistQueue: { chunks: string[]; timer: NodeJS.Timeout | null };
  buffer: string;
  bufferCursor: number;
  cursor: number;
  status: "running" | "exited";
};

let mainWindow: BrowserWindow | null = null;
let projectWatcher: ProjectWatcher = null;
let lastWatcherOperationAt = 0;
let serverInstance: ServerInstance | null = null;
let serverStartPromise: Promise<ServerInstance> | null = null;
const ptySessions = new Map<string, PtyRuntime>();
const PTY_REPLAY_BUFFER_LIMIT = 2 * 1024 * 1024;
const PTY_OUTPUT_FLUSH_DELAY_MS = 500;

function userDataPath(...parts: string[]) {
  return path.join(app.getPath("userData"), ...parts);
}

async function ensureDataDirs() {
  await fs.mkdir(userDataPath("sessions"), { recursive: true });
  initSessionDatabase();
}

async function ensureServerStarted() {
  if (serverInstance) return serverInstance;
  serverStartPromise ??= startServer({ packaged: app.isPackaged })
    .then((instance) => {
      serverInstance = instance;
      return instance;
    })
    .catch((error) => {
      serverStartPromise = null;
      throw error;
    });
  return serverStartPromise;
}

function normalizeOs() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "linux";
  return process.platform;
}

function getImageMimeType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    case ".ico": return "image/x-icon";
    case ".gif": return "image/gif";
    case ".bmp": return "image/bmp";
    default: return "application/octet-stream";
  }
}

function splitPathEntries() {
  return (process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveCommand(command: string) {
  const direct = path.resolve(command);
  if (path.isAbsolute(command) && fsSync.existsSync(command)) return command;
  if (fsSync.existsSync(direct) && path.isAbsolute(command)) return direct;

  const pathExts = process.platform === "win32"
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const hasExt = Boolean(path.extname(command));

  for (const dir of splitPathEntries()) {
    const candidates = process.platform === "win32" && !hasExt
      ? pathExts.map((ext) => path.join(dir, `${command}${ext.toLowerCase()}`))
          .concat(pathExts.map((ext) => path.join(dir, `${command}${ext.toUpperCase()}`)))
      : [path.join(dir, command)];

    for (const candidate of candidates) {
      if (fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  return null;
}

function detectShells() {
  const shells: string[] = [];
  if (process.platform === "win32") {
    for (const command of ["pwsh.exe", "powershell.exe", "cmd.exe"]) {
      shells.push(resolveCommand(command) || command);
    }
    for (const gitShell of [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\bin\\sh.exe",
    ]) {
      if (fsSync.existsSync(gitShell)) shells.push(gitShell);
    }
  } else {
    for (const command of ["bash", "zsh", "fish", "sh"]) {
      const resolved = resolveCommand(command);
      if (resolved) shells.push(resolved);
    }
  }

  return [...new Set(shells)];
}

async function detectWindowsBuildNumber() {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync("cmd", ["/C", "ver"]);
    const token = stdout.split(/\s+/).find((part) => /\d+\.\d+\.\d+/.test(part));
    return token ? Number(token.replace(/\[|\]/g, "").split(".")[2]) || null : null;
  } catch {
    return null;
  }
}

async function gitOutput(args: string[], cwd: string) {
  const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

function parseRepoNameFromRemoteUrl(remoteUrl: string) {
  const trimmed = remoteUrl.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  const tail = trimmed.split(/[/:]/).pop()?.replace(/\.git$/, "").trim();
  return tail || null;
}

async function listDirectory(directoryPath: string) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries
    .map((entry) => ({
      name: entry.name,
      path: path.join(directoryPath, entry.name),
      isDirectory: entry.isDirectory(),
    }))
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
      return left.name.toLowerCase().localeCompare(right.name.toLowerCase());
    });
}

function shouldForwardProjectWatchPath(changedPath: string) {
  const normalized = changedPath.replace(/\\/g, "/").toLowerCase();
  if (/\/(node_modules|dist|target|\.next|\.turbo|\.cache|coverage)\//.test(normalized)) return false;
  if (normalized.includes("/.git/")) {
    return normalized.endsWith("/.git/head")
      || normalized.endsWith("/.git/index")
      || normalized.endsWith("/.git/refs")
      || normalized.includes("/.git/refs/");
  }
  return true;
}

function emitProjectFsEvent(projectPath: string, paths: string[]) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("shob:event", {
    channel: "project-fs-event",
    payload: { projectPath, paths },
  });
}

async function setProjectWatch(watchPath: string | null) {
  if (projectWatcher) {
    await projectWatcher.close();
    projectWatcher = null;
  }

  if (!watchPath) {
    lastWatcherOperationAt = Date.now();
    return;
  }

  const stats = await fs.stat(watchPath);
  if (!stats.isDirectory()) throw new Error("Project watch path is invalid");

  if (process.platform === "win32") {
    const elapsed = Date.now() - lastWatcherOperationAt;
    if (elapsed < 200) await new Promise((resolve) => setTimeout(resolve, 200 - elapsed));
  }

  const pendingPaths = new Set<string>();
  let flushTimer: NodeJS.Timeout | null = null;
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const paths = [...pendingPaths];
      pendingPaths.clear();
      if (paths.length) emitProjectFsEvent(watchPath, paths);
    }, 120);
  };

  projectWatcher = chokidar.watch(watchPath, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 25 },
    ignored: /(^|[\\/])(node_modules|dist|target|\.next|\.turbo|\.cache|coverage)([\\/]|$)/,
  });

  projectWatcher.on("all", (_event: string, changedPath: string) => {
    if (!shouldForwardProjectWatchPath(changedPath)) return;
    pendingPaths.add(changedPath);
    scheduleFlush();
  });

  lastWatcherOperationAt = Date.now();
}

function trimPtyReplayBuffer(session: PtyRuntime) {
  if (session.buffer.length <= PTY_REPLAY_BUFFER_LIMIT) return;
  const excess = session.buffer.length - PTY_REPLAY_BUFFER_LIMIT;
  session.buffer = session.buffer.slice(excess);
  session.bufferCursor += excess;
}

function flushPersistedPtyOutput(id: string, session: PtyRuntime) {
  if (session.persistQueue.timer) {
    clearTimeout(session.persistQueue.timer);
    session.persistQueue.timer = null;
  }

  if (session.persistQueue.chunks.length === 0) return;

  const payload = session.persistQueue.chunks.join("");
  session.persistQueue.chunks.length = 0;

  try {
    appendSessionOutput(id, payload);
  } catch (error) {
    console.warn("Failed to persist terminal output", { id, error });
  }
}

function schedulePersistedPtyOutput(id: string, session: PtyRuntime) {
  if (session.persistQueue.timer) return;

  session.persistQueue.timer = setTimeout(() => {
    flushPersistedPtyOutput(id, session);
  }, PTY_OUTPUT_FLUSH_DELAY_MS);
}

function queuePtyOutput(id: string, data: string) {
  const session = ptySessions.get(id);
  if (!session || session.status !== "running") return;

  session.cursor += data.length;
  session.buffer += data;
  trimPtyReplayBuffer(session);

  session.persistQueue.chunks.push(data);
  schedulePersistedPtyOutput(id, session);

  const item = session.outputQueue;
  item.chunks.push(data);
  if (item.scheduled) return;
  item.scheduled = true;
  setImmediate(() => {
    item.scheduled = false;
    if (!mainWindow || mainWindow.isDestroyed() || item.chunks.length === 0) return;
    const payload = item.chunks.join("");
    item.chunks.length = 0;
    mainWindow.webContents.send("shob:terminal-data", { id, data: payload });
  });
}

function getPtyReplayFromCursor(session: PtyRuntime, cursor: unknown) {
  const requested =
    typeof cursor === "number" && Number.isFinite(cursor)
      ? Math.max(0, Math.floor(cursor))
      : session.bufferCursor;

  if (requested <= session.bufferCursor) return session.buffer;
  if (requested >= session.cursor) return "";

  return session.buffer.slice(requested - session.bufferCursor);
}

function finishPty(id: string, session: PtyRuntime) {
  if (session.status === "exited") return;

  session.status = "exited";
  if (ptySessions.get(id) === session) {
    ptySessions.delete(id);
  }
  session.outputQueue.chunks.length = 0;
  session.outputQueue.scheduled = false;
  flushPersistedPtyOutput(id, session);
  try { session.proc.kill(); } catch { /* already exited */ }
  mainWindow?.webContents.send("shob:terminal-exit", { id });
}

function killPty(id: string) {
  const session = ptySessions.get(id);
  if (!session) return;
  finishPty(id, session);
}

function killAllPtys() {
  for (const id of [...ptySessions.keys()]) killPty(id);
}

async function revealInFinder(targetPath: string) {
  if (!fsSync.existsSync(targetPath)) throw new Error("Path does not exist");
  shell.showItemInFolder(targetPath);
}

async function getGitStatus(cwd: string) {
  let repoRoot = "";
  try {
    repoRoot = (await gitOutput(["rev-parse", "--show-toplevel"], cwd)).trim();
  } catch {
    return { repoRoot: null, changedFiles: [] };
  }
  const statusOutput = await gitOutput(["status", "--porcelain"], cwd);
  let numstatOutput = "";
  try {
    numstatOutput = await gitOutput(["diff", "--numstat", "HEAD"], cwd);
  } catch {
    numstatOutput = "";
  }

  const counts = new Map<string, [number, number]>();
  for (const line of numstatOutput.split(/\r?\n/)) {
    const [additions, deletions, filePath] = line.split("\t");
    if (filePath) counts.set(filePath, [Number(additions) || 0, Number(deletions) || 0]);
  }

  const changedFiles = [];
  for (const line of statusOutput.split(/\r?\n/)) {
    if (line.length < 4) continue;
    const status = line.slice(0, 2).trim();
    const relativePath = line.slice(3).trim().replace(/\\/g, "/");
    const absolutePath = path.join(repoRoot, relativePath.split("/").join(path.sep));
    const [additions, deletions] = status === "??"
      ? [countFileLines(absolutePath), 0]
      : (counts.get(relativePath) || [0, 0]);
    changedFiles.push({ path: relativePath, absolutePath, status, additions, deletions });
  }

  return { repoRoot, changedFiles };
}

function countFileLines(filePath: string) {
  try {
    return fsSync.readFileSync(filePath, "utf8").split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

async function readTextFileWithLimit(filePath: string, maxBytes: number) {
  let size = 0;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return { content: "", size: 0, isLarge: false };
  }
  if (size > maxBytes) return { content: "", size, isLarge: true };
  try {
    return { content: await fs.readFile(filePath, "utf8"), size, isLarge: false };
  } catch {
    return { content: "", size, isLarge: false };
  }
}

async function getGitFileState(filePath: string) {
  const current = await readTextFileWithLimit(filePath, MAX_EDITOR_PREVIEW_BYTES);
  const cwd = path.dirname(filePath);
  let repoRoot: string | null = null;
  try {
    repoRoot = (await gitOutput(["rev-parse", "--show-toplevel"], cwd)).trim();
  } catch {
    return {
      repoRoot: null,
      baseContent: "",
      currentContent: current.content,
      hasChanges: false,
      isLargeFile: current.isLarge,
      fileSizeBytes: current.size,
      status: "",
      additions: 0,
      deletions: 0,
    };
  }

  const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const statusLine = (await gitOutput(["status", "--porcelain", "--", relativePath], repoRoot).catch(() => ""))
    .split(/\r?\n/)[0]
    ?.trim() || "";
  const status = statusLine.length >= 2 ? statusLine.slice(0, 2).trim() : "";
  const numstatLine = (await gitOutput(["diff", "--numstat", "HEAD", "--", relativePath], repoRoot).catch(() => ""))
    .split(/\r?\n/)[0] || "";
  const parts = numstatLine.split("\t");
  let additions = Number(parts[0]) || 0;
  let deletions = Number(parts[1]) || 0;
  if (status === "??") {
    additions = current.content.split(/\r?\n/).length;
    deletions = 0;
  }

  let baseContent = "";
  let baseIsLarge = false;
  try {
    const { stdout } = await execFileAsync("git", ["show", `HEAD:${relativePath}`], {
      cwd: repoRoot,
      windowsHide: true,
      maxBuffer: MAX_EDITOR_PREVIEW_BYTES + 1,
      encoding: "buffer",
    });
    if ((stdout as Buffer).length > MAX_EDITOR_PREVIEW_BYTES) {
      baseIsLarge = true;
    } else {
      baseContent = (stdout as Buffer).toString("utf8");
    }
  } catch {
    baseContent = "";
  }

  return {
    repoRoot,
    baseContent,
    currentContent: current.content,
    hasChanges: Boolean(status),
    isLargeFile: current.isLarge || baseIsLarge,
    fileSizeBytes: current.size,
    status,
    additions,
    deletions,
  };
}

const handlers: Record<string, (payload?: any) => Promise<any> | any> = {
  opencode_server_start: async () => {
    return (await ensureServerStarted()).url;
  },
  get_projects: async () => loadPersistedProjects(),
  save_project: async ({ project }) => {
    return savePersistedProject(project);
  },
  delete_project: async ({ projectId }) => {
    deletePersistedProject(projectId);
  },
  save_session_output: async ({ sessionId, output }) => {
    savePersistedSessionOutput(sessionId, output || "");
  },
  load_session_output: async ({ sessionId }) => {
    return loadPersistedSessionOutput(sessionId);
  },
  read_image_data_url: async ({ path: imagePath }) => {
    const bytes = await fs.readFile(imagePath);
    return `data:${getImageMimeType(imagePath)};base64,${bytes.toString("base64")}`;
  },
  get_available_shells: async () => detectShells(),
  get_terminal_host_info: async () => ({
    os: normalizeOs(),
    windowsBuildNumber: await detectWindowsBuildNumber(),
  }),
  probe_cli_tools: async ({ items }) => items.map((item: any) => {
    let resolvedPath: string | null = null;
    let matchedCommand: string | null = null;
    for (const command of item.commands || []) {
      resolvedPath = resolveCommand(command);
      if (resolvedPath) {
        matchedCommand = command;
        break;
      }
    }
    return { id: item.id, installed: Boolean(resolvedPath), resolvedPath, matchedCommand };
  }),
  set_project_watch: async ({ path: watchPath }) => setProjectWatch(watchPath),
  list_directory: async ({ path: directoryPath }) => listDirectory(directoryPath),
  read_text_file: async ({ path: filePath }) => {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error: any) {
      if (error?.code === "ENOENT") return "";
      throw error;
    }
  },
  get_git_status: async ({ path: cwd }) => getGitStatus(cwd),
  get_git_branch: async ({ path: cwd }) => {
    try {
      const head = (await gitOutput(["branch", "--show-current"], cwd)).trim();
      if (!head) throw new Error("No branch");
      const upstream = (await gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], cwd).catch(() => ""))
        .trim() || null;
      const remoteName = (await gitOutput(["config", "--get", `branch.${head}.remote`], cwd).catch(() => ""))
        .trim() || upstream?.split("/")[0] || (await gitOutput(["remote"], cwd).catch(() => "")).split(/\r?\n/).find(Boolean) || null;
      const remoteUrl = remoteName ? await gitOutput(["remote", "get-url", remoteName], cwd).catch(() => "") : "";
      return { repoName: parseRepoNameFromRemoteUrl(remoteUrl), head, upstream };
    } catch {
      return { repoName: null, head: null, upstream: null };
    }
  },
  get_git_branches: async ({ path: cwd }) => {
    try {
      const output = await gitOutput(["for-each-ref", "--format=%(refname:short)", "refs/heads"], cwd);
      return { branches: output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort() };
    } catch {
      return { branches: [] };
    }
  },
  switch_git_branch: async ({ path: cwd, branch }) => {
    try {
      await gitOutput(["switch", branch], cwd);
    } catch {
      await gitOutput(["checkout", branch], cwd);
    }
  },
  get_git_file_base: async ({ path: filePath }) => {
    const repoRoot = (await gitOutput(["rev-parse", "--show-toplevel"], path.dirname(filePath))).trim();
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    return gitOutput(["show", `HEAD:${relativePath}`], repoRoot).catch(() => "");
  },
  get_git_file_state: async ({ path: filePath }) => getGitFileState(filePath),
  cleanup_runtime: async () => {
    await setProjectWatch(null);
    killAllPtys();
  },
  set_window_background: async ({ color }) => {
    if (typeof color !== "string" || !color.trim()) return;
    mainWindow?.setBackgroundColor(color);
  },
  set_titlebar_overlay_options: async ({ color, symbolColor, height }) => {
    if (!mainWindow) return;
    const opts: Electron.TitleBarOverlay = {};
    if (typeof color === "string") opts.color = color;
    if (typeof symbolColor === "string") opts.symbolColor = symbolColor;
    if (typeof height === "number") opts.height = height;
    if (Object.keys(opts).length > 0) {
      mainWindow.setTitleBarOverlay(opts);
    }
  },
  minimize_window: async () => mainWindow?.minimize(),
  toggle_maximize_window: async () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  },
  is_window_maximized: async () => Boolean(mainWindow?.isMaximized()),
  close_window: async () => mainWindow?.close(),
  reveal_in_finder: async ({ path: targetPath }) => revealInFinder(targetPath),
  show_open_dialog: async (options) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: options?.title,
      properties: [
        options?.directory ? "openDirectory" : "openFile",
        options?.multiple ? "multiSelections" : null,
      ].filter(Boolean) as ("openDirectory" | "openFile" | "multiSelections")[],
      filters: options?.filters,
    });
    if (result.canceled) return options?.multiple ? [] : null;
    return options?.multiple ? result.filePaths : result.filePaths[0] || null;
  },
  open_external: async ({ url }) => shell.openExternal(url),
};

function registerIpc() {
  ipcMain.handle("shob:invoke", async (_event, command, payload = {}) => {
    const handler = handlers[command];
    if (!handler) throw new Error(`Unknown IPC command: ${command}`);
    return handler(payload);
  });

  ipcMain.on("shob:get-opencode-server-url", (event) => {
    event.returnValue = serverInstance?.url ?? null;
  });

  ipcMain.handle("shob:terminal-spawn", async (_event, options) => {
    const id = options.id || crypto.randomUUID();
    const existing = ptySessions.get(id);
    if (existing && existing.status === "running") {
      const cols = Math.max(2, Number(options.cols) || 80);
      const rows = Math.max(2, Number(options.rows) || 24);
      let resized = true;
      try {
        existing.proc.resize(cols, rows);
      } catch {
        resized = false;
      }

      if (resized && ptySessions.get(id) === existing && existing.status === "running") {
        return {
          id,
          reused: true,
          buffer: getPtyReplayFromCursor(existing, options.cursor),
          bufferCursor: existing.bufferCursor,
          cursor: existing.cursor,
        };
      }

      finishPty(id, existing);
    }

    const proc = pty.spawn(options.shell, options.args || [], {
      name: "xterm-256color",
      cwd: options.cwd || os.homedir(),
      cols: Math.max(2, Number(options.cols) || 80),
      rows: Math.max(2, Number(options.rows) || 24),
      env: {
        ...process.env,
        ...(options.env || {}),
        SHOB_SESSION_ID: id,
        SHOB_TERMINAL_SESSION: id,
      },
    });

    const runtime: PtyRuntime = {
      proc,
      outputQueue: { chunks: [], scheduled: false },
      persistQueue: { chunks: [], timer: null },
      buffer: "",
      bufferCursor: 0,
      cursor: 0,
      status: "running",
    };

    ptySessions.set(id, runtime);
    proc.onData((data: string) => queuePtyOutput(id, data));
    proc.onExit(() => {
      finishPty(id, runtime);
    });

    return { id, reused: false, buffer: "", bufferCursor: 0, cursor: 0 };
  });

  ipcMain.handle("shob:terminal-write", (_event, id, data) => {
    const session = ptySessions.get(id);
    if (session?.status === "running") session.proc.write(data);
  });

  ipcMain.handle("shob:terminal-resize", (_event, id, cols, rows) => {
    const session = ptySessions.get(id);
    if (session?.status === "running") {
      session.proc.resize(Math.max(2, Number(cols) || 80), Math.max(2, Number(rows) || 24));
    }
  });

  ipcMain.handle("shob:terminal-kill", (_event, id) => {
    killPty(id);
  });
}

async function createWindow() {
  await ensureDataDirs();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    titleBarOverlay: {
      color: "#09090b",
      symbolColor: "#ffffff",
      height: 38,
    },
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("maximize", () => mainWindow?.webContents.send("shob:window-state", { maximized: true }));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("shob:window-state", { maximized: false }));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
}

app.setName("shob");
app.whenReady().then(async () => {
  registerIpc();
  try {
    await ensureServerStarted();
  } catch (err) {
    console.error("[shob] failed to start server:", err);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async () => {
  await handlers.cleanup_runtime();
  if (serverInstance) {
    await serverInstance.stop();
    serverInstance = null;
  }
  closeSessionDatabase();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
