import { Dialog as DialogPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-solid"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function Sheet(props: any) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: any) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: any) {
  return <DialogPrimitive.CloseButton data-slot="sheet-close" {...props} />
}

function SheetPortal(props: any) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay(props: any) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      class={cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-expanded:animate-in data-expanded:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        props.class
      )}
      {...props}
    />
  )
}

function SheetContent(props: any) {
  const resolvedChildren = children(() => props.children)
  const showCloseButton = props.showCloseButton !== false
  const side = props.side ?? "right"
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        class={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-expanded:animate-in data-expanded:fade-in-0 data-[side=bottom]:data-expanded:slide-in-from-bottom-10 data-[side=left]:data-expanded:slide-in-from-left-10 data-[side=right]:data-expanded:slide-in-from-right-10 data-[side=top]:data-expanded:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          props.class
        )}
        {...props}
      >
        {resolvedChildren()}
        {showCloseButton && (
          <DialogPrimitive.CloseButton
            data-slot="sheet-close"
            as={Button}
            variant="ghost"
            class="absolute top-3 right-3"
            size="icon-sm"
          >
            <XIcon />
            <span class="sr-only">Close</span>
          </DialogPrimitive.CloseButton>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      class={cn("flex flex-col gap-0.5 p-4", props.class)}
      {...props}
    />
  )
}

function SheetFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-footer"
      class={cn("mt-auto flex flex-col gap-2 p-4", props.class)}
      {...props}
    />
  )
}

function SheetTitle(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      class={cn(
        "font-heading text-base font-medium text-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function SheetDescription(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      class={cn("text-sm text-muted-foreground", props.class)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
