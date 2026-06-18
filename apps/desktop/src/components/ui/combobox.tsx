import { Combobox as ComboboxPrimitive } from "@kobalte/core/combobox"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon } from "lucide-solid"
import { children, splitProps } from "solid-js"

function Combobox(props: any) {
  return <ComboboxPrimitive {...props} />
}

function ComboboxControl(props: any) {
  const [local, rest] = splitProps(props, ["children", "class"])
  const resolvedChildren = children(() => local.children)

  return (
    <ComboboxPrimitive.Control
      data-slot="combobox-control"
      class={cn(
        "flex h-8 w-full min-w-0 items-center gap-1 rounded-lg border border-transparent bg-muted/70 px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
        local.class
      )}
      {...rest}
    >
      {resolvedChildren()}
      <ComboboxPrimitive.Trigger
        data-slot="combobox-trigger"
        class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-background/50 hover:text-foreground"
        aria-label="Open"
      >
        <ComboboxPrimitive.Icon>
          <ChevronDownIcon class="size-4" />
        </ComboboxPrimitive.Icon>
      </ComboboxPrimitive.Trigger>
    </ComboboxPrimitive.Control>
  )
}

function ComboboxInput(props: any) {
  const [local, rest] = splitProps(props, ["class"])

  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      class={cn(
        "min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground",
        local.class
      )}
      {...rest}
    />
  )
}

function ComboboxContent(props: any) {
  const [local, rest] = splitProps(props, ["children", "class"])
  const resolvedChildren = children(() => local.children)

  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Content
        data-slot="combobox-content"
        class={cn(
          "relative z-50 max-h-[var(--kb-popper-content-available-height)] w-[var(--kb-popper-anchor-width)] min-w-48 origin-[var(--kb-combobox-content-transform-origin)] overflow-hidden rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-2xl duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          local.class
        )}
        {...rest}
      >
        {resolvedChildren()}
      </ComboboxPrimitive.Content>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList(props: any) {
  const [local, rest] = splitProps(props, ["class"])

  return (
    <ComboboxPrimitive.Listbox
      data-slot="combobox-list"
      class={cn("max-h-72 overflow-y-auto outline-none", local.class)}
      {...rest}
    />
  )
}

function ComboboxItem(props: any) {
  const [local, rest] = splitProps(props, ["children", "class", "item"])
  const resolvedChildren = children(() => local.children)

  return (
    <ComboboxPrimitive.Item
      item={local.item}
      data-slot="combobox-item"
      class={cn(
        "relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-[13px] font-medium text-foreground outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:bg-secondary/80 data-selected:text-foreground",
        local.class
      )}
      {...rest}
    >
      <ComboboxPrimitive.ItemLabel>{resolvedChildren()}</ComboboxPrimitive.ItemLabel>
      <span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <ComboboxPrimitive.ItemIndicator>
          <CheckIcon class="size-4" />
        </ComboboxPrimitive.ItemIndicator>
      </span>
    </ComboboxPrimitive.Item>
  )
}

function ComboboxEmpty(props: any) {
  const [local, rest] = splitProps(props, ["class"])

  return (
    <div
      data-slot="combobox-empty"
      class={cn("hidden px-2 py-2 text-center text-[13px] text-muted-foreground group-data-empty/combobox-content:block", local.class)}
      {...rest}
    />
  )
}

export {
  Combobox,
  ComboboxContent,
  ComboboxControl,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
}
