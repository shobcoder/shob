import type { JSX } from "solid-js"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep">
      <div class="absolute inset-0 flex items-center justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          {props.children}
        </div>
      </div>
    </div>
  )
}
