import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function ScrollArea(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const resolvedChildren = children(() => props.children)
  return (
    <div
      data-slot="scroll-area"
      class={cn("relative overflow-hidden", props.class)}
      {...props}
    >
      <div
        data-slot="scroll-area-viewport"
        class="size-full overflow-auto rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {resolvedChildren()}
      </div>
    </div>
  )
}

function ScrollBar(props: { class?: string; orientation?: "vertical" | "horizontal" }) {
  return (
    <div
      data-slot="scroll-area-scrollbar"
      data-orientation={props.orientation}
      class={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        props.class
      )}
    />
  )
}

export { ScrollArea, ScrollBar }
