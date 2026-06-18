import { Image as KobalteImage } from "@kobalte/core"

import { cn } from "@/lib/utils"
import type { JSX } from "solid-js"

function Avatar({
  class: className,
  size = "default",
  ...props
}: JSX.HTMLAttributes<HTMLDivElement> & {
  size?: "default" | "sm" | "lg"
}) {
  return (
    <div
      data-slot="avatar"
      data-size={size}
      class={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  class: className,
  src,
  alt,
}: {
  class?: string
  src?: string
  alt?: string
}) {
  return (
    <KobalteImage.Root>
      <img
        data-slot="avatar-image"
        class={cn(
          "aspect-square size-full rounded-full object-cover",
          className
        )}
        src={src}
        alt={alt}
      />
    </KobalteImage.Root>
  )
}

function AvatarFallback({
  class: className,
  ...props
}: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="avatar-fallback"
      class={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ class: className, ...props }: JSX.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="avatar-badge"
      class={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ class: className, ...props }: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="avatar-group"
      class={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  class: className,
  ...props
}: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="avatar-group-count"
      class={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
