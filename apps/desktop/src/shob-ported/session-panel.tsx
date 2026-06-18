import { createMemo, createResource, createSignal, For, Show, onCleanup, createEffect, Suspense } from "solid-js"
import { diffLines, type Change } from "diff"
import { ChevronDown, ChevronRight } from "lucide-solid"
import { FileIcon } from "@/components/ui/file-icon"
import { nativeApi } from "@/services/native"
import { Icon } from "@/components/ui/icon"
import FileTree from "@/components/FileTree"
import { ResizeHandle } from "@/shob-ported/resize-handle"

type DiffKind = "add" | "del" | "mix"
type DiffStats = { additions: number; deletions: number }
type DiffLine = {
  type: "info" | "add" | "del" | "normal"
  content: string
  oldLine: string
  newLine: string
}

type Props = {
  projectPath: string
  activeFile?: string | null
  openFiles?: string[]
  onSelectFile?: (file: string) => void
  onCloseFile?: (file: string) => void

  // Git / tree state props
  gitChangedFiles: () => string[]
  gitKinds: () => ReadonlyMap<string, DiffKind>
  gitStats: () => ReadonlyMap<string, DiffStats>
  gitUnavailable: () => boolean
  gitDiffLoading: () => boolean
  gitDiffError: () => string | null
  isFileTreeVisible: () => boolean
}

const toPosix = (value: string) => value.replace(/\\/g, "/").replace(/\/+/g, "/")

const filename = (path: string) => path.split("/").filter(Boolean).at(-1) ?? path

const absolutePath = (root: string, file: string) => {
  const base = toPosix(root).replace(/\/+$/, "")
  const rel = toPosix(file).replace(/^\/+/, "")
  return `${base}/${rel}`
}

const tokenClass = (token: string) => {
  if (/^(import|from|export|default|function|return|const|let|var|if|else|for|while|class|type|interface)$/.test(token)) {
    return "text-[var(--chart-4)]"
  }
  if (/^['"`].*['"`]$/.test(token)) return "text-[var(--chart-5)]"
  if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) return "text-[var(--chart-3)]"
  if (/^[0-9]+$/.test(token)) return "text-[var(--chart-4)]"
  return "text-foreground"
}

function CodeLine(props: { line: string; index: number }) {
  const parts = createMemo(() => props.line.split(/(\s+|[{}()[\];,.<>/=:+*-])/g).filter((part) => part.length > 0))
  return (
    <div class="grid min-h-[24px] grid-cols-[56px_minmax(0,1fr)] gap-4 text-[12px] leading-6 font-mono">
      <div class="select-none text-right text-muted-foreground">{props.index + 1}</div>
      <pre class="m-0 whitespace-pre-wrap break-words text-foreground">
        <For each={parts()}>{(part) => <span class={/\s+/.test(part) ? "" : tokenClass(part)}>{part}</span>}</For>
      </pre>
    </div>
  )
}

function CodeText(props: { line: string }) {
  const parts = createMemo(() => props.line.split(/(\s+|[{}()[\];,.<>/=:+*-])/g).filter((part) => part.length > 0))
  return (
    <pre class="m-0 whitespace-pre-wrap break-words">
      <For each={parts()}>{(part) => <span class={/\s+/.test(part) ? "" : tokenClass(part)}>{part}</span>}</For>
    </pre>
  )
}

const splitChunkLines = (value: string) => {
  const lines = value.split(/\r?\n/)
  if (value.endsWith("\n") || value.endsWith("\r\n")) lines.pop()
  return lines
}

const OVERVIEW_CONTEXT_LINES = 3
const lockfilePattern = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock)$/

