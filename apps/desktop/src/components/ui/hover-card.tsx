import { HoverCard as HoverCardPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { children } from "solid-js"

function HoverCard(props: any) {
  return <HoverCardPrimitive.Root {...props} />
}

function HoverCardTrigger(props: any) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

function HoverCardContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        class={cn(
          "z-50 w-64 origin-[var(--kb-hover-card-content-transform-origin)] rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          props.class
        )}
        {...props}
      >
        {resolvedChildren()}
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
