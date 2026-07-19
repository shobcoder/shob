import {
  createEffect,
  createMemo,
  createResource,
  For,
  on,
  onCleanup,
  onMount,
  ParentProps,
  Show,
  untrack,
  type Accessor,
} from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { useNavigate, useParams } from "@solidjs/router"
import { useLayout, LocalProject } from "@/context/layout"
import { useServerSync } from "@/context/server-sync"
import { Persist, persisted } from "@/utils/persist"
import { base64Encode } from "@shob/core/util/encode"
import { decode64 } from "@/utils/base64"
import { ResizeHandle } from "@shob/ui/resize-handle"
import { Button } from "@shob/ui/button"
import { Icon as IconV2 } from "@shob/ui/v2/icon"
import { IconButton } from "@shob/ui/icon-button"
import { Tooltip } from "@shob/ui/tooltip"
import { DropdownMenu } from "@shob/ui/dropdown-menu"
import { Dialog } from "@shob/ui/dialog"
import { getFilename } from "@shob/core/util/path"
import { Session } from "@shob/sdk/v2/client"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { createStore, produce, reconcile } from "solid-js/store"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { useProviders } from "@/hooks/use-providers"
import { toaster } from "@shob/ui/toast"
import { setV2Toast, showToast, ToastRegion } from "@/utils/toast"
import { useServerSDK } from "@/context/server-sdk"
import { clearWorkspaceTerminals } from "@/context/terminal"
import { pickSessionCacheEvictions } from "@/context/global-sync/session-cache"
import { useNotification } from "@/context/notification"
import { usePermission } from "@/context/permission"
import { Binary } from "@shob/core/util/binary"
import { retry } from "@shob/core/util/retry"
import { playSoundById } from "@/utils/sound"
import { createAim } from "@/utils/aim"
import { setNavigate } from "@/utils/notification-click"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { setSessionHandoff } from "@/pages/session/handoff"
import { SessionRouteKey, SessionStateKey } from "@/utils/server-scope"

import { useDialog } from "@shob/ui/context/dialog"
import { useTheme, type ColorScheme } from "@shob/ui/theme/context"
import { useCommand, type CommandOption } from "@/context/command"
import { ConstrainDragXAxis, getDraggableId } from "@/utils/solid-dnd"
import { DebugBar } from "@/components/debug-bar"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { useDirectoryPicker } from "@/components/directory-picker"
import { ServerConnection, useServer } from "@/context/server"
import { useLanguage, type Locale } from "@/context/language"
import { pathKey } from "@/utils/path-key"
import {
  displayName,
  effectiveWorkspaceOrder,
  errorMessage,
  latestRootSession,
  sortedRootSessions,
} from "./layout/helpers"
import {
  collectNewSessionDeepLinks,
  collectOpenProjectDeepLinks,
  deepLinkEvent,
  drainPendingDeepLinks,
} from "./layout/deep-links"
import { createInlineEditorController } from "./layout/inline-editor"
import {
  LocalWorkspace,
  SortableWorkspace,
  WorkspaceDragOverlay,
  type WorkspaceSidebarContext,
} from "./layout/sidebar-workspace"
import { ProjectDragOverlay, SortableProject, type ProjectSidebarContext } from "./layout/sidebar-project"
import { SidebarContent } from "./layout/sidebar-shell"
import { ProjectIcon } from "./layout/sidebar-items"
import { sessionTitle } from "@/utils/session-title"

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

const CodexComposeGlyph = () => (
  <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" aria-hidden="true">
    <path
      d="M10 4C8.136 4 7.204 4 6.469 4.304C5.489 4.71 4.71 5.489 4.304 6.469C4 7.204 4 8.136 4 10V13.6C4 15.84 4 16.96 4.436 17.816C4.819 18.569 5.431 19.181 6.184 19.564C7.04 20 8.16 20 10.4 20H14C15.864 20 16.796 20 17.531 19.696C18.511 19.29 19.29 18.511 19.696 17.531C20 16.796 20 15.864 20 14"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="miter"
    />
    <path
      d="M19.5 7.5L12.44 14.56C12.159 14.841 11.777 15 11.379 15H9V12.621C9 12.223 9.159 11.841 9.44 11.56L16.5 4.5C17.328 3.672 18.672 3.672 19.5 4.5C20.328 5.328 20.328 6.672 19.5 7.5Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="miter"
    />
  </svg>
)

const CodexProjectAddGlyph = () => (
  <svg viewBox="0 0 24 24" class="size-5 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M6 12c0 1.492.065 2.787.16 3.883.094 1.078.149 1.601.278 2.022.097.312.25.612.699 1.06.46.458.755.606 1.043.696.394.123.879.173 1.916.26a23 23 0 0 0 2.905.06 1 1 0 0 1 1 1c0 .552-.456 1-1.008 1a25 25 0 0 1-3.063-.068c-1.94-.161-2.911-.242-4.205-1.532-1.294-1.289-1.381-2.301-1.557-4.325A47 47 0 0 1 4 12c0-1.549.068-2.901.168-4.054.175-2.025.263-3.038 1.557-4.327s2.265-1.37 4.207-1.532a25 25 0 0 1 4.137 0c1.941.162 2.912.242 4.206 1.532s1.382 2.302 1.557 4.327a46 46 0 0 1 .165 3.468L20 11.5a1 1 0 0 1-1 1 1 1 0 0 1-1.002-.996 44 44 0 0 0-.158-3.385c-.094-1.079-.149-1.602-.278-2.023-.097-.313-.25-.613-.699-1.06-.46-.458-.755-.607-1.043-.697-.394-.122-.88-.173-1.917-.259a23 23 0 0 0-3.805 0c-1.038.086-1.524.137-1.918.26-.288.09-.584.238-1.043.696-.449.447-.602.747-.699 1.06-.13.42-.184.944-.278 2.023A45 45 0 0 0 6 12" />
    <path d="M18 22a1 1 0 0 1-1-1v-2h-2a1 1 0 1 1 0-2h2v-2a1 1 0 1 1 2 0v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 0 1-1 1M14 8a1 1 0 0 1-1 1H9a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1m-3 5a1 1 0 1 0 0-2H9a1 1 0 1 0 0 2z" />
  </svg>
)

const CodexExpandGlyph = () => (
  <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" aria-hidden="true">
    <path d="M6.4 3.15H3.15V6.4M3.25 3.25l3.9 3.9M9.6 12.85h3.25V9.6M12.75 12.75l-3.9-3.9" stroke="currentColor" />
  </svg>
)

const CodexChevronDownGlyph = () => (
  <svg viewBox="0 0 16 16" class="size-3 shrink-0" fill="none" aria-hidden="true">
    <path d="m4.75 6.25 3.25 3.25 3.25-3.25" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
)

const CodexActiveSessionGlyph = () => (
  <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="4.5" stroke="currentColor" stroke-width="1.2" opacity="0.9" />
  </svg>
)

