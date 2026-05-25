import type { Project } from "./types"
import type { CliProbeResult } from "./config/check"

export interface TerminalHostInfo {
  os: string
  windowsBuildNumber?: number | null
}

export interface ElectronFileTreeEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface ElectronGitBranchInfo {
  repoName?: string | null
  head: string
  upstream?: string | null
}

export interface ElectronGitStatusSummary {
  repoRoot: string
  changedFiles: Array<{
    path: string
    absolutePath: string
    status: string
    additions: number
    deletions: number
  }>
}

export interface ElectronGitFileState {
  repoRoot: string | null
  baseContent: string
  currentContent: string
  hasChanges: boolean
  isLargeFile: boolean
  fileSizeBytes: number
  status: string
  additions: number
  deletions: number
}

export interface ElectronOpenDialogOptions {
  directory?: boolean
  multiple?: boolean
  title?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
}

export interface ElectronTerminalSpawnOptions {
  id?: string
  shell: string
  args?: string[]
  cwd?: string
  rows: number
  cols: number
  cursor?: number
  env?: Record<string, string>
}

export interface ElectronTerminalSpawnResult {
  id: string
  reused?: boolean
  buffer?: string
  bufferCursor?: number
  cursor?: number
}

export interface ShobNativeApi {
  platform: "windows" | "macos" | "linux" | string
  getServerUrl(): string | null
  invoke<T = unknown>(command: string, payload?: unknown): Promise<T>
  listen<T = unknown>(
    channel: string,
    callback: (event: { payload: T }) => void,
  ): Promise<() => void>
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    isMaximized(): Promise<boolean>
    close(): Promise<void>
    onResized(callback: () => void): Promise<() => void>
  }
  terminal: {
    spawn(options: ElectronTerminalSpawnOptions): Promise<ElectronTerminalSpawnResult>
    write(id: string, data: string): Promise<void>
    resize(id: string, cols: number, rows: number): Promise<void>
    kill(id: string): Promise<void>
    onData(id: string, callback: (data: string) => void): () => void
    onExit(id: string, callback: () => void): () => void
  }
}

declare module "*.svg" {
  const src: string
  export default src
}

declare global {
  interface Window {
    shob?: ShobNativeApi
  }
}

export interface NativeCommandMap {
  opencode_server_start: { args: undefined; result: string }
  get_projects: { args: undefined; result: Project[] }
  save_project: { args: { project: Project }; result: Project }
  delete_project: { args: { projectId: string }; result: void }
  save_session_output: { args: { sessionId: string; output: string }; result: void }
  load_session_output: { args: { sessionId: string }; result: string }
  read_image_data_url: { args: { path: string }; result: string }
  get_available_shells: { args: undefined; result: string[] }
  get_terminal_host_info: { args: undefined; result: TerminalHostInfo }
  probe_cli_tools: { args: { items: { id: string; commands: string[] }[] }; result: CliProbeResult[] }
  set_project_watch: { args: { path: string | null }; result: void }
  list_directory: { args: { path: string }; result: ElectronFileTreeEntry[] }
  read_text_file: { args: { path: string }; result: string }
  get_git_status: { args: { path: string }; result: ElectronGitStatusSummary }
  get_git_branch: { args: { path: string }; result: ElectronGitBranchInfo }
  get_git_branches: { args: { path: string }; result: { branches: string[] } }
  switch_git_branch: { args: { path: string; branch: string }; result: void }
  get_git_file_base: { args: { path: string }; result: string }
  get_git_file_state: { args: { path: string }; result: ElectronGitFileState }
  cleanup_runtime: { args: undefined; result: void }
  set_window_background: { args: { color: string }; result: void }
  set_titlebar_overlay_options: { args: { color?: string; symbolColor?: string; height?: number }; result: void }
  reveal_in_finder: { args: { path: string }; result: void }
  show_open_dialog: { args: ElectronOpenDialogOptions; result: string | string[] | null }
  open_external: { args: { url: string }; result: void }
}
