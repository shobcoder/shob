import { Tooltip as TooltipPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { children } from "solid-js"

function TooltipProvider(props: any) {
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip-provider"
      openDelay={props.delayDuration ?? 0}
      {...props}
    />
  )
}

function Tooltip(props: any) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger(props: any) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        class={cn(
          "z-50 inline-flex w-fit max-w-xs origin-[var(--kb-tooltip-content-transform-origin)] items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          props.class
        )}
        {...props}
      >
        {resolvedChildren()}
        <TooltipPrimitive.Arrow class="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
