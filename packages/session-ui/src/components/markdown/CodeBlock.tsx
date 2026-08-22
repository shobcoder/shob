import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { clsx } from "clsx"
import { grammarLoadCount, highlightToHtml, subscribeGrammarLoaded } from "./highlight"

export interface CodeBlockProps {
  /** The source text, rendered verbatim (trailing newline trimmed for display). */
  code: string
  /** Grammar hint (markdown fence info string or a fixed caller id); unknown = plain. */
  lang?: string | undefined
  /** Extra class merged onto the wrapper. */
  class?: string | undefined
  /** Copy-button idle label. */
  copyLabel?: string | undefined
  /** Copy-button label during the post-copy confirmation window. */
  copiedLabel?: string | undefined
}

async function writeClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function CodeBlock(props: CodeBlockProps) {
  const trimmed = () => (props.code.endsWith("\n") ? props.code.slice(0, -1) : props.code)

  const [grammarRevision, setGrammarRevision] = createSignal(grammarLoadCount())

  const unsubscribe = subscribeGrammarLoaded(() => {
    setGrammarRevision(grammarLoadCount())
  })
  onCleanup(unsubscribe)

  const html = createMemo(() => {
    // Reading grammarRevision creates a reactive dependency when lazy grammar finishes loading
    grammarRevision()
    return highlightToHtml(trimmed(), props.lang)
  })

  const [copied, setCopied] = createSignal(false)
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })

  const onCopy = async () => {
    if (copied()) return
    const ok = await writeClipboard(trimmed())
    if (!ok) return
    setCopied(true)
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      setCopied(false)
    }, 1000)
  }

  const copyText = () => props.copyLabel ?? "Copy"
  const copiedText = () => props.copiedLabel ?? "Copied"

  return (
    <div class={clsx("md-code-block", props.class)}>
      <div class="md-code-banner-wrap">
        <div class="md-code-banner">
          <div class="md-code-infostring">{props.lang ?? ""}</div>
          <div class="md-code-action">
            <button
              type="button"
              class="md-code-copy-button"
              onClick={onCopy}
              data-copied={copied() ? "true" : undefined}
            >
              {copied() ? copiedText() : copyText()}
            </button>
          </div>
        </div>
      </div>
      <Show
        when={html()}
        fallback={
          <pre class="md-code-plain">
            <code>{trimmed()}</code>
          </pre>
        }
      >
        {(highlighted) => <div innerHTML={highlighted()} />}
      </Show>
    </div>
  )
}
