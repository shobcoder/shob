import { cva } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { children, splitProps } from "solid-js"

function Tabs(props: any) {
  const [local, rest] = splitProps(props, ["class", "onValueChange"])
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      class={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        local.class
      )}
      onChange={local.onValueChange}
      {...rest}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={props.variant}
      class={cn(tabsListVariants({ variant: props.variant }), props.class)}
    >
      {resolvedChildren()}
    </TabsPrimitive.List>
  )
}

function TabsTrigger(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      class={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-selected:shadow-sm group-data-[variant=line]/tabs-list:data-selected:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-selected:bg-transparent dark:group-data-[variant=line]/tabs-list:data-selected:border-transparent dark:group-data-[variant=line]/tabs-list:data-selected:bg-transparent",
        "data-selected:bg-background data-selected:text-foreground dark:data-selected:border-input dark:data-selected:bg-input/30 dark:data-selected:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-selected:after:opacity-100",
        props.class
      )}
      {...props}
    >
      {resolvedChildren()}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      class={cn("flex-1 text-sm outline-none", props.class)}
      {...props}
    >
      {resolvedChildren()}
    </TabsPrimitive.Content>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
