import { Show, createMemo } from "solid-js"
import { AgentView } from "./AgentView"
import { Terminal } from "./Terminal"
import { MacSidebarRevealRow } from "./mac-chrome"
import { useStore } from "../store"

interface TerminalPanelProps {
  onNewSession: () => void
  reviewDiffs?: () => Array<{ file: string; additions: number; deletions: number }>
}

export function TerminalPanel(_props: TerminalPanelProps) {
  const currentProject = useStore((s) =>
    s.projects.find((p) => p.id === s.currentProjectId) ?? null,
  )
  const projectSessions = createMemo(() => currentProject()?.sessions ?? [])
  const activeSessionId = useStore((s) => s.activeSessionId)
  const activeSession = createMemo(() =>
    projectSessions().find((s) => s.id === activeSessionId()) ?? null,
  )

  return (
    <div class="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-background">
      <Show when={activeSession()}>
        {(session) => (
          <div class="h-full w-full min-h-0 overflow-hidden">
            <Show
              when={session().cliTool}
              fallback={
                <div class="flex h-full min-h-0 flex-col">
                  <MacSidebarRevealRow />
                  <div class="min-h-0 flex-1 overflow-hidden">
                    <Terminal sessionId={session().id} />
                  </div>
                </div>
              }
            >
              <AgentView
                sessionId={session().id}
                projectPath={currentProject()?.path}
                reviewDiffs={_props.reviewDiffs}
              />
            </Show>
          </div>
        )}
      </Show>

      <Show when={!activeSession()}>
        <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
          No active session
        </div>
      </Show>
    </div>
  )
}
