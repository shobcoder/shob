/**
 * Synchronous fine-grained Shiki highlighter singleton with CSS variables theme
 * and on-demand lazy grammar loading.
 */

import { createHighlighterCoreSync, createCssVariablesTheme } from "shiki/core"
import { createJavaScriptRegexEngine, defaultJavaScriptRegexConstructor } from "shiki/engine/javascript"
import langTs from "@shikijs/langs/typescript"
import langBash from "@shikijs/langs/shellscript"
import langJson from "@shikijs/langs/json"
import type { HighlighterCore } from "shiki/core"

type LangModule = { default: typeof langTs }

const LANGS = [langTs, langBash, langJson]

const LAZY_GRAMMARS = new Map<string, () => Promise<LangModule>>([
  ["python", () => import("@shikijs/langs/python") as Promise<LangModule>],
  ["ruby", () => import("@shikijs/langs/ruby") as Promise<LangModule>],
  ["go", () => import("@shikijs/langs/go") as Promise<LangModule>],
  ["rust", () => import("@shikijs/langs/rust") as Promise<LangModule>],
  ["java", () => import("@shikijs/langs/java") as Promise<LangModule>],
  ["c", () => import("@shikijs/langs/c") as Promise<LangModule>],
  ["cpp", () => import("@shikijs/langs/cpp") as Promise<LangModule>],
  ["csharp", () => import("@shikijs/langs/csharp") as Promise<LangModule>],
  ["kotlin", () => import("@shikijs/langs/kotlin") as Promise<LangModule>],
  ["swift", () => import("@shikijs/langs/swift") as Promise<LangModule>],
  ["php", () => import("@shikijs/langs/php") as Promise<LangModule>],
  ["yaml", () => import("@shikijs/langs/yaml") as Promise<LangModule>],
  ["toml", () => import("@shikijs/langs/toml") as Promise<LangModule>],
  ["ini", () => import("@shikijs/langs/ini") as Promise<LangModule>],
  ["markdown", () => import("@shikijs/langs/markdown") as Promise<LangModule>],
  ["mdx", () => import("@shikijs/langs/mdx") as Promise<LangModule>],
  ["html", () => import("@shikijs/langs/html") as Promise<LangModule>],
  ["css", () => import("@shikijs/langs/css") as Promise<LangModule>],
  ["scss", () => import("@shikijs/langs/scss") as Promise<LangModule>],
  ["less", () => import("@shikijs/langs/less") as Promise<LangModule>],
  ["sql", () => import("@shikijs/langs/sql") as Promise<LangModule>],
  ["xml", () => import("@shikijs/langs/xml") as Promise<LangModule>],
  ["lua", () => import("@shikijs/langs/lua") as Promise<LangModule>],
])

const LANG_ALIASES = new Map<string, string>([
  ["typescript", "typescript"],
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["javascript", "typescript"],
  ["js", "typescript"],
  ["jsx", "typescript"],
  ["shellscript", "shellscript"],
  ["bash", "shellscript"],
  ["sh", "shellscript"],
  ["shell", "shellscript"],
  ["zsh", "shellscript"],
  ["json", "json"],
  ["jsonc", "json"],
  ["py", "python"],
  ["python", "python"],
  ["rb", "ruby"],
  ["ruby", "ruby"],
  ["go", "go"],
  ["rs", "rust"],
  ["rust", "rust"],
  ["java", "java"],
  ["c", "c"],
  ["cpp", "cpp"],
  ["cs", "csharp"],
  ["csharp", "csharp"],
  ["kotlin", "kotlin"],
  ["swift", "swift"],
  ["php", "php"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "toml"],
  ["ini", "ini"],
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["mdx", "mdx"],
  ["html", "html"],
  ["css", "css"],
  ["scss", "scss"],
  ["less", "less"],
  ["sql", "sql"],
  ["xml", "xml"],
  ["lua", "lua"],
])

const cssVariablesTheme = createCssVariablesTheme({
  name: "css-variables",
  variablePrefix: "--shiki-",
  fontStyle: true,
})

const regexEngine = createJavaScriptRegexEngine({
  forgiving: true,
  regexConstructor: (pattern) =>
    defaultJavaScriptRegexConstructor(pattern, {
      lazyCompileLength: Number.POSITIVE_INFINITY,
    }),
})

let singleton: HighlighterCore | undefined

const BOOT_GRAMMAR_WARMUPS = [
  { lang: "typescript", code: "const answer: number = 42" },
  { lang: "shellscript", code: 'printf \'%s\\n\' "$HOME"' },
  { lang: "json", code: '{"ready":true}' },
] as const

function createHighlighter(): HighlighterCore {
  const instance = createHighlighterCoreSync({
    themes: [cssVariablesTheme],
    langs: LANGS,
    engine: regexEngine,
  })
  for (const sample of BOOT_GRAMMAR_WARMUPS) {
    try {
      instance.codeToTokens(sample.code, {
        lang: sample.lang,
        theme: "css-variables",
        tokenizeTimeLimit: 0,
      })
    } catch {}
  }
  return instance
}

export function highlighter(): HighlighterCore {
  singleton ??= createHighlighter()
  return singleton
}

const requested = new Set<string>()
const listeners = new Set<() => void>()
let loadCount = 0

export function subscribeGrammarLoaded(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function grammarLoadCount(): number {
  return loadCount
}

function ensureGrammar(resolved: string): boolean {
  const load = LAZY_GRAMMARS.get(resolved)
  if (load === undefined) return true
  if (highlighter().getLoadedLanguages().includes(resolved)) return true
  if (!requested.has(resolved)) {
    requested.add(resolved)
    void load()
      .then((mod) => {
        highlighter().loadLanguageSync(mod.default)
        loadCount += 1
        for (const listener of listeners) listener()
      })
      .catch(() => {})
  }
  return false
}

if (typeof setTimeout !== "undefined") {
  const timer = setTimeout(() => {
    try {
      highlighter()
    } catch {}
  }, 0)
  ;(timer as { unref?: () => void }).unref?.()
}

export function highlightToHtml(code: string, lang: string | undefined): string | undefined {
  const resolved = lang === undefined ? undefined : LANG_ALIASES.get(lang.toLowerCase())
  if (resolved === undefined) return undefined
  if (!ensureGrammar(resolved)) return undefined
  try {
    return highlighter().codeToHtml(code, { lang: resolved, theme: "css-variables" })
  } catch {
    return undefined
  }
}

export interface HighlightSpan {
  text: string
  style: Record<string, string | undefined>
}

export function highlightLines(code: string, lang: string | undefined): HighlightSpan[][] | undefined {
  const resolved = lang === undefined ? undefined : LANG_ALIASES.get(lang.toLowerCase())
  if (resolved === undefined) return undefined
  if (!ensureGrammar(resolved)) return undefined
  try {
    const { tokens } = highlighter().codeToTokens(code, { lang: resolved, theme: "css-variables" })
    const last = tokens[tokens.length - 1]
    const lines = tokens.length > 1 && last !== undefined && last.length === 0 ? tokens.slice(0, -1) : tokens
    return lines.map((line) =>
      line.map((token) => ({ text: token.content, style: { color: token.color } })),
    )
  } catch {
    return undefined
  }
}
