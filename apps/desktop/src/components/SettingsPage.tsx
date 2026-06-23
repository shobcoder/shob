import { createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { Blocks, Boxes, SlidersHorizontal, Box, CircleHelp, ArrowLeft } from "lucide-solid"
import { useWindowChrome } from "@/utils/window-chrome"
import { SettingsProviders } from "./shob-settings/settings-providers"
import { SettingsModels } from "./shob-settings/settings-models"
import { SettingsAbout } from "./settings-about"
import { SettingsPlugins } from "./settings-plugins"
import { useStore } from "../store"
import { applyAppTheme, getThemeById, SHOB_THEME_LIST, resolveThemeMode, type ShobTheme } from "../theme"
import { Combobox, ComboboxContent, ComboboxControl, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/context/settings"
import { TASK_SOUND_OPTIONS, playTaskSound } from "@/utils/sound"

type SettingsSection = "general" | "plugins" | "providers" | "models" | "about"

const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "Theme, appearance, and terminal defaults",
    icon: SlidersHorizontal,
    keywords: ["appearance", "theme", "color", "shell", "terminal"],
  },
  {
    id: "providers",
    label: "Providers",
    description: "Connected accounts and API providers",
    icon: Boxes,
    keywords: ["provider", "api", "account", "connect", "key"],
  },
  {
    id: "models",
    label: "Models",
    description: "Visible models and provider catalogs",
    icon: Box,
    keywords: ["model", "ai", "visibility", "provider"],
  },
  {
    id: "plugins",
    label: "Plugins",
    description: "Install skills and workflows",
    icon: Blocks,
    keywords: ["plugin", "plugins", "skill", "skills", "store", "marketplace"],
  },
  {
    id: "about",
    label: "About",
    description: "App version and update controls",
    icon: CircleHelp,
    keywords: ["version", "update", "about", "release"],
  },
] as const


const COLOR_SCHEME_OPTIONS = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const

function getThemeColors(theme: any, isDark: boolean) {
  const variant = isDark ? theme.dark : theme.light
  const palette = variant?.palette || variant?.seeds
  return {
    background: palette?.neutral ?? (isDark ? "#121214" : "#f4f4f6"),
    primary: palette?.primary ?? "#3b82f6",
    accent: palette?.accent ?? palette?.info ?? "#eab308",
    success: palette?.success ?? "#22c55e",
  }
}

function SettingsRow(props: {
  title: string
  description?: string
  children: JSX.Element
}) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 px-3 py-3.5 last:border-b-0 sm:px-4">
      <div class="min-w-[180px] flex-1">
        <div class="truncate text-[13px] font-medium leading-5 text-foreground">{props.title}</div>
        <Show when={props.description}>
          <div class="text-[12px] leading-5 text-muted-foreground">{props.description}</div>
        </Show>
      </div>
      <div class="min-w-0" style={{ width: "min(100%, 240px)" }}>
        {props.children}
      </div>
    </div>
  )
}

