import { createEffect, createMemo, createSignal, ErrorBoundary, For, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { PromptInput } from "../shob-ported/prompt-input"
import { sendFollowupDraft, type FollowupDraft } from "@/shob-ported/prompt-input/submit"
import { MockSessionProviders } from "../shob-ported/mock-session-layout"
import { useSync } from "@/context/sync"
import { useGlobalSync } from "@/context/global-sync"
import { useNavigate, useParams } from "@solidjs/router"
import { AssistantParts, Message } from "@opencode-ai/ui/message-part"
import { DataProvider, FileComponentProvider } from "@opencode-ai/ui/context"
import { AppIcon } from "@opencode-ai/ui/app-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { sessionTitle } from "@/utils/session-title"
import { createSessionComposerState } from "@/shob-ported/composer/session-composer-state"
import { SessionQuestionDock } from "@/shob-ported/composer/session-question-dock"
import { SessionPermissionDock } from "@/shob-ported/composer/session-permission-dock"
import { SessionTodoDock } from "@/shob-ported/composer/session-todo-dock"
import { useLanguage } from "@/context/language"
import { File as ShobFile } from "@opencode-ai/ui/file"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import type { EventSessionError, Message as ChatMessage, Part, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { TextField } from "@opencode-ai/ui/text-field"
import { Button } from "@opencode-ai/ui/button"
import { formatError } from "@/pages/error"
import { useStore } from "../store"
import { nativeApi } from "@/services/native"
import { useSettings } from "@/context/settings"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"
import { Card, CardDescription, CardTitle } from "@opencode-ai/ui/card"
import { SessionRetry } from "@opencode-ai/ui/session-retry"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { formatServerError } from "@/utils/server-errors"
import { Check, ChevronDown, Copy, MoreHorizontal, Pencil, Pin, RefreshCw, TriangleAlert, X } from "lucide-solid"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContextMetrics, type Context as SessionContextMetricsContext } from "@/components/session/session-context-metrics"
import { AGENT_REVIEW_OPEN_EVENT, createAgentTurnDiffSummary } from "@/components/agent-turn-diff-summary"


interface AgentViewProps {
  sessionId: string
  projectPath?: string
}

type OpenWithTarget = "vscode" | "explorer" | "terminal" | "git-bash" | "wsl"
type OpenWithAppIcon = "vscode" | "file-explorer" | "terminal"

const openWithOptions: Array<{
  id: OpenWithTarget
  label: string
  icon?: OpenWithAppIcon
  badge?: string
  badgeClass?: string
}> = [
  { id: "vscode", label: "VS Code", icon: "vscode" },
  { id: "explorer", label: "File Explorer", icon: "file-explorer" },
  { id: "terminal", label: "Terminal", icon: "terminal" },
  { id: "git-bash", label: "Git Bash", badge: "GB", badgeClass: "bg-surface-success-weak text-text-on-success-base" },
  { id: "wsl", label: "WSL", badge: "WSL", badgeClass: "bg-surface-info-weak text-text-on-info-base" },
]

const unknownNativeCommand = (error: unknown) => String(error instanceof Error ? error.message : error).includes("Unknown IPC command")

const vscodeProjectUri = (projectPath: string) => `vscode://file/${encodeURI(projectPath.replace(/\\/g, "/"))}`

const basename = (path?: string | null) => {
  if (!path) return "No project"
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

const formatCompactNumber = (value: number | null | undefined) => {
  if (value === undefined || value === null) return "\u2014"
  return value.toLocaleString()
}

const formatDiffStat = (value: number) => value.toLocaleString()

const messageSummaryDiffs = (message: ChatMessage) =>
  (message as { summary?: { diffs?: unknown } }).summary?.diffs

const messageTextAsMarkdown = (message: ChatMessage, parts: Part[]) => {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text" && !part.ignored)
    .map((part) => part.text?.trim())
    .filter(Boolean)
    .join("\n\n")
  if (!text) return ""
  const role = message.role === "user" ? "User" : "Assistant"
  return `## ${role}\n\n${text}`
}

const idleStatus: SessionStatus = { type: "idle" }
const NEW_SESSION_TITLE_KEYS = [
  "session.new.title.build",
  "session.new.title.making",
  "session.new.title.next",
  "session.new.title.fromHere",
  "session.new.title.improve",
  "session.new.title.ship",
] as const

function isAbortError(error: EventSessionError["properties"]["error"] | undefined) {
  return error?.name === "MessageAbortedError"
}

function isRecoveringError(error: EventSessionError["properties"]["error"] | undefined) {
  return error?.name === "ContextOverflowError"
}

function assistantMessageError(message: ChatMessage | undefined) {
  if (!message || message.role !== "assistant") return
  const error = (message as { error?: EventSessionError["properties"]["error"] }).error
  if (isAbortError(error) || isRecoveringError(error)) return
  return error
}

function AgentTurnError(props: { error: EventSessionError["properties"]["error"] | unknown }) {
  const language = useLanguage()
  const detail = createMemo(() =>
    formatServerError(props.error, language.t, language.t("notification.session.error.fallbackDescription")),
  )

  return (
    <Card variant="error" class="premium-error-card">
      <div class="flex items-start gap-3 w-full">
        {/* Simple crisp error warning icon */}
        <div class="flex-shrink-0 mt-0.5 text-[var(--card-accent,var(--icon-critical-base,var(--destructive)))] animate-pulse-slow">
          <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <div class="flex flex-col gap-0.5 min-w-0">
          <div class="text-[13px] font-semibold text-text-strong tracking-wide">
            {language.t("notification.session.error.title")}
          </div>
          <div class="text-[12px] text-text-weak font-medium leading-relaxed break-words whitespace-pre-wrap">
            {detail()}
          </div>
        </div>
      </div>
    </Card>
  )
}

function AgentErrorFallback(props: { error: unknown; reset: () => void }) {
  const language = useLanguage()
  const detail = createMemo(() => formatError(props.error, language.t))

  return (
    <div class="flex h-full min-h-0 w-full flex-col items-center justify-center bg-background-stronger px-6 py-8 text-foreground">
      <div class="flex w-full max-w-2xl flex-col items-center gap-5 text-center">
        <div class="flex size-11 items-center justify-center rounded-xl border border-border-danger-base bg-surface-base text-text-danger-base">
          <Icon name="warning" class="size-5" />
        </div>
        <div class="flex flex-col gap-1.5">
          <h2 class="text-16-semibold text-text-strong">{language.t("error.page.title")}</h2>
          <p class="text-13-regular text-text-weak">
            {language.t("error.page.description")}
          </p>
        </div>
        <TextField
          value={detail()}
          readOnly
          copyable
          multiline
          class="max-h-80 w-full text-left font-mono text-xs no-scrollbar"
          label={language.t("error.page.details.label")}
          hideLabel
        />
        <Button size="large" variant="ghost" onClick={props.reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}

function AutoCompactStrip(props: { context: SessionContextMetricsContext | undefined; compacting: boolean }) {
  const full = createMemo(() => Boolean(props.context?.autoCompactAt && props.context.total >= props.context.autoCompactAt))
  const visible = createMemo(() => props.compacting || full())

  return (
    <Show when={visible()}>
      <div class="mb-2 flex min-h-8 items-center gap-2 rounded-md border border-border-weaker-base bg-surface-raised-base px-2.5 py-1.5 text-[12px] text-text-base shadow-sm">
        <span class="shrink-0 text-[var(--syntax-warning)]">
          <Show
            when={props.compacting}
            fallback={<TriangleAlert size={14} />}
          >
            <RefreshCw size={14} class="animate-spin" />
          </Show>
        </span>
        <span class="min-w-0 flex-1 truncate">
          <Show
            when={props.compacting}
            fallback="Context full. Auto compact will run now."
          >
            Auto compacting context...
          </Show>
        </span>
        <span class="shrink-0 text-text-weaker">
          {formatCompactNumber(props.context?.total)} / {formatCompactNumber(props.context?.autoCompactAt ?? props.context?.limit)}
        </span>
      </div>
    </Show>
  )
}

function AgentTurnDiffSummaryCard(props: { message: ChatMessage }) {
  const summary = createMemo(() => createAgentTurnDiffSummary(messageSummaryDiffs(props.message)))
  const [expanded, setExpanded] = createSignal(false)
  const rows = createMemo(() => (expanded() ? summary().files : summary().visible))
  const fileLabel = createMemo(() => (summary().count === 1 ? "file" : "files"))

  const openReview = () => {
    window.dispatchEvent(
      new CustomEvent(AGENT_REVIEW_OPEN_EVENT, {
        detail: { sessionID: props.message.sessionID },
      }),
    )
  }

  return (
    <Show when={summary().count > 0}>
      <div class="agent-turn-diff-card" data-component="agent-turn-diff-summary">
        <div class="agent-turn-diff-card-header">
          <div class="agent-turn-diff-heading">
            <span class="agent-turn-diff-title">
              Edited {summary().count} {fileLabel()}
            </span>
            <span class="agent-turn-diff-total">
              <Show when={summary().additions > 0}>
                <span data-kind="add">+{formatDiffStat(summary().additions)}</span>
              </Show>
              <Show when={summary().deletions > 0}>
                <span data-kind="delete">-{formatDiffStat(summary().deletions)}</span>
              </Show>
            </span>
          </div>
          <div class="agent-turn-diff-actions">
            <button type="button" class="agent-turn-diff-review" onClick={openReview}>
              Review
            </button>
          </div>
        </div>
        <div class="agent-turn-diff-files">
          <For each={rows()}>
            {(diff) => (
              <div class="agent-turn-diff-file-row">
                <span class="agent-turn-diff-file-path" title={diff.file}>{diff.file}</span>
                <span class="agent-turn-diff-file-stats">
                  <Show when={diff.additions > 0}>
                    <span data-kind="add">+{formatDiffStat(diff.additions)}</span>
                  </Show>
                  <Show when={diff.deletions > 0}>
                    <span data-kind="delete">-{formatDiffStat(diff.deletions)}</span>
                  </Show>
                </span>
              </div>
            )}
          </For>
          <Show when={summary().overflow > 0 || expanded()}>
            <button
              type="button"
              class="agent-turn-diff-more"
              data-expanded={expanded() ? "true" : "false"}
              onClick={() => setExpanded((value) => !value)}
            >
              <span>
                <Show when={expanded()} fallback={`Show ${summary().overflow} more ${fileLabel()}`}>
                  Show fewer {fileLabel()}
                </Show>
              </span>
              <ChevronDown size={14} />
            </button>
          </Show>
        </div>
      </div>
    </Show>
  )
}

function OpenWithOptionIcon(props: { option: (typeof openWithOptions)[number] }) {
  if (props.option.icon) {
    return <AppIcon id={props.option.icon} class="size-5 shrink-0 rounded-[4px]" />
  }

  return (
    <span
      class={`flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[8px] font-medium leading-none ring-1 ring-border-weaker-base ${props.option.badgeClass ?? "bg-surface-raised-base text-text-base"}`}
    >
      {props.option.badge}
    </span>
  )
}

type QueuedFollowupState = "queued" | "sending" | "failed"

type QueuedFollowup = FollowupDraft & {
  queueID: string
  queuedAt: number
  state: QueuedFollowupState
  error?: string
}

const queuedFollowupID = () => `followup-${Date.now()}-${Math.random().toString(36).slice(2)}`

function followupPreview(draft: FollowupDraft) {
  const text = draft.prompt
    .map((part) => ("content" in part ? part.content : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
  const imageCount = draft.prompt.filter((part) => part.type === "image").length
  const contextCount = draft.context.length
  const extras = [
    imageCount > 0 ? `${imageCount} image${imageCount === 1 ? "" : "s"}` : "",
    contextCount > 0 ? `${contextCount} context item${contextCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean)

  if (text) return extras.length > 0 ? `${text} · ${extras.join(" · ")}` : text
  return extras.length > 0 ? extras.join(" · ") : "Queued follow-up"
}

function queueErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error || "Could not send queued follow-up.")
}

function AgentHeaderPanelControls(props: { projectPath?: string }) {
  const [isReviewVisible, setIsReviewVisible] = createSignal(false)
  const [isFileTreeVisible, setIsFileTreeVisible] = createSignal(false)
  const [isTerminalPanelOpen, setIsTerminalPanelOpen] = createSignal(false)
  const [openWithMenuOpen, setOpenWithMenuOpen] = createSignal(false)
  const [openingTarget, setOpeningTarget] = createSignal<OpenWithTarget | null>(null)
  const reviewWorkspaceOpen = createMemo(() => isReviewVisible() || isFileTreeVisible())

  const openProjectWith = (target: OpenWithTarget) => {
    const projectPath = props.projectPath?.trim()
    if (!projectPath) {
      showToast({
        variant: "error",
        title: "No project open",
        description: "Open a project before using Open with.",
      })
      return
    }

    if (openingTarget()) return
    setOpeningTarget(target)
    setOpenWithMenuOpen(false)

    void nativeApi.invoke("open_project_with", { path: projectPath, target })
      .catch((error) => {
        if (target === "vscode") {
          return nativeApi.invoke("open_external", { url: vscodeProjectUri(projectPath) })
        }
        if (target === "explorer" && unknownNativeCommand(error)) {
          return nativeApi.invoke("reveal_in_finder", { path: projectPath })
        }
        throw error
      })
      .catch((error) => {
        showToast({
          variant: "error",
          title: "Could not open project",
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        window.setTimeout(() => setOpeningTarget(null), 450)
      })
  }

  onMount(() => {
    const handleReviewState = (event: Event) => {
      const detail = (event as CustomEvent<{ isReviewVisible: boolean }>).detail
      if (detail) setIsReviewVisible(Boolean(detail.isReviewVisible))
    }
    const handleFileTreeState = (event: Event) => {
      const detail = (event as CustomEvent<{ isFileTreeVisible: boolean }>).detail
      if (detail) setIsFileTreeVisible(Boolean(detail.isFileTreeVisible))
    }
    const handleTerminalPanelState = (event: Event) => {
      const detail = (event as CustomEvent<{ isOpen: boolean }>).detail
      if (detail) setIsTerminalPanelOpen(Boolean(detail.isOpen))
    }

    window.addEventListener("gg-review-state", handleReviewState as EventListener)
    window.addEventListener("gg-file-tree-state", handleFileTreeState as EventListener)
    window.addEventListener("gg-terminal-panel-state", handleTerminalPanelState as EventListener)

    onCleanup(() => {
      window.removeEventListener("gg-review-state", handleReviewState as EventListener)
      window.removeEventListener("gg-file-tree-state", handleFileTreeState as EventListener)
      window.removeEventListener("gg-terminal-panel-state", handleTerminalPanelState as EventListener)
    })
  })

  return (
    <div class="flex shrink-0 items-center gap-1">
      <div class="flex h-8 shrink-0 overflow-hidden rounded-lg border border-border-weak-base bg-surface-raised-base/70 shadow-sm backdrop-blur">
        <button
          type="button"
          class="group/open-with flex h-8 w-9 items-center justify-center text-text-weak outline-none transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-60"
          title="Open in VS Code"
          aria-label="Open project in VS Code"
          disabled={Boolean(openingTarget())}
          onClick={(event) => {
            event.stopPropagation()
            openProjectWith("vscode")
          }}
        >
          <Show
            when={openingTarget() === "vscode"}
            fallback={<AppIcon id="vscode" class="size-[18px] shrink-0 transition-transform group-hover/open-with:scale-105" />}
          >
            <span class="size-3.5 rounded-full border border-text-weaker border-t-text-strong animate-spin" />
          </Show>
        </button>
        <div class="my-1.5 w-px bg-border-weaker-base" />
        <DropdownMenu open={openWithMenuOpen()} onOpenChange={setOpenWithMenuOpen} placement="bottom-end" gutter={7}>
          <DropdownMenuTrigger
            class="flex h-8 w-7 shrink-0 items-center justify-center text-text-weaker outline-none transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong focus-visible:ring-2 focus-visible:ring-ring/40 data-expanded:bg-surface-raised-base-hover data-expanded:text-text-strong disabled:pointer-events-none disabled:opacity-60"
            title="Open with"
            aria-label="Choose app to open project"
            disabled={Boolean(openingTarget())}
            onClick={(event: MouseEvent) => event.stopPropagation()}
          >
            <ChevronDown size={13} class="shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-[228px] rounded-xl border border-border-weak-base bg-surface-raised-base/95 p-1.5 text-[13px] shadow-2xl backdrop-blur">
            <For each={openWithOptions}>
              {(option) => (
                <DropdownMenuItem
                  class="min-h-9 gap-2.5 rounded-lg px-2 py-2 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                  onClick={(event: MouseEvent) => {
                    event.stopPropagation()
                    openProjectWith(option.id)
                  }}
                >
                  <Show
                    when={openingTarget() === option.id}
                    fallback={<OpenWithOptionIcon option={option} />}
                  >
                    <span class="size-5 shrink-0 rounded-full border border-text-weaker border-t-text-strong animate-spin" />
                  </Show>
                  <span class="truncate font-medium">{option.label}</span>
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button
        variant="ghost"
        class="size-8 rounded-lg border border-transparent px-0 text-text-weak hover:border-border-weaker-base hover:bg-surface-raised-base/70 hover:text-text-strong aria-pressed:border-border-weak-base aria-pressed:bg-surface-raised-base aria-pressed:text-text-strong focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => window.dispatchEvent(new Event("gg-toggle-terminal-panel"))}
        title={isTerminalPanelOpen() ? "Hide terminal panel" : "Show terminal panel"}
        aria-label="Toggle terminal panel"
        aria-pressed={isTerminalPanelOpen()}
      >
        <Icon name={isTerminalPanelOpen() ? "terminal-active" : "terminal"} size="small" />
      </Button>
      <Button
        variant="ghost"
        class="size-8 rounded-lg border border-transparent px-0 text-text-weak hover:border-border-weaker-base hover:bg-surface-raised-base/70 hover:text-text-strong aria-pressed:border-border-weak-base aria-pressed:bg-surface-raised-base aria-pressed:text-text-strong focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => window.dispatchEvent(new Event("gg-toggle-file-tree"))}
        title={isFileTreeVisible() ? "Hide file tree" : "Show file tree"}
        aria-label="Toggle file tree"
        aria-pressed={isFileTreeVisible()}
      >
        <Icon name={isFileTreeVisible() ? "file-tree-active" : "file-tree"} size="small" />
      </Button>
      <Button
        variant="ghost"
        class="size-8 rounded-lg border border-transparent px-0 text-text-weak hover:border-border-weaker-base hover:bg-surface-raised-base/70 hover:text-text-strong aria-pressed:border-border-weak-base aria-pressed:bg-surface-raised-base aria-pressed:text-text-strong focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => window.dispatchEvent(new Event("gg-toggle-review-workspace"))}
        title={reviewWorkspaceOpen() ? "Hide file tree and review panel" : "Show file tree and review panel"}
        aria-label="Toggle review workspace"
        aria-pressed={reviewWorkspaceOpen()}
      >
        <Icon name={reviewWorkspaceOpen() ? "review-active" : "review"} size="small" />
      </Button>
    </div>
  )
}

function AgentViewInner(props: AgentViewProps) {
  const sync = useSync()
  const globalSync = useGlobalSync()
  const sdk = useSDK()
  const params = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const providers = useProviders()
  const setActiveSidebarSession = useStore((s) => s.setActiveSession)
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const renameSession = useStore((s) => s.renameSession)
  const updateSession = useStore((s) => s.updateSession)
  const syncShobSessions = useStore((s) => s.syncShobSessions)
  const language = useLanguage()
  const [showJump, setShowJump] = createSignal(false)
  const [sessionMenuOpen, setSessionMenuOpen] = createSignal(false)
  const [renameOpen, setRenameOpen] = createSignal(false)
  const [renameValue, setRenameValue] = createSignal("")
  const [renameSaving, setRenameSaving] = createSignal(false)
  const [todoCollapsed, setTodoCollapsed] = createSignal(false)
  const [autoCompactingContext, setAutoCompactingContext] = createSignal(false)
  const [autoCompactKey, setAutoCompactKey] = createSignal("")
  const [queuedFollowups, setQueuedFollowups] = createSignal<QueuedFollowup[]>([])
  let scrollRef: HTMLDivElement | undefined
  let contentRef: HTMLDivElement | undefined
  let viewRef: HTMLDivElement | undefined
  let composerRegionRef: HTMLDivElement | undefined
  let composerDockRef: HTMLDivElement | undefined
  let composerRegionHeight = 0
  let composerDockHeightValue = 0
  const [composerHeight, setComposerHeight] = createSignal(132)
  const [composerDockHeight, setComposerDockHeight] = createSignal(0)
  const [composerFrame, setComposerFrame] = createSignal({
    left: "0px",
    width: "100%",
    bottom: "0px",
  })
  let rafId: number | undefined
  let composerFrameRaf: number | undefined
  let composerStickScrollRaf: number | undefined
  let cachedScrollHeight = 0
  let cachedClientHeight = 0
  let userScrollPending = false
  let scrollGestureAt = 0
  let touchY: number | undefined
  const composerState = createSessionComposerState({ closeMs: 320 })
  const autoScroll = createAutoScroll({
    working: () => true,
    overflowAnchor: "dynamic",
    onUserInteracted: () => scheduleJumpStateUpdate(),
  })

  // props.sessionId is ALWAYS the authoritative source. params.id lags behind
  // because the MemoryRouter updates asynchronously. If params.id were checked
  // first, switching sessions would briefly read the old (possibly-running)
  // session's status, making working()=true and triggering auto-scroll.
  const activeSessionId = createMemo(() => {
    const id = props.sessionId || params.id
    return id?.startsWith("ses") ? id : undefined
  })

  const messageState = createMemo<ChatMessage[] | undefined>(() => {
    const sessionID = activeSessionId()
    return sessionID ? sync.data.message[sessionID] : undefined
  })
  const messages = createMemo<ChatMessage[]>(() => messageState() ?? [])
  const contextMetrics = createMemo(() => getSessionContextMetrics(messages(), providers.all()))
  const contextInfo = createMemo(() => contextMetrics().context)
  const activeQueuedFollowups = createMemo(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return []
    return queuedFollowups().filter((item) => item.sessionID === sessionID)
  })
  const autoCompactStripVisible = createMemo(() => {
    const context = contextInfo()
    const full = Boolean(context?.autoCompactAt && context.total >= context.autoCompactAt)
    return autoCompactingContext() || full
  })
  const composerDockVisible = createMemo(() =>
    Boolean(
      composerState.questionRequest() ||
        composerState.permissionRequest() ||
        (composerState.dock() && composerState.todos().length > 0) ||
        activeQueuedFollowups().length > 0 ||
        autoCompactStripVisible(),
    ),
  )
  const getParts = (messageID: string): Part[] => sync.data.part[messageID] ?? []
  const info = createMemo(() => {
    const sessionID = activeSessionId()
    return sessionID ? sync.session.get(sessionID) : undefined
  })
  const currentProject = createMemo(() => projects().find((project) => project.id === currentProjectId()) ?? null)
  const currentLocalSession = createMemo(() => {
    const sessionID = activeSessionId()
    return sessionID ? currentProject()?.sessions.find((session) => session.id === sessionID) ?? null : null
  })
  const currentBranchName = createMemo(() => sync.data.vcs?.branch?.trim() || "")
  const title = createMemo(() => currentLocalSession()?.name || sessionTitle(info()?.title) || "New session")
  const statusInfo = createMemo<SessionStatus>(() => {
    const sessionID = activeSessionId()
    return sessionID ? sync.data.session_status[sessionID] ?? idleStatus : idleStatus
  })
  const status = createMemo(() => statusInfo().type)
  const working = createMemo(() => status() !== "idle")
  const sessionEventError = createMemo(() => {
    const sessionID = activeSessionId()
    const error = sessionID ? sync.data.session_error[sessionID] : undefined
    if (isAbortError(error) || isRecoveringError(error)) return
    return error
  })
  const currentProjectName = createMemo(() => {
    const current = currentProject()
    return current?.name || basename(current?.path || props.projectPath)
  })
  const [newSessionTitleIndexes, setNewSessionTitleIndexes] = createSignal<Record<string, number>>({})
  const pickNewSessionTitleIndex = () => Math.floor(Math.random() * NEW_SESSION_TITLE_KEYS.length)
  const userMessages = createMemo(() => messages().filter((message) => message.role === "user"))
  const sessionID = createMemo(() => activeSessionId() ?? "")
  const renameValueTrimmed = createMemo(() => renameValue().trim())
  const canRename = createMemo(() => {
    const next = renameValueTrimmed()
    return next.length > 0 && next !== title()
  })
  const assistantByParent = createMemo(() => {
    const grouped = new Map<string, ChatMessage[]>()
    for (const message of messages()) {
      if (message.role !== "assistant") continue
      const parentID = "parentID" in message ? message.parentID : undefined
      if (!parentID) continue
      const list = grouped.get(parentID)
      if (list) list.push(message)
      else grouped.set(parentID, [message])
    }
    return grouped
  })
  const orphanMessages = createMemo(() =>
    messages().filter((message) => message.role !== "user" && (!("parentID" in message) || !message.parentID)),
  )
  const sessionContentLoading = createMemo(() => Boolean(activeSessionId() && messageState() === undefined))
  const isNewSession = createMemo(() => !sessionContentLoading() && messages().length === 0)
  const showInlineComposer = createMemo(() => isNewSession())
  const showDockedComposer = createMemo(() => !sessionContentLoading() && !showInlineComposer())
  const newSessionTitle = createMemo(() => {
    const key = sessionID()
    const index = key ? newSessionTitleIndexes()[key] ?? 0 : 0
    return language.t(NEW_SESSION_TITLE_KEYS[index], { project: currentProjectName() })
  })

  createEffect(() => {
    const key = sessionID()
    if (!key || !isNewSession()) return

    setNewSessionTitleIndexes((current) => {
      if (current[key] !== undefined) return current
      return { ...current, [key]: pickNewSessionTitleIndex() }
    })
  })

  const runSessionMenuAction = (event: MouseEvent, action: () => void) => {
    event.preventDefault()
    event.stopPropagation()
    setSessionMenuOpen(false)
    window.setTimeout(action, 0)
  }

  const togglePinChat = () => {
    const project = currentProject()
    const session = currentLocalSession()
    if (!project || !session) return
    void updateSession(project.id, session.id, { pinned: !session.pinned })
  }

  const openRenameDialog = () => {
    setRenameValue(title())
    setSessionMenuOpen(false)
    window.setTimeout(() => setRenameOpen(true), 20)
  }

  const submitRename = async () => {
    const next = renameValueTrimmed()
    const project = currentProject()
    const session = currentLocalSession()
    if (!project || !session || !next || next === title() || renameSaving()) return

    setRenameSaving(true)
    try {
      await renameSession(project.id, session.id, next)
      await sdk.client.session.update({ sessionID: session.id, title: next }).catch(() => undefined)
      void sync.session.sync(session.id)
      setRenameOpen(false)
    } finally {
      setRenameSaving(false)
    }
  }

  const copySessionAsMarkdown = async () => {
    const blocks = messages()
      .map((message) => messageTextAsMarkdown(message, getParts(message.id)))
      .filter(Boolean)
    const markdown = [`# ${title()}`, "", ...blocks].join("\n\n").trim()

    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      showToast({ title: "Copied as Markdown" })
    } catch {
      showToast({ variant: "error", title: "Copy failed", description: "Could not write session Markdown to clipboard." })
    }
  }

  const enqueueFollowup = (draft: FollowupDraft) => {
    setQueuedFollowups((items) => [
      ...items,
      {
        ...draft,
        queueID: queuedFollowupID(),
        queuedAt: Date.now(),
        state: "queued",
      },
    ])
    showToast({ title: "Follow-up queued", description: "It will send when the current run finishes." })
    queueMicrotask(() => scheduleJumpStateUpdate({ measure: true }))
  }

  const removeQueuedFollowup = (queueID: string) => {
    setQueuedFollowups((items) => items.filter((item) => item.queueID !== queueID))
  }

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID || status() !== "idle" || autoCompactingContext()) return

    const next = queuedFollowups().find((item) => item.sessionID === sessionID && item.state === "queued")
    if (!next) return

    setQueuedFollowups((items) =>
      items.map((item) => (item.queueID === next.queueID ? { ...item, state: "sending", error: undefined } : item)),
    )

    void sendFollowupDraft({
      client: sdk.client,
      sync,
      globalSync,
      draft: next,
      optimisticBusy: true,
    })
      .then((sent) => {
        if (sent) {
          setQueuedFollowups((items) => items.filter((item) => item.queueID !== next.queueID))
          return
        }
        setQueuedFollowups((items) =>
          items.map((item) => (item.queueID === next.queueID ? { ...item, state: "queued" } : item)),
        )
      })
      .catch((error) => {
        const description = queueErrorMessage(error)
        setQueuedFollowups((items) =>
          items.map((item) => (item.queueID === next.queueID ? { ...item, state: "failed", error: description } : item)),
        )
        showToast({ variant: "error", title: "Queued follow-up failed", description })
      })
  })

  createEffect(() => {
    const sessionID = activeSessionId()
    const context = contextInfo()
    if (!sessionID || !context?.autoCompactAt) return
    if (status() !== "idle" || autoCompactingContext()) return
    if (context.total < context.autoCompactAt) return

    const key = `${sessionID}:${context.message.id}:${context.total}`
    if (autoCompactKey() === key) return
    setAutoCompactKey(key)
    setAutoCompactingContext(true)

    void sdk.client.session
      .summarize({
        sessionID,
        providerID: context.message.providerID,
        modelID: context.message.modelID,
        auto: true,
      })
      .then(() => {
        showToast({ title: "Context auto compacted" })
        void sync.session.sync(sessionID)
      })
      .catch((error) => {
        showToast({
          variant: "error",
          title: "Auto compact failed",
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => setAutoCompactingContext(false))
  })

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return
    void sync.session.sync(sessionID)
  })

  // Keep global sidebar/terminal active session in sync with in-view route changes
  // (e.g. opening a subagent session from inside the agent timeline).
  // NOTE: Disabled for store-based navigation — the sidebar sets activeSessionId
  // directly, and the router params lag behind causing reverts.
  // createEffect(() => {
  //   const routeSessionID = params.id
  //   if (!routeSessionID?.startsWith("ses")) return
  //   if (activeSidebarSessionId() === routeSessionID) return
  //   setActiveSidebarSession(routeSessionID)
  // })

  const refreshScrollMetrics = () => {
    if (!scrollRef) {
      cachedScrollHeight = 0
      cachedClientHeight = 0
      return
    }

    cachedScrollHeight = scrollRef.scrollHeight
    cachedClientHeight = scrollRef.clientHeight
  }

  const updateJumpState = () => {
    if (!scrollRef) {
      setShowJump(false)
      return
    }

    const max = Math.max(0, cachedScrollHeight - cachedClientHeight)
    const distance = max - scrollRef.scrollTop
    const jumpThreshold = Math.max(400, cachedClientHeight)
    setShowJump(max > 1 && distance > jumpThreshold)
  }

  const scheduleJumpStateUpdate = (options: { measure?: boolean; userScroll?: boolean } = {}) => {
    if (options.measure) refreshScrollMetrics()
    if (options.userScroll) userScrollPending = true
    if (rafId !== undefined) return

    rafId = requestAnimationFrame(() => {
      rafId = undefined
      updateJumpState()
      if (userScrollPending) {
        userScrollPending = false
        autoScroll.handleScroll()
      }
    })
  }

  const isNestedScrollableTarget = (target: EventTarget | null) => {
    const el = scrollRef
    const current = target instanceof Element ? target : undefined
    const nested = current?.closest("[data-scrollable]")
    return !!(el && nested && nested !== el)
  }

  const markScrollGesture = (target?: EventTarget | null) => {
    if (isNestedScrollableTarget(target ?? null)) return
    scrollGestureAt = Date.now()
  }

  const hasScrollGesture = () => Date.now() - scrollGestureAt < 300

  const handleTimelineScroll = () => {
    scheduleJumpStateUpdate({ userScroll: hasScrollGesture() })
  }

  const handleTimelineWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return
    markScrollGesture(event.target)
  }

  const handleTimelineTouchStart = (event: TouchEvent) => {
    if (isNestedScrollableTarget(event.target)) return
    touchY = event.touches[0]?.clientY
  }

  const handleTimelineTouchMove = (event: TouchEvent) => {
    if (isNestedScrollableTarget(event.target)) return
    const next = event.touches[0]?.clientY
    if (next === undefined || touchY === undefined) return
    if (Math.abs(next - touchY) > 2) markScrollGesture(event.target)
    touchY = next
  }

  const handleTimelineTouchEnd = () => {
    touchY = undefined
  }

  const handleTimelinePointerDown = (event: PointerEvent) => {
    if (event.target === event.currentTarget) markScrollGesture(event.target)
  }

  const handleTimelineKeyDown = (event: KeyboardEvent) => {
    if (
      event.target instanceof Element &&
      event.target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      return
    }
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
      markScrollGesture(event.target)
    }
  }

  const resumeScroll = () => {
    autoScroll.forceScrollToBottom()
    setShowJump(false)
    queueMicrotask(() => scheduleJumpStateUpdate({ measure: true }))
  }

  createResizeObserver(
    () => contentRef,
    () => {
      refreshScrollMetrics()
      if (!autoScroll.userScrolled()) autoScroll.scrollToBottom()
      if (scrollRef) scheduleJumpStateUpdate({ measure: true })
    },
  )

  createResizeObserver(
    () => scrollRef,
    () => {
      scheduleJumpStateUpdate({ measure: true })
    },
  )

  createResizeObserver(
    () => composerRegionRef,
    ({ height }) => {
      const next = Math.ceil(height)
      if (next === composerRegionHeight) return

      const el = scrollRef
      if (el) refreshScrollMetrics()
      const delta = next - composerRegionHeight
      const stick = el
        ? !autoScroll.userScrolled() || cachedScrollHeight - cachedClientHeight - el.scrollTop < 10 + Math.max(0, delta)
        : false

      composerRegionHeight = next
      setComposerHeight(next || 132)

      if (stick) scheduleComposerStickScroll()
      if (el) scheduleJumpStateUpdate({ measure: true })
    },
  )

  const updateComposerDockHeight = (height: number) => {
    const next = Math.ceil(height)
    if (next === composerDockHeightValue) return

    const el = scrollRef
    if (el) refreshScrollMetrics()
    const delta = next - composerDockHeightValue
    const stick = el
      ? !autoScroll.userScrolled() || cachedScrollHeight - cachedClientHeight - el.scrollTop < 10 + Math.max(0, delta)
      : false

    composerDockHeightValue = next
    setComposerDockHeight(next)

    if (stick) scheduleComposerStickScroll()
    if (el) scheduleJumpStateUpdate({ measure: true })
  }

  createResizeObserver(
    () => composerDockRef,
    ({ height }) => {
      updateComposerDockHeight(height)
    },
  )

  createEffect(() => {
    if (composerDockVisible()) return
    updateComposerDockHeight(0)
  })

  const measureComposerFrame = () => {
    const el = viewRef
    if (!el) return

    const rect = el.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    let left = Math.max(0, Math.min(rect.left, viewportWidth))
    let right = Math.max(left, Math.min(rect.right, viewportWidth))
    const bottom = Math.max(0, viewportHeight - Math.min(rect.bottom, viewportHeight))

    if (right - left < 240) {
      left = 0
      right = viewportWidth
    }

    setComposerFrame({
      left: `${Math.round(left)}px`,
      width: `${Math.round(right - left)}px`,
      bottom: `${Math.round(bottom)}px`,
    })
  }

  const scheduleComposerFrame = () => {
    if (composerFrameRaf !== undefined) return
    composerFrameRaf = requestAnimationFrame(() => {
      composerFrameRaf = undefined
      measureComposerFrame()
    })
  }

  const scheduleComposerStickScroll = () => {
    if (composerStickScrollRaf !== undefined) cancelAnimationFrame(composerStickScrollRaf)
    composerStickScrollRaf = requestAnimationFrame(() => {
      composerStickScrollRaf = undefined
      autoScroll.forceScrollToBottom()
      scheduleJumpStateUpdate({ measure: true })
    })
  }

  createResizeObserver(
    () => viewRef,
    () => {
      scheduleComposerFrame()
    },
  )

  createEffect(() => {
    showDockedComposer()
    scheduleComposerFrame()
  })

  onMount(() => {
    scheduleComposerFrame()
    window.addEventListener("resize", scheduleComposerFrame)
    window.visualViewport?.addEventListener("resize", scheduleComposerFrame)
    window.visualViewport?.addEventListener("scroll", scheduleComposerFrame)
    onCleanup(() => {
      window.removeEventListener("resize", scheduleComposerFrame)
      window.visualViewport?.removeEventListener("resize", scheduleComposerFrame)
      window.visualViewport?.removeEventListener("scroll", scheduleComposerFrame)
    })
  })

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return

    let lastToastID = ""
    const unsub = sdk.event.on("session.error", (event) => {
      const props = event.properties
      if (props.sessionID && props.sessionID !== sessionID) return
      if (isAbortError(props.error) || isRecoveringError(props.error)) return
      if (event.id === lastToastID) return

      lastToastID = event.id
      showToast({
        variant: "error",
        title: language.t("notification.session.error.title"),
        description: formatServerError(
          props.error,
          language.t,
          language.t("notification.session.error.fallbackDescription"),
        ),
      })
      queueMicrotask(() => scheduleJumpStateUpdate({ measure: true }))
    })
    onCleanup(unsub)
  })

  const jumpToBottom = () => {
    resumeScroll()
  }

  createEffect(() => {
    messages()
    queueMicrotask(() => scheduleJumpStateUpdate({ measure: true }))
  })

  createEffect(() => {
    autoScroll.userScrolled()
    scheduleJumpStateUpdate()
  })

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
    if (composerFrameRaf !== undefined) cancelAnimationFrame(composerFrameRaf)
    if (composerStickScrollRaf !== undefined) cancelAnimationFrame(composerStickScrollRaf)
  })

  const setViewRef = (el: HTMLDivElement | undefined) => {
    viewRef = el
    if (el) queueMicrotask(scheduleComposerFrame)
  }

  const setScrollRef = (el: HTMLDivElement | undefined) => {
    scrollRef = el
    autoScroll.scrollRef(el)
    if (el) queueMicrotask(() => scheduleJumpStateUpdate({ measure: true }))
  }

  const setContentRef = (el: HTMLDivElement | undefined) => {
    contentRef = el
    autoScroll.contentRef(el)
    if (scrollRef) queueMicrotask(() => scheduleJumpStateUpdate({ measure: true }))
  }

  const setComposerRegionRef = (el: HTMLDivElement | undefined) => {
    composerRegionRef = el
    composerRegionHeight = 0
    setComposerHeight(132)
    if (el) queueMicrotask(() => scheduleJumpStateUpdate({ measure: true }))
  }

  const setComposerDockRef = (el: HTMLDivElement | undefined) => {
    composerDockRef = el
    composerDockHeightValue = 0
    setComposerDockHeight(0)
    if (el) queueMicrotask(() => updateComposerDockHeight(el.getBoundingClientRect().height))
  }

  const assistantCopyPartID = (assistants: ChatMessage[], showCopy: boolean) => {
    if (!showCopy) return null
    const assistant = assistants.at(-1)
    if (!assistant) return null
    return (
      getParts(assistant.id)
        .filter((part: any) => part.type === "text" && part.text?.trim())
        .at(-1)?.id ?? null
    )
  }

  const timeValue = (message: ChatMessage, key: "created" | "completed") => {
    const value = (message as any).time?.[key]
    return typeof value === "number" ? value : undefined
  }

  const turnDurationMs = (user: ChatMessage, assistants: ChatMessage[]) => {
    const last = assistants.at(-1)
    if (!last) return undefined
    const start = timeValue(user, "created") ?? timeValue(last, "created")
    const end = timeValue(last, "completed") ?? timeValue(last, "created")
    if (start === undefined || end === undefined || end < start) return undefined
    return end - start
  }

  const FilePreview = (fileProps: any) => <ShobFile {...fileProps} />

  const syncSessionIntoProject = async (targetSessionID: string) => {
    const project = currentProject()
    if (!project) return false
    if (project.sessions.some((session) => session.id === targetSessionID)) return true

    const syncedSession = sync.data.session.find((session) => session.id === targetSessionID)
    if (!syncedSession) {
      await sync.session.sync(targetSessionID).catch(() => undefined)
    }

    if (!sync.data.session.some((session) => session.id === targetSessionID)) return false

    const syncedById = new Map(sync.data.session.map((session) => [session.id, session]))
    const existingSessions = project.sessions
      .filter((session) => !syncedById.has(session.id))
      .map((session) => ({
        id: session.id,
        title: session.name,
        parentID: session.parentSessionId ?? undefined,
        time: {
          created: session.createdAt ?? undefined,
          updated: session.lastActiveAt ?? session.createdAt ?? undefined,
        },
      }))
    await syncShobSessions(project.id, [...sync.data.session, ...existingSessions] as any)
    return true
  }

  const navigateToSession = (targetSessionID: string) => {
    if (!targetSessionID || targetSessionID === activeSessionId()) return
    void syncSessionIntoProject(targetSessionID).then((ready) => {
      if (!ready) {
        showToast({
          variant: "error",
          title: "Subagent not ready",
          description: "Could not find that subagent session yet.",
        })
        return
      }
      setActiveSidebarSession(targetSessionID)
      const dir = params.dir
      if (dir) navigate(`/${dir}/session/${targetSessionID}`)
    })
  }

  const visibleAssistantPart = (part: Part) => {
    if (part.type === "text") return Boolean(part.text?.trim())
    if (part.type === "reasoning") return Boolean(part.text?.trim())
    if (part.type === "tool") return part.tool !== "todowrite"
    return false
  }

  return (
    <DataProvider
      data={sync.data}
      directory={props.projectPath ?? ""}
      onNavigateToSession={navigateToSession}
    >
      <FileComponentProvider component={FilePreview}>
        <>
        <Show when={renameOpen()}>
          <div
            class="fixed inset-0 z-[1000] flex items-center justify-center bg-[color-mix(in_srgb,var(--background)_72%,transparent)] px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-chat-title"
            onClick={() => {
              if (!renameSaving()) setRenameOpen(false)
            }}
          >
            <form
              class="grid w-full max-w-[420px] gap-0 overflow-hidden rounded-xl border border-border-weak-base bg-surface-raised-base shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault()
                void submitRename()
              }}
            >
              <div class="border-b border-border-weak-base px-4 pt-4 pb-3">
                <div class="flex items-center gap-2">
                  <span class="flex size-8 items-center justify-center rounded-md bg-surface-raised-base-hover text-text-weaker">
                    <Pencil size={15} />
                  </span>
                  <div class="min-w-0">
                    <h2 id="rename-chat-title" class="text-[15px] font-semibold text-text-strong">Rename chat</h2>
                    <p class="truncate text-[12px] text-text-weak">{currentProjectName()}</p>
                  </div>
                  <button
                    type="button"
                    class="ml-auto flex size-7 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                    aria-label="Close rename chat dialog"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!renameSaving()) setRenameOpen(false)
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div class="grid gap-2 px-4 py-4">
                <label class="text-[12px] font-medium text-text-base" for={`rename-chat-${sessionID()}`}>
                  Chat title
                </label>
                <input
                  id={`rename-chat-${sessionID()}`}
                  class="h-9 rounded-md border border-border-weak-base bg-background-stronger px-3 text-[13px] text-text-strong outline-none transition-colors placeholder:text-text-weaker focus:border-border-weak-hover focus:bg-surface-raised-base-hover"
                  value={renameValue()}
                  placeholder="Chat title"
                  onInput={(e) => setRenameValue(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation()
                      if (!renameSaving()) setRenameOpen(false)
                    }
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void submitRename()
                    }
                  }}
                  ref={(el) =>
                    setTimeout(() => {
                      el.focus()
                      el.select()
                    }, 50)
                  }
                />
                <Show when={!renameValueTrimmed()}>
                  <div class="text-[12px] text-icon-critical-base">Chat title cannot be empty.</div>
                </Show>
              </div>

              <div class="flex justify-end gap-2 border-t border-border-weak-base bg-background-stronger px-4 py-3">
                <button
                  type="button"
                  class="inline-flex h-8 items-center justify-center rounded-lg border border-border-weak-base bg-background-stronger px-3 text-[13px] font-medium text-text-base transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!renameSaving()) setRenameOpen(false)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canRename() || renameSaving()}
                  class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  onClick={(e) => {
                    e.stopPropagation()
                    void submitRename()
                  }}
                >
                  <Check size={14} />
                  {renameSaving() ? "Saving..." : "Save title"}
                </button>
              </div>
            </form>
          </div>
        </Show>

        <div
          ref={setViewRef}
          class="agent-terminal-view relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-stronger text-foreground"
          data-composer-dock-visible={composerDockVisible() ? "true" : "false"}
          data-docked-composer={showDockedComposer() ? "true" : "false"}
          data-new-session={isNewSession() ? "true" : "false"}
          style={{
            "--agent-composer-bottom": composerFrame().bottom,
            "--agent-composer-dock-height": `${composerDockHeight()}px`,
            "--agent-composer-height": `${composerHeight()}px`,
            "--agent-composer-left": composerFrame().left,
            "--agent-composer-width": composerFrame().width,
          }}
        >
          <div class="agent-terminal-scroll-frame relative min-h-0 flex-1 overflow-hidden">
            <div
              class="pointer-events-none absolute bottom-6 left-1/2 z-[60] -translate-x-1/2 transition-all duration-200 ease-out"
              classList={{
                "translate-y-0 scale-100 opacity-100": showJump(),
                "pointer-events-none translate-y-2 scale-95 opacity-0": !showJump(),
              }}
            >
              <button
                type="button"
                class="pointer-events-auto flex h-8 w-10 cursor-pointer items-center justify-center border-none bg-transparent p-0 group"
                onClick={jumpToBottom}
                aria-label="Jump to bottom"
              >
                <div
                  class="flex h-6 w-8 items-center justify-center rounded-[6px] border border-border-weaker-base bg-[color-mix(in_srgb,var(--surface-raised-stronger-non-alpha)_80%,transparent)] backdrop-blur-[0.75px] transition-colors group-hover:border-[var(--border-weak-base)]"
                  style={{
                    "box-shadow": "var(--shadow-md)",
                  }}
                >
                  <Icon name="arrow-down-to-line" size="small" />
                </div>
              </button>
            </div>

            <div
              ref={setScrollRef}
              data-slot="session-turn-content"
              class="agent-terminal-scroll agent-smart-scrollbar h-full min-w-0 overflow-x-hidden overflow-y-auto"
              style={{
                "--session-title-height": "40px",
                "--sticky-accordion-top": "48px",
              }}
              onScroll={() => {
                handleTimelineScroll()
              }}
              onWheel={handleTimelineWheel}
              onTouchStart={handleTimelineTouchStart}
              onTouchMove={handleTimelineTouchMove}
              onTouchEnd={handleTimelineTouchEnd}
              onPointerDown={handleTimelinePointerDown}
              onKeyDown={handleTimelineKeyDown}
            >
              <div class="agent-terminal-scroll-body" onClick={autoScroll.handleInteraction}>
                <Show
                  when={isNewSession()}
                  fallback={
                    <>
                <div
                  data-session-title
                  class="agent-terminal-title sticky top-0 z-30 w-full px-3 md:px-4"
                >
                  <div class="flex w-full items-center gap-2.5">
                    <div class="agent-session-title-cluster flex min-w-0 flex-1 items-center gap-2">
                      <h1 data-slot="session-title-child" class="max-w-[min(56vw,620px)] truncate text-[13px] font-semibold text-text-strong">
                        {title()}
                      </h1>
                      <Show when={currentLocalSession()?.pinned}>
                        <Pin size={12} class="shrink-0 fill-current text-text-weaker" />
                      </Show>
                      <DropdownMenu open={sessionMenuOpen()} onOpenChange={setSessionMenuOpen} placement="bottom-start" gutter={4}>
                        <DropdownMenuTrigger
                          class="agent-session-menu-trigger flex size-7 shrink-0 items-center justify-center rounded-lg text-text-weak transition-colors hover:text-text-strong data-expanded:text-text-strong"
                          title="Chat actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal size={15} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent class="w-[210px] rounded-lg border border-border-weak-base bg-surface-raised-base/95 p-1.5 text-[13px] shadow-2xl backdrop-blur">
                          <DropdownMenuItem
                            class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                            onClick={(e: MouseEvent) => runSessionMenuAction(e, togglePinChat)}
                          >
                            <Pin size={14} class={currentLocalSession()?.pinned ? "fill-current" : ""} />
                            {currentLocalSession()?.pinned ? "Unpin chat" : "Pin chat"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                            onClick={(e: MouseEvent) => runSessionMenuAction(e, openRenameDialog)}
                          >
                            <Pencil size={14} />
                            Rename chat
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            class="gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-base focus:bg-surface-raised-base-hover"
                            onClick={(e: MouseEvent) => runSessionMenuAction(e, () => void copySessionAsMarkdown())}
                          >
                            <Copy size={14} />
                            Copy as Markdown
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div class="ml-auto flex shrink-0 items-center gap-2">
                      <Show when={currentBranchName()}>
                        <div class="agent-header-branch" title={`Current branch: ${currentBranchName()}`} aria-label={`Current branch: ${currentBranchName()}`}>
                          <Icon name="branch" size="small" />
                          <span>{currentBranchName()}</span>
                        </div>
                      </Show>
                      <AgentHeaderPanelControls projectPath={props.projectPath ?? currentProject()?.path} />
                    </div>
                  </div>
                </div>

                <div
                  ref={setContentRef}
                  class="agent-terminal-buffer min-h-full pb-56 pt-2"
                >
                  <Show when={sessionContentLoading()}>
                    <div class="flex min-h-full items-center justify-center px-6 text-center">
                      <TextShimmer text="Loading chat..." />
                    </div>
                  </Show>

                  <For each={userMessages()}>
                    {(message, index) => {
                      const assistants = createMemo(() => assistantByParent().get(message.id) ?? [])
                      const latestTurn = createMemo(() => index() === userMessages().length - 1)
                      const assistantVisible = createMemo(() => {
                        let visible = 0
                        for (const msg of assistants()) {
                          if (assistantMessageError(msg)) visible++
                          const parts = getParts(msg.id)
                          for (const part of parts) {
                            if (visibleAssistantPart(part)) visible++
                          }
                        }
                        return visible
                      })
                      const assistantError = createMemo(() => {
                        for (const msg of assistants()) {
                          const error = assistantMessageError(msg)
                          if (error) return error
                        }
                      })
                      const turnError = createMemo(() => assistantError() ?? (latestTurn() ? sessionEventError() : undefined))
                      const showAssistantBlock = createMemo(
                        () => assistants().length > 0 || !!turnError() || (latestTurn() && statusInfo().type === "retry"),
                      )
                      const showThinking = createMemo(
                        () => working() && latestTurn() && assistantVisible() === 0 && !turnError() && statusInfo().type !== "retry",
                      )
                      const showDiffSummary = createMemo(
                        () => createAgentTurnDiffSummary(messageSummaryDiffs(message)).count > 0 && (!latestTurn() || !working()),
                      )

                      return (
                        <div
                          id={`message-${message.id}`}
                          data-message-id={message.id}
                          data-timeline-row="UserMessage"
                          class="agent-terminal-turn min-w-0 w-full max-w-full md:mx-auto md:max-w-[736px] 2xl:max-w-[736px]"
                          classList={{ "pt-6": index() > 0 }}
                        >
                          <div data-component="session-turn" class="relative min-w-0 w-full">
                            <div data-slot="session-turn-message-container" class="w-full">
                              <div data-slot="session-turn-message-content" aria-live="off">
                                <Message message={message} parts={getParts(message.id)} />
                              </div>
                            </div>
                          </div>

                          <Show when={showAssistantBlock()}>
                            <div
                              data-message-id={message.id}
                              data-timeline-row="AssistantPart"
                              class="agent-terminal-assistant min-w-0 w-full max-w-full pt-3"
                            >
                              <div data-component="session-turn" class="relative min-w-0 w-full">
                                <div data-slot="session-turn-message-container" class="w-full">
                                  <Show when={assistants().length > 0}>
                                    <div
                                      data-slot="session-turn-assistant-content"
                                      aria-hidden={working() && latestTurn()}
                                    >
                                      <AssistantParts
                                        messages={assistants() as any}
                                        showReasoningSummaries={true}
                                        working={working() && latestTurn()}
                                        turnDurationMs={turnDurationMs(message, assistants())}
                                        showAssistantCopyPartID={assistantCopyPartID(assistants(), !working() && latestTurn())}
                                        shellToolDefaultOpen={settings.general.shellToolPartsExpanded()}
                                        editToolDefaultOpen={settings.general.editToolPartsExpanded()}
                                      />
                                    </div>
                                  </Show>
                                  <Show when={latestTurn()}>
                                    <SessionRetry status={statusInfo()} show={!turnError()} />
                                  </Show>
                                  <Show when={turnError()} keyed>
                                    {(error) => <AgentTurnError error={error} />}
                                  </Show>
                                </div>
                              </div>
                            </div>
                          </Show>

                          <Show when={showDiffSummary()}>
                            <div class="agent-terminal-diff-summary min-w-0 w-full max-w-full pt-3">
                              <AgentTurnDiffSummaryCard message={message} />
                            </div>
                          </Show>

                          <Show when={showThinking()}>
                            <div class="agent-terminal-assistant min-w-0 w-full max-w-full pt-3">
                              <div data-component="session-turn" class="relative min-w-0 w-full">
                                <div data-slot="session-turn-message-container" class="w-full">
                                  <div data-slot="session-turn-thinking" class="pl-2">
                                    <TextShimmer text={language.t("ui.sessionTurn.status.thinking") ?? "Thinking..."} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Show>
                        </div>
                      )
                    }}
                  </For>

                  <For each={orphanMessages()}>
                    {(message) => (
                      <div class="agent-terminal-assistant min-w-0 w-full max-w-full pt-3 md:mx-auto md:max-w-[736px] 2xl:max-w-[736px]">
                        <div data-component="session-turn" class="relative min-w-0 w-full">
                          <div data-slot="session-turn-message-container" class="w-full">
                            <div data-slot="session-turn-assistant-content">
                              <Message
                                message={message}
                                parts={getParts(message.id)}
                                showReasoningSummaries={true}
                              />
                            </div>
                            <Show when={assistantMessageError(message)} keyed>
                              {(error) => <AgentTurnError error={error} />}
                            </Show>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>

                </div>
                    </>
                  }
                >
                  <div ref={setContentRef} class="agent-terminal-new-session-stage">
                    <div class="agent-terminal-new-session relative z-10 w-full">
                      <div class="agent-terminal-new-session-heading">
                        <h1>{newSessionTitle()}</h1>
                      </div>
                      <Show when={showInlineComposer()}>
                        <div class="agent-terminal-new-session-composer" data-agent-docked="false">
                          <PromptInput shouldQueue={() => working()} onQueue={enqueueFollowup} onSubmit={resumeScroll} />
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>

          <Show when={showDockedComposer()}>
            <Portal>
              <div
                ref={setComposerRegionRef}
                class="agent-terminal-composer-region"
                data-agent-docked="true"
                style={{
                  "--agent-composer-bottom": composerFrame().bottom,
                  "--agent-composer-dock-height": `${composerDockHeight()}px`,
                  "--agent-composer-height": `${composerHeight()}px`,
                  "--agent-composer-left": composerFrame().left,
                  "--agent-composer-width": composerFrame().width,
                }}
              >
                <Show when={composerDockVisible()}>
                  <div ref={setComposerDockRef} class="agent-terminal-composer-docks">
                    <Show when={activeQueuedFollowups().length > 0}>
                      <div class="agent-terminal-followup-queue" aria-live="polite">
                        <div class="agent-terminal-followup-queue-header">
                          <span>Queued follow-ups</span>
                          <span>{activeQueuedFollowups().length}</span>
                        </div>
                        <For each={activeQueuedFollowups()}>
                          {(item) => (
                            <div class="agent-terminal-followup-queue-item" data-state={item.state}>
                              <div class="agent-terminal-followup-queue-copy">
                                <span>{followupPreview(item)}</span>
                                <Show when={item.error}>
                                  <small>{item.error}</small>
                                </Show>
                              </div>
                              <span class="agent-terminal-followup-queue-state">
                                <Show when={item.state === "sending"} fallback={item.state === "failed" ? "Failed" : "Queued"}>
                                  Sending
                                </Show>
                              </span>
                              <button
                                type="button"
                                disabled={item.state === "sending"}
                                class="agent-terminal-followup-queue-remove"
                                onClick={() => removeQueuedFollowup(item.queueID)}
                                aria-label="Remove queued follow-up"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show when={composerState.dock() && composerState.todos().length > 0}>
                      <div class="agent-terminal-composer-dock-block">
                        <SessionTodoDock
                          todos={composerState.todos()}
                          collapsed={todoCollapsed()}
                          onToggle={() => setTodoCollapsed((v) => !v)}
                          collapseLabel={language.t("session.todo.collapse")}
                          expandLabel={language.t("session.todo.expand")}
                        />
                      </div>
                    </Show>
                    <AutoCompactStrip context={contextInfo()} compacting={autoCompactingContext()} />
                    <Show when={composerState.questionRequest()} keyed>
                      {(request) => (
                        <div class="agent-terminal-composer-dock-block">
                          <SessionQuestionDock request={request} onSubmit={() => undefined} />
                        </div>
                      )}
                    </Show>
                    <Show when={composerState.permissionRequest()} keyed>
                      {(request) => (
                        <div class="agent-terminal-composer-dock-block">
                          <SessionPermissionDock
                            request={request}
                            responding={composerState.permissionResponding()}
                            onDecide={composerState.decide}
                          />
                        </div>
                      )}
                    </Show>
                  </div>
                </Show>
                <PromptInput shouldQueue={() => working()} onQueue={enqueueFollowup} onSubmit={resumeScroll} />
              </div>
            </Portal>
          </Show>
        </div>
        </>
      </FileComponentProvider>
    </DataProvider>
  )
}

export function AgentView(props: AgentViewProps) {
  return (
    <Show when={props.projectPath}>
      <MockSessionProviders directory={props.projectPath!} sessionId={props.sessionId}>
        <ErrorBoundary fallback={(error, reset) => <AgentErrorFallback error={error} reset={reset} />}>
          <AgentViewInner {...props} />
        </ErrorBoundary>
      </MockSessionProviders>
    </Show>
  )
}
