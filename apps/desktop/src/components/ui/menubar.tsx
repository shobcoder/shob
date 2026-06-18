import { Menubar as MenubarPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { CheckIcon, ChevronRightIcon } from "lucide-solid"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function Menubar(props: any) {
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      class={cn(
        "flex h-8 items-center gap-0.5 rounded-lg border p-[3px]",
        props.class
      )}
      {...props}
    />
  )
}

function MenubarMenu(props: any) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />
}

function MenubarGroup(props: any) {
  return <MenubarPrimitive.Group data-slot="menubar-group" {...props} />
}

function MenubarPortal(props: any) {
  return <MenubarPrimitive.Portal data-slot="menubar-portal" {...props} />
}

function MenubarRadioGroup(props: any) {
  return (
    <MenubarPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
  )
}

function MenubarTrigger(props: any) {
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      class={cn(
        "flex items-center rounded-sm px-1.5 py-[2px] text-sm font-medium outline-hidden select-none hover:bg-muted data-expanded:bg-muted",
        props.class
      )}
      {...props}
    />
  )
}

function MenubarContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <MenubarPortal>
      <MenubarPrimitive.Content
        data-slot="menubar-content"
        class={cn("z-50 min-w-36 origin-[var(--kb-menu-content-transform-origin)] overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95", props.class)}
        {...props}
      >
        {resolvedChildren()}
      </MenubarPrimitive.Content>
    </MenubarPortal>
  )
}

function MenubarItem(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      data-inset={props.inset}
      data-variant={props.variant ?? "default"}
      class={cn(
        "group/menubar-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
    </MenubarPrimitive.Item>
  )
}

function MenubarCheckboxItem(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <MenubarPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      data-inset={props.inset}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-1.5 pl-7 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      <span class="pointer-events-none absolute left-1.5 flex size-4 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CheckIcon />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {resolvedChildren()}
    </MenubarPrimitive.CheckboxItem>
  )
}

function MenubarRadioItem(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <MenubarPrimitive.RadioItem
      data-slot="menubar-radio-item"
      data-inset={props.inset}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-1.5 pl-7 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      <span class="pointer-events-none absolute left-1.5 flex size-4 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CheckIcon />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {resolvedChildren()}
    </MenubarPrimitive.RadioItem>
  )
}

function MenubarLabel(props: any) {
  return (
    <MenubarPrimitive.GroupLabel
      data-slot="menubar-label"
      data-inset={props.inset}
      class={cn(
        "px-1.5 py-1 text-sm font-medium data-inset:pl-7",
        props.class
      )}
      {...props}
    />
  )
}

function MenubarSeparator(props: any) {
  return (
    <MenubarPrimitive.Separator
      data-slot="menubar-separator"
      class={cn("-mx-1 my-1 h-px bg-border", props.class)}
      {...props}
    />
  )
}

function MenubarShortcut(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="menubar-shortcut"
      class={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/menubar-item:text-accent-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function MenubarSub(props: any) {
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />
}

function MenubarSubTrigger(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <MenubarPrimitive.SubTrigger
      data-slot="menubar-sub-trigger"
      data-inset={props.inset}
      class={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-expanded:bg-accent data-expanded:text-accent-foreground [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
      <ChevronRightIcon class="ml-auto size-4" />
    </MenubarPrimitive.SubTrigger>
  )
}

function MenubarSubContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <MenubarPrimitive.SubContent
      data-slot="menubar-sub-content"
      class={cn("z-50 min-w-32 origin-[var(--kb-menu-content-transform-origin)] overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", props.class)}
      {...props}
    >
      {resolvedChildren()}
    </MenubarPrimitive.SubContent>
  )
}

export {
  Menubar,
  MenubarPortal,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarSeparator,
  MenubarLabel,
  MenubarItem,
  MenubarShortcut,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
}
