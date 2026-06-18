// @ts-nocheck
import { Select as SelectPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-solid"
import { children, splitProps } from "solid-js"

function Select(props: any) {
  return <SelectPrimitive.Root {...props} />
}

function SelectValue(props: any) {
  return <SelectPrimitive.Value {...props} />
}

function SelectTrigger(props: any) {
  const [local, rest] = splitProps(props, ["children", "class"])
  const resolvedChildren = children(() => local.children)
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      class={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      {resolvedChildren()}
      <SelectPrimitive.Icon>
        <ChevronDownIcon class="pointer-events-none size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent(props: any) {
  const [local, rest] = splitProps(props, ["children", "class"])
  const resolvedChildren = children(() => local.children)
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        class={cn(
          "relative z-50 max-h-[var(--kb-select-content-available-height)] min-w-36 origin-[var(--kb-select-content-transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          local.class
        )}
        {...rest}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Listbox>
          {() => resolvedChildren()}
        </SelectPrimitive.Listbox>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel(props: any) {
  const [local, rest] = splitProps(props, ["class"])

  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      class={cn("px-1.5 py-1 text-xs text-muted-foreground", local.class)}
      {...rest}
    />
  )
}

function SelectItem(props: any) {
  const [local, rest] = splitProps(props, ["children", "class"])
  const resolvedChildren = children(() => local.children)
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      class={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon class="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemLabel>{resolvedChildren()}</SelectPrimitive.ItemLabel>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator(props: any) {
  const [local, rest] = splitProps(props, ["class"])

  return (
    <div
      data-slot="select-separator"
      class={cn("pointer-events-none -mx-1 my-1 h-px bg-border", local.class)}
      {...rest}
    />
  )
}

function SelectScrollUpButton(props: any) {
  const [local, rest] = splitProps(props, ["class"])

  return (
    <div
      data-slot="select-scroll-up-button"
      class={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <ChevronUpIcon />
    </div>
  )
}

function SelectScrollDownButton(props: any) {
  const [local, rest] = splitProps(props, ["class"])

  return (
    <div
      data-slot="select-scroll-down-button"
      class={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        local.class
      )}
      {...rest}
    >
      <ChevronDownIcon />
    </div>
  )
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
