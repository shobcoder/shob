// @ts-nocheck
import { DatePicker } from "@ark-ui/solid"
import { createMemo, type JSX } from "solid-js"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-solid"

interface CalendarProps extends Omit<DatePicker.RootProps, "children"> {
  class?: string
  classNames?: Record<string, string>
  showOutsideDays?: boolean
  captionLayout?: "label" | "dropdown" | "label-dropdown"
  buttonVariant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
  mode?: "single" | "multiple" | "range"
}

function Calendar(props: CalendarProps) {
  return (
    <DatePicker.Root
      {...props}
      class={cn(
        "group/calendar bg-background p-2",
        props.class
      )}
    >
      <DatePicker.Context>
        {(calendar) => (
          <>
            <DatePicker.View view="day">
              <DatePicker.Table>
                <DatePicker.TableHeader>
                  <DatePicker.TableRow>
                    {calendar().weekDays.map((day, i) => (
                      <DatePicker.TableHead key={i} class="rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none">
                        {day}
                      </DatePicker.TableHead>
                    ))}
                  </DatePicker.TableRow>
                </DatePicker.TableHeader>
                <DatePicker.TableBody>
                  {calendar().weeks.map((week, i) => (
                    <DatePicker.TableRow key={i} class="mt-2 flex w-full">
                      {week.map((day, i) => (
                        <DatePicker.TableCell key={i} value={day} class="group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none">
                          {(cellProps) => (
                            <Button
                              variant={props.buttonVariant ?? "ghost"}
                              size="icon"
                              class={cn(
                                "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal data-selected:bg-primary data-selected:text-primary-foreground data-today:bg-muted data-today:text-foreground data-outside-month:text-muted-foreground data-disabled:opacity-50",
                                cellProps.disabled && "text-muted-foreground opacity-50",
                                props.classNames?.day
                              )}
                              {...cellProps}
                            >
                              {cellProps.day}
                            </Button>
                          )}
                        </DatePicker.TableCell>
                      ))}
                    </DatePicker.TableRow>
                  ))}
                </DatePicker.TableBody>
              </DatePicker.Table>
            </DatePicker.View>
            <DatePicker.ViewControl>
              <DatePicker.PrevTrigger
                class={cn(
                  buttonVariants({ variant: props.buttonVariant ?? "ghost" }),
                  "size-8 p-0"
                )}
              >
                <ChevronLeftIcon class="size-4" />
              </DatePicker.PrevTrigger>
              <DatePicker.ViewTrigger
                class={cn(
                  buttonVariants({ variant: "ghost" }),
                  "text-sm font-medium"
                )}
              >
                <DatePicker.RangeText class="tabular-nums" />
              </DatePicker.ViewTrigger>
              <DatePicker.NextTrigger
                class={cn(
                  buttonVariants({ variant: props.buttonVariant ?? "ghost" }),
                  "size-8 p-0"
                )}
              >
                <ChevronRightIcon class="size-4" />
              </DatePicker.NextTrigger>
            </DatePicker.ViewControl>
          </>
        )}
      </DatePicker.Context>
    </DatePicker.Root>
  )
}

export { Calendar }
