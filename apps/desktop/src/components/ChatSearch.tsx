import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { ChevronDown, ChevronUp, X } from "lucide-solid"
import type { Message as ChatMessage, Part } from "@shob-ai/sdk/v2/client"

interface ChatSearchMatch {
  messageId: string
  index: number
}

interface ChatSearchProps {
  messages: () => ChatMessage[]
  getParts: (messageId: string) => Part[]
  scrollContainer: () => HTMLDivElement | undefined
  onClose: () => void
}

export function ChatSearch(props: ChatSearchProps) {
  const [query, setQuery] = createSignal("")
  const [currentIndex, setCurrentIndex] = createSignal(0)
  let inputRef: HTMLInputElement | undefined

  const matches = createMemo<ChatSearchMatch[]>(() => {
    const q = query().trim().toLowerCase()
    if (!q) return []
    const results: ChatSearchMatch[] = []
    for (const message of props.messages()) {
      const parts = props.getParts(message.id)
      for (const part of parts) {
        if (part.type === "text" && (part as any).text) {
          const text = ((part as any).text as string).toLowerCase()
          let startPos = 0
          while (true) {
            const idx = text.indexOf(q, startPos)
            if (idx === -1) break
            results.push({ messageId: message.id, index: results.length })
            startPos = idx + 1
          }
        }
      }
    }
    return results
  })

  const matchCount = createMemo(() => matches().length)

  const scrollToMatch = (index: number) => {
    const match = matches()[index]
    if (!match) return
    const container = props.scrollContainer()
    if (!container) return
    const el = container.querySelector(`[data-message-id="${match.messageId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.classList.add("chat-search-highlight")
      setTimeout(() => el.classList.remove("chat-search-highlight"), 1500)
    }
  }

  const goNext = () => {
    if (matchCount() === 0) return
    const next = (currentIndex() + 1) % matchCount()
    setCurrentIndex(next)
    scrollToMatch(next)
  }

  const goPrev = () => {
    if (matchCount() === 0) return
    const next = (currentIndex() - 1 + matchCount()) % matchCount()
    setCurrentIndex(next)
    scrollToMatch(next)
  }

  createEffect(() => {
    query()
    setCurrentIndex(0)
  })

  createEffect(() => {
    const q = query().trim()
    if (q && matchCount() > 0) {
      scrollToMatch(0)
    }
  })

  onMount(() => {
    setTimeout(() => inputRef?.focus(), 30)
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      props.onClose()
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault()
      goPrev()
    } else if (e.key === "Enter") {
      e.preventDefault()
      goNext()
    }
  }

  return (
    <div
      class="absolute right-3 top-2 z-[70] flex items-center gap-1.5 rounded-xl border border-border-weak-base bg-surface-raised-base/95 px-2.5 py-1.5 shadow-xl backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-text-weaker">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        class="h-7 w-48 rounded-md border-none bg-transparent px-1.5 text-[13px] text-text-strong outline-none placeholder:text-text-weaker"
        placeholder="Search in chat..."
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <Show when={query().trim()}>
        <span class="shrink-0 text-[11px] tabular-nums text-text-weaker">
          {matchCount() > 0 ? `${currentIndex() + 1}/${matchCount()}` : "0/0"}
        </span>
      </Show>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong disabled:opacity-40"
        onClick={goPrev}
        disabled={matchCount() === 0}
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong disabled:opacity-40"
        onClick={goNext}
        disabled={matchCount() === 0}
        title="Next match (Enter)"
        aria-label="Next match"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
        onClick={props.onClose}
        title="Close (Escape)"
        aria-label="Close search"
      >
        <X size={14} />
      </button>
    </div>
  )
}
