import { Show, type JSX } from "solid-js"
import { DropdownMenu } from "@shob/ui/dropdown-menu"
import { Icon } from "@shob/ui/icon"
import { IconButton } from "@shob/ui/icon-button"

import { useCommand } from "@/context/command"
import { DESKTOP_MENU, desktopMenuVisible, type DesktopMenuAction, type DesktopMenuEntry } from "@/desktop-menu"
import { usePlatform } from "@/context/platform"

const V2_TITLEBAR_MENU_IDS = new Set(["file", "edit", "view", "help"])

export function WindowsAppMenu(props: {
  command: ReturnType<typeof useCommand>
  platform: ReturnType<typeof usePlatform>
  variant?: "legacy" | "v2"
}) {
  let lastFocused: HTMLElement | undefined

  const rememberFocus = () => {
    const active = document.activeElement
    lastFocused = active instanceof HTMLElement ? active : undefined
  }
  const commandDisabled = (id: string) => {
    const option = props.command.options.find((option) => option.id === id)
    if (!option) return true
    return option.disabled ?? false
  }
  const runCommand = (id: string) => {
    if (commandDisabled(id)) return
    props.command.trigger(id)
  }
  const runAction = (action: DesktopMenuAction) => {
    if (action.startsWith("edit.") && lastFocused?.isConnected) lastFocused.focus({ preventScroll: true })
    void props.platform.runDesktopMenuAction?.(action)
  }
  const runEntry = (entry: DesktopMenuEntry) => {
    if (entry.type === "separator") return
    if (entry.command) {
      runCommand(entry.command)
      return
    }
    if (entry.action) {
      runAction(entry.action)
      return
    }
    if (entry.href) props.platform.openLink(entry.href)
  }

  if (props.variant === "v2") {
    return (
      <div class="flex h-full shrink-0 items-center gap-1">
        {DESKTOP_MENU.filter((menu) => V2_TITLEBAR_MENU_IDS.has(menu.id) && desktopMenuVisible(menu, "windows")).map(
          (menu) => (
            <DropdownMenu gutter={4} modal={false} placement="bottom-start">
              <DropdownMenu.Trigger
                class="flex h-7 shrink-0 items-center rounded-[6px] px-2 text-[13px] text-v2-text-text-subtle outline-none transition-colors hover:bg-v2-surface-surface-hover hover:text-v2-text-text-base data-expanded:bg-v2-surface-surface-active data-expanded:text-v2-text-text-base"
                aria-label={`${menu.label} menu`}
                onPointerDown={rememberFocus}
                onKeyDown={rememberFocus}
              >
                {menu.label}
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content class="desktop-app-menu">
                  {menu.items
                    ?.filter((entry) => desktopMenuVisible(entry, "windows"))
                    .map((entry) =>
                      entry.type === "separator" ? (
                        <DropdownMenu.Separator />
                      ) : (
                        <DesktopMenuItem
                          label={entry.label ?? ""}
                          keybind={entry.command ? props.command.keybind(entry.command) : entry.accelerator?.windows}
                          disabled={entry.command ? commandDisabled(entry.command) : false}
                          onSelect={() => runEntry(entry)}
                        />
                      ),
                    )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          ),
        )}
      </div>
    )
  }

  return (
    <DropdownMenu gutter={4} modal={false} placement="bottom-start">
      <DropdownMenu.Trigger
        as={IconButton}
        icon="menu"
        variant="ghost"
        class="titlebar-icon rounded-md shrink-0"
        aria-label="Shob menu"
        onPointerDown={rememberFocus}
        onKeyDown={rememberFocus}
      />
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="desktop-app-menu">
          <DropdownMenu.Group>
            <DropdownMenu.GroupLabel class="desktop-app-menu-heading">Shob</DropdownMenu.GroupLabel>
            {DESKTOP_MENU.filter((menu) => desktopMenuVisible(menu, "windows")).map((menu) => (
              <DesktopMenuSubmenu label={menu.label}>
                {menu.items
                  ?.filter((entry) => desktopMenuVisible(entry, "windows"))
                  .map((entry) =>
                    entry.type === "separator" ? (
                      <DropdownMenu.Separator />
                    ) : (
                      <DesktopMenuItem
                        label={entry.label ?? ""}
                        keybind={entry.command ? props.command.keybind(entry.command) : entry.accelerator?.windows}
                        disabled={entry.command ? commandDisabled(entry.command) : false}
                        onSelect={() => runEntry(entry)}
                      />
                    ),
                  )}
              </DesktopMenuSubmenu>
            ))}
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}

function DesktopMenuSubmenu(props: { label: string; children: JSX.Element }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger>
        <span data-slot="dropdown-menu-item-label">{props.label}</span>
        <span data-slot="desktop-app-menu-chevron">
          <Icon name="chevron-right" size="small" />
        </span>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent class="desktop-app-menu">{props.children}</DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  )
}

function DesktopMenuItem(props: { label: string; keybind?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <DropdownMenu.Item disabled={props.disabled} onSelect={props.onSelect}>
      <DropdownMenu.ItemLabel>{props.label}</DropdownMenu.ItemLabel>
      <Show when={props.keybind}>
        <span data-slot="desktop-app-menu-keybind">{props.keybind}</span>
      </Show>
    </DropdownMenu.Item>
  )
}
