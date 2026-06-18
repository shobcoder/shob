import { Dialog as DialogPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function Drawer(props: any) {
  return <DialogPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger(props: any) {
  return <DialogPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal(props: any) {
  return <DialogPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose(props: any) {
  return <DialogPrimitive.CloseButton data-slot="drawer-close" {...props} />
}

function DrawerOverlay(props: any) {
  return (
    <DialogPrimitive.Overlay
      data-slot="drawer-overlay"
      class={cn(
        "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-expanded:animate-in data-expanded:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        props.class
      )}
      {...props}
    />
  )
}

function DrawerContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DialogPrimitive.Content
        data-slot="drawer-content"
        class={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-popover text-sm text-popover-foreground data-expanded:animate-in data-expanded:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          props.class
        )}
        {...props}
      >
        <div class="mx-auto mt-4 hidden h-1 w-[100px] shrink-0 rounded-full bg-muted group-data-expanded/drawer-content:block" />
        {resolvedChildren()}
      </DialogPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="drawer-header"
      class={cn(
        "flex flex-col gap-0.5 p-4 group-data-expanded/drawer-content:text-center md:gap-0.5 md:text-left",
        props.class
      )}
      {...props}
    />
  )
}

function DrawerFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="drawer-footer"
      class={cn("mt-auto flex flex-col gap-2 p-4", props.class)}
      {...props}
    />
  )
}

function DrawerTitle(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogPrimitive.Title
      data-slot="drawer-title"
      class={cn(
        "font-heading text-base font-medium text-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function DrawerDescription(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogPrimitive.Description
      data-slot="drawer-description"
      class={cn("text-sm text-muted-foreground", props.class)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
