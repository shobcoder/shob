// @ts-nocheck
import { cva } from "class-variance-authority"
import { createSignal, createContext, useContext, type Accessor, type Setter, type JSX } from "solid-js"
import { children } from "solid-js"

import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-solid"

const NavigationMenuContext = createContext<{
  value: Accessor<string | null>
  setValue: Setter<string | null>
} | null>(null)

function NavigationMenu(props: { class?: string; children: JSX.Element; viewport?: boolean }) {
  const [value, setValue] = createSignal<string | null>(null)

  return (
    <NavigationMenuContext.Provider value={{ value, setValue }}>
      <nav
        data-slot="navigation-menu"
        data-viewport={props.viewport !== false}
        class={cn(
          "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
          props.class
        )}
      >
        {props.children}
        {props.viewport !== false && <NavigationMenuViewport />}
      </nav>
    </NavigationMenuContext.Provider>
  )
}

function NavigationMenuList(props: JSX.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-slot="navigation-menu-list"
      class={cn(
        "group flex flex-1 list-none items-center justify-center gap-0",
        props.class
      )}
      {...props}
    />
  )
}

function NavigationMenuItem(props: { class?: string; value: string; children: JSX.Element }) {
  const ctx = useContext(NavigationMenuContext)

  return (
    <li
      data-slot="navigation-menu-item"
      class={cn("relative", props.class)}
      onMouseEnter={() => ctx?.setValue(props.value)}
      onMouseLeave={() => ctx?.setValue(null)}
    >
      {props.children}
    </li>
  )
}

const navigationMenuTriggerStyle = cva(
  "group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-active:bg-muted/50 data-active:hover:bg-muted"
)

function NavigationMenuTrigger(props: { class?: string; children: JSX.Element }) {
  const resolvedChildren = children(() => props.children)
  return (
    <button
      data-slot="navigation-menu-trigger"
      class={cn(navigationMenuTriggerStyle(), "group", props.class)}
    >
      {resolvedChildren()}{" "}
      <ChevronDownIcon class="relative top-px ml-1 size-3 transition duration-300 group-data-active/navigation-menu-trigger:rotate-180" aria-hidden="true" />
    </button>
  )
}

function NavigationMenuContent(props: { class?: string; children: JSX.Element }) {
  const ctx = useContext(NavigationMenuContext)
  const resolvedChildren = children(() => props.children)

  return (
    <div
      data-slot="navigation-menu-content"
      class={cn(
        "absolute top-full left-0 w-full p-1 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow ring-1 ring-foreground/10 duration-300 data-active:animate-in data-active:fade-in-0 data-active:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        props.class
      )}
      style={{ display: ctx?.value() ? "block" : "none" }}
    >
      {resolvedChildren()}
    </div>
  )
}

function NavigationMenuViewport(props: { class?: string }) {
  return (
    <div
      class={cn(
        "absolute top-full left-0 isolate z-50 flex justify-center"
      )}
    >
      <div
        data-slot="navigation-menu-viewport"
        class={cn(
          "origin-top-center relative mt-1.5 h-[var(--kb-navigation-menu-viewport-height)] w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow ring-1 ring-foreground/10 duration-100 md:w-[var(--kb-navigation-menu-viewport-width)] data-active:animate-in data-active:zoom-in-90 data-closed:animate-out data-closed:zoom-out-90",
          props.class
        )}
      />
    </div>
  )
}

function NavigationMenuLink(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      data-slot="navigation-menu-link"
      class={cn(
        "flex items-center gap-2 rounded-lg p-2 text-sm transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 data-active:bg-muted/50 data-active:hover:bg-muted data-active:focus:bg-muted [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...props}
    />
  )
}

function NavigationMenuIndicator(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="navigation-menu-indicator"
      class={cn(
        "top-full z-1 flex h-1.5 items-end justify-center overflow-hidden data-closed:animate-out data-closed:fade-out data-active:animate-in data-active:fade-in",
        props.class
      )}
      {...props}
    >
      <div class="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
    </div>
  )
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
}
