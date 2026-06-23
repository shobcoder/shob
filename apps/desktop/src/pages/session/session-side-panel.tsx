import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { Tabs } from "@shob-ai/ui/tabs"
import { ResizeHandle } from "@shob-ai/ui/resize-handle"
import { IconButton } from "@shob-ai/ui/icon-button"
import { Tooltip } from "@shob-ai/ui/tooltip"
import { useDialog } from "@shob-ai/ui/context/dialog"
import type { SnapshotFileDiff, VcsFileDiff } from "@shob-ai/sdk/v2"
import FileTree from "@/components/file-tree"
import { Terminal } from "@/components/Terminal"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { SessionContextTab } from "@/components/session/session-context-tab"
import { DialogAddTab } from "@/components/dialog-add-tab"

type RenderDiff = (SnapshotFileDiff & { file: string }) | VcsFileDiff

function renderDiff(value: SnapshotFileDiff | VcsFileDiff): value is RenderDiff {
  return typeof value.file === "string"
}

type SidePanelProps = {
  panelVisible: () => boolean
  reviewOpen: () => boolean
  fileTreeOpen: () => boolean
  diffs: () => (SnapshotFileDiff | VcsFileDiff)[]
  diffsReady: () => boolean
  reviewPanel: () => JSX.Element
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  openFile: (path: string) => void
  contextSessionId?: () => string | null
  onContextClose?: () => void
  projectPath: () => string
  activeTabId: () => string
  onSelectTab: (id: string) => void
  fileTabs: () => string[]
  onCloseFile: (path: string) => void
  terminalTabs: () => Array<{ id: string; session: any }>
  onCloseTerminal: (id: string) => void
  browserTabOpen: () => boolean
  onCloseBrowser: () => void
  renderFileTab: (filePath: string) => JSX.Element
  renderBrowserTab: (active: () => boolean) => JSX.Element
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return idx >= 0 ? path.slice(idx + 1) : path
}

