import type { JSX } from "solid-js"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep ">
      <div class="absolute inset-x-0 top-[25.375%] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <div class="flex justify-center mb-8">
            <img src="/shob.svg" class="h-auto w-full max-w-[240px] object-contain pointer-events-none opacity-90" alt="Shob" />
          </div>
          <div>{props.children}</div>
        </div>
      </div>
    </div>
  )
}