const buildOverviewDiffLines = (chunks: Change[]): DiffLine[] => {
  let oldLine = 1
  let newLine = 1
  const rows: DiffLine[] = []

  for (const chunk of chunks) {
    for (const line of splitChunkLines(chunk.value)) {
      if (chunk.added) {
        rows.push({ type: "add", content: line, oldLine: "", newLine: String(newLine++) })
      } else if (chunk.removed) {
        rows.push({ type: "del", content: line, oldLine: String(oldLine++), newLine: "" })
      } else {
        rows.push({ type: "normal", content: line, oldLine: String(oldLine++), newLine: String(newLine++) })
      }
    }
  }

  const changedIndexes = rows
    .map((row, index) => row.type === "add" || row.type === "del" ? index : -1)
    .filter((index) => index >= 0)
  if (changedIndexes.length === 0) return []

  const segments: Array<{ start: number; end: number }> = []
  for (const index of changedIndexes) {
    const start = Math.max(0, index - OVERVIEW_CONTEXT_LINES)
    const end = Math.min(rows.length - 1, index + OVERVIEW_CONTEXT_LINES)
    const last = segments.at(-1)
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end)
    } else {
      segments.push({ start, end })
    }
  }

  return segments.flatMap((segment) => {
    const segmentRows = rows.slice(segment.start, segment.end + 1)
    const oldLines = segmentRows.map((row) => Number(row.oldLine)).filter((line) => Number.isFinite(line) && line > 0)
    const newLines = segmentRows.map((row) => Number(row.newLine)).filter((line) => Number.isFinite(line) && line > 0)
    const oldStart = oldLines[0] ?? 0
    const newStart = newLines[0] ?? 0
    const oldCount = oldLines.length
    const newCount = newLines.length

    return [
      {
        type: "info" as const,
        oldLine: "",
        newLine: "",
        content: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      },
      ...segmentRows,
    ]
  })
}

function UnifiedDiff(props: { chunks: Change[] }) {
  let oldLine = 1
  let newLine = 1

  return (
    <div class="py-4">
      <For each={props.chunks}>
        {(chunk) => {
          const lines = splitChunkLines(chunk.value)
          const kind = chunk.added ? "added" : chunk.removed ? "removed" : "context"

          return (
            <For each={lines}>
              {(line) => {
                const currentOld = chunk.added ? "" : oldLine++
                const currentNew = chunk.removed ? "" : newLine++
                const prefix = chunk.added ? "+" : chunk.removed ? "-" : " "

                return (
                  <div
                    class="grid min-h-[24px] grid-cols-[44px_44px_24px_minmax(0,1fr)] text-[12px] leading-6 font-mono"
                    style={{
                      "background-color": kind === "added"
                        ? "color-mix(in oklch, var(--icon-diff-add-base) 14%, transparent)"
                        : kind === "removed"
                          ? "color-mix(in oklch, var(--icon-diff-delete-base) 14%, transparent)"
                          : "transparent",
                    }}
                  >
                    <div class="select-none pr-2 text-right text-muted-foreground">{currentOld}</div>
                    <div class="select-none pr-2 text-right text-muted-foreground">{currentNew}</div>
                    <div
                      class="select-none text-center"
                      classList={{
                        "text-[var(--icon-diff-add-base)]": kind === "added",
                        "text-[var(--icon-diff-delete-base)]": kind === "removed",
                        "text-muted-foreground": kind === "context",
                      }}
                    >
                      {prefix}
                    </div>
                    <CodeText line={line} />
                  </div>
                )
              }}
            </For>
          )
        }}
      </For>
    </div>
  )
}

