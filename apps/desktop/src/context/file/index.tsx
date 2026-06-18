import { createContext, useContext, type ParentProps } from "solid-js"
import { createPathHelpers } from "./path"
import { createFileTreeStore } from "./tree-store"
import type { FileNode } from "@/types/file-node"

type FileContextValue = {
  normalize: (input: string) => string
  tree: ReturnType<typeof createFileTreeStore> & {
    list: ReturnType<typeof createFileTreeStore>["listDir"]
    expand: ReturnType<typeof createFileTreeStore>["expandDir"]
    collapse: ReturnType<typeof createFileTreeStore>["collapseDir"]
    state: ReturnType<typeof createFileTreeStore>["dirState"]
  }
}

const FileContext = createContext<FileContextValue>()

export function createFileContext(options: {
  projectPath: () => string
  listDirectory: (path: string) => Promise<FileNode[]>
  onError: (message: string) => void
}) {
  const pathHelpers = createPathHelpers(options.projectPath)

  const tree = createFileTreeStore({
    scope: options.projectPath,
    normalizeDir: pathHelpers.normalizeDir,
    list: options.listDirectory,
    onError: options.onError,
  })

  const treeCompat = {
    ...tree,
    list: tree.listDir,
    expand: tree.expandDir,
    collapse: tree.collapseDir,
    state: tree.dirState,
  }

  const value = { normalize: pathHelpers.normalize, tree: treeCompat }

  function FileProvider(props: ParentProps) {
    return (
      <FileContext.Provider value={value}>
        {props.children}
      </FileContext.Provider>
    )
  }

  return {
    normalize: pathHelpers.normalize,
    tree: treeCompat,
    FileProvider,
  }
}

export function useFile() {
  const ctx = useContext(FileContext)
  if (!ctx) throw new Error("useFile must be used within FileProvider")
  return ctx
}

export * from "./types"

