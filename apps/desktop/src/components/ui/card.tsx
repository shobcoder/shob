import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"

function Card({
  class: className,
  size = "default",
  ...props
}: JSX.HTMLAttributes<HTMLDivElement> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      class={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ class: className, ...props }: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      class={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ class: className, ...props }: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-title"
      class={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ class: className, ...props }: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-description"
      class={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ class: className, ...props }: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-action"
      class={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ class: className, ...props }: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-content"
      class={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ class: className, ...props }: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-footer"
      class={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
