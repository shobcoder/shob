import { Separator as SeparatorPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"

function Separator(props: JSX.HTMLAttributes<HTMLHRElement> & { orientation?: "horizontal" | "vertical"; decorative?: boolean }) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={props.decorative ?? true}
      orientation={props.orientation ?? "horizontal"}
      class={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        props.class
      )}
      {...props}
    />
  )
}

export { Separator }
