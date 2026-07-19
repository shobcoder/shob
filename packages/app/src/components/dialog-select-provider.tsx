import { type Accessor, Component, Show } from "solid-js"
import { useDialog } from "@shob/ui/context/dialog"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@shob/ui/v2/dialog-v2"
import { List } from "@shob/ui/list"
import { Tag } from "@shob/ui/tag"
import { ProviderIcon } from "@shob/ui/provider-icon"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { useLanguage } from "@/context/language"
import { DialogCustomProvider } from "./dialog-custom-provider"

const CUSTOM_ID = "_custom"

export const DialogSelectProvider: Component<{ directory?: Accessor<string | undefined> }> = (props) => {
  const dialog = useDialog()
  const providers = useProviders(props.directory)
  const language = useLanguage()

  const popularGroup = () => language.t("dialog.provider.group.popular")
  const otherGroup = () => language.t("dialog.provider.group.other")
  const customLabel = () => language.t("settings.providers.tag.custom")
  const note = (id: string) => {
    if (id === "anthropic") return language.t("dialog.provider.anthropic.note")
    if (id === "openai") return language.t("dialog.provider.openai.note")
    if (id.startsWith("github-copilot")) return language.t("dialog.provider.copilot.note")
    if (id === "shob-go") return language.t("dialog.provider.shobGo.tagline")
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitle>{language.t("command.provider.connect")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <List
          class="px-3 py-2"
          search={{ placeholder: language.t("dialog.provider.search.placeholder"), autofocus: true }}
          emptyMessage={language.t("dialog.provider.empty")}
          activeIcon="plus-small"
          key={(x) => x?.id}
          items={() => {
            language.locale()
            return [{ id: CUSTOM_ID, name: customLabel() }, ...providers.all().values()]
          }}
          filterKeys={["id", "name"]}
          groupBy={(x) => (popularProviders.includes(x.id) ? popularGroup() : otherGroup())}
          sortBy={(a, b) => {
            if (a.id === CUSTOM_ID) return -1
            if (b.id === CUSTOM_ID) return 1
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
            if (x.id === CUSTOM_ID) {
              dialog.show(() => <DialogCustomProvider back="providers" directory={props.directory} />)
              return
            }
            dialog.show(() => <DialogConnectProvider provider={x.id} directory={props.directory} />)
          }}
        >
          {(i) => (
            <div class="px-1.25 py-1 w-full flex items-center gap-x-3">
              <ProviderIcon data-slot="list-item-extra-icon" id={i.id} />
              <div class="flex flex-col items-start flex-1 min-w-0">
                <div class="flex items-center gap-x-2 w-full">
                  <span class="truncate">{i.name}</span>
                  <Show when={i.id === CUSTOM_ID}>
                    <Tag>{language.t("settings.providers.tag.custom")}</Tag>
                  </Show>
                  <Show when={i.id === "opencode" || i.id === "shob-go"}>
                    <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                  </Show>
                </div>
                <Show when={note(i.id)}>
                  {(value) => <div class="text-13-regular text-text-weak truncate w-full text-left">{value()}</div>}
                </Show>
                <Show when={i.id === "opencode"}>
                  <div class="text-13-regular text-text-weak truncate w-full text-left">{language.t("dialog.provider.shob.tagline")}</div>
                </Show>
              </div>
            </div>
          )}
        </List>
      </DialogBody>
    </Dialog>
  )
}
