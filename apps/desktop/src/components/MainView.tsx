import { createEffect, createMemo, createResource, createSignal, on, onCleanup, Show, Suspense, lazy } from 'solid-js'
import { nativeApi } from '../services/native'
import { Sidebar } from './Sidebar'

import { TerminalPanel } from './TerminalPanel'
import { BottomTerminalPanel } from './BottomTerminalPanel'
const WelcomeScreen = lazy(() => import('./WelcomeScreen').then(m => ({ default: m.WelcomeScreen })))
const SettingsPage = lazy(() => import('./SettingsPage').then(m => ({ default: m.SettingsPage })))
import { MacSidebarRevealRow } from './mac-chrome'
import { useStore } from '../store'
import { createFileContext } from '@/context/file'
import type { FileNode } from '@/types/file-node'
import type { Session } from '@/types'
import { ResizeHandle } from '@/shob-ported/resize-handle'
import { useGlobalSDK } from '@/context/global-sdk'
import { useGlobalSync } from '@/context/global-sync'
import { SDKProvider } from '@/context/sdk'
import { SyncProvider } from '@/context/sync'
import { LayoutProvider, useLayout } from '@/context/layout'
import type { SessionStatus, VcsFileDiff } from '@shob-ai/sdk/v2'
import { SessionReviewTab } from '@/pages/session/review-tab'
import { FileComponentProvider } from '@shob-ai/ui/context'
import { File as ShobFile } from '@shob-ai/ui/file'
import { ScrollView } from '@shob-ai/ui/scroll-view'
import { SessionSidePanel } from '@/pages/session/session-side-panel'
import { findReusableEmptyRootShobSession, sortShobSessionsById } from '@/utils/shob-session'
import { AGENT_REVIEW_OPEN_EVENT } from '@/components/agent-turn-diff-summary'
import { BrowserTab } from '@/components/BrowserTab'

const DEFAULT_SESSION_PANEL_WIDTH = 600
const BROWSER_TAB_STATE_KEY = "shob.browser-tab-state.v1"

type BrowserTabPersistedState = {
  projectPath: string
  open: boolean
  active: boolean
}

