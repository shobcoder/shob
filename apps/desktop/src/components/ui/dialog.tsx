import { Dialog as DialogPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-solid"
import { children } from "solid-js"

function Dialog(props: any) {
  return <DialogPrimitive.Root {...props} />
}

function DialogTrigger(props: any) {
  return <DialogPrimitive.Trigger {...props} />
}

function DialogPortal(props: any) {
  return <DialogPrimitive.Portal {...props} />
}

function DialogClose(props: any) {
  return <DialogPrimitive.CloseButton {...props} />
}

function DialogOverlay(props: any) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      class={cn(
        "fixed inset-0 isolate z-50 bg-black/55 duration-100 supports-backdrop-filter:backdrop-blur-sm data-expanded:animate-in data-expanded:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        props.class
      )}
      {...props}
    />
  )
}

function DialogContent(props: any) {
  const resolvedChildren = children(() => props.children)
  const showCloseButton = props.showCloseButton !== false
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        class={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          props.class
        )}
        style={props.style}
      >
        {resolvedChildren()}
        {showCloseButton && (
          <DialogPrimitive.CloseButton data-slot="dialog-close">
            <Button
              variant="ghost"
              class="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon />
              <span class="sr-only">Close</span>
            </Button>
          </DialogPrimitive.CloseButton>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader(props: any) {
  return (
    <div
      data-slot="dialog-header"
      class={cn("flex flex-col gap-2", props.class)}
      {...props}
    />
  )
}

function DialogFooter(props: any) {
  const resolvedChildren = children(() => props.children)
  const showCloseButton = props.showCloseButton === true
  return (
    <div
      data-slot="dialog-footer"
      class={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        props.class
      )}
    >
      {resolvedChildren()}
      {showCloseButton && (
        <DialogPrimitive.CloseButton>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.CloseButton>
      )}
    </div>
  )
}

function DialogTitle(props: any) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      class={cn(
        "font-heading text-base leading-none font-medium",
        props.class
      )}
      {...props}
    />
  )
}

function DialogDescription(props: any) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      class={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        props.class
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
