import type { ComponentProps } from "solid-js"
import {
  MarkdownText,
  type MarkdownProps,
  type MarkdownCodeLabels,
  type MarkdownFileMentions,
} from "./markdown/MarkdownText"

export type { MarkdownCodeLabels, MarkdownFileMentions, MarkdownProps }

export interface MarkdownComponentProps extends ComponentProps<"div"> {
  text: string
  cacheKey?: string
  streaming?: boolean
  class?: string
  className?: string
  classList?: Record<string, boolean>
  codeLabels?: MarkdownCodeLabels
  fileMentions?: MarkdownFileMentions
}

export function Markdown(props: MarkdownComponentProps) {
  return (
    <MarkdownText
      text={props.text}
      streaming={props.streaming}
      cacheKey={props.cacheKey}
      class={props.class}
      className={props.className}
      codeLabels={props.codeLabels}
      fileMentions={props.fileMentions}
    />
  )
}

export { MarkdownText }
export { CodeBlock } from "./markdown/CodeBlock"
export { extractMarkdownPlainText } from "./markdown/plain-text"
export { parseGfm, parseGfmWithMath } from "./markdown/parse"
export { IncrementalMarkdownParser } from "./markdown/incremental"
export { highlightToHtml, highlightLines, subscribeGrammarLoaded, grammarLoadCount } from "./markdown/highlight"
export { renderTexToHtml } from "./markdown/katex"
export { cjkFriendlyStrong } from "./markdown/cjkFriendlyStrong"
export { mathCompatibility } from "./markdown/mathCompatibility"
