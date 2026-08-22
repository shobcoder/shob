import { createMemo, type JSX } from "solid-js"
import { clsx } from "clsx"
import { IncrementalMarkdownParser } from "./incremental"
import { parseGfm, parseGfmWithMath } from "./parse"
import {
  collectReferenceTargets,
  createReferenceTargets,
  renderBlocks,
  renderFootnoteSection,
  wrapBlockChildren,
  type MarkdownCodeLabels,
  type MarkdownFileMentions,
  type MarkdownRenderContext,
  type ReferenceTargets,
} from "./render"

export type { MarkdownCodeLabels, MarkdownFileMentions } from "./render"

export interface MarkdownProps {
  text: string
  streaming?: boolean
  cacheKey?: string
  class?: string
  className?: string
  codeLabels?: MarkdownCodeLabels | undefined
  fileMentions?: MarkdownFileMentions | undefined
}

function renderSettled(
  text: string,
  codeLabels: MarkdownCodeLabels | undefined,
  fileMentions: MarkdownFileMentions | undefined,
): JSX.Element[] {
  const root = parseGfmWithMath(text)
  const targets = createReferenceTargets()
  collectReferenceTargets(root.children, targets)
  const context: MarkdownRenderContext = {
    streaming: false,
    codeLabels,
    fileMentions,
    targets,
    footnoteOrder: [],
    footnoteCounts: new Map(),
  }
  const blocks = wrapBlockChildren(
    renderBlocks(
      root.children.map((node, index) => ({ node, key: index })),
      context,
    ),
    false,
  )
  const section = renderFootnoteSection(context)
  return section === null ? blocks : [...blocks, "\n", section]
}

class StreamingRenderer {
  private readonly parser = new IncrementalMarkdownParser(parseGfm)
  private generation = -1
  private frozenCount = 0
  private frozenElements: JSX.Element[] = []
  private frozenTargets: ReferenceTargets = createReferenceTargets()
  private frozenFootnoteOrder: string[] = []
  private frozenFootnoteCounts = new Map<string, number>()
  private lastText: string | null = null
  private lastRendered: JSX.Element[] = []

  constructor(private readonly codeLabels: MarkdownCodeLabels | undefined) {}

  render(text: string): JSX.Element[] {
    if (text === this.lastText) return this.lastRendered
    const { frozen, tail, generation } = this.parser.update(text)
    if (generation !== this.generation) {
      this.generation = generation
      this.frozenCount = 0
      this.frozenElements = []
      this.frozenTargets = createReferenceTargets()
      this.frozenFootnoteOrder = []
      this.frozenFootnoteCounts = new Map()
    }
    const newlyFrozen = frozen.slice(this.frozenCount)
    collectReferenceTargets(
      newlyFrozen.map((block) => block.node),
      this.frozenTargets,
    )
    const frameTargets: ReferenceTargets = {
      definitions: new Map(this.frozenTargets.definitions),
      footnotes: new Map(this.frozenTargets.footnotes),
    }
    collectReferenceTargets(
      tail.map((block) => block.node),
      frameTargets,
    )
    if (newlyFrozen.length > 0) {
      const frozenContext: MarkdownRenderContext = {
        streaming: true,
        codeLabels: this.codeLabels,
        fileMentions: undefined,
        targets: frameTargets,
        footnoteOrder: this.frozenFootnoteOrder,
        footnoteCounts: this.frozenFootnoteCounts,
      }
      const batch = [...this.frozenElements]
      for (const element of renderBlocks(newlyFrozen, frozenContext)) {
        if (batch.length > 0) batch.push("\n")
        batch.push(element)
      }
      this.frozenElements = batch
      this.frozenCount = frozen.length
    }
    const tailContext: MarkdownRenderContext = {
      streaming: true,
      codeLabels: this.codeLabels,
      fileMentions: undefined,
      targets: frameTargets,
      footnoteOrder: [...this.frozenFootnoteOrder],
      footnoteCounts: new Map(this.frozenFootnoteCounts),
    }
    const children = [...this.frozenElements]
    for (const element of renderBlocks(tail, tailContext)) {
      if (children.length > 0) children.push("\n")
      children.push(element)
    }
    const section = renderFootnoteSection(tailContext)
    if (section !== null) children.push("\n", section)
    this.lastText = text
    this.lastRendered = children
    return this.lastRendered
  }
}

export function MarkdownText(props: MarkdownProps) {
  let streamRenderer: StreamingRenderer | null = null
  let streamLabels: MarkdownCodeLabels | undefined = props.codeLabels

  const children = createMemo(() => {
    const text = props.text ?? ""
    const streaming = props.streaming ?? false
    if (!streaming) {
      streamRenderer = null
      return renderSettled(text, props.codeLabels, props.fileMentions)
    }
    if (streamRenderer === null || streamLabels !== props.codeLabels) {
      streamRenderer = new StreamingRenderer(props.codeLabels)
      streamLabels = props.codeLabels
    }
    return streamRenderer.render(text)
  })

  return (
    <div
      class={clsx("markdown", props.class, props.className)}
      data-component="markdown"
    >
      {children()}
    </div>
  )
}
