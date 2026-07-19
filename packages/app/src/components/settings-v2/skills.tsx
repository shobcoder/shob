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
  Loader2,
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
import { showToast } from "@/utils/toast"
import { useLanguage } from "@/context/language"
import { usePlatform, type SkillStoreItem } from "@/context/platform"
import { useServer } from "@/context/server"

type SkillStoreViewItem = SkillStoreItem & {
  source: "store" | "skills.sh"
  externalUrl?: string
  iconKey: string
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
        <div class="flex items-center justify-center text-[var(--v2-text-text-muted)] opacity-50" title="Installed">
          <Check size={18} strokeWidth={2} />
        </div>
      }
    >
      <button
        type="button"
        aria-label={`Uninstall ${props.item.displayName}`}
        title={`Uninstall ${props.item.displayName}`}
        disabled={props.uninstalling}
        onClick={() => props.onUninstall(props.item)}
        class="flex size-8 items-center justify-center rounded-full border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-layer-02)] text-[var(--v2-text-text-muted)] backdrop-blur-md transition-colors hover:border-[var(--v2-state-border-danger)] hover:bg-[var(--v2-state-bg-danger)] hover:text-[var(--v2-state-fg-danger)] disabled:cursor-default disabled:opacity-55"
      >
        <Trash2 size={15} strokeWidth={2} />
      </button>
    </Show>
  )

  return (
    <div class="group flex items-center justify-between gap-4 rounded-xl p-3 transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]">
      <div class="flex min-w-0 items-center gap-4">
        <SkillIcon iconKey={props.item.iconKey} name={props.item.displayName} />
        <div class="min-w-0">
          <div class="truncate text-[14px] font-semibold text-[var(--v2-text-text-base)]">
            {props.item.displayName}
          </div>
          <div class="truncate text-[13px] text-[var(--v2-text-text-muted)]">
            {normalizeDescription(props.item.description)}
          </div>
        </div>
      </div>
      <div class="shrink-0">
        <Show when={!installed()} fallback={installedControl()}>
          <button
            type="button"
            aria-label={`Install ${props.item.displayName}`}
            title={`Install ${props.item.displayName}`}
            disabled={props.installing || props.uninstalling}
            onClick={() => props.onInstall(props.item)}
            class="flex items-center gap-1.5 rounded-full border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-layer-02)] px-3 py-1.5 text-[13px] font-medium text-[var(--v2-text-text-base)] backdrop-blur-md transition-all hover:bg-[var(--v2-background-bg-layer-03)] hover:border-[var(--v2-border-border-base)] disabled:cursor-default disabled:opacity-55"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add
          </button>
        </Show>
      </div>
    </div>
  )
}

export const skillIcon = (item: Pick<SkillStoreItem, "name" | "category">) => {
  const value = `${item.name} ${item.category}`.toLowerCase()
  if (value.includes("image")) return "image"
  if (value.includes("doc")) return "docs"
  if (value.includes("plugin")) return "installer"
  if (value.includes("review")) return "review"
  if (value.includes("install")) return "installer"
  return "sparkles"
}

