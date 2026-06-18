import { createMemo, createResource, createSignal, Show } from "solid-js"
import { nativeApi } from "@/services/native"
import { buildViewDiff } from "./session-diff"
import { DiffChanges } from "@/shob-ported/diff-changes"
import { Button } from "@/components/ui/button"

type Props = {
  projectPath: string
  filePath: string
}

export function DiffViewer(props: Props) {
  const [style, setStyle] = createSignal<"unified" | "split">("unified")

  const absolute = createMemo(() => {
    const root = props.projectPath.replace(/\\/g, "/").replace(/\/+$/, "")
    const rel = props.filePath.replace(/\\/g, "/").replace(/^\/+/, "")
    return `${root}/${rel}`
  })

  const [data] = createResource(
    () => ({ abs: absolute(), project: props.projectPath, file: props.filePath }),
    async (input) => {
      const [before, after] = await Promise.all([
        nativeApi.invoke("get_git_file_base", { path: input.abs }).catch(() => "") as Promise<string>,
        nativeApi.invoke("read_text_file", { path: input.abs }).catch(() => "") as Promise<string>,
      ])
      return buildViewDiff(input.file, before ?? "", after ?? "")
    },
  )

  return (
    <div class="h-full min-h-0 flex flex-col border-t border-border/60 bg-background/70">
      <div class="h-9 shrink-0 px-2 flex items-center justify-between">
        <div class="text-xs truncate max-w-[60%] text-muted-foreground">{props.filePath}</div>
        <div class="flex items-center gap-2">
          <Show when={data()}>{(d) => <DiffChanges changes={{ additions: d().additions, deletions: d().deletions }} />}</Show>
          <Button size="xs" variant={style() === "unified" ? "secondary" : "ghost"} onClick={() => setStyle("unified")}>Unified</Button>
          <Button size="xs" variant={style() === "split" ? "secondary" : "ghost"} onClick={() => setStyle("split")}>Split</Button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <Show when={!data.loading} fallback={<div class="text-xs text-muted-foreground py-2">Loading diff...</div>}>
          <Show when={data()}>
            {(d) => (
              <Show
                when={style() === "unified"}
                fallback={
                  <div class="grid grid-cols-2 gap-2 text-xs font-mono leading-5">
                    <pre class="m-0 p-2 rounded bg-black/20 overflow-auto whitespace-pre-wrap">{d().before}</pre>
                    <pre class="m-0 p-2 rounded bg-black/20 overflow-auto whitespace-pre-wrap">{d().after}</pre>
                  </div>
                }
              >
                <pre class="m-0 p-2 rounded bg-black/20 text-xs font-mono leading-5 overflow-auto whitespace-pre-wrap">{d().patch}</pre>
              </Show>
            )}
          </Show>
        </Show>
      </div>
    </div>
  )
}
