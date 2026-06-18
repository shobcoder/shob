import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createEffect, createSignal } from "solid-js"
import { Logo } from "../component/logo"
import { useProject } from "../context/project"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { TuiPluginRuntime } from "../plugin"
import { Installation } from "@/installation"
import { useTheme } from "../context/theme"

// TODO: what is the best way to do this?
let once = false
const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const sync = useSync()
  const project = useProject()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const { theme } = useTheme()
  let sent = false

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.initialPrompt) {
      r.set(route.initialPrompt)
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
    <>
      <box flexGrow={1} alignItems="center" paddingLeft={1} paddingRight={1}>
        <box flexGrow={1} minHeight={0} />
        <box height={2} minHeight={0} flexShrink={1} />
        <box flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_logo" mode="replace">
            <Logo />
          </TuiPluginRuntime.Slot>
        </box>
        <box height={1} minHeight={0} />
        <box alignItems="center" gap={1} flexShrink={0}>
          <text fg={theme.textMuted}>v{Installation.VERSION}</text>
          <text bold>TIP: Press Alt/Option+X to disable auto-compress</text>
          <box alignItems="center">
            <text fg={theme.textMuted}>shift+tab to cycle modes · ctrl+N to cycle models</text>
            <text fg={theme.textMuted}>ctrl+L for autonomy · tab for reasoning</text>
          </box>
          <box flexDirection="row" gap={2}>
            <text>
              Skills ({sync.data.command.length}) <span style={{ fg: theme.success }}>✓</span>
            </text>
            <text>
              MCPs ({Object.values(sync.data.mcp).filter((item) => item.status === "connected").length}){" "}
              <span style={{ fg: theme.success }}>✓</span>
            </text>
            <text>
              AGENTS.md <span style={{ fg: theme.error }}>×</span>
            </text>
          </box>
        </box>
        <box height={2} minHeight={0} flexShrink={1} />
        <box width="100%" zIndex={1000} paddingTop={1} flexShrink={0}>
          <TuiPluginRuntime.Slot
            name="home_prompt"
            mode="replace"
            workspace_id={project.workspace.current()}
            ref={bind}
          >
            <Prompt
              ref={bind}
              workspaceID={project.workspace.current()}
              right={<TuiPluginRuntime.Slot name="home_prompt_right" workspace_id={project.workspace.current()} />}
              placeholders={placeholder}
            />
          </TuiPluginRuntime.Slot>
        </box>
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </>
  )
}
