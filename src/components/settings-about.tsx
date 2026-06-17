import { createSignal, onMount, onCleanup, Show, Match, Switch } from "solid-js"
import { Button } from "@/components/ui/button"
import { nativeApi } from "@/services/native"
import { CheckCircle2, AlertCircle, Loader2, Download, RotateCcw, Info, ExternalLink } from "lucide-solid"
import { Ico } from "@/components/Ico"
import { useWindowChrome } from "@/utils/window-chrome"

type AboutStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error" | "installing" | "dev"

export function SettingsAbout() {
  const chrome = useWindowChrome()
  const [appName, setAppName] = createSignal("shob")
  const [version, setVersion] = createSignal("")
  const [platform, setPlatform] = createSignal("")
  const [packaged, setPackaged] = createSignal(true)
  const [latestVersion, setLatestVersion] = createSignal<string | null>(null)
  const [status, setStatus] = createSignal<AboutStatus>("idle")
  const [message, setMessage] = createSignal("")
  const [updateDownloaded, setUpdateDownloaded] = createSignal(false)
  const [downloadPercent, setDownloadPercent] = createSignal(0)
  const [lastCheckedAt, setLastCheckedAt] = createSignal<string | null>(null)
  const [checkInFlight, setCheckInFlight] = createSignal(false)
  const [downloadInFlight, setDownloadInFlight] = createSignal(false)
  const [installInFlight, setInstallInFlight] = createSignal(false)

  const unlistenList: Array<() => void> = []

  const isBusy = () =>
    checkInFlight() ||
    downloadInFlight() ||
    installInFlight() ||
    status() === "checking" ||
    status() === "downloading" ||
    status() === "installing"

  onMount(() => {
    void nativeApi
      .invoke("get_app_info")
      .then((info) => {
        setAppName(info.name || "shob")
        setVersion(info.version || "0.0.0")
        setPlatform(info.platform || "unknown")
        setPackaged(info.packaged ?? true)
        if (!info.packaged) {
          setStatus("dev")
          setMessage("Development build — auto-updates are disabled.")
        }
      })
      .catch(() => {})

    const setupListeners = async () => {
      try {
        const uChecking = await nativeApi.listen<null>("update:checking", () => {
          setStatus("checking")
          setMessage("Checking for updates...")
        })
        const uAvailable = await nativeApi.listen<{ version: string }>("update:available", (event) => {
          setStatus("available")
          setLatestVersion(event.payload.version)
          setUpdateDownloaded(false)
          setMessage(`Version ${event.payload.version} is available.`)
        })
        const uNotAvailable = await nativeApi.listen<null>("update:not-available", () => {
          setStatus("up-to-date")
          setMessage("You are running the latest version.")
        })
        const uProgress = await nativeApi.listen<{ percent: number; bytesPerSecond: number; total: number; transferred: number }>(
          "update:progress",
          (event) => {
            setStatus("downloading")
            setDownloadPercent(event.payload.percent)
            const speedMb = (event.payload.bytesPerSecond / (1024 * 1024)).toFixed(2)
            const percentStr = event.payload.percent.toFixed(1)
            setMessage(`Downloading... ${percentStr}% (${speedMb} MB/s)`)
          }
        )
        const uDownloaded = await nativeApi.listen<{ version: string }>("update:downloaded", (event) => {
          setStatus("available")
          setLatestVersion(event.payload.version)
          setUpdateDownloaded(true)
          setMessage(`Version ${event.payload.version} downloaded. Restart to install.`)
        })
        const uError = await nativeApi.listen<string>("update:error", (event) => {
          setStatus("error")
          setMessage(`Update error: ${event.payload}`)
        })

        unlistenList.push(uChecking, uAvailable, uNotAvailable, uProgress, uDownloaded, uError)
      } catch (err) {
        console.error("Failed to register updater event listeners:", err)
      }
    }

    void setupListeners()
  })

  onCleanup(() => {
    for (const unlisten of unlistenList) {
      unlisten()
    }
  })

  const checkForUpdates = async () => {
    if (checkInFlight() || installInFlight()) return
    if (status() === "downloading") {
      setMessage("Update download is already in progress.")
      return
    }
    setCheckInFlight(true)
    setStatus("checking")
    setMessage("Checking for updates...")
    try {
      const result = await nativeApi.invoke("check_for_updates", { manual: true })
      setLastCheckedAt(new Date().toLocaleString())
      if (result.status === "dev") {
        setStatus("dev")
        setMessage("Development build — auto-updates are disabled.")
        return
      }
      if (result.status === "error") {
        setStatus("error")
        setMessage(result.message ?? "Could not check for updates. Check your internet connection.")
        return
      }
      setLatestVersion(result.version ?? null)
      setUpdateDownloaded(Boolean(result.downloaded))
      if (result.updateAvailable) {
        if (result.downloaded) {
          setStatus("available")
          setMessage(`Version ${result.version} downloaded. Restart to install.`)
        } else {
          setStatus("available")
          setMessage(`Version ${result.version} is available.`)
        }
      } else {
        setStatus("up-to-date")
        setMessage("You are running the latest version.")
      }
    } catch {
      setStatus("error")
      setMessage("Could not check for updates.")
    } finally {
      setCheckInFlight(false)
    }
  }

  const downloadUpdate = async () => {
    if (downloadInFlight() || installInFlight() || checkInFlight()) return
    setDownloadInFlight(true)
    setStatus("downloading")
    setDownloadPercent(0)
    setMessage("Starting download...")
    try {
      const result = await nativeApi.invoke("download_update")
      if (result.status === "error") {
        setStatus("error")
        setMessage(`Download failed: ${result.message || "Unknown error"}`)
      }
    } catch {
      setStatus("error")
      setMessage("Failed to start download.")
    } finally {
      setDownloadInFlight(false)
    }
  }

  const installUpdate = async () => {
    if (installInFlight() || checkInFlight()) return
    setInstallInFlight(true)
    setStatus("installing")
    setMessage("Installing update and restarting...")
    try {
      const result = await nativeApi.invoke("install_update")
      if (result.status === "not-downloaded") {
        setStatus("downloading")
        setMessage("Update not downloaded yet. Please wait.")
      }
    } catch {
      setStatus("error")
      setMessage("Failed to install update.")
    } finally {
      setInstallInFlight(false)
    }
  }

  return (
    <div class="space-y-6 max-w-3xl">
      <div>
        <h2 class="text-xl font-bold text-foreground">About</h2>
        <p class="text-sm text-muted-foreground mt-1">App information and update management.</p>
      </div>

      {/* App Info */}
      <div class="rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-xs">
        <div class="flex items-center gap-4">
          <Ico class="h-14 w-14 rounded-xl object-cover border border-border/60 shadow-sm" />
          <div class="space-y-1">
            <h3 class="text-lg font-semibold text-foreground">{appName()}</h3>
            <div class="flex items-center gap-2">
              <span class="text-sm font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-md">v{version()}</span>
              <Show when={platform()}>
                <span class="text-xs text-muted-foreground capitalize">{platform()}</span>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* Update Section */}
      <div class="rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-xs space-y-4">
        <div>
          <h3 class="font-medium text-foreground text-sm">Updates</h3>
          <p class="text-xs text-muted-foreground mt-0.5">Check for new versions, download updates in the background, and restart when ready.</p>
          <Show when={chrome.isMac() && packaged()}>
            <p class="text-xs text-muted-foreground mt-1">Automatic updates aren't available on macOS yet — download the latest build from the GitHub Releases page.</p>
          </Show>
        </div>

        {/* Status Display */}
        <div class="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/40">
          <Switch>
            <Match when={status() === "checking"}>
              <Loader2 class="mt-0.5 h-4 w-4 text-muted-foreground animate-spin shrink-0" />
            </Match>
            <Match when={status() === "up-to-date"}>
              <CheckCircle2 class="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
            </Match>
            <Match when={status() === "available"}>
              <Download class="mt-0.5 h-4 w-4 text-blue-500 shrink-0" />
            </Match>
            <Match when={status() === "downloading"}>
              <Loader2 class="mt-0.5 h-4 w-4 text-blue-500 animate-spin shrink-0" />
            </Match>
            <Match when={status() === "installing"}>
              <RotateCcw class="mt-0.5 h-4 w-4 text-amber-500 animate-spin shrink-0" />
            </Match>
            <Match when={status() === "error"}>
              <AlertCircle class="mt-0.5 h-4 w-4 text-red-500 shrink-0" />
            </Match>
            <Match when={status() === "dev"}>
              <Info class="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
            </Match>
            <Match when={status() === "idle"}>
              <Info class="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
            </Match>
          </Switch>
          <div class="space-y-1 min-w-0 flex-1">
            <p class="text-sm text-foreground">
              <Switch>
                <Match when={status() === "idle"}>Update status</Match>
                <Match when={status() === "checking"}>Checking for updates...</Match>
                <Match when={status() === "up-to-date"}>Up to date</Match>
                <Match when={status() === "available" && !updateDownloaded()}>Update available</Match>
                <Match when={status() === "available" && updateDownloaded()}>Update ready to install</Match>
                <Match when={status() === "downloading"}>Downloading update</Match>
                <Match when={status() === "installing"}>Installing update</Match>
                <Match when={status() === "error"}>Update error</Match>
                <Match when={status() === "dev"}>Development build</Match>
              </Switch>
            </p>
            <Show when={version()}>
              <p class="text-xs text-muted-foreground">
                Current: <span class="font-mono">v{version()}</span>
                <Show when={latestVersion()}>
                  <span> · Latest: <span class="font-mono">v{latestVersion()}</span></span>
                </Show>
              </p>
            </Show>
            <Show when={message()}>
              <p class="text-xs text-muted-foreground">{message()}</p>
            </Show>
          </div>
        </div>

        {/* Download Progress */}
        <Show when={status() === "downloading"}>
          <div class="space-y-1.5 animate-in fade-in duration-200">
            <div class="flex items-center justify-between text-xs font-medium text-foreground/80">
              <span>Downloading...</span>
              <span>{downloadPercent().toFixed(0)}%</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-secondary/80 border border-border/40">
              <div
                style={{ width: `${downloadPercent()}%` }}
                class="h-full bg-blue-500 transition-all duration-300 ease-out"
              />
            </div>
          </div>
        </Show>

        {/* Action Buttons */}
        <div class="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy() || status() === "dev"}
            onClick={() => void checkForUpdates()}
          >
            <Show when={!isBusy() || status() === "idle" || status() === "up-to-date" || status() === "available" || status() === "error" || status() === "dev"}>
              <span>Check for updates</span>
            </Show>
            <Show when={status() === "checking"}>
              <Loader2 class="h-3.5 w-3.5 animate-spin mr-1.5" />
              <span>Checking...</span>
            </Show>
          </Button>

          <Show when={chrome.isMac()}>
            <Show when={status() === "available"}>
              <Button
                type="button"
                size="sm"
                class="bg-blue-600 hover:bg-blue-500 text-white"
                onClick={() => void nativeApi.invoke("install_update")}
              >
                <ExternalLink class="h-3.5 w-3.5 mr-1.5" />
                Open Releases page
              </Button>
            </Show>
          </Show>

          <Show when={!chrome.isMac()}>
            <Show when={status() === "available" && !updateDownloaded()}>
              <Button
                type="button"
                size="sm"
                class="bg-blue-600 hover:bg-blue-500 text-white"
                disabled={downloadInFlight() || status() === "downloading" || status() === "installing"}
                onClick={() => void downloadUpdate()}
              >
                <Download class="h-3.5 w-3.5 mr-1.5" />
                Download now
              </Button>
            </Show>

            <Show when={updateDownloaded()}>
              <Button
                type="button"
                size="sm"
                class="bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={installInFlight() || status() === "installing"}
                onClick={() => void installUpdate()}
              >
                <RotateCcw class="h-3.5 w-3.5 mr-1.5" />
                Restart to install
              </Button>
            </Show>
          </Show>
        </div>

        <Show when={lastCheckedAt()}>
          <p class="text-[11px] text-muted-foreground">Last checked: {lastCheckedAt()}</p>
        </Show>
      </div>

      {/* Copyright */}
      <div class="rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-xs">
        <p class="text-sm text-muted-foreground">
          Copyright © 2026 The shob Authors. All rights reserved.
        </p>
      </div>
    </div>
  )
}
