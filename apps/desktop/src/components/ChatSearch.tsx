import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import { ArrowDown, ArrowUp, X } from "lucide-solid"
import type { Message as ChatMessage, Part } from "@shob-ai/sdk/v2/client"

interface ChatSearchProps {
  messages: () => ChatMessage[]
  getParts: (messageId: string) => Part[]
  scrollContainer: () => HTMLDivElement | undefined
  onClose: () => void
}

const HIGHLIGHT_CLASS = "chat-search-word-highlight"
const ACTIVE_HIGHLIGHT_CLASS = "chat-search-word-active"
const MARK_ATTR = "data-search-mark"

function clearHighlights(container: HTMLElement | undefined) {
  if (!container) return
  const marks = container.querySelectorAll(`mark[${MARK_ATTR}]`)
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark)
    parent.normalize()
  })
}

function highlightTextInContainer(container: HTMLElement | undefined, query: string): HTMLElement[] {
  if (!container || !query) return []
  const lowerQuery = query.toLowerCase()
  const marks: HTMLElement[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest(`mark[${MARK_ATTR}], input, textarea, [contenteditable]`)) {
        return NodeFilter.FILTER_REJECT
      }
      if (node.textContent && node.textContent.toLowerCase().includes(lowerQuery)) {
        return NodeFilter.FILTER_ACCEPT
      }
      return NodeFilter.FILTER_REJECT
    },
  })

  const textNodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    textNodes.push(current as Text)
    current = walker.nextNode()
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent || ""
    const lowerText = text.toLowerCase()
    const parent = textNode.parentNode
    if (!parent) continue

    const fragment = document.createDocumentFragment()
    let lastIndex = 0
    let pos = lowerText.indexOf(lowerQuery, 0)

    while (pos !== -1) {
      if (pos > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, pos)))
      }
      const mark = document.createElement("mark")
      mark.setAttribute(MARK_ATTR, "")
      mark.className = HIGHLIGHT_CLASS
      mark.textContent = text.slice(pos, pos + query.length)
      fragment.appendChild(mark)
      marks.push(mark)
      lastIndex = pos + query.length
      pos = lowerText.indexOf(lowerQuery, lastIndex)
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
    }

    parent.replaceChild(fragment, textNode)
  }

  return marks
}

function scrollContainerToElement(scrollEl: HTMLElement | undefined, target: HTMLElement) {
  if (!scrollEl) return
  const containerRect = scrollEl.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetMiddle = targetRect.top + targetRect.height / 2
  const containerMiddle = containerRect.top + containerRect.height / 2
  const offset = targetMiddle - containerMiddle
  scrollEl.scrollBy({ top: offset, behavior: "smooth" })
}

export function ChatSearch(props: ChatSearchProps) {
  const [query, setQuery] = createSignal("")
  const [currentIndex, setCurrentIndex] = createSignal(0)
  const [markElements, setMarkElements] = createSignal<HTMLElement[]>([])
  let inputRef: HTMLInputElement | undefined

  const matchCount = createMemo(() => markElements().length)

  const applyHighlights = () => {
    const container = props.scrollContainer()
    clearHighlights(container)
    const q = query().trim()
    if (!q || !container) {
      setMarkElements([])
      return
    }
    const marks = highlightTextInContainer(container, q)
    setMarkElements(marks)
  }

  const setActiveHighlight = (index: number) => {
    const marks = markElements()
    marks.forEach((m) => m.classList.remove(ACTIVE_HIGHLIGHT_CLASS))
    if (marks[index]) {
      marks[index].classList.add(ACTIVE_HIGHLIGHT_CLASS)
    }
  }

  const scrollToMatch = (index: number) => {
    const marks = markElements()
    const container = props.scrollContainer()
    if (marks[index] && container) {
      setActiveHighlight(index)
      scrollContainerToElement(container, marks[index])
    }
  }

  const goNext = () => {
    const count = matchCount()
    if (count === 0) return
    const next = (currentIndex() + 1) % count
    setCurrentIndex(next)
    scrollToMatch(next)
  }

  const goPrev = () => {
    const count = matchCount()
    if (count === 0) return
    const next = (currentIndex() - 1 + count) % count
    setCurrentIndex(next)
    scrollToMatch(next)
  }

  createEffect(on(query, () => {
    setCurrentIndex(0)
    applyHighlights()
  }, { defer: true }))

  createEffect(() => {
    if (query().trim() && markElements().length > 0) {
      scrollToMatch(0)
    }
  })

  onMount(() => {
    setTimeout(() => inputRef?.focus(), 30)
  })

  onCleanup(() => {
    clearHighlights(props.scrollContainer())
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
      class="chat-search-bar absolute right-3 top-2 z-[70] flex items-center gap-1.5 rounded-xl border border-border-weak-base bg-surface-raised-base/95 px-2.5 py-1.5 shadow-xl backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
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
        class="flex size-6 items-center justify-center rounded-sm text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong disabled:opacity-40"
        onClick={(e) => { e.stopPropagation(); goPrev() }}
        disabled={matchCount() === 0}
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
      >
        <ArrowUp class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-sm text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong disabled:opacity-40"
        onClick={(e) => { e.stopPropagation(); goNext() }}
        disabled={matchCount() === 0}
        title="Next match (Enter)"
        aria-label="Next match"
      >
        <ArrowDown class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        class="flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
        onClick={(e) => { e.stopPropagation(); props.onClose() }}
        title="Close (Escape)"
        aria-label="Close search"
      >
        <X size={14} />
      </button>
    </div>
  )
}
