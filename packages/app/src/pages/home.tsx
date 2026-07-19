import type { Session } from "@shob/sdk/v2/client"
import {
  createEffect,
  createMemo,
  createRoot,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  startTransition,
  Switch,
} from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createStore } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import { Button } from "@shob/ui/button"
import { Logo } from "@shob/ui/logo"
import { Spinner } from "@shob/ui/spinner"
import { ScrollView } from "@shob/ui/scroll-view"
import { ButtonV2 } from "@shob/ui/v2/button-v2"
import { Icon as IconV2 } from "@shob/ui/v2/icon"
import { IconButtonV2 } from "@shob/ui/v2/icon-button-v2"
import { useLayout, type HomeProjectSelection, type LocalProject } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@shob/core/util/encode"
import { Icon } from "@shob/ui/icon"
import { DateTime } from "luxon"
import { useDialog } from "@shob/ui/context/dialog"
import { useDirectoryPicker } from "@/components/directory-picker"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { ServerConnection, serverName, useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { useServerSync, type ServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import {
  displayName,
  homeProjectDirectories,
  projectForSession,
  sortedRootSessions,
} from "@/pages/layout/helpers"
import { SessionTabAvatar } from "@/pages/layout/session-tab-avatar"
import { sessionTitle } from "@/utils/session-title"
import { pathKey } from "@/utils/path-key"
import { useGlobal } from "@/context/global"
import { useCommand } from "@/context/command"
import { useMarked } from "@shob/ui/context/marked"
import { preloadMarkdown } from "@shob/session-ui/markdown-cache"

const HOME_SESSION_LIMIT = 64
const HOME_SESSION_SEARCH_RESULTS_ID = "home-session-search-results"
const HOME_SEARCH_RESULT_ROW =
  "flex h-10 w-full shrink-0 cursor-default items-center gap-2 border-0 py-3 pl-[18px] pr-6 text-left transition-[background-color] duration-[120ms] ease-in-out hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
const HOME_SEARCH_RESULT_TITLE =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-base [font-weight:530]"
const HOME_SEARCH_RESULT_META =
  "min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]"

type HomeSessionRecord = {
  session: Session
  project: LocalProject
  projectName: string
}

function buildHomeSessionRecords(input: {
  sync: Pick<ServerSync, "child">
  projectDirectories: () => string[]
  projects: () => LocalProject[]
  projectByID: () => Map<string, LocalProject>
}) {
  return [
    ...new Map(
      input
        .projectDirectories()
        .flatMap((directory) => sortedRootSessions(input.sync.child(directory, { bootstrap: false })[0], Date.now()))
        .map((session) => [`${pathKey(session.directory)}:${session.id}`, session] as const),
    ).values(),
  ]
    .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    .flatMap((session) => {
      const project = projectForSession(session, input.projects(), input.projectByID())
      if (!project) return []
      return {
        session,
        project,
        projectName: displayName(project),
      }
    })
}

function matchesHomeSessionSearch(record: HomeSessionRecord, query: string) {
  return `${record.session.title} ${record.projectName}`.toLowerCase().includes(query)
}

function homeSessionSearchKey(record: HomeSessionRecord) {
  return `${pathKey(record.session.directory)}:${record.session.id}`
}

function homeSessionTimeLabel(session: Session) {
  const time = DateTime.fromMillis(session.time.updated ?? session.time.created)
  const now = DateTime.local()
  if (time.hasSame(now, "day")) return time.toLocaleString(DateTime.TIME_SIMPLE)
  if (time.hasSame(now.minus({ days: 1 }), "day")) return "Yesterday"
  return time.toFormat("MMM d")
}

export function NewHome() {
  const sync = useServerSync()
  const layout = useLayout()
  const pickDirectory = useDirectoryPicker()
  const server = useServer()
  const language = useLanguage()
  const global = useGlobal()
  const tabs = useTabs()
  const command = useCommand()
  const marked = useMarked()
  let focusSessionSearch: (() => void) | undefined
  const [state, setState] = createStore({
    search: "",
    searchFocused: false,
  })
  const selection = layout.home.selection

  const focusedServer = createMemo(
    () => global.servers.list().find((conn) => ServerConnection.key(conn) === selection().server) ?? server.current,
  )
  const focusedServerCtx = createMemo(() => {
    const conn = focusedServer()
    if (!conn) return
    return global.ensureServerCtx(conn)
  })
  const focusedSync = () => focusedServerCtx()?.sync ?? sync()
  const projects = createMemo(() => focusedServerCtx()?.projects.list() ?? layout.projects.list())
  const selectedProject = createMemo(() => projects().find((project) => project.worktree === selection().directory))
  const newSessionProject = createMemo(
    () =>
      selectedProject() ??
      projects().find((project) => project.worktree === focusedServerCtx()?.projects.last()) ??
      projects()[0],
  )
  const directories = (project: LocalProject) => [project.worktree, ...(project.sandboxes ?? [])]
  const projectDirectories = createMemo(() => {
    const project = selectedProject()
    if (!project) return projects().flatMap(directories)
    return directories(project)
  })
  const search = createMemo(() => state.search.trim())
  const searchPlaceholder = createMemo(() => {
    const project = selectedProject()
    if (project) {
      return language.t("home.sessions.search.placeholder.scoped", { scope: displayName(project) })
    }
    if (global.servers.list().length > 1) {
      const conn = focusedServer()
      if (conn) {
        return language.t("home.sessions.search.placeholder.scoped", { scope: serverName(conn) })
      }
    }
    return language.t("home.sessions.search.placeholder")
  })
  const sessionLoad = useQuery(() => ({
    queryKey: ["home", "sessions", selection().server, ...projectDirectories()] as const,
    queryFn: async () => {
      await Promise.all(
        projectDirectories().map((directory) =>
          focusedSync().project.loadSessions(directory, { limit: HOME_SESSION_LIMIT }),
        ),
      )
      return null
    },
  }))

  const projectByID = createMemo(
    () => new Map(projects().flatMap((project) => (project.id ? [[project.id, project] as const] : []))),
  )
  const allRecords = createMemo(() =>
    buildHomeSessionRecords({
      sync: focusedSync(),
      projectDirectories,
      projects,
      projectByID,
    }),
  )
  const records = createMemo(() => allRecords().slice(0, HOME_SESSION_LIMIT))
  const searchResults = createMemo(() => {
    const query = search().toLowerCase()
    if (!query) return []
    return allRecords().filter((record) => matchesHomeSessionSearch(record, query))
  })
  const searchOpen = createMemo(() => state.searchFocused && search().length > 0)
  const prefetched = new Set<string>()

  createEffect(() => {
    const ctx = focusedServerCtx()
    if (!ctx) return
    records()
      .slice(0, 2)
      .forEach((record) => {
        const key = `${ServerConnection.key(focusedServer()!)}\0${record.session.id}`
        if (prefetched.has(key)) return
        prefetched.add(key)
        createRoot((dispose) => {
          try {
            const directory = ctx.sync.ensureDirSyncContext(record.session.directory)
            void directory.session
              .sync(record.session.id)
              .then(() => {
                return Promise.all(
                  (ctx.sync.session.data.message[record.session.id] ?? []).flatMap((message) =>
                    (ctx.sync.session.data.part[message.id] ?? []).flatMap((part) => {
                      if (part.type !== "text" || !part.text) return []
                      return preloadMarkdown(part.text, part.id, marked)
                    }),
                  ),
                )
              })
              .catch(() => {})
              .finally(dispose)
          } catch {
            dispose()
          }
        })
      })
  })

  function setSelection(next: HomeProjectSelection) {
    layout.home.setSelection(next)
  }

  function closeSearch() {
    setState("search", "")
    setState("searchFocused", false)
  }

  function selectSearchSession(session: Session) {
    openSession(session)
    closeSearch()
  }

  command.register("home", () => [
    {
      id: "home.sessions.search.focus",
      title: searchPlaceholder(),
      keybind: "mod+f",
      hidden: true,
      onSelect: () => focusSessionSearch?.(),
    },
  ])

  createEffect(() => {
    const list = global.servers.list()
    if (list.some((conn) => ServerConnection.key(conn) === selection().server)) return
    const conn = list.find((conn) => ServerConnection.key(conn) === server.key) ?? list[0]
    if (conn) setSelection({ server: ServerConnection.key(conn) })
  })

  function addProjects(conn: ServerConnection.Any, directories: string[]) {
    const directory = directories[0]
    if (!directory) return
    const ctx = global.ensureServerCtx(conn)
    directories.forEach(ctx.projects.open)
    ctx.projects.touch(directory)
    setSelection({ server: ServerConnection.key(conn), directory })
  }

  function openNewSession() {
    const conn = focusedServer()
    const project = newSessionProject()
    if (!conn || !project) return
    openProjectNewSession(conn, project.worktree)
  }

  function openProjectNewSession(conn: ServerConnection.Any, directory: string) {
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    tabs.newDraft({ server: ServerConnection.key(conn), directory })
  }

  function openSession(session: Session) {
    const project = projectForSession(session, projects(), projectByID())
    const conn = focusedServer()
    if (!conn) return
    const directory = project?.worktree ?? session.directory
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    startTransition(() => {
      const tab = tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
      tabs.select(tab)
    })
  }

  function chooseProject(conn: ServerConnection.Any) {
    if (global.servers.health[ServerConnection.key(conn)]?.healthy === false) return

    function resolve(result: string | string[] | null) {
      addProjects(conn, homeProjectDirectories(result))
    }

    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: resolve,
    })
  }

  return (
    <div class="flex h-full w-full flex-col overflow-hidden bg-v2-background-bg-base">
      <div class="flex h-full w-full flex-col items-center overflow-y-auto">
        <div class="flex w-full max-w-[520px] flex-col items-center px-6 pb-20 pt-[min(18vh,148px)]">
          <header class="mb-9 flex flex-col items-center text-center">
            <div class="mb-5 flex size-11 items-center justify-center rounded-[14px] bg-v2-background-bg-layer-01 shadow-[inset_0_0_0_0.5px_var(--v2-border-border-muted),0_1px_2px_rgba(0,0,0,0.04)]">
              <Logo class="w-6 opacity-90" />
            </div>
            <h1 class="text-[28px] leading-[1.15] tracking-[-0.03em] text-v2-text-text-base [font-weight:600]">
              {language.t("home.welcome.title")}
            </h1>
            <p class="mt-2 max-w-[320px] text-[14px] leading-relaxed text-v2-text-text-muted [font-weight:440]">
              {language.t("home.welcome.description")}
            </p>
          </header>

          <section class="relative z-30 w-full" aria-label={language.t("home.sessions.search.placeholder")}>
            <HomeSessionSearch
              value={state.search}
              placeholder={searchPlaceholder()}
              open={searchOpen()}
              loading={sessionLoad.isLoading}
              results={searchResults()}
              showProjectName={!selectedProject()}
              server={selection().server}
              noResultsLabel={language.t("home.sessions.search.noResults", { query: search() })}
              bindFocus={(focus) => {
                focusSessionSearch = focus
              }}
              onInput={(value) => setState("search", value)}
              onFocus={() => setState("searchFocused", true)}
              onClose={closeSearch}
              onSelect={selectSearchSession}
            />
          </section>

          <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Show when={newSessionProject()}>
              <ButtonV2
                data-action="home-new-session"
                variant="neutral"
                size="normal"
                icon="edit"
                onClick={openNewSession}
              >
                {language.t("command.session.new")}
              </ButtonV2>
            </Show>
            <Show when={projects().length === 0 && focusedServer()}>
              {(conn) => (
                <ButtonV2
                  data-action="home-open-project"
                  variant="outline"
                  size="normal"
                  icon="folder-add-left"
                  onClick={() => chooseProject(conn())}
                >
                  {language.t("command.project.open")}
                </ButtonV2>
              )}
            </Show>
          </div>

          <Show when={sessionLoad.isLoading}>
            <div class="mt-12 w-full" aria-busy="true" aria-label={language.t("common.loading")}>
              <div class="mb-3 px-1 text-[12px] text-v2-text-text-faint [font-weight:500]">
                {language.t("sidebar.project.recentSessions")}
              </div>
              <div class="flex flex-col gap-1" aria-hidden="true">
                <For each={[0, 1, 2]}>
                  {() => <div class="h-12 rounded-xl bg-v2-background-bg-layer-01 opacity-70" />}
                </For>
              </div>
            </div>
          </Show>

          <Show when={!sessionLoad.isLoading && records().length > 0}>
            <section
              class="mt-12 w-full animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
              aria-label={language.t("sidebar.project.recentSessions")}
            >
              <div class="mb-2 px-1 text-[12px] text-v2-text-text-faint [font-weight:500]">
                {language.t("sidebar.project.recentSessions")}
              </div>
              <div class="flex flex-col gap-0.5">
                <For each={records().slice(0, 6)}>
                  {(record) => (
                    <HomeRecentSessionRow
                      record={record}
                      showProjectName={!selectedProject()}
                      server={selection().server}
                      openSession={openSession}
                    />
                  )}
                </For>
              </div>
            </section>
          </Show>

          <Show when={!sessionLoad.isLoading && records().length === 0 && projects().length > 0}>
            <div class="mt-14 flex max-w-xs flex-col items-center text-center">
              <p class="text-[13px] text-v2-text-text-base [font-weight:530]">
                {language.t("home.sessions.empty")}
              </p>
              <p class="mt-1.5 text-[13px] leading-relaxed text-v2-text-text-muted [font-weight:440]">
                {language.t("home.sessions.empty.description")}
              </p>
            </div>
          </Show>

          <Show when={!sessionLoad.isLoading && projects().length === 0}>
            <div class="mt-14 flex max-w-xs flex-col items-center text-center">
              <p class="text-[13px] text-v2-text-text-base [font-weight:530]">{language.t("home.empty.title")}</p>
              <p class="mt-1.5 text-[13px] leading-relaxed text-v2-text-text-muted [font-weight:440]">
                {language.t("home.empty.description")}
              </p>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}

function HomeSessionLeading(props: {
  project: LocalProject
  session: Session
  server: ServerConnection.Key
  revealProjectOnHover: boolean
}) {
  return (
    <div class="relative shrink-0">
      <SessionTabAvatar
        project={props.project}
        directory={props.session.directory}
        sessionId={props.session.id}
        server={props.server}
        revealProjectOnHover={props.revealProjectOnHover}
      />
    </div>
  )
}

function HomeSessionSearch(props: {
  value: string
  placeholder: string
  open: boolean
  loading: boolean
  results: HomeSessionRecord[]
  showProjectName: boolean
  server: ServerConnection.Key
  noResultsLabel: string
  bindFocus: (focus: () => void) => void
  onInput: (value: string) => void
  onFocus: () => void
  onClose: () => void
  onSelect: (session: Session) => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({ active: "" })
  let root: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined
  let listRef: HTMLDivElement | undefined

  const focusInput = () => {
    input?.focus()
    props.onFocus()
  }

  onMount(() => {
    props.bindFocus(focusInput)
  })

  const syncActive = (results: HomeSessionRecord[]) => {
    if (results.length === 0) {
      setStore("active", "")
      return
    }
    if (!results.some((record) => homeSessionSearchKey(record) === store.active)) {
      setStore("active", homeSessionSearchKey(results[0]))
    }
  }

  createEffect(() => syncActive(props.results))

  createEffect(
    on(
      () => props.value,
      () => syncActive(props.results),
    ),
  )

  const scrollActiveIntoView = () => {
    const key = store.active
    if (!key || !listRef) return
    const element = listRef.querySelector<HTMLElement>(`[data-key="${key}"]`)
    element?.scrollIntoView({ block: "nearest" })
  }

  const moveActive = (delta: number) => {
    const results = props.results
    if (results.length === 0) return
    const index = results.findIndex((record) => homeSessionSearchKey(record) === store.active)
    const start = index === -1 ? 0 : index
    const next = (start + delta + results.length) % results.length
    setStore("active", homeSessionSearchKey(results[next]))
    scrollActiveIntoView()
  }

  const selectActive = () => {
    const record = props.results.find((item) => homeSessionSearchKey(item) === store.active)
    if (!record) return
    props.onSelect(record.session)
  }
  const clear = () => {
    props.onClose()
    input?.focus()
  }

  onCleanup(
    makeEventListener(document, "pointerdown", (event) => {
      if (!props.open) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (root?.contains(target)) return
      props.onClose()
    }),
  )

  return (
    <div class="w-full">
      <div ref={root} data-component="home-session-search" class="relative z-30 w-full">
        <Show when={props.open}>
          <div
            data-component="home-session-search-panel"
            class="absolute flex flex-col overflow-hidden rounded-[16px] border border-v2-border-border-muted bg-v2-background-bg-base shadow-[var(--v2-elevation-floating)]"
            style={{
              top: "-6px",
              left: "-6px",
              width: "calc(100% + 12px)",
            }}
          >
            <div class="flex flex-col pt-14">
              <div id={HOME_SESSION_SEARCH_RESULTS_ID} role="listbox" class="flex flex-col gap-3 pt-3">
                <Show
                  when={!props.loading}
                  fallback={
                    <div class="flex items-center justify-center px-4 py-3 text-v2-text-text-muted [font-weight:440]">
                      <Spinner class="size-4" />
                    </div>
                  }
                >
                  <Show
                    when={props.results.length > 0}
                    fallback={
                      <p class="my-1.5 px-4 pb-3 text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]">
                        {props.noResultsLabel}
                      </p>
                    }
                  >
                    <div class="flex flex-col">
                      <p class="my-1 px-4 text-[12px] leading-4 text-v2-text-text-faint [font-weight:500]">
                        {language.t("home.sessions.search.sessions")}
                      </p>
                      <ScrollView class="max-h-80" viewportRef={(el) => (listRef = el)}>
                        <div class="flex flex-col gap-px pb-2">
                          <For each={props.results}>
                            {(record) => (
                              <HomeSessionSearchResultRow
                                record={record}
                                showProjectName={props.showProjectName}
                                server={props.server}
                                selected={store.active === homeSessionSearchKey(record)}
                                onHighlight={() => setStore("active", homeSessionSearchKey(record))}
                                onSelect={(session) => props.onSelect(session)}
                              />
                            )}
                          </For>
                        </div>
                      </ScrollView>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>
          </div>
        </Show>
        <label class="relative z-20 flex h-12 w-full items-center gap-3 rounded-[14px] border border-v2-border-border-muted bg-v2-background-bg-layer-01 py-1 pl-4 pr-2 text-v2-icon-icon-muted shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background-color,box-shadow,border-color] duration-200 ease-out hover:border-v2-border-border-base hover:bg-v2-background-bg-layer-02 focus-within:border-v2-border-border-base focus-within:bg-v2-background-bg-layer-02 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--v2-border-border-base)_16%,transparent),0_8px_24px_rgba(0,0,0,0.08)]">
          <IconV2 name="magnifying-glass" size="large" class="text-v2-icon-icon-muted" />
          <input
            ref={input}
            class="relative z-20 h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] text-v2-text-text-base outline-0 [font-weight:500] placeholder:text-v2-text-text-muted/70"
            value={props.value}
            placeholder={props.placeholder}
            aria-label={props.placeholder}
            aria-expanded={props.open}
            aria-controls={HOME_SESSION_SEARCH_RESULTS_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              store.active && props.open ? `home-session-search-option-${store.active}` : undefined
            }
            onFocus={() => props.onFocus()}
            onInput={(event) => props.onInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                props.onClose()
                input?.blur()
                return
              }
              if (!props.open || props.results.length === 0) return
              if (event.altKey || event.metaKey) return
              if (event.key === "ArrowDown") {
                event.preventDefault()
                moveActive(1)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                moveActive(-1)
                return
              }
              if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault()
                selectActive()
              }
            }}
          />
          <div class="relative z-20 flex shrink-0 items-center gap-1">
            <Show when={props.value}>
              <>
                <span class="mx-0.5 h-4 w-px bg-v2-border-border-muted" aria-hidden="true" />
                <IconButtonV2
                  type="button"
                  variant="ghost-muted"
                  size="small"
                  class="shrink-0"
                  icon={<IconV2 name="close" size="large" class="text-v2-icon-icon-muted" />}
                  aria-label={language.t("common.clear")}
                  title={language.t("common.clear")}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={clear}
                />
              </>
            </Show>
          </div>
        </label>
      </div>
    </div>
  )
}

