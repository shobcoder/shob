import type { JSX } from "solid-js"

interface AspectRatioProps extends JSX.HTMLAttributes<HTMLDivElement> {
  ratio?: number
}

function AspectRatio(props: AspectRatioProps) {
  const ratio = props.ratio ?? 1
  return (
    <div
      data-slot="aspect-ratio"
      style={{
        position: "relative",
        width: "100%",
        "padding-bottom": `${(1 / ratio) * 100}%`,
      }}
      {...props}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      >
        {props.children}
      </div>
    </div>
  )
}

export { AspectRatio }
