import shobLogo from "@/assets/icon/shob.png"

interface IcoProps {
  class?: string
  alt?: string
}

export function Ico(props: IcoProps) {
  return <img src={shobLogo} alt={props.alt ?? "shob logo"} class={props.class ?? "h-9 w-9 rounded-lg object-cover"} />
}

