import { createEffect, createMemo, createSignal, For, Show, startTransition, Suspense, type ParentProps } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { createStore, produce } from "solid-js/store"
import { useMutation } from "@tanstack/solid-query"
import { DebugBar } from "@/components/debug-bar"
import { DropdownMenu } from "@shob/ui/dropdown-menu"
import { ResizeHandle } from "@shob/ui/resize-handle"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { useCommand } from "@/context/command"
import { useLayout, type LocalProject } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs } from "@/context/tabs"
import { useDirectoryPicker } from "@/components/directory-picker"
import { Icon as IconV2 } from "@shob/ui/v2/icon"
import { useDialog } from "@shob/ui/context/dialog"
import { DotsSpinner } from "@/components/dots-spinner"
import { DragDropProvider, DragDropSensors, SortableProvider, closestCenter, createSortable, DragOverlay, useDragDropContext } from "@thisbeyond/solid-dnd"
import { ConstrainDragXAxis } from "@/utils/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { displayName, sortedRootSessions } from "./layout/helpers"
import { ProjectIcon } from "./layout/sidebar-items"
import { setNavigate } from "@/utils/notification-click"
import { setV2Toast, showToast, ToastRegion } from "@/utils/toast"
import { sessionTitle } from "@/utils/session-title"
import { pathKey } from "@/utils/path-key"

const CODEX_SIDEBAR_MIN_WIDTH = 244
const CODEX_SIDEBAR_MAX_WIDTH = 560
const CODEX_PROJECT_SESSION_LIMIT = 5
const CODEX_PROJECT_SESSION_EXPANDED_LIMIT = 15

const CodexProjectGlyph = () => (
  <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" aria-hidden="true">
    <path
      d="M19,14.5 L19,5.5 C19,4.67157288 18.3284271,4 17.5,4 L6.5,4 C5.67157288,4 5,4.67157288 5,5.5 L5,18.5 C5,19.3284271 5.67157288,20 6.5,20 L13.5,20 C14.3284271,20 15,19.3284271 15,18.5 C15,17.1192881 16.1192881,16 17.5,16 C18.3284271,16 19,15.3284271 19,14.5 L19,14.5 Z M18.5014408,16.7913481 C18.1948298,16.9255432 17.8561101,17 17.5,17 C16.6715729,17 16,17.6715729 16,18.5 C16,18.8561101 15.9255432,19.1948298 15.7913481,19.5014408 C16.9873685,18.9526013 17.9526013,17.9873685 18.5014408,16.7913481 L18.5014408,16.7913481 Z M4,5.5 C4,4.11928813 5.11928813,3 6.5,3 L17.5,3 C18.8807119,3 20,4.11928813 20,5.5 L20,14.5 C20,18.0898509 17.0898509,21 13.5,21 L6.5,21 C5.11928813,21 4,19.8807119 4,18.5 L4,5.5 Z M8.5,9 C8.22385763,9 8,8.77614237 8,8.5 C8,8.22385763 8.22385763,8 8.5,8 L15.5,8 C15.7761424,8 16,8.22385763 16,8.5 C16,8.77614237 15.7761424,9 15.5,9 L8.5,9 Z M8.5,12 C8.22385763,12 8,11.7761424 8,11.5 C8,11.2238576 8.22385763,11 8.5,11 L15.5,11 C15.7761424,11 16,11.2238576 16,11.5 C16,11.7761424 15.7761424,12 15.5,12 L8.5,12 Z M8.5,15 C8.22385763,15 8,14.7761424 8,14.5 C8,14.2238576 8.22385763,14 8.5,14 L13.5,14 C13.7761424,14 14,14.2238576 14,14.5 C14,14.7761424 13.7761424,15 13.5,15 L8.5,15 Z"
      fill="currentColor"
    />
  </svg>
)

const CodexDotsGlyph = () => (
  <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" aria-hidden="true">
    <path
      d="M4.25 8.25h.01M8 8.25h.01M11.75 8.25h.01"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.6"
    />
  </svg>
)

