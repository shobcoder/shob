import { splitProps, type JSX } from "solid-js"

export interface ResizeHandleProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "onResize"> {
  direction: "horizontal" | "vertical"
  edge?: "start" | "end"
  size: number
  min: number
  max: number
  onResize: (size: number) => void
  onCollapse?: () => void
  collapseThreshold?: number
}

export function ResizeHandle(props: ResizeHandleProps) {
  const [local, rest] = splitProps(props, [
    "direction",
    "edge",
    "size",
    "min",
    "max",
    "onResize",
    "onCollapse",
    "collapseThreshold",
    "class",
    "classList",
  ])

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault()
    const target = e.currentTarget as HTMLDivElement
    target.setPointerCapture(e.pointerId)
    const edge = local.edge ?? (local.direction === "vertical" ? "start" : "end")
    const start = local.direction === "horizontal" ? e.clientX : e.clientY
    const startSize = local.size
    let current = startSize

    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"
    document.body.style.cursor = local.direction === "horizontal" ? "col-resize" : "row-resize"

    const onPointerMove = (moveEvent: PointerEvent) => {
      const pos = local.direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
      const delta =
        local.direction === "vertical"
          ? edge === "end"
            ? pos - start
            : start - pos
          : edge === "start"
            ? start - pos
            : pos - start
      current = startSize + delta
      const clamped = Math.min(local.max, Math.max(local.min, current))
      local.onResize(clamped)
    }

    const onPointerEnd = (endEvent: PointerEvent) => {
      if (target.hasPointerCapture(endEvent.pointerId)) {
        target.releasePointerCapture(endEvent.pointerId)
      }
      document.body.style.userSelect = ""
      document.body.style.overflow = ""
      document.body.style.cursor = ""
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerup", onPointerEnd)
      document.removeEventListener("pointercancel", onPointerEnd)

      const threshold = local.collapseThreshold ?? 0
      if (local.onCollapse && threshold > 0 && current < threshold) {
        local.onCollapse()
      }
    }

    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup", onPointerEnd)
    document.addEventListener("pointercancel", onPointerEnd)
  }

  return (
    <div
      {...rest}
      data-component="resize-handle"
      data-direction={local.direction}
      data-edge={local.edge ?? (local.direction === "vertical" ? "start" : "end")}
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
      onPointerDown={handlePointerDown}
    />
  )
}
