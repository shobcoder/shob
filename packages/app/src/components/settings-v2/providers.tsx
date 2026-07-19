import { ButtonV2 } from "@shob/ui/v2/button-v2"
import { useDialog } from "@shob/ui/context/dialog"
import { ProviderIcon } from "@shob/ui/provider-icon"
import { showToast } from "@/utils/toast"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { createMemo, createSignal, type Component, For, Show, type JSX } from "solid-js"
import { Icon as IconV2 } from "@shob/ui/v2/icon"
import { IconButtonV2 } from "@shob/ui/v2/icon-button-v2"
import { TextInputV2 } from "@shob/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { DialogConnectProvider } from "../dialog-connect-provider"
import { DialogSelectProvider } from "../dialog-select-provider"
import { DialogCustomProvider } from "../dialog-custom-provider"
import "./settings-v2.css"

const matches = (query: string, values: Array<string | undefined>) => {
  if (!query) return true
  return values.some((value) => value?.toLowerCase().includes(query.toLowerCase().trim()))
}

const EmptyState: Component<{ message: string; filter?: string }> = (props) => (
  <div class="settings-v2-models-status">
    <span>{props.message}</span>
    <Show when={props.filter}>
      <span class="settings-v2-models-status-filter">&quot;{props.filter}&quot;</span>
    </Show>
  </div>
)

type ProviderSource = "env" | "api" | "config" | "custom"
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

const providerRank = (id: string) => {
  const rank = popularProviders.indexOf(id)
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank
}

const providerName = (item: { id: string; name: string }) => {
  if (item.id === "xai") return "xAI (Grok)"
  return item.name
}

const Section: Component<{ title: string; children: JSX.Element; action?: JSX.Element }> = (props) => (
  <section class="settings-v2-provider-section">
    <div class="settings-v2-provider-section-header">
      <h2>{props.title}</h2>
      {props.action}
    </div>
    {props.children}
  </section>
)

const ReadyPill: Component<{ label: string }> = (props) => (
  <span class="settings-v2-provider-ready">
    <span />
    {props.label}
  </span>
)

const ProviderMark: Component<{ id: string; label: string }> = (props) => (
  <span class="settings-v2-provider-mark">
    <ProviderIcon id={props.id} class="settings-v2-provider-mark-icon" />
  </span>
)

const ConnectedCard: Component<{
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
  <div class="settings-v2-provider-card">
    <ProviderMark id={props.item.id} label={providerName(props.item)} />
    <span class="settings-v2-provider-card-copy">
      <span class="settings-v2-provider-card-name">{providerName(props.item)}</span>
      <ReadyPill label={props.connectedLabel} />
    </span>
    <Show
      when={props.canEdit || props.canDisconnect}
      fallback={<span class="settings-v2-provider-card-hint">{props.disconnectHint}</span>}
    >
      <span class="settings-v2-provider-card-actions">
        <Show when={props.canEdit}>
          <ButtonV2
            size="normal"
            variant="ghost-muted"
            icon="edit"
            aria-label={props.editLabel}
            title={props.editLabel}
            class="settings-v2-provider-icon-button"
            onClick={props.onEdit}
          />
        </Show>
        <Show when={props.canDisconnect}>
          <ButtonV2 size="normal" variant="ghost-muted" class="settings-v2-provider-action" onClick={props.onDisconnect}>
            {props.disconnectLabel}
          </ButtonV2>
        </Show>
      </span>
    </Show>
  </div>
)

const ProviderCard: Component<{
  item: { id: string; name: string }
  description?: string
  showRecommended?: boolean
  onConnect: () => void
  connectLabel: string
  recommendedLabel: string
}> = (props) => (
  <div class="settings-v2-provider-card">
    <ProviderMark id={props.item.id} label={providerName(props.item)} />
    <span class="settings-v2-provider-card-copy">
      <span class="settings-v2-provider-card-title-row">
        <span class="settings-v2-provider-card-name">{providerName(props.item)}</span>
        <Show when={props.showRecommended}>
          <span class="settings-v2-provider-tag">{props.recommendedLabel}</span>
        </Show>
      </span>
      <Show when={props.description}>
        <span class="settings-v2-provider-card-description">{props.description}</span>
      </Show>
    </span>
    <ButtonV2
      size="normal"
      variant="neutral"
      icon="plus"
      aria-label={props.connectLabel}
      title={props.connectLabel}
      class="settings-v2-provider-icon-button"
      onClick={props.onConnect}
    />
  </div>
)

