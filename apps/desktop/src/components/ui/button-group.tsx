// @ts-nocheck
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import type { JSX } from "solid-js"

const buttonGroupVariants = cva(
  "flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg!",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg!",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
)

interface ButtonGroupProps extends VariantProps<typeof buttonGroupVariants> {
  class?: string
}

function ButtonGroup(props: ButtonGroupProps) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={props.orientation}
      class={cn(buttonGroupVariants({ orientation: props.orientation }), props.class)}
      {...props}
    />
  )
}

interface ButtonGroupTextProps {
  class?: string
  asChild?: boolean
}

function ButtonGroupText(props: ButtonGroupTextProps) {
  const Comp = props.asChild ? Slot.Root : "div"

  return (
    <Comp
      class={cn(
        "flex items-center gap-2 rounded-lg border bg-muted px-2.5 text-sm font-medium [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    />
  )
}

function ButtonGroupSeparator(props: JSX.HTMLAttributes<HTMLHRElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={props.orientation ?? "vertical"}
      class={cn(
        "relative self-stretch bg-input data-horizontal:mx-px data-horizontal:w-auto data-vertical:my-px data-vertical:h-auto",
        props.class
      )}
      {...props}
    />
  )
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
}
