import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Configuration } from "electron-builder"

const legacyDesktopEntry = "resources/linux/shob-desktop.desktop"
const APP_ID = "ai.shob.desktop"

test("uses one Linux desktop identity", async () => {
  const module = await import("./electron-builder.config.ts")
  const config = module.default as Configuration

  expect(config.appId).toBe(APP_ID)
  expect(config.productName).toBe("Shob")
  expect(config.extraMetadata?.desktopName).toBe(`${APP_ID}.desktop`)
  expect(config.linux?.executableName).toBe(APP_ID)
  expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(APP_ID)
})

test("keeps a hidden prod launcher for old Linux pins", async () => {
  const module = await import("./electron-builder.config.ts")
  const config = module.default as Configuration

  const launcher = `${legacyDesktopEntry}=/usr/share/applications/shob-desktop.desktop`
  expect(config.deb?.fpm?.[0]?.replaceAll("\\", "/")).toEndWith(launcher)
  expect(config.rpm?.fpm?.[0]?.replaceAll("\\", "/")).toEndWith(launcher)

  const desktop = await Bun.file(legacyDesktopEntry).text()
  expect(desktop).toContain("Exec=/opt/Shob/ai.shob.desktop %U")
  expect(desktop).toContain("Icon=ai.shob.desktop")
  expect(desktop).toContain("StartupWMClass=ai.shob.desktop")
  expect(desktop).toContain("NoDisplay=true")
})

test("publishes updater metadata to this repository", async () => {
  const module = await import("./electron-builder.config.ts")
  const config = module.default as Configuration

  expect(config.publish).toEqual({ provider: "github", owner: "shobcoder", repo: "shob", channel: "latest" })
})

test("writes Windows updater configuration for prepackaged builds", async () => {
  const module = await import("./electron-builder.config.ts")
  const appOutDir = await mkdtemp(path.join(tmpdir(), "shob-builder-"))
  await Bun.write(path.join(appOutDir, "resources", ".keep"), "")

  try {
    await module.writeWindowsUpdateConfig(appOutDir, "@shobdesktop-updater")
    expect(await Bun.file(path.join(appOutDir, "resources", "app-update.yml")).text()).toBe(
      [
        "provider: github",
        "owner: shobcoder",
        "repo: shob",
        "channel: latest",
        'updaterCacheDirName: "@shobdesktop-updater"',
        "",
      ].join("\n"),
    )
  } finally {
    await rm(appOutDir, { recursive: true, force: true })
  }
})