const SynaraComposePencilGlyph = () => (
  <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M10.938 4.5H9.9c-1.136 0-1.929 0-2.546.05-.605.05-.953.143-1.216.277-.564.288-1.023.747-1.31 1.31-.135.264-.228.612-.277 1.218C4.5 7.97 4.5 8.765 4.5 9.9v4.2c0 1.136 0 1.929.05 2.546.05.605.143.953.277 1.216.288.565.747 1.023 1.31 1.31.264.135.612.228 1.217.277.617.05 1.41.051 2.546.051h4.2c1.136 0 1.929 0 2.545-.05.606-.05.954-.143 1.217-.277.565-.288 1.023-.746 1.31-1.31.135-.264.228-.612.277-1.217.05-.617.051-1.41.051-2.546v-1.037h2V14.1c0 1.103.001 1.992-.058 2.709-.06.728-.185 1.368-.487 1.96-.48.941-1.245 1.707-2.185 2.186-.593.302-1.233.428-1.961.488-.718.058-1.606.057-2.71.057H9.9c-1.103 0-1.991.001-2.709-.058-.728-.06-1.368-.185-1.96-.487-.941-.48-1.707-1.245-2.186-2.185-.302-.593-.428-1.233-.487-1.961-.059-.718-.058-1.606-.058-2.71V9.9c0-1.103-.001-1.991.058-2.709.06-.728.185-1.368.487-1.96.48-.941 1.245-1.707 2.185-2.186.593-.302 1.233-.428 1.961-.487.718-.059 1.606-.058 2.71-.058h1.037v2z"/>
    <path clip-rule="evenodd" fill-rule="evenodd" d="M16.293 3.293c1.219-1.219 3.195-1.219 4.414 0 1.219 1.219 1.219 3.195 0 4.414l-5.491 5.491c-.533.533-.896.896-1.31 1.179-.356.24-.742.433-1.148.574-.478.167-.983.234-1.729.341l-2.708.387.387-2.708c.107-.746.174-1.25.34-1.729.142-.405.335-.792.575-1.148.283-.42.646-.777 1.179-1.31l5.491-5.491zm3 1.414c-.438-.438-1.148-.438-1.586 0l-5.491 5.491c-.587.587-.784.79-.934 1.013-.144.214-.26.445-.345.688-.088.254-.131.533-.248 1.354l-.01.067.068-.008c.82-.118 1.1-.161 1.354-.25.243-.084.474-.2.688-.344.223-.15.426-.347 1.013-.934l5.491-5.491c.438-.438.438-1.148 0-1.586z"/>
  </svg>
)

const SynaraPlusMediumGlyph = () => (
  <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" aria-hidden="true">
    <path d="M12 5.25V12M12 12V18.75M12 12H5.25M12 12H18.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
)


