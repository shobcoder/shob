import { Show } from "solid-js"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useWindowChrome } from "@/utils/window-chrome"

/**
 * Shared reveal buttons: show-sidebar toggle + new-session. Used by both the
 * inline chat-header reveal and the standalone reveal row.
 */
function RevealButtons(props: { chrome: ReturnType<typeof useWindowChrome>; showNewSession?: boolean }) {
  return (
    <>
      <Button
        variant="ghost"
        class="titlebar-icon"
        onClick={props.chrome.toggleSidebar}
        title="Show sidebar"
        aria-label="Show sidebar"
      >
        <Icon size="small" name="sidebar" />
      </Button>
      <Show when={props.showNewSession ?? true}>
        <Button
          variant="ghost"
          class="titlebar-icon"
          onClick={props.chrome.createSession}
          title="Start a new session"
          aria-label="Start a new session"
        >
          <Icon size="small" name="new-session" />
        </Button>
      </Show>
    </>
  )
}

/**
 * Draggable header shown at the top of the sidebar on macOS (sidebar-open state).
 * Reserves space for the native traffic lights and hosts the collapse toggle.
 * Renders nothing off macOS.
 */
export function MacSidebarHeader() {
  const chrome = useWindowChrome()
  return (
    <Show when={chrome.isMac()}>
      <div
        class="mac-drag-region flex h-12 shrink-0 items-center gap-1 px-1.5"
        style={{ "padding-left": `${chrome.trafficLightInset()}px` }}
      >
        <Button
          variant="ghost"
          class="titlebar-icon"
          onClick={chrome.toggleSidebar}
          title="Hide sidebar"
          aria-label="Hide sidebar"
        >
          <Icon size="small" name="sidebar-active" />
        </Button>
      </div>
    </Show>
  )
}

/**
 * Inline reveal cluster for placement inside an existing view header (e.g. the
 * chat header's left side). Only renders on macOS when the sidebar is collapsed.
 */
export function MacSidebarReveal(props: { class?: string; showNewSession?: boolean }) {
  const chrome = useWindowChrome()
  return (
    <Show when={chrome.isMac() && !chrome.sidebarVisible()}>
      <div
        class={`mac-drag-region flex shrink-0 items-center gap-1 ${props.class ?? ""}`}
        style={{ "padding-left": `${chrome.trafficLightInset()}px` }}
      >
        <RevealButtons chrome={chrome} showNewSession={props.showNewSession} />
      </div>
    </Show>
  )
}

/**
 * Standalone reveal row for views without their own header (raw terminal,
 * welcome, settings). Only renders on macOS when the sidebar is collapsed.
 */
export function MacSidebarRevealRow() {
  const chrome = useWindowChrome()
  return (
    <Show when={chrome.isMac() && !chrome.sidebarVisible()}>
      <div
        class="mac-drag-region flex h-12 shrink-0 items-center gap-1 border-b border-border-weak-base bg-background px-1.5"
        style={{ "padding-left": `${chrome.trafficLightInset()}px` }}
      >
        <RevealButtons chrome={chrome} />
      </div>
    </Show>
  )
}
