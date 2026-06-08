import { Component, For, Show } from "solid-js"
import { FileText, X } from "lucide-solid"
import type { PastePart } from "@/context/prompt"

type PromptPasteAttachmentsProps = {
  pastes: PastePart[]
  onShowInTextField: (paste: PastePart) => void
  onRemove: (id: string) => void
}

export const PromptPasteAttachments: Component<PromptPasteAttachmentsProps> = (props) => {
  const filename = (paste: PastePart, index: number) =>
    paste.filename || (props.pastes.length > 1 ? `Pasted text ${index + 1}.txt` : "Pasted text.txt")

  return (
    <Show when={props.pastes.length > 0}>
      <div class="flex flex-wrap gap-2 px-3 pt-3">
        <For each={props.pastes}>
          {(paste, index) => (
            <div class="group/paste relative flex h-[58px] w-[220px] max-w-full items-center rounded-lg border border-border-weak-base bg-surface-raised-base text-left transition-colors hover:border-border-base hover:bg-surface-raised-base-hover">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 pr-7 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                onClick={() => props.onShowInTextField(paste)}
                aria-label={`Show ${filename(paste, index())} in text field`}
              >
                <div class="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-weaker-base bg-background-stronger text-text-base transition-colors group-hover/paste:text-text-strong">
                  <FileText size={15} strokeWidth={1.8} />
                </div>
                <div class="grid min-w-0 gap-0.5">
                  <span class="truncate text-[12px] font-medium leading-4 text-text-strong">
                    {filename(paste, index())}
                  </span>
                  <span class="truncate text-[11px] leading-4 text-text-weaker underline underline-offset-2">
                    Show in text field
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onRemove(paste.id)
                }}
                class="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border-weak-base bg-surface-raised-stronger-non-alpha text-text-base shadow-sm transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong focus-visible:ring-2 focus-visible:ring-ring/45"
                aria-label="Remove pasted text"
              >
                <X size={12} strokeWidth={2.2} />
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
