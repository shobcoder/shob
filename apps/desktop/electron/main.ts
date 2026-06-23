import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import Store from "electron-store";
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
  reorderProjects as reorderPersistedProjects,
  saveProject as savePersistedProject,
  saveSessionOutput as savePersistedSessionOutput,
  loadWorkTerminals,
  saveWorkTerminal,
  deleteWorkTerminal,
  reorderWorkTerminals,
  loadTerminalLayout,
  saveTerminalLayout,
} from "./session-db.js";
import { detectShells } from "./shell-detector.js";
import { startServer, type ServerInstance } from "./server.js";
import { applyMacDockIcon, applyWindowIcon, applyWindowsAppIdentity, resolveAppIconPath } from "./icon.js";
import { createBrowserControl } from "./browser-control.js";

const execFileAsync = promisify(execFile);
const isDev = !app.isPackaged;
const MAX_EDITOR_PREVIEW_BYTES = 512 * 1024;
const UPDATE_CHECK_RETRY_DELAY_MS = 1500;
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
let browserControl: ReturnType<typeof createBrowserControl> | null = null;
const ptySessions = new Map<string, PtyRuntime>();
let downloadedUpdateVersion: string | null = null;
let availableUpdateVersion: string | null = null;
let updateDownloadInFlight = false;

const RELEASES_URL = "https://github.com/shobcoder/shob/releases/latest";
const autoUpdateSupported = process.platform !== "darwin";
const PTY_REPLAY_BUFFER_LIMIT = 128 * 1024; // 128KB buffer per session
const PTY_OUTPUT_FLUSH_DELAY_MS = 500;
const TITLEBAR_HEIGHT = 40;

app.setName("shob");
applyWindowsAppIdentity();

const DEFAULT_STORAGE_NAME = "default.dat";
const storageStores = new Map<string, Store<Record<string, string>>>();

function titlebarTone() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function titlebarOverlay(mode: "light" | "dark" = titlebarTone(), zoom = 1) {
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: Math.max(TITLEBAR_HEIGHT, Math.round(TITLEBAR_HEIGHT * zoom)),
  };
}

function updateWindowTitlebarOverlay(win: BrowserWindow, mode: "light" | "dark" = titlebarTone()) {
  if (process.platform !== "win32") return;
  win.setTitleBarOverlay(titlebarOverlay(mode, win.webContents.getZoomFactor()));
}

function userDataPath(...parts: string[]) {
  return path.join(app.getPath("userData"), ...parts);
}

function configureSessionDataPath() {
  const sessionDataPath = userDataPath("chromium");
  fsSync.mkdirSync(sessionDataPath, { recursive: true });
  app.setPath("sessionData", sessionDataPath);
}

configureSessionDataPath();

async function ensureDataDirs() {
  await fs.mkdir(userDataPath("sessions"), { recursive: true });
  await fs.mkdir(userDataPath("storage"), { recursive: true });
  initSessionDatabase();
}

function normalizeStorageName(name: unknown) {
  const value = typeof name === "string" && name.trim() ? name.trim() : DEFAULT_STORAGE_NAME;
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error("Invalid storage name");
  return value;
}

function normalizeStorageKey(key: unknown) {
  if (typeof key !== "string" || !key) throw new Error("Invalid storage key");
  if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("Invalid storage key");
  return key;
}

function persistentStore(name: unknown) {
  const storageName = normalizeStorageName(name);
  let store = storageStores.get(storageName);
  if (!store) {
    store = new Store<Record<string, string>>({
      name: storageName,
      cwd: "storage",
      accessPropertiesByDotNotation: false,
    });
    storageStores.set(storageName, store);
  }
  return store;
}

function storageGet(name: unknown, key: unknown) {
  const value = persistentStore(name).get(normalizeStorageKey(key));
  return typeof value === "string" ? value : null;
}

function storageSet(name: unknown, key: unknown, value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid storage value");
  persistentStore(name).set(normalizeStorageKey(key), value);
}

function storageRemove(name: unknown, key: unknown) {
  persistentStore(name).delete(normalizeStorageKey(key));
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

function sendAppEvent(channel: string, payload: any) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("shob:event", {
    channel,
    payload,
  });
}

