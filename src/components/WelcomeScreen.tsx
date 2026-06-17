import { Archive, FolderOpen, PanelLeftOpen, Plus } from "lucide-solid"
import { createMemo } from "solid-js"
import logoImage from "../assets/icon/logo.png"
import type { Project } from "../types"

interface WelcomeScreenProps {
  projects: Project[]
  currentProject: Project | null
  onOpenFolder: () => Promise<void> | void
  onCreateSession: () => Promise<void> | void
  onSelectProject: (projectId: string) => void
  onToggleFileTree: () => void
}

export function WelcomeScreen({
  projects,
  currentProject,
  onOpenFolder,
  onCreateSession,
  onSelectProject,
  onToggleFileTree,
}: WelcomeScreenProps) {
  return (
    <div class="h-full min-h-screen w-full overflow-y-auto bg-background text-foreground flex flex-col items-center justify-center p-6 sm:p-10">
      <div class="w-full max-w-[800px] m-auto flex flex-col items-center justify-center">
        {/* Logo */}
        <img src={logoImage} alt="Logo" class="w-full max-w-[320px] sm:max-w-[420px] mx-auto -mb-6 sm:-mb-10 object-contain" />

        {/* 3 Cards */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full place-content-center">
          {/* Card 1: Open project */}
          <button
            type="button"
            onClick={() => void onOpenFolder()}
            class="group flex flex-col justify-center items-center gap-3 text-center bg-card/50 hover:bg-accent/50 border border-border/50 hover:border-border rounded-2xl p-5 sm:p-6 h-[140px] sm:h-[160px] transition-all"
          >
            <FolderOpen class="h-6 w-6 text-muted-foreground group-hover:text-foreground transition-colors" stroke-width={1.5} />
            <span class="text-[14px] sm:text-[15px] font-medium tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">Open project</span>
          </button>

          {/* Card 2: Create Session */}
          <button
            type="button"
            onClick={() => void onCreateSession()}
            disabled={!currentProject}
            class="group flex flex-col justify-center items-center gap-3 text-center bg-card/50 hover:bg-accent/50 border border-border/50 hover:border-border rounded-2xl p-5 sm:p-6 h-[140px] sm:h-[160px] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card/50 disabled:hover:border-border/50"
          >
            <Plus class="h-6 w-6 text-muted-foreground group-hover:text-foreground transition-colors" stroke-width={1.5} />
            <span class="text-[14px] sm:text-[15px] font-medium tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">Create session</span>
          </button>

          {/* Card 3: Explorer */}
          <button
            type="button"
            onClick={onToggleFileTree}
            disabled={!currentProject}
            class="group flex flex-col justify-center items-center gap-3 text-center bg-card/50 hover:bg-accent/50 border border-border/50 hover:border-border rounded-2xl p-5 sm:p-6 h-[140px] sm:h-[160px] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card/50 disabled:hover:border-border/50"
          >
            <PanelLeftOpen class="h-6 w-6 text-muted-foreground group-hover:text-foreground transition-colors" stroke-width={1.5} />
            <span class="text-[14px] sm:text-[15px] font-medium tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">Explorer</span>
          </button>
        </div>

        {/* Below text */}
        <div class="mt-10 sm:mt-14 flex items-center gap-2.5 text-muted-foreground text-[13px] tracking-wide">
          <Archive class="h-4 w-4 opacity-80" stroke-width={1.5} />
          <span>{projects.length} {projects.length === 1 ? "project" : "projects"} ready</span>
        </div>
      </div>
    </div>
  )
}

