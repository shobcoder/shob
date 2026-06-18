// @ts-nocheck
import { DropdownMenu as DropdownMenuPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { CheckIcon, ChevronRightIcon } from "lucide-solid"
import { children } from "solid-js"

function DropdownMenu(props: any) {
  return <DropdownMenuPrimitive.Root {...props} />
}

function DropdownMenuPortal(props: any) {
  return <DropdownMenuPrimitive.Portal {...props} />
}

function DropdownMenuTrigger(props: any) {
  return <DropdownMenuPrimitive.Trigger {...props} />
}

function DropdownMenuContent(props: any) {
  const resolvedChildren = children(() => props.children)
  const { class: className, children: _children, ...rest } = props
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        class={cn(
          "z-50 max-h-[var(--kb-menu-content-available-height)] w-[var(--kb-menu-trigger-width)] min-w-32 origin-[var(--kb-menu-content-transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...rest}
      >
        {resolvedChildren()}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup(props: any) {
  return <DropdownMenuPrimitive.Group {...props} />
}

function DropdownMenuItem(props: any) {
  const resolvedChildren = children(() => props.children)
  const { class: className, children: _children, ...rest } = props
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      class={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...rest}
    >
      {resolvedChildren()}
    </DropdownMenuPrimitive.Item>
  )
}

function DropdownMenuCheckboxItem(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      <span
        class="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {resolvedChildren()}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup(props: any) {
  return <DropdownMenuPrimitive.RadioGroup {...props} />
}

function DropdownMenuRadioItem(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      class={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      <span
        class="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {resolvedChildren()}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel(props: any) {
  return (
    <DropdownMenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      class={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator(props: any) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      class={cn("-mx-1 my-1 h-px bg-border", props.class)}
      {...props}
    />
  )
}

function DropdownMenuShortcut(props: any) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      class={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function DropdownMenuSub(props: any) {
  return <DropdownMenuPrimitive.Sub {...props} />
}

function DropdownMenuSubTrigger(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      class={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-expanded:bg-accent data-expanded:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
      <ChevronRightIcon class="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      class={cn(
        "z-50 min-w-[96px] origin-[var(--kb-menu-content-transform-origin)] overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
    </DropdownMenuPrimitive.SubContent>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
