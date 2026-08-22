import { TextAttributes } from "@opentui/core"
import { For } from "solid-js"
import { useTheme } from "../context/theme"
import { shob } from "../logo"

export function Logo(props: { align?: "center" | "flex-start" } = {}) {
  const { theme } = useTheme()

  return (
    <box alignItems={props.align ?? "flex-start"}>
      <For each={shob}>
        {(line) => (
          <text fg={theme.text} attributes={TextAttributes.BOLD} selectable={false}>
            {line}
          </text>
        )}
      </For>
    </box>
  )
}