function HomeSessionSearchResultRow(props: {
  record: HomeSessionRecord
  showProjectName: boolean
  server: ServerConnection.Key
  selected: boolean
  onHighlight: () => void
  onSelect: (session: Session) => void
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)
  const showProjectName = () => props.showProjectName && props.record.projectName

  const key = () => homeSessionSearchKey(props.record)

  return (
    <button
      type="button"
      id={`home-session-search-option-${key()}`}
      data-key={key()}
      data-component="home-session-search-row"
      role="option"
      aria-selected={props.selected}
      classList={{
        [HOME_SEARCH_RESULT_ROW]: true,
        "bg-v2-overlay-simple-overlay-hover": props.selected,
        group: !!showProjectName(),
      }}
      onMouseEnter={() => props.onHighlight()}
      onClick={() => props.onSelect(props.record.session)}
    >
      <HomeSessionLeading
        project={props.record.project}
        session={props.record.session}
        server={props.server}
        revealProjectOnHover={!!showProjectName()}
      />
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          class={`${HOME_SEARCH_RESULT_TITLE} ${showProjectName() ? "max-w-[min(70%,480px)] flex-[0_1_auto]" : "flex-[1_1_auto]"}`}
        >
          {title()}
        </span>
        <Show when={showProjectName()}>
          <span class={HOME_SEARCH_RESULT_META}>{props.record.projectName}</span>
        </Show>
      </div>
    </button>
  )
}