const CodexChevronDownGlyph = () => (
  <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" aria-hidden="true">
    <path d="m4.75 6.25 3.25 3.25 3.25-3.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
)

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const navigate = useNavigate()
  const location = useLocation()
  const layout = useLayout()
  const server = useServer()
  const serverSync = useServerSync()
  const serverSDK = useServerSDK()
  const tabs = useTabs()
  const command = useCommand()
  const language = useLanguage()
  const dialog = useDialog()
  const pickDirectory = useDirectoryPicker()
  setNavigate(navigate)

  createEffect(() => setV2Toast(true))

  const projects = () => layout.projects.list()
  const route = () => layout.route()
  const settingsPage = createMemo(() => location.pathname === "/settings")
  // Full-bleed routes hide the project sidebar (settings, canvas).
  const chromelessPage = createMemo(() => settingsPage())
  const now = createMemo(() => Date.now())
  const projectDirectories = (project: LocalProject) => [project.worktree, ...(project.sandboxes ?? [])]
  const projectSessions = (project: LocalProject) => {
    const seen = new Set<string>()
    return projectDirectories(project)
      .flatMap((directory) => sortedRootSessions(serverSync().child(directory, { bootstrap: false })[0], Date.now()))
      .filter((session) => {
        const key = `${pathKey(session.directory)}:${session.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
  }
  const [expanded, setExpanded] = createStore<Record<string, boolean>>({})
  const [projectCollapsed, setProjectCollapsed] = createStore<Record<string, boolean>>({})
  const relativeTime = (time: number) => {
    const diff = Math.max(0, now() - time)
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return "now"
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`
    if (diff < day) return `${Math.floor(diff / hour)}h ago`
    return `${Math.floor(diff / day)}d ago`
  }
  const currentProject = createMemo(() => {
    const current = route()
    if (current.type !== "session") return projects()[0]
    const session = serverSync().session.peek(current.sessionId)
    if (!session) return projects()[0]
    const directory = pathKey(session.directory)
    return projects().find(
      (project) =>
        pathKey(project.worktree) === directory ||
        project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
    )
  })
  const chooseProject = () => {
    const current = server.current
    if (!current) return
    pickDirectory({
      server: current,
      title: "Open project",
      onSelect: (result) => {
        const directory = Array.isArray(result) ? result[0] : result
        if (!directory) return
        layout.projects.open(directory)
        tabs.newDraft({ server: server.key, directory })
      },
    })
  }
  const closeProject = (project: LocalProject) => {
    const list = projects()
    const index = list.findIndex((item) => pathKey(item.worktree) === pathKey(project.worktree))
    const active = pathKey(currentProject()?.worktree ?? "") === pathKey(project.worktree)
    if (index === -1) return

    layout.projects.close(project.worktree)
    if (!active) return

    const next = list[index + 1] ?? list[index - 1]
    if (!next) {
      navigate("/")
      return
    }

    tabs.newDraft({ server: server.key, directory: next.worktree })
  }
  const toggleProjectWorkspaces = (project: LocalProject) => {
    const enabled = layout.sidebar.workspaces(project.worktree)()
    if (enabled || project.vcs === "git") layout.sidebar.toggleWorkspaces(project.worktree)
  }
  const showEditProjectDialog = (project: LocalProject) => {
    const current = server.current
    if (!current) return
    void import("@/components/dialog-edit-project").then((module) => {
      dialog.show(() => <module.DialogEditProject server={current} project={project} />)
    })
  }
  const newChat = () => {
    const project = currentProject()
    if (!project) {
      chooseProject()
      return
    }
    tabs.newDraft({ server: server.key, directory: project.worktree })
  }
  const openHome = () => {
    navigate("/")
    layout.mobileSidebar.hide()
  }
  const openSettings = () => {
    if (location.pathname === "/settings") return
    layout.mobileSidebar.hide()
    navigate("/settings")
  }

  // Register once in the shell so Cmd+, / desktop menu work on every route
  // (home, settings, session) without remounting session-scoped command providers.
  command.register("settings", () => [
    {
      id: "settings.open",
      title: language.t("command.settings.open"),
      category: language.t("command.category.settings"),
      keybind: "mod+comma",
      onSelect: openSettings,
    },
  ])

  const notifyPlaceholder = (title: string) =>
    showToast({
      title,
      description: "Coming soon",
    })

  // Keep the project sidebar mounted on chromeless routes — only hide it visually.
  // Unmounting via <Show> was remounting project/session lists on every open/close.
  const projectSidebarCollapsed = createMemo(() => chromelessPage() || !layout.sidebar.opened())
  const mobileSidebarOpen = createMemo(() => !chromelessPage() && layout.mobileSidebar.opened())
  // Route changes to/from chromeless pages must snap — only the toggle button should animate.
  const [sidebarRouteSnap, setSidebarRouteSnap] = createSignal(false)
  createEffect((prev: boolean | undefined) => {
    const chromeless = chromelessPage()
    if (prev !== undefined && prev !== chromeless) {
      setSidebarRouteSnap(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSidebarRouteSnap(false))
      })
    }
    return chromeless
  })
  const projectSidebarTransition = createMemo(() =>
    chromelessPage() || sidebarRouteSnap()
      ? "none"
      : "margin-left 0.2s ease-out, opacity 0.2s ease-out, visibility 0.2s ease-out",
  )
  const mobileSidebarAnimate = createMemo(() => !chromelessPage() && !sidebarRouteSnap())
  const SidebarAction = (props: { icon?: string; glyph?: import("solid-js").JSX.Element; label: string; onClick: () => void, active?: boolean }) => (
    <button
      type="button"
      class="flex h-8 w-full items-center gap-3 rounded-md px-2 text-left text-[14px] transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
      classList={{ "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base font-medium": props.active, "text-v2-text-text-muted": !props.active }}
      onClick={props.onClick}
    >
      <Show when={props.glyph} fallback={<IconV2 name={props.icon!} size="small" class="shrink-0 text-emerald-400 opacity-90" />}>
        <span class="shrink-0 text-emerald-400 opacity-90 flex items-center justify-center size-4">{props.glyph}</span>
      </Show>
      <span class="min-w-0 truncate">{props.label}</span>
    </button>
  )
  const ProjectMenu = (props: { project: LocalProject }) => (
    <DropdownMenu modal={false}>
      <DropdownMenu.Trigger
        as="button"
        type="button"
        class="flex size-6 shrink-0 items-center justify-center rounded-md text-emerald-400/80 transition-[background-color,color] hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:bg-emerald-500/10 focus-visible:text-emerald-300 focus-visible:outline-none"
        aria-label={language.t("common.moreOptions")}
        title={language.t("common.moreOptions")}
      >
        <CodexDotsGlyph />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="mt-1">
          <DropdownMenu.Item onSelect={() => showEditProjectDialog(props.project)}>
            <DropdownMenu.ItemLabel>{language.t("common.edit")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={props.project.vcs !== "git" && !layout.sidebar.workspaces(props.project.worktree)()}
            onSelect={() => toggleProjectWorkspaces(props.project)}
          >
            <DropdownMenu.ItemLabel>
              {layout.sidebar.workspaces(props.project.worktree)()
                ? language.t("sidebar.workspaces.disable")
                : language.t("sidebar.workspaces.enable")}
            </DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={() => closeProject(props.project)}>
            <DropdownMenu.ItemLabel>{language.t("common.close")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
  const ProjectGroup = (props: { project: LocalProject }) => {
    const sortable = createSortable(props.project.worktree)
    const sessions = createMemo(() => projectSessions(props.project))
    const expandedKey = () => pathKey(props.project.worktree)
    const isCollapsed = () => !!projectCollapsed[expandedKey()]
    const visible = createMemo(() =>
      expanded[expandedKey()]
        ? sessions()
        : sessions().slice(0, CODEX_PROJECT_SESSION_LIMIT),
    )
    const newSession = () => tabs.newDraft({ server: server.key, directory: props.project.worktree })

    const errorMessage = (err: unknown) => {
      if (err && typeof err === "object" && "data" in err) {
        const data = (err as { data?: { message?: string } }).data
        if (data?.message) return data.message
      }
      if (err instanceof Error) return err.message
      return language.t("common.requestFailed")
    }

    // Shared mutations: archive and delete use the server-scoped SDK per session directory.
    const renameMutation = useMutation(() => ({
      mutationFn: (input: { id: string; directory: string; title: string }) =>
        serverSDK().ensureDirSdkContext(input.directory).client.session.update({
          sessionID: input.id,
          title: input.title,
        }),
      onSuccess: (_, input) => {
        const [, setStore] = serverSync().child(input.directory, { bootstrap: false })
        setStore(
          produce((draft) => {
            const index = draft.session.findIndex((s) => s.id === input.id)
            if (index !== -1) draft.session[index].title = input.title
          }),
        )
      },
      onError: (err) => {
        showToast({ title: language.t("common.requestFailed"), description: errorMessage(err) })
      },
    }))

    const archiveMutation = useMutation(() => ({
      mutationFn: (input: { id: string; directory: string }) =>
        serverSDK().ensureDirSdkContext(input.directory).client.session.update({
          sessionID: input.id,
          time: { archived: Date.now() },
        }),
      onSuccess: (_, input) => {
        const [, setStore] = serverSync().child(input.directory, { bootstrap: false })
        setStore(
          produce((draft) => {
            const index = draft.session.findIndex((s) => s.id === input.id)
            if (index !== -1) draft.session.splice(index, 1)
          }),
        )
      },
      onError: (err) => {
        showToast({ title: language.t("common.requestFailed"), description: errorMessage(err) })
      },
    }))

    const deleteMutation = useMutation(() => ({
      mutationFn: (input: { id: string; directory: string }) =>
        serverSDK().ensureDirSdkContext(input.directory).client.session.delete({
          sessionID: input.id,
        }),
      onSuccess: (_, input) => {
        const [, setStore] = serverSync().child(input.directory, { bootstrap: false })
        setStore(
          produce((draft) => {
            const index = draft.session.findIndex((s) => s.id === input.id)
            if (index !== -1) draft.session.splice(index, 1)
          }),
        )
      },
      onError: (err) => {
        showToast({ title: language.t("common.requestFailed"), description: errorMessage(err) })
      },
    }))

    return (
      <section 
        class="flex flex-col gap-0 relative"
        use:sortable
        classList={{ "opacity-50 z-50": sortable.isActiveDraggable }}
      >
        <div 
          class="group/project flex h-8 min-w-0 items-center gap-1 rounded-md px-2 transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-within:bg-v2-overlay-simple-overlay-hover cursor-grab active:cursor-grabbing"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
            onClick={() => setProjectCollapsed(expandedKey(), !isCollapsed())}
            aria-expanded={!isCollapsed()}
          >
            <span
              class="flex size-4 shrink-0 items-center justify-center text-emerald-400/70 transition-transform duration-150"
              classList={{ "-rotate-90": isCollapsed() }}
            >
              <CodexChevronDownGlyph />
            </span>
            <span class="text-emerald-400 shrink-0 flex items-center justify-center">
              <ProjectIcon project={props.project} class="!size-4" />
            </span>
            <span class="min-w-0 truncate text-[14px] text-v2-text-text-base font-medium leading-none">{displayName(props.project)}</span>
          </button>
          <ProjectMenu project={props.project} />
          <button
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-md text-emerald-400/80 transition-[background-color,color] hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:bg-emerald-500/10 focus-visible:text-emerald-300 focus-visible:outline-none"
            onClick={newSession}
            aria-label="New session"
            title="New session"
          >
            <SynaraComposePencilGlyph />
          </button>
        </div>
        <Show when={!isCollapsed()}>
          <div class="flex flex-col gap-0">
            <For each={visible()}>
              {(session) => {
                const active = createMemo(() => {
                  const current = route()
                  return current.type === "session" && current.sessionId === session.id
                })
                // Match shob desktop: read session_status directly (not only session_working helper)
                // so Solid tracks the nested store field and the indicator stays live.
                const working = createMemo(() => {
                  const type = serverSync().session.data.session_status[session.id]?.type
                  return !!type && type !== "idle"
                })
                const updated = createMemo(() => session.time.updated ?? session.time.created)
                const [renaming, setRenaming] = createSignal(false)
                const [renameValue, setRenameValue] = createSignal("")
                const [confirmDelete, setConfirmDelete] = createSignal(false)

                const openRename = () => {
                  setRenameValue(sessionTitle(session.title) ?? "")
                  setRenaming(true)
                }

                const submitRename = () => {
                  const next = renameValue().trim()
                  setRenaming(false)
                  if (!next || next === (sessionTitle(session.title) ?? "")) return
                  renameMutation.mutate({ id: session.id, directory: session.directory, title: next })
                }

                const SessionMenu = () => (
                  <DropdownMenu modal={false}>
                    <DropdownMenu.Trigger
                      as="button"
                      type="button"
                      class="flex size-5 shrink-0 items-center justify-center rounded text-emerald-400/80 transition-[background-color,color] hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:bg-emerald-500/10 focus-visible:text-emerald-300 focus-visible:outline-none"
                      aria-label={language.t("common.moreOptions")}
                      title={language.t("common.moreOptions")}
                    >
                      <CodexDotsGlyph />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content class="mt-1" onCloseAutoFocus={(e) => { if (renaming()) { e.preventDefault() } }}>
                        <DropdownMenu.Item onSelect={openRename}>
                          <DropdownMenu.ItemLabel>{language.t("common.rename")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => archiveMutation.mutate({ id: session.id, directory: session.directory })}>
                          <DropdownMenu.ItemLabel>{language.t("common.archive")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                )

                return (
                  <div
                    class="group/session mx-1 flex h-8 items-center gap-2 rounded-lg px-2 text-[14px] transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-within:bg-v2-overlay-simple-overlay-hover"
                    classList={{
                      "font-semibold": active(),
                      "text-v2-text-text-muted hover:text-v2-text-text-base": !active(),
                    }}
                    style={{
                      color: active() ? "rgb(236 253 245)" : undefined,
                      "background-color": active() ? "rgb(16 185 129 / 0.12)" : undefined,
                      "box-shadow": active()
                        ? "inset 3px 0 0 rgb(52 211 153 / 0.9), inset 0 0 0 1px rgb(52 211 153 / 0.35)"
                        : undefined,
                    }}
                  >
                    <Show
                      when={renaming()}
                      fallback={
                        <button
                          type="button"
                          data-session-id={session.id}
                          class="flex min-w-0 flex-1 items-center text-left focus-visible:outline-none"
                          onClick={() => {
                            layout.mobileSidebar.hide()
                            // Seed the info cache and open like home: one transition for tab +
                            // navigate. Bare navigate left cold sessions stuck under Suspense.
                            serverSync().session.remember(session)
                            void startTransition(() => {
                              const tab = tabs.addSessionTab({ server: server.key, sessionId: session.id })
                              tabs.select(tab)
                            })
                          }}
                        >
                          <span
                            class="min-w-0 flex-1 truncate"
                            classList={{ "session-working-shimmer": working() }}
                          >
                            {sessionTitle(session.title)}
                          </span>
                        </button>
                      }
                    >
                      <input
                        class="min-w-0 flex-1 truncate bg-transparent text-[13px] text-v2-text-text-base outline-none"
                        value={renameValue()}
                        onInput={(e) => setRenameValue(e.currentTarget.value)}
                        onBlur={submitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename()
                          if (e.key === "Escape") setRenaming(false)
                        }}
                        ref={(el) => { if (el) requestAnimationFrame(() => el.select()) }}
                      />
                    </Show>
                    <Show when={!renaming()}>
                      <Show
                        when={confirmDelete()}
                        fallback={
                          <div class="flex shrink-0 items-center">
                            {/* Timestamp/spinner: visible when NOT hovering, hidden on hover */}
                            <Show
                              when={working()}
                              fallback={
                                <span class="group-hover/session:hidden text-[12px] text-v2-text-text-faint">
                                  {relativeTime(updated())}
                                </span>
                              }
                            >
                              <span class="group-hover/session:hidden flex h-5 w-5 items-center justify-center" title="Working">
                                <DotsSpinner class="font-mono text-[13px] leading-none text-v2-text-text-base" />
                              </span>
                            </Show>
                            {/* Session actions appear on hover. */}
                            <div class="hidden group-hover/session:flex items-center gap-1">
                              <SessionMenu />
                              <button
                                type="button"
                                class="flex size-5 shrink-0 items-center justify-center rounded text-v2-text-text-faint transition-colors hover:text-red-400 focus-visible:outline-none"
                                aria-label={language.t("session.delete.title")}
                                title={language.t("session.delete.title")}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmDelete(true)
                                }}
                              >
                                <svg viewBox="0 0 16 16" class="size-3.5" fill="none" aria-hidden="true">
                                  <path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l.8 8.5A1 1 0 0 0 4.8 13.5h6.4a1 1 0 0 0 1-.9L13 4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        }
                      >
                        {/* Inline delete confirm */}
                        <div class="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            class="flex h-5 items-center justify-center rounded-full border px-2 text-[11px] font-medium leading-none whitespace-nowrap transition-colors focus-visible:outline-none"
                            style={{
                              color: "rgb(248 113 113)",
                              "background-color": "rgb(239 68 68 / 0.16)",
                              "border-color": "rgb(248 113 113 / 0.24)",
                            }}
                            onClick={() => {
                              setConfirmDelete(false)
                              deleteMutation.mutate({ id: session.id, directory: session.directory })
                            }}
                          >
                            {language.t("common.confirm") || "Confirm"}
                          </button>
                          <button
                            type="button"
                            class="flex h-5 items-center justify-center rounded px-2 text-[11px] font-medium text-v2-text-text-faint hover:text-v2-text-text-base hover:bg-v2-background-bg-layer-03 transition-colors focus-visible:outline-none"
                            onClick={() => setConfirmDelete(false)}
                          >
                            {language.t("common.cancel") || "Cancel"}
                          </button>
                        </div>
                      </Show>
                    </Show>
                  </div>
                )
              }}
            </For>
            <Show when={sessions().length > CODEX_PROJECT_SESSION_LIMIT}>
              <button
                type="button"
                class="mx-1 flex h-8 items-center rounded-lg px-2 text-left text-[13px] font-semibold text-v2-text-text-base transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:bg-emerald-500/10 focus-visible:text-emerald-300 focus-visible:outline-none"
                onClick={() => setExpanded(expandedKey(), !expanded[expandedKey()])}
              >
                <span class="flex-1">{expanded[expandedKey()] ? "Show less" : "Show more"}</span>
                <span class="text-[12px] font-normal text-emerald-100/70">
                  {expanded[expandedKey()] ? "" : `+${sessions().length - CODEX_PROJECT_SESSION_LIMIT}`}
                </span>
              </button>
            </Show>
          </div>
        </Show>
      </section>
    )
  }

  const SidebarProjectDragOverlay = (props: { projects: () => LocalProject[] }) => {
    const [context] = useDragDropContext()!
    const activeProject = createMemo(() => {
      const id = context.active.draggable?.id
      if (!id || typeof id !== "string") return undefined
      return props.projects().find((p) => p.worktree === id)
    })

    return (
      <DragOverlay>
        <Show when={activeProject()}>
          {(p) => (
            <div class="group/project flex h-7 min-w-0 items-center gap-2 rounded-md px-2 bg-v2-background-bg-layer-03 opacity-80 shadow-sm border border-v2-border-border-muted z-50">
              <span class="text-v2-text-text-muted shrink-0 flex items-center justify-center">
                <ProjectIcon project={p()} class="!size-[18px]" />
              </span>
              <span class="min-w-0 truncate text-[14px] text-v2-text-text-base">{displayName(p())}</span>
            </div>
          )}
        </Show>
      </DragOverlay>
    )
  }

  const CodexSidebar = (props: { mobile?: boolean }) => (
    <aside
      class="relative flex h-full min-h-0 w-full flex-col bg-v2-background-bg-deep text-v2-text-text-base"
      style={{ width: props.mobile ? undefined : `${layout.sidebar.width()}px` }}
    >
      <div class="flex-1 min-h-0 overflow-y-auto px-2 py-3 no-scrollbar">
        <div class="mb-5 flex flex-col gap-0.5">
          <SidebarAction glyph={<SynaraComposePencilGlyph />} label="New chat" onClick={newChat} />
          <SidebarAction icon="grid-plus" label={language.t("home.title")} onClick={openHome} />
          <SidebarAction icon="magnifying-glass" label="Search" onClick={() => command.show()} />
          <SidebarAction icon="settings-gear" label={language.t("sidebar.settings")} onClick={openSettings} />
        </div>
        <div class="mb-5 flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2 px-2 mb-1 mt-2">
            <span
              class="flex min-w-0 items-center gap-1 text-left text-[12px] font-semibold text-emerald-400/80"
            >
              Projects
            </span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="flex size-6 shrink-0 items-center justify-center rounded-md text-emerald-400/80 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:bg-emerald-500/10 focus-visible:text-emerald-300 focus-visible:outline-none"
                onClick={chooseProject}
                aria-label="Open project"
                title="Open project"
              >
                <SynaraPlusMediumGlyph />
              </button>
            </div>
          </div>
          <Show
            when={projects().length > 0}
            fallback={
              <button
                type="button"
                class="mx-2 rounded-md border border-v2-border-border-muted px-3 py-2 text-left text-[14px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover"
                onClick={chooseProject}
              >
                Open a project
              </button>
            }
          >
            <DragDropProvider
              onDragEnd={(event: DragEvent) => {
                const fromId = event.draggable?.id
                const toId = event.droppable?.id
                if (typeof fromId !== "string" || typeof toId !== "string" || fromId === toId) return

                const list = projects()
                const fromIndex = list.findIndex((p) => p.worktree === fromId)
                const toIndex = list.findIndex((p) => p.worktree === toId)

                if (fromIndex !== -1 && toIndex !== -1) {
                  layout.projects.move(fromId, toIndex)
                }
              }}
              collisionDetector={closestCenter}
            >
              <DragDropSensors />
              <ConstrainDragXAxis />
              <SidebarProjectDragOverlay projects={projects} />
              <SortableProvider ids={projects().map((p) => p.worktree)}>
                <For each={projects()}>{(project) => <ProjectGroup project={project} />}</For>
              </SortableProvider>
            </DragDropProvider>
          </Show>
        </div>
      </div>
      <Show when={!props.mobile}>
        <ResizeHandle
          direction="horizontal"
          edge="end"
          size={layout.sidebar.width()}
          min={CODEX_SIDEBAR_MIN_WIDTH}
          max={CODEX_SIDEBAR_MAX_WIDTH}
          onResize={layout.sidebar.resize}
          class="absolute top-0 right-[-3px] z-20 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-v2-border-border-muted"
        />
      </Show>
    </aside>
  )

  const update: TitlebarUpdate = {
    version: () => {
      const state = platform.updater?.state()
      if (state?.status !== "ready") return
      return state.version
    },
    installing: () => platform.updater?.state().status === "installing",
    install: () => void platform.updater?.install(),
  }

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Titlebar update={update} />
      <div class="flex-1 min-h-0 min-w-0 flex">
        <nav
          aria-label="Projects and sessions"
          data-component="codex-sidebar-desktop"
          class="hidden md:block h-full shrink-0"
          aria-hidden={projectSidebarCollapsed()}
          style={{
            width: `${layout.sidebar.width()}px`,
            "margin-left": projectSidebarCollapsed() ? `-${layout.sidebar.width()}px` : "0px",
            opacity: projectSidebarCollapsed() ? 0 : 1,
            visibility: projectSidebarCollapsed() ? "hidden" : "visible",
            "pointer-events": projectSidebarCollapsed() ? "none" : "auto",
            transition: projectSidebarTransition(),
          }}
        >
          <CodexSidebar />
        </nav>
        <div class="md:hidden">
          <div
            classList={{
              "fixed inset-x-0 top-9 bottom-0 z-40 bg-black/30": true,
              "transition-opacity duration-200": mobileSidebarAnimate(),
              "opacity-100 pointer-events-auto": mobileSidebarOpen(),
              "opacity-0 pointer-events-none": !mobileSidebarOpen(),
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) layout.mobileSidebar.hide()
            }}
          />
          <nav
            aria-label="Projects and sessions"
            data-component="codex-sidebar-mobile"
            aria-hidden={!mobileSidebarOpen()}
            classList={{
              "fixed top-9 bottom-0 left-0 z-50 w-full max-w-[360px] overflow-hidden": true,
              "transition-transform duration-200 ease-out": mobileSidebarAnimate(),
              "translate-x-0": mobileSidebarOpen(),
              "-translate-x-full": !mobileSidebarOpen(),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <CodexSidebar mobile />
          </nav>
        </div>
        <main
          class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col contain-strict"
          classList={{
            "items-start": !chromelessPage(),
            "items-stretch": chromelessPage(),
          }}
        >
          <Suspense>{props.children}</Suspense>
        </main>
      </div>
      {import.meta.env.DEV && <DebugBar inline />}
      <ToastRegion v2 />
    </div>
  )
}
