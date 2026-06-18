import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getCliDisplayLabel, getCliIconAsset, getCliFallbackText } from "../config/cli-ui"

interface CliAvatarProps {
  cliId?: string | null
  label?: string | null
  size?: "sm" | "md"
  class?: string
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-7 w-7",
} as const

export function CliAvatar({ cliId, label, size = "md", class: className = "" }: CliAvatarProps) {
  const logo = getCliIconAsset(cliId)
  const resolvedLabel = label ?? getCliDisplayLabel(cliId) ?? "CLI"
  const sizeClass = sizeClasses[size]

  return (
    <Avatar class={`${sizeClass} ${className}`} data-size={size}>
      {logo && <AvatarImage src={logo} alt={resolvedLabel} />}
      {!logo && (
        <AvatarFallback class="text-[8px] bg-muted/50">
          {getCliFallbackText(cliId, resolvedLabel)}
        </AvatarFallback>
      )}
    </Avatar>
  )
}
