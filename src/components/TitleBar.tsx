import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { nativeApi } from "../services/native"
import { ChevronDown, GitBranch } from "lucide-solid"
import { CliAvatar } from "./CliAvatar"
import { useStore } from "../store"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type OsPlatform = "windows" | "chromeos" | "macos" | "gnome" | "mobile"

interface GitBranchInfo {
  repoName?: string | null
  head: string
}

interface ProjectFsEvent {
  projectPath: string
  paths: string[]
}

function mapNativePlatform(value: string): OsPlatform {
  switch (value) {
    case "macos":
      return "macos"
    case "linux":
      return "gnome"
    case "android":
    case "ios":
      return "mobile"
    case "windows":
    default:
      return "windows"
  }
}

function TitlebarButton({
  class: className,
  onClick,
  children,
  label,
}: {
  class: string
  onClick: () => void | Promise<void>
  children: any
  label: string
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        void onClick()
      }}
      class={`relative z-20 pointer-events-auto ${className}`}
      style={{ "-webkit-app-region": "no-drag" }}
      aria-label={label}
    >
      {children}
    </button>
  )
}

async function runWindowAction(action: string, operation: () => Promise<void>) {
  try {
    await operation()
  } catch (error) {
    console.error(`Title bar action failed: ${action}`, error)
  }
}

function currentWindow() {
  return nativeApi.window()
}

function WindowsGlyph({
  glyph,
  class: className = "",
}: {
  glyph: string
  class?: string
}) {
  return (
    <span
      class={className}
      style={{
        "font-family": '"Segoe Fluent Icons", "Segoe MDL2 Assets", "Segoe UI Symbol", sans-serif',
        "font-size": "10px",
        "line-height": "1",
        "font-weight": "400",
      }}
      aria-hidden="true"
    >
      {glyph}
    </span>
  )
}

function WindowsControls({
  isMaximized,
  setIsMaximized,
}: {
  isMaximized: () => boolean
  setIsMaximized: (value: boolean) => void
}) {
  const baseButtonClass = "bg-transparent text-foreground/90 hover:bg-white/[0.06] active:bg-white/[0.04]"
  const closeButtonClass = "bg-transparent text-foreground/90 hover:bg-destructive hover:text-white active:opacity-90"

  return (
    <div class="flex h-8" style={{ "-webkit-app-region": "no-drag" }}>
      <TitlebarButton
        label="Minimize"
        onClick={() => runWindowAction("minimize", () => currentWindow().minimize())}
        class={`inline-flex h-8 w-[46px] items-center justify-center transition-colors ${baseButtonClass}`}
      >
        <WindowsGlyph glyph={"\uE921"} />
      </TitlebarButton>
      <TitlebarButton
        label={isMaximized() ? "Restore" : "Maximize"}
        onClick={async () => {
          await runWindowAction("toggle maximize", async () => {
            const window = currentWindow()
            await window.toggleMaximize()
            const next = await window.isMaximized()
            setIsMaximized(next)
          })
        }}
        class={`inline-flex h-8 w-[46px] items-center justify-center transition-colors ${baseButtonClass}`}
      >
        <WindowsGlyph glyph={isMaximized() ? "\uE923" : "\uE922"} />
      </TitlebarButton>
      <TitlebarButton
        label="Close"
        onClick={() => runWindowAction("close", () => currentWindow().close())}
        class={`inline-flex h-8 w-[46px] items-center justify-center transition-colors ${closeButtonClass}`}
      >
        <WindowsGlyph glyph={"\uE8BB"} />
      </TitlebarButton>
    </div>
  )
}

