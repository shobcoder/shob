// @ts-nocheck
import { Checkbox as CheckboxPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-solid"
import type { JSX } from "solid-js"

interface CheckboxProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  class?: string
  checked?: boolean | "indeterminate"
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  name?: string
  value?: string
}

function Checkbox(props: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      class={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        props.class
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        class="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
