import type { JSX } from "solid-js"

export type DialogGoUpsellProps = {
  title?: string
  description?: JSX.Element
  link?: string
  actionLabel?: string
  onClose?: (dontShowAgain?: boolean) => void
}

export function DialogUsageExceeded(_props: DialogGoUpsellProps) {
  return null
}
