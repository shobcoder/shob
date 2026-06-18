import { RadioGroup as RadioGroupPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"

function RadioGroup(props: JSX.HTMLAttributes<HTMLDivElement> & { value?: string; defaultValue?: string; onChange?: (value: string) => void; disabled?: boolean; name?: string }) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      class={cn("grid w-full gap-2", props.class)}
      {...props}
    />
  )
}

function RadioGroupItem(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { value: string; disabled?: boolean }) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      class={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        props.class
      )}
      {...props}
    >
      <RadioGroupPrimitive.ItemIndicator
        data-slot="radio-group-indicator"
        class="flex size-4 items-center justify-center"
      >
        <span class="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
      </RadioGroupPrimitive.ItemIndicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
