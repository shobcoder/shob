import { app, nativeImage, type BrowserWindow } from "electron";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const WINDOWS_APP_ID = app.isPackaged ? "app.shob.desktop" : "app.shob.desktop.dev";

function firstExisting(candidates: string[]) {
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function iconCandidates(base: string, name: string, fallbackExts: string[]) {
  return fallbackExts.map((ext) => path.join(base, `${name}${ext}`));
}

export function resolveAppIconPath(platform: NodeJS.Platform = process.platform) {
  const preferredExt =
    platform === "win32" ? ".ico" :
    platform === "darwin" ? ".icns" :
    ".png";
  const fallbackExts = Array.from(new Set([preferredExt, ".png", ".ico", ".icns"]));
  const bases = app.isPackaged
    ? [
        path.join(process.resourcesPath, "electron", "icons"),
        path.join(__dirname, "..", "electron", "icons"),
      ]
    : [
        path.join(__dirname, "..", "electron", "icons"),
        path.join(process.resourcesPath, "electron", "icons"),
      ];
  const candidates: string[] = [];
  if (!app.isPackaged) {
    candidates.push(
      ...iconCandidates(path.join(__dirname, "..", "electron", "dev-icons"), "olova-dev", fallbackExts),
      ...iconCandidates(path.join(__dirname, "..", "src", "assets", "icon"), "olova-dev", fallbackExts),
    );
  }
  for (const base of bases) {
    candidates.push(...iconCandidates(base, "icon", fallbackExts));
  }
  return firstExisting(candidates);
}

export function applyWindowsAppIdentity() {
  if (process.platform !== "win32") return;
  app.setAppUserModelId(WINDOWS_APP_ID);
}

export function applyMacDockIcon() {
  if (process.platform !== "darwin") return;
  if (!app.dock) return;
  const appIconPath = resolveAppIconPath("darwin");
  if (!appIconPath) return;
  app.dock.setIcon(nativeImage.createFromPath(appIconPath));
}

export function applyWindowIcon(mainWindow: BrowserWindow) {
  const appIconPath = resolveAppIconPath();

  if ((process.platform === "win32" || process.platform === "linux") && appIconPath) {
    mainWindow.setIcon(appIconPath);
  }
  if (process.platform === "win32") {
    mainWindow.setAppDetails({
      appId: WINDOWS_APP_ID,
      ...(appIconPath && path.extname(appIconPath).toLowerCase() === ".ico"
        ? {
            appIconPath,
            appIconIndex: 0,
          }
        : {}),
      relaunchDisplayName: "shob",
    });
  }
}
