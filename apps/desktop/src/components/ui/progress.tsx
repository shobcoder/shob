import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const progressVariants = cva(
  "relative flex w-full items-center overflow-hidden rounded-full bg-muted",
  {
    variants: {
      size: {
        default: "h-2",
        sm: "h-1",
        lg: "h-3",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

interface ProgressProps extends VariantProps<typeof progressVariants> {
  class?: string
  value?: number
  max?: number
  getValueLabel?: (value: number, max: number) => string
}

function Progress(props: ProgressProps) {
  return (
    <div
      data-slot="progress"
      data-size={props.size}
      class={cn(progressVariants({ size: props.size }), props.class)}
      role="progressbar"
      aria-valuenow={props.value}
      aria-valuemin={0}
      aria-valuemax={props.max ?? 100}
      aria-valuetext={props.getValueLabel?.(props.value ?? 0, props.max ?? 100) ?? `${props.value ?? 0}%`}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        class="size-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (props.value ?? 0)}%)` }}
      />
    </div>
  )
}

export { Progress }
