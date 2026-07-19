import { ProviderIcon } from "@shob/ui/provider-icon"
import { Icon as IconV2 } from "@shob/ui/v2/icon"
import { IconButtonV2 } from "@shob/ui/v2/icon-button-v2"
import { Switch } from "@shob/ui/v2/switch-v2"
import { TextInputV2 } from "@shob/ui/v2/text-input-v2"
import { createEffect, createMemo, createSignal, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"
import { useServerSync } from "@/context/server-sync"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { showToast } from "@/utils/toast"
import "./settings-v2.css"

type ModelItem = ReturnType<ReturnType<typeof useModels>["list"]>[number]
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

const providerRank = (id: string) => {
  const rank = popularProviders.indexOf(id)
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

const providerName = (item: { id: string; name: string }) => {
  if (item.id === "xai") return "xAI (Grok)"
  return item.name
}

const matches = (query: string, values: Array<string | undefined>) => {
  if (!query) return true
  return values.some((value) => value?.toLowerCase().includes(query))
}

const EmptyState: Component<{ message: string; filter?: string }> = (props) => (
  <div class="settings-v2-models-status">
    <span>{props.message}</span>
    <Show when={props.filter}>
      <span class="settings-v2-models-status-filter">&quot;{props.filter}&quot;</span>
    </Show>
  </div>
)

const ProviderCard: Component<{ item: ProviderItem; openLabel: string; onSelect: () => void }> = (props) => (
  <button type="button" class="settings-v2-model-provider-card" onClick={props.onSelect}>
    <span class="settings-v2-provider-mark">
      <ProviderIcon id={props.item.id} class="settings-v2-provider-mark-icon" />
    </span>
    <span class="settings-v2-provider-card-copy">
      <span class="settings-v2-provider-card-name">{providerName(props.item)}</span>
      <span class="settings-v2-model-provider-count">
        {props.item.id} - {Object.keys(props.item.models).length}
      </span>
    </span>
    <span class="settings-v2-model-provider-open">
      <span>{props.openLabel}</span>
      <span aria-hidden="true">&gt;</span>
    </span>
  </button>
)

const ModelRow: Component<{ item: ModelItem; visible: boolean; onToggle: (checked: boolean) => void }> = (props) => (
  <div class="settings-v2-model-row">
    <span class="settings-v2-model-row-copy">
      <span class="settings-v2-model-row-name">{props.item.name}</span>
      <Show when={props.item.id !== props.item.name}>
        <span class="settings-v2-model-row-id">{props.item.id}</span>
      </Show>
    </span>
    <Switch checked={props.visible} onChange={props.onToggle} hideLabel>
      {props.item.name}
    </Switch>
  </div>
)

export const SettingsModelsV2: Component = () => {
  const language = useLanguage()
  const models = useModels()
  const providers = useProviders()
  const serverSync = useServerSync()
  const [filter, setFilter] = createSignal("")
  const [selectedProviderID, setSelectedProviderID] = createSignal<string>()

  const query = createMemo(() => filter().trim().toLowerCase())
  const disabledProviders = createMemo(() => serverSync().data.config.disabled_providers ?? [])

  const providerList = createMemo(() => {
    const items = providers.connected()
    items.sort((a, b) => {
      const rank = providerRank(a.id) - providerRank(b.id)
      if (rank !== 0) return rank
      return providerName(a).localeCompare(providerName(b))
    })
    return items
  })

  const filteredProviders = createMemo(() =>
    providerList().filter((provider) => matches(query(), [providerName(provider), provider.name, provider.id])),
  )

  const selectedProvider = createMemo(() => providerList().find((provider) => provider.id === selectedProviderID()))

  createEffect(() => {
    if (selectedProviderID() && !selectedProvider()) setSelectedProviderID(undefined)
  })

  const selectedProviderModels = createMemo(() => {
    const provider = selectedProvider()
    if (!provider) return []
    const items = models.list().filter((model) => model.provider.id === provider.id)
    items.sort((a, b) => a.name.localeCompare(b.name))
    return items
  })

  const filteredModels = createMemo(() =>
    selectedProviderModels().filter((model) =>
      matches(query(), [model.name, model.id, model.provider.name, model.provider.id]),
    ),
  )

  const clearFilter = () => setFilter("")

  const selectProvider = (providerID: string) => {
    setSelectedProviderID(providerID)
    clearFilter()
  }

  const backToProviders = () => {
    setSelectedProviderID(undefined)
    clearFilter()
  }

  const isProviderEnabled = (provider: ProviderItem) => !disabledProviders().includes(provider.id)

  const saveDisabledProviders = async (next: string[], before: string[]) => {
    serverSync().set("config", "disabled_providers", next)
    await serverSync()
      .updateConfig({ disabled_providers: next })
      .catch((err: unknown) => {
        serverSync().set("config", "disabled_providers", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const handleProviderToggle = (provider: ProviderItem, checked: boolean) => {
    const before = disabledProviders()
    const next = checked ? before.filter((id) => id !== provider.id) : before.includes(provider.id) ? before : [...before, provider.id]
    void saveDisabledProviders(next, before)
  }

  return (
    <div class="settings-v2-models-page">
      <div class="settings-v2-page-heading">
        <h2>{language.t("settings.models.title")}</h2>
      </div>

      <div class="settings-v2-models-search">
        <TextInputV2
          type="search"
          appearance="base"
          leadingIcon={<IconV2 name="magnifying-glass" size="large" class="text-v2-icon-icon-muted" />}
          value={filter()}
          onInput={(event) => setFilter(event.currentTarget.value)}
          placeholder={
            selectedProvider()
              ? language.t("dialog.model.search.placeholder")
              : language.t("dialog.provider.search.placeholder")
          }
          spellcheck={false}
          autocorrect="off"
          autocomplete="off"
          autocapitalize="off"
          aria-label={
            selectedProvider()
              ? language.t("dialog.model.search.placeholder")
              : language.t("dialog.provider.search.placeholder")
          }
        />
        <Show when={filter()}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="small"
            class="settings-v2-tab-search-clear"
            icon={<IconV2 name="close" size="large" class="text-v2-icon-icon-muted" />}
            onClick={clearFilter}
          />
        </Show>
      </div>

      <Show
        when={selectedProvider()}
        fallback={
          <Show
            when={filteredProviders().length > 0}
            fallback={
              <div class="settings-v2-models-panel">
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
            <div class="settings-v2-model-provider-grid">
              <For each={filteredProviders()}>
                {(provider) => (
                  <ProviderCard
                    item={provider}
                    openLabel={language.t("common.open")}
                    onSelect={() => selectProvider(provider.id)}
                  />
                )}
              </For>
            </div>
          </Show>
        }
      >
        {(provider) => (
          <div class="settings-v2-model-detail">
            <div class="settings-v2-model-detail-header">
              <IconButtonV2
                type="button"
                size="large"
                variant="ghost-muted"
                aria-label={language.t("common.goBack")}
                class="settings-v2-model-back"
                onClick={backToProviders}
                icon={<IconV2 name="chevron-left" size="large" />}
              />
              <ProviderIcon id={provider().id} class="settings-v2-model-detail-icon" />
              <span class="settings-v2-model-detail-name">{providerName(provider())}</span>
              <span class="settings-v2-model-detail-toggle">
                <Switch
                  checked={isProviderEnabled(provider())}
                  onChange={(checked) => handleProviderToggle(provider(), checked)}
                  hideLabel
                >
                  {providerName(provider())}
                </Switch>
              </span>
            </div>

            <div class="settings-v2-models-panel">
              <Show
                when={models.ready()}
                fallback={
                  <EmptyState message={`${language.t("common.loading")}${language.t("common.loading.ellipsis")}`} />
                }
              >
                <Show
                  when={filteredModels().length > 0}
                  fallback={<EmptyState message={language.t("dialog.model.empty")} filter={filter()} />}
                >
                  <div class="settings-v2-model-list">
                    <For each={filteredModels()}>
                      {(item) => (
                        <ModelRow
                          item={item}
                          visible={models.visible({ providerID: item.provider.id, modelID: item.id })}
                          onToggle={(checked) => {
                            models.setVisibility({ providerID: item.provider.id, modelID: item.id }, checked)
                          }}
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
  )
}
