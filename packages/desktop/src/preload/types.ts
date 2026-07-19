import type { DesktopMenuAction } from "@shob/app/desktop-menu"
import type { WslServersPlatform } from "@shob/app/wsl/types"
import type { UpdaterState } from "@shob/app/updater"
export type {
  WslDistroProbe,
  WslInstalledDistro,
  WslJob,
  WslOnlineDistro,
  WslOpencodeCheck,
  WslRuntimeCheck,
  WslServerConfig,
  WslServerItem,
  WslServerRuntime,
  WslServersEvent,
  WslServersState,
} from "@shob/app/wsl/types"

export type ServerReadyData = {
  url: string
  username: string | null
  password: string | null
}

export type WslServersAPI = WslServersPlatform
export type UpdaterAPI = {
  subscribe: (cb: (state: UpdaterState) => void) => Promise<() => void>
  check: () => Promise<UpdaterState>
  install: () => Promise<void>
}

export type LinuxDisplayBackend = "wayland" | "auto"
export type TitlebarTheme = {
  mode: "light" | "dark"
}
export type FatalRendererError = {
  error: string
  url: string
  version?: string
  platform: string
  os?: string
}

export type ElectronBrowserAction =
  | "list"
  | "open"
  | "navigate"
  | "show"
  | "hide"
  | "close"
  | "state"
  | "click"
  | "type"
  | "press"
  | "scroll"
  | "back"
  | "forward"
  | "reload"
  | "extract"
  | "evaluate"
  | "screenshot"

export type ElectronBrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ElectronBrowserActionRequest = {
  browserId?: string
  action?: ElectronBrowserAction
  detail?: "light" | "full"
  url?: string
  bounds?: ElectronBrowserBounds
  ref?: string
  text?: string
  key?: string
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  javascript?: string
  maxLength?: number
}

export type ElectronBrowserElementSnapshot = {
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

export type ElectronBrowserState = {
  browserId: string
  visible: boolean
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  text?: string
  elements?: ElectronBrowserElementSnapshot[]
}

export type ElectronBrowserActionResult = {
  ok: true
  action: ElectronBrowserAction
  browserId: string
  state: ElectronBrowserState
  states?: ElectronBrowserState[]
  text?: string
  dataUrl?: string
  value?: unknown
}

export type ElectronSkillStoreItem = {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  installed: boolean
  managed: boolean
  location: string | null
}

export type ElectronAPI = {
  killSidecar: () => Promise<void>
  installCli: () => Promise<string>
  awaitInitialization: () => Promise<ServerReadyData>
  wslServers: WslServersAPI
  updater: UpdaterAPI
  consumeInitialDeepLinks: () => Promise<string[]>
  getDefaultServerUrl: () => Promise<string | null>
  setDefaultServerUrl: (url: string | null) => Promise<void>
  getDisplayBackend: () => Promise<LinuxDisplayBackend | null>
  setDisplayBackend: (backend: LinuxDisplayBackend | null) => Promise<void>
  parseMarkdownCommand: (markdown: string) => Promise<string>
  checkAppExists: (appName: string) => Promise<boolean>
  resolveAppPath: (appName: string) => Promise<string | null>
  storeGet: (name: string, key: string) => Promise<string | null>
  storeSet: (name: string, key: string, value: string) => Promise<void>
  storeDelete: (name: string, key: string) => Promise<void>
  storeClear: (name: string) => Promise<void>
  storeKeys: (name: string) => Promise<string[]>
  storeLength: (name: string) => Promise<number>

  getWindowCount: () => Promise<number>
  getWindowID: () => Promise<string>
  onMenuCommand: (cb: (id: string) => void) => () => void
  onDeepLink: (cb: (urls: string[]) => void) => () => void

  openDirectoryPicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
  }) => Promise<string | string[] | null>
  openFilePicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
    extensions?: string[]
  }) => Promise<{ token: string; files: { path: string; name: string; size: number }[] } | null>
  readPickedFile: (token: string, path: string) => Promise<ArrayBuffer>
  releasePickedFiles: (token: string) => Promise<void>
  getPathForFile: (file: File) => string
  saveFilePicker: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
  openLink: (url: string) => void
  openPath: (path: string, app?: string) => Promise<void>
  readClipboardImage: () => Promise<{ buffer: ArrayBuffer; width: number; height: number } | null>
  showNotification: (title: string, body?: string) => void
  getWindowFocused: () => Promise<boolean>
  setWindowFocus: () => Promise<void>
  showWindow: () => Promise<void>
  relaunch: () => void
  getZoomFactor: () => Promise<number>
  setZoomFactor: (factor: number) => Promise<void>
  getPinchZoomEnabled: () => Promise<boolean>
  setPinchZoomEnabled: (enabled: boolean) => Promise<void>
  onPinchZoomEnabledChanged: (cb: (enabled: boolean) => void) => () => void
  onZoomFactorChanged: (cb: (factor: number) => void) => () => void
  setTitlebar: (theme: TitlebarTheme) => Promise<void>
  runDesktopMenuAction: (action: DesktopMenuAction) => Promise<void>
  setBackgroundColor: (color: string) => Promise<void>
  exportDebugLogs: () => Promise<string>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void>
  browserAction: (request: ElectronBrowserActionRequest) => Promise<ElectronBrowserActionResult>
  onBrowserState: (cb: (state: ElectronBrowserState) => void) => () => void
  onBrowserOpen: (cb: (state: ElectronBrowserState) => void) => () => void
  onBrowserClose: (cb: (payload: { browserId: string }) => void) => () => void

  listSkillStore: () => Promise<ElectronSkillStoreItem[]>
  installSkill: (skillId: string) => Promise<ElectronSkillStoreItem>
  uninstallSkill: (skillId: string) => Promise<{ ok: true }>
}
