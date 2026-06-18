import { Component, createMemo, createResource, Show } from "solid-js"
import { useDialog } from "@shob-ai/ui/context/dialog"
import { Dialog } from "@shob-ai/ui/dialog"
import { List } from "@shob-ai/ui/list"
import { Icon } from "@shob-ai/ui/icon"
import { Globe } from "lucide-solid"
import { useLanguage } from "@/context/language"
import { nativeApi } from "@/services/native"

const MAX_FILES = 400
const MAX_DEPTH = 6

type Entry = {
  id: string
  kind: "file" | "terminal" | "browser"
  path: string
  title: string
  description: string
}

function isSpecial(entry: Entry): boolean {
  return entry.kind === "terminal" || entry.kind === "browser"
}

async function walkProject(root: string): Promise<string[]> {
  if (!root) return []

  const collected: string[] = []
  const visited = new Set<string>()

  const visit = async (relativeDir: string, depth: number) => {
    if (depth > MAX_DEPTH) return
    if (collected.length >= MAX_FILES) return

    const absolute = relativeDir ? toPosix(`${root}/${relativeDir}`) : root
    if (visited.has(absolute)) return
    visited.add(absolute)

    let entries: Array<{ name: string; path: string; isDirectory: boolean }>
    try {
      entries = (await nativeApi.invoke("list_directory", { path: absolute })) as typeof entries
    } catch {
      return
    }

    for (const entry of entries) {
      if (collected.length >= MAX_FILES) return
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue

      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name

      if (entry.isDirectory) {
        await visit(relativePath, depth + 1)
      } else {
        collected.push(relativePath)
      }
    }
  }

  await visit("", 0)
  return collected
}

function toPosix(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/")
}

export interface DialogAddTabProps {
  projectPath: () => string
  onOpenFile: (path: string) => void
  onOpenTerminal: () => void
  onOpenBrowser: () => void
}

export const DialogAddTab: Component<DialogAddTabProps> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()

  const [files] = createResource(
    () => props.projectPath(),
    async (root) => {
      const paths = await walkProject(root)
      return paths.sort((a, b) => a.localeCompare(b))
    },
  )

  const allEntries = createMemo<Entry[]>(() => {
    const list = files() ?? []
    return [
      {
        id: "terminal",
        kind: "terminal",
        path: "",
        title: language.t("dialog.addTab.terminal.title"),
        description: language.t("dialog.addTab.terminal.description"),
      },
      {
        id: "browser",
        kind: "browser",
        path: "",
        title: "Browser",
        description: "Open embedded browser",
      },
      ...list.map<Entry>((path) => ({
        id: `file:${path}`,
        kind: "file",
        path,
        title: path,
        description: "",
      })),
    ]
  })

  const handleSelect = (entry: Entry | undefined) => {
    if (!entry) return
    dialog.close()
    if (entry.kind === "terminal") {
      props.onOpenTerminal()
      return
    }
    if (entry.kind === "browser") {
      props.onOpenBrowser()
      return
    }
    props.onOpenFile(entry.path)
  }

  return (
    <Dialog title={language.t("dialog.addTab.title")} transition>
      <List
        search={{ placeholder: language.t("session.header.searchFiles"), autofocus: true }}
        emptyMessage={language.t("palette.empty")}
        loadingMessage={language.t("common.loading")}
        items={allEntries}
        key={(x) => x.id}
        filterKeys={["path", "title", "description"]}
        onSelect={(entry) => handleSelect(entry as Entry | undefined)}
      >
        {(entry) => (
          <Show
            when={isSpecial(entry)}
            fallback={
              <div class="w-full flex items-center gap-2 text-13-regular min-w-0">
                <span class="truncate text-text-strong">{entry.path}</span>
              </div>
            }
          >
            <div class="w-full flex items-center gap-2 text-13-regular">
              <Show
                when={entry.kind === "browser"}
                fallback={<Icon name="terminal" size="small" class="shrink-0 text-text-weak" />}
              >
                <Globe size={14} class="shrink-0 text-text-weak" />
              </Show>
              <span class="truncate text-text-strong">{entry.title}</span>
              <span class="truncate text-12-regular text-text-weak">- {entry.description}</span>
            </div>
          </Show>
        )}
      </List>
    </Dialog>
  )
}
