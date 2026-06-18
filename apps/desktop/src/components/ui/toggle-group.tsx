import { ToggleGroup as ToggleGroupPrimitive } from "@kobalte/core"

import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"
import type { JSX } from "solid-js"
import { createContext, createMemo, useContext } from "solid-js"

type ToggleGroupContextType = {
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
  spacing?: number
  orientation?: "horizontal" | "vertical"
}

const ToggleGroupContext = createContext<ToggleGroupContextType>({
  size: "default",
  variant: "default",
  spacing: 0,
  orientation: "horizontal",
})

function useToggleGroupContext() {
  const ctx = useContext(ToggleGroupContext)
  return ctx ?? { size: "default", variant: "default", spacing: 0, orientation: "horizontal" }
}

interface ToggleGroupSingleProps {
  class?: string
  spacing?: number
  orientation?: "horizontal" | "vertical"
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  children: JSX.Element
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
  multiple?: false
}

interface ToggleGroupMultipleProps {
  class?: string
  spacing?: number
  orientation?: "horizontal" | "vertical"
  value?: string[]
  defaultValue?: string[]
  onChange?: (value: string[]) => void
  disabled?: boolean
  children: JSX.Element
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
  multiple: true
}

type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps

function ToggleGroup(props: ToggleGroupProps) {
  const contextValue = createMemo<ToggleGroupContextType>(() => ({
    variant: props.variant,
    size: props.size,
    spacing: props.spacing ?? 0,
    orientation: props.orientation ?? "horizontal",
  }))

  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={props.variant}
      data-size={props.size}
      data-spacing={props.spacing}
      data-orientation={props.orientation}
      style={{ "--gap": props.spacing ?? 0 } as JSX.CSSProperties}
      class={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-vertical:flex-col data-vertical:items-stretch",
        props.class
      )}
      {...(props as any)}
    >
      <ToggleGroupContext.Provider value={contextValue()}>
        {props.children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

interface ToggleGroupItemProps {
  class?: string
  value: string
  disabled?: boolean
  children: JSX.Element
  variant?: "default" | "outline"
  size?: "default" | "sm" | "lg"
}

function ToggleGroupItem(props: ToggleGroupItemProps) {
  const context = useToggleGroupContext()

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant ?? props.variant ?? "default"}
      data-size={context.size ?? props.size ?? "default"}
      data-spacing={context.spacing}
      class={cn(
        "shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          variant: context.variant ?? props.variant,
          size: context.size ?? props.size,
        }),
        props.class
      )}
      {...props}
    >
      {props.children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
