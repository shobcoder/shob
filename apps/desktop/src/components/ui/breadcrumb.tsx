// @ts-nocheck
import { cn } from "@/lib/utils"
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-solid"
import { Slot } from "@kobalte/core"
import type { JSX } from "solid-js"

function Breadcrumb(props: JSX.HTMLAttributes<HTMLElement>) {
  return (
    <nav
      aria-label="breadcrumb"
      data-slot="breadcrumb"
      class={cn(props.class)}
      {...props}
    />
  )
}

function BreadcrumbList(props: JSX.OlHTMLAttributes<HTMLOListElement>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      class={cn(
        "flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function BreadcrumbItem(props: JSX.LiHTMLAttributes<HTMLLIElement>) {
  return (
    <li
      data-slot="breadcrumb-item"
      class={cn("inline-flex items-center gap-1", props.class)}
      {...props}
    />
  )
}

interface BreadcrumbLinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean
}

function BreadcrumbLink(props: BreadcrumbLinkProps) {
  const Comp = props.asChild ? Slot.Root : "a"

  return (
    <Comp
      data-slot="breadcrumb-link"
      class={cn("transition-colors hover:text-foreground", props.class)}
      {...props}
    />
  )
}

function BreadcrumbPage(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      class={cn("font-normal text-foreground", props.class)}
      {...props}
    />
  )
}

function BreadcrumbSeparator(props: JSX.LiHTMLAttributes<HTMLLIElement>) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      class={cn("[&>svg]:size-3.5", props.class)}
      {...props}
    >
      {props.children ?? <ChevronRightIcon />}
    </li>
  )
}

function BreadcrumbEllipsis(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      class={cn(
        "flex size-5 items-center justify-center [&>svg]:size-4",
        props.class
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span class="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