function sendUpdateEvent(channel: string, payload: any) {
  sendAppEvent(`update:${channel}`, payload);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function isTransientUpdateError(error: unknown) {
  const message = getErrorMessage(error);
  return /HttpError:\s*(?:500|502|503|504)|status(?:Code)?["'\s:=]+(?:500|502|503|504)|(?:500|502|503|504)\s+(?:Gateway|Service|Internal|Bad)|Gateway Time-?out|Bad Gateway|Service Unavailable|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|fetch failed|network/i.test(message);
}

function formatUpdateError(error: unknown) {
  const message = getErrorMessage(error);

  if (/HttpError:\s*(?:500|502|503|504)|status(?:Code)?["'\s:=]+(?:500|502|503|504)|(?:500|502|503|504)\s+(?:Gateway|Service|Internal|Bad)|Gateway Time-?out|Bad Gateway|Service Unavailable/i.test(message)) {
    return "GitHub is temporarily unavailable while checking for updates. Please try again in a few minutes.";
  }

  if (/ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|fetch failed|network/i.test(message)) {
    return "Could not reach the update server. Please check your internet connection and try again.";
  }

  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|Cannot find .*latest.* release artifacts/i.test(message)) {
    return "The latest release is missing update metadata. Please download the installer from GitHub releases.";
  }

  if (/ERR_UPDATER_LATEST_VERSION_NOT_FOUND|Unable to find latest version/i.test(message)) {
    return "Could not find the latest production release on GitHub.";
  }

  return "Could not check for updates. Please try again later.";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkForUpdatesWithRetry() {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    if (!isTransientUpdateError(error)) throw error;
    console.warn("[shob] transient update check failure, retrying:", error);
    await delay(UPDATE_CHECK_RETRY_DELAY_MS);
    return autoUpdater.checkForUpdates();
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = autoUpdateSupported;

  autoUpdater.on("checking-for-update", () => {
    console.log("[shob] checking for update...");
    sendUpdateEvent("checking", null);
  });

  autoUpdater.on("error", (error) => {
    console.warn("[shob] auto update failed:", error);
    updateDownloadInFlight = false;
    sendUpdateEvent("error", formatUpdateError(error));
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[shob] update available:", info.version);
    availableUpdateVersion = info.version;
    downloadedUpdateVersion = null;
    if (!autoUpdateSupported) {
      // macOS: notify only — do not auto-download an update that can't be applied.
      updateDownloadInFlight = false;
      sendUpdateEvent("available", info);
      return;
    }
    updateDownloadInFlight = true;
    sendUpdateEvent("available", info);
    autoUpdater.downloadUpdate().catch((error) => {
      updateDownloadInFlight = false;
      console.warn("[shob] failed to auto-download update:", error);
      sendUpdateEvent("error", formatUpdateError(error));
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[shob] update not available:", info.version);
    availableUpdateVersion = null;
    downloadedUpdateVersion = null;
    updateDownloadInFlight = false;
    sendUpdateEvent("not-available", info);
  });

  autoUpdater.on("download-progress", (progressObj) => {
    console.log("[shob] download progress:", progressObj.percent);
    sendUpdateEvent("progress", {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      total: progressObj.total,
      transferred: progressObj.transferred,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[shob] update downloaded:", info.version);
    availableUpdateVersion = info.version;
    downloadedUpdateVersion = info.version;
    updateDownloadInFlight = false;
    sendUpdateEvent("downloaded", info);
  });
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

const resolveCommandCache = new Map<string, string | null>();

function resolveCommand(command: string): string | null {
  if (resolveCommandCache.has(command)) return resolveCommandCache.get(command) ?? null;

  const direct = path.resolve(command);
  if (path.isAbsolute(command) && fsSync.existsSync(command)) { resolveCommandCache.set(command, command); return command; }
  if (fsSync.existsSync(direct) && path.isAbsolute(command)) { resolveCommandCache.set(command, direct); return direct; }

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
        resolveCommandCache.set(command, candidate);
        return candidate;
      }
    }
  }

  resolveCommandCache.set(command, null);
  return null;
}

// detectShells is imported from shell-detector.js

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
      if (paths.length) {
        // Cap to 500 files to prevent IPC overflow and UI freezes
        const payload = paths.length > 500 ? paths.slice(0, 500) : paths;
        emitProjectFsEvent(watchPath, payload);
      }
    }, 120);
  };

  projectWatcher = chokidar.watch(watchPath, {
    ignoreInitial: true,
    persistent: true,
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
  // Use hysteresis: trim back to 80% of limit to avoid slicing on every byte
  const targetLength = Math.floor(PTY_REPLAY_BUFFER_LIMIT * 0.8);
  const excess = session.buffer.length - targetLength;
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
  setTimeout(() => {
    item.scheduled = false;
    if (!mainWindow || mainWindow.isDestroyed() || item.chunks.length === 0) return;
    const payload = item.chunks.join("");
    item.chunks.length = 0;
    mainWindow.webContents.send("shob:terminal-data", { id, data: payload });
  }, 16);
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

type OpenProjectTarget = string;

// macOS "Open with" catalog. Each entry maps a stable id to its on-disk app
// name (used both for detection and `open -a`) and the bundled AppIcon id the
// renderer should show. Unlike the Windows/Linux path, the menu is built from
// what's actually installed (detectMacOpenWithApps) rather than a fixed list.
type MacOpenWithKind = "editor" | "terminal" | "reveal";
interface MacOpenWithApp {
  id: string;
  label: string;
  icon: string;
  kind: MacOpenWithKind;
  appName?: string; // bundle name without ".app"; omitted for reveal (handled specially)
}

const MAC_OPEN_WITH_CATALOG: MacOpenWithApp[] = [
  { id: "vscode", label: "VS Code", icon: "vscode", kind: "editor", appName: "Visual Studio Code" },
  { id: "cursor", label: "Cursor", icon: "cursor", kind: "editor", appName: "Cursor" },
  { id: "zed", label: "Zed", icon: "zed", kind: "editor", appName: "Zed" },
  { id: "sublime-text", label: "Sublime Text", icon: "sublime-text", kind: "editor", appName: "Sublime Text" },
  { id: "xcode", label: "Xcode", icon: "xcode", kind: "editor", appName: "Xcode" },
  { id: "terminal", label: "Terminal", icon: "terminal", kind: "terminal", appName: "Terminal" },
  { id: "iterm2", label: "iTerm", icon: "iterm2", kind: "terminal", appName: "iTerm" },
  { id: "ghostty", label: "Ghostty", icon: "ghostty", kind: "terminal", appName: "Ghostty" },
  { id: "warp", label: "Warp", icon: "warp", kind: "terminal", appName: "Warp" },
  { id: "finder", label: "Finder", icon: "finder", kind: "reveal" },
];

const MAC_APP_DIRS = [
  "/Applications",
  "/Applications/Utilities",
  "/System/Applications",
  "/System/Applications/Utilities",
  path.join(os.homedir(), "Applications"),
];

function macAppInstalled(appName: string) {
  return MAC_APP_DIRS.some((dir) => fsSync.existsSync(path.join(dir, `${appName}.app`)));
}

type DetectedOpenWithApp = { id: string; label: string; icon: string; kind: MacOpenWithKind };

// The installed-app set doesn't change within a session, and every header mount
// queries it — so detect once and reuse (each call would otherwise re-run ~45
// existsSync checks).
let macOpenWithAppsCache: DetectedOpenWithApp[] | undefined;

function detectMacOpenWithApps(): DetectedOpenWithApp[] {
  if (!macOpenWithAppsCache) {
    macOpenWithAppsCache = MAC_OPEN_WITH_CATALOG.filter(
      (app) => app.kind === "reveal" || (app.appName ? macAppInstalled(app.appName) : false),
    ).map(({ id, label, icon, kind }) => ({ id, label, icon, kind }));
  }
  return macOpenWithAppsCache;
}

function listOpenWithApps() {
  if (process.platform === "darwin") return { apps: detectMacOpenWithApps() };
  // Windows/Linux keep the renderer's existing static list.
  return { apps: [] as DetectedOpenWithApp[] };
}

async function openProjectWithMac(projectPath: string, id: string) {
  const app = MAC_OPEN_WITH_CATALOG.find((entry) => entry.id === id);
  if (!app) throw new Error("Unsupported open target");
  if (app.kind === "reveal") {
    const error = await shell.openPath(projectPath);
    if (error) throw new Error(error);
    return;
  }
  await launchDetached("open", ["-a", app.appName as string, projectPath], projectPath);
}

type SkillStoreCatalogItem = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  iconKey: string;
  skillMarkdown: string;
};

const SHOB_SKILL_STORE_MARKER = "<!-- shob-skill-store";
const SHOB_SKILL_STORE_MARKER_FILE = ".shob-skill-store.json";
const SHOB_SKILL_STORE_SOURCE = "shob/builtin-skills";
const LEGACY_DUMMY_SKILL_TEXT = "This Shob store skill provides workflow guidance only.";

function skillStoreRoot() {
  return path.join(os.homedir(), ".agents", "skills");
}

function displayNameFromSkillName(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || value;
}

function normalizeSkillDescription(value?: string | null) {
  return value?.replace(/\s+/g, " ").replace(/\.$/, "").trim() || "Built-in Shob skill";
}

function cleanFrontMatterValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

function parseSkillFrontMatter(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const result: { name?: string; description?: string } = {};
  if (!match) return result;

  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const block = lines[index].match(/^([A-Za-z0-9_-]+):\s*[>|]\s*$/);
    if (block) {
      const key = block[1];
      const chunks: string[] = [];
      while (index + 1 < lines.length && (/^\s+/.test(lines[index + 1]) || lines[index + 1].trim() === "")) {
        index += 1;
        const value = lines[index].trim();
        if (value) chunks.push(value);
      }
      if (key === "name") result.name = chunks.join(" ");
      if (key === "description") result.description = chunks.join(" ");
      continue;
    }

    const field = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, value] = field;
    if (key === "name") result.name = cleanFrontMatterValue(value);
    if (key === "description") result.description = cleanFrontMatterValue(value);
  }

  return result;
}

function builtInSkillRootCandidates() {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const packagedRoot = resourcesPath ? path.join(resourcesPath, "skills") : null;
  const devRoots = [
    path.join(process.cwd(), "skills"),
    path.resolve(__dirname, "..", "skills"),
    path.resolve(process.cwd(), "../../skills"),
    path.resolve(__dirname, "../../..", "skills")
  ];
  return app.isPackaged ? [packagedRoot, ...devRoots].filter(Boolean) as string[] : [...devRoots, packagedRoot].filter(Boolean) as string[];
}

async function resolveBuiltInSkillRoot() {
  for (const candidate of builtInSkillRootCandidates()) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function iconKeyForBuiltInSkill(skillId: string) {
  if (skillId.includes("caveman")) return "speech";
  if (skillId.includes("frontend-design")) return "palette";
  return "sparkles";
}

let builtInSkillCatalogCache: SkillStoreCatalogItem[] | null = null;

async function readBuiltInSkillCatalog() {
  if (builtInSkillCatalogCache) return builtInSkillCatalogCache;

  const root = await resolveBuiltInSkillRoot();
  if (!root) return [];

  const entries = await fs.readdir(root, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9._-]*$/i.test(entry.name))
      .map(async (entry) => {
        const skillFile = path.join(root, entry.name, "SKILL.md");
        try {
          const skillMarkdown = await fs.readFile(skillFile, "utf8");
          const metadata = parseSkillFrontMatter(skillMarkdown);
          const name = metadata.name || entry.name;
          return {
            id: entry.name,
            name,
            displayName: displayNameFromSkillName(name),
            description: normalizeSkillDescription(metadata.description),
            category: "Built-in",
            iconKey: iconKeyForBuiltInSkill(entry.name),
            skillMarkdown,
          };
        } catch (error: any) {
          if (error?.code === "ENOENT") return null;
          throw error;
        }
      }),
  );

  builtInSkillCatalogCache = items
    .filter((item): item is SkillStoreCatalogItem => item !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return builtInSkillCatalogCache;
}

async function resolveSkillStoreItem(skillId: string) {
  const catalog = await readBuiltInSkillCatalog();
  return catalog.find((item) => item.id === skillId);
}

function resolveManagedSkillDir(skillId: string) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(skillId)) throw new Error("Invalid skill id");
  const root = path.resolve(skillStoreRoot());
  const target = path.resolve(root, skillId);
  if (target !== root && target.startsWith(`${root}${path.sep}`)) return { root, target };
  throw new Error("Invalid skill install path");
}

