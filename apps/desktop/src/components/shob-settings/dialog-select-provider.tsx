import { Component, Show } from "solid-js"
import { useDialog } from "@shob-ai/ui/context/dialog"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { Dialog } from "@shob-ai/ui/dialog"
import { List } from "@shob-ai/ui/list"
import { Tag } from "@shob-ai/ui/tag"
import { ProviderIcon } from "@shob-ai/ui/provider-icon"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { useLanguage } from "@/context/language"
import { DialogCustomProvider } from "./dialog-custom-provider"
import {
  CUSTOM_ANTHROPIC_COMPATIBLE_PRESET,
  DialogOpenAICompatible,
  OPENCLAUDE_OPENAI_COMPATIBLE_PRESET,
  SHOB_OPENAI_COMPATIBLE_PRESET,
} from "./dialog-openai-compatible"

const CUSTOM_ID = "_custom"
const SHOB_ID = "_shob"
const OPENCLAUDE_ID = "_openclaude"
const ANTHROPIC_COMPATIBLE_ID = "_anthropic_compatible"

export const DialogSelectProvider: Component = () => {
  const dialog = useDialog()
  const providers = useProviders()
  const language = useLanguage()

  const popularGroup = () => language.t("dialog.provider.group.popular")
  const otherGroup = () => language.t("dialog.provider.group.other")
  const customLabel = () => language.t("settings.providers.tag.custom")
  const note = (id: string) => {
    if (id === "anthropic") return language.t("dialog.provider.anthropic.note")
    if (id === "openai") return language.t("dialog.provider.openai.note")
    if (id === "xai") return language.t("dialog.provider.xai.note")
    if (id === "antigravity") return language.t("dialog.provider.google.note")
    if (id.startsWith("github-copilot")) return language.t("dialog.provider.copilot.note")
    if (id === "opencode-go") return language.t("dialog.provider.opencodeGo.tagline")
    if (id === OPENCLAUDE_ID) return "OpenAI-compatible gateway"
    if (id === ANTHROPIC_COMPATIBLE_ID) return "Custom Anthropic Messages API endpoint"
  }

  return (
    <Dialog title={language.t("command.provider.connect")} transition>
      <List
        search={{ placeholder: language.t("dialog.provider.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.provider.empty")}
        activeIcon="plus-small"
        key={(x) => x?.id}
        items={() => {
          language.locale()
          return [
            { id: SHOB_ID, name: SHOB_OPENAI_COMPATIBLE_PRESET.name },
            { id: CUSTOM_ID, name: customLabel() },
            { id: ANTHROPIC_COMPATIBLE_ID, name: CUSTOM_ANTHROPIC_COMPATIBLE_PRESET.name },
            { id: OPENCLAUDE_ID, name: OPENCLAUDE_OPENAI_COMPATIBLE_PRESET.name },
            ...providers.all().filter((x) => x.id !== SHOB_OPENAI_COMPATIBLE_PRESET.providerID),
          ]
        }}
        filterKeys={["id", "name"]}
        groupBy={(x) =>
          x.id === SHOB_ID ||
          x.id === OPENCLAUDE_ID ||
          x.id === ANTHROPIC_COMPATIBLE_ID ||
          popularProviders.includes(x.id)
            ? popularGroup()
            : otherGroup()
        }
        sortBy={(a, b) => {
          if (a.id === SHOB_ID) return -1
          if (b.id === SHOB_ID) return 1
          if (a.id === CUSTOM_ID) return -1
          if (b.id === CUSTOM_ID) return 1
          if (a.id === ANTHROPIC_COMPATIBLE_ID) return -1
          if (b.id === ANTHROPIC_COMPATIBLE_ID) return 1
          if (a.id === OPENCLAUDE_ID) return -1
          if (b.id === OPENCLAUDE_ID) return 1
          if (popularProviders.includes(a.id) && popularProviders.includes(b.id))
            return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id)
          return a.name.localeCompare(b.name)
        }}
        sortGroupsBy={(a, b) => {
          const popular = popularGroup()
          if (a.category === popular && b.category !== popular) return -1
          if (b.category === popular && a.category !== popular) return 1
          return 0
        }}
        onSelect={(x) => {
          if (!x) return
          if (x.id === SHOB_ID) {
            dialog.show(() => (
              <DialogOpenAICompatible defaults={SHOB_OPENAI_COMPATIBLE_PRESET} iconID="shob" apiKeyOnly />
            ))
            return
          }
          if (x.id === CUSTOM_ID) {
            dialog.show(() => <DialogCustomProvider back="providers" />)
            return
          }
          if (x.id === OPENCLAUDE_ID) {
            dialog.show(() => (
              <DialogOpenAICompatible defaults={OPENCLAUDE_OPENAI_COMPATIBLE_PRESET} iconID="openclaude" apiKeyOnly />
            ))
            return
          }
          if (x.id === ANTHROPIC_COMPATIBLE_ID) {
            dialog.show(() => (
              <DialogOpenAICompatible
                defaults={CUSTOM_ANTHROPIC_COMPATIBLE_PRESET}
                iconID="anthropic"
                compatible="anthropic"
              />
            ))
            return
          }
          dialog.show(() => <DialogConnectProvider provider={x.id} />)
        }}
      >
        {(i) => (
          <div class="px-1.25 w-full flex items-center gap-x-3">
            <ProviderIcon
              data-slot="list-item-extra-icon"
              id={
                i.id === SHOB_ID
                  ? "shob"
                  : i.id === OPENCLAUDE_ID
                    ? "openclaude"
                    : i.id === ANTHROPIC_COMPATIBLE_ID
                      ? "anthropic"
                      : i.id
              }
            />
            <span>{i.name}</span>
            <Show when={i.id === "opencode"}>
              <div class="text-14-regular text-text-weak">{language.t("dialog.provider.shob.tagline")}</div>
            </Show>
            <Show when={i.id === CUSTOM_ID}>
              <Tag>{language.t("settings.providers.tag.custom")}</Tag>
            </Show>
            <Show when={i.id === OPENCLAUDE_ID}>
              <Tag>{language.t("settings.providers.tag.custom")}</Tag>
            </Show>
            <Show when={i.id === ANTHROPIC_COMPATIBLE_ID}>
              <Tag>{language.t("settings.providers.tag.custom")}</Tag>
            </Show>
            <Show when={note(i.id)}>{(value) => <div class="text-14-regular text-text-weak">{value()}</div>}</Show>
          </div>
        )}
      </List>
    </Dialog>
  )
}