function SplitDiff(props: { chunks: Change[] }) {
  const leftLines: { text: string; type: "context" | "removed" | "empty"; num: number | "" }[] = []
  const rightLines: { text: string; type: "context" | "added" | "empty"; num: number | "" }[] = []

  let oldLine = 1
  let newLine = 1

  for (let i = 0; i < props.chunks.length; i++) {
    const chunk = props.chunks[i]
    const nextChunk = props.chunks[i + 1]

    if (chunk.removed && nextChunk && nextChunk.added) {
      const delLines = splitChunkLines(chunk.value)
      const addLines = splitChunkLines(nextChunk.value)
      const maxLen = Math.max(delLines.length, addLines.length)

      for (let j = 0; j < maxLen; j++) {
        if (j < delLines.length) {
          leftLines.push({ text: delLines[j], type: "removed", num: oldLine++ })
        } else {
          leftLines.push({ text: "", type: "empty", num: "" })
        }

        if (j < addLines.length) {
          rightLines.push({ text: addLines[j], type: "added", num: newLine++ })
        } else {
          rightLines.push({ text: "", type: "empty", num: "" })
        }
      }
      i++
    } else if (chunk.added && nextChunk && nextChunk.removed) {
      const addLines = splitChunkLines(chunk.value)
      const delLines = splitChunkLines(nextChunk.value)
      const maxLen = Math.max(addLines.length, delLines.length)

      for (let j = 0; j < maxLen; j++) {
        if (j < delLines.length) {
          leftLines.push({ text: delLines[j], type: "removed", num: oldLine++ })
        } else {
          leftLines.push({ text: "", type: "empty", num: "" })
        }

        if (j < addLines.length) {
          rightLines.push({ text: addLines[j], type: "added", num: newLine++ })
        } else {
          rightLines.push({ text: "", type: "empty", num: "" })
        }
      }
      i++
    } else {
      const lines = splitChunkLines(chunk.value)
      const kind = chunk.added ? "added" : chunk.removed ? "removed" : "context"

      for (const line of lines) {
        if (kind === "context") {
          leftLines.push({ text: line, type: "context", num: oldLine++ })
          rightLines.push({ text: line, type: "context", num: newLine++ })
        } else if (kind === "removed") {
          leftLines.push({ text: line, type: "removed", num: oldLine++ })
          rightLines.push({ text: "", type: "empty", num: "" })
        } else {
          leftLines.push({ text: "", type: "empty", num: "" })
          rightLines.push({ text: line, type: "added", num: newLine++ })
        }
      }
    }
  }

  return (
    <div class="grid grid-cols-2 gap-0 border-t border-border/60 bg-background/50 h-full divide-x divide-border/60">
      <div class="overflow-y-auto overflow-x-auto min-h-0 flex-1 py-4">
        <For each={leftLines}>
          {(line) => (
            <div
              class="grid min-h-[24px] grid-cols-[44px_minmax(0,1fr)] text-[12px] leading-6 font-mono w-full"
              style={{
                "background-color": line.type === "removed"
                  ? "color-mix(in oklch, var(--icon-diff-delete-base) 14%, transparent)"
                  : "transparent",
              }}
            >
              <div class="select-none pr-3 text-right text-muted-foreground border-r border-border/10">{line.num}</div>
              <div class="pl-3 truncate w-full">
                <Show when={line.type !== "empty"}>
                  <CodeText line={line.text} />
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="overflow-y-auto overflow-x-auto min-h-0 flex-1 py-4">
        <For each={rightLines}>
          {(line) => (
            <div
              class="grid min-h-[24px] grid-cols-[44px_minmax(0,1fr)] text-[12px] leading-6 font-mono w-full"
              style={{
                "background-color": line.type === "added"
                  ? "color-mix(in oklch, var(--icon-diff-add-base) 14%, transparent)"
                  : "transparent",
              }}
            >
              <div class="select-none pr-3 text-right text-muted-foreground border-r border-border/10">{line.num}</div>
              <div class="pl-3 truncate w-full">
                <Show when={line.type !== "empty"}>
                  <CodeText line={line.text} />
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export function ShobSessionPanel(props: Props) {
  const file = createMemo(() => props.activeFile ?? "")
  const openFiles = createMemo(() => props.openFiles ?? (file() ? [file()] : []))
  
  const [activeTreeTab, setActiveTreeTab] = createSignal<"changes" | "all">("changes")
  const [dropdownOpen, setDropdownOpen] = createSignal(false)
  const [diffStyle, setDiffStyle] = createSignal<"unified" | "split">("unified")
  const [treeWidth, setTreeWidth] = createSignal(280)
  const [showOverview, setShowOverview] = createSignal(true)
  const [expandedDiffs, setExpandedDiffs] = createSignal<Record<string, boolean>>({})

  const overviewFiles = createMemo(() => {
    const changed = props.gitChangedFiles()
    if (changed.length > 0) return changed

    const fallback = [file(), ...openFiles()].filter((value): value is string => Boolean(value))
    return [...new Set(fallback)]
  })

  const [preview] = createResource(
    () => (props.projectPath && file() ? { path: absolutePath(props.projectPath, file()), file: file() } : null),
    async (input) => {
      if (!input) return { before: "", after: "", chunks: [] as Change[] }
      const [before, after] = await Promise.all([
        nativeApi.invoke("get_git_file_base", { path: input.path }).catch(() => "") as Promise<string>,
        nativeApi.invoke("read_text_file", { path: input.path }).catch(() => "") as Promise<string>,
      ])
      const chunks = diffLines(before ?? "", after ?? "")
      return { before: before ?? "", after: after ?? "", chunks }
    },
  )

  const lines = createMemo(() => String(preview()?.after ?? "").split(/\r?\n/))
  const hasDiff = createMemo(() => {
    const data = preview()
    return Boolean(data && data.before !== data.after)
  })

  const [overviewDiffs] = createResource(
    () => ({ projectPath: props.projectPath, files: overviewFiles() }),
    async (input) => {
      const entries = await Promise.all(
        input.files.map(async (relativePath) => {
          const abs = absolutePath(input.projectPath, relativePath)
          const [before, after] = await Promise.all([
            nativeApi.invoke("get_git_file_base", { path: abs }).catch(() => "") as Promise<string>,
            nativeApi.invoke("read_text_file", { path: abs }).catch(() => "") as Promise<string>,
          ])
          return [relativePath, buildOverviewDiffLines(diffLines(before ?? "", after ?? ""))] as const
        }),
      )
      return new Map(entries)
    },
  )

  createEffect(() => {
    const expanded = expandedDiffs()
    if (Object.keys(expanded).length > 0) return
    const files = overviewFiles()
    const first = files.find((path) => !lockfilePattern.test(path)) ?? files[0]
    if (!first) return
    setExpandedDiffs({ [first]: true })
  })

  const toggleOverviewDiff = (filePath: string) => {
    setExpandedDiffs((current) => ({ ...current, [filePath]: !current[filePath] }))
  }

  // Document listener to close custom dropdown
  createEffect(() => {
    if (!dropdownOpen()) return
    const handler = () => setDropdownOpen(false)
    document.addEventListener("click", handler)
    onCleanup(() => document.removeEventListener("click", handler))
  })

  const clampTreeWidth = (value: number) => Math.max(180, Math.min(480, value))

  let panelRef: HTMLDivElement | undefined

  return (
    <div ref={panelRef} class="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      {/* 1. Chrome-style Tab Bar */}
      <div class="h-[40px] shrink-0 border-b border-border/60 bg-[#0e0e0e]/30 dark:bg-muted/15 flex items-center px-3 justify-between select-none">
        <div class="flex items-center gap-1.5 overflow-x-auto overflow-y-hidden py-1 hide-scrollbar">
          {/* Permanent Changes Tab */}
          <button
            type="button"
            onClick={() => setShowOverview(true)}
            class="flex h-[28px] items-center gap-2 rounded-md border px-2.5 text-[11px] font-bold transition-all shadow-none"
            classList={{
              "bg-background border-border/80 text-foreground shadow-sm": showOverview(),
              "border-transparent bg-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground": !showOverview(),
            }}
          >
            <Icon name="review" size="small" class="size-3.5" classList={{ "text-primary/95": showOverview(), "text-muted-foreground": !showOverview() }} />
            <span>{overviewFiles().length} {overviewFiles().length === 1 ? "Change" : "Changes"}</span>
          </button>

          {/* Opened File Tabs */}
          <For each={openFiles()}>
            {(path) => {
              const active = createMemo(() => path === file())
              return (
                <div
                  class="group relative flex h-[28px] max-w-[150px] shrink-0 items-center gap-1 rounded-md px-2 text-left text-[11px] font-bold transition-all border"
                  classList={{
                    "bg-background border-border/80 text-foreground shadow-sm": active(),
                    "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground": !active(),
                  }}
                  title={path}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowOverview(false)
                      props.onSelectFile?.(path)
                    }}
                    class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <FileIcon node={{ path, type: "file" }} class="size-3.5 shrink-0" />
                    <span class="min-w-0 truncate">{filename(path)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onCloseFile?.(path)
                    }}
                    class="flex size-3.5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-opacity"
                    aria-label={`Close ${filename(path)}`}
                  >
                    <Icon name="close-small" size="small" class="size-2.5" />
                  </button>
                </div>
              )
            }}
          </For>

          {/* Plus Button */}
          <button
            type="button"
            class="flex size-6 items-center justify-center rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors ml-0.5"
            title="Create new change session"
          >
            <Icon name="plus-small" size="small" class="size-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Side-by-Side Content Section containing split sub-headers and body lists */}
      <div class="flex flex-1 min-h-0 w-full relative">
        {/* Left Column: File Tree */}
        <Show when={props.isFileTreeVisible()}>
          <div
            class="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-border/60 bg-muted/10 text-foreground"
            style={{ width: `${treeWidth()}px` }}
          >
            {/* Left Sub-header: Selector */}
            <div class="h-[40px] shrink-0 border-b border-border/60 bg-background flex items-center px-3 justify-between select-none">
              <div class="relative flex items-center">
                <button
                  type="button"
                  class="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-accent/60 transition-colors text-xs font-bold text-foreground/90 select-none"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDropdownOpen(!dropdownOpen())
                  }}
                >
                  <Icon name="folder" size="small" class="text-muted-foreground size-3.5" />
                  <span>{activeTreeTab() === "changes" ? "Git changes" : "All files"}</span>
                  <Icon name="chevron-down" size="small" class="text-muted-foreground size-3" />
                </button>

                <Show when={dropdownOpen()}>
                  <div class="absolute top-full left-0 z-50 mt-1 min-w-[150px] rounded-lg border border-border bg-popover py-1 shadow-lg animate-in fade-in duration-100">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-accent hover:text-accent-foreground"
                      classList={{ "bg-accent/40 text-foreground": activeTreeTab() === "changes" }}
                      onClick={() => setActiveTreeTab("changes")}
                    >
                      <span>Git changes</span>
                    </button>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-accent hover:text-accent-foreground"
                      classList={{ "bg-accent/40 text-foreground": activeTreeTab() === "all" }}
                      onClick={() => setActiveTreeTab("all")}
                    >
                      <span>All files</span>
                    </button>
                  </div>
                </Show>
              </div>
            </div>

            {/* Tree content list */}
            <div class="flex-1 overflow-auto p-2">
              <Show when={props.gitUnavailable()}>
                <div class="px-3 py-2 mb-2 rounded border border-amber-500/20 text-xs text-amber-500 bg-amber-500/5 leading-relaxed">
                  Git is not initialized for this project.
                </div>
              </Show>
              
              <Suspense fallback={<div class="px-2 py-2 text-xs text-muted-foreground">Loading tree...</div>}>
                <Show when={activeTreeTab() === "changes"}>
                  <Show
                    when={props.gitChangedFiles().length > 0}
                    fallback={<div class="px-3 py-3 text-xs text-muted-foreground text-center">No changed files</div>}
                  >
                    <FileTree
                      path=""
                      class="group/filetree"
                      allowed={props.gitChangedFiles()}
                      kinds={props.gitKinds()}
                      stats={props.gitStats()}
                      draggable={false}
                      active={file() ?? undefined}
                      onFileClick={(fileNode) => {
                        setShowOverview(false)
                        props.onSelectFile?.(fileNode?.path ?? "")
                      }}
                    />
                  </Show>
                </Show>

                <Show when={activeTreeTab() === "all"}>
                  <FileTree
                    path=""
                    class="group/filetree"
                    modified={props.gitChangedFiles()}
                    kinds={props.gitKinds()}
                    stats={props.gitStats()}
                    active={file() ?? undefined}
                    onFileClick={(fileNode) => {
                      setShowOverview(false)
                      props.onSelectFile?.(fileNode?.path ?? "")
                    }}
                  />
                </Show>
              </Suspense>
            </div>

            <ResizeHandle
              edge="end"
              onResize={(clientX) => {
                const panelLeft = panelRef ? panelRef.getBoundingClientRect().left : 0
                setTreeWidth(clampTreeWidth(clientX - panelLeft))
              }}
            />
          </div>
        </Show>

        {/* Right Column: Diff/Preview */}
        <section class="flex flex-1 min-w-0 flex-col overflow-hidden bg-background text-foreground">
          {/* Right Sub-header */}
          <div class="h-[40px] shrink-0 border-b border-border/60 bg-background flex items-center justify-between px-4 select-none">
            {/* Left Side: Title */}
            <div class="text-xs font-bold text-foreground flex items-center gap-2 truncate">
              <Show when={!showOverview() && file()} fallback="Changes Overview">
                <span class="text-muted-foreground/60 font-medium">Preview:</span>
                <span class="truncate">{filename(file())}</span>
              </Show>
            </div>

            {/* Right Side: Diff switch triggers */}
            <div class="flex items-center gap-3">
              <div class="flex items-center bg-muted/40 p-0.5 rounded-lg border border-border/40 h-[28px]">
                <button
                  type="button"
                  class="px-2.5 h-full flex items-center rounded-md text-[11px] font-bold transition-all shadow-none"
                  classList={{
                    "bg-background text-foreground shadow-sm": diffStyle() === "unified",
                    "text-muted-foreground hover:text-foreground": diffStyle() !== "unified"
                  }}
                  onClick={() => setDiffStyle("unified")}
                >
                  Unified
                </button>
                <button
                  type="button"
                  class="px-2.5 h-full flex items-center rounded-md text-[11px] font-bold transition-all shadow-none"
                  classList={{
                    "bg-background text-foreground shadow-sm": diffStyle() === "split",
                    "text-muted-foreground hover:text-foreground": diffStyle() !== "split"
                  }}
                  onClick={() => setDiffStyle("split")}
                >
                  Split
                </button>
              </div>
            </div>
          </div>

          {/* Core Content Area */}
          <div class="min-h-0 flex-1 overflow-auto bg-background/40">
            <Show
              when={!showOverview() && file()}
              fallback={
                <Show
                  when={overviewFiles().length > 0}
                  fallback={
                    <div class="flex h-full flex-col items-center justify-center p-8 text-center">
                      <Icon name="circle-check" size="large" class="text-muted-foreground/60 mb-2" />
                      <div class="text-sm font-semibold text-foreground">No Git Changes</div>
                      <div class="text-xs text-muted-foreground mt-1 max-w-[280px]">Your files match the repository's git base branch.</div>
                    </div>
                  }
                >
                  {/* Changed Files Grid Overview */}
                  <div class="h-full overflow-y-auto p-5 thin-scrollbar">
                    <div class="max-w-[760px] overflow-hidden rounded-lg border border-border/80 bg-background shadow-sm">
                      <For each={overviewFiles()}>
                        {(filePath) => {
                          const kind = () => props.gitKinds().get(filePath) ?? "mix"
                          const stat = () => props.gitStats().get(filePath) ?? { additions: 0, deletions: 0 }
                          const isExpanded = createMemo(() => Boolean(expandedDiffs()[filePath]))
                          const diffRows = createMemo(() => overviewDiffs()?.get(filePath) ?? [])
                          const shownStat = createMemo(() => {
                            const rows = diffRows()
                            const additions = rows.filter((row) => row.type === "add").length
                            const deletions = rows.filter((row) => row.type === "del").length
                            return {
                              additions: stat().additions || additions,
                              deletions: stat().deletions || deletions,
                            }
                          })
                          const status = createMemo(() => kind() === "add" ? "A" : kind() === "del" ? "D" : "M")
                          
                          const parts = filePath.split("/")
                          const fname = parts.at(-1) ?? filePath
                          const folderPath = parts.slice(0, -1).join("/") + "/"
                          
                          return (
                            <div class="border-b border-border/60 last:border-b-0">
                              <div
                                onClick={() => toggleOverviewDiff(filePath)}
                                class="group flex min-h-[48px] cursor-pointer items-center justify-between px-4 py-2 transition-colors hover:bg-accent/30"
                                classList={{
                                  "bg-[color-mix(in_oklch,var(--chart-4)_20%,transparent)]": isExpanded(),
                                }}
                              >
                                <div class="flex min-w-0 items-center gap-2.5">
                                  <span class="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/70 transition-colors group-hover:text-foreground">
                                    <Show when={isExpanded()} fallback={<ChevronRight class="size-3.5" />}>
                                      <ChevronDown class="size-3.5" />
                                    </Show>
                                  </span>
                                  <FileIcon node={{ path: filePath, type: "file" }} class="size-4 shrink-0" />
                                  <span class="truncate text-[13px] font-semibold text-foreground">{fname}</span>
                                  <span class="truncate text-[11.5px] text-muted-foreground/75">{folderPath}</span>
                                  <span
                                    class="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border px-1 text-[10px] font-bold font-mono"
                                    classList={{
                                      "border-[color-mix(in_oklch,var(--icon-diff-modified-base)_28%,transparent)] bg-[color-mix(in_oklch,var(--icon-diff-modified-base)_12%,transparent)] text-[var(--icon-diff-modified-base)]": status() === "M",
                                      "border-[color-mix(in_oklch,var(--icon-diff-add-base)_28%,transparent)] bg-[color-mix(in_oklch,var(--icon-diff-add-base)_12%,transparent)] text-[var(--icon-diff-add-base)]": status() === "A",
                                      "border-[color-mix(in_oklch,var(--icon-diff-delete-base)_28%,transparent)] bg-[color-mix(in_oklch,var(--icon-diff-delete-base)_12%,transparent)] text-[var(--icon-diff-delete-base)]": status() === "D",
                                    }}
                                  >
                                    {status()}
                                  </span>
                                </div>
                                
                                <div class="flex shrink-0 items-center gap-3 pl-4 text-[11.5px] font-semibold font-mono tracking-tight">
                                    <Show when={shownStat().additions > 0}>
                                      <span class="text-[var(--icon-diff-add-base)]">+{shownStat().additions}</span>
                                    </Show>
                                    <Show when={shownStat().deletions > 0}>
                                      <span class="text-[var(--icon-diff-delete-base)]">-{shownStat().deletions}</span>
                                    </Show>
                                </div>
                              </div>

                              <Show when={isExpanded()}>
                                <div class="border-t border-border/60 overflow-x-auto">
                                  <Show
                                    when={!overviewDiffs.loading}
                                    fallback={<div class="px-4 py-3 text-[11px] text-muted-foreground">Loading diff...</div>}
                                  >
                                    <table class="min-w-full border-collapse font-mono text-[11.5px] leading-relaxed">
                                      <tbody>
                                        <For each={diffRows()}>
                                        {(line) => {
                                          const type = () => line.type
                                          const sign = () => type() === "add" ? "+" : type() === "del" ? "-" : ""

                                          return (
                                            <tr
                                              class="transition-colors"
                                              classList={{
                                                "bg-background hover:bg-accent/10": type() === "normal",
                                                "bg-[color-mix(in_oklch,var(--icon-diff-add-base)_13%,transparent)]": type() === "add",
                                                "bg-[color-mix(in_oklch,var(--icon-diff-delete-base)_13%,transparent)]": type() === "del",
                                                "bg-primary/10": type() === "info",
                                              }}
                                            >
                                              <td class="w-10 border-r border-border/40 py-1 pr-3 text-right text-[10px] text-muted-foreground/50 select-none">{line.oldLine}</td>
                                              <td class="w-10 border-r border-border/40 py-1 pr-3 text-right text-[10px] text-muted-foreground/50 select-none">{line.newLine}</td>
                                              <td
                                                class="w-6 py-1 text-center text-[11px] font-bold select-none"
                                                classList={{
                                                  "text-[var(--icon-diff-add-base)]": type() === "add",
                                                  "text-[var(--icon-diff-delete-base)]": type() === "del",
                                                  "text-muted-foreground/50": type() !== "add" && type() !== "del",
                                                }}
                                              >
                                                {sign()}
                                              </td>
                                              <td
                                                class="py-1 pl-2 pr-4 whitespace-pre"
                                                classList={{
                                                  "text-[var(--icon-diff-add-base)]": type() === "add",
                                                  "text-[var(--icon-diff-delete-base)]": type() === "del",
                                                  "text-primary font-semibold": type() === "info",
                                                  "text-foreground": type() === "normal",
                                                }}
                                              >
                                                {line.content}
                                              </td>
                                            </tr>
                                          )
                                        }}
                                        </For>
                                      </tbody>
                                    </table>
                                  </Show>
                                </div>
                              </Show>
                            </div>
                          )
                        }}
                      </For>
                    </div>
                  </div>
                </Show>
              }
            >
              <Show when={!preview.loading} fallback={<div class="p-6 text-sm text-muted-foreground">Loading file...</div>}>
                <Show
                  when={hasDiff()}
                  fallback={
                    <div class="py-3 bg-background/50 h-full overflow-auto">
                      <For each={lines()}>{(line, index) => <CodeLine line={line} index={index()} />}</For>
                    </div>
                  }
                >
                  <Show
                    when={diffStyle() === "unified"}
                    fallback={<SplitDiff chunks={preview()?.chunks ?? []} />}
                  >
                    <div class="bg-background/50 h-full overflow-auto">
                      <UnifiedDiff chunks={preview()?.chunks ?? []} />
                    </div>
                  </Show>
                </Show>
              </Show>
            </Show>
          </div>
        </section>
      </div>
    </div>
  )
}