async function readSkillStoreFile(skillId: string) {
  const { target } = resolveManagedSkillDir(skillId);
  const filePath = path.join(target, "SKILL.md");
  try {
    return { filePath, content: await fs.readFile(filePath, "utf8") };
  } catch (error: any) {
    if (error?.code === "ENOENT") return { filePath, content: null };
    throw error;
  }
}

async function readManagedMarker(skillId: string) {
  const { target } = resolveManagedSkillDir(skillId);
  try {
    return await fs.readFile(path.join(target, SHOB_SKILL_STORE_MARKER_FILE), "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function isLegacyDummySkill(skillId: string, content: string | null) {
  return Boolean(content?.includes(`${SHOB_SKILL_STORE_MARKER}:${skillId}`) && content.includes(LEGACY_DUMMY_SKILL_TEXT));
}

function parseSkillStoreMarker(marker: string | null) {
  if (!marker) return null;
  try {
    return JSON.parse(marker) as { source?: string };
  } catch {
    return null;
  }
}

async function readSkillInstallState(skillId: string) {
  const { filePath, content } = await readSkillStoreFile(skillId);
  const marker = await readManagedMarker(skillId);
  const markerData = parseSkillStoreMarker(marker);
  const legacyDummy = isLegacyDummySkill(skillId, content);
  return {
    filePath,
    content,
    installed: content !== null && !legacyDummy,
    managed: markerData?.source === SHOB_SKILL_STORE_SOURCE || legacyDummy,
    deprecatedManaged: Boolean(markerData?.source && markerData.source !== SHOB_SKILL_STORE_SOURCE),
    legacyDummy,
  };
}

async function cleanupDeprecatedStoreSkills(activeSkillIds = new Set<string>()) {
  let entries: fsSync.Dirent[];
  try {
    entries = await fs.readdir(skillStoreRoot(), { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(entry.name)) continue;
    const { target } = resolveManagedSkillDir(entry.name);
    const state = await readSkillInstallState(entry.name);
    if (state.legacyDummy || state.deprecatedManaged || (state.managed && !activeSkillIds.has(entry.name))) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }
}

async function listSkillStore() {
  const catalog = await readBuiltInSkillCatalog();
  await cleanupDeprecatedStoreSkills(new Set(catalog.map((item) => item.id)));
  return Promise.all(
    catalog.map(async (item) => {
      const state = await readSkillInstallState(item.id);
      return {
        ...item,
        name: item.id,
        installed: state.installed,
        managed: state.managed && state.installed,
        location: state.installed ? state.filePath : null,
      };
    }),
  );
}

async function installSkill(skillId: string) {
  const item = await resolveSkillStoreItem(skillId);
  if (!item) throw new Error(`Unknown skill: ${skillId}`);

  const { target } = resolveManagedSkillDir(item.id);
  const state = await readSkillInstallState(item.id);
  if (state.content && !state.managed) {
    return {
      ...item,
      name: item.id,
      installed: true,
      managed: false,
      location: state.filePath,
    };
  }

  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  try {
    await fs.writeFile(path.join(target, "SKILL.md"), item.skillMarkdown, "utf8");
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
    );
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true });
    throw error;
  }

  return {
    ...item,
    name: item.id,
    installed: true,
    managed: true,
    location: path.join(target, "SKILL.md"),
  };
}

