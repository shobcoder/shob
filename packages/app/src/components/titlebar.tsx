import { createEffect, createMemo, createResource, Match, Show, Switch, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation, useNavigate } from "@solidjs/router"
import { IconButton } from "@shob/ui/icon-button"
import { Icon } from "@shob/ui/icon"
import { Button } from "@shob/ui/button"
import { Tooltip, TooltipKeybind } from "@shob/ui/tooltip"
import { useTheme } from "@shob/ui/theme/context"

import { LayoutRoute, useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { WindowsAppMenu } from "./windows-app-menu"
import { applyPath, backPath, forwardPath } from "./titlebar-history"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createMediaQuery } from "@solid-primitives/media"
import { readSessionTabsRemovedDetail, SESSION_TABS_REMOVED_EVENT } from "@/components/titlebar-session-events"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import "./titlebar.css"

type TauriDesktopWindow = {
  startDragging?: () => Promise<void>
  toggleMaximize?: () => Promise<void>
}

type TauriThemeWindow = {
  setTheme?: (theme?: "light" | "dark" | null) => Promise<void>
}

type TauriApi = {
  window?: {
    getCurrentWindow?: () => TauriDesktopWindow
  }
  webviewWindow?: {
    getCurrentWebviewWindow?: () => TauriThemeWindow
  }
}

const tauriApi = () => (window as unknown as { __TAURI__?: TauriApi }).__TAURI__
const currentDesktopWindow = () => tauriApi()?.window?.getCurrentWindow?.()
const currentThemeWindow = () => tauriApi()?.webviewWindow?.getCurrentWebviewWindow?.()
const legacyTitlebarHeight = 40
const v2TitlebarHeight = 36
const minTitlebarZoom = 0.25
const windowsControlsBaseWidth = 138 // 3 native Windows caption buttons at 46px each.

export type TitlebarUpdate = {
  version: () => string | undefined
  installing: () => boolean
  install: () => void
}

