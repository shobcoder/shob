import type { JSX } from "solid-js"

import { cn } from "@/lib/utils"

function Skeleton(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      class={cn("animate-pulse rounded-md bg-muted", props.class)}
      {...props}
    />
  )
}

export { Skeleton }