async function uninstallSkill(skillId: string) {
  const item = await resolveSkillStoreItem(skillId);
  if (!item) throw new Error(`Unknown skill: ${skillId}`);

  const { root, target } = resolveManagedSkillDir(item.id);
  const state = await readSkillInstallState(item.id);
  if (!state.content) return { ok: true };
  if (!state.managed) {
    throw new Error("This skill was not installed by Shob Skill Store.");
  }
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === root || !resolvedTarget.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing to remove a path outside the skill store.");
  }
  await fs.rm(resolvedTarget, { recursive: true, force: true });
  return { ok: true };
}

function assertProjectDirectory(targetPath: string) {
  if (!targetPath || !fsSync.existsSync(targetPath)) throw new Error("Project path does not exist");
  const stats = fsSync.statSync(targetPath);
  if (!stats.isDirectory()) throw new Error("Project path is not a directory");
  return path.resolve(targetPath);
}

function launchDetached(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
    });
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    child.once("error", (error) => settle(() => reject(error)));
    child.once("spawn", () => {
      child.unref();
      setTimeout(() => settle(resolve), 80);
    });
  });
}

function firstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
}

function quotePowerShellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function startWindowsProcess(command: string, args: string[], cwd: string) {
  const powershell = resolveCommand("powershell.exe") || "powershell.exe";
  const argumentList = args.length
    ? ` -ArgumentList @(${args.map(quotePowerShellString).join(", ")})`
    : "";
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `Start-Process -FilePath ${quotePowerShellString(command)}${argumentList} -WorkingDirectory ${quotePowerShellString(cwd)}`,
  ].join("; ");

  await execFileAsync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd,
    windowsHide: true,
  });
}

