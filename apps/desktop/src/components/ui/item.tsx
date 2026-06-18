import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import type { JSX } from "solid-js"

function ItemGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="list"
      data-slot="item-group"
      class={cn(
        "group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2",
        props.class
      )}
      {...props}
    />
  )
}

function ItemSeparator(props: JSX.HTMLAttributes<HTMLHRElement>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      class={cn("my-2", props.class)}
      {...props}
    />
  )
}

const itemVariants = cva(
  "group/item flex w-full flex-wrap items-center rounded-lg border text-sm transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:transition-colors [a]:hover:bg-muted",
  {
    variants: {
      variant: {
        default: "border-transparent",
        outline: "border-border",
        muted: "border-transparent bg-muted/50",
      },
      size: {
        default: "gap-2.5 px-3 py-2.5",
        sm: "gap-2.5 px-3 py-2.5",
        xs: "gap-2 px-2.5 py-2 in-data-[slot=dropdown-menu-content]:p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface ItemProps extends VariantProps<typeof itemVariants> {
  class?: string
  as?: "div" | "a"
}

function Item(props: ItemProps) {
  const Comp = props.as ?? "div"
  return (
    <Comp
      data-slot="item"
      data-variant={props.variant}
      data-size={props.size}
      class={cn(itemVariants({ variant: props.variant, size: props.size, class: props.class }))}
      {...props}
    />
  )
}

const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "[&_svg:not([class*='size-'])]:size-4",
        image:
          "size-10 overflow-hidden rounded-sm group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface ItemMediaProps extends VariantProps<typeof itemMediaVariants> {
  class?: string
}

function ItemMedia(props: ItemMediaProps) {
  return (
    <div
      data-slot="item-media"
      data-variant={props.variant}
      class={cn(itemMediaVariants({ variant: props.variant, class: props.class }))}
      {...props}
    />
  )
}

function ItemContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="item-content"
      class={cn(
        "flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none",
        props.class
      )}
      {...props}
    />
  )
}

function ItemTitle(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="item-title"
      class={cn(
        "font-heading line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4",
        props.class
      )}
      {...props}
    />
  )
}

function ItemDescription(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="item-description"
      class={cn(
        "line-clamp-2 text-left text-sm leading-normal font-normal text-muted-foreground group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        props.class
      )}
      {...props}
    />
  )
}

function ItemActions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="item-actions"
      class={cn("flex items-center gap-2", props.class)}
      {...props}
    />
  )
}

function ItemHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="item-header"
      class={cn(
        "flex basis-full items-center justify-between gap-2",
        props.class
      )}
      {...props}
    />
  )
}

function ItemFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="item-footer"
      class={cn(
        "flex basis-full items-center justify-between gap-2",
        props.class
      )}
      {...props}
    />
  )
}

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
}
