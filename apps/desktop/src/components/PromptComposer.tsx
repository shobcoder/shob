import { createSignal, Show } from 'solid-js'
import { Send, CornerDownLeft, Plus, Globe } from 'lucide-solid'
import { createGithubPill, parseTextWithGithubLinks } from '../shob-ported/prompt-input/github-pill'

interface PromptComposerProps {
  onSubmit: (text: string) => void
  placeholder?: string
  disabled?: boolean
}

export function PromptComposer(props: PromptComposerProps) {
  const [text, setText] = createSignal('')
  const [isFocused, setIsFocused] = createSignal(false)
  let editorRef: HTMLDivElement | undefined



  const parseFromDOM = (): string => {
    if (!editorRef) return ""
    let buffer = ""
    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        buffer += node.textContent ?? ""
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const el = node as HTMLElement
      if (el.dataset.type === "github-link") {
        buffer += el.dataset.url ?? ""
        return
      }
      if (el.tagName === "BR") {
        buffer += "\n"
        return
      }
      for (const child of Array.from(el.childNodes)) {
        visit(child)
      }
    }
    Array.from(editorRef.childNodes).forEach((child) => {
      visit(child)
    })
    return buffer
  }

  const handleInput = () => {
    setText(parseFromDOM())
  }

  const handleSubmit = () => {
    const value = text().trim()
    if (!value || props.disabled) return
    props.onSubmit(value)
    setText('')
    if (editorRef) {
      editorRef.innerHTML = ''
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handlePaste = (e: ClipboardEvent) => {
    const clipboardData = e.clipboardData
    if (!clipboardData) return

    const plainText = clipboardData.getData("text/plain") ?? ""
    if (!plainText) return

    e.preventDefault()
    e.stopPropagation()

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!editorRef?.contains(range.startContainer)) return

    const fragment = parseTextWithGithubLinks(plainText)
    const last = fragment.lastChild
    range.deleteContents()
    range.insertNode(fragment)

    if (last) {
      range.setStartAfter(last)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    handleInput()
  }

  const hasText = () => text().trim().length > 0

  return (
    <div
      class="prompt-shell"
      data-focused={isFocused()}
      data-has-text={hasText()}
    >
      <div
        ref={editorRef}
        class="prompt-input"
        classList={{
          "w-full focus:outline-none whitespace-pre-wrap select-text": true,
        }}
        contenteditable={!props.disabled ? "true" : "false"}
        role="textbox"
        aria-multiline="true"
        aria-label={props.placeholder || "Message Agent..."}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      <Show when={!hasText()}>
        <div class="prompt-composer-placeholder">
          {props.placeholder || "Message Agent..."}
        </div>
      </Show>

      <div class="prompt-bar">
        <div class="prompt-actions-left">
          <button class="prompt-btn-icon" title="Attach File">
            <Plus size={15} />
          </button>
          <button class="prompt-btn-text" title="Add Context">
            <Globe size={13} />
            <span>Context</span>
          </button>
        </div>

        <div class="prompt-actions-right">
          <Show when={!hasText()}>
            <span class="prompt-hint">
              <CornerDownLeft size={11} />
              <span>Enter to send</span>
            </span>
          </Show>
          <button
            class="prompt-submit"
            onClick={handleSubmit}
            disabled={!hasText() || props.disabled}
            title="Send message"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
