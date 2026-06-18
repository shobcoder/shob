import { ContextMenu as ContextMenuPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { ChevronRightIcon, CheckIcon } from "lucide-solid"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function ContextMenu(props: any) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger(props: any) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      class={cn("select-none", props.class)}
      {...props}
    />
  )
}

function ContextMenuGroup(props: any) {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
}

function ContextMenuPortal(props: any) {
  return <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
}

function ContextMenuSub(props: any) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuRadioGroup(props: any) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  )
}

function ContextMenuContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        class={cn("z-50 max-h-[var(--kb-menu-content-available-height)] min-w-36 origin-[var(--kb-menu-content-transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", props.class)}
        {...props}
      >
        {resolvedChildren()}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={props.inset}
      data-variant={props.variant ?? "default"}
      class={cn(
        "group/context-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus:*:[svg]:text-accent-foreground data-[variant=destructive]:*:[svg]:text-destructive",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
    </ContextMenuPrimitive.Item>
  )
}

function ContextMenuSubTrigger(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={props.inset}
      class={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-expanded:bg-accent data-expanded:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
      <ChevronRightIcon class="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <ContextMenuPrimitive.SubContent
      data-slot="context-menu-sub-content"
      class={cn("z-50 min-w-32 origin-[var(--kb-menu-content-transform-origin)] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", props.class)}
      {...props}
    >
      {resolvedChildren()}
    </ContextMenuPrimitive.SubContent>
  )
}

function ContextMenuCheckboxItem(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      data-inset={props.inset}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      <span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {resolvedChildren()}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioItem(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      data-inset={props.inset}
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      <span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {resolvedChildren()}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuLabel(props: any) {
  return (
    <ContextMenuPrimitive.GroupLabel
      data-slot="context-menu-label"
      data-inset={props.inset}
      class={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        props.class
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator(props: any) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      class={cn("-mx-1 my-1 h-px bg-border", props.class)}
      {...props}
    />
  )
}

function ContextMenuShortcut(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="context-menu-shortcut"
      class={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground",
        props.class
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}
