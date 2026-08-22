/** TeX-to-HTML via KaTeX with three-arm error fallback. */

import katex from "katex"

export function renderTexToHtml(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, { displayMode, throwOnError: true })
  } catch (error) {
    try {
      return katex.renderToString(value, { displayMode, strict: "ignore", throwOnError: false })
    } catch {
      const escaped = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
      return `<span class="katex-error" style="color: #cc0000" title="${String(error).replace(/"/g, "&quot;")}">${escaped}</span>`
    }
  }
}