export function SessionSidePanel(props: SidePanelProps) {
  const layout = useLayout()
  const file = useFile()
  const language = useLanguage()
  const dialog = useDialog()
  const [fileTreeResizeActive, setFileTreeResizeActive] = createSignal(false)
  let fileTreeResizeTimer: number | undefined
  let fileTreeResizeFrame: number | undefined
  let pendingFileTreeWidth: number | undefined

  const getActiveDirectory = () => {
    const root = props.projectPath().replace(/\\/g, '/');
    let currentPath = props.activeDiff;
    if (props.activeTabId() && props.activeTabId().startsWith("file:")) {
      currentPath = props.activeTabId().substring(5);
    }
    if (!currentPath) return root;

    // If currentPath is already an absolute path, just get its dirname
    if (currentPath.includes(':') || currentPath.startsWith('/')) {
      const parts = currentPath.replace(/\\/g, '/').split('/');
      parts.pop();
      return parts.join('/') || root;
    }

    const normalized = currentPath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    parts.pop(); // Remove the file name
    const dir = parts.join('/');

    return dir ? `${root}/${dir}` : root;
  }

  const openAddTabDialog = () => {
    dialog.show(() => (
      <DialogAddTab
        projectPath={props.projectPath}
        onOpenFile={(path) => props.openFile(path)}
        onOpenTerminal={() => {
          window.dispatchEvent(new CustomEvent("shob-open-terminal-tab", { detail: { cwd: getActiveDirectory() } }))
        }}
        onOpenBrowser={() => {
          window.dispatchEvent(new CustomEvent("shob-open-browser-tab"))
        }}
      />
    ))
  }

  const terminalCount = () => props.terminalTabs().length
  const hasDynamicTab = () => props.fileTabs().length > 0 || terminalCount() > 0 || props.browserTabOpen()
  const hasContext = () => !!props.contextSessionId?.()

  const open = createMemo(
    () => props.panelVisible() && (props.reviewOpen() || props.fileTreeOpen() || hasContext() || hasDynamicTab()),
  )

  const isActive = (id: string) => props.activeTabId() === id
  const selectTab = (id: string) => props.onSelectTab(id)
  const diffs = createMemo(() => props.diffs().filter(renderDiff))
  const diffFiles = createMemo(() => diffs().map((diff) => diff.file))
  const reviewCount = createMemo(() => diffFiles().length)
  const hasReview = createMemo(() => reviewCount() > 0)
  const fileTreeTab = () => layout.fileTree.tab()
  const treeWidth = createMemo(() => (props.fileTreeOpen() ? `${layout.fileTree.width()}px` : "0px"))

  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "")
    const out = new Map<string, "add" | "del" | "mix">()

    for (const diff of diffs()) {
      const filepath = normalize(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"
      out.set(filepath, kind)

      const parts = filepath.split("/")
      for (const [index] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, index + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }

    return out
  })

  const nofiles = createMemo(() => {
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return file.tree.children("").length === 0
  })

  const setFileTreeTabValue = (value: string) => {
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  const stopFileTreeResize = () => {
    if (fileTreeResizeTimer !== undefined) {
      window.clearTimeout(fileTreeResizeTimer)
      fileTreeResizeTimer = undefined
    }
    if (fileTreeResizeFrame !== undefined) {
      window.cancelAnimationFrame(fileTreeResizeFrame)
      fileTreeResizeFrame = undefined
    }
    if (pendingFileTreeWidth !== undefined) {
      layout.fileTree.resize(pendingFileTreeWidth)
      pendingFileTreeWidth = undefined
    }
    setFileTreeResizeActive(false)
  }

  const startFileTreeResize = () => {
    if (fileTreeResizeTimer !== undefined) {
      window.clearTimeout(fileTreeResizeTimer)
      fileTreeResizeTimer = undefined
    }
    setFileTreeResizeActive(true)
  }

  const touchFileTreeResize = () => {
    startFileTreeResize()
    fileTreeResizeTimer = window.setTimeout(stopFileTreeResize, 120)
  }

  const commitFileTreeResize = () => {
    fileTreeResizeFrame = undefined
    if (pendingFileTreeWidth === undefined) return
    layout.fileTree.resize(pendingFileTreeWidth)
    pendingFileTreeWidth = undefined
  }

  const scheduleFileTreeResize = (width: number) => {
    pendingFileTreeWidth = width
    if (fileTreeResizeFrame !== undefined) return
    fileTreeResizeFrame = window.requestAnimationFrame(commitFileTreeResize)
  }

  onCleanup(() => {
    if (fileTreeResizeTimer !== undefined) window.clearTimeout(fileTreeResizeTimer)
    if (fileTreeResizeFrame !== undefined) window.cancelAnimationFrame(fileTreeResizeFrame)
  })

  const empty = (message: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{message}</div>
      </div>
    </div>
  )

  const CloseButton = (closeProps: { onClick: (e: MouseEvent) => void }) => (
    <button
      type="button"
      class="ml-1 size-4 flex items-center justify-center rounded hover:bg-surface-raised-base-hover text-text-weak"
      onClick={(e) => {
        e.stopPropagation()
        closeProps.onClick(e)
      }}
    >
      <svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  )

  return (
    <aside
      id="review-panel"
      aria-label={language.t("session.panel.reviewAndFiles")}
      aria-hidden={!open()}
      inert={!open()}
      class="relative min-w-0 h-full flex shrink-0 overflow-hidden bg-background-base"
      classList={{ "pointer-events-none": !open() }}
    >
      <Show when={open()}>
        <div class="size-full flex border-l border-border-weaker-base">
          <div
            aria-hidden={!props.reviewOpen() && !hasContext() && !hasDynamicTab()}
            inert={!props.reviewOpen() && !hasContext() && !hasDynamicTab()}
            class="relative min-w-0 h-full flex-1 overflow-hidden bg-background-base"
            classList={{
              "pointer-events-none": !props.reviewOpen() && !hasContext() && !hasDynamicTab(),
            }}
          >
            <div class="size-full min-w-0 h-full min-h-0 bg-background-base flex flex-col">
              <Tabs
                value={props.activeTabId()}
                onChange={(value) => selectTab(value.toString())}
                class="h-full min-h-0"
              >
                <div class="sticky top-0 z-10 shrink-0 flex bg-background-base border-b border-border-weaker-base">
                  <Tabs.List>
                    <Tabs.Trigger value="review" onClick={() => selectTab("review")}>
                      <div class="flex items-center gap-1.5">
                        <div>{language.t("session.tab.review")}</div>
                        <Show when={hasReview()}>
                          <div>{reviewCount()}</div>
                        </Show>
                      </div>
                    </Tabs.Trigger>
                    <Show when={hasContext()}>
                      <Tabs.Trigger value="context" onClick={() => selectTab("context")}>
                        <div class="flex items-center gap-1.5">
                          <div>{language.t("session.tab.context")}</div>
                          <CloseButton onClick={() => props.onContextClose?.()} />
                        </div>
                      </Tabs.Trigger>
                    </Show>
                    <For each={props.fileTabs()}>
                      {(filePath) => (
                        <Tabs.Trigger
                          value={`file:${filePath}`}
                          onClick={() => selectTab(`file:${filePath}`)}
                        >
                          <div class="flex items-center gap-1.5">
                            <div class="truncate max-w-32">{basename(filePath)}</div>
                            <CloseButton onClick={() => props.onCloseFile(filePath)} />
                          </div>
                        </Tabs.Trigger>
                      )}
                    </For>
                    <For each={props.terminalTabs()}>
                      {(tab, index) => (
                        <Tabs.Trigger
                          value={`terminal:${tab.id}`}
                          onClick={() => selectTab(`terminal:${tab.id}`)}
                        >
                          <div class="flex items-center gap-1.5">
                            <div>
                              {language.t("session.tab.terminal")}
                              {terminalCount() > 1 ? ` ${index() + 1}` : ""}
                            </div>
                            <CloseButton onClick={() => props.onCloseTerminal(tab.id)} />
                          </div>
                        </Tabs.Trigger>
                      )}
                    </For>
                    <Show when={props.browserTabOpen()}>
                      <Tabs.Trigger value="browser" onClick={() => selectTab("browser")}>
                        <div class="flex items-center gap-1.5">
                          <div>Browser</div>
                          <CloseButton onClick={() => props.onCloseBrowser()} />
                        </div>
                      </Tabs.Trigger>
                    </Show>
                    <div class="bg-background-stronger h-full shrink-0 sticky right-0 z-10 flex items-center justify-center gap-1 pr-3">
                      <Tooltip value={props.fileTreeOpen() ? "Hide file tree" : "Show file tree"} placement="bottom">
                        <IconButton
                          icon={props.fileTreeOpen() ? "file-tree-active" : "file-tree"}
                          variant="ghost"
                          iconSize="small"
                          class="!rounded-md"
                          aria-label="Toggle file tree"
                          aria-pressed={props.fileTreeOpen()}
                          data-selected={props.fileTreeOpen() ? "" : undefined}
                          onClick={() => window.dispatchEvent(new Event("gg-toggle-file-tree"))}
                        />
                      </Tooltip>
                      <Tooltip value={language.t("session.tab.add")} placement="bottom">
                        <IconButton
                          icon="plus-small"
                          variant="ghost"
                          iconSize="large"
                          class="!rounded-md"
                          aria-label={language.t("session.tab.add")}
                          onClick={openAddTabDialog}
                        />
                      </Tooltip>
                    </div>
                  </Tabs.List>
                </div>
                <Tabs.Content
                  value="review"
                  class="flex flex-col h-full min-h-0 overflow-hidden contain-strict"
                >
                  <Show when={props.reviewOpen() && props.activeTabId() === "review"}>
                    {props.reviewPanel()}
                  </Show>
                </Tabs.Content>
                <Tabs.Content
                  value="context"
                  class="flex-1 min-h-0 overflow-y-auto"
                >
                  <Show when={hasContext()}>
                    <SessionContextTab sessionId={props.contextSessionId!()!} />
                  </Show>
                </Tabs.Content>
                <For each={props.fileTabs()}>
                  {(filePath) => (
                    <Tabs.Content
                      value={`file:${filePath}`}
                      class="flex-1 min-h-0 overflow-y-auto"
                    >
                      {isActive(`file:${filePath}`) ? props.renderFileTab(filePath) : null}
                    </Tabs.Content>
                  )}
                </For>
                <For each={props.terminalTabs()}>
                  {(tab) => (
                    <Tabs.Content
                      value={`terminal:${tab.id}`}
                      class="relative flex-1 min-h-0 overflow-hidden"
                    >
                      <div class="absolute inset-0">
                        <Terminal
                          sessionId={tab.session.id}
                          session={tab.session}
                          cwd={(tab as any).cwd}
                          isActiveOverride={() => isActive(`terminal:${tab.id}`)}
                        />
                      </div>
                    </Tabs.Content>
                  )}
                </For>
                <Tabs.Content
                  value="browser"
                  class="relative flex-1 min-h-0 overflow-hidden"
                >
                  <Show when={props.browserTabOpen()}>
                    {props.renderBrowserTab(() => isActive("browser"))}
                  </Show>
                </Tabs.Content>
              </Tabs>
            </div>
          </div>

          <div
            id="file-tree-panel"
            aria-hidden={!props.fileTreeOpen()}
            inert={!props.fileTreeOpen()}
            class="relative min-w-0 h-full shrink-0 overflow-hidden"
            classList={{
              "pointer-events-none": !props.fileTreeOpen(),
              "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none": !fileTreeResizeActive(),
            }}
            style={{ width: treeWidth() }}
          >
            <div
              class="h-full flex flex-col overflow-hidden group/filetree"
              classList={{ "border-l border-border-weaker-base": props.reviewOpen() }}
            >
              <Tabs
                variant="pill"
                value={fileTreeTab()}
                onChange={setFileTreeTabValue}
                class="h-full"
                data-scope="filetree"
              >
                <Tabs.List>
                  <Tabs.Trigger value="changes" class="flex-1" classes={{ button: "w-full" }}>
                    {reviewCount()}{" "}
                    {language.t(reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other")}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
                    {language.t("session.files.all")}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="changes" class="bg-background-stronger px-3 py-0">
                  <Switch>
                    <Match when={hasReview() || !props.diffsReady()}>
                      <Show
                        when={props.diffsReady()}
                        fallback={
                          <div class="px-2 py-2 text-12-regular text-text-weak">
                            {language.t("common.loading")}
                            {language.t("common.loading.ellipsis")}
                          </div>
                        }
                      >
                        <FileTree
                          path=""
                          class="pt-3"
                          allowed={diffFiles()}
                          kinds={kinds()}
                          draggable={false}
                          active={props.activeDiff}
                          onFileClick={(node) => props.focusReviewDiff(node.path)}
                        />
                      </Show>
                    </Match>
                  </Switch>
                </Tabs.Content>
                <Tabs.Content value="all" class="bg-background-stronger px-3 py-0">
                  <Switch>
                    <Match when={nofiles()}>{empty(language.t("session.files.empty"))}</Match>
                    <Match when={true}>
                      <FileTree
                        path=""
                        class="pt-3"
                        modified={diffFiles()}
                        kinds={kinds()}
                        onFileClick={(node) => props.openFile(node.path)}
                      />
                    </Match>
                  </Switch>
                </Tabs.Content>
              </Tabs>
            </div>
            <Show when={props.fileTreeOpen()}>
              <div onPointerDown={startFileTreeResize}>
                <ResizeHandle
                  direction="horizontal"
                  edge="start"
                  size={layout.fileTree.width()}
                  min={200}
                  max={480}
                  onResize={(width) => {
                    touchFileTreeResize()
                    scheduleFileTreeResize(width)
                  }}
                />
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </aside>
  )
}