export function Titlebar(props: { update?: TitlebarUpdate }) {
  const layout = useLayout()
  const platform = usePlatform()
  const command = useCommand()
  const language = useLanguage()
  const settings = useSettings()
  const theme = useTheme()
  const server = useServer()
  const navigate = useNavigate()
  const location = useLocation()
  const useV2Titlebar = createMemo(() => true)
  const mobile = createMediaQuery("(max-width: 767px)")
  const bottom = createMemo(() => mobile() && settings.general.mobileTitlebarPosition() === "bottom")

  const mac = createMemo(() => platform.platform === "desktop" && platform.os === "macos")
  const windows = createMemo(() => platform.platform === "desktop" && platform.os === "windows")
  const electronWindows = createMemo(() => windows() && !tauriApi())
  const linux = createMemo(() => platform.platform === "desktop" && platform.os === "linux")
  const web = createMemo(() => platform.platform === "web")
  const zoom = () => platform.webviewZoom?.() ?? 1
  const titlebarZoom = () => (windows() ? Math.max(zoom(), minTitlebarZoom) : zoom())
  const counterZoom = () => (windows() && titlebarZoom() < 1 ? 1 / titlebarZoom() : 1)
  const minHeight = () => {
    const height = v2TitlebarHeight
    if (mac()) return `${height / zoom()}px`
    if (windows()) return `${height / Math.min(titlebarZoom(), 1)}px`
    return undefined
  }
  const windowsControlsWidth = () => `${windowsControlsBaseWidth / Math.max(titlebarZoom(), 1)}px`

  const [history, setHistory] = createStore({
    stack: [] as string[],
    index: 0,
    action: undefined as "back" | "forward" | undefined,
  })

  const path = () => `${location.pathname}${location.search}${location.hash}`
  createEffect(() => {
    const current = path()

    untrack(() => {
      const next = applyPath(history, current)
      if (next === history) return
      setHistory(next)
    })
  })

  const canBack = createMemo(() => history.index > 0)
  const canForward = createMemo(() => history.index < history.stack.length - 1)
  const backButtonPage = createMemo(() => location.pathname === "/settings")
  const hasProjects = createMemo(() => layout.projects.list().length > 0)
  const nav = createMemo(() => settings.general.showNavigation())
  const updateState = createMemo<TitlebarUpdatePillState>(() => {
    const installing = props.update?.installing() ?? false
    const version = props.update?.version()
    return {
      visible: version !== undefined || installing,
      installing,
      label: "Update",
      ariaLabel: language.t("toast.update.action.installRestart"),
      title: version ? `Update ${version}` : undefined,
      onInstall: () => props.update?.install(),
    }
  })
  const v2RightState = createMemo<TitlebarV2RightState>(() => ({
    update: updateState(),
  }))

  const back = () => {
    const next = backPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  const goBackOrHome = () => {
    if (canBack()) {
      back()
      return
    }
    navigate("/")
  }

  const forward = () => {
    const next = forwardPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  command.register(() => [
    {
      id: "common.goBack",
      title: language.t("common.goBack"),
      category: language.t("command.category.view"),
      keybind: "mod+[",
      onSelect: back,
    },
    {
      id: "common.goForward",
      title: language.t("common.goForward"),
      category: language.t("command.category.view"),
      keybind: "mod+]",
      onSelect: forward,
    },
  ])

  const getWin = () => {
    if (platform.platform !== "desktop") return
    return currentDesktopWindow()
  }

  createEffect(() => {
    if (platform.platform !== "desktop") return

    const scheme = theme.colorScheme()
    const value = scheme === "system" ? null : scheme

    const win = currentThemeWindow()
    if (!win?.setTheme) return

    void win.setTheme(value).catch(() => undefined)
  })

  const interactive = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false

    const selector =
      "button, a, input, textarea, select, option, [role='button'], [role='menuitem'], [contenteditable='true'], [contenteditable='']"

    return !!target.closest(selector)
  }

  const drag = (e: MouseEvent) => {
    if (platform.platform !== "desktop") return
    if (e.buttons !== 1) return
    if (interactive(e.target)) return

    const win = getWin()
    if (!win?.startDragging) return

    e.preventDefault()
    void win.startDragging().catch(() => undefined)
  }

  const maximize = (e: MouseEvent) => {
    if (platform.platform !== "desktop") return
    if (interactive(e.target)) return
    if (e.target instanceof Element && e.target.closest("[data-tauri-decorum-tb]")) return

    const win = getWin()
    if (!win?.toggleMaximize) return

    e.preventDefault()
    void win.toggleMaximize().catch(() => undefined)
  }

  return (
    <header
      data-slot="titlebar-v2"
      classList={{
        "shrink-0 relative flex flex-row": true,
        "h-9 bg-v2-background-bg-deep overflow-visible": true,
        
        "order-last": bottom(),
      }}
      style={{
        "min-height": minHeight(),
        // Keep native macOS traffic lights clear even when the desktop window is narrow.
        "padding-left": mac() ? `${84 / zoom()}px` : 0,
        width: electronWindows() ? `env(titlebar-area-width, calc(100vw - ${windowsControlsWidth()}))` : undefined,
        "max-width": electronWindows()
          ? `env(titlebar-area-width, calc(100vw - ${windowsControlsWidth()}))`
          : undefined,
        "align-self": electronWindows() ? "flex-start" : undefined,
      }}
      data-tauri-drag-region
      onMouseDown={drag}
      onDblClick={maximize}
    >
      <Switch>
        <Match when={true}>
          {(_) => {
            const layout = useLayout()
            const global = useGlobal()

            const tabs = useTabs()
            const tabsStore = tabs.store
            const tabsStoreActions = tabs
            const [session] = createResource(
              () => {
                const route = layout.route()
                if (route.type !== "session") return undefined
                const conn = global.servers
                  .list()
                  .find((item) => ServerConnection.key(item) === (route.server ?? server.key))
                return conn ? { route, sdk: global.ensureServerCtx(conn).sdk } : undefined
              },
              ({ route, sdk }) =>
                sdk.client.session
                  .get({ sessionID: route.sessionId })
                  .then((x) => x.data)
                  .catch(() => {}),
            )

            const matchRoute = (route: LayoutRoute) => {
              if (route.type === "home") return
              if (route.type === "draft") {
                return tabsStore.find((item) => item.type === "draft" && item.draftID === route.draftID)
              }
              if (route.type === "session") {
                const main = tabsStore.find(
                  (item) =>
                    item.type === "session" && item.server === route.server && item.sessionId === route.sessionId,
                )
                if (main) return main
                const s = session()
                if (s?.parentID) {
                  const parentID = s.parentID
                  const parent = tabsStore.find(
                    (item) => item.type === "session" && item.server === route.server && item.sessionId === parentID,
                  )
                  if (parent) return parent
                }
              }
            }

            const currentTab = () => matchRoute(layout.route())

            createEffect(() => {
              const route = layout.route()
              if (!tabs.ready()) return
              const tab = currentTab()
              if (tab) {
                tabs.remember(tab)
                return
              }

              if (route.type === "session") {
                const s = session()
                if (!s) return
                const sessionId = s.parentID ?? s.id
                const next = { server: route.server ?? server.key, sessionId }
                tabsStoreActions.addSessionTab(next)
              }
            })

            makeEventListener(window, SESSION_TABS_REMOVED_EVENT, (event) => {
              const detail = readSessionTabsRemovedDetail(event)
              if (!detail) return
              tabsStoreActions.removeSessions(detail)
            })

            const openNewTab = () => {
              const route = layout.route()
              const activeSession = session()
              if (route.type === "session" && activeSession) {
                tabs.newDraft({ server: route.server ?? server.key, directory: activeSession.directory }, "")
                return
              }

              const activeTab = currentTab()
              if (activeTab?.type === "draft") {
                tabs.newDraft({ server: activeTab.server, directory: activeTab.directory }, "")
                return
              }

              const current = layout.projects.list()[0]
              if (current) {
                tabs.newDraft({ server: server.key, directory: current.worktree }, "")
                return
              }

              const fallback = global.servers.list().flatMap((conn) => {
                const project = global.ensureServerCtx(conn).projects.list()[0]
                return project ? [{ server: ServerConnection.key(conn), project }] : []
              })[0]
              if (!fallback) return

              tabs.newDraft({ server: fallback.server, directory: fallback.project.worktree }, "")
            }
            const toggleHome = () => tabs.toggleHome({ home: layout.route().type === "home", current: currentTab() })

            command.register("titlebar-home", () => [
              {
                id: "home.toggle",
                title: language.t("home.title"),
                category: language.t("command.category.view"),
                keybind: "mod+b",
                hidden: true,
                onSelect: toggleHome,
              },
            ])

            command.register("tabs", () => {
              const current = currentTab()

              return [
                {
                  id: "tab.new",
                  category: "tab",
                  title: language.t("command.session.new"),
                  keybind: "mod+t",
                  hidden: true,
                  onSelect: openNewTab,
                },
                current && {
                  id: "tab.close",
                  category: "tab",
                  title: language.t("command.tab.close"),
                  keybind: "mod+w",
                  hidden: true,
                  onSelect: () => {
                    tabsStoreActions.removeTab(tabsStore.findIndex((tab) => current === tab))
                  },
                },
                {
                  id: `tab.prev`,
                  category: "tab",
                  title: "",
                  keybind: `mod+option+ArrowLeft,ctrl+shift+tab`,
                  hidden: true,
                  onSelect: () => {
                    let index = tabsStore.findIndex((tab) => tab === currentTab())
                    if (index === -1) return

                    index -= 1
                    if (index === -1) index = tabsStore.length - 1

                    const next = tabsStore[index]
                    if (next) tabs.select(next)
                  },
                },
                {
                  id: `tab.next`,
                  category: "tab",
                  title: "",
                  keybind: `mod+option+ArrowRight,ctrl+tab`,
                  hidden: true,
                  onSelect: () => {
                    let index = tabsStore.findIndex((tab) => tab === currentTab())
                    if (index === -1) return

                    index += 1
                    if (index === tabsStore.length) index = 0

                    const next = tabsStore[index]
                    if (next) tabs.select(next)
                  },
                },
              ].filter((v) => v !== undefined)
            })

            return (
              <div
                class="h-full flex-1 overflow-hidden flex flex-row items-center gap-1.5 px-2 md:pr-3"
                classList={{
                  "pt-2": !bottom(),
                  "pb-2": bottom(),
                  "md:pl-2": true,
                }}
              >
                <Show
                  when={backButtonPage()}
                  fallback={
                    <>
                      <TooltipKeybind
                        class="shrink-0"
                        placement="bottom"
                        title={language.t("command.sidebar.toggle")}
                        keybind={command.keybind("sidebar.toggle")}
                      >
                        <button
                          type="button"
                          class="flex items-center justify-center w-7 h-7 rounded-[6px] text-v2-icon-icon-accent hover:bg-v2-background-bg-hover hover:text-v2-text-text-accent transition-colors [app-region:no-drag]"
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.innerWidth < 768) layout.mobileSidebar.toggle()
                            else layout.sidebar.toggle()
                          }}
                          aria-label={language.t("command.sidebar.toggle")}
                          aria-expanded={layout.sidebar.opened()}
                        >
                          <Icon size="small" name={layout.sidebar.opened() ? "sidebar-active" : "sidebar"} />
                        </button>
                      </TooltipKeybind>

                      <Show when={!layout.sidebar.opened()}>
                        <TooltipKeybind
                          class="shrink-0"
                          placement="bottom"
                          title={language.t("command.session.new")}
                          keybind={command.keybind("tab.new")}
                        >
                          <button
                            type="button"
                            class="flex items-center justify-center w-7 h-7 rounded-[6px] text-v2-icon-icon-accent hover:bg-v2-background-bg-hover hover:text-v2-text-text-accent transition-colors [app-region:no-drag]"
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              openNewTab()
                            }}
                            aria-label={language.t("command.session.new")}
                          >
                            <svg viewBox="0 0 24 24" class="w-[18px] h-[18px] shrink-0" fill="none" aria-hidden="true">
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
                          </button>
                        </TooltipKeybind>
                      </Show>
                    </>
                  }
                >
                  <button
                    type="button"
                    class="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-v2-border-border-muted px-3 text-[13px] text-v2-text-text-muted transition-colors hover:border-v2-border-border-base hover:bg-v2-background-bg-hover hover:text-v2-text-text-base focus-visible:outline-none focus-visible:border-v2-border-border-base focus-visible:bg-v2-background-bg-hover focus-visible:text-v2-text-text-base [app-region:no-drag]"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      goBackOrHome()
                    }}
                    aria-label="Go back"
                  >
                    <Icon size="small" name="chevron-left" />
                    <span>Go back</span>
                  </button>
                </Show>

                <Show when={windows() || linux()}>
                  <WindowsAppMenu command={command} platform={platform} variant="v2" />
                </Show>

                <div class="min-w-0 flex-1" />
                <div class="flex-1" />
                <TitlebarV2Right state={v2RightState()} />
                <Show when={windows() && !electronWindows()}>
                  <div data-tauri-decorum-tb class="flex flex-row" />
                </Show>
              </div>
            )
          }}
        </Match>
        <Match when>
          <div
            class="grid h-full min-h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
            style={{ zoom: counterZoom() }}
          >
            <div
              classList={{
                "flex items-center min-w-0": true,
                "pl-2": !mac(),
              }}
            >
              <Show when={windows() || linux()}>
                <WindowsAppMenu command={command} platform={platform} />
              </Show>
              <Show when={mac()}>
                {/*<div class="h-full shrink-0" style={{ width: `${72 / zoom()}px` }} />*/}
                <div class="xl:hidden w-10 shrink-0 flex items-center justify-center">
                  <IconButton
                    icon="menu"
                    variant="ghost"
                    class="titlebar-icon rounded-md"
                    onClick={layout.mobileSidebar.toggle}
                    aria-label={language.t("sidebar.menu.toggle")}
                    aria-expanded={layout.mobileSidebar.opened()}
                  />
                </div>
              </Show>
              <Show when={!mac()}>
                <div class="xl:hidden w-[48px] shrink-0 flex items-center justify-center">
                  <IconButton
                    icon="menu"
                    variant="ghost"
                    class="titlebar-icon rounded-md"
                    onClick={layout.mobileSidebar.toggle}
                    aria-label={language.t("sidebar.menu.toggle")}
                    aria-expanded={layout.mobileSidebar.opened()}
                  />
                </div>
              </Show>
              <div class="flex items-center gap-1 shrink-0">
                <TooltipKeybind
                  class={web() ? "hidden xl:flex shrink-0 ml-14" : "hidden xl:flex shrink-0 ml-2"}
                  placement="bottom"
                  title={language.t("command.sidebar.toggle")}
                  keybind={command.keybind("sidebar.toggle")}
                >
                  <Button
                    variant="ghost"
                    class="group/sidebar-toggle titlebar-icon w-8 h-6 p-0 box-border"
                    onClick={layout.sidebar.toggle}
                    aria-label={language.t("command.sidebar.toggle")}
                    aria-expanded={layout.sidebar.opened()}
                  >
                    <Icon size="small" name={layout.sidebar.opened() ? "sidebar-active" : "sidebar"} />
                  </Button>
                </TooltipKeybind>
                <div class="hidden xl:flex items-center shrink-0">
                  <div
                    class="flex items-center shrink-0"
                    classList={{
                      "duration-180 ease-out": !layout.sidebar.opened(),
                      "duration-180 ease-in": layout.sidebar.opened(),
                    }}
                  >
                    <Show when={hasProjects() && nav()}>
                      <div class="flex items-center gap-0 transition-transform">
                        <Tooltip placement="bottom" value={language.t("common.goBack")} openDelay={800}>
                          <Button
                            variant="ghost"
                            icon="chevron-left"
                            class="titlebar-icon w-6 h-6 p-0 box-border"
                            disabled={!canBack()}
                            onClick={back}
                            aria-label={language.t("common.goBack")}
                          />
                        </Tooltip>
                        <Tooltip placement="bottom" value={language.t("common.goForward")} openDelay={800}>
                          <Button
                            variant="ghost"
                            icon="chevron-right"
                            class="titlebar-icon w-6 h-6 p-0 box-border"
                            disabled={!canForward()}
                            onClick={forward}
                            aria-label={language.t("common.goForward")}
                          />
                        </Tooltip>
                      </div>
                    </Show>
                    <div id="shob-titlebar-left" class="flex items-center gap-3 min-w-0 px-2" />
                  </div>
                </div>
              </div>
            </div>

            <div class="min-w-0 flex items-center justify-center pointer-events-none">
              <div
                id="shob-titlebar-center"
                class="pointer-events-auto min-w-0 flex justify-center w-fit max-w-full"
              />
            </div>

            <div
              classList={{
                "flex items-center min-w-0 justify-end": true,
                "pr-2": !windows(),
              }}
              data-tauri-drag-region
              onMouseDown={drag}
            >
              <div id="shob-titlebar-right" class="flex items-center gap-1 shrink-0 justify-end" />
              <Show when={windows()}>
                {!tauriApi() && <div class="shrink-0" style={{ width: windowsControlsWidth() }} />}
                <div data-tauri-decorum-tb class="flex flex-row" />
              </Show>
            </div>
          </div>
        </Match>
      </Switch>
    </header>
  )
}