function HomeRecentSessionRow(props: {
  record: HomeSessionRecord
  showProjectName: boolean
  server: ServerConnection.Key
  openSession: (session: Session) => void
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)
  const meta = createMemo(() => {
    const time = homeSessionTimeLabel(props.record.session)
    if (props.showProjectName && props.record.projectName) {
      return `${props.record.projectName} · ${time}`
    }
    return time
  })

  return (
    <button
      type="button"
      data-component="home-session-row"
      class="group flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-v2-background-bg-layer-01 focus-visible:bg-v2-background-bg-layer-01 focus-visible:outline-none"
      onClick={() => props.openSession(props.record.session)}
    >
      <HomeSessionLeading
        project={props.record.project}
        session={props.record.session}
        server={props.server}
        revealProjectOnHover={props.showProjectName}
      />
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-base [font-weight:530]">
          {title()}
        </span>
        <span class="min-w-0 truncate text-[12px] leading-4 text-v2-text-text-faint [font-weight:440]">
          {meta()}
        </span>
      </span>
      <IconV2
        name="chevron-left"
        size="small"
        class="shrink-0 rotate-180 text-v2-icon-icon-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  )
}

export function LegacyHome() {
  const sync = useServerSync()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const navigate = useNavigate()
  const global = useGlobal()
  const server = useServer()
  const language = useLanguage()
  const homedir = createMemo(() => sync().data.path.home)
  const serverUnreachable = createMemo(() => global.servers.health[server.key]?.healthy === false)
  const recent = createMemo(() => {
    return sync()
      .data.project.slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .slice(0, 5)
  })

  const serverDotClass = createMemo(() => {
    const healthy = global.servers.health[server.key]?.healthy
    if (healthy === true) return "bg-icon-success-base"
    if (healthy === false) return "bg-icon-critical-base"
    return "bg-border-weak-base"
  })

  function openProject(server: ServerConnection.Any, directory: string) {
    const serverCtx = global.ensureServerCtx(server)
    serverCtx.projects.open(directory)
    serverCtx.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  function chooseProject() {
    if (serverUnreachable()) return
    const s = server.current
    if (!s) return

    const resolve = (result: string | string[] | null) => {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(s, directory)
        }
      } else if (result) {
        openProject(s, result)
      }
    }

    pickDirectory({
      server: s,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: resolve,
    })
  }

  return (
    <div class="mx-auto mt-55 w-full md:w-auto px-4">
      <Logo class="md:w-xl opacity-12" />
      <Button
        size="large"
        variant="ghost"
        class="mt-4 mx-auto text-14-regular text-text-weak"
        onClick={() => dialog.show(() => <DialogSelectServer />)}
      >
        <div
          classList={{
            "size-2 rounded-full": true,
            [serverDotClass()]: true,
          }}
        />
        {server.name}
      </Button>
      <Switch>
        <Match when={sync().data.project.length > 0}>
          <div class="mt-20 w-full flex flex-col gap-4">
            <div class="flex gap-2 items-center justify-between pl-3">
              <div class="text-14-medium text-text-strong">{language.t("home.recentProjects")}</div>
              <Button
                icon="folder-add-left"
                size="normal"
                class="pl-2 pr-3"
                disabled={serverUnreachable()}
                onClick={chooseProject}
              >
                {language.t("command.project.open")}
              </Button>
            </div>
            <ul class="flex flex-col gap-2">
              <For each={recent()}>
                {(project) => (
                  <Button
                    size="large"
                    variant="ghost"
                    class="text-14-mono text-left justify-between px-3"
                    onClick={() => openProject(server.current!, project.worktree)}
                  >
                    {project.worktree.replace(homedir(), "~")}
                    <div class="text-14-regular text-text-weak">
                      {DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative()}
                    </div>
                  </Button>
                )}
              </For>
            </ul>
          </div>
        </Match>
        <Match when={!sync().ready}>
          <div class="mt-30 mx-auto flex flex-col items-center gap-3">
            <div class="text-12-regular text-text-weak">{language.t("common.loading")}</div>
            <Button class="px-3" disabled={serverUnreachable()} onClick={chooseProject}>
              {language.t("command.project.open")}
            </Button>
          </div>
        </Match>
        <Match when={true}>
          <div class="mt-30 mx-auto flex flex-col items-center gap-3">
            <Icon name="folder-add-left" size="large" />
            <div class="flex flex-col gap-1 items-center justify-center">
              <div class="text-14-medium text-text-strong">{language.t("home.empty.title")}</div>
              <div class="text-12-regular text-text-weak">{language.t("home.empty.description")}</div>
            </div>
            <Button class="px-3 mt-1" disabled={serverUnreachable()} onClick={chooseProject}>
              {language.t("command.project.open")}
            </Button>
          </div>
        </Match>
      </Switch>
    </div>
  )
}
