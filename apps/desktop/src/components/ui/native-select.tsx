import type { JSX } from "solid-js"

import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-solid"

type NativeSelectProps = Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: "sm" | "default"
}

function NativeSelect(props: NativeSelectProps) {
  return (
    <div
      class={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        props.class
      )}
      data-slot="native-select-wrapper"
      data-size={props.size}
    >
      <select
        data-slot="native-select"
        data-size={props.size}
        class="h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
        {...props}
      />
      <ChevronDownIcon class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none" aria-hidden="true" data-slot="native-select-icon" />
    </div>
  )
}

function NativeSelectOption(props: JSX.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option data-slot="native-select-option" {...props} />
}

function NativeSelectOptGroup(props: JSX.OptgroupHTMLAttributes<HTMLOptGroupElement>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      class={cn(props.class)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
