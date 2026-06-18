import { Plus, SquareTerminal, X } from 'lucide-solid'
import { showToast } from "@shob-ai/ui/toast"
import { CliAvatar } from './CliAvatar'
import { getCliDisplayLabel } from '../config/cli-ui'
import { useStore } from '../store'
import { Button } from '@/components/ui/button'
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { formatServerError } from "@/utils/server-errors"
import { removePersistedSessionState } from "@/utils/session-persisted-state"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

const compactTitle = (title: string, maxChars: number) =>
  title.length > maxChars ? `${title.slice(0, Math.max(1, maxChars - 1))}\u2026` : title

export function TabBar() {
  const projects = useStore((s) => s.projects)
  const currentProjectId = useStore((s) => s.currentProjectId)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const launchCliSession = useStore((s) => s.launchCliSession)
  const removeSession = useStore((s) => s.removeSession)
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const language = useLanguage()
  const platform = usePlatform()

  const currentProject = () => projects().find((project) => project.id === currentProjectId()) ?? null
  const totalTabs = () => currentProject() ? currentProject()!.sessions.length : 0
  const isCompactTabs = () => totalTabs() >= 5
  const sessionTitleLimit = () => isCompactTabs() ? 12 : 24

  const handleDeleteSession = async (projectId: string, sessionId: string) => {
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
      await globalSync.project.loadSessions(project.path)
    }
  }

  return (
    <div class="chrome-tabbar">
      <div class="chrome-tabbar-inner">
        <div class="hide-scrollbar flex min-w-0 flex-1 items-end overflow-x-auto">
          <Tabs
            value={activeSessionId() ?? ''}
            onValueChange={setActiveSession}
            class="chrome-tabs flex items-end"
          >
            <TabsList variant="line" class="chrome-tabs-list bg-transparent p-0">
              {(() => {
                const cp = currentProject()
                if (!cp) return null
                return cp.sessions.map((session) => {
                  const isActive = session.id === activeSessionId()
                  const displayName = compactTitle(session.name, sessionTitleLimit())

                  return (
                    <TabsTrigger
                      value={session.id}
                      onClick={() => setActiveSession(session.id)}
                      class={`chrome-tab-trigger relative group inline-flex items-center ${
                        isCompactTabs()
                          ? 'max-w-[156px] min-w-[92px] gap-1.5 px-2 text-[12px]'
                          : 'max-w-[240px] min-w-[116px] gap-2 px-3 text-sm'
                      }`}
                      title={session.name}
                    >
                      {!isActive && <span class="chrome-tab-divider" aria-hidden="true" />}
                      {session.cliTool ? (
                        <CliAvatar
                          cliId={session.cliTool}
                          label={getCliDisplayLabel(session.cliTool) ?? session.name}
                          size="sm"
                          class={isCompactTabs() ? 'scale-90' : ''}
                        />
                      ) : (
                        <SquareTerminal class={`${isCompactTabs() ? 'h-3 w-3' : 'h-3.5 w-3.5'} shrink-0 text-muted-foreground`} stroke-width={1.9} />
                      )}
                      <span class="truncate">{displayName}</span>
                      <span
                        onPointerDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          const cpid = currentProjectId()
                          if (cpid) void handleDeleteSession(cpid, session.id)
                        }}
                        class={`chrome-tab-close inline-flex h-4 w-4 items-center justify-center rounded-full transition ${
                          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        aria-label={`Close ${session.name}`}
                      >
                        <X class="h-3 w-3" stroke-width={2} />
                      </span>
                    </TabsTrigger>
                  )
                })
              })()}
            </TabsList>
          </Tabs>

          <Button
            type="button"
            onClick={() => {
              const cpid = currentProjectId() ?? projects()[0]?.id ?? null
              if (!cpid) return
              if (currentProjectId() !== cpid) {
                setCurrentProject(cpid)
              }
              void launchCliSession(cpid)
            }}
            variant="ghost"
            size="icon-sm"
            class="chrome-tab-new-button mb-[4px] ml-1 h-7 w-7 shrink-0 rounded-full"
            title="New session"
          >
            <Plus class="h-4 w-4" stroke-width={2} />
          </Button>
        </div>
      </div>
    </div>
  )
}
