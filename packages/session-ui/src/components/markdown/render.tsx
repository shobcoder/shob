/**
 * Direct mdast -> SolidJS markdown renderer.
 * Pinned byte-for-byte in structure with DeepSeek Harness:
 * - Table alignment mapped to styles.
 * - 4+ columns table wide scrolling mode.
 * - Tight-list paragraph unwrapping.
 * - Task list checkboxes.
 * - Safe external link attribute policies.
 * - Absolute HTTP(S) image policy with fallback to alt text.
 * - Raw HTML rendered as inert literal text.
 * - TeX math via KaTeX with 3-arm error fallback.
 * - Inline code HTTP(S) URL promotion & file mentions.
 * - Footnote section with back-references.
 */

import { type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { clsx } from "clsx"
import type * as Md from "mdast"
import { normalizeUri } from "micromark-util-sanitize-uri"
import { CodeBlock } from "./CodeBlock"
import { renderTexToHtml } from "./katex"
import type { PositionedBlock } from "./incremental"

export interface MarkdownCodeLabels {
  copyLabel?: string | undefined
  copiedLabel?: string | undefined
}

export interface MarkdownFileMentions {
  resolve(value: string): { open: () => void; label: string; title: string } | undefined
}

export interface ReferenceTargets {
  definitions: Map<string, Md.Definition>
  footnotes: Map<string, Md.FootnoteDefinition>
}

export function createReferenceTargets(): ReferenceTargets {
  return { definitions: new Map(), footnotes: new Map() }
}

export function collectReferenceTargets(
  nodes: readonly Md.RootContent[],
  targets: ReferenceTargets,
): void {
  for (const node of nodes) {
    if (node.type === "definition") {
      const id = node.identifier.toUpperCase()
      if (!targets.definitions.has(id)) targets.definitions.set(id, node)
    } else if (node.type === "footnoteDefinition") {
      const id = node.identifier.toUpperCase()
      if (!targets.footnotes.has(id)) targets.footnotes.set(id, node)
    }
    if ("children" in node && Array.isArray((node as { children?: unknown }).children)) {
      collectReferenceTargets((node as { children: Md.RootContent[] }).children, targets)
    }
  }
}

export interface MarkdownRenderContext {
  readonly streaming: boolean
  readonly codeLabels: MarkdownCodeLabels | undefined
  readonly inBlockquote?: boolean
  readonly fileMentions: MarkdownFileMentions | undefined
  readonly inLink?: boolean
  readonly targets: ReferenceTargets
  readonly footnoteOrder: string[]
  readonly footnoteCounts: Map<string, number>
}

function sanitizeUrl(url: string): string {
  try {
    switch (new URL(url).protocol) {
      case "http:":
      case "https:":
      case "mailto:":
        return url
      default:
        return ""
    }
  } catch {
    return ""
  }
}

function remoteImageUrl(url: string): string | undefined {
  try {
    const protocol = new URL(url).protocol
    return protocol === "http:" || protocol === "https:" ? url : undefined
  } catch {
    return undefined
  }
}

function inlineCodeHttpUrl(value: string): string | undefined {
  if (value.trim() !== value) return undefined
  try {
    const protocol = new URL(value).protocol
    return protocol === "http:" || protocol === "https:" ? value : undefined
  } catch {
    return undefined
  }
}

export function wrapBlockChildren(elements: readonly JSX.Element[], edges: boolean): JSX.Element[] {
  const wrapped: JSX.Element[] = []
  for (const element of elements) {
    if (edges || wrapped.length > 0) wrapped.push("\n")
    wrapped.push(element)
  }
  if (edges && elements.length > 0) wrapped.push("\n")
  return wrapped
}

type BlockEntry = { paragraph: JSX.Element[] } | { element: JSX.Element }

function renderBlockEntries(
  blocks: readonly Md.RootContent[],
  context: MarkdownRenderContext,
): BlockEntry[] {
  const entries: BlockEntry[] = []
  for (const block of blocks) {
    if (block.type === "paragraph") {
      entries.push({ paragraph: renderChildren(block.children, context) })
    } else {
      const element = renderNode(block, context)
      if (element !== null) entries.push({ element })
    }
  }
  return entries
}

function renderChildren(
  nodes: readonly Md.RootContent[],
  context: MarkdownRenderContext,
): JSX.Element[] {
  return nodes.map((node) => renderNode(node, context))
}

export function renderBlocks(
  blocks: readonly PositionedBlock[],
  context: MarkdownRenderContext,
): JSX.Element[] {
  return blocks
    .map((block) => renderNode(block.node, context))
    .filter((element) => element !== null)
}

function renderNode(node: Md.RootContent, context: MarkdownRenderContext): JSX.Element {
  switch (node.type) {
    case "text":
      return node.value
    case "paragraph":
      return <p>{renderChildren(node.children, context)}</p>
    case "heading": {
      const tag = `h${node.depth}`
      return <Dynamic component={tag}>{renderChildren(node.children, context)}</Dynamic>
    }
    case "blockquote":
      return (
        <blockquote>
          {wrapBlockChildren(
            renderChildren(node.children, { ...context, inBlockquote: true }).filter(
              (child) => child !== null,
            ),
            true,
          )}
        </blockquote>
      )
    case "thematicBreak":
      return <hr />
    case "break":
      return (
        <>
          <br />
          {"\n"}
        </>
      )
    case "strong":
      return <strong>{renderChildren(node.children, context)}</strong>
    case "emphasis":
      return <em>{renderChildren(node.children, context)}</em>
    case "delete":
      return <del>{renderChildren(node.children, context)}</del>
    case "inlineCode": {
      const value = node.value.replace(/\r?\n|\r/g, " ")
      const href = inlineCodeHttpUrl(value)
      if (href !== undefined) {
        return <code>{renderSafeLink(href, [value])}</code>
      }
      const mention = context.inLink === true ? undefined : context.fileMentions?.resolve(value)
      if (mention !== undefined) {
        return (
          <code>
            <button
              type="button"
              class="md-file-mention"
              title={mention.title}
              aria-label={mention.label}
              onClick={mention.open}
            >
              {value}
            </button>
          </code>
        )
      }
      return <code>{value}</code>
    }
    case "html":
      return node.value
    case "code":
      return renderCode(node, context)
    case "math":
      return (
        <div
          class="katex-display"
          innerHTML={renderTexToHtml(node.value, true)}
        />
      )
    case "inlineMath":
      return <span innerHTML={renderTexToHtml(node.value, false)} />
    case "list":
      return renderList(node, context)
    case "listItem":
      return renderListItem(node, listItemLoose(node), context)
    case "table":
      return renderTable(node, context)
    case "link":
      return renderAnchor(node.url, renderChildren(node.children, { ...context, inLink: true }))
    case "linkReference":
      return renderLinkReference(node, context)
    case "image":
      return renderImage(node.url, node.alt ?? "")
    case "imageReference":
      return renderImageReference(node, context)
    case "footnoteReference":
      return renderFootnoteReference(node, context)
    case "definition":
    case "footnoteDefinition":
      return null
    default:
      return null
  }
}

function renderCode(node: Md.Code, context: MarkdownRenderContext): JSX.Element {
  const language = node.lang ?? undefined
  if (node.value === "") {
    return (
      <pre>
        <code class={language === undefined ? undefined : `language-${language}`} />
      </pre>
    )
  }
  const lang = language === undefined ? undefined : /^[\w-]+/.exec(language)?.[0]
  if (!context.streaming && lang === "math") {
    return (
      <div
        class="katex-display"
        innerHTML={renderTexToHtml(`${node.value}\n`, true)}
      />
    )
  }
  return (
    <CodeBlock
      code={`${node.value}\n`}
      lang={context.streaming ? undefined : lang}
      copyLabel={context.codeLabels?.copyLabel}
      copiedLabel={context.codeLabels?.copiedLabel}
    />
  )
}

function listLoose(list: Md.List): boolean {
  return (list.spread ?? false) || list.children.some(listItemLoose)
}

function listItemLoose(item: Md.ListItem): boolean {
  return (item.spread ?? false) || item.children.length > 1
}

function renderList(node: Md.List, context: MarkdownRenderContext): JSX.Element {
  const loose = listLoose(node)
  const isTaskList = node.children.some((item) => typeof item.checked === "boolean")
  const tag = node.ordered ? "ol" : "ul"
  const start = typeof node.start === "number" && node.start !== 1 ? node.start : undefined

  return (
    <Dynamic
      component={tag}
      start={start}
      class={isTaskList ? "contains-task-list" : undefined}
    >
      {node.children.map((item) => renderListItem(item, loose, context))}
    </Dynamic>
  )
}

function renderListItem(
  item: Md.ListItem,
  loose: boolean,
  context: MarkdownRenderContext,
): JSX.Element {
  const entries = renderBlockEntries(item.children, context)
  const task = typeof item.checked === "boolean"
  if (task) {
    const checkbox = <input type="checkbox" checked={item.checked === true} disabled />
    const head = entries[0]
    if (head !== undefined && "paragraph" in head) {
      head.paragraph = head.paragraph.length > 0 ? [checkbox, " ", ...head.paragraph] : [checkbox]
    } else {
      entries.unshift({ paragraph: [checkbox] })
    }
  }

  const parts: JSX.Element[] = []
  for (const [index, entry] of entries.entries()) {
    const isParagraph = "paragraph" in entry
    if (loose || index !== 0 || !isParagraph) parts.push("\n")
    if (!isParagraph) parts.push(entry.element)
    else if (loose) parts.push(<p>{entry.paragraph}</p>)
    else parts.push(<>{entry.paragraph}</>)
  }
  const tail = entries[entries.length - 1]
  if (tail !== undefined && (loose || !("paragraph" in tail))) parts.push("\n")
  return (
    <li class={task ? "task-list-item" : undefined}>
      {parts}
    </li>
  )
}

function renderTable(node: Md.Table, context: MarkdownRenderContext): JSX.Element {
  const align = node.align ?? null
  const [headRow, ...bodyRows] = node.children
  const columns = align === null ? headRow?.children.length ?? 0 : align.length
  const wide = columns >= 4 && context.inBlockquote !== true

  return (
    <div
      class={clsx("md-table-scroll", wide ? "md-table-wide" : "md-table-fill")}
      tabIndex={wide ? 0 : undefined}
    >
      <table>
        {headRow !== undefined && <thead>{renderTableRow(headRow, "th", align, context)}</thead>}
        {bodyRows.length > 0 && (
          <tbody>{bodyRows.map((row) => renderTableRow(row, "td", align, context))}</tbody>
        )}
      </table>
    </div>
  )
}

function renderTableRow(
  row: Md.TableRow,
  cellTag: "th" | "td",
  align: readonly Md.AlignType[] | null,
  context: MarkdownRenderContext,
): JSX.Element {
  const length = align === null ? row.children.length : align.length
  const cells: JSX.Element[] = []
  for (let index = 0; index < length; index++) {
    const cell = row.children[index]
    const alignValue = align?.[index]
    cells.push(
      <Dynamic
        component={cellTag}
        style={alignValue == null ? undefined : { "text-align": alignValue }}
      >
        {cell === undefined ? [] : renderChildren(cell.children, context)}
      </Dynamic>,
    )
  }
  return <tr>{cells}</tr>
}

function renderSafeLink(href: string, children: JSX.Element[]): JSX.Element {
  const safeHref = sanitizeUrl(href)
  if (safeHref === "") return <>{children}</>
  const external = ["http:", "https:"].includes(new URL(safeHref).protocol)
  return (
    <a
      href={safeHref}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  )
}

function renderAnchor(url: string, children: JSX.Element[]): JSX.Element {
  return renderSafeLink(normalizeUri(url), children)
}

function renderImage(url: string, alt: string): JSX.Element {
  const imageSrc = remoteImageUrl(sanitizeUrl(normalizeUri(url)))
  if (imageSrc === undefined) {
    return <span class="md-image-alt">{alt}</span>
  }
  return (
    <img
      class="md-image"
      src={imageSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  )
}

function referenceSuffix(node: Md.LinkReference | Md.ImageReference): string {
  if (node.referenceType === "collapsed") return "][]"
  if (node.referenceType === "full") return `][${node.label ?? node.identifier}]`
  return "]"
}

function renderLinkReference(
  node: Md.LinkReference,
  context: MarkdownRenderContext,
): JSX.Element {
  const definition = context.targets.definitions.get(node.identifier.toUpperCase())
  if (definition === undefined) {
    return (
      <>
        {"["}
        {renderChildren(node.children, context)}
        {referenceSuffix(node)}
      </>
    )
  }
  return renderAnchor(definition.url, renderChildren(node.children, { ...context, inLink: true }))
}

function renderImageReference(
  node: Md.ImageReference,
  context: MarkdownRenderContext,
): JSX.Element {
  const definition = context.targets.definitions.get(node.identifier.toUpperCase())
  if (definition === undefined) return `![${node.alt ?? ""}${referenceSuffix(node)}`
  return renderImage(definition.url, node.alt ?? "")
}

function renderFootnoteReference(
  node: Md.FootnoteReference,
  context: MarkdownRenderContext,
): JSX.Element {
  const id = node.identifier.toUpperCase()
  const seen = context.footnoteCounts.get(id)
  if (seen === undefined) context.footnoteOrder.push(id)
  context.footnoteCounts.set(id, (seen ?? 0) + 1)
  return <sup>{String(context.footnoteOrder.indexOf(id) + 1)}</sup>
}

export function renderFootnoteSection(context: MarkdownRenderContext): JSX.Element | null {
  const items: JSX.Element[] = []
  for (const id of context.footnoteOrder) {
    const definition = context.targets.footnotes.get(id)
    if (definition === undefined) continue
    const count = context.footnoteCounts.get(id) ?? 0
    const backrefs: JSX.Element[] = []
    for (let reference = 1; reference <= count; reference++) {
      if (backrefs.length > 0) backrefs.push(" ")
      backrefs.push("↩")
      if (reference > 1) backrefs.push(<sup>{String(reference)}</sup>)
    }
    const entries = renderBlockEntries(definition.children, context)
    const tail = entries[entries.length - 1]
    const body: JSX.Element[] = entries.map((entry) =>
      "paragraph" in entry ? (
        <p>
          {entry.paragraph}
          {entry === tail && (
            <>
              {" "}
              {backrefs}
            </>
          )}
        </p>
      ) : (
        entry.element
      ),
    )
    if (tail === undefined || !("paragraph" in tail)) body.push(...backrefs)
    items.push(
      <li id={`user-content-fn-${normalizeUri(id.toLowerCase())}`}>
        {wrapBlockChildren(body, true)}
      </li>,
    )
  }
  if (items.length === 0) return null
  return (
    <section data-footnotes class="footnotes">
      <h2 id="footnote-label" class="sr-only">
        Footnotes
      </h2>
      <ol>{items}</ol>
    </section>
  )
}