function readBrowserTabState(projectPath: string): BrowserTabPersistedState | null {
  if (!projectPath || typeof localStorage !== "object") return null
  try {
    const raw = localStorage.getItem(BROWSER_TAB_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BrowserTabPersistedState>
    if (parsed.projectPath !== projectPath) return null
    return {
      projectPath,
      open: parsed.open === true,
      active: parsed.active === true,
    }
  } catch {
    return null
  }
}

function writeBrowserTabState(state: BrowserTabPersistedState) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(BROWSER_TAB_STATE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

const folderNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

const toPosix = (value: string) => value.replace(/\\/g, "/").replace(/\/+/g, "/")

const toRelativeProjectPath = (absolutePath: string, projectRoot: string) => {
  const abs = toPosix(absolutePath)
  const root = toPosix(projectRoot).replace(/\/+$/, "")
  if (!root) return abs

  const absLower = abs.toLowerCase()
  const rootLower = root.toLowerCase()
  if (absLower === rootLower) return ""
  if (absLower.startsWith(`${rootLower}/`)) return abs.slice(root.length + 1)
  return abs
}

type DiffKind = "add" | "del" | "mix"
type DiffStats = { additions: number; deletions: number }

type GitStatusSummary = {
  changedFiles: Array<{
    path: string
    absolutePath: string
    status: string
    additions: number
    deletions: number
  }>
}

function FileTabContent(props: { projectPath: () => string; filePath: string }) {
  const [content] = createResource(() => props.filePath, async (filePath) => {
    const root = props.projectPath()
    const absolute = toPosix(`${root}/${filePath}`)
    const contents = await nativeApi.invoke("read_text_file", { path: absolute })
    return {
      name: filePath.split("/").pop() ?? filePath,
      contents,
      cacheKey: filePath,
    }
  })

  const FilePreview = (fileProps: any) => <ShobFile {...fileProps} />

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background-base">
      <FileComponentProvider component={FilePreview}>
        <ScrollView class="h-full min-h-0">
          <Show when={content()} fallback={<div class="px-6 py-4 text-12-regular text-text-weak">Loading...</div>}>
            {(file) => (
              <div class="relative overflow-hidden pb-40">
                <ShobFile mode="text" file={file()} class="select-text" />
              </div>
            )}
          </Show>
        </ScrollView>
      </FileComponentProvider>
    </div>
  )
}

function ShobReviewContent(props: {
  projectPath: () => string
  reviewDiffs: () => VcsFileDiff[]
  activeFilePath: () => string | null
  onSelectFile: (file: string | null) => void
  gitDiffLoading: () => boolean
  sidePanelVisible: () => boolean
  isReviewVisible: () => boolean
  isFileTreeVisible: () => boolean
  contextSessionId?: () => string | null
  onContextClose?: () => void
  activeTabId: () => string
  onSelectTab: (id: string) => void
  fileTabs: () => string[]
  onCloseFile: (path: string) => void
  terminalTabs: () => Array<{ id: string; session: Session }>
  onCloseTerminal: (id: string) => void
  browserTabOpen: () => boolean
  onCloseBrowser: () => void
  panelResizing: () => boolean
}) {
  const layout = useLayout()
  const sessionViewKey = createMemo(() => `${props.projectPath()}::workspace`)
  const view = createMemo(() => layout.view(sessionViewKey()))
  const FilePreview = (fileProps: any) => <ShobFile {...fileProps} />
  const normalizeReviewPath = (path: string) => toPosix(path).replace(/^\/+/, "").toLowerCase()
  const activeDiffPath = createMemo(() => {
    const active = props.activeFilePath()
    if (!active) return
    const target = normalizeReviewPath(active)
    return props.reviewDiffs().find((diff) => normalizeReviewPath(diff.file) === target)?.file
  })

  const openReviewPath = (path: string) => {
    const target = normalizeReviewPath(path)
    const reviewPath = props.reviewDiffs().find((diff) => normalizeReviewPath(diff.file) === target)?.file ?? path
    props.onSelectFile(reviewPath)
    view().review.openPath(reviewPath)
  }

  createEffect(() => {
    const path = activeDiffPath()
    if (!path || !props.isReviewVisible()) return
    view().review.openPath(path)
  })

  return (
    <SessionSidePanel
      panelVisible={props.sidePanelVisible}
      reviewOpen={props.isReviewVisible}
      fileTreeOpen={props.isFileTreeVisible}
      diffs={props.reviewDiffs}
      diffsReady={() => !props.gitDiffLoading()}
      activeDiff={props.activeFilePath() ?? undefined}
      focusReviewDiff={openReviewPath}
      openFile={openReviewPath}
      contextSessionId={props.contextSessionId}
      onContextClose={props.onContextClose}
      projectPath={props.projectPath}
      activeTabId={props.activeTabId}
      onSelectTab={props.onSelectTab}
      fileTabs={props.fileTabs}
      onCloseFile={props.onCloseFile}
      terminalTabs={props.terminalTabs}
      onCloseTerminal={props.onCloseTerminal}
      browserTabOpen={props.browserTabOpen}
      onCloseBrowser={props.onCloseBrowser}
      reviewPanel={() => (
        <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background-stronger contain-strict">
          <div class="relative flex-1 min-h-0 overflow-hidden pt-2">
            <FileComponentProvider component={FilePreview}>
              <SessionReviewTab
                diffs={props.reviewDiffs}
                view={view}
                diffStyle={layout.review.diffStyle()}
                onDiffStyleChange={layout.review.setDiffStyle}
                onViewFile={openReviewPath}
                focusedFile={activeDiffPath() ?? props.activeFilePath() ?? undefined}
              />
            </FileComponentProvider>
          </div>
        </div>
      )}
      renderFileTab={(filePath) => <FileTabContent projectPath={props.projectPath} filePath={filePath} />}
      renderBrowserTab={(active) => (
        <BrowserTab
          active={() => props.sidePanelVisible() && active()}
          panelResizing={props.panelResizing}
        />
      )}
    />
  )
}

function WorkspaceContent(props: { currentProject: () => any; children: any }) {
  const layout = useLayout()
  return (
    <div class="flex h-full min-h-0 max-h-full flex-1 flex-col overflow-hidden">
      <div
        class="min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
        style={{
          display: layout.terminal.maximized() ? 'none' : 'block'
        }}
      >
        {props.children}
      </div>
      <Show when={props.currentProject()}>
        <BottomTerminalPanel />
      </Show>
    </div>
  )
}

export function MainView() {
  const appStore = useStore()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const projects = useStore((s) => s.projects)
  const currentProject = useStore((s) =>
    s.projects.find((project) => project.id === s.currentProjectId) ?? null,
  )
  const currentProjectId = useStore((s) => s.currentProjectId)
  const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null)
  const [reviewFiles, setReviewFiles] = createSignal<string[]>([])
  const [isReviewVisible, setIsReviewVisible] = createSignal(false)
  const [isFileTreeVisible, setIsFileTreeVisible] = createSignal(false)
  const [isSidePanelHidden, setIsSidePanelHidden] = createSignal(false)
  const [contextTabSessionId, setContextTabSessionId] = createSignal<string | null>(null)
  const [activeTabId, setActiveTabId] = createSignal<string>("review")
  const [terminalTabs, setTerminalTabs] = createSignal<Array<{ id: string; session: Session; cwd?: string }>>([])
  const [browserTabOpen, setBrowserTabOpen] = createSignal(false)
  const [activePage, setActivePage] = createSignal<'workspace' | 'settings' | 'home'>('workspace')
  const [previousPage, setPreviousPage] = createSignal<'workspace' | 'home'>('workspace')

  const goToSettings = () => {
    const current = activePage()
    if (current === 'settings') return
    setPreviousPage(current === 'home' ? 'home' : 'workspace')
    setActivePage('settings')
  }
  const [sessionPanelWidth, setSessionPanelWidth] = createSignal(DEFAULT_SESSION_PANEL_WIDTH)
  const [gitChangedFiles, setGitChangedFiles] = createSignal<string[]>([])
  const [gitKinds, setGitKinds] = createSignal<ReadonlyMap<string, DiffKind>>(new Map())
  const [gitStats, setGitStats] = createSignal<ReadonlyMap<string, DiffStats>>(new Map())
  const [gitDiffLoading, setGitDiffLoading] = createSignal(false)
  const [gitDiffError, setGitDiffError] = createSignal<string | null>(null)
  const [gitUnavailable, setGitUnavailable] = createSignal(false)
  const [reviewDiffs, setReviewDiffs] = createSignal<VcsFileDiff[]>([])
  const [sidePanelMounted, setSidePanelMounted] = createSignal(false)
  const [reviewResizeActive, setReviewResizeActive] = createSignal(false)
  const [reviewSnap, setReviewSnap] = createSignal(false)
  const projectSessions = createMemo(() => currentProject()?.sessions ?? [])
  let workspaceSplitRef: HTMLDivElement | undefined
  let reviewResizeBounds: { leftEdge: number; min: number; max: number } | undefined
  let reviewResizeFrame: number | undefined
  let pendingSessionPanelWidth: number | undefined
  let reviewSnapFrame: number | undefined
  let sidePanelWarmToken = 0

  const projectPath = createMemo(() => currentProject()?.path ?? '')
  const sidePanelHasContent = createMemo(() => isReviewVisible() || isFileTreeVisible() || !!contextTabSessionId() || browserTabOpen())
  const sidePanelMainHasContent = createMemo(() =>
    isReviewVisible() || !!contextTabSessionId() || reviewFiles().length > 0 || terminalTabs().length > 0 || browserTabOpen(),
  )
  const sidePanelOpen = createMemo(() => sidePanelHasContent() && !isSidePanelHidden())
  const sidePanelMainOpen = createMemo(() => sidePanelMainHasContent() && !isSidePanelHidden())
  const sessionPanelStyleWidth = createMemo(() => {
    if (projectSessions().length === 0) return "0px"
    if (!sidePanelOpen()) return "100%"
    if (sidePanelMainOpen()) return `min(${sessionPanelWidth()}px, 100%)`
    return "auto"
  })
  const sidePanelStyleWidth = createMemo(() =>
    sidePanelOpen() ? (sidePanelMainOpen() ? "auto" : "fit-content") : "0px",
  )

  const fileCtx = createFileContext({
    projectPath,
    listDirectory: async (path: string) => {
      const root = projectPath()
      const absolute = path ? toPosix(`${root}/${path}`) : root
      const entries = await nativeApi.invoke("list_directory", { path: absolute }) as Array<{ name: string; path: string; isDirectory: boolean }>
      return entries.map((e) => ({
        name: e.name,
        path: toRelativeProjectPath(e.path, root),
        absolute: e.path,
        type: e.isDirectory ? "directory" : "file",
        ignored: false,
      })) as FileNode[]
    },
    onError: (msg) => console.error("[FileTree]", msg),
  })

  createEffect(
    on(
      projectPath,
      (path) => {
        sidePanelWarmToken++
        fileCtx.tree.reset()
        setActiveFilePath(null)
        setReviewFiles([])
        void nativeApi.invoke("browser_action", { action: "hide" }).catch(() => undefined)
        if (!path) {
          setBrowserTabOpen(false)
          if (activeTabId() === "browser") setActiveTabId("review")
          setSidePanelMounted(false)
          return
        }

        const browserState = readBrowserTabState(path)
        const restoreBrowserTab = browserState?.open === true
        setBrowserTabOpen(restoreBrowserTab)
        if (restoreBrowserTab) setIsSidePanelHidden(false)
        if (restoreBrowserTab && browserState?.active) {
          setActiveTabId("browser")
          setIsReviewVisible(true)
        } else if (activeTabId() === "browser") {
          setActiveTabId("review")
        }

        const token = sidePanelWarmToken
        const warm = () => {
          if (token === sidePanelWarmToken) setSidePanelMounted(true)
        }

        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(warm, { timeout: 1000 })
        } else {
          globalThis.setTimeout(warm, 0)
        }

        void fileCtx.tree.listDir("", { force: true })
      },
      { defer: false },
    ),
  )

  createEffect(() => {
    const path = projectPath()
    if (!path) return
    writeBrowserTabState({
      projectPath: path,
      open: browserTabOpen(),
      active: activeTabId() === "browser",
    })
  })

  createEffect(() => {
    if (sidePanelHasContent()) setSidePanelMounted(true)
  })

  createEffect((previous: boolean | undefined) => {
    const open = sidePanelHasContent()
    if (previous !== undefined && previous !== open) {
      if (reviewSnapFrame !== undefined) cancelAnimationFrame(reviewSnapFrame)
      setReviewSnap(true)
      reviewSnapFrame = requestAnimationFrame(() => {
        reviewSnapFrame = undefined
        setReviewSnap(false)
      })
    }
    return open
  })

  const gitStatusToKind = (status: string): DiffKind => {
    if (status === "??" || status.includes("A")) return "add"
    if (status.includes("D")) return "del"
    return "mix"
  }

  const mergeKind = (a: DiffKind | undefined, b: DiffKind): DiffKind => {
    if (!a) return b
    if (a === b) return a
    return "mix"
  }

  const loadGitDiffState = async (path: string) => {
    if (!path) {
      setGitChangedFiles([])
      setGitKinds(new Map())
      setGitStats(new Map())
      setGitDiffLoading(false)
      setGitDiffError(null)
      setGitUnavailable(false)
      return
    }

    try {
      setGitDiffLoading(true)
      setGitDiffError(null)
      setGitUnavailable(false)
      const summary = await nativeApi.invoke("get_git_status", { path }) as GitStatusSummary
      const normalize = (p: string) => toRelativeProjectPath(p, path)
      const files = summary.changedFiles
        .map((entry) => normalize(entry.absolutePath || entry.path))
        .filter(Boolean)
      const kinds = new Map<string, DiffKind>()
      const stats = new Map<string, DiffStats>()

      for (const entry of summary.changedFiles) {
        const file = normalize(entry.absolutePath || entry.path)
        if (!file) continue
        const kind = gitStatusToKind(entry.status)
        kinds.set(file, kind)
        stats.set(file, {
          additions: Number(entry.additions || 0),
          deletions: Number(entry.deletions || 0),
        })

        const parts = file.split("/")
        for (const [idx] of parts.slice(0, -1).entries()) {
          const dir = parts.slice(0, idx + 1).join("/")
          if (!dir) continue
          kinds.set(dir, mergeKind(kinds.get(dir), kind))
          const prev = stats.get(dir) ?? { additions: 0, deletions: 0 }
          stats.set(dir, {
            additions: prev.additions + Number(entry.additions || 0),
            deletions: prev.deletions + Number(entry.deletions || 0),
          })
        }
      }

      setGitChangedFiles(files)
      setGitKinds(kinds)
      setGitStats(stats)
      setGitDiffLoading(false)
      setGitUnavailable(false)
      const client = globalSDK.createClient({ directory: path, throwOnError: true })
      const diffs = await client.vcs.diff({ mode: "git", directory: path }).then((response) => response.data)
      setReviewDiffs(Array.isArray(diffs) ? diffs : [])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "")
      const noGitRepo =
        /not a git repository/i.test(message) ||
        /no git repository/i.test(message) ||
        /unable to find git/i.test(message)
      setGitChangedFiles([])
      setGitKinds(new Map())
      setGitStats(new Map())
      setGitDiffLoading(false)
      setGitUnavailable(noGitRepo)
      setGitDiffError(noGitRepo ? null : (error instanceof Error ? error.message : "Unable to load git changes"))
      setReviewDiffs([])
    }
  }

  createEffect(() => {
    const path = projectPath()
    void loadGitDiffState(path)
  })

  createEffect(() => {
    const project = currentProject()
    if (!project) return

    let timer: number | undefined
    const unlistenPromise = nativeApi.listen<{ projectPath: string; paths: string[] }>("project-fs-event", (event) => {
      if (event.payload.projectPath !== project.path) return
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void loadGitDiffState(project.path)
      }, 160)
    })

    return () => {
      if (timer) window.clearTimeout(timer)
      unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined)
    }
  })

  createEffect(() => {
    const visible = sidePanelOpen()
    window.dispatchEvent(
      new CustomEvent('gg-review-state', {
        detail: {
          isReviewVisible: visible,
          isReviewPanelVisible: isReviewVisible(),
          isSidePanelVisible: visible,
        },
      }),
    )
  })

  createEffect(() => {
    const handleReviewToggleRequest = () => {
      if (sidePanelOpen()) {
        setIsSidePanelHidden(true)
        return
      }
      setIsSidePanelHidden(false)
      if (!sidePanelHasContent()) {
        setIsReviewVisible(true)
        setActiveTabId("review")
      }
    }

    window.addEventListener('gg-toggle-review', handleReviewToggleRequest)
    return () => window.removeEventListener('gg-toggle-review', handleReviewToggleRequest)
  })

  createEffect(() => {
    const handleReviewWorkspaceToggleRequest = () => {
      const nextVisible = !(sidePanelOpen() || isFileTreeVisible())
      setIsSidePanelHidden(false)
      setIsReviewVisible(nextVisible)
      setIsFileTreeVisible(nextVisible)
    }

    window.addEventListener('gg-toggle-review-workspace', handleReviewWorkspaceToggleRequest)
    return () => window.removeEventListener('gg-toggle-review-workspace', handleReviewWorkspaceToggleRequest)
  })

  createEffect(() => {
    const handleReviewWorkspaceOpenRequest = () => {
      if (!currentProject()) return
      setIsSidePanelHidden(false)
      setIsReviewVisible(true)
      setIsFileTreeVisible(true)
      setActiveTabId("review")
    }

    window.addEventListener(AGENT_REVIEW_OPEN_EVENT, handleReviewWorkspaceOpenRequest)
    return () => window.removeEventListener(AGENT_REVIEW_OPEN_EVENT, handleReviewWorkspaceOpenRequest)
  })

  createEffect(() => {
    const visible = isFileTreeVisible()
    window.dispatchEvent(
      new CustomEvent('gg-file-tree-state', {
        detail: { isFileTreeVisible: visible },
      }),
    )
  })

  createEffect(() => {
    const handleFileTreeToggleRequest = () => {
      setIsSidePanelHidden(false)
      setIsFileTreeVisible((current) => !current)
    }

    window.addEventListener('gg-toggle-file-tree', handleFileTreeToggleRequest)
    return () => window.removeEventListener('gg-toggle-file-tree', handleFileTreeToggleRequest)
  })

  createEffect(() => {
    const handleOpenContextTab = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const sessionId = detail?.sessionId
      if (!sessionId) return
      setContextTabSessionId(sessionId)
      setIsSidePanelHidden(false)
      setIsReviewVisible(true)
    }

    window.addEventListener('gg-open-context-tab', handleOpenContextTab as EventListener)
    return () => window.removeEventListener('gg-open-context-tab', handleOpenContextTab as EventListener)
  })

  const openBrowserTab = () => {
    if (!currentProject()) {
      console.warn("[shob-open-browser-tab] no current project")
      return
    }
    setBrowserTabOpen(true)
    setActiveTabId("browser")
    setIsSidePanelHidden(false)
    setIsReviewVisible(true)
  }

  createEffect(() => {
    const handleOpenTerminalTab = async (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail
        const cwd = detail?.cwd
        const project = currentProject()
        if (!project) {
          console.warn("[shob-open-terminal-tab] no current project")
          return
        }
        const projectId = currentProjectId() ?? projects()[0]?.id ?? null
        if (!projectId) {
          console.warn("[shob-open-terminal-tab] no project id")
          return
        }
        const shell =
          appStore.availableShells.find((s) => s === appStore.preferredShell) ??
          appStore.availableShells[0] ??
          appStore.preferredShell ??
          ''
        const session = await appStore.addIsolatedSession(projectId, shell)
        const id = `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        setTerminalTabs((tabs) => [...tabs, { id, session, cwd }])
        setActiveTabId(`terminal:${id}`)
        setIsSidePanelHidden(false)
        setIsReviewVisible(true)
      } catch (err) {
        console.error("[shob-open-terminal-tab] failed:", err)
      }
    }

    window.addEventListener('shob-open-terminal-tab', handleOpenTerminalTab as EventListener)
    return () => window.removeEventListener('shob-open-terminal-tab', handleOpenTerminalTab as EventListener)
  })

  createEffect(() => {
    const handleOpenBrowserTab = () => {
      openBrowserTab()
    }

    window.addEventListener('shob-open-browser-tab', handleOpenBrowserTab as EventListener)
    const unlistenPromise = nativeApi.listen("browser:open", handleOpenBrowserTab)
    return () => {
      window.removeEventListener('shob-open-browser-tab', handleOpenBrowserTab as EventListener)
      unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined)
    }
  })

  const handleFileSelect = (filePath: string | null) => {
    setActiveFilePath(filePath)
    if (!filePath) return
    setReviewFiles((files) => files.includes(filePath) ? files : [...files, filePath])
    setActiveTabId(`file:${filePath}`)
    setIsSidePanelHidden(false)
    setIsReviewVisible(true)
  }

  const handleCloseReviewFile = (filePath: string) => {
    setReviewFiles((files) => {
      const next = files.filter((file) => file !== filePath)
      if (activeFilePath() === filePath) {
        setActiveFilePath(next.at(-1) ?? null)
      }
      return next
    })
    if (activeTabId() === `file:${filePath}`) {
      setActiveTabId("review")
    }
  }

  const handleCloseTerminalTab = (id: string) => {
    setTerminalTabs((tabs) => {
      const next = tabs.filter((tab) => tab.id !== id)
      if (activeTabId() === `terminal:${id}`) {
        setActiveTabId(next.at(-1)?.id ? `terminal:${next.at(-1)!.id}` : "review")
      }
      return next
    })
  }

  const handleCloseBrowserTab = () => {
    setBrowserTabOpen(false)
    if (activeTabId() === "browser") setActiveTabId("review")
    void nativeApi.invoke("browser_action", { action: "hide" }).catch(() => undefined)
  }

  const handleOpenFolder = async () => {
    const selected = await nativeApi.open({
      directory: true,
      multiple: false,
      title: 'Select Project Folder',
    })

    if (typeof selected !== 'string' || !selected) return

    const existing = projects().find((project) => project.path === selected)
    if (existing) {
      appStore.setCurrentProject(existing.id)
      return
    }

    const created = await appStore.addProject(folderNameFromPath(selected), selected)
    appStore.setCurrentProject(created.id)
  }

  const handleCreateSession = async () => {
    const cpid = currentProjectId() ?? projects()[0]?.id ?? null
    if (!cpid) return
    const project = projects().find((item) => item.id === cpid)
    if (!project) return
    const [projectStore, setProjectStore] = globalSync.child(project.path)
    const reusable = findReusableEmptyRootShobSession(projectStore.session, projectStore.message, appStore.activeSessionId)
    if (reusable) {
      setProjectStore("message", reusable.id, (messages) => messages ?? [])
      if (!projectStore.session_status[reusable.id]) {
        setProjectStore("session_status", reusable.id, { type: "idle" } as SessionStatus)
      }
      await appStore.syncShobSessions(cpid, projectStore.session)
      if (currentProjectId() !== cpid) appStore.setCurrentProject(cpid)
      appStore.setActiveSession(reusable.id)
      return
    }

    const client = globalSDK.createClient({ directory: project.path, throwOnError: true })
    const created = await client.session.create().then((response) => response.data)
    if (!created) return
    const hadSession = projectStore.session.some((session) => session.id === created.id)
    const mergedSessions = [created, ...projectStore.session.filter((session) => session.id !== created.id)]
    setProjectStore("session", (sessions) =>
      hadSession
        ? sessions.map((session) => (session.id === created.id ? created : session))
        : sortShobSessionsById([...sessions, created]),
    )
    setProjectStore("message", created.id, (messages) => messages ?? [])
    if (!projectStore.session_status[created.id]) {
      setProjectStore("session_status", created.id, { type: "idle" } as SessionStatus)
    }
    if (!hadSession && !created.parentID) {
      setProjectStore("sessionTotal", (total) => total + 1)
    }
    await appStore.syncShobSessions(cpid, mergedSessions)
    if (currentProjectId() !== cpid) appStore.setCurrentProject(cpid)
    appStore.setActiveSession(created.id)
    void globalSync.project.loadSessions(project.path)
  }

  const handleToggleFileTree = () => {
    if (!currentProject()) return
    setIsFileTreeVisible((current) => !current)
  }

  const clampPanelWidth = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

  const workspaceSplitRect = () => workspaceSplitRef?.getBoundingClientRect()

  const computeReviewResizeBounds = () => {
    const rect = workspaceSplitRect()
    const leftEdge = rect?.left ?? 0
    const rightEdge = rect?.right ?? window.innerWidth
    const available = Math.max(0, rightEdge - leftEdge)
    const min = Math.min(450, available)
    const max = Math.max(min, available * 0.72)
    return {
      leftEdge,
      min,
      max,
    }
  }

  const commitReviewWidth = () => {
    reviewResizeFrame = undefined
    if (pendingSessionPanelWidth === undefined) return
    setSessionPanelWidth(pendingSessionPanelWidth)
    pendingSessionPanelWidth = undefined
  }

  const scheduleReviewWidth = (width: number) => {
    pendingSessionPanelWidth = width
    if (reviewResizeFrame !== undefined) return
    reviewResizeFrame = requestAnimationFrame(commitReviewWidth)
  }

  const beginReviewResize = () => {
    reviewResizeBounds = computeReviewResizeBounds()
    setReviewResizeActive(true)
  }

  const endReviewResize = () => {
    if (reviewResizeFrame !== undefined) {
      cancelAnimationFrame(reviewResizeFrame)
      reviewResizeFrame = undefined
    }
    if (pendingSessionPanelWidth !== undefined) {
      setSessionPanelWidth(pendingSessionPanelWidth)
      pendingSessionPanelWidth = undefined
    }
    reviewResizeBounds = undefined
    setReviewResizeActive(false)
  }

  const resizeReviewPanel = (clientX: number) => {
    const bounds = reviewResizeBounds ?? computeReviewResizeBounds()
    const next = clientX - bounds.leftEdge
    scheduleReviewWidth(clampPanelWidth(next, bounds.min, bounds.max))
  }

  onCleanup(() => {
    if (reviewResizeFrame !== undefined) cancelAnimationFrame(reviewResizeFrame)
    if (reviewSnapFrame !== undefined) cancelAnimationFrame(reviewSnapFrame)
  })

  return (
    <div
      class="grid h-full min-h-0 max-h-full flex-1 overflow-hidden bg-background text-foreground"
      classList={{
        'grid-cols-[auto_minmax(0,1fr)]': activePage() !== 'settings',
        'grid-cols-[minmax(0,1fr)]': activePage() === 'settings',
      }}
    >
      {/* Keep the Sidebar mounted to preserve its state, but collapse it on the
          settings page so settings spans the full window width. */}
      <div classList={{ contents: activePage() !== 'settings', hidden: activePage() === 'settings' }}>
        <Sidebar
          onOpenSettingsPage={goToSettings}
          onOpenWorkspacePage={() => setActivePage('workspace')}
          onOpenHomePage={() => setActivePage('home')}
        />
      </div>
      <div class="flex h-full min-h-0 max-h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {activePage() === 'workspace' ? (
          <LayoutProvider>
            <WorkspaceContent currentProject={currentProject}>
              <div ref={workspaceSplitRef} class="shob-workspace-split flex h-full w-full min-h-0 min-w-0">
                <div
                  class="shob-workspace-agent min-h-0 min-w-0 overflow-hidden"
                  classList={{
                    "flex-1": !sidePanelOpen() || !sidePanelMainOpen(),
                    "shrink-0": sidePanelOpen() && sidePanelMainOpen(),
                  }}
                  style={{
                    display: projectSessions().length > 0 ? 'flex' : 'none',
                    width: sessionPanelStyleWidth(),
                  }}
                >
                  <TerminalPanel onNewSession={handleCreateSession} reviewDiffs={reviewDiffs} />
                </div>

                {projectSessions().length === 0 && (
                  <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <MacSidebarRevealRow />
                    <div class="min-h-0 flex-1 overflow-hidden">
                      <WelcomeScreen
                        projects={projects()}
                        currentProject={currentProject()}
                        onOpenFolder={handleOpenFolder}
                        onCreateSession={handleCreateSession}
                        onSelectProject={appStore.setCurrentProject}
                        onToggleFileTree={handleToggleFileTree}
                      />
                    </div>
                  </div>
                )}

                <Show when={sidePanelMounted()}>
                  <div
                    class="shob-workspace-side-panel relative h-full min-h-0 max-h-full shrink-0 overflow-hidden"
                    classList={{
                      "flex-1": sidePanelOpen() && sidePanelMainOpen(),
                      "border-l": sidePanelOpen(),
                      "border-border/60": sidePanelOpen(),
                      "pointer-events-none": !sidePanelOpen(),
                      "transition-[width]": !reviewResizeActive() && !reviewSnap(),
                      "duration-[240ms]": !reviewResizeActive() && !reviewSnap(),
                      "ease-[cubic-bezier(0.22,1,0.36,1)]": !reviewResizeActive() && !reviewSnap(),
                      "will-change-[width]": !reviewResizeActive() && !reviewSnap(),
                      "motion-reduce:transition-none": !reviewResizeActive() && !reviewSnap(),
                    }}
                    style={{ width: sidePanelStyleWidth() }}
                  >
                    <Show when={sidePanelOpen() && sidePanelMainOpen()}>
                      <ResizeHandle
                        edge="start"
                        onResize={resizeReviewPanel}
                        onResizeStart={beginReviewResize}
                        onResizeEnd={endReviewResize}
                      />
                    </Show>
                    <Suspense fallback={null}>
                      <SDKProvider directory={projectPath}>
                        <SyncProvider>
                          <fileCtx.FileProvider>
                            <ShobReviewContent
                              projectPath={projectPath}
                              reviewDiffs={reviewDiffs}
                              activeFilePath={activeFilePath}
                              onSelectFile={handleFileSelect}
                              gitDiffLoading={gitDiffLoading}
                              sidePanelVisible={sidePanelOpen}
                              isReviewVisible={isReviewVisible}
                              isFileTreeVisible={isFileTreeVisible}
                              contextSessionId={contextTabSessionId}
                              onContextClose={() => setContextTabSessionId(null)}
                              activeTabId={activeTabId}
                              onSelectTab={setActiveTabId}
                              fileTabs={reviewFiles}
                              onCloseFile={handleCloseReviewFile}
                              terminalTabs={terminalTabs}
                              onCloseTerminal={handleCloseTerminalTab}
                              browserTabOpen={browserTabOpen}
                              onCloseBrowser={handleCloseBrowserTab}
                              panelResizing={reviewResizeActive}
                            />
                          </fileCtx.FileProvider>
                        </SyncProvider>
                      </SDKProvider>
                    </Suspense>
                  </div>
                </Show>
              </div>
            </WorkspaceContent>
          </LayoutProvider>
        ) : activePage() === 'settings' ? (
          <Suspense fallback={<div class="flex h-full w-full items-center justify-center text-sm text-text-weak">Loading settings...</div>}>
            <SettingsPage onGoBack={() => setActivePage(previousPage())} />
          </Suspense>
        ) : (
          <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <MacSidebarRevealRow />
            <div class="min-h-0 flex-1 overflow-hidden">
              <Suspense fallback={<div class="flex h-full w-full items-center justify-center text-sm text-text-weak">Loading...</div>}>
                <WelcomeScreen
                  projects={projects()}
                  currentProject={currentProject()}
                  onOpenFolder={handleOpenFolder}
                onCreateSession={() => {
                  setActivePage('workspace')
                  void handleCreateSession()
                }}
                onSelectProject={(id) => {
                  appStore.setCurrentProject(id)
                  setActivePage('workspace')
                }}
                onToggleFileTree={() => {
                  setActivePage('workspace')
                  handleToggleFileTree()
                }}
                />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
