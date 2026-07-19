import { type ComponentProps } from "solid-js"

import logoSrc from "../assets/images/shob-logo.webp"

export const Mark = (props: { class?: string }) => {
  return <img data-component="logo-mark" classList={{ [props.class ?? ""]: !!props.class }} src={logoSrc} alt="" />
}

export const Splash = (props: Pick<ComponentProps<"img">, "ref" | "class">) => {
  return (
    <img
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      src={logoSrc}
      alt=""
    />
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <img
      data-component="logo-logo"
      classList={{ [props.class ?? ""]: !!props.class }}
      src={logoSrc}
      alt="Shob"
    />
  )
}
