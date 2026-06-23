import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import {
  Blocks,
  BookOpen,
  Bot,
  Braces,
  MoreHorizontal,
  SlidersHorizontal,
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
  Loader2,
  Copy,
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
import { Dialog } from "@shob-ai/ui/dialog"
import { useDialog } from "@shob-ai/ui/context"
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
  source: "store" | "skills.sh"
  externalUrl?: string
}

const SkillsShIcon = (props: any) => (
  <svg width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="currentColor" role="img" xmlns="http://www.w3.org/2000/svg" {...props}>
    <title>skills.sh icon</title>
    <path d="M24 22.525H0l12-21.05 12 21.05z"/>
  </svg>
)

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
  "skills-sh": {
    icon: SkillsShIcon,
    class: "from-black via-zinc-900 to-zinc-800 text-white border border-white/10",
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

const markdownStyles = `
  [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-foreground
  [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-4 [&_h2]:mt-6 [&_h2]:text-foreground
  [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-3 [&_h3]:mt-5 [&_h3]:text-foreground
  [&_p]:mb-4 [&_p]:leading-relaxed
  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ul]:space-y-1.5
  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_ol]:space-y-1.5
  [&_li]:text-foreground/90 [&_li::marker]:text-muted-foreground
  [&_code]:bg-white/10 [&_code]:rounded-md [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]
  [&_pre]:mt-3 [&_pre]:mb-4 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/40 [&_pre]:p-4 [&_pre]:overflow-x-auto
  [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-white/90
  [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-4
  [&_strong]:font-semibold [&_strong]:text-foreground
  [&_a]:text-blue-400 [&_a]:no-underline hover:[&_a]:underline
  [&_hr]:my-8 [&_hr]:border-white/10
`.replace(/\s+/g, ' ')

function SkillDetails(props: { url: string, item: SkillStoreViewItem }) {
  const [copied, setCopied] = createSignal(false)
  
  const [skillInfo] = createResource(props.url, async (url) => {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`)
    if (!res.ok) throw new Error("Failed to load skill details")
    const html = await res.text()
    
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    
    const proseElements = Array.from(doc.querySelectorAll('.prose'))
    const readmeHtml = proseElements.map(el => el.innerHTML).join('<hr class="my-8 border-white/10" />') || "No description provided."

    const parts = props.item.name ? props.item.name.split("/") : []
    const owner = parts[0] || "unknown"
    const repo = parts[1] || "unknown"
    const skillName = parts[2] || "unknown"
    const installCommand = `npx skills add https://github.com/${owner}/${repo} --skill ${skillName}`

    return {
      owner,
      repo,
      skillName,
      installCommand,
      readmeHtml
    }
  })

  const handleCopy = () => {
    if (!skillInfo()) return
    navigator.clipboard.writeText(skillInfo()!.installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div class="relative mt-4 h-[500px] w-full overflow-y-auto rounded-xl border border-white/5 bg-background shadow-lg no-scrollbar">
      <Show when={skillInfo.loading}>
        <div class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/50 backdrop-blur-md">
          <Loader2 class="mb-4 animate-spin text-muted-foreground/70" size={28} />
        </div>
      </Show>
      <Show when={skillInfo() && !skillInfo.loading}>
        <div class="flex flex-col gap-10 p-6">
          <div class="space-y-3">
            <h3 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Installation</h3>
            <div class="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 pl-4 pr-1.5 py-1.5 font-mono text-[13px] text-foreground shadow-sm">
              <span class="truncate select-all opacity-90">{skillInfo()!.installCommand}</span>
              <button 
                onClick={handleCopy}
                class="flex shrink-0 h-8 items-center justify-center rounded-md bg-white/10 px-3 text-xs font-medium text-foreground transition-all hover:bg-white/20 active:scale-95"
              >
                <Show when={copied()} fallback={<Copy size={13} class="mr-1.5 opacity-70" />}>
                  <Check size={13} strokeWidth={3} class="mr-1.5 text-green-400" />
                </Show>
                {copied() ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          
          <div class="space-y-3 pb-8">
            <h3 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Description</h3>
            <div 
              class={`text-[14px] text-foreground/90 ${markdownStyles}`} 
              innerHTML={skillInfo()!.readmeHtml} 
            />
          </div>
        </div>
      </Show>
    </div>
  )
}

function SkillStoreRow(props: {
  item: SkillStoreViewItem
  installing: boolean
  uninstalling: boolean
  onInstall: (item: SkillStoreViewItem) => void
  onUninstall: (item: SkillStoreViewItem) => void
  variant?: "featured" | "default"
}) {
  const dialog = useDialog()
  const installed = () => props.item.installed

  const installedControl = () => (
    <Show
      when={props.item.managed}
      fallback={
        <div class="flex items-center justify-center text-muted-foreground/50" title="Installed">
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
        class="flex size-8 items-center justify-center rounded-full border border-white/5 bg-white/5 text-muted-foreground backdrop-blur-md transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-500 disabled:cursor-default disabled:opacity-55"
      >
        <Trash2 size={15} strokeWidth={2} />
      </button>
    </Show>
  )

  return (
    <div class="group flex items-center justify-between gap-4 rounded-xl p-3 transition-colors hover:bg-muted/30">
      <div class="flex min-w-0 items-center gap-4">
        <SkillIcon iconKey={props.item.iconKey} name={props.item.displayName} />
        <div class="min-w-0">
          <div class="truncate text-[14px] font-semibold text-foreground">
            {props.item.displayName}
          </div>
          <div class="truncate text-[13px] text-muted-foreground">
            {normalizeDescription(props.item.description)}
          </div>
        </div>
      </div>
      <div class="shrink-0">
        <Show 
          when={props.item.source !== "skills.sh"} 
          fallback={
            <button
              onClick={() => {
                dialog.show(() => (
                  <Dialog size="large" title={props.item.displayName} description={`Skill ID: ${props.item.name}`}>
                    <style>{`
                      [data-component="dialog-overlay"] {
                        backdrop-filter: blur(12px) !important;
                        background-color: rgba(0, 0, 0, 0.4) !important;
                      }
                    `}</style>
                    <div class="flex flex-col gap-4">
                      <SkillDetails url={props.item.externalUrl!} item={props.item} />
                      <div class="flex justify-end pt-2">
                        <a
                          href={props.item.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
                        >
                          Open in Browser
                        </a>
                      </div>
                    </div>
                  </Dialog>
                ))
              }}
              class="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[13px] font-medium text-foreground backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/20"
            >
              <BookOpen size={14} strokeWidth={2.5} />
              View
            </button>
          }
        >
          <Show when={!installed()} fallback={installedControl()}>
            <button
              type="button"
              aria-label={`Install ${props.item.displayName}`}
              title={`Install ${props.item.displayName}`}
              disabled={props.installing || props.uninstalling}
              onClick={() => props.onInstall(props.item)}
              class="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-foreground backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/20 disabled:cursor-default disabled:opacity-55"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add
            </button>
          </Show>
        </Show>
      </div>
    </div>
  )
}

export function SettingsPlugins() {
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const [installingId, setInstallingId] = createSignal<string | null>(null)
  const [uninstallingId, setUninstallingId] = createSignal<string | null>(null)
  const [inputValue, setInputValue] = createSignal("")
  const [query, setQuery] = createSignal("")
  const [isTyping, setIsTyping] = createSignal(false)

  let searchTimeout: ReturnType<typeof setTimeout>
  const handleSearchInput = (value: string) => {
    setInputValue(value)
    setIsTyping(true)
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      setQuery(value)
      setSkillsPage(1)
      setIsTyping(false)
    }, 400)
  }

  const [isSkillsShMode, setIsSkillsShMode] = createSignal(false)
  const [skillsPage, setSkillsPage] = createSignal(1)

  const [skillsShData] = createResource(
    () => ({ mode: isSkillsShMode(), q: query() }),
    async ({ mode, q }) => {
      if (!mode || !q.trim()) return []
      try {
        const targetUrl = `https://www.skills.sh/api/search?q=${encodeURIComponent(q.trim())}&limit=100`
        const url = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
        const res = await fetch(url)
        const data = await res.json()
        return data.skills || []
      } catch (e) {
        console.error(e)
        return []
      }
    }
  )

  const paginatedSkillsSh = createMemo(() => {
    const all = skillsShData.latest || []
    const start = (skillsPage() - 1) * 12
    return all.slice(start, start + 12)
  })

  const skillsShViewItems = createMemo<SkillStoreViewItem[]>(() => {
    return paginatedSkillsSh().map((skill: any) => ({
      id: skill.id || skill.skillId,
      name: skill.id || skill.skillId,
      displayName: skill.name || skill.skillId,
      description: `Source: ${skill.source} • Installs: ${skill.installs}`,
      iconKey: "skills-sh",
      installed: false,
      managed: true,
      category: "",
      source: "skills.sh",
      externalUrl: `https://www.skills.sh/${skill.id}`
    }))
  })

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
      installed: item.installed,
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

  const addedItems = createMemo(() => filteredItems().filter((i) => i.installed))
  const availableItems = createMemo(() => filteredItems().filter((i) => !i.installed))
  const featuredItems = createMemo(() => availableItems().slice(0, 2))
  const businessItems = createMemo(() => availableItems().slice(2))

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
    <div class="mx-auto w-full max-w-[900px] space-y-10 p-6 text-foreground lg:p-10">
      <div class="space-y-1">
        <h1 class="text-3xl font-semibold">Plugins & Skills</h1>
        <p class="text-[15px] text-muted-foreground">Work with Shob across your favorite tools</p>
      </div>

      <div class="flex items-center gap-3">
        <label class="relative flex h-[44px] flex-1">
          <span class="sr-only">Search plugins and skills</span>
          <Show
            when={isTyping() || skillsShData.loading}
            fallback={
              <Search
                size={18}
                class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
            }
          >
            <Loader2
              size={18}
              class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          </Show>
          <input
            value={inputValue()}
            onInput={(event) => handleSearchInput(event.currentTarget.value)}
            placeholder="Search plugins and skills"
            class="h-full w-full rounded-full bg-muted/40 pl-11 pr-4 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:bg-muted/60"
          />
        </label>
        <button
          onClick={() => {
            setIsSkillsShMode(!isSkillsShMode())
            setSkillsPage(1)
          }}
          class={`flex h-[44px] shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-medium transition-colors ${
            isSkillsShMode()
              ? "bg-foreground text-background"
              : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
          title="Toggle skills.sh mode"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" role="img" xmlns="http://www.w3.org/2000/svg">
            <title>skills.sh icon</title>
            <path d="M24 22.525H0l12-21.05 12 21.05z"/>
          </svg>
          skills.sh
        </button>
      </div>

      <Show when={isSkillsShMode()}>
        <Show
          when={skillsShViewItems().length > 0 || skillsShData.loading || isTyping()}
          fallback={
            <div class="flex flex-col items-center justify-center rounded-[8px] border border-border/60 px-4 py-16 text-[13px] text-muted-foreground">
              <Show
                when={skillsShData.loading || isTyping()}
                fallback={<span>No skills found. Try searching for something else.</span>}
              >
                <Loader2 size={24} class="mb-3 animate-spin opacity-50" />
                <span>Searching skills.sh...</span>
              </Show>
            </div>
          }
        >
          <div class={`grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2 transition-opacity ${skillsShData.loading ? "opacity-50" : "opacity-100"}`}>
            <For each={skillsShViewItems()}>
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

          <Show when={(skillsShData.latest?.length || 0) > 12}>
            <div class="flex items-center justify-center gap-4 pt-6">
              <button
                disabled={skillsPage() === 1 || skillsShData.loading}
                onClick={() => setSkillsPage((p) => p - 1)}
                class="rounded-full bg-muted/40 px-4 py-1.5 text-[13px] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <span class="text-[13px] text-muted-foreground">
                Page {skillsPage()} of {Math.ceil((skillsShData.latest?.length || 0) / 12)}
              </span>
              <button
                disabled={skillsPage() >= Math.ceil((skillsShData.latest?.length || 0) / 12) || skillsShData.loading}
                onClick={() => setSkillsPage((p) => p + 1)}
                class="rounded-full bg-muted/40 px-4 py-1.5 text-[13px] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </Show>
        </Show>
      </Show>

      <Show when={!isSkillsShMode() && !storeData.loading}>
        <Show
          when={filteredItems().length > 0}
          fallback={
            <div class="rounded-[8px] border border-border/60 px-4 py-8 text-center text-[13px] text-muted-foreground">
              No skills found.
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
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
