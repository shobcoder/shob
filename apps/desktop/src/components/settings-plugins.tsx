import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import {
  Blocks,
  BookOpen,
  Bot,
  Braces,
  Bug,
  CalendarDays,
  Camera,
  ChartColumn,
  ChartLine,
  Check,
  CircleSlash,
  ClipboardCheck,
  Cloud,
  CloudUpload,
  Cpu,
  FileText,
  FileStack,
  GitPullRequestArrow,
  Handshake,
  Landmark,
  Mail,
  MessageSquare,
  MousePointer2,
  Network,
  NotebookTabs,
  Palette,
  PackagePlus,
  PenTool,
  Plus,
  Presentation,
  Rocket,
  Search,
  ServerCog,
  Share2,
  ShieldCheck,
  Sparkles,
  Speech,
  Table2,
  Trash2,
  TrendingUp,
  Users,
  WandSparkles,
  Workflow,
  Wrench,
} from "lucide-solid"
import { showToast } from "@shob-ai/ui/toast"
import { api } from "@/services/api"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import type { ElectronSkillStoreItem } from "../electron"

type ServerSkill = {
  name: string
  description?: string
  location: string
}

type SkillStoreViewItem = ElectronSkillStoreItem & {
  source: "store"
}

const ICONS: Record<string, { icon: any; class: string }> = {
  cursor: {
    icon: MousePointer2,
    class: "from-cyan-300 via-violet-400 to-fuchsia-500 text-white",
  },
  chrome: {
    icon: CircleSlash,
    class: "from-emerald-300 via-amber-300 to-red-400 text-white",
  },
  sheet: {
    icon: Table2,
    class: "from-emerald-900 via-emerald-700 to-lime-400 text-white",
  },
  presentation: {
    icon: Presentation,
    class: "from-orange-950 via-amber-600 to-yellow-300 text-white",
  },
  image: {
    icon: WandSparkles,
    class: "from-pink-300 via-sky-300 to-violet-500 text-white",
  },
  docs: {
    icon: BookOpen,
    class: "from-sky-700 via-cyan-500 to-emerald-300 text-white",
  },
  creator: {
    icon: PenTool,
    class: "from-amber-300 via-orange-400 to-rose-500 text-white",
  },
  installer: {
    icon: PackagePlus,
    class: "from-zinc-900 via-blue-700 to-cyan-400 text-white",
  },
  code: {
    icon: Braces,
    class: "from-slate-900 via-blue-700 to-indigo-400 text-white",
  },
  review: {
    icon: GitPullRequestArrow,
    class: "from-zinc-800 via-emerald-600 to-lime-300 text-white",
  },
  test: {
    icon: ClipboardCheck,
    class: "from-blue-900 via-blue-500 to-cyan-300 text-white",
  },
  debug: {
    icon: Bug,
    class: "from-red-900 via-rose-500 to-amber-300 text-white",
  },
  deploy: {
    icon: Rocket,
    class: "from-indigo-900 via-sky-500 to-emerald-300 text-white",
  },
  cloudDeploy: {
    icon: CloudUpload,
    class: "from-cyan-900 via-blue-500 to-teal-300 text-white",
  },
  browserQa: {
    icon: Bot,
    class: "from-zinc-950 via-violet-700 to-fuchsia-300 text-white",
  },
  screenshot: {
    icon: Camera,
    class: "from-stone-800 via-zinc-500 to-sky-300 text-white",
  },
  pdf: {
    icon: FileStack,
    class: "from-red-800 via-orange-400 to-white text-white",
  },
  notebook: {
    icon: NotebookTabs,
    class: "from-orange-500 via-white to-blue-500 text-zinc-950",
  },
  security: {
    icon: ShieldCheck,
    class: "from-emerald-950 via-teal-600 to-lime-300 text-white",
  },
  sentry: {
    icon: ServerCog,
    class: "from-purple-900 via-violet-600 to-rose-300 text-white",
  },
  speech: {
    icon: Speech,
    class: "from-fuchsia-800 via-rose-500 to-amber-200 text-white",
  },
  migrate: {
    icon: Wrench,
    class: "from-stone-900 via-slate-600 to-amber-300 text-white",
  },
  github: {
    icon: Workflow,
    class: "from-zinc-50 via-zinc-200 to-zinc-500 text-zinc-950",
  },
  slack: {
    icon: MessageSquare,
    class: "from-sky-300 via-fuchsia-400 to-emerald-300 text-white",
  },
  "bar-chart": {
    icon: ChartColumn,
    class: "from-sky-400 via-indigo-400 to-pink-200 text-white",
  },
  nodes: {
    icon: Network,
    class: "from-violet-400 via-fuchsia-500 to-indigo-600 text-white",
  },
  palette: {
    icon: Palette,
    class: "from-violet-300 via-fuchsia-400 to-indigo-400 text-white",
  },
  handshake: {
    icon: Handshake,
    class: "from-teal-200 via-rose-300 to-orange-300 text-white",
  },
  bank: {
    icon: Landmark,
    class: "from-emerald-700 via-stone-200 to-cyan-400 text-white",
  },
  "line-chart": {
    icon: TrendingUp,
    class: "from-green-800 via-emerald-500 to-lime-300 text-white",
  },
  notion: {
    icon: FileText,
    class: "from-white via-zinc-100 to-zinc-300 text-zinc-950",
  },
  linear: {
    icon: Blocks,
    class: "from-zinc-800 via-zinc-700 to-zinc-500 text-white",
  },
  gpu: {
    icon: Cpu,
    class: "from-black via-lime-950 to-lime-500 text-lime-300",
  },
  mail: {
    icon: Mail,
    class: "from-white via-sky-100 to-rose-200 text-red-500",
  },
  calendar: {
    icon: CalendarDays,
    class: "from-blue-300 via-white to-indigo-200 text-blue-600",
  },
  drive: {
    icon: Cloud,
    class: "from-emerald-300 via-yellow-300 to-blue-500 text-white",
  },
  teams: {
    icon: Users,
    class: "from-indigo-300 via-violet-500 to-white text-white",
  },
  sharepoint: {
    icon: Share2,
    class: "from-teal-200 via-cyan-500 to-emerald-900 text-white",
  },
  sparkles: {
    icon: Sparkles,
    class: "from-slate-600 via-zinc-500 to-stone-300 text-white",
  },
}

