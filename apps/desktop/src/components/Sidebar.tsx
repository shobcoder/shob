import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { Check, FolderOpen, MoreHorizontal, Pencil, Pin, Plus, Search, Settings, SquarePen, X, Home } from "lucide-solid"
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  closestCenter,
  createSortable,
  maybeTransformStyle,
  useDragDropContext,
  useSortableContext,
} from "@thisbeyond/solid-dnd"
import { nativeApi } from "../services/native"
import { MacSidebarHeader } from "./mac-chrome"
import { useStore } from "../store"
import type { Project } from "../types"
import { ResizeHandle } from "@/shob-ported/resize-handle"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import type { Session as ShobSession, SessionStatus } from "@shob-ai/sdk/v2/client"
import { showToast } from "@shob-ai/ui/toast"
import { DotsSpinner } from "./DotsSpinner"
import { useNotification } from "@/context/notification"
import { usePermission } from "@/context/permission"
import { sessionPermissionRequest } from "@/shob-ported/composer/session-request-tree"
import { findReusableEmptyRootShobSession, sortShobSessionsById } from "@/utils/shob-session"
import { formatServerError } from "@/utils/server-errors"
import { removePersistedSessionState } from "@/utils/session-persisted-state"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConstrainDragXAxis as ConstrainProjectDragToYAxis } from "@/utils/solid-dnd"

const folderNameFromPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

const formatSessionAge = (createdAt: number | null | undefined, now: number) => {
  if (!createdAt || !Number.isFinite(createdAt)) return ""
  const mins = Math.floor((now - createdAt) / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

type SidebarSessionHit = {
  project: Project
  session: Project["sessions"][number]
}

type SidebarSearchResult =
  | { type: "project"; project: Project }
  | { type: "session"; project: Project; session: Project["sessions"][number] }

const latestSessionTime = (session: Project["sessions"][number]) => session.lastActiveAt ?? session.createdAt ?? 0
const PROJECT_SESSION_PREVIEW_LIMIT = 5
const DEFAULT_SIDEBAR_WIDTH = 314
const MIN_SIDEBAR_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 460

const areSameProjectOrder = (left: string[], right: string[]) =>
  left.length === right.length && left.every((projectId, index) => projectId === right[index])

const clampSidebarWidth = (width: number) => Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width))

const SidebarSectionTitle = (props: { children: string }) => (
  <div class="shob-sidebar-section-label px-3 pb-2 pt-4 text-[13px] font-normal leading-4 text-text-weaker">
    {props.children}
  </div>
)

const SidebarSectionHeader = (props: {
  children: string
  action?: {
    label: string
    title?: string
    icon: any
    onClick: () => void
  }
}) => {
  const Icon = props.action?.icon

  return (
    <div class="flex items-center justify-between gap-2 px-3 pb-2 pt-4">
      <div class="shob-sidebar-section-label min-w-0 truncate text-[13px] font-normal leading-4 text-text-weaker">
        {props.children}
      </div>
      <Show when={props.action && Icon}>
        <button
          type="button"
          aria-label={props.action!.label}
          title={props.action!.title ?? props.action!.label}
          class="flex size-5 shrink-0 items-center justify-center rounded-[4px] text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
          onClick={props.action!.onClick}
        >
          <Icon size={14} />
        </button>
      </Show>
    </div>
  )
}

const SidebarProjectsEmptyAction = (props: { onAddProject: () => void }) => (
  <div class="flex min-h-0 flex-1 items-center justify-center px-2 py-8">
    <button
      type="button"
      aria-label="Add new project"
      class="group flex min-w-0 flex-col items-center gap-3 text-center"
      onClick={props.onAddProject}
    >
      <span class="max-w-full truncate text-[13px] font-medium leading-4 text-text-base transition-colors group-hover:text-text-strong">
        Add new project
      </span>
      <span class="glass-button flex size-10 items-center justify-center rounded-[8px] border-border-weak-base bg-surface-raised-base/35 text-text-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_18px_rgba(0,0,0,0.22)] backdrop-blur">
        <Plus size={18} strokeWidth={1.85} />
      </span>
    </button>
  </div>
)

const SidebarActionButton = (props: {
  label: string
  title?: string
  active?: boolean
  mobileDot?: boolean
  shortcut?: string
  icon: any
  onClick: () => void
}) => {
  const Icon = props.icon

  return (
    <button
      type="button"
      aria-label={props.label}
      class={`group/action shob-sidebar-action grid h-8 w-full min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-[5px] border border-transparent px-2.5 text-left text-[13px] leading-4 transition-colors ${
        props.active
          ? "border-border-weak-base bg-surface-raised-base text-text-strong"
          : "text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong"
      }`}
      title={props.title ?? props.label}
      onClick={props.onClick}
    >
      <span class="relative flex size-4 items-center justify-center text-text-weak group-hover/action:text-text-strong">
        <Icon size={14} strokeWidth={1.8} />
        <Show when={props.mobileDot}>
          <span class="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-text-interactive-base ring-2 ring-background-stronger" />
        </Show>
      </span>
      <span class="shob-sidebar-main-label min-w-0 truncate font-normal text-current">{props.label}</span>
      <Show when={props.shortcut}>
        <span class="shob-sidebar-shortcut rounded-full bg-surface-raised-base px-1.5 py-0.5 font-mono text-[11px] leading-3 text-text-weaker">
          {props.shortcut}
        </span>
      </Show>
    </button>
  )
}

const PinnedSessionRow = (props: {
  hit: SidebarSessionHit
  activeSessionId: string | null
  now: number
  onSelect: (projectId: string, sessionId: string) => void
}) => {
  const globalSync = useGlobalSync()
  const notification = useNotification()
  const permission = usePermission()
  const projectStore = createMemo(() => globalSync.child(props.hit.project.path)[0])

  const isWorking = () => {
    const status = (projectStore().session_status as Record<string, { type?: string } | undefined>)[props.hit.session.id]
    return status?.type && status.type !== "idle"
  }
  const hasPermissions = () =>
    !!sessionPermissionRequest(
      projectStore().session,
      projectStore().permission,
      props.hit.session.id,
      (item) => !permission.autoResponds(item, props.hit.project.path),
    )
  const hasError = () => notification.session.unseenHasError(props.hit.session.id)

  return (
    <button
      type="button"
      class={`group/pinned grid h-8 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[5px] px-3 text-left transition-colors border ${
        props.activeSessionId === props.hit.session.id
          ? "bg-surface-raised-strong text-text-strong border-border/70 shadow-sm"
          : "text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong border-transparent"
      }`}
      title={`${props.hit.session.name} · ${props.hit.project.name}`}
      onClick={() => props.onSelect(props.hit.project.id, props.hit.session.id)}
    >
      <span class={`shob-sidebar-main-label min-w-0 truncate text-[13px] font-normal leading-4 ${isWorking() ? "shob-session-shimmer" : ""}`}>{props.hit.session.name}</span>
      <span class="flex min-w-7 items-center justify-end">
        <Switch
          fallback={
            <span class="shob-sidebar-meta text-[12px] font-normal leading-5 text-text-weak">
              {formatSessionAge(latestSessionTime(props.hit.session), props.now)}
            </span>
          }
        >
          <Match when={isWorking()}>
            <span class="flex h-5 w-5 items-center justify-center" title="Working">
              <DotsSpinner class="font-mono text-[13px] leading-none text-icon-interactive-base" />
            </span>
          </Match>
          <Match when={hasPermissions()}>
            <span class="size-2 rounded-full bg-surface-warning-strong" title="Permission pending" />
          </Match>
          <Match when={hasError()}>
            <span class="size-2 rounded-full bg-text-diff-delete-base" title="Error" />
          </Match>
        </Switch>
      </span>
    </button>
  )
}

