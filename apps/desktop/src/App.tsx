import { createSignal, onCleanup, onMount, ErrorBoundary, createEffect, Show } from 'solid-js'
import { nativeApi } from './services/native'
import { TitleBar } from './components/TitleBar'
import { useWindowChrome } from './utils/window-chrome'
import { MainView } from './components/MainView'
import { useStore } from './store'
import { applyAppTheme, getThemeById, resolveThemeMode, type ResolvedThemeMode } from './theme'
import { ErrorPage } from './pages/error'
import { Toast, showToast } from '@shob-ai/ui/toast'
import { Ico } from './components/Ico'

function App() {
  const { loadProjects, loadCliTools, loadAvailableShells } = useStore()
  const windowChrome = useWindowChrome()
  const themeId = useStore((s) => s.themeId)
  const colorScheme = useStore((s) => s.colorScheme)
  const [isBooting, setIsBooting] = createSignal(true)
  const [systemMode, setSystemMode] = createSignal<ResolvedThemeMode>(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  const updateToastLogo = () => (
    <Ico
      alt=""
      class="size-9 rounded-lg border border-border-weak-base bg-surface-base object-cover shadow-sm"
    />
  )

  onMount(() => {
    let unlistenAvailable: (() => void) | null = null
    let unlistenDownloaded: (() => void) | null = null
    let unlistenError: (() => void) | null = null

    const setupUpdaterToast = async () => {
      if (!window.shob) return

      try {
        unlistenAvailable = await nativeApi.listen<{ version: string }>("update:available", (event) => {
          if (windowChrome.isMac()) {
            // macOS auto-update is disabled (unsigned build) — guide to Releases instead.
            showToast({
              title: "Update available",
              description: `Shob ${event.payload.version} is available. Open the Releases page to download it.`,
              variant: "default",
              persistent: true,
              leading: updateToastLogo(),
              actions: [
                {
                  label: "Open Releases",
                  onClick: () => {
                    void nativeApi.invoke("install_update")
                  },
                },
                {
                  label: "Later",
                  onClick: "dismiss",
                },
              ],
            })
            return
          }
          showToast({
            title: "Update downloading",
            description: `Shob ${event.payload.version} is downloading in the background. You can keep working.`,
            variant: "default",
            duration: 8000,
            leading: updateToastLogo(),
            actions: [
              {
                label: "Dismiss",
                onClick: "dismiss",
              },
            ],
          })
        })

        unlistenDownloaded = await nativeApi.listen<{ version: string }>("update:downloaded", (event) => {
          showToast({
            title: "Update ready to install",
            description: `Shob ${event.payload.version} has finished downloading. Restart now to complete the update.`,
            variant: "success",
            persistent: true,
            leading: updateToastLogo(),
            actions: [
              {
                label: "Restart & install",
                onClick: () => {
                  void nativeApi.invoke("install_update")
                },
              },
              {
                label: "Later",
                onClick: "dismiss",
              },
            ],
          })
        })

        unlistenError = await nativeApi.listen<string>("update:error", (event) => {
          console.warn("Auto-updater encountered an error:", event.payload)
        })
      } catch (err) {
        console.error("Failed to setup global updater toast listeners:", err)
      }
    }

    void setupUpdaterToast()

    onCleanup(() => {
      unlistenAvailable?.()
      unlistenDownloaded?.()
      unlistenError?.()
    })
  })

  onMount(() => {
    let timeoutId: number | null = null

    const runStartupUpdateCheck = () => {
      if (!window.shob) return
      void nativeApi.invoke("check_for_updates", { manual: false }).catch((error) => {
        console.warn("Startup update check failed:", error)
      })
    }

    timeoutId = window.setTimeout(runStartupUpdateCheck, 5000)

    onCleanup(() => {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    })
  })

  onMount(() => {
    const BOOT_TIMEOUT_MS = 4000

    const initialize = async () => {
      try {
        await Promise.race([
          loadProjects(),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, BOOT_TIMEOUT_MS)
          }),
        ])
      } catch (error) {
        console.error('App boot initialization failed:', error)
      }

      setIsBooting(false)
    }

    void initialize()
  })

  createEffect(() => {
    const mode = resolveThemeMode(colorScheme(), systemMode())
    const theme = getThemeById(themeId())
    const tokens = applyAppTheme(theme, mode)
    const background = tokens['--background-base'] ?? tokens['--background']
    if (window.shob && background) {
      void nativeApi.invoke('set_window_background', { color: background }).catch(() => undefined)
      void nativeApi.invoke('set_browser_theme', {
        mode,
        background,
        surface:
          tokens['--surface-raised-stronger-non-alpha'] ??
          tokens['--surface-raised-stronger'] ??
          tokens['--surface-raised-base'] ??
          background,
        foreground: tokens['--text-strong'] ?? tokens['--foreground'] ?? (mode === 'dark' ? '#ededed' : '#171717'),
        muted: tokens['--text-base'] ?? tokens['--muted-foreground'] ?? (mode === 'dark' ? '#a0a0a0' : '#6f6f6f'),
        border: tokens['--border-weak-base'] ?? tokens['--border'] ?? (mode === 'dark' ? '#282828' : '#dbdbdb'),
        codeBackground: tokens['--surface-base'] ?? tokens['--muted'] ?? background,
        codeForeground: tokens['--text-base'] ?? tokens['--foreground'] ?? (mode === 'dark' ? '#d4d4d4' : '#27272a'),
      }).catch(() => undefined)
      void nativeApi.invoke('set_titlebar_theme', { mode }).catch(() => undefined)
    }
  })

  onMount(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemMode = () => setSystemMode(mediaQuery.matches ? 'dark' : 'light')

    updateSystemMode()
    mediaQuery.addEventListener('change', updateSystemMode)
    onCleanup(() => mediaQuery.removeEventListener('change', updateSystemMode))
  })

  onMount(() => {
    let timeoutId: number | null = null
    let idleId: number | null = null

    const runDeferredInitialization = () => {
      void Promise.allSettled([loadCliTools(), loadAvailableShells()])
    }

    const scheduleDeferredInitialization = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => {
          runDeferredInitialization()
        }, { timeout: 1500 })
        return
      }

      timeoutId = window.setTimeout(() => {
        runDeferredInitialization()
      }, 250)
    }

    timeoutId = window.setTimeout(scheduleDeferredInitialization, 150)

    onCleanup(() => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
    })
  })

  onMount(() => {
    const handleBeforeUnload = () => {
      void nativeApi.invoke('cleanup_runtime').catch(() => {})
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    onCleanup(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    })
  })



  return (
    <>
      <Toast.Region />
      <div class="flex h-full min-h-0 flex-col overflow-hidden">
        <Show when={!windowChrome.isMac()}>
          <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
            <TitleBar />
          </ErrorBoundary>
        </Show>
        {isBooting() ? (
          <div class="flex-1 bg-black" />
        ) : (
          <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
            <MainView />
          </ErrorBoundary>
        )}
      </div>
    </>
  )
}

export default App
