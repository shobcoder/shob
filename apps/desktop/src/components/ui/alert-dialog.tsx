// @ts-nocheck
import { Dialog as DialogPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-solid"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function AlertDialog(props: any) {
  return <DialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger(props: any) {
  return <DialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal(props: any) {
  return <DialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <DialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      class={cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-expanded:animate-in data-expanded:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
    </DialogPrimitive.Overlay>
  )
}

function AlertDialogContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <DialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={props.size}
        class={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-expanded:animate-in data-expanded:fade-in-0 data-expanded:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          props.class
        )}
        {...props}
      >
        {resolvedChildren()}
      </DialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-dialog-header"
      class={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        props.class
      )}
      {...props}
    />
  )
}

function AlertDialogFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      class={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        props.class
      )}
      {...props}
    />
  )
}

function AlertDialogMedia(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-dialog-media"
      class={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        props.class
      )}
      {...props}
    />
  )
}

function AlertDialogTitle(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogPrimitive.Title
      data-slot="alert-dialog-title"
      class={cn(
        "font-heading text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        props.class
      )}
      {...props}
    />
  )
}

function AlertDialogDescription(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogPrimitive.Description
      data-slot="alert-dialog-description"
      class={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function AlertDialogAction(props: any) {
  return (
    <Button variant={props.variant ?? "default"} size={props.size ?? "default"} asChild>
      <DialogPrimitive.CloseButton
        data-slot="alert-dialog-action"
        class={cn(props.class)}
        {...props}
      />
    </Button>
  )
}

function AlertDialogCancel(props: any) {
  return (
    <Button variant={props.variant ?? "outline"} size={props.size ?? "default"} asChild>
      <DialogPrimitive.CloseButton
        data-slot="alert-dialog-cancel"
        class={cn(props.class)}
        {...props}
      />
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
