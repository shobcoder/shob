import { createSignal } from "solid-js"
import { nativeApi } from "@/services/native"

export type ChromePlatform = "windows" | "macos" | "linux" | "unknown"

/** macOS native traffic-light clearance (matches trafficLightPosition.x in main.ts + light width). */
export const MAC_TRAFFIC_LIGHT_INSET = 92
/** Reduced inset in fullscreen, where the traffic lights are hidden. */
export const MAC_FULLSCREEN_INSET = 10

function mapPlatform(value: string): ChromePlatform {
  if (value === "windows" || value === "macos" || value === "linux") return value
  return "unknown"
}

function readPlatformSync(): ChromePlatform {
  try {
    return mapPlatform(nativeApi.platform())
  } catch {
    return "unknown"
  }
}

// Shared, app-lifetime window-chrome state. Kept at module scope (a singleton) so
// that components which mount late — e.g. the collapsed-sidebar reveal, which only
// renders once the sidebar is hidden — read the *current* fullscreen / sidebar
// state instead of missing the event that set it.
const [platform] = createSignal<ChromePlatform>(readPlatformSync())
const [isFullscreen, setIsFullscreen] = createSignal(false)
const [sidebarVisible, setSidebarVisible] = createSignal(true)

let initialized = false

function ensureInitialized() {
  if (initialized) return
  initialized = true

  // Fullscreen is only reported via window-state events (no getter), so we must
  // start listening before the user enters fullscreen. App.tsx calls
  // useWindowChrome() at startup, which runs this once.
  try {
    void nativeApi
      .window()
      .onResized((state) => {
        if (typeof state?.fullscreen === "boolean") setIsFullscreen(state.fullscreen)
      })
      .catch(() => undefined)
  } catch {
    /* native bridge unavailable (web) */
  }

  window.addEventListener("gg-sidebar-state", (event: Event) => {
    const detail = (event as CustomEvent<{ isSidebarVisible: boolean }>).detail
    if (detail) setSidebarVisible(Boolean(detail.isSidebarVisible))
  })
}

/**
 * Shared window-chrome state for the custom macOS title-bar layout: platform,
 * fullscreen, sidebar visibility, plus toggle/create-session actions. Backed by a
 * singleton so every caller sees consistent, up-to-date values.
 */
export function useWindowChrome() {
  ensureInitialized()

  const isMac = () => platform() === "macos"

  /** Left padding needed to clear the native traffic lights (0 off-mac, reduced in fullscreen). */
  const trafficLightInset = () => {
    if (!isMac()) return 0
    return isFullscreen() ? MAC_FULLSCREEN_INSET : MAC_TRAFFIC_LIGHT_INSET
  }

  return {
    platform,
    isMac,
    isFullscreen,
    sidebarVisible,
    trafficLightInset,
    toggleSidebar: () => window.dispatchEvent(new Event("gg-toggle-sidebar")),
    createSession: () => window.dispatchEvent(new Event("gg-create-session")),
  }
}
