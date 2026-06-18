// @ts-nocheck
import { createMemo, createContext, useContext, type JSX } from "solid-js"
import { SolidChart, type ChartProps } from "solid-chartjs"
import type { ChartData, ChartOptions } from "chart.js"

import { cn } from "@/lib/utils"

const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = Record<
  string,
  {
    label?: JSX.Element
    icon?: (props: any) => JSX.Element
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = createContext<ChartContextProps | null>(null)

function useChart() {
  const context = useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

interface ChartContainerProps extends JSX.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig
  children: JSX.Element
  initialDimension?: {
    width: number
    height: number
  }
}

function ChartContainer(props: ChartContainerProps) {
  const uniqueId = crypto.randomUUID().replace(/:/g, "")
  const chartId = `chart-${props.id ?? uniqueId}`

  return (
    <ChartContext.Provider value={{ config: props.config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        class={cn(
          "flex aspect-video justify-center text-xs",
          props.class
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={props.config} />
        <div class="w-full h-full">
          {props.children}
        </div>
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = (props: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(props.config).filter(
    ([, config]) => (config as any).theme ?? (config as any).color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      innerHTML={Object.entries(THEMES)
        .map(
          ([theme, prefix]) => `
${prefix} [data-chart=${props.id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const themeConfig = (itemConfig as any).theme
    const color =
      themeConfig?.[theme as keyof typeof themeConfig] ??
      (itemConfig as any).color
    return color ? `  --color-${key}: ${color};` : null
  })
  .filter(Boolean)
  .join("\n")}
}
`
        )
        .join("\n")}
    />
  )
}

interface ChartTooltipContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  active?: boolean
  payload?: any[]
  indicator?: "line" | "dot" | "dashed"
  hideLabel?: boolean
  hideIndicator?: boolean
  label?: string | number
  labelFormatter?: (value: any, payload: any[]) => JSX.Element
  labelClassName?: string
  formatter?: (value: any, name: string, item: any, index: number, payload: any) => JSX.Element
  color?: string
  nameKey?: string
  labelKey?: string
}

function ChartTooltipContent(props: ChartTooltipContentProps) {
  const { config } = useChart()

  const tooltipLabel = createMemo(() => {
    if (props.hideLabel || !props.payload?.length) {
      return null
    }

    const [item] = props.payload
    const key = `${props.labelKey ?? item?.dataKey ?? item?.name ?? "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !props.labelKey && typeof props.label === "string"
        ? (config[props.label]?.label ?? props.label)
        : itemConfig?.label

    if (props.labelFormatter) {
      return (
        <div class={cn("font-medium", props.labelClassName)}>
          {props.labelFormatter(value, props.payload)}
        </div>
      )
    }

    if (!value) {
      return null
    }

    return <div class={cn("font-medium", props.labelClassName)}>{value}</div>
  })

  if (!props.active || !props.payload?.length) {
    return null
  }

  const nestLabel = props.payload.length === 1 && props.indicator !== "dot"

  return (
    <div
      class={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        props.class
      )}
    >
      {!nestLabel ? tooltipLabel() : null}
      <div class="grid gap-1.5">
        {props.payload
          .filter((item: any) => item.type !== "none")
          .map((item: any, index: number) => {
            const key = `${props.nameKey ?? item.name ?? item.dataKey ?? "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = props.color ?? item.payload?.fill ?? item.color

            return (
              <div
                key={index}
                class={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  props.indicator === "dot" && "items-center"
                )}
              >
                {props.formatter && item?.value !== undefined && item.name ? (
                  props.formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !props.hideIndicator && (
                        <div
                          class={cn(
                            "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                            props.indicator === "dot" && "h-2.5 w-2.5",
                            props.indicator === "line" && "w-1",
                            props.indicator === "dashed" && "w-0 border-[1.5px] border-dashed bg-transparent",
                            nestLabel && props.indicator === "dashed" && "my-0.5"
                          )}
                          style={{
                            "--color-bg": indicatorColor,
                            "--color-border": indicatorColor,
                          } as JSX.CSSProperties}
                        />
                      )
                    )}
                    <div
                      class={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}
                    >
                      <div class="grid gap-1.5">
                        {nestLabel ? tooltipLabel() : null}
                        <span class="text-muted-foreground">
                          {itemConfig?.label ?? item.name}
                        </span>
                      </div>
                      {item.value != null && (
                        <span class="font-mono font-medium text-foreground tabular-nums">
                          {typeof item.value === "number"
                            ? item.value.toLocaleString()
                            : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

interface ChartLegendContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  hideIcon?: boolean
  payload?: any[]
  verticalAlign?: "top" | "bottom"
  nameKey?: string
}

function ChartLegendContent(props: ChartLegendContentProps) {
  const { config } = useChart()

  if (!props.payload?.length) {
    return null
  }

  return (
    <div
      class={cn(
        "flex items-center justify-center gap-4",
        props.verticalAlign === "top" ? "pb-3" : "pt-3",
        props.class
      )}
    >
      {props.payload
        .filter((item: any) => item.type !== "none")
        .map((item: any, index: number) => {
          const key = `${props.nameKey ?? item.dataKey ?? "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={index}
              class={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}
            >
              {itemConfig?.icon && !props.hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  class="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          )
        })}
    </div>
  )
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof (payload as any).payload === "object" &&
    (payload as any).payload !== null
      ? (payload as any).payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof (payload as any)[key] === "string"
  ) {
    configLabelKey = (payload as any)[key] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof (payloadPayload as any)[key] === "string"
  ) {
    configLabelKey = (payloadPayload as any)[key] as string
  }

  return configLabelKey in config ? config[configLabelKey] : config[key]
}

export {
  ChartContainer,
  ChartTooltipContent,
  ChartLegendContent,
  ChartStyle,
  SolidChart,
}
export type { ChartProps, ChartData, ChartOptions }
