import { useFilteredList } from "@shob-ai/ui/hooks"
import { ProviderIcon } from "@shob-ai/ui/provider-icon"
import { Switch } from "@shob-ai/ui/switch"
import { Icon } from "@shob-ai/ui/icon"
import { IconButton } from "@shob-ai/ui/icon-button"
import { TextField } from "@shob-ai/ui/text-field"
import { type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useModels, type ModelKey } from "@/context/models"
import { popularProviders } from "@/hooks/use-providers"
import { iconNames } from "../../../../../packages/ui/src/components/provider-icons/types"

type ModelItem = ReturnType<ReturnType<typeof useModels>["list"]>[number]

const providerName = (provider: { id: string; name: string }) =>
  provider.id === "xai" ? "xAI (Grok)" : provider.name

const providerRank = (id: string) => {
  const rank = popularProviders.indexOf(id)
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

const hasProviderIcon = (id: string) =>
  id === "antigravity" || id === "shob" || id === "openclaude" || iconNames.includes(id as (typeof iconNames)[number])

const initials = (value: string) => {
  const parts = value.split(/[^a-z0-9]+/i).filter(Boolean)
  const text = parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join("") : (parts[0] ?? value).slice(0, 2)
  return text.toUpperCase()
}

const ProviderMark: Component<{ id: string; label: string; class?: string; sizeClass?: string }> = (props) => {
  const size = () => props.sizeClass ?? "size-8"
  return (
    <Show
      when={hasProviderIcon(props.id)}
      fallback={
        <span class={`flex ${size()} shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted text-[11px] font-semibold text-foreground ${props.class ?? ""}`}>
          {initials(props.label)}
        </span>
      }
    >
      <ProviderIcon id={props.id} class={`${size()} shrink-0 ${props.class ?? ""}`} />
    </Show>
  )
}

const LoadingState: Component<{ label: string }> = (props) => (
  <div class="flex flex-col items-center justify-center px-4 py-10 text-center">
    <span class="text-[13px] leading-5 text-muted-foreground">{props.label}</span>
  </div>
)

const EmptyState: Component<{ message: string; filter: string }> = (props) => (
  <div class="flex flex-col items-center justify-center px-4 py-10 text-center">
    <span class="text-[13px] leading-5 text-muted-foreground">{props.message}</span>
    <Show when={props.filter}>
      <span class="mt-1 text-[13px] font-medium leading-5 text-foreground">"{props.filter}"</span>
    </Show>
  </div>
)

export const SettingsModels: Component = () => {
  const language = useLanguage()
  const models = useModels()

  const list = useFilteredList<ModelItem>({
    items: () => models.list(),
    key: (x) => `${x.provider.id}:${x.id}`,
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: (x) => x.provider.id,
    sortGroupsBy: (a, b) => {
      const rank = providerRank(a.category) - providerRank(b.category)
      if (rank !== 0) return rank
      return providerName(a.items[0].provider).localeCompare(providerName(b.items[0].provider))
    },
  })

  const visible = (item: ModelItem) => models.visible({ providerID: item.provider.id, modelID: item.id } satisfies ModelKey)

  const setVisibility = (item: ModelItem, checked: boolean) =>
    models.setVisibility({ providerID: item.provider.id, modelID: item.id } satisfies ModelKey, checked)

  return (
    <div class="min-h-full bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div class="mx-auto w-full max-w-[760px] space-y-6">
        <div>
          <h2 class="text-lg font-semibold leading-7 text-foreground sm:text-[21px]">{language.t("dialog.model.manage")}</h2>
          <p class="mt-0.5 text-[13px] leading-5 text-muted-foreground">{language.t("dialog.model.manage.description")}</p>
        </div>

        <div class="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-3 transition-colors focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/30">
          <Icon name="magnifying-glass" class="h-4 w-4 shrink-0 text-muted-foreground" />
          <TextField
            variant="ghost"
            type="text"
            value={list.filter()}
            onChange={list.onInput}
            placeholder={language.t("dialog.model.search.placeholder")}
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            autocapitalize="off"
            class="flex-1"
          />
          <Show when={list.filter()}>
            <IconButton icon="circle-x" variant="ghost" onClick={list.clear} />
          </Show>
        </div>

        <Show
          when={models.ready()}
          fallback={<LoadingState label={`${language.t("common.loading")}${language.t("common.loading.ellipsis")}`} />}
        >
          <Show
            when={list.flat().length > 0}
            fallback={<EmptyState message={language.t("dialog.model.empty")} filter={list.filter()} />}
          >
            <div class="space-y-6">
              <For each={list.grouped.latest}>
                {(group) => {
                  const provider = () => group.items[0].provider
                  return (
                    <div class="space-y-2">
                      <div class="flex items-center gap-2 px-1">
                        <ProviderMark id={provider().id} label={providerName(provider())} sizeClass="size-5" />
                        <span class="text-[14px] font-semibold leading-5 text-foreground">{providerName(provider())}</span>
                      </div>
                      <div class="overflow-hidden rounded-xl border border-border/70 bg-card/60 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_5%,transparent)]">
                        <For each={group.items}>
                          {(item) => (
                            <div class="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3 last:border-b-0">
                              <div class="min-w-0">
                                <span class="block truncate text-[14px] font-medium leading-5 text-foreground">{item.name}</span>
                                <Show when={item.id !== item.name}>
                                  <span class="block truncate text-[12px] leading-4 text-muted-foreground">{item.id}</span>
                                </Show>
                              </div>
                              <div class="shrink-0">
                                <Switch checked={visible(item)} onChange={(checked) => setVisibility(item, checked)} hideLabel>
                                  {item.name}
                                </Switch>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