export default function LegacyLayout(props: ParentProps) {
  const serverSDK = useServerSDK()
  const [store, setStore, , ready] = persisted(
    Persist.serverGlobal(serverSDK().scope, "layout.page", ["layout.page.v1"]),
    createStore({
      lastProjectSession: {} as { [directory: string]: { directory: string; id: string; at: number } },
      activeProject: undefined as string | undefined,
      activeWorkspace: undefined as string | undefined,
      workspaceOrder: {} as Record<string, string[]>,
      workspaceName: {} as Record<string, string>,
      workspaceBranchName: {} as Record<string, Record<string, string>>,
      workspaceExpanded: {} as Record<string, boolean>,
      codexProjectExpanded: {} as Record<string, boolean>,
      gettingStartedDismissed: false,
    }),
  )

  const pageReady = createMemo(() => ready())

  let scrollContainerRef: HTMLDivElement | undefined
  let dialogRun = 0
  let dialogDead = false

  const params = useParams()
  const serverSync = useServerSync()
  const layout = useLayout()
  const layoutReady = createMemo(() => layout.ready())
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const settings = useSettings()
  const server = useServer()
  const notification = useNotification()
  const permission = usePermission()
  const navigate = useNavigate()
  setNavigate(navigate)
  const providers = useProviders()
  const dialog = useDialog()
  const command = useCommand()
  const theme = useTheme()
  const language = useLanguage()
  createEffect(() => setV2Toast(false))
  const initialDirectory = decode64(params.dir)
  const route = createMemo(() => {
    const slug = params.dir
    if (!slug) return { slug, dir: "" }
    const dir = decode64(slug)
    if (!dir) return { slug, dir: "" }
    const store = serverSync().peek(dir, { bootstrap: false })
    return {
      slug,
      store,
      dir: store[0].path.directory || dir,
    }
  })
  const availableThemeEntries = createMemo(() => theme.ids().map((id) => [id, theme.themes()[id]] as const))
  const colorSchemeOrder: ColorScheme[] = ["system", "light", "dark"]
  const colorSchemeKey: Record<ColorScheme, "theme.scheme.system" | "theme.scheme.light" | "theme.scheme.dark"> = {
    system: "theme.scheme.system",
    light: "theme.scheme.light",
    dark: "theme.scheme.dark",
  }
  const colorSchemeLabel = (scheme: ColorScheme) => language.t(colorSchemeKey[scheme])
  const currentDir = createMemo(() => route().dir)

  const [state, setState] = createStore({
    autoselect: !initialDirectory,
    busyWorkspaces: {} as Record<string, boolean>,
    hoverProject: undefined as string | undefined,
    scrollSessionKey: undefined as string | undefined,
    nav: undefined as HTMLElement | undefined,
    sortNow: Date.now(),
    sizing: false,
    peek: undefined as string | undefined,
    peeked: false,
  })

  const updateVersion = () => {
    const state = platform.updater?.state()
    if (state?.status !== "ready") return
    return state.version
  }
  const installUpdate = () => void platform.updater?.install()
  const titlebarUpdate: TitlebarUpdate = {
    version: updateVersion,
    installing: () => platform.updater?.state().status === "installing",
    install: installUpdate,
  }

  const editor = createInlineEditorController()
  const setBusy = (directory: string, value: boolean) => {
    const key = pathKey(directory)
    if (value) {
      setState("busyWorkspaces", key, true)
      return
    }
    setState(
      "busyWorkspaces",
      produce((draft) => {
        delete draft[key]
      }),
    )
  }
  const isBusy = (directory: string) => !!state.busyWorkspaces[pathKey(directory)]
  const navLeave = { current: undefined as number | undefined }
  const sortNow = () => state.sortNow
  let sizet: number | undefined
  let sortNowInterval: ReturnType<typeof setInterval> | undefined
  const sortNowTimeout = setTimeout(
    () => {
      setState("sortNow", Date.now())
      sortNowInterval = setInterval(() => setState("sortNow", Date.now()), 60_000)
    },
    60_000 - (Date.now() % 60_000),
  )

  const aim = createAim({
    enabled: () => !layout.sidebar.opened(),
    active: () => state.hoverProject,
    el: () => state.nav?.querySelector<HTMLElement>("[data-component='sidebar-rail']") ?? state.nav,
    onActivate: (directory) => {
      serverSync().child(directory)
      setState("hoverProject", directory)
    },
  })

  onCleanup(() => {
    dialogDead = true
    dialogRun += 1
    if (navLeave.current !== undefined) clearTimeout(navLeave.current)
    clearTimeout(sortNowTimeout)
    if (sortNowInterval) clearInterval(sortNowInterval)
    if (sizet !== undefined) clearTimeout(sizet)
    if (peekt !== undefined) clearTimeout(peekt)
    aim.reset()
  })

  onMount(() => {
    const stop = () => setState("sizing", false)
    const blur = () => reset()
    const hide = () => {
      if (document.visibilityState !== "hidden") return
      reset()
    }
    makeEventListener(window, "pointerup", stop)
    makeEventListener(window, "pointercancel", stop)
    makeEventListener(window, "blur", stop)
    makeEventListener(window, "blur", blur)
    makeEventListener(document, "visibilitychange", hide)
  })

  const sidebarHovering = createMemo(() => !layout.sidebar.opened() && state.hoverProject !== undefined)
  const sidebarExpanded = createMemo(() => layout.sidebar.opened() || sidebarHovering())
  const setHoverProject = (value: string | undefined) => {
    setState("hoverProject", value)
    if (value !== undefined) return
    aim.reset()
  }
  const clearHoverProjectSoon = () => queueMicrotask(() => setHoverProject(undefined))

  const disarm = () => {
    if (navLeave.current === undefined) return
    clearTimeout(navLeave.current)
    navLeave.current = undefined
  }

  const reset = () => {
    disarm()
    setHoverProject(undefined)
  }

  const arm = () => {
    if (layout.sidebar.opened()) return
    if (state.hoverProject === undefined) return
    disarm()
    navLeave.current = window.setTimeout(() => {
      navLeave.current = undefined
      setHoverProject(undefined)
    }, 300)
  }

  let peekt: number | undefined

  const hoverProjectData = createMemo(() => {
    const id = state.hoverProject
    if (!id) return
    return layout.projects.list().find((project) => project.worktree === id)
  })

  const peekProject = createMemo(() => {
    const id = state.peek
    if (!id) return
    return layout.projects.list().find((project) => project.worktree === id)
  })

  createEffect(() => {
    const p = hoverProjectData()
    if (p) {
      if (peekt !== undefined) {
        clearTimeout(peekt)
        peekt = undefined
      }
      setState("peek", p.worktree)
      setState("peeked", true)
      return
    }

    setState("peeked", false)
    if (state.peek === undefined) return
    if (peekt !== undefined) clearTimeout(peekt)
    peekt = window.setTimeout(() => {
      peekt = undefined
      setState("peek", undefined)
    }, 180)
  })

  createEffect(() => {
    if (!layout.sidebar.opened()) return
    setHoverProject(undefined)
  })

  createEffect(() => {
    if (!state.autoselect) return
    const dir = params.dir
    if (!dir) return
    const directory = decode64(dir)
    if (!directory) return
    setState("autoselect", false)
  })

  const editorOpen = editor.editorOpen
  const openEditor = editor.openEditor
  const closeEditor = editor.closeEditor
  const setEditor = editor.setEditor
  const InlineEditor = editor.InlineEditor

  const clearSidebarHoverState = () => {
    if (layout.sidebar.opened()) return
    reset()
  }

  const navigateWithSidebarReset = (href: string) => {
    clearSidebarHoverState()
    navigate(href)
    layout.mobileSidebar.hide()
  }

  function cycleTheme(direction = 1) {
    const ids = availableThemeEntries().map(([id]) => id)
    if (ids.length === 0) return
    const currentIndex = ids.indexOf(theme.themeId())
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + ids.length) % ids.length
    const nextThemeId = ids[nextIndex]
    theme.setTheme(nextThemeId)
    showToast({
      title: language.t("toast.theme.title"),
      description: theme.name(nextThemeId),
    })
  }

  function cycleColorScheme(direction = 1) {
    const current = theme.colorScheme()
    const currentIndex = colorSchemeOrder.indexOf(current)
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + direction + colorSchemeOrder.length) % colorSchemeOrder.length
    const next = colorSchemeOrder[nextIndex]
    theme.setColorScheme(next)
    showToast({
      title: language.t("toast.scheme.title"),
      description: colorSchemeLabel(next),
    })
  }

  function setLocale(next: Locale) {
    if (next === language.locale()) return
    language.setLocale(next)
    showToast({
      title: language.t("toast.language.title"),
      description: language.t("toast.language.description", { language: language.label(next) }),
    })
  }

  function cycleLanguage(direction = 1) {
    const locales = language.locales
    const currentIndex = locales.indexOf(language.locale())
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + locales.length) % locales.length
    const next = locales[nextIndex]
    if (!next) return
    setLocale(next)
  }

  const useSDKNotificationToasts = () =>
    onMount(() => {
      const toastBySession = new Map<string, number>()
      const alertedAtBySession = new Map<string, number>()
      const cooldownMs = 5000

      const dismissSessionAlert = (sessionKey: string) => {
        const toastId = toastBySession.get(sessionKey)
        if (toastId === undefined) return
        toaster.dismiss(toastId)
        toastBySession.delete(sessionKey)
        alertedAtBySession.delete(sessionKey)
      }

      const unsub = serverSDK().event.listen((e) => {
        if (e.details?.type === "worktree.ready") {
          setBusy(e.name, false)
          WorktreeState.ready(serverSDK().scope, e.name)
          return
        }

        if (e.details?.type === "worktree.failed") {
          setBusy(e.name, false)
          WorktreeState.failed(
            serverSDK().scope,
            e.name,
            e.details.properties?.message ?? language.t("common.requestFailed"),
          )
          return
        }

        if (
          e.details?.type === "question.replied" ||
          e.details?.type === "question.rejected" ||
          e.details?.type === "permission.replied"
        ) {
          const props = e.details.properties as { sessionID: string }
          const sessionKey = `${e.name}:${props.sessionID}`
          dismissSessionAlert(sessionKey)
          return
        }

        if (e.details?.type !== "permission.asked" && e.details?.type !== "question.asked") return
        const title =
          e.details.type === "permission.asked"
            ? language.t("notification.permission.title")
            : language.t("notification.question.title")
        const icon = e.details.type === "permission.asked" ? ("checklist" as const) : ("bubble-5" as const)
        const directory = e.name
        const props = e.details.properties
        if (e.details.type === "permission.asked" && permission.autoResponds(e.details.properties, directory)) return

        const [store] = serverSync().child(directory, { bootstrap: false })
        const session = store.session.find((s) => s.id === props.sessionID)
        const sessionKey = `${directory}:${props.sessionID}`

        const sessionTitle = session?.title ?? language.t("command.session.new")
        const projectName = getFilename(directory)
        const description =
          e.details.type === "permission.asked"
            ? language.t("notification.permission.description", { sessionTitle, projectName })
            : language.t("notification.question.description", { sessionTitle, projectName })
        const href = `/${base64Encode(directory)}/session/${props.sessionID}`

        const now = Date.now()
        const lastAlerted = alertedAtBySession.get(sessionKey) ?? 0
        if (now - lastAlerted < cooldownMs) return
        alertedAtBySession.set(sessionKey, now)

        if (e.details.type === "permission.asked") {
          if (settings.sounds.permissionsEnabled()) {
            void playSoundById(settings.sounds.permissions())
          }
          if (settings.notifications.permissions()) {
            void platform.notify(title, description, href)
          }
        }

        if (e.details.type === "question.asked") {
          if (settings.notifications.agent()) {
            void platform.notify(title, description, href)
          }
        }

        const currentSession = params.id
        if (pathKey(directory) === pathKey(currentDir()) && props.sessionID === currentSession) return
        if (pathKey(directory) === pathKey(currentDir()) && session?.parentID === currentSession) return

        dismissSessionAlert(sessionKey)

        const toastId = showToast({
          persistent: true,
          icon,
          title,
          description,
          actions: [
            {
              label: language.t("notification.action.goToSession"),
              onClick: () => navigate(href),
            },
            {
              label: language.t("common.dismiss"),
              onClick: "dismiss",
            },
          ],
        })
        toastBySession.set(sessionKey, toastId)
      })
      onCleanup(unsub)

      createEffect(() => {
        const currentSession = params.id
        if (!currentDir() || !currentSession) return
        const sessionKey = `${currentDir()}:${currentSession}`
        dismissSessionAlert(sessionKey)
        const [store] = serverSync().child(currentDir(), { bootstrap: false })
        const childSessions = store.session.filter((s) => s.parentID === currentSession)
        for (const child of childSessions) {
          dismissSessionAlert(`${currentDir()}:${child.id}`)
        }
      })
    })

  useSDKNotificationToasts()

  function scrollToSession(sessionId: string, sessionKey: string) {
    if (!scrollContainerRef) return
    if (state.scrollSessionKey === sessionKey) return
    const element = scrollContainerRef.querySelector(`[data-session-id="${sessionId}"]`)
    if (!element) return
    const containerRect = scrollContainerRef.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    if (elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom) {
      setState("scrollSessionKey", sessionKey)
      return
    }
    setState("scrollSessionKey", sessionKey)
    element.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }

  const currentProject = createMemo(() => {
    const directory = currentDir()
    if (!directory) return
    const key = pathKey(directory)

    const projects = layout.projects.list()

    const sandbox = projects.find((p) => p.sandboxes?.some((item) => pathKey(item) === key))
    if (sandbox) return sandbox

    const direct = projects.find((p) => pathKey(p.worktree) === key)
    if (direct) return direct

    const [child] = serverSync().child(directory, { bootstrap: false })
    const id = child.project
    if (!id) return

    const meta = serverSync().data.project.find((p) => p.id === id)
    const root = meta?.worktree
    if (!root) return

    return projects.find((p) => p.worktree === root)
  })

  const [autoselecting] = createResource(async () => {
    await ready.promise
    await layout.ready.promise
    if (!untrack(() => state.autoselect)) return

    const list = layout.projects.list()
    const last = server.projects.last()

    if (list.length === 0) {
      if (!last) return
      await openProject(last, true)
    } else {
      const next = list.find((project) => project.worktree === last) ?? list[0]
      if (!next) return
      await openProject(next.worktree, true)
    }
  })

  const workspaceName = (directory: string, projectId?: string, branch?: string) => {
    const key = pathKey(directory)
    const direct = store.workspaceName[key] ?? store.workspaceName[directory]
    if (direct) return direct
    if (!projectId) return
    if (!branch) return
    return store.workspaceBranchName[projectId]?.[branch]
  }

  const setWorkspaceName = (directory: string, next: string, projectId?: string, branch?: string) => {
    const key = pathKey(directory)
    setStore("workspaceName", key, next)
    if (!projectId) return
    if (!branch) return
    if (!store.workspaceBranchName[projectId]) {
      setStore("workspaceBranchName", projectId, {})
    }
    setStore("workspaceBranchName", projectId, branch, next)
  }

  const workspaceLabel = (directory: string, branch?: string, projectId?: string) =>
    workspaceName(directory, projectId, branch) ?? branch ?? getFilename(directory)

  const workspaceSetting = createMemo(() => {
    const project = currentProject()
    if (!project) return false
    if (project.vcs !== "git") return false
    return layout.sidebar.workspaces(project.worktree)()
  })

  const visibleSessionDirs = createMemo(() => {
    const project = currentProject()
    if (!project) return [] as string[]
    if (!workspaceSetting()) return [project.worktree]

    const activeDir = currentDir()
    return workspaceIds(project).filter((directory) => {
      const expanded = store.workspaceExpanded[directory] ?? directory === project.worktree
      const active = pathKey(directory) === pathKey(activeDir)
      return expanded || active
    })
  })

  createEffect(() => {
    if (!pageReady()) return
    if (!layoutReady()) return
    const projects = layout.projects.list()
    for (const [directory, expanded] of Object.entries(store.workspaceExpanded)) {
      if (!expanded) continue
      const key = pathKey(directory)
      const project = projects.find(
        (item) => pathKey(item.worktree) === key || item.sandboxes?.some((sandbox) => pathKey(sandbox) === key),
      )
      if (!project) continue
      if (project.vcs === "git" && layout.sidebar.workspaces(project.worktree)()) continue
      setStore("workspaceExpanded", directory, false)
    }
  })

  const currentSessions = createMemo(() => {
    const now = Date.now()
    const dirs = visibleSessionDirs()
    if (dirs.length === 0) return [] as Session[]

    const result: Session[] = []
    for (const dir of dirs) {
      const [dirStore] = serverSync().child(dir, { bootstrap: true })
      const dirSessions = sortedRootSessions(dirStore, now)
      result.push(...dirSessions)
    }
    return result
  })

  type PrefetchQueue = {
    inflight: Set<string>
    pending: string[]
    pendingSet: Set<string>
    running: number
  }

  const prefetchChunk = 200
  const prefetchConcurrency = 2
  const prefetchPendingLimit = 10
  const span = 4
  const prefetchToken = { value: 0 }
  const prefetchQueues = new Map<string, PrefetchQueue>()

  const PREFETCH_MAX_SESSIONS_PER_DIR = 10
  const prefetchedByDir = new Map<string, Set<string>>()

  const lruFor = (directory: string) => {
    const existing = prefetchedByDir.get(directory)
    if (existing) return existing
    const created = new Set<string>()
    prefetchedByDir.set(directory, created)
    return created
  }

  const markPrefetched = (directory: string, sessionID: string) => {
    const lru = lruFor(directory)
    return pickSessionCacheEvictions({
      seen: lru,
      keep: sessionID,
      limit: PREFETCH_MAX_SESSIONS_PER_DIR,
      preserve: params.id && pathKey(directory) === pathKey(currentDir()) ? [params.id] : undefined,
    })
  }

  createEffect(() => {
    const active = new Set(visibleSessionDirs())
    for (const directory of prefetchedByDir.keys()) {
      if (active.has(directory)) continue
      prefetchedByDir.delete(directory)
    }
  })

  createEffect(() => {
    route()
    serverSDK().url

    prefetchToken.value += 1
    prefetchQueues.clear()
  })

  createEffect(() => {
    const visible = new Set(visibleSessionDirs())
    for (const [directory, q] of prefetchQueues) {
      if (visible.has(directory)) continue
      q.pending.length = 0
      q.pendingSet.clear()
      if (q.running === 0) prefetchQueues.delete(directory)
    }
  })

  const queueFor = (directory: string) => {
    const existing = prefetchQueues.get(directory)
    if (existing) return existing

    const created: PrefetchQueue = {
      inflight: new Set(),
      pending: [],
      pendingSet: new Set(),
      running: 0,
    }
    prefetchQueues.set(directory, created)
    return created
  }

  async function prefetchMessages(directory: string, sessionID: string, token: number) {
    await serverSync()
      .session.prefetch(sessionID, prefetchChunk)
      .catch(() => {})
    if (prefetchToken.value !== token) return
    for (const stale of markPrefetched(directory, sessionID)) serverSync().session.evict(stale)
  }

  const pumpPrefetch = (directory: string) => {
    const q = queueFor(directory)
    if (q.running >= prefetchConcurrency) return

    const sessionID = q.pending.shift()
    if (!sessionID) return

    q.pendingSet.delete(sessionID)
    q.inflight.add(sessionID)
    q.running += 1

    const token = prefetchToken.value

    void prefetchMessages(directory, sessionID, token).finally(() => {
      q.running -= 1
      q.inflight.delete(sessionID)
      pumpPrefetch(directory)
    })
  }

  const prefetchSession = (session: Session, priority: "high" | "low" = "low") => {
    const directory = session.directory
    if (!directory) return

    const cached = untrack(() => !serverSync().session.shouldPrefetch(session.id, prefetchChunk))
    if (cached) return

    const q = queueFor(directory)
    if (q.inflight.has(session.id)) return
    if (q.pendingSet.has(session.id)) {
      if (priority !== "high") return
      const index = q.pending.indexOf(session.id)
      if (index > 0) {
        q.pending.splice(index, 1)
        q.pending.unshift(session.id)
      }
      return
    }

    const lru = lruFor(directory)
    const known = lru.has(session.id)
    if (!known && lru.size >= PREFETCH_MAX_SESSIONS_PER_DIR && priority !== "high") return

    if (priority === "high") q.pending.unshift(session.id)
    if (priority !== "high") q.pending.push(session.id)
    q.pendingSet.add(session.id)

    while (q.pending.length > prefetchPendingLimit) {
      const dropped = q.pending.pop()
      if (!dropped) continue
      q.pendingSet.delete(dropped)
    }

    pumpPrefetch(directory)
  }

  const warm = (sessions: Session[], index: number) => {
    for (let offset = 1; offset <= span; offset++) {
      const next = sessions[index + offset]
      if (next) prefetchSession(next, offset === 1 ? "high" : "low")

      const prev = sessions[index - offset]
      if (prev) prefetchSession(prev, offset === 1 ? "high" : "low")
    }
  }

  createEffect(() => {
    const sessions = currentSessions()
    if (sessions.length === 0) return

    const index = params.id ? sessions.findIndex((s) => s.id === params.id) : 0
    if (index === -1) return

    if (!params.id) {
      const first = sessions[index]
      if (first) prefetchSession(first, "high")
    }

    warm(sessions, index)
  })

  function navigateSessionByOffset(offset: number) {
    const sessions = currentSessions()
    if (sessions.length === 0) return

    const sessionIndex = params.id ? sessions.findIndex((s) => s.id === params.id) : -1

    let targetIndex: number
    if (sessionIndex === -1) {
      targetIndex = offset > 0 ? 0 : sessions.length - 1
    } else {
      targetIndex = (sessionIndex + offset + sessions.length) % sessions.length
    }

    const session = sessions[targetIndex]
    if (!session) return

    prefetchSession(session, "high")
    warm(sessions, targetIndex)

    navigateToSession(session)
  }

  function navigateProjectByOffset(offset: number) {
    const projects = layout.projects.list()
    if (projects.length === 0) return

    const current = currentProject()?.worktree
    const fallback = currentDir() ? projectRoot(currentDir()) : undefined
    const active = current ?? fallback
    const index = active ? projects.findIndex((project) => project.worktree === active) : -1

    const target =
      index === -1
        ? offset > 0
          ? projects[0]
          : projects[projects.length - 1]
        : projects[(index + offset + projects.length) % projects.length]
    if (!target) return

    // warm up child store to prevent flicker
    serverSync().child(target.worktree)
    void openProject(target.worktree)
  }

  function navigateToProjectIndex(index: number) {
    const projects = layout.projects.list()
    const target = projects[index]
    if (!target) return

    serverSync().child(target.worktree)
    void openProject(target.worktree)
  }

  function navigateSessionByUnseen(offset: number) {
    const sessions = currentSessions()
    if (sessions.length === 0) return

    const hasUnseen = sessions.some((session) => notification.session.unseenCount(session.id) > 0)
    if (!hasUnseen) return

    const activeIndex = params.id ? sessions.findIndex((s) => s.id === params.id) : -1
    const start = activeIndex === -1 ? (offset > 0 ? -1 : 0) : activeIndex

    for (let i = 1; i <= sessions.length; i++) {
      const index = offset > 0 ? (start + i) % sessions.length : (start - i + sessions.length) % sessions.length
      const session = sessions[index]
      if (!session) continue
      if (notification.session.unseenCount(session.id) === 0) continue

      prefetchSession(session, "high")
      warm(sessions, index)

      navigateToSession(session)
      return
    }
  }

  async function archiveSession(session: Session) {
    const [store, setStore] = serverSync().child(session.directory)
    const sessions = store.session ?? []
    const index = sessions.findIndex((s) => s.id === session.id)
    const nextSession = sessions[index + 1] ?? sessions[index - 1]

    await serverSDK().client.session.update({
      directory: session.directory,
      sessionID: session.id,
      time: { archived: Date.now() },
    })
    setStore(
      produce((draft) => {
        const match = Binary.search(draft.session, session.id, (s) => s.id)
        if (match.found) draft.session.splice(match.index, 1)
      }),
    )
    if (session.id === params.id) {
      if (nextSession) {
        navigate(`/${params.dir}/session/${nextSession.id}`)
      } else {
        navigate(`/${params.dir}/session`)
      }
    }
  }

  command.register("layout", () => {
    const commands: CommandOption[] = [
      {
        id: "sidebar.toggle",
        title: language.t("command.sidebar.toggle"),
        category: language.t("command.category.view"),
        keybind: "mod+b",
        onSelect: () => layout.sidebar.toggle(),
      },
      {
        id: "project.open",
        title: language.t("command.project.open"),
        category: language.t("command.category.project"),
        keybind: "mod+o",
        onSelect: () => chooseProject(),
      },
      {
        id: "project.previous",
        title: language.t("command.project.previous"),
        category: language.t("command.category.project"),
        keybind: "mod+alt+arrowup",
        onSelect: () => navigateProjectByOffset(-1),
      },
      {
        id: "project.next",
        title: language.t("command.project.next"),
        category: language.t("command.category.project"),
        keybind: "mod+alt+arrowdown",
        onSelect: () => navigateProjectByOffset(1),
      },
      {
        id: "provider.connect",
        title: language.t("command.provider.connect"),
        category: language.t("command.category.provider"),
        onSelect: () => connectProvider(),
      },
      {
        id: "server.switch",
        title: language.t("command.server.switch"),
        category: language.t("command.category.server"),
        onSelect: () => openServer(),
      },
      {
        id: "settings.open",
        title: language.t("command.settings.open"),
        category: language.t("command.category.settings"),
        keybind: "mod+comma",
        onSelect: () => openSettings(),
      },
      {
        id: "session.previous",
        title: language.t("command.session.previous"),
        category: language.t("command.category.session"),
        keybind: "alt+arrowup",
        onSelect: () => navigateSessionByOffset(-1),
      },
      {
        id: "session.next",
        title: language.t("command.session.next"),
        category: language.t("command.category.session"),
        keybind: "alt+arrowdown",
        onSelect: () => navigateSessionByOffset(1),
      },
      {
        id: "session.previous.unseen",
        title: language.t("command.session.previous.unseen"),
        category: language.t("command.category.session"),
        keybind: "shift+alt+arrowup",
        onSelect: () => navigateSessionByUnseen(-1),
      },
      {
        id: "session.next.unseen",
        title: language.t("command.session.next.unseen"),
        category: language.t("command.category.session"),
        keybind: "shift+alt+arrowdown",
        onSelect: () => navigateSessionByUnseen(1),
      },
      {
        id: "session.archive",
        title: language.t("command.session.archive"),
        category: language.t("command.category.session"),
        keybind: "mod+shift+backspace",
        disabled: !params.dir || !params.id,
        onSelect: () => {
          const session = currentSessions().find((s) => s.id === params.id)
          if (session) void archiveSession(session)
        },
      },
      {
        id: "workspace.new",
        title: language.t("workspace.new"),
        category: language.t("command.category.workspace"),
        keybind: "mod+shift+w",
        disabled: !workspaceSetting(),
        onSelect: () => {
          const project = currentProject()
          if (!project) return
          return createWorkspace(project)
        },
      },
      {
        id: "workspace.toggle",
        title: language.t("command.workspace.toggle"),
        description: language.t("command.workspace.toggle.description"),
        category: language.t("command.category.workspace"),
        slash: "workspace",
        disabled: !currentProject() || currentProject()?.vcs !== "git",
        onSelect: () => {
          const project = currentProject()
          if (!project) return
          if (project.vcs !== "git") return
          const wasEnabled = layout.sidebar.workspaces(project.worktree)()
          layout.sidebar.toggleWorkspaces(project.worktree)
          showToast({
            title: wasEnabled
              ? language.t("toast.workspace.disabled.title")
              : language.t("toast.workspace.enabled.title"),
            description: wasEnabled
              ? language.t("toast.workspace.disabled.description")
              : language.t("toast.workspace.enabled.description"),
          })
        },
      },
      {
        id: "theme.cycle",
        title: language.t("command.theme.cycle"),
        category: language.t("command.category.theme"),
        keybind: "mod+shift+t",
        onSelect: () => cycleTheme(1),
      },
    ]

    Array.from({ length: 9 }, (_, i) => {
      const index = i
      const number = index + 1
      commands.push({
        id: `project.${number}`,
        category: language.t("command.category.project"),
        title: `Open Project {number}`,
        keybind: `mod+${number}`,
        disabled: layout.projects.list().length <= index,
        hidden: true,
        onSelect: () => navigateToProjectIndex(index),
      })
    })

    for (const [id] of availableThemeEntries()) {
      commands.push({
        id: `theme.set.${id}`,
        title: language.t("command.theme.set", { theme: theme.name(id) }),
        category: language.t("command.category.theme"),
        onSelect: () => theme.commitPreview(),
        onHighlight: () => {
          theme.previewTheme(id)
          return () => theme.cancelPreview()
        },
      })
    }

    commands.push({
      id: "theme.scheme.cycle",
      title: language.t("command.theme.scheme.cycle"),
      category: language.t("command.category.theme"),
      keybind: "mod+shift+s",
      onSelect: () => cycleColorScheme(1),
    })

    for (const scheme of colorSchemeOrder) {
      commands.push({
        id: `theme.scheme.${scheme}`,
        title: language.t("command.theme.scheme.set", { scheme: colorSchemeLabel(scheme) }),
        category: language.t("command.category.theme"),
        onSelect: () => theme.commitPreview(),
        onHighlight: () => {
          theme.previewColorScheme(scheme)
          return () => theme.cancelPreview()
        },
      })
    }

    commands.push({
      id: "language.cycle",
      title: language.t("command.language.cycle"),
      category: language.t("command.category.language"),
      onSelect: () => cycleLanguage(1),
    })

    for (const locale of language.locales) {
      commands.push({
        id: `language.set.${locale}`,
        title: language.t("command.language.set", { language: language.label(locale) }),
        category: language.t("command.category.language"),
        onSelect: () => setLocale(locale),
      })
    }

    return commands
  })

  function connectProvider() {
    const run = ++dialogRun
    void import("@/components/dialog-select-provider").then((x) => {
      if (dialogDead || dialogRun !== run) return
      dialog.show(() => <x.DialogSelectProvider />)
    })
  }

  function openServer() {
    const run = ++dialogRun
    void import("@/components/dialog-select-server").then((x) => {
      if (dialogDead || dialogRun !== run) return
      dialog.show(() => <x.DialogSelectServer />)
    })
  }

  function openSettings() {
    navigate("/settings")
  }

  function projectRoot(directory: string) {
    const key = pathKey(directory)
    const project = layout.projects
      .list()
      .find((item) => pathKey(item.worktree) === key || item.sandboxes?.some((sandbox) => pathKey(sandbox) === key))
    if (project) return project.worktree

    const known = Object.entries(store.workspaceOrder).find(
      ([root, dirs]) => pathKey(root) === key || dirs.some((item) => pathKey(item) === key),
    )
    if (known) return known[0]

    const [child] = serverSync().child(directory, { bootstrap: false })
    const id = child.project
    if (!id) return directory

    const meta = serverSync().data.project.find((item) => item.id === id)
    return meta?.worktree ?? directory
  }

  function activeProjectRoot(directory: string) {
    return currentProject()?.worktree ?? projectRoot(directory)
  }

  function rememberSessionRoute(directory: string, id: string, root = activeProjectRoot(directory)) {
    setStore("lastProjectSession", root, { directory, id, at: Date.now() })
    return root
  }

  function clearLastProjectSession(root: string) {
    if (!store.lastProjectSession[root]) return
    setStore(
      "lastProjectSession",
      produce((draft) => {
        delete draft[root]
      }),
    )
  }

  function syncSessionRoute(directory: string, id: string, root = activeProjectRoot(directory)) {
    rememberSessionRoute(directory, id, root)
    notification.session.markViewed(id)
    const expanded = untrack(() => store.workspaceExpanded[directory])
    if (expanded === false) {
      setStore("workspaceExpanded", directory, true)
    }
    requestAnimationFrame(() => scrollToSession(id, `${directory}:${id}`))
    return root
  }

  async function navigateToProject(directory: string | undefined) {
    if (!directory) return
    const root = projectRoot(directory)
    server.projects.touch(root)
    const project = layout.projects.list().find((item) => item.worktree === root)
    let dirs = project
      ? effectiveWorkspaceOrder(root, [root, ...(project.sandboxes ?? [])], store.workspaceOrder[root])
      : [root]
    const canOpen = (value: string | undefined) => {
      if (!value) return false
      return dirs.some((item) => pathKey(item) === pathKey(value))
    }
    const refreshDirs = async (target?: string) => {
      if (!target || target === root || canOpen(target)) return canOpen(target)
      const listed = await serverSDK()
        .client.worktree.list({ directory: root })
        .then((x) => x.data ?? [])
        .catch(() => [] as string[])
      dirs = effectiveWorkspaceOrder(root, [root, ...listed], store.workspaceOrder[root])
      return canOpen(target)
    }
    const openSession = async (target: { directory: string; id: string }) => {
      if (!canOpen(target.directory)) return false
      const sync = serverSync().ensureDirSyncContext(target.directory)
      if (sync.session.get(target.id)) {
        setStore("lastProjectSession", root, { directory: target.directory, id: target.id, at: Date.now() })
        navigateWithSidebarReset(`/${base64Encode(target.directory)}/session/${target.id}`)
        return true
      }
      const resolved = await sync.session
        .sync(target.id)
        .then(() => sync.session.get(target.id))
        .catch(() => undefined)
      if (!resolved?.directory) return false
      if (!canOpen(resolved.directory)) return false
      setStore("lastProjectSession", root, { directory: resolved.directory, id: resolved.id, at: Date.now() })
      navigateWithSidebarReset(`/${base64Encode(resolved.directory)}/session/${resolved.id}`)
      return true
    }

    const projectSession = store.lastProjectSession[root]
    if (projectSession?.id) {
      await refreshDirs(projectSession.directory)
      const opened = await openSession(projectSession)
      if (opened) return
      clearLastProjectSession(root)
    }

    const latest = latestRootSession(
      dirs.map((item) => serverSync().child(item, { bootstrap: false })[0]),
      Date.now(),
    )
    if (latest && (await openSession(latest))) {
      return
    }

    const fetched = latestRootSession(
      await Promise.all(
        dirs.map(async (item) => ({
          path: { directory: item },
          session: await serverSDK()
            .client.session.list({ directory: item })
            .then((x) => x.data ?? [])
            .catch(() => []),
        })),
      ),
      Date.now(),
    )
    if (fetched && (await openSession(fetched))) {
      return
    }

    navigateWithSidebarReset(`/${base64Encode(root)}/session`)
  }

  function navigateToSession(session: Session | undefined) {
    if (!session) return
    navigateWithSidebarReset(`/${base64Encode(session.directory)}/session/${session.id}`)
  }

  function openProject(directory: string, navigate = true) {
    layout.projects.open(directory)
    if (navigate) return navigateToProject(directory)
  }

  const handleDeepLinks = (urls: string[]) => {
    if (!server.isLocal()) return

    for (const directory of collectOpenProjectDeepLinks(urls)) {
      void openProject(directory)
    }

    for (const link of collectNewSessionDeepLinks(urls)) {
      void openProject(link.directory, false)
      const slug = base64Encode(link.directory)
      if (link.prompt) {
        setSessionHandoff(SessionStateKey.from(server.scope(), SessionRouteKey.fromLegacy(slug)), {
          prompt: link.prompt,
        })
      }
      const href = link.prompt ? `/${slug}/session?prompt=${encodeURIComponent(link.prompt)}` : `/${slug}/session`
      navigateWithSidebarReset(href)
    }
  }

  onMount(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ urls: string[] }>).detail
      const urls = detail?.urls ?? []
      if (urls.length === 0) return
      handleDeepLinks(urls)
    }

    handleDeepLinks(drainPendingDeepLinks(window))
    makeEventListener(window, deepLinkEvent, handler as EventListener)
  })

  async function renameProject(project: LocalProject, next: string) {
    const current = displayName(project)
    if (next === current) return
    const name = next === getFilename(project.worktree) ? "" : next

    if (project.id && project.id !== "global") {
      await serverSDK().client.project.update({ projectID: project.id, directory: project.worktree, name })
      return
    }

    serverSync().project.meta(project.worktree, { name })
  }

  const renameWorkspace = (directory: string, next: string, projectId?: string, branch?: string) => {
    const current = workspaceName(directory, projectId, branch) ?? branch ?? getFilename(directory)
    if (current === next) return
    setWorkspaceName(directory, next, projectId, branch)
  }

  function closeProject(directory: string) {
    const list = layout.projects.list()
    const key = pathKey(directory)
    const index = list.findIndex((x) => pathKey(x.worktree) === key)
    const active = pathKey(currentProject()?.worktree ?? "") === key
    if (index === -1) return

    if (!active) {
      layout.projects.close(directory)
      return
    }

    if (list.length === 1) {
      layout.projects.close(directory)
      navigate("/")
      return
    }

    const next = list[index + 1] ?? list[index - 1]

    navigateWithSidebarReset(`/${base64Encode(next.worktree)}/session`)
    layout.projects.close(directory)
    queueMicrotask(() => {
      void navigateToProject(next.worktree)
    })
  }

  function toggleProjectWorkspaces(project: LocalProject) {
    const enabled = layout.sidebar.workspaces(project.worktree)()
    if (enabled) {
      layout.sidebar.toggleWorkspaces(project.worktree)
      return
    }
    if (project.vcs !== "git") return
    layout.sidebar.toggleWorkspaces(project.worktree)
  }

  const showEditProjectDialog = (conn: ServerConnection.Any, project: LocalProject) => {
    const run = ++dialogRun
    void import("@/components/dialog-edit-project").then((x) => {
      if (dialogDead || dialogRun !== run) return
      dialog.show(() => <x.DialogEditProject server={conn} project={project} />)
    })
  }

  function chooseProject() {
    const conn = server.current
    if (!conn) return
    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          void openProject(directory, false)
        }
        void navigateToProject(result[0])
      } else if (result) {
        void openProject(result)
      }
    }

    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: resolve,
    })
  }

  const deleteWorkspace = async (root: string, directory: string, leaveDeletedWorkspace = false) => {
    if (directory === root) return

    const current = currentDir()
    const currentKey = pathKey(current)
    const deletedKey = pathKey(directory)
    const shouldLeave = leaveDeletedWorkspace || (!!params.dir && currentKey === deletedKey)
    if (!leaveDeletedWorkspace && shouldLeave) {
      navigateWithSidebarReset(`/${base64Encode(root)}/session`)
    }

    setBusy(directory, true)

    const result = await serverSDK()
      .client.worktree.remove({ directory: root, worktreeRemoveInput: { directory } })
      .then((x) => x.data)
      .catch((err) => {
        showToast({
          title: language.t("workspace.delete.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return false
      })

    setBusy(directory, false)

    if (!result) return

    if (pathKey(store.lastProjectSession[root]?.directory ?? "") === pathKey(directory)) {
      clearLastProjectSession(root)
    }

    serverSync().set(
      "project",
      produce((draft) => {
        const project = draft.find((item) => item.worktree === root)
        if (!project) return
        project.sandboxes = (project.sandboxes ?? []).filter((sandbox) => sandbox !== directory)
      }),
    )
    setStore("workspaceOrder", root, (order) => (order ?? []).filter((workspace) => workspace !== directory))

    layout.projects.close(directory)
    layout.projects.open(root)

    if (shouldLeave) return

    const nextCurrent = currentDir()
    const nextKey = pathKey(nextCurrent)
    const project = layout.projects.list().find((item) => item.worktree === root)
    const dirs = project
      ? effectiveWorkspaceOrder(root, [root, ...(project.sandboxes ?? [])], store.workspaceOrder[root])
      : [root]
    const valid = dirs.some((item) => pathKey(item) === nextKey)

    if (params.dir && projectRoot(nextCurrent) === root && !valid) {
      navigateWithSidebarReset(`/${base64Encode(root)}/session`)
    }
  }

  const resetWorkspace = async (root: string, directory: string) => {
    if (directory === root) return
    setBusy(directory, true)

    const progress = showToast({
      persistent: true,
      title: language.t("workspace.resetting.title"),
      description: language.t("workspace.resetting.description"),
    })
    const dismiss = () => toaster.dismiss(progress)

    const sessions: Session[] = await serverSDK()
      .client.session.list({ directory })
      .then((x) => x.data ?? [])
      .catch(() => [])

    clearWorkspaceTerminals(
      directory,
      sessions.map((s) => s.id),
      platform,
      serverSDK().scope,
    )
    await serverSDK()
      .client.instance.dispose({ directory })
      .catch(() => undefined)

    const result = await serverSDK()
      .client.worktree.reset({ directory: root, worktreeResetInput: { directory } })
      .then((x) => x.data)
      .catch((err) => {
        showToast({
          title: language.t("workspace.reset.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return false
      })

    if (!result) {
      setBusy(directory, false)
      dismiss()
      return
    }

    const archivedAt = Date.now()
    await Promise.all(
      sessions
        .filter((session) => session.time.archived === undefined)
        .map((session) =>
          serverSDK()
            .client.session.update({
              sessionID: session.id,
              directory: session.directory,
              time: { archived: archivedAt },
            })
            .catch(() => undefined),
        ),
    )

    setBusy(directory, false)
    dismiss()

    showToast({
      title: language.t("workspace.reset.success.title"),
      description: language.t("workspace.reset.success.description"),
      actions: [
        {
          label: language.t("command.session.new"),
          onClick: () => {
            const href = `/${base64Encode(directory)}/session`
            navigate(href)
            layout.mobileSidebar.hide()
          },
        },
        {
          label: language.t("common.dismiss"),
          onClick: "dismiss",
        },
      ],
    })
  }

  function DialogDeleteWorkspace(props: { root: string; directory: string }) {
    const name = createMemo(() => getFilename(props.directory))
    const [data, setData] = createStore({
      status: "loading" as "loading" | "ready" | "error",
      dirty: false,
    })

    onMount(() => {
      serverSDK()
        .client.vcs.status({ directory: props.directory })
        .then((x) => {
          const files = x.data ?? []
          const dirty = files.length > 0
          setData({ status: "ready", dirty })
        })
        .catch(() => {
          setData({ status: "error", dirty: false })
        })
    })

    const handleDelete = () => {
      const leaveDeletedWorkspace = !!params.dir && pathKey(currentDir()) === pathKey(props.directory)
      if (leaveDeletedWorkspace) {
        navigateWithSidebarReset(`/${base64Encode(props.root)}/session`)
      }
      dialog.close()
      void deleteWorkspace(props.root, props.directory, leaveDeletedWorkspace)
    }

    const description = () => {
      if (data.status === "loading") return language.t("workspace.status.checking")
      if (data.status === "error") return language.t("workspace.status.error")
      if (!data.dirty) return language.t("workspace.status.clean")
      return language.t("workspace.status.dirty")
    }

    return (
      <Dialog title={language.t("workspace.delete.title")} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <div class="flex flex-col gap-1">
            <span class="text-14-regular text-text-strong">
              {language.t("workspace.delete.confirm", { name: name() })}
            </span>
            <span class="text-12-regular text-text-weak">{description()}</span>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button variant="primary" size="large" disabled={data.status === "loading"} onClick={handleDelete}>
              {language.t("workspace.delete.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  function DialogResetWorkspace(props: { root: string; directory: string }) {
    const name = createMemo(() => getFilename(props.directory))
    const [state, setState] = createStore({
      status: "loading" as "loading" | "ready" | "error",
      dirty: false,
      sessions: [] as Session[],
    })

    const refresh = async () => {
      const sessions = await serverSDK()
        .client.session.list({ directory: props.directory })
        .then((x) => x.data ?? [])
        .catch(() => [])
      const active = sessions.filter((session) => session.time.archived === undefined)
      setState({ sessions: active })
    }

    onMount(() => {
      serverSDK()
        .client.vcs.status({ directory: props.directory })
        .then((x) => {
          const files = x.data ?? []
          const dirty = files.length > 0
          setState({ status: "ready", dirty })
          void refresh()
        })
        .catch(() => {
          setState({ status: "error", dirty: false })
        })
    })

    const handleReset = () => {
      dialog.close()
      void resetWorkspace(props.root, props.directory)
    }

    const archivedCount = () => state.sessions.length

    const description = () => {
      if (state.status === "loading") return language.t("workspace.status.checking")
      if (state.status === "error") return language.t("workspace.status.error")
      if (!state.dirty) return language.t("workspace.status.clean")
      return language.t("workspace.status.dirty")
    }

    const archivedLabel = () => {
      const count = archivedCount()
      if (count === 0) return language.t("workspace.reset.archived.none")
      if (count === 1) return language.t("workspace.reset.archived.one")
      return language.t("workspace.reset.archived.many", { count })
    }

    return (
      <Dialog title={language.t("workspace.reset.title")} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <div class="flex flex-col gap-1">
            <span class="text-14-regular text-text-strong">
              {language.t("workspace.reset.confirm", { name: name() })}
            </span>
            <span class="text-12-regular text-text-weak">
              {description()} {archivedLabel()} {language.t("workspace.reset.note")}
            </span>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button variant="primary" size="large" disabled={state.status === "loading"} onClick={handleReset}>
              {language.t("workspace.reset.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  const activeRoute = {
    session: "",
    sessionProject: "",
    directory: "",
  }

  createEffect(
    on(
      () => {
        return [pageReady(), route().slug, params.id, currentProject()?.worktree, currentDir()] as const
      },
      ([ready, slug, id, root, dir]) => {
        if (!ready || !slug || !dir) {
          activeRoute.session = ""
          activeRoute.sessionProject = ""
          activeRoute.directory = ""
          return
        }

        if (!id) {
          activeRoute.session = ""
          activeRoute.sessionProject = ""
          activeRoute.directory = ""
          return
        }

        const session = `${slug}/${id}`

        if (!root) {
          activeRoute.session = session
          activeRoute.directory = dir
          activeRoute.sessionProject = ""
          return
        }

        if (server.projects.last() !== root) server.projects.touch(root)

        const changed = session !== activeRoute.session || dir !== activeRoute.directory
        if (changed) {
          activeRoute.session = session
          activeRoute.directory = dir
          activeRoute.sessionProject = syncSessionRoute(dir, id, root)
          return
        }

        if (root === activeRoute.sessionProject) return
        activeRoute.directory = dir
        activeRoute.sessionProject = rememberSessionRoute(dir, id, root)
      },
    ),
  )

  createEffect(() => {
    document.documentElement.style.setProperty(
      "--dialog-left-margin",
      `${layout.sidebar.opened() ? layout.sidebar.width() : 48}px`,
    )
  })

  const side = createMemo(() => Math.max(layout.sidebar.width(), 244))
  const panel = createMemo(() => Math.max(side() - 64, 0))

  const loadedSessionDirs = new Set<string>()

  createEffect(
    on(
      visibleSessionDirs,
      (dirs) => {
        if (dirs.length === 0) {
          loadedSessionDirs.clear()
          return
        }

        const next = new Set(dirs)
        for (const directory of next) {
          if (loadedSessionDirs.has(directory)) continue
          void serverSync().project.loadSessions(directory)
        }

        loadedSessionDirs.clear()
        for (const directory of next) {
          loadedSessionDirs.add(directory)
        }
      },
      { defer: true },
    ),
  )

  function handleDragStart(event: unknown) {
    const id = getDraggableId(event)
    if (!id) return
    setHoverProject(undefined)
    setStore("activeProject", id)
  }

  function handleDragOver(event: DragEvent) {
    const { draggable, droppable } = event
    if (draggable && droppable) {
      const projects = layout.projects.list()
      const fromIndex = projects.findIndex((p) => p.worktree === draggable.id.toString())
      const toIndex = projects.findIndex((p) => p.worktree === droppable.id.toString())
      if (fromIndex !== toIndex && toIndex !== -1) {
        layout.projects.move(draggable.id.toString(), toIndex)
      }
    }
  }

  function handleDragEnd() {
    setStore("activeProject", undefined)
  }

  function workspaceIds(project: LocalProject | undefined) {
    if (!project) return []
    const local = project.worktree
    const dirs = [local, ...(project.sandboxes ?? [])]
    const active = currentProject()
    const directory = pathKey(active?.worktree ?? "") === pathKey(project.worktree) ? currentDir() : undefined
    const extra =
      directory && pathKey(directory) !== pathKey(local) && !dirs.some((item) => pathKey(item) === pathKey(directory))
        ? directory
        : undefined
    const pending = extra ? WorktreeState.get(serverSDK().scope, extra)?.status === "pending" : false

    const ordered = effectiveWorkspaceOrder(local, dirs, store.workspaceOrder[project.worktree])
    if (pending && extra) return [local, extra, ...ordered.filter((item) => item !== local)]
    if (!extra) return ordered
    if (pending) return ordered
    return [...ordered, extra]
  }

  const sidebarProject = createMemo(() => {
    if (layout.sidebar.opened()) return currentProject()
    const hovered = hoverProjectData()
    if (hovered) return hovered
    return currentProject()
  })

  function handleWorkspaceDragStart(event: unknown) {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeWorkspace", id)
  }

  function handleWorkspaceDragOver(event: DragEvent) {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const project = sidebarProject()
    if (!project) return

    const ids = workspaceIds(project)
    const fromIndex = ids.findIndex((dir) => dir === draggable.id.toString())
    const toIndex = ids.findIndex((dir) => dir === droppable.id.toString())
    if (fromIndex === -1 || toIndex === -1) return
    if (fromIndex === toIndex) return

    const result = ids.slice()
    const [item] = result.splice(fromIndex, 1)
    if (!item) return
    result.splice(toIndex, 0, item)
    setStore(
      "workspaceOrder",
      project.worktree,
      result.filter((directory) => pathKey(directory) !== pathKey(project.worktree)),
    )
  }

  function handleWorkspaceDragEnd() {
    setStore("activeWorkspace", undefined)
  }

  const createWorkspace = async (project: LocalProject) => {
    clearSidebarHoverState()
    const created = await serverSDK()
      .client.worktree.create({ directory: project.worktree })
      .then((x) => x.data)
      .catch((err) => {
        showToast({
          title: language.t("workspace.create.failed.title"),
          description: errorMessage(err, language.t("common.requestFailed")),
        })
        return undefined
      })

    if (!created?.directory) return

    setWorkspaceName(created.directory, created.branch ?? getFilename(created.directory), project.id, created.branch)

    const local = project.worktree
    const key = pathKey(created.directory)
    const root = pathKey(local)

    setBusy(created.directory, true)
    WorktreeState.pending(serverSDK().scope, created.directory)
    setStore("workspaceExpanded", key, true)
    if (key !== created.directory) {
      setStore("workspaceExpanded", created.directory, true)
    }
    setStore("workspaceOrder", project.worktree, (prev) => {
      const existing = prev ?? []
      const next = existing.filter((item) => {
        const id = pathKey(item)
        return id !== root && id !== key
      })
      return [created.directory, ...next]
    })

    serverSync().child(created.directory)
    navigateWithSidebarReset(`/${base64Encode(created.directory)}/session`)
  }

  const workspaceSidebarCtx: WorkspaceSidebarContext = {
    currentDir,
    navList: currentSessions,
    sidebarExpanded,
    sidebarHovering,
    clearHoverProjectSoon,
    prefetchSession,
    archiveSession,
    workspaceName,
    renameWorkspace,
    editorOpen,
    openEditor,
    closeEditor,
    setEditor,
    InlineEditor,
    isBusy,
    workspaceExpanded: (directory, local) => store.workspaceExpanded[directory] ?? local,
    setWorkspaceExpanded: (directory, value) => setStore("workspaceExpanded", directory, value),
    showResetWorkspaceDialog: (root, directory) =>
      dialog.show(() => <DialogResetWorkspace root={root} directory={directory} />),
    showDeleteWorkspaceDialog: (root, directory) =>
      dialog.show(() => <DialogDeleteWorkspace root={root} directory={directory} />),
    setScrollContainerRef: (el, mobile) => {
      if (!mobile) scrollContainerRef = el
    },
  }

  const projectSidebarCtx: ProjectSidebarContext = {
    currentDir,
    currentProject,
    sidebarOpened: () => layout.sidebar.opened(),
    sidebarHovering,
    hoverProject: () => state.hoverProject,
    onProjectMouseEnter: (worktree, event) => aim.enter(worktree, event),
    onProjectMouseLeave: (worktree) => aim.leave(worktree),
    onProjectFocus: (worktree) => aim.activate(worktree),
    onHoverOpenChanged: (worktree, hoverOpen) => {
      if (!hoverOpen && state.hoverProject && state.hoverProject !== worktree) return
      setState("hoverProject", hoverOpen ? worktree : undefined)
    },
    navigateToProject,
    openSidebar: () => layout.sidebar.open(),
    closeProject,
    showEditProjectDialog: (proj) => showEditProjectDialog(server.current!, proj),
    toggleProjectWorkspaces,
    workspacesEnabled: (project) => project.vcs === "git" && layout.sidebar.workspaces(project.worktree)(),
    workspaceIds,
    workspaceLabel,
    sessionProps: {
      navList: currentSessions,
      sidebarExpanded,
      clearHoverProjectSoon,
      prefetchSession,
      archiveSession,
    },
  }

  const SidebarPanel = (panelProps: {
    project: Accessor<LocalProject | undefined>
    mobile?: boolean
    merged?: boolean
  }) => {
    const project = panelProps.project
    const merged = createMemo(() => panelProps.mobile || (panelProps.merged ?? layout.sidebar.opened()))
    const hover = createMemo(() => !panelProps.mobile && panelProps.merged === false && !layout.sidebar.opened())
    const empty = createMemo(() => !params.dir && layout.projects.list().length === 0)
    const projectName = createMemo(() => {
      const item = project()
      if (!item) return ""
      return item.name || getFilename(item.worktree)
    })
    const projectId = createMemo(() => project()?.id ?? "")
    const worktree = createMemo(() => project()?.worktree ?? "")
    const slug = createMemo(() => {
      const dir = worktree()
      if (!dir) return ""
      return base64Encode(dir)
    })
    const workspaces = createMemo(() => {
      const item = project()
      if (!item) return [] as string[]
      return workspaceIds(item)
    })
    const unseenCount = createMemo(() =>
      workspaces().reduce((total, directory) => total + notification.project.unseenCount(directory), 0),
    )
    const clearNotifications = () =>
      workspaces()
        .filter((directory) => notification.project.unseenCount(directory) > 0)
        .forEach((directory) => notification.project.markViewed(directory))
    const workspacesEnabled = createMemo(() => {
      const item = project()
      if (!item) return false
      if (item.vcs !== "git") return false
      return layout.sidebar.workspaces(item.worktree)()
    })
    const canToggle = createMemo(() => {
      const item = project()
      if (!item) return false
      return item.vcs === "git" || layout.sidebar.workspaces(item.worktree)()
    })
    const homedir = createMemo(() => serverSync().data.path.home)

    return (
      <div
        classList={{
          "flex flex-col min-h-0 min-w-0 box-border rounded-tl-[12px] px-3": true,
          "border border-b-0 border-border-weak-base": !merged(),
          "border-l border-t border-border-weaker-base": merged(),
          "bg-background-base": merged() || hover(),
          "bg-background-stronger": !merged() && !hover(),
          "flex-1 min-w-0": panelProps.mobile,
          "max-w-full overflow-hidden": panelProps.mobile,
        }}
        style={{
          width: panelProps.mobile ? undefined : `${panel()}px`,
        }}
      >
        <Show
          when={project()}
          fallback={
            <Show when={empty()}>
              <div class="flex-1 min-h-0 -mt-4 flex items-center justify-center px-6 pb-64 text-center">
                <div class="mt-8 flex max-w-60 flex-col items-center gap-6 text-center">
                  <div class="flex flex-col gap-3">
                    <div class="text-14-medium text-text-strong">{language.t("sidebar.empty.title")}</div>
                    <div class="text-14-regular text-text-base" style={{ "line-height": "var(--line-height-normal)" }}>
                      {language.t("sidebar.empty.description")}
                    </div>
                  </div>
                  <Button size="large" icon="folder-add-left" onClick={chooseProject}>
                    {language.t("command.project.open")}
                  </Button>
                </div>
              </div>
            </Show>
          }
          keyed
        >
          {(project) => (
            <>
              <div class="shrink-0 pl-1 py-1">
                <div class="group/project flex items-start justify-between gap-2 py-2 pl-2 pr-0">
                  <div class="flex flex-col min-w-0">
                    <InlineEditor
                      id={`project:${projectId()}`}
                      value={projectName}
                      onSave={(next) => {
                        void renameProject(project, next)
                      }}
                      class="text-14-medium text-text-strong truncate"
                      displayClass="text-14-medium text-text-strong truncate"
                      stopPropagation
                    />

                    <Tooltip
                      placement="bottom"
                      gutter={2}
                      value={worktree()}
                      class="shrink-0"
                      contentStyle={{
                        "max-width": "640px",
                        transform: "translate3d(52px, 0, 0)",
                      }}
                    >
                      <span class="text-12-regular text-text-base truncate select-text">
                        {worktree().replace(homedir(), "~")}
                      </span>
                    </Tooltip>
                  </div>

                  <DropdownMenu modal={!sidebarHovering()}>
                    <DropdownMenu.Trigger
                      as={IconButton}
                      icon="dot-grid"
                      variant="ghost"
                      data-action="project-menu"
                      data-project={slug()}
                      class="shrink-0 size-6 rounded-md transition-opacity data-[expanded]:bg-surface-base-active"
                      classList={{
                        "opacity-100": panelProps.mobile || merged(),
                        "opacity-0 group-hover/project:opacity-100 group-focus-within/project:opacity-100 data-[expanded]:opacity-100":
                          !panelProps.mobile && !merged(),
                      }}
                      aria-label={language.t("common.moreOptions")}
                    />
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content class="mt-1">
                        <DropdownMenu.Item
                          onSelect={() => {
                            showEditProjectDialog(server.current!, project)
                          }}
                        >
                          <DropdownMenu.ItemLabel>{language.t("common.edit")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          data-action="project-workspaces-toggle"
                          data-project={slug()}
                          disabled={!canToggle()}
                          onSelect={() => {
                            toggleProjectWorkspaces(project)
                          }}
                        >
                          <DropdownMenu.ItemLabel>
                            {workspacesEnabled()
                              ? language.t("sidebar.workspaces.disable")
                              : language.t("sidebar.workspaces.enable")}
                          </DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          data-action="project-clear-notifications"
                          data-project={slug()}
                          disabled={unseenCount() === 0}
                          onSelect={clearNotifications}
                        >
                          <DropdownMenu.ItemLabel>
                            {language.t("sidebar.project.clearNotifications")}
                          </DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          data-action="project-close-menu"
                          data-project={slug()}
                          onSelect={() => {
                            const dir = worktree()
                            if (!dir) return
                            closeProject(dir)
                          }}
                        >
                          <DropdownMenu.ItemLabel>{language.t("common.close")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                </div>
              </div>

              <div class="flex-1 min-h-0 flex flex-col">
                <Show
                  when={workspacesEnabled()}
                  fallback={
                    <>
                      <div class="shrink-0 py-4">
                        <Button
                          size="large"
                          class="w-full"
                          onClick={() => {
                            const dir = worktree()
                            if (!dir) return
                            navigateWithSidebarReset(`/${base64Encode(dir)}/session`)
                          }}
                        >
                          <IconV2 name="edit" size="small" />
                          {language.t("command.session.new")}
                        </Button>
                      </div>
                      <div class="flex-1 min-h-0">
                        <LocalWorkspace
                          ctx={workspaceSidebarCtx}
                          project={project}
                          sortNow={sortNow}
                          mobile={panelProps.mobile}
                        />
                      </div>
                    </>
                  }
                >
                  <>
                    <div class="shrink-0 py-4">
                      <Button
                        size="large"
                        icon="plus-small"
                        class="w-full"
                        onClick={() => {
                          void createWorkspace(project)
                        }}
                      >
                        {language.t("workspace.new")}
                      </Button>
                    </div>
                    <div class="relative flex-1 min-h-0">
                      <DragDropProvider
                        onDragStart={handleWorkspaceDragStart}
                        onDragEnd={handleWorkspaceDragEnd}
                        onDragOver={handleWorkspaceDragOver}
                        collisionDetector={closestCenter}
                      >
                        <DragDropSensors />
                        <ConstrainDragXAxis />
                        <div
                          ref={(el) => {
                            if (!panelProps.mobile) scrollContainerRef = el
                          }}
                          class="size-full flex flex-col py-2 gap-4 overflow-y-auto no-scrollbar [overflow-anchor:none]"
                        >
                          <SortableProvider ids={workspaces()}>
                            <For each={workspaces()}>
                              {(directory) => (
                                <SortableWorkspace
                                  ctx={workspaceSidebarCtx}
                                  directory={directory}
                                  project={project}
                                  sortNow={sortNow}
                                  mobile={panelProps.mobile}
                                />
                              )}
                            </For>
                          </SortableProvider>
                        </div>
                        <DragOverlay>
                          <WorkspaceDragOverlay
                            sidebarProject={sidebarProject}
                            activeWorkspace={() => store.activeWorkspace}
                            workspaceLabel={workspaceLabel}
                          />
                        </DragOverlay>
                      </DragDropProvider>
                    </div>
                  </>
                </Show>
              </div>
            </>
          )}
        </Show>

        <div
          class="shrink-0 px-3 py-3"
          classList={{
            hidden: store.gettingStartedDismissed || !(providers.all().size > 0 && providers.paid().length === 0),
          }}
        >
          <div class="rounded-xl bg-background-base shadow-xs-border-base" data-component="getting-started">
            <div class="p-3 flex flex-col gap-6">
              <div class="flex flex-col gap-2">
                <div class="text-14-medium text-text-strong">{language.t("sidebar.gettingStarted.title")}</div>
                <div class="text-14-regular text-text-base" style={{ "line-height": "var(--line-height-normal)" }}>
                  {language.t("sidebar.gettingStarted.line1")}
                </div>
                <div class="text-14-regular text-text-base" style={{ "line-height": "var(--line-height-normal)" }}>
                  {language.t("sidebar.gettingStarted.line2")}
                </div>
              </div>
              <div data-component="getting-started-actions">
                <Button size="large" icon="plus-small" onClick={connectProvider}>
                  {language.t("command.provider.connect")}
                </Button>
                <Button size="large" variant="ghost" onClick={() => setStore("gettingStartedDismissed", true)}>
                  {language.t("toast.update.action.notYet")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const projects = () => layout.projects.list()
  const projectOverlay = () => <ProjectDragOverlay projects={projects} activeProject={() => store.activeProject} />
  const sidebarContent = (mobile?: boolean) => (
    <SidebarContent
      mobile={mobile}
      opened={() => layout.sidebar.opened()}
      aimMove={aim.move}
      projects={projects}
      renderProject={(project) => (
        <SortableProject ctx={projectSidebarCtx} project={project} sortNow={sortNow} mobile={mobile} />
      )}
      handleDragStart={handleDragStart}
      handleDragEnd={handleDragEnd}
      handleDragOver={handleDragOver}
      openProjectLabel={language.t("command.project.open")}
      openProjectKeybind={() => command.keybind("project.open")}
      onOpenProject={chooseProject}
      renderProjectOverlay={projectOverlay}
      settingsLabel={() => language.t("sidebar.settings")}
      settingsKeybind={() => command.keybind("settings.open")}
      onOpenSettings={openSettings}
      helpLabel={() => language.t("sidebar.help")}
      onOpenHelp={() => platform.openLink("https://opencode.ai/desktop-feedback")}
      renderPanel={() =>
        mobile ? <SidebarPanel project={currentProject} mobile /> : <SidebarPanel project={currentProject} merged />
      }
    />
  )

  const projectSessions = (project: LocalProject) => {
    const seen = new Set<string>()
    return workspaceIds(project)
      .flatMap((directory) => sortedRootSessions(serverSync().child(directory, { bootstrap: false })[0], sortNow()))
      .filter((session) => {
        const key = `${pathKey(session.directory)}:${session.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
  }
  const relativeTime = (time: number) => {
    const diff = Math.max(0, sortNow() - time)
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return "now"
    if (diff < hour) return `${Math.floor(diff / minute)}m`
    if (diff < day) return `${Math.floor(diff / hour)}h`
    return `${Math.floor(diff / day)}d`
  }
  const newChat = () => {
    const project = currentProject() ?? layout.projects.list()[0]
    if (!project) {
      chooseProject()
      return
    }
    navigateWithSidebarReset(`/${base64Encode(project.worktree)}/session`)
  }
  const notifyPlaceholder = (title: string) =>
    showToast({
      title,
      description: "Coming soon",
    })
  const CodexSidebarAction = (props: { icon: string; label: string; onClick: () => void }) => (
    <button
      type="button"
      class="flex h-8 w-full items-center gap-3 rounded-md px-2 text-left text-[13px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
      onClick={props.onClick}
    >
      <IconV2 name={props.icon} size="small" class="shrink-0 text-v2-text-text-muted" />
      <span class="min-w-0 truncate">{props.label}</span>
    </button>
  )
  const CodexProjectMenu = (props: { project: LocalProject; slug: string }) => (
    <DropdownMenu modal={false}>
      <DropdownMenu.Trigger
        as="button"
        type="button"
        class="flex size-6 shrink-0 items-center justify-center rounded-md text-v2-text-text-faint opacity-0 transition-[opacity,background-color,color] hover:bg-v2-background-bg-layer-03 hover:text-v2-text-text-base focus-visible:bg-v2-background-bg-layer-03 focus-visible:text-v2-text-text-base focus-visible:opacity-100 focus-visible:outline-none group-hover/project:opacity-100 group-focus-within/project:opacity-100 data-[expanded]:opacity-100"
        aria-label={language.t("common.moreOptions")}
      >
        <CodexDotsGlyph />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="mt-1">
          <DropdownMenu.Item onSelect={() => showEditProjectDialog(server.current!, props.project)}>
            <DropdownMenu.ItemLabel>{language.t("common.edit")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            data-action="project-workspaces-toggle"
            data-project={props.slug}
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
          <DropdownMenu.Item
            data-action="project-close-menu"
            data-project={props.slug}
            onSelect={() => closeProject(props.project.worktree)}
          >
            <DropdownMenu.ItemLabel>{language.t("common.close")}</DropdownMenu.ItemLabel>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
  const CodexProjectGroup = (props: { project: LocalProject }) => {
    const slug = createMemo(() => base64Encode(props.project.worktree))
    const sessions = createMemo(() => projectSessions(props.project))
    const expanded = createMemo(() => store.codexProjectExpanded[pathKey(props.project.worktree)] ?? false)
    const visible = createMemo(() =>
      sessions().slice(0, expanded() ? CODEX_PROJECT_SESSION_EXPANDED_LIMIT : CODEX_PROJECT_SESSION_LIMIT),
    )
    const selectedProject = createMemo(() => currentProject()?.worktree === props.project.worktree)
    const openProject = () => navigateWithSidebarReset(`/${slug()}/session`)
    const newSession = () => navigateWithSidebarReset(`/${slug()}/session`)

    return (
      <section class="flex flex-col gap-1">
        <div class="group/project flex h-8 items-center gap-2 rounded-md px-2 transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-within:bg-v2-overlay-simple-overlay-hover">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none"
            data-selected={selectedProject() ? "" : undefined}
            onClick={openProject}
          >
            <span class="min-w-0 truncate text-[14px] text-v2-text-text-base">{displayName(props.project)}</span>
            <span class="text-v2-text-text-faint shrink-0">
              <CodexChevronDownGlyph />
            </span>
          </button>
          <CodexProjectMenu project={props.project} slug={slug()} />
          <button
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-md text-v2-text-text-faint opacity-0 transition-[opacity,background-color,color] hover:bg-v2-background-bg-layer-03 hover:text-v2-text-text-base focus-visible:bg-v2-background-bg-layer-03 focus-visible:text-v2-text-text-base focus-visible:opacity-100 focus-visible:outline-none group-hover/project:opacity-100 group-focus-within/project:opacity-100"
            onClick={newSession}
            aria-label={language.t("command.session.new")}
            title={language.t("command.session.new")}
          >
            <CodexComposeGlyph />
          </button>
        </div>
        <div class="flex flex-col gap-0.5">
          <For each={visible()}>
            {(session) => {
              const active = createMemo(() => params.id === session.id)
              const updated = createMemo(() => session.time.updated ?? session.time.created)
              return (
                <button
                  type="button"
                  data-session-id={session.id}
                  class="flex h-8 w-full items-center gap-2 rounded-md pl-8 pr-2 text-left text-[13px] transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                  classList={{
                    "bg-v2-background-bg-layer-03 text-v2-text-text-base": active(),
                    "text-v2-text-text-muted": !active(),
                  }}
                  onPointerDown={() => prefetchSession(session, "high")}
                  onFocus={() => prefetchSession(session, "high")}
                  onClick={() => navigateWithSidebarReset(`/${base64Encode(session.directory)}/session/${session.id}`)}
                >
                  <span class="min-w-0 flex-1 truncate">{sessionTitle(session.title)}</span>
                  <Show
                    when={active()}
                    fallback={<span class="shrink-0 text-[12px] text-v2-text-text-faint">{relativeTime(updated())}</span>}
                  >
                    <span class="text-v2-text-text-muted">
                      <CodexActiveSessionGlyph />
                    </span>
                  </Show>
                </button>
              )
            }}
          </For>
          <Show when={sessions().length > visible().length}>
            <button
              type="button"
              class="h-7 rounded-md pl-8 pr-2 text-left text-[13px] text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-muted"
              onClick={() => setStore("codexProjectExpanded", pathKey(props.project.worktree), true)}
            >
              Show more
            </button>
          </Show>
        </div>
      </section>
    )
  }
  const CodexSidebar = (props: { mobile?: boolean }) => (
    <aside
      class="relative flex h-full min-h-0 w-full flex-col bg-v2-background-bg-deep text-v2-text-text-base"
      style={{ width: props.mobile ? undefined : `${layout.sidebar.width()}px` }}
    >
      <div class="flex-1 min-h-0 overflow-y-auto px-2 py-3 no-scrollbar">
        <div class="mb-7 flex flex-col gap-1">
          <CodexSidebarAction icon="edit" label="New chat" onClick={newChat} />
          <CodexSidebarAction icon="grid-plus" label={language.t("home.title")} onClick={() => navigateWithSidebarReset("/")} />
          <CodexSidebarAction icon="magnifying-glass" label="Search" onClick={() => command.show()} />
        </div>

        <div class="mb-7 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2 px-2">
            <button
              type="button"
              class="flex min-w-0 items-center gap-1 text-left text-[14px] text-v2-text-text-faint hover:text-v2-text-text-muted focus-visible:outline-none"
            >
              <span>Projects</span>
              <CodexChevronDownGlyph />
            </button>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="flex size-6 shrink-0 items-center justify-center rounded-md text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none"
                onClick={chooseProject}
                aria-label={language.t("command.project.open")}
                title={language.t("command.project.open")}
              >
                <CodexProjectAddGlyph />
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
            <For each={projects()}>{(project) => <CodexProjectGroup project={project} />}</For>
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

  return (
    <div class="relative bg-background-base flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      {autoselecting() ?? ""}
      <Titlebar update={titlebarUpdate} />
      <Show when={updateVersion() !== undefined}>
        <UpdateAvailableToast version={updateVersion() ?? ""} install={installUpdate} language={language} />
      </Show>
      <div class="flex-1 min-h-0 min-w-0 flex">
        <nav
          aria-label={language.t("sidebar.nav.projectsAndSessions")}
          data-component="codex-sidebar-desktop"
          class="hidden md:block h-full shrink-0"
        >
          <CodexSidebar />
        </nav>

        <div class="md:hidden">
          <div
            classList={{
              "fixed inset-x-0 top-9 bottom-0 z-40 bg-black/30 transition-opacity duration-200": true,
              "opacity-100 pointer-events-auto": layout.mobileSidebar.opened(),
              "opacity-0 pointer-events-none": !layout.mobileSidebar.opened(),
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) layout.mobileSidebar.hide()
            }}
          />
          <nav
            aria-label={language.t("sidebar.nav.projectsAndSessions")}
            data-component="codex-sidebar-mobile"
            classList={{
              "fixed top-9 bottom-0 left-0 z-50 w-full max-w-[360px] overflow-hidden transition-transform duration-200 ease-out": true,
              "translate-x-0": layout.mobileSidebar.opened(),
              "-translate-x-full": !layout.mobileSidebar.opened(),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <CodexSidebar mobile />
          </nav>
        </div>

        <div class="flex-1 min-h-0 min-w-0 relative">
          <div class="size-full relative overflow-x-hidden">
            <main class="size-full overflow-x-hidden flex flex-col items-start contain-strict border-t border-v2-border-border-muted bg-background-base">
              <Show when={!autoselecting.loading} fallback={<div class="size-full" />}>
                {props.children}
              </Show>
            </main>
          </div>
        </div>
        {import.meta.env.DEV && import.meta.env.VITE_DISABLE_DEBUG_BAR !== "1" && <DebugBar />}
      </div>
      <ToastRegion v2={false} />
    </div>
  )
}

function UpdateAvailableToast(props: {
  version: string
  install: () => void
  language: ReturnType<typeof useLanguage>
}) {
  let toastId: number | undefined

  onMount(() => {
    toastId = showToast({
      persistent: true,
      icon: "download",
      title: props.language.t("toast.update.title"),
      description: props.language.t("toast.update.description", { version: props.version }),
      actions: [
        {
          label: props.language.t("toast.update.action.installRestart"),
          onClick: props.install,
        },
        {
          label: props.language.t("toast.update.action.notYet"),
          onClick: "dismiss",
        },
      ],
    })
  })

  onCleanup(() => {
    if (toastId === undefined) return
    toaster.dismiss(toastId)
  })

  return null
}
