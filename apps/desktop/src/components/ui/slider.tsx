import { Slider as SliderPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"

interface SliderProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "value" | "defaultValue" | "onChange"> {
  class?: string
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  orientation?: "horizontal" | "vertical"
  onChange?: (value: number[]) => void
}

function Slider(props: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      minValue={props.min ?? 0}
      maxValue={props.max ?? 100}
      step={props.step}
      value={props.value}
      defaultValue={props.defaultValue}
      onChange={props.onChange}
      class={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        props.class
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        class="relative grow overflow-hidden rounded-full bg-muted data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
      >
        <SliderPrimitive.Fill
          data-slot="slider-range"
          class="absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        class="relative block size-3 shrink-0 rounded-full border border-ring bg-background ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
