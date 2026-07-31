import { Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { Logo } from "@shob/ui/logo"
import { Icon as IconV2 } from "@shob/ui/v2/icon"
import { ButtonV2 } from "@shob/ui/v2/button-v2"
import { useUpdaterAction } from "../updater-action"

export const SettingsAboutV2: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const appName = language.t("app.name.desktop") || "ShobCoder"
  const updater = useUpdaterAction()

  const updateStatusText = () => {
    if (platform.updater?.state()?.status === "disabled") return "Updates are unavailable in this build"
    const label = updater.action().label
    if (label === "settings.updates.action.checking") return "Checking for updates..."
    if (label === "settings.updates.action.downloading") return "Downloading update..."
    if (label === "toast.update.action.installRestart") return "Update ready to install"
    if (label === "settings.updates.action.installing") return "Installing update..."
    if (label === "settings.updates.action.checkNow") return `${appName} is up to date`
    return `${appName} is up to date`
  }

  return (
    <div class="flex h-full w-full flex-col items-center justify-start p-10 overflow-y-auto">
      <div class="w-full max-w-[680px] flex flex-col gap-6">
        <h1 class="text-[24px] font-bold text-v2-text-text-base -mb-1">
          About {appName}
        </h1>

        {/* Main Info Card */}
        <div class="flex flex-col rounded-[16px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 shadow-sm overflow-hidden">
          <div class="flex items-center gap-6 px-6 py-7">
            <Logo class="w-14 text-[#FF4B26]" /> 
            <div class="flex flex-col gap-1">
              <span class="text-[26px] font-bold tracking-tight text-v2-text-text-base leading-none">{appName}</span>
              <div class="flex flex-col mt-1">
                <span class="text-[13px] text-v2-text-text-muted">
                  Version {platform.version} (Official Build) {platform.os ? `(${platform.os === "windows" ? "64-bit" : platform.os})` : ""}
                </span>
                <span class="text-[13px] text-v2-text-text-muted">
                  Environment: {import.meta.env.DEV ? "Development" : "Production"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Update Checker Card */}
        <div class="flex items-center justify-between rounded-[16px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 shadow-sm px-6 py-5">
          <div class="flex flex-col gap-0.5">
            <span class="text-[15px] font-medium text-v2-text-text-base">{updateStatusText()}</span>
            <span class="text-[13px] text-v2-text-text-muted">Stay up to date with the latest features and fixes.</span>
          </div>
          <ButtonV2 
            variant="outline" 
            size="normal"
            onClick={updater.run}
            disabled={!updater.action().run}
            class="shrink-0 shadow-sm font-medium"
          >
            {platform.updater?.state()?.status === "checking" ? (
              <IconV2 name="arrow-path" class="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {language.t(updater.action().label)}
          </ButtonV2>
        </div>

        {/* License & Copyright Card */}
        <div class="flex flex-col rounded-[16px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 shadow-sm p-6 gap-3">
          <div class="flex flex-col gap-0.5">
            <span class="text-[14px] font-medium text-v2-text-text-base">{appName}</span>
            <span class="text-[13px] text-v2-text-text-muted">
              Copyright &copy; {new Date().getFullYear()} The {appName} Authors. All rights reserved.
            </span>
          </div>
          
          <p class="text-[13px] leading-relaxed text-v2-text-text-muted">
            {appName} is made available to you under the MIT License and includes open source software under a variety of other licenses. You can read instructions on how to download and build for yourself the specific source code used to create this copy.
          </p>
        </div>

      </div>
    </div>
  )
}
