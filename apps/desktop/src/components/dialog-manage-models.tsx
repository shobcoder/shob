import { Dialog } from "@shob-ai/ui/dialog"
import { List } from "@shob-ai/ui/list"
import { Switch } from "@shob-ai/ui/switch"
import { Tooltip } from "@shob-ai/ui/tooltip"
import { Button } from "@shob-ai/ui/button"
import type { Component } from "solid-js"
import { useLocal } from "@/context/local"
import { popularProviders } from "@/hooks/use-providers"
import { useLanguage } from "@/context/language"
import { useDialog } from "@shob-ai/ui/context/dialog"
import { DialogSelectProvider } from "./dialog-select-provider"
import { IconButton } from "@shob-ai/ui/icon-button"

export const DialogManageModels: Component = () => {
  const local = useLocal()
  const language = useLanguage()
  const dialog = useDialog()

  const handleConnectProvider = () => {
    dialog.show(() => <DialogSelectProvider />)
  }
  const providerRank = (id: string) => popularProviders.indexOf(id)
  const providerList = (providerID: string) => local.model.list().filter((x) => x.provider.id === providerID)
  const providerVisible = (providerID: string) =>
    providerList(providerID).every((x) => local.model.visible({ modelID: x.id, providerID: x.provider.id }))
  const setProviderVisibility = (providerID: string, checked: boolean) => {
    providerList(providerID).forEach((x) => {
      local.model.setVisibility({ modelID: x.id, providerID: x.provider.id }, checked)
    })
  }

  return (
    <Dialog
      title={
        <div class="flex items-center gap-1.5">
          <IconButton
            icon="arrow-left"
            variant="ghost"
            class="-ml-2 h-7 w-7"
            onClick={() => {
              void import("./dialog-select-model").then((x) => {
                dialog.show(() => <x.DialogSelectModel />)
              })
            }}
            aria-label="Back"
          />
          <span>{language.t("dialog.model.manage")}</span>
        </div>
      }
      description={language.t("dialog.model.manage.description")}
      transition
      action={
        <Button variant="ghost" class="h-8 px-4 text-xs font-medium !rounded-full !bg-[rgba(128,128,128,0.1)] hover:!bg-[rgba(128,128,128,0.2)] !border !border-[rgba(128,128,128,0.2)] backdrop-blur-md shadow-sm transition-all" tabIndex={-1} onClick={handleConnectProvider}>
          Connect
        </Button>
      }
    >
      <List
        class="mt-2 h-[400px] [&_[data-slot=list-search-wrapper]]:border-b [&_[data-slot=list-search-wrapper]]:border-border-base [&_[data-slot=list-search]]:!bg-transparent [&_[data-slot=list-search]]:!rounded-none [&_[data-slot=list-search]]:!p-3 [&_[data-slot=list-scroll]]:p-2 [&_[data-slot=list-group]]:mt-1 [&_[data-slot=list-header]]:!static [&_[data-slot=list-header]]:!bg-transparent [&_[data-slot=list-header]]:!py-1.5 [&_[data-slot=list-header]]:!px-2 [&_[data-slot=list-header]]:!text-xs [&_[data-slot=list-header]]:font-medium [&_[data-slot=list-header]]:text-text-weak [&_[data-slot=list-item]]:rounded-sm [&_[data-slot=list-item][data-active=true]]:!bg-surface-raised [&_[data-slot=list-item][data-active=true]]:text-text-strong"
        search={{ placeholder: language.t("dialog.model.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.model.empty")}
        key={(x) => `${x?.provider?.id}:${x?.id}`}
        items={local.model.list()}
        filterKeys={["provider.name", "name", "id"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        groupBy={(x) => x.provider.id}
        groupHeader={(group) => {
          const provider = group.items[0].provider
          return (
            <>
              <span>{provider.name}</span>
              <Tooltip
                placement="top"
                value={language.t("dialog.model.manage.provider.toggle", { provider: provider.name })}
              >
                <Switch
                  class="-mr-1"
                  checked={providerVisible(provider.id)}
                  onChange={(checked) => setProviderVisibility(provider.id, checked)}
                  hideLabel
                >
                  {provider.name}
                </Switch>
              </Tooltip>
            </>
          )
        }}
        sortGroupsBy={(a, b) => {
          const aRank = providerRank(a.items[0].provider.id)
          const bRank = providerRank(b.items[0].provider.id)
          const aPopular = aRank >= 0
          const bPopular = bRank >= 0
          if (aPopular && !bPopular) return -1
          if (!aPopular && bPopular) return 1
          return aRank - bRank
        }}
        onSelect={(x) => {
          if (!x) return
          const key = { modelID: x.id, providerID: x.provider.id }
          local.model.setVisibility(key, !local.model.visible(key))
        }}
      >
        {(i) => (
          <div class="w-full flex items-center justify-between gap-x-3">
            <span>{i.name}</span>
            <div onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={!!local.model.visible({ modelID: i.id, providerID: i.provider.id })}
                onChange={(checked) => {
                  local.model.setVisibility({ modelID: i.id, providerID: i.provider.id }, checked)
                }}
              />
            </div>
          </div>
        )}
      </List>
    </Dialog>
  )
}
