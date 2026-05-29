import { createEffect, createMemo, createSignal, ErrorBoundary, For, onCleanup, Show } from "solid-js"
import { PromptInput } from "../opencode-ported/prompt-input"
import { MockSessionProviders } from "../opencode-ported/mock-session-layout"
import { useSync } from "@/context/sync"
import { useNavigate, useParams } from "@solidjs/router"
import { AssistantParts, Message } from "@opencode-ai/ui/message-part"
import { DataProvider, FileComponentProvider } from "@opencode-ai/ui/context"
import { Icon } from "@opencode-ai/ui/icon"
import { sessionTitle } from "@/utils/session-title"
import { createSessionComposerState } from "@/opencode-ported/composer/session-composer-state"
import { SessionQuestionDock } from "@/opencode-ported/composer/session-question-dock"
import { SessionPermissionDock } from "@/opencode-ported/composer/session-permission-dock"
import { SessionTodoDock } from "@/opencode-ported/composer/session-todo-dock"
import { useLanguage } from "@/context/language"
import { File as OpenCodeFile } from "@opencode-ai/ui/file"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import type { EventSessionError, Message as ChatMessage, Part, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { useLocal } from "@/context/local"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { Button } from "@opencode-ai/ui/button"
import { formatError } from "@/pages/error"
import { useStore } from "../store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectModel } from "@/components/dialog-select-model"
import { nativeApi } from "@/services/native"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"
import { Card, CardDescription, CardTitle } from "@opencode-ai/ui/card"
import { SessionRetry } from "@opencode-ai/ui/session-retry"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { formatServerError } from "@/utils/server-errors"

interface AgentViewProps {
  sessionId: string
  projectPath?: string
}

const basename = (path?: string | null) => {
  if (!path) return "No project"
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

const idleStatus: SessionStatus = { type: "idle" }

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
    <Card variant="error" class="agent-terminal-error-card error-card">
      <CardTitle variant="error">{language.t("notification.session.error.title")}</CardTitle>
      <CardDescription>{detail()}</CardDescription>
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

function AgentViewInner(props: AgentViewProps) {
  const sync = useSync()
  const sdk = useSDK()
  const params = useParams()
  const navigate = useNavigate()
  const activeSidebarSessionId = useStore((s) => s.activeSessionId)
  const setActiveSidebarSession = useStore((s) => s.setActiveSession)
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const language = useLanguage()
  const local = useLocal()
  const dialog = useDialog()
  const [showJump, setShowJump] = createSignal(false)
  const [todoCollapsed, setTodoCollapsed] = createSignal(false)
  const [gitBranch, setGitBranch] = createSignal("")
  const [gitChanges, setGitChanges] = createSignal<number | null>(null)
  let scrollRef: HTMLDivElement | undefined
  let rafId: number | undefined
  const composerState = createSessionComposerState({ closeMs: 320 })

  const activeSessionId = createMemo(() => {
    const id = params.id || props.sessionId
    return id?.startsWith("ses") ? id : undefined
  })

  const messages = createMemo<ChatMessage[]>(() => {
    const sessionID = activeSessionId()
    return sessionID ? (sync.data.message[sessionID] ?? []) : []
  })
  const getParts = (messageID: string): Part[] => sync.data.part[messageID] ?? []
  const info = createMemo(() => {
    const sessionID = activeSessionId()
    return sessionID ? sync.session.get(sessionID) : undefined
  })
  const title = createMemo(() => sessionTitle(info()?.title) || "New session")
  const parentSessionID = createMemo(() => {
    const session = info() as { parentID?: string } | undefined
    return session?.parentID
  })
  const statusInfo = createMemo<SessionStatus>(() => {
    const sessionID = activeSessionId()
    return sessionID ? sync.data.session_status[sessionID] ?? idleStatus : idleStatus
  })
  const status = createMemo(() => statusInfo().type)
  const working = createMemo(() => status() !== "idle")

  const autoScroll = createAutoScroll({
    working,
    overflowAnchor: "dynamic",
    onUserInteracted: () => scheduleJumpStateUpdate(),
  })
  const sessionEventError = createMemo(() => {
    const sessionID = activeSessionId()
    const error = sessionID ? sync.data.session_error[sessionID] : undefined
    if (isAbortError(error) || isRecoveringError(error)) return
    return error
  })
  const currentProjectName = createMemo(() => {
    const current = projects().find((project) => project.id === currentProjectId())
    return current?.name || basename(current?.path || props.projectPath)
  })
  const selectedModel = createMemo(() => local.model.current())
  const selectedAgent = createMemo(() => local.agent.current()?.name || "auto")
  const selectedVariant = createMemo(() => local.model.variant.current() || "default")
  const userMessages = createMemo(() => messages().filter((message) => message.role === "user"))
  const sessionID = createMemo(() => activeSessionId() ?? "")
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
  const isNewSession = createMemo(() => messages().length === 0)

  createEffect(() => {
    const sessionID = activeSessionId()
    if (!sessionID) return
    void sync.session.sync(sessionID)
  })

  createEffect(() => {
    const path = props.projectPath
    setGitBranch("")
    setGitChanges(null)
    if (!path) return

    let cancelled = false
    void nativeApi.invoke("get_git_branch", { path })
      .then((info: any) => {
        if (cancelled) return
        setGitBranch(typeof info?.head === "string" ? info.head : "")
      })
      .catch(() => {
        if (!cancelled) setGitBranch("")
      })

    void nativeApi.invoke("get_git_status", { path })
      .then((status: any) => {
        if (cancelled) return
        const count = Array.isArray(status?.changedFiles) ? status.changedFiles.length : null
        setGitChanges(count)
      })
      .catch(() => {
        if (!cancelled) setGitChanges(null)
      })

    onCleanup(() => {
      cancelled = true
    })
  })

  // Keep global sidebar/terminal active session in sync with in-view route changes
  // (e.g. opening a subagent session from inside the agent timeline).
  createEffect(() => {
    const routeSessionID = params.id
    if (!routeSessionID?.startsWith("ses")) return
    if (activeSidebarSessionId() === routeSessionID) return
    setActiveSidebarSession(routeSessionID)
  })

  const updateJumpState = () => {
    if (!scrollRef) return
    const max = scrollRef.scrollHeight - scrollRef.clientHeight
    const distance = max - scrollRef.scrollTop
    const jumpThreshold = Math.max(400, scrollRef.clientHeight)
    setShowJump(max > 1 && distance > jumpThreshold)
  }

  const scheduleJumpStateUpdate = () => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      updateJumpState()
      rafId = undefined
    })
  }

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
      queueMicrotask(scheduleJumpStateUpdate)
    })
    onCleanup(unsub)
  })

  const jumpToBottom = () => {
    autoScroll.forceScrollToBottom()
    setShowJump(false)
  }

  createEffect(() => {
    messages()
    queueMicrotask(scheduleJumpStateUpdate)
  })

  createEffect(() => {
    autoScroll.userScrolled()
    scheduleJumpStateUpdate()
  })

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
  })

  const setScrollRef = (el: HTMLDivElement | undefined) => {
    scrollRef = el
    autoScroll.scrollRef(el)
    if (el) queueMicrotask(scheduleJumpStateUpdate)
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

  const FilePreview = (fileProps: any) => <OpenCodeFile {...fileProps} />
  const goToParentSession = () => {
    const parentID = parentSessionID()
    const dir = params.dir
    if (!parentID || !dir) return
    navigate(`/${dir}/session/${parentID}`)
  }

  return (
    <DataProvider data={sync.data} directory={props.projectPath ?? ""}>
      <FileComponentProvider component={FilePreview}>
        <div class="agent-terminal-view relative flex h-full min-h-0 w-full flex-col overflow-x-hidden bg-background-stronger text-foreground">
          <div class="relative min-h-0 flex-1 overflow-hidden">
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
                    "box-shadow":
                      "0 51px 60px 0 rgba(0,0,0,0.10), 0 15px 18px 0 rgba(0,0,0,0.12), 0 6.386px 7.513px 0 rgba(0,0,0,0.12), 0 2.31px 2.717px 0 rgba(0,0,0,0.20)",
                  }}
                >
                  <Icon name="arrow-down-to-line" size="small" />
                </div>
              </button>
            </div>

            <div
              ref={setScrollRef}
              data-slot="session-turn-content"
              class="agent-terminal-scroll h-full min-w-0 overflow-x-hidden overflow-y-auto thin-scrollbar"
              classList={{ "agent-terminal-scroll-empty": messages().length === 0 }}
              style={{
                "--session-title-height": "40px",
                "--sticky-accordion-top": "48px",
              }}
              onScroll={() => {
                autoScroll.handleScroll()
                scheduleJumpStateUpdate()
              }}
            >
              <div onClick={autoScroll.handleInteraction}>
                <div
                  data-session-title
                  class="agent-terminal-title sticky top-0 z-30 w-full pb-4 pl-2 pr-3 md:mx-auto md:max-w-200 md:pl-4 md:pr-3 2xl:max-w-[1000px]"
                >
                  <div class="flex h-12 w-full items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-1 items-center gap-2 pr-3">
                      <h1 data-slot="session-title-child" class="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-text-strong">
                        {title()}
                      </h1>
                    </div>
                    <Show when={parentSessionID()}>
                      <button
                        type="button"
                        class="shrink-0 rounded-[4px] border border-border px-2 py-1 font-mono text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={goToParentSession}
                      >
                        Back to parent
                      </button>
                    </Show>
                  </div>
                </div>

                <div
                  ref={autoScroll.contentRef}
                  class="agent-terminal-buffer min-h-full pb-56 pt-2"
                  classList={{ "agent-terminal-buffer-empty": messages().length === 0 }}
                >
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
                            if (part.type === "text" && part.text?.trim()) visible++
                            if (part.type === "tool" && part.tool !== "todowrite") visible++
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

                      return (
                        <div
                          id={`message-${message.id}`}
                          data-message-id={message.id}
                          data-timeline-row="UserMessage"
                          class="agent-terminal-turn min-w-0 w-full max-w-full md:mx-auto md:max-w-200 2xl:max-w-[1000px]"
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
                                        shellToolDefaultOpen={false}
                                        editToolDefaultOpen={false}
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
                      <div class="agent-terminal-assistant min-w-0 w-full max-w-full pt-3 md:mx-auto md:max-w-200 2xl:max-w-[1000px]">
                        <div data-component="session-turn" class="relative min-w-0 w-full">
                          <div data-slot="session-turn-message-container" class="w-full">
                            <div data-slot="session-turn-assistant-content">
                              <Message message={message} parts={getParts(message.id)} showReasoningSummaries={true} />
                            </div>
                            <Show when={assistantMessageError(message)} keyed>
                              {(error) => <AgentTurnError error={error} />}
                            </Show>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>

                  <Show when={messages().length === 0}>
                    <div class="agent-terminal-empty relative isolate flex min-h-0 flex-col items-stretch justify-center px-2 text-left overflow-visible md:mx-auto md:px-5">
                      <div class="agent-terminal-new-session relative z-10 w-full">
                        <div class="relative z-10 w-full text-left">
                          <PromptInput />
                        </div>

                        <div class="agent-terminal-session-bar">
                          <div class="agent-terminal-session-controls">
                            <label class="agent-terminal-project-switch">
                              <Icon name="folder" class="size-3.5" />
                              <select
                                value={currentProjectId() ?? ""}
                                onChange={(event) => setCurrentProject(event.currentTarget.value || null)}
                                aria-label="Switch project"
                              >
                                <For each={projects()}>
                                  {(project) => <option value={project.id}>{project.name || basename(project.path)}</option>}
                                </For>
                              </select>
                            </label>

                            <button
                              type="button"
                              class="agent-terminal-model-switch"
                              onClick={() => dialog.show(() => <DialogSelectModel model={local.model} />)}
                            >
                              <Show when={selectedModel()?.provider?.id} fallback={<Icon name="models" class="size-3.5" />}>
                                <ProviderIcon id={selectedModel()?.provider?.id ?? ""} class="size-3.5" />
                              </Show>
                              <span>{selectedModel()?.name || "Select model"}</span>
                            </button>

                            <div class="agent-terminal-session-meta agent-terminal-session-meta-inline">
                              <div class="agent-terminal-meta-chip">
                                <Icon name="brain" class="size-3.5" />
                                <span class="capitalize">{selectedAgent()}</span>
                              </div>
                              <Show when={gitBranch()}>
                                <div class="agent-terminal-meta-chip">
                                  <Icon name="branch" class="size-3.5" />
                                  <span>{gitBranch()}</span>
                                </div>
                              </Show>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          </div>

          <Show when={!isNewSession()}>
            <div
              data-component="session-prompt-dock"
              class="agent-terminal-dock pointer-events-none absolute inset-x-0 bottom-0 z-40 flex w-full flex-col items-center justify-center pb-3"
            >
              <div class="pointer-events-auto w-full px-2 md:px-3 md:mx-auto md:max-w-200 2xl:max-w-[1000px]">
                <Show when={composerState.questionRequest()} keyed>
                  {(request) => (
                    <div class="pb-2">
                      <SessionQuestionDock request={request} onSubmit={() => undefined} />
                    </div>
                  )}
                </Show>
                <Show when={composerState.permissionRequest()} keyed>
                  {(request) => (
                    <div class="pb-2">
                      <SessionPermissionDock
                        request={request}
                        responding={composerState.permissionResponding()}
                        onDecide={composerState.decide}
                      />
                    </div>
                  )}
                </Show>
                <Show when={composerState.dock() && composerState.todos().length > 0}>
                  <div class="pb-2">
                    <SessionTodoDock
                      todos={composerState.todos()}
                      collapsed={todoCollapsed()}
                      onToggle={() => setTodoCollapsed((v) => !v)}
                      collapseLabel={language.t("session.todo.collapse")}
                      expandLabel={language.t("session.todo.expand")}
                    />
                  </div>
                </Show>
                <PromptInput />
              </div>
            </div>
          </Show>
        </div>
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
