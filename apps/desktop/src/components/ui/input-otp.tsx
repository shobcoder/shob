import { PinInput } from "@ark-ui/solid"
import type { JSX } from "solid-js"

import { cn } from "@/lib/utils"
import { MinusIcon } from "lucide-solid"

interface InputOTPProps extends Omit<PinInput.RootProps, "children"> {
  class?: string
  containerClassName?: string
  children?: JSX.Element
}

function InputOTP(props: InputOTPProps) {
  return (
    <PinInput.Root
      data-slot="input-otp"
      class={cn("disabled:cursor-not-allowed", props.class)}
      {...props}
    >
      <div
        class={cn(
          "cn-input-otp flex items-center has-disabled:opacity-50",
          props.containerClassName
        )}
      >
        {props.children}
      </div>
    </PinInput.Root>
  )
}

function InputOTPGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="input-otp-group"
      class={cn(
        "flex items-center rounded-lg has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40",
        props.class
      )}
      {...props}
    />
  )
}

interface InputOTPSlotProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "index"> {
  index: number
  class?: string
}

function InputOTPSlot(props: InputOTPSlotProps) {
  const { index, ...rest } = props
  return (
    <PinInput.Input
      index={index}
      class={cn(
        "relative flex size-8 items-center justify-center border-y border-r border-input text-sm transition-all outline-none first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive data-[state=selected]:z-10 data-[state=selected]:border-ring data-[state=selected]:ring-3 data-[state=selected]:ring-ring/50 data-[state=selected]:aria-invalid:border-destructive data-[state=selected]:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:data-[state=selected]:aria-invalid:ring-destructive/40",
        props.class
      )}
      {...rest}
    />
  )
}

function InputOTPSeparator(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="input-otp-separator"
      class="flex items-center [&_svg:not([class*='size-'])]:size-4"
      role="separator"
      {...props}
    >
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
