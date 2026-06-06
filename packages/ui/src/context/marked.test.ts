import { describe, expect, test } from "bun:test"
import { createMarkdownParser, renderMarkdownLink } from "./marked"

async function parse(markdown: string) {
  const parser = createMarkdownParser()
  return Promise.resolve(parser.parse(markdown))
}

describe("marked context parser", () => {
  test("renders math with the configured KaTeX extension", async () => {
    const html = await parse("Inline math: $a + b$")

    expect(html).toContain("katex")
    expect(html).toContain("a + b")
  })

  test("keeps rich link labels while adding external link attributes", async () => {
    const html = await parse("[**Docs**](https://example.com)")

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('class="external-link"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain("<strong>Docs</strong>")
  })

  test("escapes generated link attributes before sanitization", () => {
    const html = renderMarkdownLink({
      href: 'https://example.com/?q=" onmouseover="alert(1)',
      title: 'Docs "quoted" & more',
      text: "Docs",
    })

    expect(html).toContain('href="https://example.com/?q=&quot; onmouseover=&quot;alert(1)"')
    expect(html).toContain('title="Docs &quot;quoted&quot; &amp; more"')
    expect(html).not.toContain('onmouseover="alert(1)"')
  })

  test("does not emit javascript links as clickable hrefs", async () => {
    const html = await parse("[bad](javascript:alert(1))")

    expect(html).toContain('class="external-link"')
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("target=\"_blank\"")
  })

  test("applies math rendering to native parser output", async () => {
    const parser = createMarkdownParser({
      nativeParser: async (markdown) => `<p>${markdown}</p>`,
    })
    const html = await parser.parse("Native math: $x^2$")

    expect(html).toContain("katex")
    expect(html).toContain("x")
  })
})