export const SettingsSkillsV2 = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const [installingId, setInstallingId] = createSignal<string | null>(null)
  const [uninstallingId, setUninstallingId] = createSignal<string | null>(null)
  const [inputValue, setInputValue] = createSignal("")
  const [query, setQuery] = createSignal("")
  const [isTyping, setIsTyping] = createSignal(false)

  const canManage = () => typeof platform.listSkillStore === "function"

  let searchTimeout: ReturnType<typeof setTimeout>
  const handleSearchInput = (value: string) => {
    setInputValue(value)
    setIsTyping(true)
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      setQuery(value)
      setIsTyping(false)
    }, 400)
  }

  const [storeData, { mutate: mutateStoreData }] = createResource(
    async (): Promise<{ catalog: SkillStoreItem[] }> => {
      if (!platform.listSkillStore) return { catalog: [] }
      return { catalog: await platform.listSkillStore().catch(() => []) }
    },
    { initialValue: { catalog: [] } }
  )

  const items = createMemo<SkillStoreViewItem[]>(() => {
    const data = storeData()
    if (!data) return []

    return data.catalog.map((item) => ({
      ...item,
      installed: item.installed,
      description: normalizeDescription(item.description),
      source: "store",
      iconKey: (item as any).iconKey || skillIcon(item)
    }))
  })

  const filteredItems = createMemo(() => {
    const value = query().trim().toLowerCase()
    if (!value) return items()
    return items().filter((item) =>
      `${item.displayName} ${item.name} ${item.description} ${item.category}`.toLowerCase().includes(value),
    )
  })

  const addedItems = createMemo(() => filteredItems().filter((i) => i.installed))
  const availableItems = createMemo(() => filteredItems().filter((i) => !i.installed))

  const patchStoreItem = (item: SkillStoreItem, installed: boolean) => {
    mutateStoreData((current) => {
      if (!current) return current
      const catalog = current.catalog.map((catalogItem) =>
        catalogItem.id === item.id
          ? {
            ...catalogItem,
            installed,
            managed: installed ? item.managed : false,
            location: installed ? item.location : null,
          }
          : catalogItem,
      )
      return { catalog }
    })
  }

  const installSkill = async (item: SkillStoreViewItem) => {
    if (!platform.installSkill || item.installed || installingId() || uninstallingId()) return

    setInstallingId(item.id)
    try {
      const installed = await platform.installSkill(item.id)
      patchStoreItem(installed, true)
      showToast({
        title: language.t("settings.skills.toast.installed.title"),
        description: language.t("settings.skills.toast.installed.description", { name: item.displayName }),
      })
    } catch (error) {
      showToast({
        title: language.t("settings.skills.toast.installFailed.title"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setInstallingId(null)
    }
  }

  const uninstallSkill = async (item: SkillStoreViewItem) => {
    if (!platform.uninstallSkill || !item.installed || !item.managed || installingId() || uninstallingId()) return

    setUninstallingId(item.id)
    try {
      await platform.uninstallSkill(item.id)
      patchStoreItem(item, false)
      showToast({
        title: language.t("settings.skills.toast.uninstalled.title"),
        description: language.t("settings.skills.toast.uninstalled.description", { name: item.displayName }),
      })
    } catch (error) {
      showToast({
        title: language.t("settings.skills.toast.uninstallFailed.title"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setUninstallingId(null)
    }
  }

  return (
    <div class="mx-auto w-full max-w-[900px] space-y-10 p-6 text-[var(--v2-text-text-base)] lg:p-10">
      <Show when={!canManage()}>
        <div class="text-[13px] text-[var(--v2-text-text-muted)]">{language.t("settings.skills.desktopOnly")}</div>
      </Show>

      <Show when={canManage()}>
        <div class="space-y-1">
          <h1 class="text-3xl font-semibold">Plugins & Skills</h1>
          <p class="text-[15px] text-[var(--v2-text-text-muted)]">Work with Shob across your favorite tools</p>
        </div>

        <div class="flex items-center gap-3">
          <label class="relative flex h-[44px] flex-1">
            <span class="sr-only">Search plugins and skills</span>
            <Show
              when={isTyping()}
              fallback={
                <Search
                  size={18}
                  class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--v2-text-text-muted)]"
                />
              }
            >
              <Loader2
                size={18}
                class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-[var(--v2-text-text-muted)]"
              />
            </Show>
            <input
              value={inputValue()}
              onInput={(event) => handleSearchInput(event.currentTarget.value)}
              placeholder="Search plugins and skills"
              class="h-full w-full rounded-full bg-[var(--v2-background-bg-layer-02)] border border-[var(--v2-border-border-muted)] pl-11 pr-4 text-[14px] text-[var(--v2-text-text-base)] outline-none transition-colors placeholder:text-[var(--v2-text-text-muted)] focus:border-[var(--v2-border-border-focus)] focus:bg-[var(--v2-background-bg-layer-03)]"
            />
          </label>
        </div>

        <Show when={addedItems().length > 0}>
          <div class="space-y-4">
            <h2 class="text-[15px] font-semibold text-[var(--v2-text-text-base)]">Installed</h2>
            <div class="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
              <For each={addedItems()}>
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
          </div>
        </Show>

        <Show when={availableItems().length > 0 || (query() && addedItems().length === 0)}>
          <div class="space-y-4">
            <h2 class="text-[15px] font-semibold text-[var(--v2-text-text-base)]">Available</h2>
            <Show
              when={availableItems().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center rounded-[8px] border border-[var(--v2-border-border-muted)] px-4 py-16 text-[13px] text-[var(--v2-text-text-muted)]">
                  <span>No skills found matching "{query()}".</span>
                </div>
              }
            >
              <div class="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
                <For each={availableItems()}>
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
          </div>
        </Show>
      </Show>
    </div>
  )
}

