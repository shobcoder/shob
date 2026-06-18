import { ParentProps, createResource, Show } from "solid-js"
import { I18nProvider } from "@shob-ai/ui/context"
import { DialogProvider } from "@shob-ai/ui/context/dialog"
import { MarkedProvider } from "@shob-ai/ui/context/marked"
import { LanguageProvider, useLanguage } from "@/context/language"
import { PlatformProvider, Platform } from "@/context/platform"
import { ServerProvider, ServerConnection } from "@/context/server"
import type { AsyncStorage } from "@solid-primitives/storage"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { GlobalSyncProvider } from "@/context/global-sync"
import { ModelsProvider } from "@/context/models"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { nativeApi } from "@/services/native"
import { ErrorPage } from "@/pages/error"
import { SettingsProvider } from "@/context/settings"
import { MemoryRouter, Route } from "@solidjs/router"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"

const SIDECAR_SERVER_KEY = ServerConnection.Key.make("sidecar")

function legacyLocalStorageKeys(storage: string | undefined, key: string) {
  const keys = [storage ? `${storage}:${key}` : key]
  if (storage === "default.dat") keys.push(key)
  return [...new Set(keys)]
}

function readLegacyLocalStorage(storage: string | undefined, key: string) {
  if (typeof localStorage !== "object") return null
  try {
    for (const legacyKey of legacyLocalStorageKeys(storage, key)) {
      const value = localStorage.getItem(legacyKey)
      if (value !== null) return value
    }
    return null
  } catch {
    return null
  }
}

function writeLegacyLocalStorage(storage: string | undefined, key: string, value: string | null) {
  if (typeof localStorage !== "object") return
  try {
    const legacyKeys = legacyLocalStorageKeys(storage, key)
    if (value === null) {
      for (const legacyKey of legacyKeys) localStorage.removeItem(legacyKey)
      return
    }
    localStorage.setItem(legacyKeys[0], value)
  } catch {
    // Browser storage is only a fallback during migration.
  }
}

function desktopStorage(storage?: string): AsyncStorage {
  return {
    getItem: async (key) => {
      const bridge = window.shob?.storage
      const native = bridge?.getItem(storage, key)
      if (native !== null && native !== undefined) return native

      const legacy = readLegacyLocalStorage(storage, key)
      if (legacy === null) return null

      try {
        if (!bridge) return legacy
        await bridge.setItem(storage, key, legacy)
        writeLegacyLocalStorage(storage, key, null)
      } catch {
        // Keep the legacy value if the native migration cannot complete.
      }
      return legacy
    },
    setItem: async (key, value) => {
      const bridge = window.shob?.storage
      try {
        if (!bridge) {
          writeLegacyLocalStorage(storage, key, value)
          return
        }
        await bridge.setItem(storage, key, value)
        writeLegacyLocalStorage(storage, key, null)
      } catch {
        writeLegacyLocalStorage(storage, key, value)
      }
    },
    removeItem: async (key) => {
      const bridge = window.shob?.storage
      try {
        if (bridge) await bridge.removeItem(storage, key)
      } finally {
        writeLegacyLocalStorage(storage, key, null)
      }
    },
  }
}

async function resolveSidecarServerUrl() {
  if (!window.shob) return "http://localhost:4096"

  const current = window.shob.getServerUrl()
  if (current) return current

  const result = await nativeApi.invoke("shob_server_start")

  return result
}

function sidecarServer(url: string): ServerConnection.Sidecar {
  return {
    type: "sidecar",
    variant: "base",
    displayName: "Local",
    http: { url },
  }
}

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.intl, t: language.t }}>{props.children}</I18nProvider>
}

const platform: Platform = {
  platform: "desktop",
  os: "windows",
  openLink: (url) => nativeApi.invoke("open_external", { url }),
  restart: async () => {},
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  notify: async () => {},
  storage: desktopStorage,
  getDefaultServer: async () => {
    return SIDECAR_SERVER_KEY
  },
  setDefaultServer: async () => {},
}

const queryClient = new QueryClient()

export function AppProviders(props: ParentProps) {
  const [sidecarUrl] = createResource(resolveSidecarServerUrl)

  return (
    <PlatformProvider value={platform}>
      <LanguageProvider>
        <UiI18nBridge>
          <Show
            when={sidecarUrl.error}
            fallback={
              <Show when={sidecarUrl()} fallback={<div class="h-screen w-screen bg-background-base" />}>
                {(url) => (
                  <ServerProvider
                    defaultServer={SIDECAR_SERVER_KEY}
                    servers={[sidecarServer(url())]}
                  >
                    <GlobalSDKProvider>
                      <GlobalSyncProvider>
                        <SettingsProvider>
                          <MemoryRouter>
                            <Route path="*" component={() => (
                              <NotificationProvider>
                                <PermissionProvider>
                                  <ModelsProvider>
                                    <QueryClientProvider client={queryClient}>
                                      <DialogProvider>
                                        <MarkedProvider>
                                          {props.children}
                                        </MarkedProvider>
                                      </DialogProvider>
                                    </QueryClientProvider>
                                  </ModelsProvider>
                                </PermissionProvider>
                              </NotificationProvider>
                            )} />
                          </MemoryRouter>
                        </SettingsProvider>
                      </GlobalSyncProvider>
                    </GlobalSDKProvider>
                  </ServerProvider>
                )}
              </Show>
            }
          >
            {(error) => <ErrorPage error={error()} />}
          </Show>
        </UiI18nBridge>
      </LanguageProvider>
    </PlatformProvider>
  )
}

