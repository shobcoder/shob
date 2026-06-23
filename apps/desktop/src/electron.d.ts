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

export interface ElectronSkillStoreItem {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  iconKey: string
  installed: boolean
  managed: boolean
  location: string | null
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

// Windows/Linux use a fixed set; macOS targets are detection-driven (any catalog
// id from list_open_with_apps), so the type stays open as a string.
export type ElectronOpenWithTarget = string

export interface ElectronOpenWithApp {
  id: string
  label: string
  icon: string
  kind: "editor" | "terminal" | "reveal"
}

export interface ElectronTerminalSpawnOptions {
  id?: string
  shell: string
  fallbackShells?: string[]
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
  shell?: string
}

export type ElectronBrowserAction =
  | "open"
  | "navigate"
  | "show"
  | "hide"
  | "close"
  | "state"
  | "click"
  | "double_click"
  | "right_click"
  | "mouse_move"
  | "mouse_down"
  | "mouse_up"
  | "hover"
  | "drag"
  | "type"
  | "press"
  | "scroll"
  | "back"
  | "forward"
  | "reload"
  | "set_degen_mode"
  | "set_viewport"
  | "set_cursor_overlay"
  | "extract"
  | "evaluate"
  | "screenshot"

export interface ElectronBrowserViewport {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
  userAgent: string | null
  preset: string | null
}

export interface ElectronBrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ElectronBrowserActionRequest {
  action?: ElectronBrowserAction
  detail?: "light" | "full"
  url?: string
  bounds?: ElectronBrowserBounds
  enabled?: boolean
  ref?: string
  text?: string
  key?: string
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  javascript?: string
  maxLength?: number
  viewportWidth?: number
  viewportHeight?: number
  deviceScaleFactor?: number
  mobile?: boolean
  userAgent?: string | null
  preset?: string | null
  fromX?: number
  fromY?: number
  toX?: number
  toY?: number
  fromRef?: string
  toRef?: string
  button?: "left" | "right" | "middle"
  clickCount?: number
  steps?: number
  delayMs?: number
  modifiers?: string[]
}

export interface ElectronBrowserElementSnapshot {
  ref: string
  tag: string
  role: string | null
  type: string | null
  text: string
  href: string | null
  placeholder: string | null
  x: number
  y: number
  width: number
  height: number
}

export interface ElectronBrowserState {
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  degenMode: boolean
  error?: string | null
  text?: string
  elements?: ElectronBrowserElementSnapshot[]
  viewport?: ElectronBrowserViewport
}

export interface ElectronBrowserActionResult {
  ok: true
  action: ElectronBrowserAction
  state: ElectronBrowserState
  text?: string
  dataUrl?: string
  value?: unknown
}

export interface ElectronBrowserTheme {
  mode: "light" | "dark"
  background: string
  surface: string
  foreground: string
  muted: string
  border: string
  codeBackground: string
  codeForeground: string
}

export interface ElectronBrowserElementSelection {
  url: string
  title: string
  selector: string
  tag: string
  role: string | null
  type: string | null
  text: string
  value: string | null
  href: string | null
  src: string | null
  alt: string | null
  placeholder: string | null
  ariaLabel: string | null
  id: string | null
  className: string | null
  outerHTML: string
  x: number
  y: number
  width: number
  height: number
  timestamp: number
}

export interface ShobNativeApi {
  platform: "windows" | "macos" | "linux" | string
  getServerUrl(): string | null
  invoke<T = unknown>(command: string, payload?: unknown): Promise<T>
  listen<T = unknown>(
    channel: string,
    callback: (event: { payload: T }) => void,
  ): Promise<() => void>
  storage: {
    getItem(storage: string | undefined, key: string): string | null
    setItem(storage: string | undefined, key: string, value: string): Promise<void>
    removeItem(storage: string | undefined, key: string): Promise<void>
  }
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    isMaximized(): Promise<boolean>
    close(): Promise<void>
    onResized(callback: (state?: { maximized?: boolean; fullscreen?: boolean }) => void): Promise<() => void>
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
  get_app_info: {
    args: undefined
    result: { name: string; version: string; packaged: boolean; platform: "windows" | "macos" | "linux" | string }
  }
  storage_set: { args: { storage?: string | null; key: string; value: string }; result: void }
  storage_remove: { args: { storage?: string | null; key: string }; result: void }
  check_for_updates: {
    args: { manual?: boolean } | undefined
    result: {
      status: "dev" | "success" | "error"
      updateAvailable?: boolean
      version?: string
      downloaded?: boolean
      message?: string
    }
  }
  get_update_status: {
    args: undefined
    result: {
      status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "error" | "dev"
      version?: string | null
      downloaded?: boolean
      downloading?: boolean
    }
  }
  install_update: {
    args: undefined
    result: { status: "dev" | "not-downloaded" | "installing" | "manual"; version?: string | null; url?: string }
  }
  download_update: {
    args: undefined
    result: { status: "dev" | "downloading" | "downloaded" | "error" | "manual"; version?: string | null; message?: string; url?: string }
  }
  shob_server_start: { args: undefined; result: string }
  browser_action: { args: ElectronBrowserActionRequest; result: ElectronBrowserActionResult }
  get_projects: { args: undefined; result: Project[] }
  save_project: { args: { project: Project }; result: Project }
  reorder_projects: { args: { projectIds: string[] }; result: Project[] }
  delete_project: { args: { projectId: string }; result: void }
  save_session_output: { args: { sessionId: string; output: string }; result: void }
  load_session_output: { args: { sessionId: string }; result: string }
  read_image_data_url: { args: { path: string }; result: string }
  get_available_shells: { args: undefined; result: string[] }
  list_skill_store: { args: undefined; result: ElectronSkillStoreItem[] }
  install_skill: { args: { skillId: string }; result: ElectronSkillStoreItem }
  uninstall_skill: { args: { skillId: string }; result: { ok: true } }
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
  set_browser_theme: { args: ElectronBrowserTheme; result: void }
  set_titlebar_theme: { args: { mode: "light" | "dark" }; result: void }
  reveal_in_finder: { args: { path: string }; result: void }
  open_project_with: { args: { path: string; target: ElectronOpenWithTarget }; result: void }
  list_open_with_apps: { args?: undefined; result: { apps: ElectronOpenWithApp[] } }
  show_open_dialog: { args: ElectronOpenDialogOptions; result: string | string[] | null }
  open_external: { args: { url: string }; result: void }
  list_work_terminals: { args: { projectId: string }; result: WorkTerminal[] }
  create_work_terminal: { args: { projectId: string; shell: string; title?: string; sortOrder?: number }; result: WorkTerminal }
  update_work_terminal: { args: { id: string; updates: Partial<WorkTerminal> }; result: void }
  reorder_work_terminals: { args: { terminalIds: string[] }; result: void }
  delete_work_terminal: { args: { id: string }; result: void }
  get_terminal_layout: { args: { projectId: string }; result: TerminalLayout }
  save_terminal_layout: { args: { projectId: string; layout: Partial<TerminalLayout> }; result: void }
}

export interface WorkTerminal {
  id: string
  projectId: string
  title: string
  shell: string
  sortOrder: number
  timeCreated: number
  timeUpdated: number
}

export interface TerminalLayout {
  projectId: string
  activeTerminalId: string | null
  panelHeight: number
  panelOpened: boolean
}
