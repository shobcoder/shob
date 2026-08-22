import { Prompt, type PromptRef } from "../component/prompt"
import { createEffect, createMemo, createSignal, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "../context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { usePluginRuntime } from "../plugin/runtime"
import { useEditorContext } from "../context/editor"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../config"
import { useTheme } from "../context/theme"
import { useTuiPaths } from "../context/runtime"
import { HomeSessionDestinationProvider } from "./home/session-destination"

let once = false
const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const pluginRuntime = usePluginRuntime()
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const { theme } = useTheme()
  const paths = useTuiPaths()

  const currentDir = createMemo(() => paths.cwd || (typeof process !== "undefined" ? process.cwd() : ""))
  const autoStatus = createMemo(() => (local.permission.mode === "auto" ? "On" : "Off"))
  const autoDesc = createMemo(() =>
    local.permission.mode === "auto" ? "actions run automatically" : "all actions require approval",
  )
  const currentModel = createMemo(() => {
    const parsed = local.model.parsed?.()
    if (parsed?.model) return parsed.model
    return "Sonnet 4.5"
  })

  const promptMaxWidth = createMemo(() => {
    const configured = tuiConfig.prompt?.max_width
    if (configured === "auto") return Math.max(75, Math.floor(dimensions().width * 0.7))
    return configured ?? 75
  })
  let sent = false

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <HomeSessionDestinationProvider>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />

        {/* Logo & Version */}
        <box alignItems="center" gap={0} flexShrink={0}>
          <pluginRuntime.Slot name="home_logo" mode="replace">
            <Logo />
          </pluginRuntime.Slot>
          <box height={1} />
          <text fg={theme.textMuted} selectable={false}>
            v0.22.1
          </text>
        </box>

        {/* Subtitle & Hints */}
        <box alignItems="center" gap={1} paddingTop={2} flexShrink={0}>
          <text fg={theme.textMuted} attributes={TextAttributes.ITALIC} selectable={false}>
            You are standing in an open terminal. An AI awaits your commands.
          </text>
          <text fg={theme.textMuted} selectable={false}>
            ENTER to send • \ + ENTER for a new line • @ to mention files
          </text>
        </box>

        {/* Current folder */}
        <box alignItems="center" paddingTop={1} flexShrink={0}>
          <text fg={theme.textMuted} selectable={false}>
            Current folder: {currentDir()}
          </text>
        </box>

        {/* Tip */}
        <box width="100%" maxWidth={promptMaxWidth()} paddingTop={2} paddingBottom={1} flexShrink={0}>
          <box flexDirection="row" gap={1}>
            <text fg="#f43f5e">●</text>
            <text fg={theme.textMuted} selectable={false}>
              Tip: Enable Shift+Enter/Ctrl+Enter for new lines in Windows Terminal. Run /terminal-setup to configure it.
            </text>
          </box>
        </box>

        {/* Status line directly above prompt */}
        <box
          width="100%"
          maxWidth={promptMaxWidth()}
          flexDirection="row"
          justifyContent="space-between"
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <box flexDirection="row" gap={1}>
            <text fg={theme.text}>Auto ({autoStatus()})</text>
            <text fg={theme.textMuted}>— {autoDesc()}</text>
          </box>
          <box flexDirection="row" gap={3}>
            <text fg={theme.textMuted}>ctrl+T cycles</text>
            <text fg={theme.text}>{currentModel()}</text>
          </box>
        </box>

        {/* Prompt */}
        <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} flexShrink={0}>
          <pluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
            <Prompt
              ref={bind}
              variant="home"
              right={<pluginRuntime.Slot name="home_prompt_right" />}
              placeholders={placeholder}
            />
          </pluginRuntime.Slot>
        </box>

        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>

      {/* Footer */}
      <box width="100%" flexShrink={0}>
        <pluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </HomeSessionDestinationProvider>
  )
}
