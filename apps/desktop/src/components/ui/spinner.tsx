import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-solid"
import type { JSX } from "solid-js"

function Spinner({ class: className, ...props }: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <Loader2Icon role="status" aria-label="Loading" class={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
