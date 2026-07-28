import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"

const legacyDesktopEntry = "resources/linux/shob-desktop.desktop"

const channels = [
  { channel: "dev", appId: "ai.shob.desktop.dev" },
  { channel: "beta", appId: "ai.shob.desktop.beta" },
  { channel: "prod", appId: "ai.shob.desktop" },
] as const

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const previous = process.env.SHOB_CHANNEL
    process.env.SHOB_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.SHOB_CHANNEL
    else process.env.SHOB_CHANNEL = previous

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
  })
}

test("keeps a hidden prod launcher for old Linux pins", async () => {
  const previous = process.env.SHOB_CHANNEL
  process.env.SHOB_CHANNEL = "prod"

  const module = await import("./electron-builder.config.ts?compat=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.SHOB_CHANNEL
  else process.env.SHOB_CHANNEL = previous

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
  const previous = process.env.SHOB_CHANNEL
  process.env.SHOB_CHANNEL = "prod"

  const module = await import("./electron-builder.config.ts?publish=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.SHOB_CHANNEL
  else process.env.SHOB_CHANNEL = previous

  expect(config.publish).toEqual({ provider: "github", owner: "shobcoder", repo: "shob", channel: "latest" })
})
