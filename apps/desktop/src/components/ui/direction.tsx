// @ts-nocheck
import type { JSX } from "solid-js"

function DirectionProvider(props: { dir?: "ltr" | "rtl"; direction?: "ltr" | "rtl"; children: JSX.Element }) {
  return (
    <div dir={props.direction ?? props.dir ?? "ltr"}>
      {props.children}
    </div>
  )
}

export { DirectionProvider }
