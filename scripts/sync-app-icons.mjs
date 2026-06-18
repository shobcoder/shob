import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "apps", "desktop");

const sourceIcon = path.join(appDir, "src", "assets", "icon", "shob.png");
const devSourceIcon = path.join(appDir, "src", "assets", "icon", "olova-dev.png");
const iconDir = path.join(appDir, "electron", "icons");
const devIconDir = path.join(appDir, "electron", "dev-icons");
const iconPng = path.join(iconDir, "icon.png");
const iconIco = path.join(iconDir, "icon.ico");
const iconIcns = path.join(iconDir, "icon.icns");
const devIconPng = path.join(devIconDir, "olova-dev.png");
const devIconIco = path.join(devIconDir, "olova-dev.ico");

async function ensureSourceIcon() {
  if (!fsSync.existsSync(sourceIcon)) {
    throw new Error(`Source icon not found: ${sourceIcon}`);
  }
}

async function syncPng() {
  await fs.mkdir(iconDir, { recursive: true });
  await fs.copyFile(sourceIcon, iconPng);
}

async function syncIco() {
  const ico = await pngToIco(sourceIcon);
  await fs.writeFile(iconIco, ico);
}

async function syncDevTaskbarIcon() {
  if (!fsSync.existsSync(devSourceIcon)) {
    console.warn(`[icons] dev taskbar icon not found: ${devSourceIcon}`);
    return;
  }
  await fs.mkdir(devIconDir, { recursive: true });
  await fs.copyFile(devSourceIcon, devIconPng);
  const ico = await pngToIco(devSourceIcon);
  await fs.writeFile(devIconIco, ico);
}

async function syncIcns() {
  if (process.platform !== "darwin") return;
  const iconsetDir = path.join(iconDir, "icon.iconset");
  const iconsetSizes = [16, 32, 64, 128, 256, 512, 1024];

  try {
    execFileSync("sips", ["-s", "format", "icns", sourceIcon, "--out", iconIcns], { stdio: "inherit" });
    return;
  } catch (error) {
    console.warn("[icons] failed to generate icon.icns with sips:", error instanceof Error ? error.message : error);
  }

  try {
    await fs.rm(iconsetDir, { recursive: true, force: true });
    await fs.mkdir(iconsetDir, { recursive: true });

    for (const size of iconsetSizes) {
      const file1x = path.join(iconsetDir, `icon_${size}x${size}.png`);
      const file2x = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);
      execFileSync("sips", ["-z", String(size), String(size), sourceIcon, "--out", file1x], { stdio: "inherit" });
      execFileSync("sips", ["-z", String(size * 2), String(size * 2), sourceIcon, "--out", file2x], { stdio: "inherit" });
    }

    execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", iconIcns], { stdio: "inherit" });
  } catch (error) {
    console.warn("[icons] failed to generate icon.icns with iconutil fallback:", error instanceof Error ? error.message : error);
  } finally {
    await fs.rm(iconsetDir, { recursive: true, force: true });
  }
}

async function main() {
  await ensureSourceIcon();
  await syncPng();
  await syncIco();
  await syncIcns();
  await syncDevTaskbarIcon();
  console.log("[icons] synced app icons from apps/desktop/src/assets/icon/shob.png");
}

main().catch((error) => {
  console.error("[icons] sync failed:", error);
  process.exit(1);
});