function resolveVSCodeCommand() {
  return (
    firstExistingPath(
      process.platform === "win32"
        ? [
            path.join(os.homedir(), "AppData", "Local", "Programs", "Microsoft VS Code", "Code.exe"),
            path.join(os.homedir(), "AppData", "Local", "Programs", "Microsoft VS Code", "bin", "code.cmd"),
            "C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd",
            "C:\\Program Files\\Microsoft VS Code\\Code.exe",
            "C:\\Program Files (x86)\\Microsoft VS Code\\bin\\code.cmd",
            "C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe",
          ]
        : [],
    ) ||
    resolveCommand("code.cmd") ||
    resolveCommand("code.exe") ||
    resolveCommand("code")
  );
}

function resolveGitBashCommand() {
  return (
    resolveCommand("git-bash.exe") ||
    firstExistingPath([
      "C:\\Program Files\\Git\\git-bash.exe",
      "C:\\Program Files (x86)\\Git\\git-bash.exe",
      path.join(os.homedir(), "AppData", "Local", "Programs", "Git", "git-bash.exe"),
    ])
  );
}

function toWslPath(targetPath: string) {
  const resolved = path.resolve(targetPath);
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(resolved);
  if (!match) return resolved.replace(/\\/g, "/");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

async function openProjectWith(targetPath: string, target: OpenProjectTarget) {
  const projectPath = assertProjectDirectory(targetPath);

  // On macOS the menu is detection-driven, so any catalog id may arrive here.
  if (process.platform === "darwin" && MAC_OPEN_WITH_CATALOG.some((app) => app.id === target)) {
    return openProjectWithMac(projectPath, target);
  }

  if (target === "explorer") {
    const error = await shell.openPath(projectPath);
    if (error) throw new Error(error);
    return;
  }

  if (target === "vscode") {
    const command = resolveVSCodeCommand();
    if (!command) throw new Error("VS Code command was not found");
    await launchDetached(command, [projectPath], projectPath);
    return;
  }

  if (target === "terminal") {
    if (process.platform === "win32") {
      const shellCommand = process.env.ComSpec || resolveCommand("cmd.exe") || "cmd.exe";
      await startWindowsProcess(shellCommand, [], projectPath);
      return;
    }
    if (process.platform === "darwin") {
      await launchDetached("open", ["-a", "Terminal", projectPath], projectPath);
      return;
    }
    const terminal = resolveCommand("gnome-terminal") || resolveCommand("konsole") || resolveCommand("x-terminal-emulator");
    if (!terminal) throw new Error("Terminal application was not found");
    if (terminal.includes("gnome-terminal")) await launchDetached(terminal, [`--working-directory=${projectPath}`], projectPath);
    else if (terminal.includes("konsole")) await launchDetached(terminal, ["--workdir", projectPath], projectPath);
    else await launchDetached(terminal, [], projectPath);
    return;
  }

  if (target === "git-bash") {
    if (process.platform !== "win32") throw new Error("Git Bash is only available on Windows");
    const command = resolveGitBashCommand();
    if (!command) throw new Error("Git Bash was not found");
    await launchDetached(command, [`--cd=${projectPath}`], projectPath);
    return;
  }

  if (target === "wsl") {
    if (process.platform !== "win32") throw new Error("WSL is only available on Windows");
    const wsl = resolveCommand("wsl.exe") || "wsl.exe";
    const wt = resolveCommand("wt.exe") || resolveCommand("wt");
    const wslPath = toWslPath(projectPath);
    if (wt) await launchDetached(wt, [wsl, "--cd", wslPath], projectPath);
    else await launchDetached(wsl, ["--cd", wslPath], projectPath);
    return;
  }

  throw new Error("Unsupported open target");
}

const GIT_CACHE_TTL_MS = 2000;
const gitStatusCache = new Map<string, { ts: number; data: any }>();
const gitFileStateCache = new Map<string, { ts: number; data: any }>();

async function getGitStatus(cwd: string) {
  const now = Date.now();
  const cached = gitStatusCache.get(cwd);
  if (cached && now - cached.ts < GIT_CACHE_TTL_MS) return cached.data;

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

  const result = { repoRoot, changedFiles };
  gitStatusCache.set(cwd, { ts: now, data: result });
  return result;
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
  const now = Date.now();
  const cached = gitFileStateCache.get(filePath);
  if (cached && now - cached.ts < GIT_CACHE_TTL_MS) {
    const { repoRoot, baseContent, baseIsLarge, status, additions, deletions } = cached.data;
    return {
      repoRoot,
      baseContent: baseIsLarge ? "" : baseContent,
      currentContent: current.content,
      hasChanges: current.content !== (baseIsLarge ? "" : baseContent),
      isLargeFile: current.isLarge || baseIsLarge,
      fileSizeBytes: current.size,
      status,
      additions,
      deletions,
    };
  }

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

  gitFileStateCache.set(filePath, {
    ts: now,
    data: { repoRoot, baseContent, baseIsLarge, status, additions, deletions }
  });

  return {
    repoRoot,
    baseContent: baseIsLarge ? "" : baseContent,
    currentContent: current.content,
    hasChanges: current.content !== (baseIsLarge ? "" : baseContent),
    isLargeFile: current.isLarge || baseIsLarge,
    fileSizeBytes: current.size,
    status,
    additions,
    deletions,
  };
}

const handlers: Record<string, (payload?: any) => Promise<any> | any> = {
  get_app_info: async () => ({
    name: app.getName(),
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: normalizeOs(),
  }),
  storage_set: async ({ storage, key, value }) => {
    storageSet(storage, key, value);
  },
  storage_remove: async ({ storage, key }) => {
    storageRemove(storage, key);
  },
  get_update_status: async () => ({
    status: !app.isPackaged
      ? "dev"
      : downloadedUpdateVersion
        ? "downloaded"
        : updateDownloadInFlight
          ? "downloading"
          : availableUpdateVersion
            ? "available"
            : "idle",
    version: downloadedUpdateVersion ?? availableUpdateVersion,
    downloaded: Boolean(downloadedUpdateVersion),
    downloading: updateDownloadInFlight,
  }),
  check_for_updates: async ({ manual } = {}) => {
    if (!app.isPackaged) {
      if (manual) {
        await dialog.showMessageBox({
          type: "info",
          title: "Update",
          message: "You are running in development mode. Auto-updates are disabled.",
        });
      }
      return { status: "dev" };
    }
    try {
      const result = await checkForUpdatesWithRetry();
      if (manual && result && !result.isUpdateAvailable) {
        await dialog.showMessageBox({
          type: "info",
          title: "Up to Date",
          message: "You are already running the latest version of Shob.",
        });
      }
      return {
        status: "success",
        updateAvailable: result?.isUpdateAvailable,
        version: result?.updateInfo?.version,
        downloaded: Boolean(downloadedUpdateVersion),
      };
    } catch (error) {
      console.warn("[shob] update check failed:", error);
      const message = formatUpdateError(error);
      if (manual) {
        await dialog.showMessageBox({
          type: "error",
          title: "Update Error",
          message,
        });
      }
      return { status: "error", message };
    }
  },
  install_update: async () => {
    if (!app.isPackaged) return { status: "dev" };
    if (!autoUpdateSupported) {
      await shell.openExternal(RELEASES_URL);
      return { status: "manual", url: RELEASES_URL };
    }
    if (!downloadedUpdateVersion) return { status: "not-downloaded" };
    autoUpdater.quitAndInstall(false, true);
    return { status: "installing", version: downloadedUpdateVersion };
  },
  download_update: async () => {
    if (!app.isPackaged) return { status: "dev" };
    if (!autoUpdateSupported) {
      await shell.openExternal(RELEASES_URL);
      return { status: "manual", url: RELEASES_URL };
    }
    if (downloadedUpdateVersion) return { status: "downloaded", version: downloadedUpdateVersion };
    if (updateDownloadInFlight) return { status: "downloading" };
    try {
      updateDownloadInFlight = true;
      await autoUpdater.downloadUpdate();
      return { status: "downloading" };
    } catch (error) {
      updateDownloadInFlight = false;
      console.warn("[shob] failed to start update download:", error);
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  },
  shob_server_start: async () => {
    return (await ensureServerStarted()).url;
  },
  browser_action: async (payload) => {
    if (!browserControl) throw new Error("Browser control is not available");
    return browserControl.handle(payload);
  },
  get_projects: async () => loadPersistedProjects(),
  save_project: async ({ project }) => {
    return savePersistedProject(project);
  },
  reorder_projects: async ({ projectIds }) => {
    return reorderPersistedProjects(Array.isArray(projectIds) ? projectIds : []);
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
  list_work_terminals: async ({ projectId }) => loadWorkTerminals(projectId),
  create_work_terminal: async ({ projectId, shell, title, sortOrder }) => {
    const id = crypto.randomUUID();
    const term = {
      id,
      projectId,
      title: title || "Terminal",
      shell,
      sortOrder: sortOrder || 0,
      timeCreated: Date.now(),
      timeUpdated: Date.now(),
    };
    saveWorkTerminal(term);
    return term;
  },
  update_work_terminal: async ({ id, updates }) => {
    const db = initSessionDatabase();
    const sets: string[] = [];
    const params: any[] = [];
    if (updates.title !== undefined) {
      sets.push("title = ?");
      params.push(updates.title);
    }
    if (updates.shell !== undefined) {
      sets.push("shell = ?");
      params.push(updates.shell);
    }
    if (updates.sortOrder !== undefined) {
      sets.push("sort_order = ?");
      params.push(updates.sortOrder);
    }
    if (sets.length > 0) {
      sets.push("time_updated = ?");
      params.push(Date.now());
      params.push(id);
      db.prepare(`UPDATE work_terminals SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    }
  },
  reorder_work_terminals: async ({ terminalIds }) => {
    reorderWorkTerminals(terminalIds);
  },
  delete_work_terminal: async ({ id }) => {
    deleteWorkTerminal(id);
  },
  get_terminal_layout: async ({ projectId }) => loadTerminalLayout(projectId),
  save_terminal_layout: async ({ projectId, layout }) => {
    saveTerminalLayout({ projectId, ...layout });
  },
  list_skill_store: async () => listSkillStore(),
  install_skill: async ({ skillId }) => installSkill(String(skillId || "")),
  uninstall_skill: async ({ skillId }) => uninstallSkill(String(skillId || "")),
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
    await browserControl?.hide().catch(() => undefined);
  },
  set_window_background: async ({ color }) => {
    if (typeof color !== "string" || !color.trim()) return;
    mainWindow?.setBackgroundColor(color);
    browserControl?.setTheme({ background: color });
  },
  set_browser_theme: async (theme) => {
    if (!theme || typeof theme !== "object") return;
    browserControl?.setTheme(theme);
  },
  set_titlebar_theme: async ({ mode }) => {
    if (mode !== "light" && mode !== "dark") return;
    if (!mainWindow) return;
    updateWindowTitlebarOverlay(mainWindow, mode);
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
  open_project_with: async ({ path: targetPath, target }) => openProjectWith(targetPath, target),
  list_open_with_apps: async () => listOpenWithApps(),
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

  ipcMain.on("shob:storage-get", (event, storage, key) => {
    try {
      event.returnValue = storageGet(storage, key);
    } catch (error) {
      console.warn("[shob] failed to read storage:", error);
      event.returnValue = null;
    }
  });

  ipcMain.on("shob:get-shob-server-url", (event) => {
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
          shell: options.shell,
        };
      }

      finishPty(id, existing);
    }

    let proc;
    let launchedShell = options.shell;
    const spawnPty = (shellPath: string) => {
      return pty.spawn(shellPath, options.args || [], {
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
    };

    try {
      proc = spawnPty(options.shell);
    } catch (err) {
      if (options.fallbackShells && Array.isArray(options.fallbackShells)) {
        for (const fallback of options.fallbackShells) {
          try {
            proc = spawnPty(fallback);
            launchedShell = fallback;
            break;
          } catch (e) {
            // Try next fallback
          }
        }
      }
      if (!proc) {
        throw err;
      }
    }

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

    return { id, reused: false, buffer: "", bufferCursor: 0, cursor: 0, shell: launchedShell };
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
  const appIconPath = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    backgroundColor: "#09090b",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          // y positions the lights within the 48px sidebar header
          trafficLightPosition: { x: 20, y: 17 },
        }
      : {}),
    ...(process.platform === "win32"
      ? {
          frame: false,
          titleBarStyle: "hidden" as const,
          titleBarOverlay: titlebarOverlay(),
        }
      : {
          frame: false,
          titleBarStyle: "hidden" as const,
        }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    ...(appIconPath ? { icon: appIconPath } : {}),
  });
  applyWindowIcon(mainWindow);

  mainWindow.on("maximize", () => mainWindow?.webContents.send("shob:window-state", { maximized: true }));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("shob:window-state", { maximized: false }));
  mainWindow.on("enter-full-screen", () =>
    mainWindow?.webContents.send("shob:window-state", { fullscreen: true }),
  );
  mainWindow.on("leave-full-screen", () =>
    mainWindow?.webContents.send("shob:window-state", { fullscreen: false }),
  );
  mainWindow.webContents.on("zoom-changed", () => {
    if (!mainWindow) return;
    updateWindowTitlebarOverlay(mainWindow);
  });
  const hideEmbeddedBrowserForHostReload = () => {
    void browserControl?.hide().catch((error) => {
      console.warn("[shob] failed to hide embedded browser during host reload:", error);
    });
  };
  mainWindow.webContents.on("will-navigate", hideEmbeddedBrowserForHostReload);
  mainWindow.webContents.on("did-start-loading", hideEmbeddedBrowserForHostReload);
  mainWindow.webContents.on("render-process-gone", hideEmbeddedBrowserForHostReload);
  if (process.platform === "win32") {
    nativeTheme.on("updated", () => {
      if (!mainWindow) return;
      updateWindowTitlebarOverlay(mainWindow);
    });
  }
  mainWindow.on("closed", () => {
    void browserControl?.hide().catch(() => undefined);
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

app.whenReady().then(async () => {
  applyMacDockIcon();
  browserControl = createBrowserControl({
    getWindow: () => mainWindow,
    emit: sendAppEvent,
  });
  const browserEndpoint = await browserControl.start();
  process.env.SHOB_BROWSER_CONTROL_URL = browserEndpoint.url;
  process.env.SHOB_BROWSER_CONTROL_TOKEN = browserEndpoint.token;
  registerIpc();
  // Start server asynchronously in the background so the window opens instantly
  void ensureServerStarted().catch((err) => {
    console.error("[shob] failed to start server in background:", err);
  });
  await createWindow();
  setupAutoUpdater();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async () => {
  await handlers.cleanup_runtime();
  await browserControl?.stop();
  browserControl = null;
  if (serverInstance) {
    await serverInstance.stop();
    serverInstance = null;
  }
  closeSessionDatabase();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