export function SettingsPage(props: { onGoBack?: () => void }) {
  const chrome = useWindowChrome()
  const themeId = useStore((s) => s.themeId)
  const colorScheme = useStore((s) => s.colorScheme)
  const setThemeId = useStore((s) => s.setThemeId)
  const setColorScheme = useStore((s) => s.setColorScheme)
  const settings = useSettings()
  const [section, setSection] = createSignal<SettingsSection>("general")

  const selectedTaskSound = createMemo(
    () => TASK_SOUND_OPTIONS.find((option) => option.id === settings.sounds.taskComplete()) ?? TASK_SOUND_OPTIONS[0],
  )

  const isDark = createMemo(() => {
    const scheme = colorScheme()
    if (scheme === 'dark') return true
    if (scheme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const activeSection = createMemo(() => SETTINGS_SECTIONS.find((item) => item.id === section()) ?? SETTINGS_SECTIONS[0])

  const committedTheme = createMemo(() => getThemeById(themeId()))

  let previewThemeTimeoutId: number | null = null
  let pendingThemePreviewId: string | null = null
  let previewedThemeId: string | null = null

  const clearThemePreviewDelay = () => {
    if (previewThemeTimeoutId !== null) {
      window.clearTimeout(previewThemeTimeoutId)
      previewThemeTimeoutId = null
    }
    pendingThemePreviewId = null
  }

  onCleanup(clearThemePreviewDelay)

  const currentThemeMode = () => resolveThemeMode(colorScheme(), isDark() ? "dark" : "light")

  const previewThemeSelection = (nextThemeId: string) => {
    const nextTheme = getThemeById(nextThemeId)
    if (nextTheme.id === themeId()) {
      if (previewedThemeId !== null) {
        previewedThemeId = null
        applyAppTheme(committedTheme(), currentThemeMode())
      }
      return
    }
    if (previewedThemeId === nextTheme.id) return
    previewedThemeId = nextTheme.id
    applyAppTheme(nextTheme, currentThemeMode())
  }

  const scheduleThemePreview = (nextThemeId: string) => {
    const nextTheme = getThemeById(nextThemeId)
    if (pendingThemePreviewId === nextTheme.id || previewedThemeId === nextTheme.id) return
    if (nextTheme.id === themeId() && previewedThemeId === null) return
    clearThemePreviewDelay()
    pendingThemePreviewId = nextTheme.id
    previewThemeTimeoutId = window.setTimeout(() => {
      previewThemeTimeoutId = null
      pendingThemePreviewId = null
      previewThemeSelection(nextTheme.id)
    }, 90)
  }

  const applyThemeSelection = (nextThemeId: string) => {
    clearThemePreviewDelay()
    const nextTheme = getThemeById(nextThemeId)
    previewedThemeId = null
    applyAppTheme(nextTheme, currentThemeMode())
    if (themeId() !== nextTheme.id) setThemeId(nextTheme.id)
  }

  const handleThemeSelectOpenChange = (isOpen: boolean) => {
    clearThemePreviewDelay()
    if (isOpen || previewedThemeId === null) return
    const nextTheme = committedTheme()
    previewedThemeId = null
    applyAppTheme(nextTheme, currentThemeMode())
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <header
        class="mac-drag-region flex h-12 shrink-0 items-center gap-1 border-b border-border/50 bg-background px-2"
        style={{ "padding-left": `${chrome.trafficLightInset()}px` }}
      >
        <button
          type="button"
          onClick={() => props.onGoBack?.()}
          class="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          title="Go back"
          aria-label="Go back"
        >
          <ArrowLeft class="h-4 w-4 shrink-0" />
          <span>Back</span>
        </button>
        <span class="ml-1 text-[13px] font-semibold text-foreground">Settings</span>
      </header>

      <div class="flex min-h-0 flex-1">
        <aside class="flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-border/50 bg-background p-3">
          <nav class="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div class="px-2 pb-1.5 pt-1 text-[13px] font-medium leading-5 text-muted-foreground/75">Personal</div>
            <div class="grid gap-0.5">
              <For each={SETTINGS_SECTIONS}>
                {(item) => {
                  const Icon = item.icon
                  const isActive = () => section() === item.id

                  return (
                    <button
                      type="button"
                      onClick={() => setSection(item.id)}
                      aria-current={isActive() ? "page" : undefined}
                      class={`group flex h-8 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-md px-2 text-left outline-none transition-colors ${
                        isActive()
                          ? "bg-muted/65 text-foreground"
                          : "text-foreground hover:bg-muted/40"
                      }`}
                    >
                      <Icon class={`h-4 w-4 shrink-0 transition-colors ${
                        isActive() ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      }`} />
                      <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-5">{item.label}</span>
                    </button>
                  )
                }}
              </For>
            </div>
          </nav>
        </aside>

        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <Show when={section() === "general"}>
            <div class="w-full max-w-[700px] space-y-5 p-6 lg:p-8">
              <h2 class="text-[15px] font-semibold leading-5 text-foreground">{activeSection().label}</h2>

              <div class="overflow-hidden rounded-lg border border-border/70 bg-card/35">
                <SettingsRow title="Appearance" description="App brightness">
                  <div class="inline-grid h-8 w-full grid-cols-3 rounded-lg bg-muted/70 p-0.5">
                    <For each={COLOR_SCHEME_OPTIONS}>
                      {(item) => (
                        <button
                          type="button"
                          onClick={() => setColorScheme(item.id)}
                          aria-pressed={colorScheme() === item.id}
                          class={`flex items-center justify-center rounded-md px-2 text-[12px] font-medium leading-none outline-none transition-colors border ${
                            colorScheme() === item.id
                              ? "bg-background text-foreground shadow-sm border-border"
                              : "text-muted-foreground hover:text-foreground border-transparent"
                          }`}
                        >
                          {item.label}
                        </button>
                      )}
                    </For>
                  </div>
                </SettingsRow>

                <SettingsRow title="Theme" description="Color palette">
                  <label class="sr-only" for="settings-theme-select">Theme</label>
                  <Combobox
                    options={SHOB_THEME_LIST}
                    optionValue="id"
                    optionTextValue="name"
                    optionLabel="name"
                    value={committedTheme()}
                    onChange={(theme: ShobTheme | null) => {
                      if (theme) applyThemeSelection(theme.id)
                    }}
                    onOpenChange={handleThemeSelectOpenChange}
                    itemComponent={(props: { item: { rawValue: ShobTheme } }) => {
                      const theme = props.item.rawValue
                      const colors = getThemeColors(theme, isDark())

                      return (
                        <ComboboxItem
                          item={props.item}
                          class="min-h-8 cursor-default gap-2 px-2 py-1.5 pr-8 text-[13px] font-medium text-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:bg-secondary/80 data-selected:text-foreground"
                          onFocus={() => scheduleThemePreview(theme.id)}
                          onPointerMove={(event: PointerEvent) => {
                            if (event.pointerType === "mouse") scheduleThemePreview(theme.id)
                          }}
                        >
                          <div class="flex min-w-0 flex-1 items-center gap-2">
                            <div class="flex shrink-0 items-center">
                              <span
                                style={{ "background-color": colors.background }}
                                class="z-10 -mr-1 h-3 w-3 shrink-0 rounded-full border border-border"
                              />
                              <span
                                style={{ "background-color": colors.primary }}
                                class="z-20 -mr-1 h-3 w-3 shrink-0 rounded-full border border-border"
                              />
                              <span
                                style={{ "background-color": colors.accent }}
                                class="z-30 -mr-1 h-3 w-3 shrink-0 rounded-full border border-border"
                              />
                            </div>
                            <span class="min-w-0 truncate">{theme.name}</span>
                          </div>
                        </ComboboxItem>
                      )
                    }}
                  >
                    <ComboboxControl>
                      <ComboboxInput id="settings-theme-select" aria-label="Select theme" />
                    </ComboboxControl>
                    <ComboboxContent>
                      <ComboboxList />
                    </ComboboxContent>
                  </Combobox>
                </SettingsRow>


              </div>

              <div class="text-[13px] font-medium leading-5 text-muted-foreground/75">Sounds</div>
              <div class="overflow-hidden rounded-lg border border-border/70 bg-card/35">
                <SettingsRow title="Task complete sound" description="Play a sound when an agent finishes a task">
                  <div class="flex w-full justify-end">
                    <Switch
                      checked={settings.sounds.taskCompleteEnabled()}
                      onChange={(value) => settings.sounds.setTaskCompleteEnabled(value)}
                      aria-label="Toggle task complete sound"
                    />
                  </div>
                </SettingsRow>

                <Show when={settings.sounds.taskCompleteEnabled()}>
                  <Show when={TASK_SOUND_OPTIONS.length > 1}>
                    <SettingsRow title="Sound" description="Which sound to play on completion">
                      <Select
                        options={TASK_SOUND_OPTIONS.map((option) => option.id)}
                        value={selectedTaskSound().id}
                        onChange={(id: string | null) => {
                          if (!id) return
                          settings.sounds.setTaskComplete(id)
                          void playTaskSound(id, settings.sounds.taskCompleteVolume())
                        }}
                        itemComponent={(props: { item: { rawValue: string } }) => (
                          <SelectItem
                            item={props.item}
                            class="min-h-8 cursor-default px-2 py-1.5 pr-8 text-[13px] font-medium text-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:bg-secondary/80 data-selected:text-foreground"
                          >
                            <span class="min-w-0 truncate">
                              {TASK_SOUND_OPTIONS.find((option) => option.id === props.item.rawValue)?.label ??
                                props.item.rawValue}
                            </span>
                          </SelectItem>
                        )}
                      >
                        <SelectTrigger
                          class="h-8 w-full border-transparent bg-muted/70 px-2.5 text-[13px] font-medium text-foreground hover:bg-muted"
                          aria-label="Select task complete sound"
                        >
                          <SelectValue>{() => selectedTaskSound().label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent class="max-h-56 w-[var(--kb-select-trigger-width)] rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-2xl" />
                      </Select>
                    </SettingsRow>
                  </Show>

                  <SettingsRow title="Volume" description="How loud the sound plays (0-100)">
                    <div class="flex w-full items-center justify-end gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(settings.sounds.taskCompleteVolume() * 100)}
                        onInput={(event) => {
                          const next = Number(event.currentTarget.value)
                          if (Number.isNaN(next)) return
                          settings.sounds.setTaskCompleteVolume(next / 100)
                        }}
                        class="h-8 w-20 rounded-md border border-border/70 bg-muted/70 px-2.5 text-[13px] font-medium text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                        aria-label="Task complete sound volume"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void playTaskSound(settings.sounds.taskComplete(), settings.sounds.taskCompleteVolume())
                        }
                        class="shrink-0 rounded-md border border-border/70 bg-muted/70 px-2.5 py-1 text-[12px] font-medium text-foreground outline-none transition-colors hover:bg-muted"
                      >
                        Test
                      </button>
                    </div>
                  </SettingsRow>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={section() === "providers"}>
            <SettingsProviders />
          </Show>

          <Show when={section() === "plugins"}>
            <SettingsPlugins />
          </Show>

          <Show when={section() === "models"}>
            <SettingsModels />
          </Show>

          <Show when={section() === "about"}>
            <div class="w-full max-w-[980px] p-6 lg:p-8">
              <SettingsAbout />
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}

