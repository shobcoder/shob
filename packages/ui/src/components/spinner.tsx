import { ComponentProps, For } from "solid-js"

/** Clockwise ring around the 4×4 grid (corners omitted). */
const ring = [1, 2, 7, 11, 14, 13, 8, 4]
const ringIndex = new Map<number, number>(ring.map((id, i) => [id, i]))
const corners = new Set([0, 3, 12, 15])

const squares = Array.from({ length: 16 }, (_, i) => {
  if (corners.has(i)) return
  const x = (i % 4) * 4
  const y = Math.floor(i / 4) * 4
  const order = ringIndex.get(i)
  if (order !== undefined) {
    // Static fade along the ring; root SVG rotates for the spin.
    return { id: i, x, y, opacity: 0.2 + (order / (ring.length - 1)) * 0.8 }
  }
  // Center cells — low opacity so the ring reads clearly while spinning.
  return { id: i, x, y, opacity: 0.22 }
}).filter((square) => square !== undefined)

export function Spinner(props: {
  class?: string
  classList?: ComponentProps<"div">["classList"]
  style?: ComponentProps<"div">["style"]
}) {
  return (
    <svg
      {...props}
      viewBox="0 0 15 15"
      data-component="spinner"
      classList={{
        ...props.classList,
        [props.class ?? ""]: !!props.class,
      }}
      fill="currentColor"
      aria-hidden="true"
    >
      <For each={squares}>
        {(square) => (
          <rect x={square.x} y={square.y} width="3" height="3" rx="1" opacity={square.opacity} />
        )}
      </For>
    </svg>
  )
}