const normalizeDescription = (value?: string) =>
  value?.replace(/\s+/g, " ").replace(/\.$/, "").trim() || "Reusable skill workflow"

function SkillIcon(props: { iconKey: string; name: string }) {
  const icon = ICONS[props.iconKey] ?? ICONS.sparkles
  const Icon = icon.icon

  return (
    <div
      class={`flex size-[38px] shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_24px_rgba(0,0,0,0.22)] ${icon.class}`}
      aria-hidden="true"
    >
      <Icon size={21} strokeWidth={2.1} />
      <span class="sr-only">{props.name}</span>
    </div>
  )
}

function SkillStoreRow(props: {
  item: SkillStoreViewItem
  installing: boolean
  uninstalling: boolean
  onInstall: (item: SkillStoreViewItem) => void
  onUninstall: (item: SkillStoreViewItem) => void
}) {
  const installed = () => props.item.installed

  const installedControl = () => (
    <Show
      when={props.item.managed}
      fallback={
        <div class="flex size-8 items-center justify-center text-muted-foreground/70" title="Installed">
          <Check size={17} strokeWidth={1.8} />
        </div>
      }
    >
      <button
        type="button"
        aria-label={`Uninstall ${props.item.displayName}`}
        title={`Uninstall ${props.item.displayName}`}
        disabled={props.uninstalling}
        onClick={() => props.onUninstall(props.item)}
        class="flex size-8 items-center justify-center rounded-full bg-muted/45 text-muted-foreground outline-none transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-default disabled:opacity-55"
      >
        <Trash2 size={16} strokeWidth={2} />
      </button>
    </Show>
  )

  return (
    <div class="group grid h-[72px] min-w-0 grid-cols-[38px_minmax(0,1fr)_32px] items-center gap-3 rounded-[8px] px-1.5 py-2 transition-colors hover:bg-muted/35">
      <SkillIcon iconKey={props.item.iconKey} name={props.item.displayName} />
      <div class="min-w-0">
        <div class="truncate text-[14px] font-semibold leading-5 text-foreground">
          {props.item.displayName}
        </div>
        <div class="truncate text-[13px] leading-5 text-muted-foreground">
          {normalizeDescription(props.item.description)}
        </div>
      </div>
      <Show
        when={!installed()}
        fallback={installedControl()}
      >
        <button
          type="button"
          aria-label={`Install ${props.item.displayName}`}
          title={`Install ${props.item.displayName}`}
          disabled={props.installing || props.uninstalling}
          onClick={() => props.onInstall(props.item)}
          class="flex size-8 items-center justify-center rounded-full bg-muted/70 text-foreground outline-none transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-55"
        >
          <Plus size={18} strokeWidth={2} />
        </button>
      </Show>
    </div>
  )
}

