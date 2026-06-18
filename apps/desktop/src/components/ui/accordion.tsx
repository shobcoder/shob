// @ts-nocheck
import { Accordion as AccordionPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-solid"
import type { JSX } from "solid-js"
import { children } from "solid-js"

function Accordion(props: any) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      class={cn("flex w-full flex-col", props.class)}
      {...props}
    />
  )
}

function AccordionItem(props: any) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      class={cn("not-last:border-b", props.class)}
      {...props}
    />
  )
}

function AccordionTrigger(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <AccordionPrimitive.Header class="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        class={cn(
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring disabled:pointer-events-none disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
          props.class
        )}
        {...props}
      >
        {resolvedChildren()}
        <ChevronDownIcon data-slot="accordion-trigger-icon" class="pointer-events-none shrink-0 group-data-expanded/accordion-trigger:hidden" />
        <ChevronUpIcon data-slot="accordion-trigger-icon" class="pointer-events-none hidden shrink-0 group-data-expanded/accordion-trigger:inline" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent(props: any) {
  const resolvedChildren = children(() => props.children)
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      class="overflow-hidden text-sm data-expanded:animate-accordion-down data-closed:animate-accordion-up"
      {...props}
    >
      <div
        class={cn(
          "pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          props.class
        )}
      >
        {resolvedChildren()}
      </div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