function SidebarSearchModal(props: {
  open: boolean
  query: string
  results: SidebarSearchResult[]
  onQueryChange: (value: string) => void
  onClose: () => void
  onSelectProject: (projectId: string) => void
  onSelectSession: (projectId: string, sessionId: string) => void
}) {
  let inputRef: HTMLInputElement | undefined

  createEffect(() => {
    if (!props.open) return
    window.setTimeout(() => inputRef?.focus(), 30)
  })

  return (
    <Dialog open={props.open} onOpenChange={(open: boolean) => !open && props.onClose()}>
      <DialogHeader class="sr-only">
        <DialogTitle>Search sidebar</DialogTitle>
        <DialogDescription>Search projects and chats.</DialogDescription>
      </DialogHeader>
      <DialogContent
        class="top-[12vh] max-w-[560px] translate-y-0 gap-0 overflow-hidden rounded-lg border border-border-weak-base bg-surface-raised-base p-0 shadow-2xl sm:max-w-[560px]"
        showCloseButton={false}
      >
        <div class="border-b border-border-weak-base px-4 py-3">
          <div class="flex items-center gap-2">
            <Search size={16} class="shrink-0 text-text-weak" />
            <input
              ref={inputRef}
              value={props.query}
              placeholder="Search projects and chats..."
              class="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-text-strong outline-none placeholder:text-text-weaker"
              onInput={(e) => props.onQueryChange(e.currentTarget.value)}
            />
            <button
              type="button"
              class="flex size-7 shrink-0 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
              aria-label="Close search"
              onClick={props.onClose}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div class="max-h-[420px] overflow-y-auto p-2">
          <Show
            when={props.results.length > 0}
            fallback={
              <div class="px-3 py-8 text-center text-[13px] text-text-weak">
                {props.query.trim() ? "No results found." : "Type to search across projects and chats."}
              </div>
            }
          >
            <For each={props.results}>
              {(result) => (
                <button
                  type="button"
                  class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-raised-base-hover"
                  onClick={() => {
                    if (result.type === "project") props.onSelectProject(result.project.id)
                    else props.onSelectSession(result.project.id, result.session.id)
                    props.onClose()
                  }}
                >
                  <span class="flex size-7 items-center justify-center rounded-md bg-background-stronger text-text-weak">
                    {result.type === "project" ? <ProjectFolderIcon /> : <SquarePen size={14} />}
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-[13px] font-medium text-text-strong">
                      {result.type === "project" ? result.project.name : result.session.name}
                    </span>
                    <span class="block truncate text-[12px] text-text-weak">
                      {result.type === "project" ? result.project.path : result.project.name}
                    </span>
                  </span>
                  <span class="rounded border border-border-weak-base px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-weaker">
                    {result.type === "project" ? "Project" : "Chat"}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FolderSection(props: {
  project: Project
  currentProjectId: string | null
  activeSessionId: string | null
  onSelectSession: (projectId: string, sessionId: string) => void
  onCreateSession: (projectId: string) => void
  onDeleteSession: (projectId: string, sessionId: string) => void
  onDeleteProject: (projectId: string) => void
  onSyncShobSessions: (projectId: string, sessions: ShobSession[]) => void
  onRenameSession: (projectId: string, sessionId: string, newName: string) => void
  onRenameProject: (projectId: string, name: string) => void | Promise<void>
  onToggleProjectPin: (projectId: string) => void | Promise<void>
  isOpen: boolean
  onToggleProjectOpen: (projectId: string) => void
  showAllSessions: boolean
  onToggleShowAllSessions: (projectId: string) => void
  hidePinnedSessions?: boolean
}) {
  const globalSync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const notification = useNotification()
  const permission = usePermission()

  const [projectMenuOpen, setProjectMenuOpen] = createSignal(false)
  const [renameProjectOpen, setRenameProjectOpen] = createSignal(false)
  const [renameProjectValue, setRenameProjectValue] = createSignal(props.project.name)
  const [renameProjectSaving, setRenameProjectSaving] = createSignal(false)
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = createSignal<string | null>(null)
  const projectStore = createMemo(() => globalSync.child(props.project.path)[0])
  const shobSessions = createMemo(() => projectStore().session)
  const sortable = createSortable(props.project.id)

  // Periodic sortNow signal to dynamically recalculate session ages and keep sorting stable/reactive.
  const [sortNow, setSortNow] = createSignal(Date.now())
  let sortNowInterval: number | undefined
  const sortNowTimeout = setTimeout(
    () => {
      setSortNow(Date.now())
      sortNowInterval = window.setInterval(() => setSortNow(Date.now()), 60_000)
    },
    60_000 - (Date.now() % 60_000),
  )

  onCleanup(() => {
    clearTimeout(sortNowTimeout)
    if (sortNowInterval) clearInterval(sortNowInterval)
  })

  // Search filter and Inline editing signals
  const [searchQuery, setSearchQuery] = createSignal("")
  const [editingSessionId, setEditingSessionId] = createSignal<string | null>(null)
  const [editSessionValue, setEditSessionValue] = createSignal("")

  const sortedSessions = createMemo(() => {
    const now = sortNow()
    const oneMinuteAgo = now - 60000
    const query = searchQuery().toLowerCase().trim()
    let filtered = props.hidePinnedSessions
      ? props.project.sessions.filter((session) => !session.pinned)
      : [...props.project.sessions]
    if (query) {
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(query))
    }
    return filtered.sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
      const leftUpdated = left.lastActiveAt ?? left.createdAt ?? 0
      const rightUpdated = right.lastActiveAt ?? right.createdAt ?? 0
      const leftRecent = leftUpdated > oneMinuteAgo
      const rightRecent = rightUpdated > oneMinuteAgo
      if (leftRecent && rightRecent) return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      if (leftRecent && !rightRecent) return -1
      if (!leftRecent && rightRecent) return 1
      return rightUpdated - leftUpdated
    })
  })

  const sessionsByParent = createMemo(() => {
    const map = new Map<string, Project["sessions"]>()
    const ROOT = "__root__"
    const ids = new Set(sortedSessions().map((session) => session.id))
    for (const session of sortedSessions()) {
      const parent = session.parentSessionId && ids.has(session.parentSessionId) ? session.parentSessionId : ROOT
      const list = map.get(parent) ?? []
      list.push(session)
      map.set(parent, list)
    }
    return { map, ROOT }
  })

  const isSessionWorking = (sessionId: string) => {
    const status = (projectStore().session_status as Record<string, { type?: string } | undefined>)[sessionId]
    return status?.type && status.type !== "idle"
  }

  const sessionHasPermissions = (sessionId: string) => {
    return !!sessionPermissionRequest(
      projectStore().session,
      projectStore().permission,
      sessionId,
      (item) => !permission.autoResponds(item, props.project.path)
    )
  }

  const sessionHasError = (sessionId: string) => {
    return notification.session.unseenHasError(sessionId)
  }

  const handleRenameSession = async (sessionId: string, newName: string) => {
    const trimmed = newName.trim()
    if (trimmed) {
      props.onRenameSession(props.project.id, sessionId, trimmed)
      if (sessionId.startsWith("ses")) {
        await globalSDK
          .createClient({ directory: props.project.path, throwOnError: true })
          .session.update({ sessionID: sessionId, title: trimmed })
          .catch(() => undefined)
        void globalSync.project.loadSessions(props.project.path)
      }
    }
    setEditingSessionId(null)
  }

  const handleRequestDeleteSession = (event: MouseEvent, sessionId: string) => {
    event.stopPropagation()
    setConfirmDeleteSessionId(sessionId)
  }

  const handleConfirmDeleteSession = (event: MouseEvent, sessionId: string) => {
    event.stopPropagation()
    setConfirmDeleteSessionId(null)
    props.onDeleteSession(props.project.id, sessionId)
  }

  const handleOpenInExplorer = () => {
    nativeApi.invoke("reveal_in_finder", { path: props.project.path }).catch(() => undefined)
  }

  const handleToggleProjectPin = () => {
    void props.onToggleProjectPin(props.project.id)
  }

  const renameProjectValueTrimmed = createMemo(() => renameProjectValue().trim())
  const canRenameProject = createMemo(() => {
    const next = renameProjectValueTrimmed()
    return next.length > 0 && next !== props.project.name
  })

  const openRenameProjectDialog = () => {
    setRenameProjectValue(props.project.name)
    setProjectMenuOpen(false)
    window.setTimeout(() => setRenameProjectOpen(true), 20)
  }

  const submitRenameProject = async () => {
    const trimmed = renameProjectValueTrimmed()
    if (!trimmed || trimmed === props.project.name || renameProjectSaving()) return

    setRenameProjectSaving(true)
    try {
      await props.onRenameProject(props.project.id, trimmed)
      setRenameProjectOpen(false)
    } finally {
      setRenameProjectSaving(false)
    }
  }

  const handleToggleProjectOpen = () => {
    props.onToggleProjectOpen(props.project.id)
  }

  const handleProjectTitlePointerDown = (event: PointerEvent) => {
    sortable.dragActivators.onpointerdown?.(event)
  }

  const runProjectMenuAction = (event: MouseEvent, action: () => void) => {
    event.preventDefault()
    event.stopPropagation()
    setProjectMenuOpen(false)
    window.setTimeout(action, 0)
  }

  const sessionTree = (sessionId: string) => sessionsByParent().map.get(sessionId) ?? []
  const rootSessions = createMemo(() => sessionsByParent().map.get(sessionsByParent().ROOT) ?? [])
  const visibleRootSessions = createMemo(() =>
    props.showAllSessions ? rootSessions() : rootSessions().slice(0, PROJECT_SESSION_PREVIEW_LIMIT),
  )
  const hiddenRootSessionCount = createMemo(() => Math.max(0, rootSessions().length - PROJECT_SESSION_PREVIEW_LIMIT))

  createEffect(() => {
    const confirming = confirmDeleteSessionId()
    if (confirming && !props.project.sessions.some((session) => session.id === confirming)) {
      setConfirmDeleteSessionId(null)
    }
  })

  const renderSessionMeta = (session: Project["sessions"][number]) => (
    <Switch
      fallback={
        <span class="shob-sidebar-meta text-[12px] font-normal leading-5 text-text-weak">
          {formatSessionAge(session.lastActiveAt ?? session.createdAt, sortNow())}
        </span>
      }
    >
      <Match when={isSessionWorking(session.id)}>
        <span class="flex h-5 w-5 items-center justify-center" title="Working">
          <DotsSpinner class="font-mono text-[13px] leading-none text-icon-interactive-base" />
        </span>
      </Match>
      <Match when={sessionHasPermissions(session.id)}>
        <span class="size-2 rounded-full bg-surface-warning-strong" title="Permission pending" />
      </Match>
      <Match when={sessionHasError(session.id)}>
        <span class="size-2 rounded-full bg-text-diff-delete-base" title="Error" />
      </Match>
    </Switch>
  )

  // starts at `34 + level*22`px; each guide "spine" aligns perfectly with the left edge of the parent text.
  const GUIDE_SPINE = (level: number) => 12 + level * 22

  const renderSessionNode = (
    session: Project["sessions"][number],
    level = 0,
    ancestorHasNext: boolean[] = [],
    hasNextSibling = false,
  ) => (
    <>
      <div
        class={`group/session relative flex h-8 cursor-pointer items-center justify-between rounded-[5px] pr-3 transition-colors border ${
          props.activeSessionId === session.id
            ? "bg-surface-raised-strong text-text-strong border-border/70 shadow-sm"
            : "text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong border-transparent"
        }`}
        style={{ "padding-left": `${34 + level * 22}px` }}
        onClick={() => {
          setConfirmDeleteSessionId(null)
          props.onSelectSession(props.project.id, session.id)
        }}
      >
        <Show when={level > 0}>
          {/* Continuing vertical lines for ancestors that still have siblings below. */}
          {ancestorHasNext.map((continues, index) =>
            continues ? (
              <span
                class="pointer-events-none absolute w-px bg-text-weaker opacity-40"
                style={{ left: `${GUIDE_SPINE(index + 1)}px`, top: "-2px", height: "36px" }}
                aria-hidden="true"
              />
            ) : null,
          )}
          {/* Vertical drop for the current node. 
              If hasNextSibling, it goes all the way through to bridge to the next sibling. 
              If not, it stops exactly where the curve starts. */}
          <span
            class="pointer-events-none absolute w-px bg-text-weaker opacity-40"
            style={{ 
              left: `${GUIDE_SPINE(level)}px`, 
              top: "-2px", 
              height: hasNextSibling ? "36px" : "8px"
            }}
            aria-hidden="true"
          />
          {/* Beautiful sweeping curve for every item, creating a smooth branch effect */}
          <span
            class="pointer-events-none absolute border-l border-b border-text-weaker opacity-40 rounded-bl-[10px]"
            style={{ left: `${GUIDE_SPINE(level)}px`, top: "6px", height: "11px", width: "16px" }}
            aria-hidden="true"
          />
        </Show>
        <div class="min-w-0 flex flex-1 items-center">
          <Show
            when={editingSessionId() === session.id}
            fallback={
              <span
                class={`shob-sidebar-main-label truncate text-[13px] leading-4 ${
                  props.activeSessionId === session.id ? "font-medium text-text-strong" : "font-normal text-text-base group-hover/session:text-text-strong transition-colors"
                } ${isSessionWorking(session.id) ? "shob-session-shimmer" : ""}`}
                onDblClick={(e) => {
                  e.stopPropagation()
                  setConfirmDeleteSessionId(null)
                  setEditingSessionId(session.id)
                  setEditSessionValue(session.name)
                }}
                title="Double click to rename"
              >
                <span class="inline-flex min-w-0 items-center gap-1">
                  <span class="truncate">{session.name}</span>
                  <Show when={session.pinned}>
                    <Pin size={11} class="shrink-0 fill-current text-text-weaker" />
                  </Show>
                </span>
              </span>
            }
          >
            <input
              type="text"
              class="min-w-0 flex-1 rounded border border-border-weak-base bg-surface-raised-base px-1 py-0 text-[13px] text-text-strong focus:border-border-weak-hover focus:bg-surface-raised-base-hover focus:outline-none"
              value={editSessionValue()}
              onInput={(e) => setEditSessionValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation()
                  void handleRenameSession(session.id, editSessionValue())
                } else if (e.key === "Escape") {
                  e.stopPropagation()
                  setEditingSessionId(null)
                }
              }}
              onBlur={() => {
                void handleRenameSession(session.id, editSessionValue())
              }}
              onClick={(e) => e.stopPropagation()}
              ref={(el) => setTimeout(() => el?.focus(), 50)}
            />
          </Show>
        </div>

        <div class="relative ml-3 flex h-5 min-w-7 shrink-0 items-center justify-end">
          <Show
            when={confirmDeleteSessionId() === session.id}
            fallback={
              <>
                <button
                  type="button"
                  class="absolute right-0 z-10 rounded-[4px] p-0.5 text-text-weak opacity-0 transition-all duration-150 hover:bg-surface-raised-base-hover hover:text-text-strong group-hover/session:opacity-100"
                  title="Remove session"
                  onClick={(e) => handleRequestDeleteSession(e, session.id)}
                >
                  <SessionDeleteIcon />
                </button>
                <span class="pointer-events-none flex min-w-7 items-center justify-end transition-opacity duration-150 group-hover/session:opacity-0">
                  {renderSessionMeta(session)}
                </span>
              </>
            }
          >
            <button
              type="button"
              class="flex h-5 items-center justify-center rounded-full bg-red-500/20 px-2.5 transition-colors hover:bg-red-500/30"
              title="Confirm remove session"
              onClick={(e) => handleConfirmDeleteSession(e, session.id)}
            >
              <span class="text-[11px] font-medium leading-none text-red-400 whitespace-nowrap">Confirm</span>
            </button>
          </Show>
        </div>
      </div>
      <For each={sessionTree(session.id)}>
        {(child, index) =>
          renderSessionNode(
            child,
            level + 1,
            level === 0 ? [] : [...ancestorHasNext, hasNextSibling],
            index() < sessionTree(session.id).length - 1,
          )
        }
      </For>
    </>
  )

  createEffect(() => {
    void globalSync.project.loadSessions(props.project.path)
  })

  createEffect(() => {
    const sessions = shobSessions()
    if (projectStore().status === "loading" && sessions.length === 0) return
    props.onSyncShobSessions(props.project.id, sessions)
  })

  return (
    <div
      ref={sortable.ref}
      style={maybeTransformStyle(sortable.transform)}
      class={`relative flex flex-col rounded-[6px] transition-[background-color,opacity] duration-150 ${
        sortable.isActiveDraggable ? "z-10 bg-surface-raised-base/45 opacity-75" : ""
      }`}
    >
      <Show when={renameProjectOpen()}>
        <div
          class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`rename-project-title-${props.project.id}`}
          onClick={() => {
            if (!renameProjectSaving()) setRenameProjectOpen(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !renameProjectSaving()) setRenameProjectOpen(false)
          }}
        >
          <form
            class="grid w-full max-w-[420px] gap-0 overflow-hidden rounded-xl border border-border-weak-base bg-surface-raised-base shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              void submitRenameProject()
            }}
          >
            <div class="border-b border-border-weak-base px-4 pt-4 pb-3">
              <div class="flex items-center gap-2">
                <span class="flex size-8 items-center justify-center rounded-md bg-surface-raised-base-hover text-icon-warning-base">
                  <ProjectFolderIcon />
                </span>
                <div class="min-w-0">
                  <h2 id={`rename-project-title-${props.project.id}`} class="text-[15px] font-semibold text-text-strong">
                    Rename project
                  </h2>
                  <p class="truncate text-[12px] text-text-weak">
                    {props.project.path}
                  </p>
                </div>
                <button
                  type="button"
                  class="ml-auto flex size-7 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                  aria-label="Close rename dialog"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!renameProjectSaving()) setRenameProjectOpen(false)
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div class="grid gap-2 px-4 py-4">
              <label class="text-[12px] font-medium text-text-base" for={`rename-project-${props.project.id}`}>
                Project name
              </label>
              <input
                id={`rename-project-${props.project.id}`}
                class="h-9 rounded-md border border-border-weak-base bg-background-stronger px-3 text-[13px] text-text-strong outline-none transition-colors placeholder:text-text-weaker focus:border-border-weak-hover focus:bg-surface-raised-base-hover"
                value={renameProjectValue()}
                placeholder="Project name"
                onInput={(e) => setRenameProjectValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation()
                    if (!renameProjectSaving()) setRenameProjectOpen(false)
                  }
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void submitRenameProject()
                  }
                }}
                ref={(el) =>
                  setTimeout(() => {
                    el.focus()
                    el.select()
                  }, 50)
                }
              />
              <Show when={!renameProjectValueTrimmed()}>
                <div class="text-[12px] text-icon-critical-base">Project name cannot be empty.</div>
              </Show>
              <div class="rounded-md border border-border-weak-base bg-background-stronger px-3 py-2">
                <div class="text-[11px] font-medium uppercase tracking-wide text-text-weaker">Current name</div>
                <div class="mt-1 truncate text-[12px] text-text-base">{props.project.name}</div>
              </div>
            </div>

            <div class="flex justify-end gap-2 border-t border-border-weak-base bg-background-stronger px-4 py-3">
              <button
                type="button"
                class="inline-flex h-8 items-center justify-center rounded-lg border border-border-weak-base bg-background-stronger px-3 text-[13px] font-medium text-text-base transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!renameProjectSaving()) setRenameProjectOpen(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canRenameProject() || renameProjectSaving()}
                class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation()
                  void submitRenameProject()
                }}
              >
                <Check size={14} />
                {renameProjectSaving() ? "Saving..." : "Save name"}
              </button>
            </div>
          </form>
        </div>
      </Show>

      <div
        class={`group/project flex h-8 items-center justify-between rounded-[5px] pr-1 transition-colors ${
          props.currentProjectId === props.project.id
            ? "bg-surface-raised-base/65 text-text-strong"
            : "text-text-base hover:bg-surface-raised-base-hover"
        }`}
        title={props.isOpen ? "Collapse project" : "Expand project"}
      >
        <button
          type="button"
          class="flex h-full min-w-0 flex-1 cursor-default touch-none items-center gap-2 rounded-[5px] pl-3 pr-2 text-left text-text-weak select-none"
          aria-expanded={props.isOpen}
          aria-label={`${props.isOpen ? "Collapse" : "Expand"} ${props.project.name}`}
          onPointerDown={handleProjectTitlePointerDown}
          onClick={handleToggleProjectOpen}
        >
          <span class={`transition-colors ${
            props.currentProjectId === props.project.id
              ? "text-primary"
              : "text-text-weak group-hover/project:text-text-strong"
          }`}>
            <ProjectFolderIcon />
          </span>
          <span class={`shob-sidebar-main-label truncate text-[13px] leading-4 transition-colors ${
            props.currentProjectId === props.project.id
              ? "font-semibold text-text-strong"
              : "font-normal text-text-base group-hover/project:text-text-strong"
          }`}>
            {props.project.name}
          </span>
          <Show when={props.project.pinned}>
            <Pin size={12} class="shrink-0 fill-current text-text-weaker" />
          </Show>
        </button>

        <div class="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/project:opacity-100">
          <DropdownMenu open={projectMenuOpen()} onOpenChange={setProjectMenuOpen} placement="bottom-end" gutter={4}>
            <DropdownMenuTrigger
              class="rounded-[4px] p-1 text-text-strong transition-colors hover:bg-surface-raised-base-hover data-expanded:bg-surface-raised-base-hover"
              onPointerDown={(e) => {
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
              }}
              title="Project actions"
            >
              <MoreHorizontal size={14} />
            </DropdownMenuTrigger>

            <DropdownMenuContent class="w-[236px] rounded-lg border border-border-weak-base bg-surface-raised-base/95 p-1.5 text-[13px] shadow-2xl backdrop-blur">
              <DropdownMenuItem
                class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                onClick={(e: MouseEvent) => runProjectMenuAction(e, handleToggleProjectPin)}
              >
                <Pin size={14} class={props.project.pinned ? "fill-current" : ""} />
                {props.project.pinned ? "Unpin project" : "Pin project"}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                onClick={(e: MouseEvent) => runProjectMenuAction(e, handleOpenInExplorer)}
              >
                <FolderOpen size={14} />
                Open in Explorer
              </DropdownMenuItem>
              <DropdownMenuItem
                class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                onClick={(e: MouseEvent) => runProjectMenuAction(e, openRenameProjectDialog)}
              >
                <Pencil size={14} />
                Rename project
              </DropdownMenuItem>
              <DropdownMenuItem
                data-variant="destructive"
                class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-icon-critical-base focus:bg-text-diff-delete-base/10 focus:text-icon-critical-base"
                onClick={(e: MouseEvent) => runProjectMenuAction(e, () => props.onDeleteProject(props.project.id))}
              >
                <X size={14} />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div class="relative flex items-center">
            <button
              class="peer rounded-[4px] p-1 text-text-strong transition-colors hover:bg-surface-raised-base-hover"
              onClick={(e) => {
                e.stopPropagation()
                void props.onCreateSession(props.project.id)
              }}
            >
              <SquarePen size={14} />
            </button>

            <div class="pointer-events-none absolute top-full right-0 z-50 mt-1.5 whitespace-nowrap rounded border border-border-base bg-surface-raised-base px-3 py-1.5 text-[12px] text-text-strong opacity-0 shadow-xl transition-opacity peer-hover:opacity-100">
              Start new chat in {props.project.name}
            </div>
          </div>
        </div>
      </div>

      <div
        class={`grid transition-[grid-template-rows,opacity] duration-150 ease-out ${
          props.isOpen ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!props.isOpen}
      >
        <div class="min-h-0 overflow-hidden">
          <div class="flex flex-col gap-0.5">
          <Show
            when={rootSessions().length > 0}
            fallback={
              <div class="py-2 pl-[34px] text-[12px] font-light italic text-text-weaker select-none">
                No active chats
              </div>
            }
          >
            <For each={visibleRootSessions()}>
              {(session) => renderSessionNode(session, 0)}
            </For>
            <Show when={hiddenRootSessionCount() > 0}>
              <button
                type="button"
                class="shob-sidebar-main-label h-8 rounded-[5px] pl-[34px] pr-3 text-left text-[13px] font-normal text-text-weaker transition-colors hover:bg-surface-raised-base-hover hover:text-text-base"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onToggleShowAllSessions(props.project.id)
                }}
              >
                {props.showAllSessions ? "Show less" : "Show more"}
              </button>
            </Show>
          </Show>
          </div>
        </div>
      </div>
    </div>
  )
}

type SortableProjectGroupProps = {
  projects: Project[]
  currentProjectId: string | null
  activeSessionId: string | null
  onSelectSession: (projectId: string, sessionId: string) => void
  onCreateSession: (projectId: string) => void
  onDeleteSession: (projectId: string, sessionId: string) => void
  onDeleteProject: (projectId: string) => void
  onSyncShobSessions: (projectId: string, sessions: ShobSession[]) => void
  onRenameSession: (projectId: string, sessionId: string, newName: string) => void
  onRenameProject: (projectId: string, name: string) => void | Promise<void>
  onToggleProjectPin: (projectId: string) => void | Promise<void>
  isProjectOpen: (projectId: string) => boolean
  onToggleProjectOpen: (projectId: string) => void
  showsAllSessions: (projectId: string) => boolean
  onToggleShowAllSessions: (projectId: string) => void
  onReorderProjects: (groupProjectIds: string[], reorderedGroupIds: string[]) => void
}

type SortableProjectItemsProps = Omit<SortableProjectGroupProps, "onReorderProjects"> & {
  projectIds: string[]
  onSortedProjectIdsChange: (projectIds: string[]) => void
}

function SortableProjectItems(props: SortableProjectItemsProps) {
  const dragDropContext = useDragDropContext()
  const sortableContext = useSortableContext()

  if (!dragDropContext || !sortableContext) return null

  const [dragDropState] = dragDropContext
  const [sortableState] = sortableContext

  createEffect(() => {
    const activeProjectId = dragDropState.active.draggableId
    const currentProjectIds = props.projectIds
    if (!activeProjectId || !currentProjectIds.includes(String(activeProjectId))) return

    const sortedProjectIds = sortableState.sortedIds.map((projectId) => String(projectId))
    if (sortedProjectIds.length !== currentProjectIds.length) return

    props.onSortedProjectIdsChange(sortedProjectIds)
  })

  return (
    <For each={props.projects}>
      {(project) => (
        <FolderSection
          project={project}
          currentProjectId={props.currentProjectId}
          activeSessionId={props.activeSessionId}
          onSelectSession={props.onSelectSession}
          onCreateSession={props.onCreateSession}
          onDeleteSession={props.onDeleteSession}
          onDeleteProject={props.onDeleteProject}
          onSyncShobSessions={props.onSyncShobSessions}
          onRenameSession={props.onRenameSession}
          onRenameProject={props.onRenameProject}
          onToggleProjectPin={props.onToggleProjectPin}
          isOpen={props.isProjectOpen(project.id)}
          onToggleProjectOpen={props.onToggleProjectOpen}
          showAllSessions={props.showsAllSessions(project.id)}
          onToggleShowAllSessions={props.onToggleShowAllSessions}
          hidePinnedSessions
        />
      )}
    </For>
  )
}

function SortableProjectGroup(props: SortableProjectGroupProps) {
  const projectIds = createMemo(() => props.projects.map((project) => project.id))
  const [sortedProjectIds, setSortedProjectIds] = createSignal<string[]>([])

  const handleDragStart = () => {
    setSortedProjectIds(projectIds())
  }

  const handleDragEnd = () => {
    const reorderedGroupIds = sortedProjectIds()
    if (reorderedGroupIds.length > 0) {
      props.onReorderProjects(projectIds(), reorderedGroupIds)
    }
    setSortedProjectIds([])
  }

  return (
    <DragDropProvider collisionDetector={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <ConstrainProjectDragToYAxis />
      <DragDropSensors>
        <SortableProvider ids={projectIds()}>
          <SortableProjectItems
            projects={props.projects}
            projectIds={projectIds()}
            currentProjectId={props.currentProjectId}
            activeSessionId={props.activeSessionId}
            onSelectSession={props.onSelectSession}
            onCreateSession={props.onCreateSession}
            onDeleteSession={props.onDeleteSession}
            onDeleteProject={props.onDeleteProject}
            onSyncShobSessions={props.onSyncShobSessions}
            onRenameSession={props.onRenameSession}
            onRenameProject={props.onRenameProject}
            onToggleProjectPin={props.onToggleProjectPin}
            isProjectOpen={props.isProjectOpen}
            onToggleProjectOpen={props.onToggleProjectOpen}
            showsAllSessions={props.showsAllSessions}
            onToggleShowAllSessions={props.onToggleShowAllSessions}
            onSortedProjectIdsChange={(nextProjectIds) => setSortedProjectIds(nextProjectIds)}
          />
        </SortableProvider>
      </DragDropSensors>
    </DragDropProvider>
  )
}

export function Sidebar(props: {
  onOpenSettingsPage?: () => void
  onOpenWorkspacePage?: () => void
  onOpenHomePage?: () => void
}) {
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const setCurrentProjectId = useStore((s) => s.setCurrentProjectId)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const addProject = useStore((s) => s.addProject)
  const reorderProjects = useStore((s) => s.reorderProjects)
  const removeSession = useStore((s) => s.removeSession)
  const syncShobSessions = useStore((s) => s.syncShobSessions)
  const deleteProject = useStore((s) => s.deleteProject)
  const updateProject = useStore((s) => s.updateProject)
  const renameSession = useStore((s) => s.renameSession)
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const platform = usePlatform()
  const [isSidebarVisible, setIsSidebarVisible] = createSignal(true)
  const [sidebarWidth, setSidebarWidth] = createSignal(DEFAULT_SIDEBAR_WIDTH)
  const [pendingDeleteSessionIDs, setPendingDeleteSessionIDs] = createSignal<Set<string>>(new Set())
  const [searchOpen, setSearchOpen] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [sidebarNow, setSidebarNow] = createSignal(Date.now())
  const [projectOpenById, setProjectOpenById] = createSignal<Record<string, boolean>>({})
  const [showAllSessionsByProjectId, setShowAllSessionsByProjectId] = createSignal<Record<string, boolean>>({})
  let sidebarResizeFrame: number | undefined
  let pendingSidebarWidth: number | undefined

  const allSessionHits = createMemo<SidebarSessionHit[]>(() =>
    projects().flatMap((project) => project.sessions.map((session) => ({ project, session }))),
  )

  const pinnedSessionHits = createMemo(() =>
    allSessionHits()
      .filter((hit) => hit.session.pinned)
      .sort((left, right) => latestSessionTime(right.session) - latestSessionTime(left.session)),
  )
  const pinnedProjects = createMemo(() => projects().filter((project) => project.pinned))
  const unpinnedProjects = createMemo(() => projects().filter((project) => !project.pinned))

  const isProjectOpen = (projectId: string) => projectOpenById()[projectId] ?? true
  const showsAllSessions = (projectId: string) => showAllSessionsByProjectId()[projectId] ?? false

  const handleToggleProjectOpen = (projectId: string) => {
    setProjectOpenById((current) => ({
      ...current,
      [projectId]: !(current[projectId] ?? true),
    }))
  }

  const handleToggleShowAllSessions = (projectId: string) => {
    setShowAllSessionsByProjectId((current) => ({
      ...current,
      [projectId]: !(current[projectId] ?? false),
    }))
  }

  const handleReorderProjects = (groupProjectIds: string[], reorderedGroupIds: string[]) => {
    if (areSameProjectOrder(groupProjectIds, reorderedGroupIds)) return

    const groupIds = new Set(groupProjectIds)
    const reorderedIds = new Set(reorderedGroupIds)
    if (
      groupIds.size !== reorderedIds.size ||
      reorderedGroupIds.length !== groupProjectIds.length ||
      reorderedGroupIds.some((projectId) => !groupIds.has(projectId))
    ) {
      return
    }

    let nextGroupIndex = 0
    const nextProjectIds = projects().map((project) => {
      if (!groupIds.has(project.id)) return project.id
      return reorderedGroupIds[nextGroupIndex++] ?? project.id
    })

    void reorderProjects(nextProjectIds).catch((error) => {
      console.error("Failed to reorder projects:", error)
    })
  }

  const searchResults = createMemo<SidebarSearchResult[]>(() => {
    const query = searchQuery().trim().toLowerCase()
    if (!query) return []

    const projectMatches: SidebarSearchResult[] = projects()
      .filter((project) => `${project.name} ${project.path}`.toLowerCase().includes(query))
      .map((project) => ({ type: "project", project }))

    const sessionMatches: SidebarSearchResult[] = allSessionHits()
      .filter((hit) => `${hit.session.name} ${hit.project.name} ${hit.project.path}`.toLowerCase().includes(query))
      .sort((left, right) => latestSessionTime(right.session) - latestSessionTime(left.session))
      .map((hit) => ({ type: "session", project: hit.project, session: hit.session }))

    return [...projectMatches, ...sessionMatches].slice(0, 80)
  })

  const commitSidebarWidth = () => {
    sidebarResizeFrame = undefined
    if (pendingSidebarWidth === undefined) return
    setSidebarWidth(pendingSidebarWidth)
    pendingSidebarWidth = undefined
  }

  const beginSidebarResize = () => {
    pendingSidebarWidth = undefined
    if (sidebarResizeFrame === undefined) return
    cancelAnimationFrame(sidebarResizeFrame)
    sidebarResizeFrame = undefined
  }

  const scheduleSidebarWidth = (width: number) => {
    pendingSidebarWidth = width
    if (sidebarResizeFrame !== undefined) return
    sidebarResizeFrame = requestAnimationFrame(commitSidebarWidth)
  }

  const resizeSidebar = (clientX: number) => {
    scheduleSidebarWidth(clampSidebarWidth(clientX))
  }

  const endSidebarResize = () => {
    if (sidebarResizeFrame !== undefined) {
      cancelAnimationFrame(sidebarResizeFrame)
      sidebarResizeFrame = undefined
    }
    if (pendingSidebarWidth === undefined) return
    setSidebarWidth(pendingSidebarWidth)
    pendingSidebarWidth = undefined
  }

  createEffect(() => {
    window.dispatchEvent(
      new CustomEvent("gg-sidebar-state", {
        detail: { isSidebarVisible: isSidebarVisible() },
      }),
    )
  })

  // Publish the live sidebar width (0 when collapsed) so the window titlebar can
  // align the agent header items with the left edge of the agent view.
  createEffect(() => {
    const width = isSidebarVisible() ? sidebarWidth() : 0
    document.documentElement.style.setProperty("--shob-sidebar-width", `${width}px`)
  })

  onMount(() => {
    const handleSidebarToggleRequest = () => {
      setIsSidebarVisible((current) => !current)
    }
    const nowInterval = window.setInterval(() => setSidebarNow(Date.now()), 60_000)

    window.addEventListener("gg-toggle-sidebar", handleSidebarToggleRequest)
    onCleanup(() => {
      window.removeEventListener("gg-toggle-sidebar", handleSidebarToggleRequest)
      window.clearInterval(nowInterval)
    })
  })

  onCleanup(() => {
    if (sidebarResizeFrame !== undefined) cancelAnimationFrame(sidebarResizeFrame)
  })

  const handleAddProject = async () => {
    props.onOpenWorkspacePage?.()
    const selected = await nativeApi.open({
      directory: true,
      multiple: false,
      title: "Select Project Folder",
    })
    if (typeof selected !== "string" || !selected) return
    const existing = projects().find((project) => project.path === selected)
    if (existing) {
      setCurrentProject(existing.id)
      return
    }
    const created = await addProject(folderNameFromPath(selected), selected)
    setCurrentProject(created.id)
  }

  const handleCreateSession = async (projectId: string) => {
    props.onOpenWorkspacePage?.()
    setCurrentProjectId(projectId)
    const project = projects().find((item) => item.id === projectId)
    if (!project) return
    const [projectStore, setProjectStore] = globalSync.child(project.path)
    const reusable = findReusableEmptyRootShobSession(projectStore.session, projectStore.message, activeSessionId())
    if (reusable) {
      setProjectStore("message", reusable.id, (messages) => messages ?? [])
      if (!projectStore.session_status[reusable.id]) {
        setProjectStore("session_status", reusable.id, { type: "idle" } as SessionStatus)
      }
      await syncShobSessions(projectId, projectStore.session)
      setActiveSession(reusable.id)
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

    await syncShobSessions(projectId, mergedSessions)
    setActiveSession(created.id)

    void globalSync.project.loadSessions(project.path)
  }

  const handleDeleteSession = async (projectId: string, sessionId: string) => {
    setPendingDeleteSessionIDs((prev) => {
      const next = new Set(prev)
      next.add(sessionId)
      return next
    })

    try {
      const project = projects().find((item) => item.id === projectId)
      if (!project) return

      if (sessionId.startsWith("ses")) {
        try {
          await globalSDK.createClient({ directory: project.path, throwOnError: true }).session.delete({ sessionID: sessionId })
        } catch (error) {
          showToast({
            variant: "error",
            title: language.t("session.delete.failed.title"),
            description: formatServerError(error, language.t),
          })
          return
        }
      }

      await removeSession(projectId, sessionId)
      removePersistedSessionState({ directory: project.path, sessionId, platform })

      if (sessionId.startsWith("ses")) {
        // Wait for refreshed remote sessions before clearing pending-delete
        // so this item cannot flicker back during sync.
        await globalSync.project.loadSessions(project.path)
      }
    } finally {
      setPendingDeleteSessionIDs((prev) => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    }
  }

  const handleSyncShobSessions = (projectId: string, sessions: ShobSession[]) => {
    const pendingDelete = pendingDeleteSessionIDs()
    const filtered = pendingDelete.size > 0 ? sessions.filter((s) => !pendingDelete.has(s.id)) : sessions
    void syncShobSessions(projectId, filtered)
  }

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId)
  }

  const handleRenameProject = async (projectId: string, name: string) => {
    await updateProject(projectId, { name })
  }

  const handleToggleProjectPin = async (projectId: string) => {
    const project = projects().find((item) => item.id === projectId)
    if (!project) return
    await updateProject(projectId, { pinned: !project.pinned })
  }

  const handleSelectSession = (projectId: string, sessionId: string) => {
    props.onOpenWorkspacePage?.()
    setCurrentProject(projectId)
    setActiveSession(sessionId)
  }

  const handleCreateNewChat = () => {
    const projectId = currentProjectId() ?? projects()[0]?.id
    if (!projectId) {
      void handleAddProject()
      return
    }
    void handleCreateSession(projectId)
  }

  onMount(() => {
    const handleCreateSessionRequest = () => {
      handleCreateNewChat()
    }

    window.addEventListener("gg-create-session", handleCreateSessionRequest)
    onCleanup(() => {
      window.removeEventListener("gg-create-session", handleCreateSessionRequest)
    })
  })

  const handleSelectProjectOnly = (projectId: string) => {
    props.onOpenWorkspacePage?.()
    setCurrentProject(projectId)
  }

  const handleOpenSettings = () => {
    props.onOpenSettingsPage?.()
  }

  return (
    <aside
      class={`relative h-full min-h-0 max-h-full shrink-0 overflow-hidden ${
        isSidebarVisible() ? "border-r border-border-weak-base" : "w-0 border-r-0"
      }`}
      style={isSidebarVisible() ? { width: `${sidebarWidth()}px` } : undefined}
    >
      <Show when={isSidebarVisible()}>
        <SidebarSearchModal
          open={searchOpen()}
          query={searchQuery()}
          results={searchResults()}
          onQueryChange={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onSelectProject={handleSelectProjectOnly}
          onSelectSession={handleSelectSession}
        />
        <ResizeHandle
          edge="end"
          onResize={resizeSidebar}
          onResizeStart={beginSidebarResize}
          onResizeEnd={endSidebarResize}
        />
        <div class="shob-sidebar relative flex h-full min-h-0 max-h-full flex-col overflow-hidden bg-background-stronger text-text-base select-none">
          <MacSidebarHeader />
          <div class="sticky top-0 z-20 shrink-0 bg-background-stronger/95 px-1.5 pb-3 pt-2 backdrop-blur">
            <nav class="flex flex-col gap-0.5">
              <SidebarActionButton
                label="Home"
                title="Go to home"
                icon={Home}
                onClick={() => props.onOpenHomePage?.()}
              />
              <SidebarActionButton
                label="New session"
                title="Start a new session"
                icon={SquarePen}
                onClick={handleCreateNewChat}
              />
              <SidebarActionButton
                label="Search"
                title="Search projects and chats"
                icon={Search}
                onClick={() => setSearchOpen(true)}
              />
              <SidebarActionButton
                label="Settings"
                title="Open settings"
                icon={Settings}
                onClick={handleOpenSettings}
              />
            </nav>
          </div>

          <div class="shob-sidebar-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-scroll">
            <div class="flex min-h-full flex-col gap-0.5 px-1.5 pb-4 pt-1">
              <Show when={pinnedSessionHits().length > 0}>
                <div class="mb-2">
                  <SidebarSectionTitle>Pinned</SidebarSectionTitle>
                  <div class="flex flex-col gap-0.5">
                    <For each={pinnedSessionHits()}>
                      {(hit) => (
                        <PinnedSessionRow
                          hit={hit}
                          activeSessionId={activeSessionId()}
                          now={sidebarNow()}
                          onSelect={handleSelectSession}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <SidebarSectionHeader
                action={{
                  label: "Add project",
                  title: "Add new project",
                  icon: Plus,
                  onClick: () => void handleAddProject(),
                }}
              >
                Projects
              </SidebarSectionHeader>
              <Show
                when={projects().length > 0}
                fallback={
                  <SidebarProjectsEmptyAction onAddProject={() => void handleAddProject()} />
                }
              >
                <div class="flex flex-col gap-2">
                  <SortableProjectGroup
                    projects={pinnedProjects()}
                    currentProjectId={currentProjectId()}
                    activeSessionId={activeSessionId()}
                    onSelectSession={handleSelectSession}
                    onCreateSession={handleCreateSession}
                    onDeleteSession={handleDeleteSession}
                    onDeleteProject={handleDeleteProject}
                    onSyncShobSessions={handleSyncShobSessions}
                    onRenameSession={renameSession}
                    onRenameProject={handleRenameProject}
                    onToggleProjectPin={handleToggleProjectPin}
                    isProjectOpen={isProjectOpen}
                    onToggleProjectOpen={handleToggleProjectOpen}
                    showsAllSessions={showsAllSessions}
                    onToggleShowAllSessions={handleToggleShowAllSessions}
                    onReorderProjects={handleReorderProjects}
                  />
                  <SortableProjectGroup
                    projects={unpinnedProjects()}
                    currentProjectId={currentProjectId()}
                    activeSessionId={activeSessionId()}
                    onSelectSession={handleSelectSession}
                    onCreateSession={handleCreateSession}
                    onDeleteSession={handleDeleteSession}
                    onDeleteProject={handleDeleteProject}
                    onSyncShobSessions={handleSyncShobSessions}
                    onRenameSession={renameSession}
                    onRenameProject={handleRenameProject}
                    onToggleProjectPin={handleToggleProjectPin}
                    isProjectOpen={isProjectOpen}
                    onToggleProjectOpen={handleToggleProjectOpen}
                    showsAllSessions={showsAllSessions}
                    onToggleShowAllSessions={handleToggleShowAllSessions}
                    onReorderProjects={handleReorderProjects}
                  />
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </aside>
  )
}

  const SessionDeleteIcon = () => (
    <svg viewBox="0 0 20 20" class="size-[14px]" aria-hidden="true" fill="currentColor">
      <path d="M16.8747 6.24935H17.3747V5.74935H16.8747V6.24935ZM16.8747 16.8743V17.3743H17.3747V16.8743H16.8747ZM3.12467 16.8743H2.62467V17.3743H3.12467V16.8743ZM3.12467 6.24935V5.74935H2.62467V6.24935H3.12467ZM2.08301 2.91602V2.41602H1.58301V2.91602H2.08301ZM17.9163 2.91602H18.4163V2.41602H17.9163V2.91602ZM17.9163 6.24935V6.74935H18.4163V6.24935H17.9163ZM2.08301 6.24935H1.58301V6.74935H2.08301V6.24935ZM8.33301 9.08268H7.83301V10.0827H8.33301V9.58268V9.08268ZM11.6663 10.0827H12.1663V9.08268H11.6663V9.58268V10.0827ZM16.8747 6.24935H16.3747V16.8743H16.8747H17.3747V6.24935H16.8747ZM16.8747 16.8743V16.3743H3.12467V16.8743V17.3743H16.8747V16.8743ZM3.12467 16.8743H3.62467V6.24935H3.12467H2.62467V16.8743H3.12467ZM3.12467 6.24935V6.74935H16.8747V6.24935V5.74935H3.12467V6.24935ZM2.08301 2.91602V3.41602H17.9163V2.91602V2.41602H2.08301V2.91602ZM17.9163 2.91602H17.4163V6.24935H17.9163H18.4163V2.91602H17.9163ZM17.9163 6.24935V5.74935H2.08301V6.24935V6.74935H17.9163V6.24935ZM2.08301 6.24935H2.58301V2.91602H2.08301H1.58301V6.24935H2.08301ZM8.33301 9.58268V10.0827H11.6663V9.58268V9.08268H8.33301V9.58268Z" />
    </svg>
  )
  const ProjectFolderIcon = () => (
    <svg viewBox="0 0 24 24" class="size-[14px]" aria-hidden="true" fill="none">
      <path
        d="M13 7L11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
