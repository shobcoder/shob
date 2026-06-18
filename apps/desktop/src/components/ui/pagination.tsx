import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-solid"
import type { JSX } from "solid-js"

function Pagination(props: JSX.HTMLAttributes<HTMLElement>) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      class={cn("mx-auto flex w-full justify-center", props.class)}
      {...props}
    />
  )
}

function PaginationContent(props: JSX.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-slot="pagination-content"
      class={cn("flex items-center gap-0.5", props.class)}
      {...props}
    />
  )
}

function PaginationItem(props: JSX.LiHTMLAttributes<HTMLLIElement>) {
  return <li data-slot="pagination-item" {...props} />
}

interface PaginationLinkProps extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "size"> {
  isActive?: boolean
  size?: "default" | "sm" | "lg" | "icon"
}

function PaginationLink(props: PaginationLinkProps) {
  return (
    <Button
      asChild
      variant={props.isActive ? "outline" : "ghost"}
      size={props.size ?? "icon"}
      class={cn(props.class)}
    >
      <a
        aria-current={props.isActive ? "page" : undefined}
        data-slot="pagination-link"
        data-active={props.isActive}
        {...props}
      />
    </Button>
  )
}

interface PaginationPreviousProps extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "size"> {
  text?: string
}

function PaginationPrevious(props: PaginationPreviousProps) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      class={cn("pl-1.5!", props.class)}
      {...props}
    >
      <ChevronLeftIcon data-icon="inline-start" />
      <span class="hidden sm:block">{props.text ?? "Previous"}</span>
    </PaginationLink>
  )
}

interface PaginationNextProps extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "size"> {
  text?: string
}

function PaginationNext(props: PaginationNextProps) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      class={cn("pr-1.5!", props.class)}
      {...props}
    >
      <span class="hidden sm:block">{props.text ?? "Next"}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      class={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span class="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
