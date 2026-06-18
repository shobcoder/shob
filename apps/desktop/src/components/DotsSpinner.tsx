import { createSignal, onCleanup, onMount } from "solid-js"

const DOTS_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

export function DotsSpinner(props: { class?: string }) {
  const [frame, setFrame] = createSignal(0)

  onMount(() => {
    const timer = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % DOTS_FRAMES.length)
    }, 80)
    onCleanup(() => window.clearInterval(timer))
  })

  return (
    <span class={props.class} aria-hidden="true">
      {DOTS_FRAMES[frame()]}
    </span>
  )
}