export function SettingsPlugins() {
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const [installingId, setInstallingId] = createSignal<string | null>(null)
  const [uninstallingId, setUninstallingId] = createSignal<string | null>(null)
  const [query, setQuery] = createSignal("")

  const [storeData, { refetch }] = createResource(async () => {
    const [catalog, skillsResult] = await Promise.all([
      api.listSkillStore().catch(() => [] as ElectronSkillStoreItem[]),
      globalSDK.client.app.skills().then((result) => result.data ?? ([] as ServerSkill[])).catch(() => [] as ServerSkill[]),
    ])

    return {
      catalog,
      skills: skillsResult as ServerSkill[],
    }
  })

  const items = createMemo<SkillStoreViewItem[]>(() => {
    const data = storeData()
    if (!data) return []

    const serverByName = new Map(data.skills.map((skill) => [skill.name, skill]))
    return data.catalog.map((item) => ({
      ...item,
      installed: item.installed || serverByName.has(item.name),
      description: normalizeDescription(serverByName.get(item.name)?.description ?? item.description),
      location: item.location ?? serverByName.get(item.name)?.location ?? null,
      source: "store",
    }))
  })

  const filteredItems = createMemo(() => {
    const value = query().trim().toLowerCase()
    if (!value) return items()
    return items().filter((item) =>
      `${item.displayName} ${item.name} ${item.description} ${item.category}`.toLowerCase().includes(value),
    )
  })

  const installedCount = createMemo(() => items().filter((item) => item.installed).length)

  const installSkill = async (item: SkillStoreViewItem) => {
    if (item.installed || installingId() || uninstallingId()) return

    setInstallingId(item.id)
    try {
      await api.installSkill(item.id)
      await globalSync.refreshSkills().catch(() => undefined)
      await refetch()
      showToast({
        title: "Skill installed",
        description: `${item.displayName} is now available in Shob.`,
        variant: "success",
        duration: 4000,
      })
    } catch (error) {
      showToast({
        title: "Install failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
        duration: 6000,
      })
    } finally {
      setInstallingId(null)
    }
  }

  const uninstallSkill = async (item: SkillStoreViewItem) => {
    if (!item.installed || !item.managed || installingId() || uninstallingId()) return

    setUninstallingId(item.id)
    try {
      await api.uninstallSkill(item.id)
      await globalSync.refreshSkills().catch(() => undefined)
      await refetch()
      showToast({
        title: "Skill uninstalled",
        description: `${item.displayName} was removed from Shob.`,
        variant: "success",
        duration: 4000,
      })
    } catch (error) {
      showToast({
        title: "Uninstall failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
        duration: 6000,
      })
    } finally {
      setUninstallingId(null)
    }
  }

  return (
    <div class="w-full max-w-[860px] p-6 lg:p-8">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-[15px] font-semibold leading-5 text-foreground">Plugins</h2>
          <div class="mt-1 text-[12px] leading-5 text-muted-foreground">
            Skills only for now - {installedCount()} installed
          </div>
        </div>
        <label class="relative block h-8 w-full max-w-[260px]">
          <span class="sr-only">Search skills</span>
          <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search skills"
            class="h-8 w-full rounded-[8px] border border-border/60 bg-muted/35 pl-8 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-border focus:bg-muted/50"
          />
        </label>
      </div>

      <Show
        when={!storeData.loading}
        fallback={
          <div class="grid grid-cols-1 gap-x-9 gap-y-1 md:grid-cols-2">
            <For each={Array.from({ length: 10 })}>
              {() => (
                <div class="grid h-[72px] grid-cols-[38px_minmax(0,1fr)_32px] items-center gap-3 rounded-[8px] px-1.5 py-2">
                  <div class="size-[38px] rounded-[8px] bg-muted/60" />
                  <div class="min-w-0 space-y-2">
                    <div class="h-3.5 w-32 rounded bg-muted/60" />
                    <div class="h-3 w-48 max-w-full rounded bg-muted/40" />
                  </div>
                  <div class="size-8 rounded-full bg-muted/40" />
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show
          when={filteredItems().length > 0}
          fallback={
            <div class="rounded-[8px] border border-border/60 px-4 py-8 text-center text-[13px] text-muted-foreground">
              No skills found.
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-x-9 gap-y-1 md:grid-cols-2">
            <For each={filteredItems()}>
              {(item) => (
                <SkillStoreRow
                  item={item}
                  installing={installingId() === item.id}
                  uninstalling={uninstallingId() === item.id}
                  onInstall={installSkill}
                  onUninstall={uninstallSkill}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
