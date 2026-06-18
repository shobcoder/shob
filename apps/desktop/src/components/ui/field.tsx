// @ts-nocheck
import { createMemo } from "solid-js"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import type { JSX } from "solid-js"

function FieldSet(props: JSX.HTMLAttributes<HTMLFieldSetElement>) {
  return (
    <fieldset
      data-slot="field-set"
      class={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        props.class
      )}
      {...props}
    />
  )
}

function FieldLegend(props: JSX.HTMLAttributes<HTMLLegendElement> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={props.variant ?? "legend"}
      class={cn(
        "mb-1.5 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base",
        props.class
      )}
      {...props}
    />
  )
}

function FieldGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="field-group"
      class={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
        props.class
      )}
      {...props}
    />
  )
}

const fieldVariants = cva(
  "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

interface FieldProps extends VariantProps<typeof fieldVariants> {
  class?: string
}

function Field(props: FieldProps) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={props.orientation}
      class={cn(fieldVariants({ orientation: props.orientation }), props.class)}
      {...props}
    />
  )
}

function FieldContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="field-content"
      class={cn(
        "group/field-content flex flex-1 flex-col gap-0.5 leading-snug",
        props.class
      )}
      {...props}
    />
  )
}

function FieldLabel(props: JSX.HTMLAttributes<HTMLLabelElement>) {
  return (
    <Label
      data-slot="field-label"
      class={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border *:data-[slot=field]:p-2.5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        props.class
      )}
      {...props}
    />
  )
}

function FieldTitle(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="field-label"
      class={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50",
        props.class
      )}
      {...props}
    />
  )
}

function FieldDescription(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="field-description"
      class={cn(
        "text-left text-sm leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        props.class
      )}
      {...props}
    />
  )
}

function FieldSeparator(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!props.children}
      class={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        props.class
      )}
      {...props}
    >
      <Separator class="absolute inset-0 top-1/2" />
      {props.children && (
        <span
          class="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {props.children}
        </span>
      )}
    </div>
  )
}

interface FieldErrorProps extends JSX.HTMLAttributes<HTMLDivElement> {
  errors?: Array<{ message?: string } | undefined>
}

function FieldError(props: FieldErrorProps) {
  const content = createMemo(() => {
    if (props.children) {
      return props.children
    }

    if (!props.errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(props.errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul class="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error) =>
            error?.message && <li>{error.message}</li>
        )}
      </ul>
    )
  })

  if (!content()) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      class={cn("text-sm font-normal text-destructive", props.class)}
      {...props}
    >
      {content()}
    </div>
  )
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}
