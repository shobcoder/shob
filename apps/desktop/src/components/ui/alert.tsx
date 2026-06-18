import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface AlertProps extends VariantProps<typeof alertVariants> {
  class?: string
}

function Alert(props: AlertProps) {
  return (
    <div
      data-slot="alert"
      role="alert"
      class={cn(alertVariants({ variant: props.variant }), props.class)}
      {...props}
    />
  )
}

function AlertTitle(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-title"
      class={cn(
        "font-heading font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        props.class
      )}
      {...props}
    />
  )
}

function AlertDescription(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-description"
      class={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        props.class
      )}
      {...props}
    />
  )
}

function AlertAction(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-action"
      class={cn("absolute top-2 right-2", props.class)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
