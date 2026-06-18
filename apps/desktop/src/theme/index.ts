import { resolveThemeVariant } from "./resolve"
import type { DesktopTheme, ResolvedTheme, ThemeVariant } from "./types"

export type ThemeScheme = "system" | "light" | "dark"
export type ResolvedThemeMode = "light" | "dark"
export type ShobThemeVariant = ThemeVariant
export type ShobTheme = DesktopTheme

const files = import.meta.glob<{ default: ShobTheme }>("./themes/*.json", { eager: true })

export const SHOB_THEMES: Record<string, ShobTheme> = Object.fromEntries(
  Object.values(files).map((mod) => [mod.default.id, mod.default]),
)

export const SHOB_THEME_LIST = Object.values(SHOB_THEMES).sort((a, b) => a.name.localeCompare(b.name))

const FALLBACK_THEME_ID = 'oc-2'

const toCssVars = (tokens: ResolvedTheme): Record<string, string> =>
  Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`--${key}`, value]))

const pick = (tokens: ResolvedTheme, key: string, fallback: string) => tokens[key] ?? fallback

export const resolveAppThemeTokens = (theme: ShobTheme, mode: 'light' | 'dark'): Record<string, string> => {
  const isDark = mode === 'dark'
  const tokens = resolveThemeVariant(isDark ? theme.dark : theme.light, isDark)
  const background = pick(tokens, "background-base", isDark ? "#101010" : "#f8f8f8")
  const foreground = pick(tokens, "text-strong", isDark ? "#ededed" : "#171717")
  const raised = pick(tokens, "surface-raised-base", isDark ? "#232323" : "#f3f3f3")
  const muted = pick(tokens, "surface-base-hover", isDark ? "#282828" : "#eeeeee")
  const mutedText = pick(tokens, "text-base", isDark ? "#a0a0a0" : "#6f6f6f")
  const accent = pick(tokens, "surface-interactive-weak", isDark ? "#0d172b" : "#f5faff")
  const primary = pick(tokens, "surface-brand-base", isDark ? "#fab283" : "#dcde8d")
  const interactive = pick(tokens, "border-interactive-active", "#034cff")
  const border = pick(tokens, "border-weak-base", isDark ? "#282828" : "#dbdbdb")
  const borderWeaker = pick(tokens, "border-weaker-base", isDark ? "#232323" : "#e8e8e8")
  const destructive = pick(tokens, "surface-critical-strong", "#fc533a")

  return {
    ...toCssVars(tokens),
    '--background': background,
    '--foreground': foreground,
    '--card': raised,
    '--card-foreground': foreground,
    '--popover': raised,
    '--popover-foreground': foreground,
    '--primary': primary,
    '--primary-foreground': pick(tokens, "text-on-brand-base", background),
    '--secondary': raised,
    '--secondary-foreground': foreground,
    '--muted': muted,
    '--muted-foreground': mutedText,
    '--accent': accent,
    '--accent-foreground': foreground,
    '--destructive': destructive,
    '--border': border,
    '--input': raised,
    '--ring': interactive,
    '--sidebar': background,
    '--sidebar-foreground': foreground,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': pick(tokens, "text-on-brand-base", background),
    '--sidebar-accent': raised,
    '--sidebar-accent-foreground': foreground,
    '--sidebar-border': borderWeaker,
    '--sidebar-ring': interactive,
    '--term-bg': background,
    '--icon-weaker': pick(tokens, "icon-weak-base", isDark ? "#343434" : "#c7c7c7"),
    '--icon-strong': pick(tokens, "icon-strong-base", foreground),
  }
}

export const resolveThemeMode = (scheme: ThemeScheme, systemMode: ResolvedThemeMode): ResolvedThemeMode =>
  scheme === 'dark' || (scheme === 'system' && systemMode === 'dark') ? 'dark' : 'light'

let lastAppliedThemeKey: string | null = null
let lastAppliedThemeTokens: Record<string, string> | null = null

export const applyAppTheme = (theme: ShobTheme, mode: ResolvedThemeMode): Record<string, string> => {
  const tokens = resolveAppThemeTokens(theme, mode)

  if (typeof document !== 'undefined') {
    const root = document.documentElement
    const themeKey = `${theme.id}:${mode}`
    const isAlreadyApplied =
      lastAppliedThemeKey === themeKey &&
      root.dataset.theme === theme.id &&
      root.dataset.colorScheme === mode

    if (!isAlreadyApplied) {
      root.classList.add('no-transitions')

      Object.entries(tokens).forEach(([key, value]) => {
        if (lastAppliedThemeTokens?.[key] !== value) {
          root.style.setProperty(key, value)
        }
      })
      root.dataset.theme = theme.id
      root.dataset.colorScheme = mode
      root.style.colorScheme = mode
      root.classList.toggle('dark', mode === 'dark')
      lastAppliedThemeKey = themeKey
      lastAppliedThemeTokens = tokens

      // Force layout reflow to apply styles immediately
      const _ = root.offsetHeight

      // Remove the disabling class to re-enable transitions for normal interactions
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.classList.remove('no-transitions')
        })
      })
    }
  }

  return tokens
}

export const getThemeById = (id: string | null | undefined): ShobTheme => SHOB_THEMES[id ?? ''] ?? SHOB_THEMES[FALLBACK_THEME_ID]
