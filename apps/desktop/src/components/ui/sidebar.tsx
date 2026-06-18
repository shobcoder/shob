import { createSignal, createEffect, createMemo, useContext, createContext, type JSX } from "solid-js"
import { cva } from "class-variance-authority"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PanelLeftIcon } from "lucide-solid"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider(props: { defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void; class?: string; style?: JSX.CSSProperties; children: JSX.Element }) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = createSignal(false)

  const [_open, _setOpen] = createSignal(props.defaultOpen ?? true)
  const open = () => props.open ?? _open()
  const setOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const openState = typeof value === "function" ? value(open()) : value
    if (props.onOpenChange) {
      props.onOpenChange(openState)
    } else {
      _setOpen(openState)
    }
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
  }

  const toggleSidebar = () => {
    return isMobile() ? setOpenMobile((prev) => !prev) : setOpen((prev) => !prev)
  }

  createEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  const state = () => open() ? "expanded" : "collapsed"

  const contextValue = createMemo<SidebarContextProps>(() => ({
    state: state(),
    open: open(),
    setOpen,
    isMobile: isMobile(),
    openMobile: openMobile(),
    setOpenMobile,
    toggleSidebar,
  }))

  return (
    <SidebarContext.Provider value={contextValue()}>
      <div
        data-slot="sidebar-wrapper"
        style={{
          "--sidebar-width": SIDEBAR_WIDTH,
          "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
          ...props.style,
        }}
        class={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          props.class
        )}
      >
        {props.children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar(props: { side?: "left" | "right"; variant?: "sidebar" | "floating" | "inset"; collapsible?: "offcanvas" | "icon" | "none"; class?: string; children: JSX.Element; dir?: "ltr" | "rtl" }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (props.collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        class={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          props.class
        )}
      >
        {props.children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          dir={props.dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          class="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={{
            "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
          }}
          side={props.side ?? "left"}
        >
          <SheetHeader class="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div class="flex h-full w-full flex-col">{props.children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      class="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? props.collapsible : ""}
      data-variant={props.variant}
      data-side={props.side}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        class={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          props.variant === "floating" || props.variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={props.side}
        class={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex",
          props.variant === "floating" || props.variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          props.class
        )}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          class="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {props.children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger(props: { class?: string; onClick?: (e: MouseEvent) => void }) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      class={cn(props.class)}
      onClick={(event) => {
        props.onClick?.(event)
        toggleSidebar()
      }}
    >
      <PanelLeftIcon />
      <span class="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarRail(props: { class?: string }) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      class={cn(
        "absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        props.class
      )}
    />
  )
}

function SidebarInset(props: { class?: string; children: JSX.Element }) {
  return (
    <main
      data-slot="sidebar-inset"
      class={cn(
        "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        props.class
      )}
    >
      {props.children}
    </main>
  )
}

function SidebarInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      class={cn("h-8 w-full bg-background shadow-none", props.class)}
      {...props}
    />
  )
}

function SidebarHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      class={cn("flex flex-col gap-2 p-2", props.class)}
      {...props}
    />
  )
}

function SidebarFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      class={cn("flex flex-col gap-2 p-2", props.class)}
      {...props}
    />
  )
}

function SidebarSeparator(props: JSX.HTMLAttributes<HTMLHRElement>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      class={cn("mx-2 w-auto bg-sidebar-border", props.class)}
      {...props}
    />
  )
}

function SidebarContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      class={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        props.class
      )}
      {...props}
    />
  )
}

function SidebarGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      class={cn("relative flex w-full min-w-0 flex-col p-2", props.class)}
      {...props}
    />
  )
}

function SidebarGroupLabel(props: { class?: string; children: JSX.Element }) {
  return (
    <div
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      class={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        props.class
      )}
    />
  )
}

function SidebarGroupAction(props: { class?: string; children: JSX.Element }) {
  return (
    <button
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      class={cn(
        "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
        props.class
      )}
    />
  )
}

function SidebarGroupContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      class={cn("w-full text-sm", props.class)}
      {...props}
    />
  )
}

function SidebarMenu(props: JSX.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      class={cn("flex w-full min-w-0 flex-col gap-0", props.class)}
      {...props}
    />
  )
}

function SidebarMenuItem(props: JSX.HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      class={cn("group/menu-item relative", props.class)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton(props: { isActive?: boolean; variant?: "default" | "outline"; size?: "default" | "sm" | "lg"; tooltip?: string | { children: JSX.Element }; class?: string; children: JSX.Element }) {
  const { isMobile, state } = useSidebar()

  const button = (
    <button
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={props.size}
      data-active={props.isActive}
      class={cn(sidebarMenuButtonVariants({ variant: props.variant, size: props.size }), props.class)}
    >
      {props.children}
    </button>
  )

  if (!props.tooltip) {
    return button
  }

  if (typeof props.tooltip === "string") {
    props.tooltip = {
      children: props.tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...(props.tooltip as any)}
      />
    </Tooltip>
  )
}

function SidebarMenuAction(props: { class?: string; showOnHover?: boolean; children: JSX.Element }) {
  return (
    <button
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      class={cn(
        "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after-hidden [&>svg]:size-4 [&>svg]:shrink-0",
        props.showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0",
        props.class
      )}
    />
  )
}

function SidebarMenuBadge(props: { class?: string; children: JSX.Element }) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      class={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground",
        props.class
      )}
    >
      {props.children}
    </div>
  )
}

function SidebarMenuSkeleton(props: { class?: string; showIcon?: boolean }) {
  const width = `${Math.floor(Math.random() * 40) + 50}%`

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      class={cn("flex h-8 items-center gap-2 rounded-md px-2", props.class)}
    >
      {props.showIcon && (
        <Skeleton
          class="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        class="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={{
          "--skeleton-width": width,
        }}
      />
    </div>
  )
}

function SidebarMenuSub(props: JSX.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      class={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        props.class
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem(props: JSX.HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      class={cn("group/menu-sub-item relative", props.class)}
      {...props}
    />
  )
}

function SidebarMenuSubButton(props: { size?: "sm" | "md"; isActive?: boolean; class?: string; children: JSX.Element }) {
  return (
    <a
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={props.size}
      data-active={props.isActive}
      class={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
        props.class
      )}
    >
      {props.children}
    </a>
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