function MacControls() {
  return (
    <div class="flex items-center gap-2 px-3" style={{ "-webkit-app-region": "no-drag" }}>
      <TitlebarButton
        label="Close"
        onClick={() => runWindowAction("close", () => currentWindow().close())}
        class="flex h-3 w-3 items-center justify-center rounded-full border border-black/[0.12] bg-[#ff544d] text-black/60"
      >
        <svg width="6" height="6" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="opacity-0 hover:opacity-100">
          <path d="M15.7522 4.44381L11.1543 9.04165L15.7494 13.6368C16.0898 13.9771 16.078 14.5407 15.724 14.8947L13.8907 16.728C13.5358 17.0829 12.9731 17.0938 12.6328 16.7534L8.03766 12.1583L3.44437 16.7507C3.10402 17.091 2.54132 17.0801 2.18645 16.7253L0.273257 14.8121C-0.0807018 14.4572 -0.0925004 13.8945 0.247845 13.5542L4.84024 8.96087L0.32499 4.44653C-0.0153555 4.10619 -0.00355681 3.54258 0.350402 3.18862L2.18373 1.35529C2.53859 1.00042 3.1013 0.989533 3.44164 1.32988L7.95689 5.84422L12.5556 1.24638C12.8951 0.906035 13.4587 0.917833 13.8126 1.27179L15.7267 3.18589C16.0807 3.53985 16.0925 4.10346 15.7522 4.44381Z" fill="currentColor" />
        </svg>
      </TitlebarButton>
      <TitlebarButton
        label="Minimize"
        onClick={() => runWindowAction("minimize", () => currentWindow().minimize())}
        class="flex h-3 w-3 items-center justify-center rounded-full border border-black/[0.12] bg-[#ffbd2e] text-black/60"
      >
        <svg width="8" height="8" viewBox="0 0 17 6" fill="none" xmlns="http://www.w3.org/2000/svg" class="opacity-0 hover:opacity-100">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M1.47211 1.18042H15.4197C15.8052 1.18042 16.1179 1.50551 16.1179 1.90769V3.73242C16.1179 4.13387 15.8052 4.80006 15.4197 4.80006H1.47211C1.08665 4.80006 0.773926 4.47497 0.773926 4.07278V1.90769C0.773926 1.50551 1.08665 1.18042 1.47211 1.18042Z" fill="currentColor" />
        </svg>
      </TitlebarButton>
      <TitlebarButton
        label="Maximize"
        onClick={async () => {
          await runWindowAction("toggle maximize", async () => {
            await currentWindow().toggleMaximize()
          })
        }}
        class="flex h-3 w-3 items-center justify-center rounded-full border border-black/[0.12] bg-[#28c93f] text-black/60"
      >
        <svg width="8" height="8" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="opacity-0 hover:opacity-100">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M15.5308 9.80147H10.3199V15.0095C10.3199 15.3949 9.9941 15.7076 9.59265 15.7076H7.51555C7.11337 15.7076 6.78828 15.3949 6.78828 15.0095V9.80147H1.58319C1.19774 9.80147 0.88501 9.47638 0.88501 9.07419V6.90619C0.88501 6.50401 1.19774 6.17892 1.58319 6.17892H6.78828V1.06183C6.78828 0.676375 7.11337 0.363647 7.51555 0.363647H9.59265C9.9941 0.363647 10.3199 0.676375 10.3199 1.06183V6.17892H15.5308C15.9163 6.17892 16.229 6.50401 16.229 6.90619V9.07419C16.229 9.47638 15.9163 9.80147 15.5308 9.80147Z" fill="currentColor" />
        </svg>
      </TitlebarButton>
    </div>
  )
}

