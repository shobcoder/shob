import { execFile } from "node:child_process"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(packageDir, "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")
const batchSignScript = path.join(rootDir, "script", "sign-batch.ps1")
const legacyDesktopEntry = path.join(packageDir, "resources", "linux", "shob-desktop.desktop")
const legacyDesktopEntryFpm = `${legacyDesktopEntry}=/usr/share/applications/shob-desktop.desktop`

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

// Desktop builds are production-only; there is no dev/beta channel anymore.
const APP_ID = "ai.shob.desktop"

export async function writeWindowsUpdateConfig(appOutDir: string, updaterCacheDirName: string) {
  await writeFile(
    path.join(appOutDir, "resources", "app-update.yml"),
    [
      "provider: github",
      "owner: shobcoder",
      "repo: shob",
      "channel: latest",
      `updaterCacheDirName: ${JSON.stringify(updaterCacheDirName)}`,
      "",
    ].join("\n"),
    "utf8",
  )
}

const config: Configuration = {
  artifactName: "shob-desktop-${os}-${arch}.${ext}",
  appId: APP_ID,
  productName: "Shob",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  afterPack: async (context) => {
    if (context.packager.platform.name !== "windows") return

    // The release workflow packages a Windows directory before creating the
    // signed NSIS installer. electron-builder does not generate app-update.yml
    // for a directory target, so place it in the prepackaged app explicitly.
    await writeWindowsUpdateConfig(context.appOutDir, context.packager.appInfo.updaterCacheDirName)

    if (process.env.GITHUB_ACTIONS === "true") {
      await execFileAsync(
        "pwsh",
        ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", batchSignScript, context.appOutDir],
        { cwd: rootDir },
      )
    }
  },
  // Linux launchers are .desktop files, so this is the desktop file name,
  // not just the app id. For prod, app id "ai.shob.desktop" becomes
  // "ai.shob.desktop.desktop".
  // https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html
  // https://www.electron.build/docs/linux/
  extraMetadata: {
    desktopName: `${APP_ID}.desktop`,
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    // App icons are copied to resources/icons so the main process can load
    // them from process.resourcesPath/icons at runtime.
    {
      from: "icons/prod",
      to: "icons",
    },
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
    // Built-in agent skills (repo-root skills/) → resources/skills when packaged
    {
      from: path.join(rootDir, "skills"),
      to: "skills",
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `icons/prod/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  win: {
    icon: `icons/prod/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    installerIcon: `icons/prod/icon.ico`,
    installerHeaderIcon: `icons/prod/icon.ico`,
  },
  linux: {
    icon: `icons/prod`,
    category: "Development",
    executableName: APP_ID,
    desktop: {
      entry: {
        // Match the installed .desktop file and hicolor icon basename so
        // Linux shells can associate the running Electron window with its launcher.
        StartupWMClass: APP_ID,
      },
    },
    target: ["AppImage", "deb", "rpm"],
  },
  protocols: { name: "Shob", schemes: ["shob"] },
  // The updater reads latest*.yml files uploaded by the release workflow.
  // Keep this in sync with the repository that publishes the installers.
  publish: { provider: "github", owner: "shobcoder", repo: "shob", channel: "latest" },
  deb: { fpm: [legacyDesktopEntryFpm] },
  rpm: { packageName: "shob", fpm: [legacyDesktopEntryFpm] },
}

export default config
