// @ts-nocheck
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
} from "@/components/ui/input-group"
import { SearchIcon, CheckIcon } from "lucide-solid"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function Command(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command"
      class={cn(
        "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
        props.class
      )}
      {...props}
    />
  )
}

interface CommandDialogProps {
  title?: string
  description?: string
  children: JSX.Element
  class?: string
  showCloseButton?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function CommandDialog(props: CommandDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogHeader class="sr-only">
        <DialogTitle>{props.title ?? "Command Palette"}</DialogTitle>
        <DialogDescription>{props.description ?? "Search for a command to run..."}</DialogDescription>
      </DialogHeader>
      <DialogContent
        class={cn(
          "top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0",
          props.class
        )}
        showCloseButton={props.showCloseButton}
      >
        {props.children}
      </DialogContent>
    </Dialog>
  )
}

function CommandInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div data-slot="command-input-wrapper" class="p-1 pb-0">
      <InputGroup class="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <input
          data-slot="command-input"
          class={cn(
            "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            props.class
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon class="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function CommandList(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-list"
      class={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        props.class
      )}
      {...props}
    />
  )
}

function CommandEmpty(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-empty"
      class={cn("py-6 text-center text-sm", props.class)}
      {...props}
    />
  )
}

function CommandGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-group"
      class={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function CommandSeparator(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-separator"
      class={cn("-mx-1 h-px bg-border", props.class)}
      {...props}
    />
  )
}

function CommandItem(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const resolvedChildren = children(() => props.children)
  return (
    <div
      data-slot="command-item"
      class={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
      <CheckIcon class="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </div>
  )
}

function CommandShortcut(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="command-shortcut"
      class={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
        props.class
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