function GnomeControls({
  isMaximized,
  setIsMaximized,
}: {
  isMaximized: () => boolean
  setIsMaximized: (value: boolean) => void
}) {
  return (
    <div class="mr-[10px] flex items-center space-x-[13px]" style={{ "-webkit-app-region": "no-drag" }}>
      <TitlebarButton
        label="Minimize"
        onClick={() => runWindowAction("minimize", () => currentWindow().minimize())}
        class="flex h-6 w-6 items-center justify-center rounded-full bg-[#373737] p-0 text-white hover:bg-[#424242] active:bg-[#565656]"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-[9px] w-[9px]">
          <path d="M0 0.5h10" stroke="currentColor" stroke-width="1" />
        </svg>
      </TitlebarButton>
      <TitlebarButton
        label={isMaximized() ? "Restore" : "Maximize"}
        onClick={async () => {
          await runWindowAction("toggle maximize", async () => {
            const window = currentWindow()
            await window.toggleMaximize()
            const next = await window.isMaximized()
            setIsMaximized(next)
          })
        }}
        class="flex h-6 w-6 items-center justify-center rounded-full bg-[#373737] p-0 text-white hover:bg-[#424242] active:bg-[#565656]"
      >
        {isMaximized() ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-[9px] w-[9px]">
            <path d="M3 1h6v6H8V2H3V1ZM1 3h6v6H1V3Z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-2 w-2">
            <rect x="1" y="1" width="8" height="8" stroke="currentColor" />
          </svg>
        )}
      </TitlebarButton>
      <TitlebarButton
        label="Close"
        onClick={() => runWindowAction("close", () => currentWindow().close())}
        class="flex h-6 w-6 items-center justify-center rounded-full bg-[#373737] p-0 text-white hover:bg-[#424242] active:bg-[#565656]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-2 w-2">
          <path d="M1 1l8 8M9 1 1 9" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </TitlebarButton>
    </div>
  )
}

