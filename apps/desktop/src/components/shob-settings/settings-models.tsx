import { ProviderIcon } from "@shob-ai/ui/provider-icon"
import { Switch } from "@shob-ai/ui/switch"
import { Icon } from "@shob-ai/ui/icon"
import { IconButton } from "@shob-ai/ui/icon-button"
import { TextField } from "@shob-ai/ui/text-field"
import { showToast } from "@shob-ai/ui/toast"
import { type Component, For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSync } from "@/context/global-sync"
import { useModels } from "@/context/models"
import { popularProviders, useProviders } from "@/hooks/use-providers"

type BaseModelItem = ReturnType<ReturnType<typeof useModels>["list"]>[number]
type ModelItem = BaseModelItem | {
  id: string
  name: string
  provider: ProviderItem
  hiddenOnly: true
}
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

const providerName = (item: { id: string; name: string }) => (item.id === "xai" ? "xAI (Grok)" : item.name)

const providerRank = (id: string) => {
  const rank = popularProviders.indexOf(id)
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

const matches = (query: string, values: Array<string | undefined>) => {
  if (!query) return true
  return values.some((value) => value?.toLowerCase().includes(query))
}

const LoadingState: Component<{ label: string }> = (props) => (
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <span class="text-14-regular text-text-weak">{props.label}</span>
  </div>
)

const EmptyState: Component<{ message: string; filter: string }> = (props) => (
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <span class="text-14-regular text-text-weak">{props.message}</span>
    <Show when={props.filter}>
      <span class="text-14-regular text-text-strong mt-1">"{props.filter}"</span>
    </Show>
  </div>
)

const ModelRow: Component<{ item: ModelItem; onToggle: (checked: boolean) => void; visible: boolean }> = (props) => (
  <div class="flex items-center justify-between gap-4 py-2.5 border-b border-border-weak-base last:border-0">
    <div class="min-w-0">
      <span class="text-13-regular text-text-strong truncate block">{props.item.name}</span>
      <Show when={props.item.id !== props.item.name}>
        <span class="text-12-regular text-text-weak truncate block">{props.item.id}</span>
      </Show>
    </div>
    <div class="flex-shrink-0">
      <Switch checked={props.visible} onChange={props.onToggle} hideLabel>
        {props.item.name}
      </Switch>
    </div>
  </div>
)

const ProviderRow: Component<{ item: ProviderItem; onSelect: () => void; openLabel: string }> = (props) => (
  <button
    type="button"
    class="group grid min-h-[64px] min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border border-border-weak-base bg-surface-panel px-4 py-3 text-left transition-colors hover:border-border-strong-base hover:bg-surface-raised-base-hover"
    onClick={props.onSelect}
  >
    <ProviderIcon id={props.item.id} class="size-5 shrink-0 icon-strong-base" />
    <span class="min-w-0">
      <span class="block truncate text-14-medium text-text-strong">{providerName(props.item)}</span>
      <span class="block truncate text-12-regular text-text-weak">
        {props.item.id} · {Object.keys(props.item.models).length}
      </span>
    </span>
    <span class="flex shrink-0 items-center gap-2 text-12-medium text-text-weak group-hover:text-text-strong">
      <span class="hidden sm:inline">{props.openLabel}</span>
      <Icon name="chevron-right" class="text-icon-weak group-hover:text-icon-strong-base" />
    </span>
  </button>
)

export const SettingsModels: Component = () => {
  const language = useLanguage()
  const globalSync = useGlobalSync()
  const models = useModels()
  const providers = useProviders()
  const [filter, setFilter] = createSignal("")
  const [selectedProviderID, setSelectedProviderID] = createSignal<string>()

  const query = createMemo(() => filter().trim().toLowerCase())
  const hiddenModels = createMemo(() => globalSync.data.config.hidden_models ?? {})

  const providerList = createMemo(() => {
    const byID = new Map<string, ProviderItem>()
    for (const provider of providers.connected()) byID.set(provider.id, provider)
    for (const [providerID, hidden] of Object.entries(hiddenModels())) {
      if (hidden.length === 0 || byID.has(providerID)) continue
      byID.set(providerID, {
        id: providerID,
        name: providerID,
        source: "custom",
        env: [],
        options: {},
        models: Object.fromEntries(hidden.map((modelID) => [modelID, { id: modelID, name: modelID }])),
      } as ProviderItem)
    }
    const items = Array.from(byID.values())
    items.sort((a, b) => {
      const rank = providerRank(a.id) - providerRank(b.id)
      if (rank !== 0) return rank
      return providerName(a).localeCompare(providerName(b))
    })
    return items
  })

  const filteredProviders = createMemo(() => {
    const needle = query()
    return providerList().filter((provider) => matches(needle, [providerName(provider), provider.name, provider.id]))
  })

  const selectedProvider = createMemo(() => providerList().find((provider) => provider.id === selectedProviderID()))

  createEffect(() => {
    if (selectedProviderID() && !selectedProvider()) setSelectedProviderID(undefined)
  })

  const selectedProviderModels = createMemo(() => {
    const provider = selectedProvider()
    if (!provider) return []
    const visible = models
      .list()
      .filter((model) => model.provider.id === provider.id)
      .sort((a, b) => a.name.localeCompare(b.name))
    const byID = new Map<string, ModelItem>(visible.map((model) => [model.id, model]))
    for (const hiddenID of hiddenModels()[provider.id] ?? []) {
      if (byID.has(hiddenID)) continue
      byID.set(hiddenID, {
        id: hiddenID,
        name: hiddenID,
        provider,
        hiddenOnly: true,
      })
    }
    return Array.from(byID.values()).sort((a, b) => a.name.localeCompare(b.name))
  })

  const filteredModels = createMemo(() => {
    const needle = query()
    return selectedProviderModels().filter((model) =>
      matches(needle, [model.name, model.id, model.provider.name, model.provider.id]),
    )
  })

  const isVisible = (item: ModelItem) => !(hiddenModels()[item.provider.id] ?? []).includes(item.id)

  const saveHiddenModels = async (next: Record<string, string[]>, before: Record<string, string[]>) => {
    globalSync.set("config", "hidden_models", next)
    await globalSync
      .updateConfig({ hidden_models: next })
      .catch((err: unknown) => {
        globalSync.set("config", "hidden_models", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const handleToggle = (item: ModelItem, checked: boolean) => {
    const before = hiddenModels()
    const current = before[item.provider.id] ?? []
    const nextHidden = checked ? current.filter((id) => id !== item.id) : current.includes(item.id) ? current : [...current, item.id]
    const next = { ...before, [item.provider.id]: nextHidden }
    void saveHiddenModels(next, before)
    models.setVisibility({ providerID: item.provider.id, modelID: item.id }, checked)
  }

  const providerVisible = (provider: ProviderItem) => {
    const all = selectedProviderModels().filter((model) => model.provider.id === provider.id)
    return all.length > 0 && all.every(isVisible)
  }

  const handleProviderToggle = (provider: ProviderItem, checked: boolean) => {
    const all = selectedProviderModels().filter((model) => model.provider.id === provider.id)
    const before = hiddenModels()
    const next = { ...before, [provider.id]: checked ? [] : all.map((model) => model.id) }
    void saveHiddenModels(next, before)
    for (const model of all) {
      models.setVisibility({ providerID: provider.id, modelID: model.id }, checked)
    }
  }

  const clearFilter = () => setFilter("")
  const selectProvider = (providerID: string) => {
    setSelectedProviderID(providerID)
    clearFilter()
  }
  const backToProviders = () => {
    setSelectedProviderID(undefined)
    clearFilter()
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-6 py-6">
      <div class="flex flex-col gap-5 max-w-2xl">
        {/* Search */}
        <div class="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-panel border border-border-weak-base">
          <Icon name="magnifying-glass" class="text-icon-weak flex-shrink-0" />
          <TextField
            variant="ghost"
            type="text"
            value={filter()}
            onChange={setFilter}
            placeholder={
              selectedProvider()
                ? language.t("dialog.model.search.placeholder")
                : language.t("dialog.provider.search.placeholder")
            }
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            autocapitalize="off"
            class="flex-1"
          />
          <Show when={filter()}>
            <IconButton icon="circle-x" variant="ghost" onClick={clearFilter} />
          </Show>
        </div>

        {/* Content */}
        <Show
          when={selectedProvider()}
          fallback={
            <div class="flex flex-col gap-3">
              <Show
                when={filteredProviders().length > 0}
                fallback={
                  <div class="rounded-xl border border-border-weak-base bg-surface-panel p-8">
                    <EmptyState
                      message={
                        providerList().length === 0
                          ? language.t("settings.providers.connected.empty")
                          : language.t("dialog.provider.empty")
                      }
                      filter={filter()}
                    />
                  </div>
                }
              >
                <For each={filteredProviders()}>
                  {(provider) => (
                    <ProviderRow
                      item={provider}
                      openLabel={language.t("common.open")}
                      onSelect={() => selectProvider(provider.id)}
                    />
                  )}
                </For>
              </Show>
            </div>
          }
        >
          {(provider) => (
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-2">
                <IconButton
                  icon="arrow-left"
                  variant="ghost"
                  class="-ml-2 h-7 w-7"
                  onClick={backToProviders}
                  aria-label={language.t("common.goBack")}
                />
                <ProviderIcon id={provider().id} class="size-5 shrink-0 icon-strong-base" />
                <span class="min-w-0 truncate text-14-medium text-text-strong">{providerName(provider())}</span>
                <span class="ml-auto">
                  <Switch
                    checked={providerVisible(provider())}
                    onChange={(checked) => handleProviderToggle(provider(), checked)}
                    hideLabel
                  >
                    {providerName(provider())}
                  </Switch>
                </span>
              </div>

              <div class="rounded-xl border border-border-weak-base bg-surface-panel p-5">
                <Show
                  when={models.ready()}
                  fallback={
                    <LoadingState label={`${language.t("common.loading")}${language.t("common.loading.ellipsis")}`} />
                  }
                >
                  <Show
                    when={filteredModels().length > 0}
                    fallback={<EmptyState message={language.t("dialog.model.empty")} filter={filter()} />}
                  >
                    <div class="flex flex-col">
                      <For each={filteredModels()}>
                        {(item) => (
                          <ModelRow
                            item={item}
                            visible={isVisible(item)}
                            onToggle={(checked) => handleToggle(item, checked)}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}