type TitlebarUpdatePillState = {
  visible: boolean
  installing: boolean
  label: string
  ariaLabel: string
  title?: string
  onInstall: () => void
}

type TitlebarV2RightState = {
  update: TitlebarUpdatePillState
}

function TitlebarV2Right(props: { state: TitlebarV2RightState }) {
  return (
    <div class="relative z-20 flex shrink-0 items-center justify-end gap-0 overflow-visible">
      <Show when={props.state.update.visible}>
        <TitlebarUpdateIconButton state={props.state.update} />
      </Show>
      <div id="shob-titlebar-right" class="flex shrink-0 items-center justify-end gap-0" />
    </div>
  )
}

function TitlebarUpdateIconButton(props: { state: TitlebarUpdatePillState }) {
  return (
    <div class="group relative mr-3 h-5 w-5 shrink-0 rounded-full bg-v2-background-bg-deep transition-[width] duration-150 ease-out hover:z-30 hover:w-[68px] focus-within:z-30 focus-within:w-[68px] motion-reduce:transition-none">
      <button
        type="button"
        class="absolute right-0 top-0 z-10 flex h-5 w-5 items-center justify-end overflow-hidden rounded-full bg-v2-icon-icon-accent/20 text-v2-icon-icon-accent transition-[width,background-color] duration-150 ease-out group-hover:w-[68px] group-hover:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] group-focus-within:w-[68px] group-focus-within:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] focus-visible:outline-none disabled:opacity-60 motion-reduce:transition-none"
        onClick={props.state.onInstall}
        disabled={props.state.installing}
        aria-busy={props.state.installing}
        aria-label={props.state.ariaLabel}
      >
        <span class="shrink-0 ml-[8px] mr-px text-[11px] text-v2-text-text-accent [font-weight:530] opacity-0 translate-x-2 motion-safe:transition-all duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 motion-reduce:translate-x-0">
          Update
        </span>
        <span class="flex size-5 shrink-0 items-center justify-center">
          <Show
            when={!props.state.installing}
            fallback={<span data-slot="titlebar-update-loader" aria-hidden="true" />}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 11V3M3.5 7.63128L7 11L10.5 7.63128" stroke="currentColor" />
            </svg>
          </Show>
        </span>
      </button>
    </div>
  )
}
