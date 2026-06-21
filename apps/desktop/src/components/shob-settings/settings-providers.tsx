import { Button } from "@shob-ai/ui/button"
import { useDialog } from "@shob-ai/ui/context/dialog"
import { ProviderIcon } from "@shob-ai/ui/provider-icon"
import { showToast } from "@shob-ai/ui/toast"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { createMemo, type Component, For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { DialogSelectProvider } from "./dialog-select-provider"
import { DialogCustomProvider } from "./dialog-custom-provider"
import {
  CUSTOM_ANTHROPIC_COMPATIBLE_PRESET,
  DialogOpenAICompatible,
  SHOB_OPENAI_COMPATIBLE_PRESET,
} from "./dialog-openai-compatible"
import { iconNames } from "../../../../../packages/ui/src/components/provider-icons/types"

type ProviderSource = "env" | "api" | "config" | "custom"
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]
const POPULAR_PROVIDER_LIMIT = 24

const providerRank = (id: string) => {
  const rank = popularProviders.indexOf(id)
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

const Section: Component<{ title: string; children: JSX.Element; action?: JSX.Element }> = (props) => (
  <section class="space-y-4 sm:space-y-5">
    <div class="flex min-h-9 flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold leading-7 text-foreground sm:text-[21px]">{props.title}</h2>
      {props.action}
    </div>
    {props.children}
  </section>
)

const providerName = (item: { id: string; name: string }) => (item.id === "xai" ? "xAI (Grok)" : item.name)

const hasProviderIcon = (id: string) =>
  id === "antigravity" || id === "shob" || id === "openclaude" || iconNames.includes(id as (typeof iconNames)[number])

const initials = (value: string) => {
  const parts = value.split(/[^a-z0-9]+/i).filter(Boolean)
  const text = parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join("") : (parts[0] ?? value).slice(0, 2)
  return text.toUpperCase()
}

const ReadyPill: Component<{ label: string }> = (props) => (
  <span class="mt-1 inline-flex h-5 items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 text-[12px] font-semibold leading-none text-emerald-400">
    <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
    {props.label}
  </span>
)

const ProviderMark: Component<{ id: string; label: string }> = (props) => (
  <Show
    when={hasProviderIcon(props.id)}
    fallback={
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted text-[11px] font-semibold text-foreground">
        {initials(props.label)}
      </span>
    }
  >
    <ProviderIcon id={props.id} class="size-8 shrink-0" />
  </Show>
)

const ConnectedRow: Component<{
  item: ProviderItem
  connectedLabel: string
  canEdit: boolean
  onEdit: () => void
  editLabel: string
  canDisconnect: boolean
  onDisconnect: () => void
  disconnectHint: string
  disconnectLabel: string
}> = (props) => (
  <div class="group grid min-h-[72px] min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border border-border/70 bg-card/60 px-3.5 py-3 text-left shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_5%,transparent)] transition-colors hover:border-border hover:bg-accent/55 sm:px-4">
    <ProviderMark id={props.item.id} label={providerName(props.item)} />
    <span class="min-w-0">
      <span class="block whitespace-normal break-words text-[16px] font-semibold leading-5 text-foreground">{providerName(props.item)}</span>
      <ReadyPill label={props.connectedLabel} />
    </span>
    <Show
      when={props.canEdit || props.canDisconnect}
      fallback={<span class="max-w-[150px] justify-self-end text-right text-[12px] font-medium leading-4 text-muted-foreground">{props.disconnectHint}</span>}
    >
      <span class="flex justify-self-end gap-1.5">
        <Show when={props.canEdit}>
          <Button
            size="small"
            variant="ghost"
            icon="edit"
            aria-label={props.editLabel}
            title={props.editLabel}
            class="size-8 rounded-lg border border-border/70 bg-background/45 p-0 text-foreground hover:bg-muted"
            onClick={props.onEdit}
          />
        </Show>
        <Show when={props.canDisconnect}>
          <Button
            size="small"
            variant="ghost"
            class="rounded-lg border border-border/70 bg-background/45 px-3 text-foreground hover:bg-muted"
            onClick={props.onDisconnect}
          >
            {props.disconnectLabel}
          </Button>
        </Show>
      </span>
    </Show>
  </div>
)

const PopularRow: Component<{
  item: { id: string; name: string }
  showRecommended?: boolean
  onConnect: () => void
  connectLabel: string
  recommendedLabel: string
}> = (props) => (
  <div class="group grid min-h-[64px] min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border border-border/70 bg-card/60 px-3.5 py-3 text-left shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_5%,transparent)] transition-colors hover:border-border hover:bg-accent/55 sm:px-4">
    <ProviderMark id={props.item.id} label={providerName(props.item)} />
    <span class="min-w-0">
      <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span class="whitespace-normal break-words text-[16px] font-semibold leading-5 text-foreground">{providerName(props.item)}</span>
        <Show when={props.showRecommended}>
          <span class="inline-flex shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
            {props.recommendedLabel}
          </span>
        </Show>
      </span>
    </span>
    <Button
      size="small"
      variant="secondary"
      icon="plus-small"
      aria-label={props.connectLabel}
      title={props.connectLabel}
      class="size-8 justify-self-end rounded-lg border border-border/70 bg-background/45 p-0 text-foreground hover:bg-muted"
      onClick={props.onConnect}
    />
  </div>
)

const SimpleTopActionCard: Component<{
  iconId: string
  title: string
  tag: string
  onConnect: () => void
  connectLabel: string
}> = (props) => (
  <div class="group grid min-h-[64px] min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border border-border/70 bg-card/60 px-3.5 py-3 text-left shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_5%,transparent)] transition-colors hover:border-border hover:bg-accent/55 sm:px-4">
    <ProviderMark id={props.iconId} label={props.title} />
    <span class="min-w-0">
      <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span class="whitespace-normal break-words text-[16px] font-semibold leading-5 text-foreground">{props.title}</span>
        <span class="inline-flex shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
          {props.tag}
        </span>
      </span>
    </span>
    <Button
      size="small"
      variant="secondary"
      icon="plus-small"
      aria-label={props.connectLabel}
      title={props.connectLabel}
      class="size-8 justify-self-end rounded-lg border border-border/70 bg-background/45 p-0 text-foreground hover:bg-muted"
      onClick={props.onConnect}
    />
  </div>
)

export const SettingsProviders: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const providers = useProviders()

  const connected = createMemo(() =>
    providers
      .connected()
      .filter((p) => p.id !== "opencode" || Object.values(p.models).find((m) => m.cost?.input)),
  )

  const popular = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    const items = providers
      .all()
      .filter((p) => !connectedIDs.has(p.id))
      .slice()
    items.sort((a, b) => {
      const rank = providerRank(a.id) - providerRank(b.id)
      if (rank !== 0) return rank
      return providerName(a).localeCompare(providerName(b))
    })
    return items.slice(0, POPULAR_PROVIDER_LIMIT)
  })

  const source = (item: ProviderItem): ProviderSource | undefined => {
    if (!("source" in item)) return
    const value = item.source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  const canDisconnect = (item: ProviderItem) => source(item) !== "env"

  const isConfigCustom = (providerID: string) => {
    const provider = globalSync.data.config.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible" && provider.npm !== "@ai-sdk/anthropic") return false
    if (!provider.models || Object.keys(provider.models).length === 0) return false
    return true
  }

  const disableProvider = async (providerID: string, name: string) => {
    const before = globalSync.data.config.disabled_providers ?? []
    const next = before.includes(providerID) ? before : [...before, providerID]
    globalSync.set("config", "disabled_providers", next)

    await globalSync
      .updateConfig({ disabled_providers: next })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        globalSync.set("config", "disabled_providers", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const disconnect = async (providerID: string, name: string) => {
    if (isConfigCustom(providerID)) {
      await globalSDK.client.auth.remove({ providerID }).catch(() => undefined)
      await disableProvider(providerID, name)
      return
    }
    await globalSDK.client.auth
      .remove({ providerID })
      .then(async () => {
        await globalSDK.client.global.dispose()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  return (
    <div class="min-h-full bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div class="w-full space-y-8">
        <Section title={language.t("settings.providers.section.connected")}>
          <Show
            when={connected().length > 0}
            fallback={
              <div class="rounded-xl border border-border/70 bg-card/60 px-4 py-5 text-center text-[14px] text-muted-foreground">
                {language.t("settings.providers.connected.empty")}
              </div>
            }
          >
            <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <For each={connected()}>
                {(item) => (
                  <ConnectedRow
                    item={item}
                    connectedLabel="Connected"
                    canEdit={source(item) === "api"}
                    onEdit={() => dialog.show(() => <DialogConnectProvider provider={item.id} />)}
                    editLabel={`${language.t("common.edit")} ${providerName(item)}`}
                    canDisconnect={canDisconnect(item)}
                    onDisconnect={() => void disconnect(item.id, item.name)}
                    disconnectHint={language.t("settings.providers.connected.environmentDescription")}
                    disconnectLabel={language.t("common.disconnect")}
                  />
                )}
              </For>
            </div>
          </Show>
        </Section>

        <Section title={language.t("settings.providers.section.popular")}>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3.5">
            <div data-component="shob-compatible-section">
              <SimpleTopActionCard
                iconId="shob"
                title={SHOB_OPENAI_COMPATIBLE_PRESET.name}
                tag={language.t("dialog.provider.tag.recommended")}
                connectLabel={language.t("common.connect")}
                onConnect={() =>
                  dialog.show(() => (
                    <DialogOpenAICompatible
                      defaults={SHOB_OPENAI_COMPATIBLE_PRESET}
                      iconID="shob"
                      apiKeyOnly
                    />
                  ))
                }
              />
            </div>

            <For each={popular()}>
              {(item) => (
                <PopularRow
                  item={item}
                  showRecommended={providerRank(item.id) < 3}
                  onConnect={() => dialog.show(() => <DialogConnectProvider provider={item.id} />)}
                  connectLabel={language.t("common.connect")}
                  recommendedLabel={language.t("dialog.provider.tag.recommended")}
                />
              )}
            </For>

            <div data-component="openai-compatible-section">
              <SimpleTopActionCard
                iconId="openai"
                title={language.t("provider.openaiCompatible.title")}
                tag={language.t("settings.providers.tag.custom")}
                connectLabel={language.t("common.connect")}
                onConnect={() => dialog.show(() => <DialogOpenAICompatible />)}
              />
            </div>

            <div data-component="anthropic-compatible-section">
              <SimpleTopActionCard
                iconId="anthropic"
                title={CUSTOM_ANTHROPIC_COMPATIBLE_PRESET.name}
                tag={language.t("settings.providers.tag.custom")}
                connectLabel={language.t("common.connect")}
                onConnect={() =>
                  dialog.show(() => (
                    <DialogOpenAICompatible
                      defaults={CUSTOM_ANTHROPIC_COMPATIBLE_PRESET}
                      iconID="anthropic"
                      compatible="anthropic"
                    />
                  ))
                }
              />
            </div>

            <div data-component="custom-provider-section">
              <SimpleTopActionCard
                iconId="synthetic"
                title={language.t("provider.custom.title")}
                tag={language.t("settings.providers.tag.custom")}
                connectLabel={language.t("common.connect")}
                onConnect={() => dialog.show(() => <DialogCustomProvider back="close" />)}
              />
            </div>
          </div>

          <div class="flex justify-center pt-1">
            <Button
              variant="ghost"
              class="rounded-lg border border-border/70 bg-card/45 px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => dialog.show(() => <DialogSelectProvider />)}
            >
              All providers
            </Button>
          </div>
        </Section>
      </div>
    </div>
  )
}