const CustomProviderCard: Component<{
  title: string
  tag: string
  description?: string
  connectLabel: string
  onConnect: () => void
}> = (props) => (
  <div class="settings-v2-provider-card">
    <ProviderMark id="synthetic" label={props.title} />
    <span class="settings-v2-provider-card-copy">
      <span class="settings-v2-provider-card-title-row">
        <span class="settings-v2-provider-card-name">{props.title}</span>
        <span class="settings-v2-provider-tag">{props.tag}</span>
      </span>
      <Show when={props.description}>
        <span class="settings-v2-provider-card-description">{props.description}</span>
      </Show>
    </span>
    <ButtonV2
      size="normal"
      variant="neutral"
      icon="plus"
      aria-label={props.connectLabel}
      title={props.connectLabel}
      class="settings-v2-provider-icon-button"
      onClick={props.onConnect}
    />
  </div>
)

export const SettingsProvidersV2: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const serverSync = useServerSync()
  const providers = useProviders()

  const [filter, setFilter] = createSignal("")

  const connected = createMemo(() =>
    providers
      .connected()
      .filter((p) => p.id !== "opencode" || Object.values(p.models).find((m) => m.cost?.input)),
  )

  const popular = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    return Array.from(providers.all().values())
      .filter((p) => !connectedIDs.has(p.id) && popularProviders.includes(p.id) && matches(filter(), [p.name, p.id]))
      .sort((a, b) => providerRank(a.id) - providerRank(b.id))
  })

  const others = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    return Array.from(providers.all().values())
      .filter((p) => !connectedIDs.has(p.id) && !popularProviders.includes(p.id) && matches(filter(), [p.name, p.id]))
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  const providerNote = (id: string, name: string, modelsList: ProviderItem["models"]) => {
    if (id === "anthropic") return language.t("dialog.provider.anthropic.note")
    if (id === "openai") return language.t("dialog.provider.openai.note")
    if (id === "openrouter") return language.t("dialog.provider.openrouter.note")
    if (id === "google") return language.t("dialog.provider.google.note")
    if (id === "vercel") return language.t("dialog.provider.vercel.note")
    if (id === "azure") return language.t("dialog.provider.azure.note")
    if (id === "alibaba") return language.t("dialog.provider.alibaba.note")
    if (id.startsWith("github-copilot")) return language.t("dialog.provider.copilot.note")

    const nid = id.toLowerCase()
    const nname = name.toLowerCase()

    if (nid.includes("302")) return "A shared API gateway offering a broad catalog of third-party models"
    if (nid.includes("abacus") || nname.includes("abacus")) return "Enterprise LLMs and purpose-built agents, hosted by Abacus.AI"
    if (nid.includes("abliteration") || nname.includes("abliteration")) return "Fine-tuned, restriction-free builds of open-source models"
    if (nid.includes("aihubmix") || nname.includes("aihubmix")) return "Routes requests across a mix of open- and closed-source model APIs"
    if (nid.includes("alibaba") || nname.includes("alibaba") || nid.includes("qwen") || nname.includes("qwen")) {
      return "Alibaba Cloud's Qwen model family, including its coding assistants"
    }
    if (nid.includes("ambient") || nname.includes("ambient")) return "Voice- and context-aware models built for ambient computing"
    if (nid.includes("anyapi") || nname.includes("anyapi")) return "One wrapper, many backends — a unified layer over multiple model endpoints"
    if (nid.includes("atomic") || nname.includes("atomic")) return "Conversation-tuned models built for chat agents"
    if (nid.includes("auriko") || nname.includes("auriko")) return "Small, fast models tuned for narrow, specific tasks"
    if (nid.includes("azure") || nname.includes("azure")) return "Microsoft-hosted GPT and model deployments for enterprise use"
    if (nid.includes("bailing") || nname.includes("bailing")) return "Reasoning-focused Chinese LLMs from Bailing"
    if (nid.includes("baseten") || nname.includes("baseten")) return "Serverless GPU hosting for deploying open-source models"
    if (nid.includes("berget") || nname.includes("berget")) return "Models purpose-built for document search and data extraction"
    if (nid.includes("cerebras") || nname.includes("cerebras")) return "Ultra-fast inference on Cerebras's wafer-scale chips"
    if (nid.includes("chutes") || nname.includes("chutes")) return "Open-source models served over a decentralized GPU network"
    if (nid.includes("clarifai") || nname.includes("clarifai")) return "Clarifai's combined LLM and computer-vision model platform"
    if (nid.includes("claudinio") || nname.includes("claudinio")) return "Open-source models fine-tuned specifically for code generation"
    if (nid.includes("cloudferro") || nname.includes("cloudferro") || nid.includes("sherlock") || nname.includes("sherlock")) {
      return "Earth-observation and geospatial analysis models via CloudFerro"
    }
    if (nid.includes("cloudflare") || nname.includes("cloudflare")) return "Edge-hosted, serverless models running close to your users"
    if (nid.includes("groq") || nname.includes("groq")) return "Groq's LPU chips deliver near-instant inference"
    if (nid.includes("deepinfra") || nname.includes("deepinfra")) return "Cheap, high-throughput serverless endpoints for open-source models"
    if (nid.includes("together") || nname.includes("together")) return "Fine-tune and run open-source models on Together's GPU cloud"
    if (nid.includes("deepseek") || nname.includes("deepseek")) return "DeepSeek's own reasoning and coding models, direct from the source"
    if (nid.includes("lepton") || nname.includes("lepton")) return "A developer-first serverless platform for LLMs and AI apps"
    if (nid.includes("novita") || nname.includes("novita")) return "Serverless image generation plus open LLM access"
    if (nid.includes("octoai") || nname.includes("octoai")) return "Tuned open-source LLMs and Stable Diffusion, served by OctoAI"
    if (nid.includes("perplexity") || nname.includes("perplexity")) return "Perplexity's search-grounded, real-time-aware model endpoints"
    if (nid.includes("replicate") || nname.includes("replicate")) return "A simple API for running and deploying open-source models in the cloud"
    if (nid.includes("fireworks") || nname.includes("fireworks")) return "Fast open-source LLM inference on Fireworks' dev cloud"
    if (nid.includes("mistral") || nname.includes("mistral")) return "Europe's flagship open models: Mistral, Mixtral, and more"
    if (nid.includes("xai") || nname.includes("xai") || nid.includes("grok") || nname.includes("grok")) {
      return "xAI's real-time Grok model family"
    }
    if (nid.includes("bedrock") || nname.includes("bedrock")) return "Claude, Llama, and Mistral, all through AWS Bedrock"
    if (nid.includes("kilo") || nname.includes("kilo")) return "Low-latency, enterprise-grade model hosting"
    if (nid.includes("cline") || nname.includes("cline")) return "Model access powered by the Cline provider"
    if (nid.includes("commandcode") || nname.includes("commandcode")) return "Models tuned specifically for code completion"
    if (nid.includes("antigravity") || nname.includes("antigravity")) return "The Antigravity team's curated set of advanced coding models"

    const modelsArr = Object.values(modelsList || {})
    if (modelsArr.length > 0) {
      const sampleNames = modelsArr.slice(0, 2).map((m) => m.name).join(", ")
      if (modelsArr.length > 2) {
        return `Connect to access models like ${sampleNames}, and more`
      }
      return `Connect to access ${sampleNames}`
    }
    return `Connect your ${providerName({ id, name })} account to use its models`
  }

  const source = (item: ProviderItem): ProviderSource | undefined => {
    if (!("source" in item)) return
    const value = item.source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  const canDisconnect = (item: ProviderItem) => source(item) !== "env"

  const isConfigCustom = (providerID: string) => {
    const provider = serverSync().data.config.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible") return false
    if (!provider.models || Object.keys(provider.models).length === 0) return false
    return true
  }

  const disableProvider = async (providerID: string, name: string) => {
    const before = serverSync().data.config.disabled_providers ?? []
    const next = before.includes(providerID) ? before : [...before, providerID]
    serverSync().set("config", "disabled_providers", next)

    await serverSync()
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
        serverSync().set("config", "disabled_providers", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const disconnect = async (providerID: string, name: string) => {
    if (isConfigCustom(providerID)) {
      await serverSdk()
        .client.auth.remove({ providerID })
        .catch(() => undefined)
      await disableProvider(providerID, name)
      return
    }
    await serverSdk()
      .client.auth.remove({ providerID })
      .then(async () => {
        await serverSdk().client.global.dispose()
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
    <div class="settings-v2-providers-page">
      <div class="settings-v2-page-heading">
        <h2>{language.t("settings.providers.title")}</h2>
      </div>

      <Section title={language.t("settings.providers.section.connected")}>
        <Show
          when={connected().length > 0}
          fallback={<div class="settings-v2-provider-empty">{language.t("settings.providers.connected.empty")}</div>}
        >
          <div class="settings-v2-provider-grid settings-v2-provider-grid-connected">
            <For each={connected()}>
              {(item) => (
                <ConnectedCard
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

      <div class="settings-v2-models-search">
        <TextInputV2
          type="search"
          appearance="base"
          leadingIcon={<IconV2 name="magnifying-glass" size="large" class="text-v2-icon-icon-muted" />}
          value={filter()}
          onInput={(event) => setFilter(event.currentTarget.value)}
          placeholder={language.t("dialog.provider.search.placeholder")}
          spellcheck={false}
          autocorrect="off"
          autocomplete="off"
          autocapitalize="off"
          aria-label={language.t("dialog.provider.search.placeholder")}
        />
        <Show when={filter()}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="small"
            class="settings-v2-tab-search-clear"
            icon={<IconV2 name="close" size="large" class="text-v2-icon-icon-muted" />}
            onClick={() => setFilter("")}
          />
        </Show>
      </div>

      <Show
        when={popular().length > 0 || others().length > 0}
        fallback={
          <Show when={filter()}>
            <EmptyState message={language.t("dialog.provider.empty")} filter={filter()} />
          </Show>
        }
      >
        <Show when={popular().length > 0 || !filter()}>
          <Section title={language.t("settings.providers.section.popular")}>
            <div class="settings-v2-provider-grid">
              <For each={popular()}>
                {(item) => (
                  <ProviderCard
                    item={item}
                    description={providerNote(item.id, item.name, item.models)}
                    showRecommended={providerRank(item.id) < 3}
                    onConnect={() => dialog.show(() => <DialogConnectProvider provider={item.id} />)}
                    connectLabel={language.t("common.connect")}
                    recommendedLabel={language.t("dialog.provider.tag.recommended")}
                  />
                )}
              </For>

              <Show when={!filter()}>
                <div data-component="custom-provider-section">
                  <CustomProviderCard
                    title={language.t("provider.custom.title")}
                    tag={language.t("settings.providers.tag.custom")}
                    description={language.t("settings.providers.custom.description")}
                    connectLabel={language.t("common.connect")}
                    onConnect={() => dialog.show(() => <DialogCustomProvider back="close" />)}
                  />
                </div>
              </Show>
            </div>
          </Section>
        </Show>

        <Show when={others().length > 0}>
          <Section title="Other Providers">
            <div class="settings-v2-provider-grid">
              <For each={others()}>
                {(item) => (
                  <ProviderCard
                    item={item}
                    description={providerNote(item.id, item.name, item.models)}
                    showRecommended={false}
                    onConnect={() => dialog.show(() => <DialogConnectProvider provider={item.id} />)}
                    connectLabel={language.t("common.connect")}
                    recommendedLabel={language.t("dialog.provider.tag.recommended")}
                  />
                )}
              </For>
            </div>
          </Section>
        </Show>
      </Show>
    </div>
  )
}