export function TitleBar() {
  const [osPlatform, setOsPlatform] = createSignal<OsPlatform>("windows")
  const [isMaximized, setIsMaximized] = createSignal(false)
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const cliTools = useStore((s) => s.cliTools)
  const cliLaunchMode = useStore((s) => s.cliLaunchMode)
  const launchCliSession = useStore((s) => s.launchCliSession)
  const getCurrentCliTool = useStore((s) => s.getCurrentCliTool)
  const setPreferredCliTool = useStore((s) => s.setPreferredCliTool)
  const updateSession = useStore((s) => s.updateSession)
  const [isLauncherOpen, setIsLauncherOpen] = createSignal(false)
  const [isSidebarVisible, setIsSidebarVisible] = createSignal(true)
  const [isReviewVisible, setIsReviewVisible] = createSignal(false)
  const [isFileTreeVisible, setIsFileTreeVisible] = createSignal(false)
  const [branchInfo, setBranchInfo] = createSignal<GitBranchInfo | null>(null)
  let branchRefreshTimeoutRef: number | null = null

  const currentProject = createMemo(
    () => projects().find((project) => project.id === currentProjectId()) ?? null,
  )
  const currentCliTool = () => getCurrentCliTool()
  const installedCliTools = createMemo(() => cliTools().filter((tool) => tool.installed))

  const loadBranchInfo = async (projectPath?: string | null) => {
    if (!projectPath) {
      setBranchInfo(null)
      return
    }

    try {
      const branch = await nativeApi.invoke("get_git_branch", {
        path: projectPath,
      }) as GitBranchInfo
      setBranchInfo(branch)
    } catch {
      setBranchInfo(null)
    }
  }

  const scheduleBranchRefresh = (projectPath?: string | null, delay = 180) => {
    if (!projectPath) {
      setBranchInfo(null)
      return
    }

    if (branchRefreshTimeoutRef) {
      window.clearTimeout(branchRefreshTimeoutRef)
    }

    branchRefreshTimeoutRef = window.setTimeout(() => {
      void loadBranchInfo(projectPath)
    }, delay)
  }

  onMount(() => {
    let resizeSyncTimer: number | null = null

    const sync = async () => {
      try {
        const currentPlatform = nativeApi.platform()
        setOsPlatform(mapNativePlatform(currentPlatform))

        const windowHandle = currentWindow()
        const maximized = await windowHandle.isMaximized()
        setIsMaximized(maximized)
      } catch (error) {
        console.error("Failed to sync title bar platform:", error)
      }
    }

    void sync()

    const unlistenPromise = currentWindow().onResized(() => {
      if (resizeSyncTimer !== null) {
        window.clearTimeout(resizeSyncTimer)
      }

      resizeSyncTimer = window.setTimeout(async () => {
        const maximized = await currentWindow().isMaximized().catch(() => false)
        setIsMaximized(maximized)
      }, 120)
    })

    onCleanup(() => {
      if (resizeSyncTimer !== null) {
        window.clearTimeout(resizeSyncTimer)
      }
      unlistenPromise.then((unlisten) => unlisten())
    })
  })

  onMount(() => {
    const handleSidebarState = (event: Event) => {
      const detail = (event as CustomEvent<{ isSidebarVisible: boolean }>).detail
      if (!detail) return
      setIsSidebarVisible(Boolean(detail.isSidebarVisible))
    }

    window.addEventListener("gg-sidebar-state", handleSidebarState as EventListener)
    onCleanup(() => window.removeEventListener("gg-sidebar-state", handleSidebarState as EventListener))
  })

  onMount(() => {
    const handleReviewState = (event: Event) => {
      const detail = (event as CustomEvent<{ isReviewVisible: boolean }>).detail
      if (!detail) return
      setIsReviewVisible(Boolean(detail.isReviewVisible))
    }

    window.addEventListener("gg-review-state", handleReviewState as EventListener)
    onCleanup(() => window.removeEventListener("gg-review-state", handleReviewState as EventListener))
  })

  onMount(() => {
    const handleFileTreeState = (event: Event) => {
      const detail = (event as CustomEvent<{ isFileTreeVisible: boolean }>).detail
      if (!detail) return
      setIsFileTreeVisible(Boolean(detail.isFileTreeVisible))
    }

    window.addEventListener("gg-file-tree-state", handleFileTreeState as EventListener)
    onCleanup(() => window.removeEventListener("gg-file-tree-state", handleFileTreeState as EventListener))
  })

  createEffect(() => {
    void loadBranchInfo(currentProject()?.path)
  })

  onMount(() => {
    const unlistenProjectPromise = nativeApi.listen<ProjectFsEvent>("project-fs-event", (event) => {
      const project = currentProject()
      if (!project || event.payload.projectPath !== project.path) return

      const touchesGitState = event.payload.paths.some((path) => {
        const normalized = path.replace(/\\/g, "/").toLowerCase()
        return normalized.includes("/.git/") || normalized.endsWith("/.git") || normalized.endsWith("/head")
      })

      if (!touchesGitState) return

      scheduleBranchRefresh(project.path, 140)
    })

    onCleanup(() => {
      if (branchRefreshTimeoutRef) {
        window.clearTimeout(branchRefreshTimeoutRef)
        branchRefreshTimeoutRef = null
      }
      unlistenProjectPromise.then((unlisten) => unlisten())
    })
  })

  const handleLaunchSession = async (cliId?: string | null) => {
    const cpid = currentProjectId()
    if (!cpid) return

    const selectedCli = installedCliTools().find((tool) => tool.id === cliId) ?? null

    if (cliId) {
      setPreferredCliTool(cliId)
    }

    if (
      cliLaunchMode() === "replace-current" &&
      activeSessionId()
    ) {
      const launchCommand = selectedCli?.matchedCommand ?? cliId
      if (!launchCommand) {
        setIsLauncherOpen(false)
        return
      }

      window.dispatchEvent(
        new CustomEvent("gg-rerun-cli-current-session", {
          detail: {
            sessionId: activeSessionId(),
            command: launchCommand,
          },
        }),
      )

      if (selectedCli) {
        await updateSession(cpid, activeSessionId()!, { cliTool: selectedCli.id })
      }

      setIsLauncherOpen(false)
      return
    }

    await launchCliSession(cpid, cliId)
    setIsLauncherOpen(false)
  }

  const handleToggleSidebar = () => {
    window.dispatchEvent(new Event("gg-toggle-sidebar"))
  }

  const handleToggleReviewWorkspace = () => {
    window.dispatchEvent(new Event("gg-toggle-review-workspace"))
  }

  const headerClass = "border-border bg-background text-foreground"
  const navButtonClass = "text-muted-foreground hover:bg-accent hover:text-foreground"

  return (
    <header
      class={`relative z-50 flex h-[40px] shrink-0 select-none items-center border-b ${headerClass}`}
      style={{ "-webkit-app-region": "drag" }}
    >
      <div class="flex min-w-0 items-center gap-3 px-3" style={{ "-webkit-app-region": "no-drag" }}>
        <div class="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleToggleSidebar}
            variant="ghost"
            size="icon-xs"
            class={`h-6 w-6 rounded-md ${navButtonClass}`}
            aria-label="Sidebar toggle"
            aria-pressed={isSidebarVisible()}
            title={isSidebarVisible() ? "Hide sidebar" : "Show sidebar"}
          >
            <Icon name={isSidebarVisible() ? "sidebar-active" : "sidebar"} size="small" />
          </Button>

          {branchInfo()?.head && (
            <div class="ml-1 hidden items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1 text-xs text-current/65 lg:flex">
              <GitBranch class="h-3.5 w-3.5" stroke-width={1.9} />
              <span class="max-w-[170px] truncate">{branchInfo()!.head}</span>
            </div>
          )}
        </div>
      </div>

      <div
        data-electron-drag-region
        class="min-w-0 flex-1 self-stretch px-3 text-center text-[12px] font-medium text-current/60"
        style={{ "-webkit-app-region": "drag" }}
      />

      <div class="ml-3 flex items-center gap-2 pl-2 pr-0" style={{ "-webkit-app-region": "no-drag", transform: "translateX(-18px)" }}>
        <div class="relative flex items-center">
          <DropdownMenu open={isLauncherOpen()} onOpenChange={setIsLauncherOpen}>
            <DropdownMenuTrigger>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-8 min-w-[138px] items-center justify-between gap-2 rounded-[9px] border border-border bg-card px-3 text-xs leading-none font-medium text-foreground hover:bg-accent"
                title={currentCliTool() ? `Current CLI: ${currentCliTool()!.label}` : "Choose CLI launcher"}
              >
                <span class="flex min-w-0 items-center gap-2">
                  {currentCliTool() ? (
                    <>
                      <CliAvatar cliId={currentCliTool()!.id} label={currentCliTool()!.label} size="md" class="h-[18px] w-[18px]" />
                      <span class="truncate text-[13px] leading-none">{currentCliTool()!.label}</span>
                    </>
                  ) : (
                    <span class="text-[11px] text-current/70">Choose CLI</span>
                  )}
                </span>
                <ChevronDown class={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isLauncherOpen() ? "rotate-180" : ""}`} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              class="w-[210px] rounded-[12px] border border-border bg-card p-2 shadow-[0_12px_32px_rgba(0,0,0,0.58)]"
              placement="bottom-start"
              gutter={6}
              >
              {installedCliTools().length > 0 ? (
                installedCliTools().map((tool) => (
                  <DropdownMenuItem
                    onClick={() => void handleLaunchSession(tool.id)}
                    class="h-11 items-center gap-2.5 rounded-[9px] px-2.5 text-foreground hover:bg-accent focus:bg-accent"
                  >
                    <CliAvatar cliId={tool.id} label={tool.label} size="md" class="h-5 w-5 shrink-0" />
                    <span class="min-w-0 flex-1 truncate text-[13px] leading-none font-medium">{tool.label}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div class="px-3 py-2 text-[13px] text-muted-foreground">No available CLI found</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          type="button"
          onClick={handleToggleReviewWorkspace}
          variant="ghost"
          size="icon-sm"
          class={`h-7 w-7 ${
            isReviewVisible() || isFileTreeVisible()
              ? "bg-accent text-foreground"
              : "text-current/65 hover:bg-white/[0.05] hover:text-current"
          }`}
          title={isReviewVisible() || isFileTreeVisible() ? "Hide file tree and review panel" : "Show file tree and review panel"}
          aria-label="File tree and review panel toggle"
          aria-pressed={isReviewVisible() || isFileTreeVisible()}
        >
          <Icon name={isReviewVisible() || isFileTreeVisible() ? "review-active" : "review"} size="small" />
        </Button>
      </div>

      {(osPlatform() === "windows" || osPlatform() === "chromeos") && (
        <WindowsControls
          isMaximized={isMaximized}
          setIsMaximized={setIsMaximized}
        />
      )}
      {osPlatform() === "gnome" && (
        <GnomeControls isMaximized={isMaximized} setIsMaximized={setIsMaximized} />
      )}
    </header>
  )
}
