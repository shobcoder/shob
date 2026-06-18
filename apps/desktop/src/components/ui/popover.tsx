import { Popover as PopoverPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function Popover(props: any) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger(props: any) {
  return <PopoverPrimitive.Trigger {...props} />
}

function PopoverContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        class={cn(
          "z-50 flex w-72 origin-[var(--kb-popover-content-transform-origin)] flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          props.class
        )}
        {...props}
      >
        {resolvedChildren()}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor(props: any) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="popover-header"
      class={cn("flex flex-col gap-0.5 text-sm", props.class)}
      {...props}
    />
  )
}

function PopoverTitle(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="popover-title"
      class={cn("font-heading font-medium", props.class)}
      {...props}
    />
  )
}

function PopoverDescription(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="popover-description"
      class={cn("text-muted-foreground", props.class)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
