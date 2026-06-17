import type { NativeCommandMap } from "../electron"

type CommandName = keyof NativeCommandMap
type CommandArgs<T extends CommandName> = NativeCommandMap[T]["args"]
type CommandResult<T extends CommandName> = NativeCommandMap[T]["result"]

const getBridge = () => {
  if (!window.shob) {
    throw new Error("Shob native bridge is unavailable. Start the app with Electron.")
  }

  return window.shob
}

export function invokeNative<T extends CommandName>(
  command: T,
  ...args: CommandArgs<T> extends undefined ? [] : [CommandArgs<T>]
): Promise<CommandResult<T>> {
  return getBridge().invoke<CommandResult<T>>(command, args[0])
}

export const nativeApi = {
  platform: () => getBridge().platform,
  /**
   * Platform-appropriate default shell for the renderer. The renderer runs with
   * contextIsolation + no nodeIntegration, so `process` does not exist here —
   * never reference it. Derives the shell from the preload-exposed platform and
   * falls back to a POSIX shell when the native bridge is unavailable.
   */
  defaultShell: (): string => {
    try {
      return getBridge().platform === "windows" ? "powershell.exe" : "/bin/sh"
    } catch {
      return "/bin/sh"
    }
  },
  invoke: invokeNative,
  listen: <T>(channel: string, callback: (event: { payload: T }) => void) =>
    getBridge().listen<T>(channel, callback),
  open: (options: NativeCommandMap["show_open_dialog"]["args"]) =>
    invokeNative("show_open_dialog", options),
  window: () => getBridge().window,
  terminal: () => getBridge().terminal,
}
