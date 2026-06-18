import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"

function ResizablePanelGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="resizable-panel-group"
      class={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        props.class
      )}
      {...props}
    />
  )
}

function ResizablePanel(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="resizable-panel" {...props} />
}

function ResizableHandle(props: { withHandle?: boolean; class?: string }) {
  return (
    <div
      data-slot="resizable-handle"
      class={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        props.class
      )}
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
    >
      {props.withHandle && (
        <div class="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </div>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
