import { describe, expect, it } from "bun:test"
import { parseGfm, parseGfmWithMath } from "./parse"
import { cjkFriendlyStrong } from "./cjkFriendlyStrong"
import { mathCompatibility } from "./mathCompatibility"
import { IncrementalMarkdownParser } from "./incremental"
import { extractMarkdownPlainText } from "./plain-text"
import { highlightToHtml, highlightLines } from "./highlight"
import { renderTexToHtml } from "./katex"

describe("CJK friendly strong emphasis", () => {
  it("closes punctuation-terminated strong emphasis before adjacent CJK text", () => {
    const cases = [
      ["**注意：**内容", "注意："],
      ["**Notice:**内容", "Notice:"],
      ["**事件中间件（waterfall）**实现", "事件中间件（waterfall）"],
      ["**事件中间件(waterfall)**实现", "事件中间件(waterfall)"],
      ["**句号。**后续", "句号。"],
      ["**Period.**后续", "Period."],
      ["**提醒！**继续", "提醒！"],
      ["**Warning!**继续", "Warning!"],
    ] as const

    for (const [input, expectedStrong] of cases) {
      const root = parseGfm(input)
      const paragraph = root.children[0]
      expect(paragraph?.type).toBe("paragraph")
      if (paragraph && "children" in paragraph) {
        const strong = paragraph.children[0]
        expect(strong?.type).toBe("strong")
        if (strong && "children" in strong) {
          const text = strong.children[0]
          expect(text?.type).toBe("text")
          if (text && "value" in text) {
            expect(text.value).toBe(expectedStrong)
          }
        }
      }
    }
  })

  it("keeps the CJK strong extension out of escaped, code, and math contexts", () => {
    const escaped = parseGfm(String.raw`\**注意：**内容`)
    expect(escaped.children[0]?.type).toBe("paragraph")
    // Escaped asterisk should not form strong
    if (escaped.children[0] && "children" in escaped.children[0]) {
      expect(escaped.children[0].children[0]?.type).toBe("text")
    }

    const code = parseGfm("`**注意：**内容`")
    if (code.children[0] && "children" in code.children[0]) {
      expect(code.children[0].children[0]?.type).toBe("inlineCode")
    }
  })
})

describe("TeX math compatibility extension", () => {
  it("parses $...$, $$...$$, \\(...\\), and \\[...\\] correctly", () => {
    const inlineDollar = parseGfmWithMath("Einstein wrote $E = mc^2$.")
    const paragraph1 = inlineDollar.children[0]
    if (paragraph1 && "children" in paragraph1) {
      const mathNode = paragraph1.children.find((c) => c.type === "inlineMath")
      expect(mathNode).toBeDefined()
      if (mathNode && "value" in mathNode) {
        expect(mathNode.value).toBe("E = mc^2")
      }
    }

    const inlineBackslash = parseGfmWithMath(String.raw`Einstein wrote \(E = mc^2\).`)
    const paragraph2 = inlineBackslash.children[0]
    if (paragraph2 && "children" in paragraph2) {
      const mathNode = paragraph2.children.find((c) => c.type === "inlineMath")
      expect(mathNode).toBeDefined()
      if (mathNode && "value" in mathNode) {
        expect(mathNode.value).toBe("E = mc^2")
      }
    }

    const displayDollar = parseGfmWithMath("$$\n\\frac{1}{2}\n$$")
    const mathBlock1 = displayDollar.children[0]
    expect(mathBlock1?.type).toBe("math")
    if (mathBlock1 && "value" in mathBlock1) {
      expect(mathBlock1.value).toBe("\\frac{1}{2}")
    }

    const displayBackslash = parseGfmWithMath("\\[\n\\sum_{i=1}^n i\n\\]")
    const mathBlock2 = displayBackslash.children[0]
    expect(mathBlock2?.type).toBe("math")
    if (mathBlock2 && "value" in mathBlock2) {
      expect(mathBlock2.value).toBe("\\sum_{i=1}^n i")
    }
  })

  it("renders math via KaTeX cleanly", () => {
    const html = renderTexToHtml("E = mc^2", false)
    expect(html).toContain("katex")
    expect(html).toContain("mc")

    const displayHtml = renderTexToHtml("\\frac{a}{b}", true)
    expect(displayHtml).toContain("katex-display")
  })
})

describe("IncrementalMarkdownParser", () => {
  it("freezes prefix blocks and re-parses only unstable tail", () => {
    const parser = new IncrementalMarkdownParser(parseGfm)

    const update1 = parser.update("First paragraph.\n\n")
    expect(update1.frozen.length).toBe(0)
    expect(update1.tail.length).toBe(1)

    const update2 = parser.update("First paragraph.\n\nSecond paragraph.\n\n")
    expect(update2.frozen.length).toBe(0)
    expect(update2.tail.length).toBe(2)

    const update3 = parser.update("First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\n")
    // With 3 blocks and UNSTABLE_TAIL_BLOCKS = 2, the 1st block should be frozen
    expect(update3.frozen.length).toBe(1)
    expect(update3.tail.length).toBe(2)

    const update4 = parser.update(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.\n\n",
    )
    // 2 blocks frozen, 2 in tail
    expect(update4.frozen.length).toBe(2)
    expect(update4.tail.length).toBe(2)
  })

  it("resets gracefully on non-append input", () => {
    const parser = new IncrementalMarkdownParser(parseGfm)
    parser.update("Alpha\n\nBeta\n\nGamma\n\nDelta\n\n")
    const gen1 = parser.update("Alpha\n\nBeta\n\nGamma\n\nDelta\n\n").generation

    const reset = parser.update("Completely different text")
    expect(reset.generation).toBe(gen1 + 1)
    expect(reset.frozen.length).toBe(0)
  })
})

describe("extractMarkdownPlainText", () => {
  const doc = [
    "# Title Heading",
    "",
    "This is the **first** paragraph with [link](https://example.com) and `inline code`.",
    "",
    "Second paragraph with *emphasis*.",
  ].join("\n")

  it("extracts all plain text", () => {
    const text = extractMarkdownPlainText(doc)
    expect(text).toContain("Title Heading")
    expect(text).toContain("This is the first paragraph with link and inline code.")
    expect(text).toContain("Second paragraph with emphasis.")
  })

  it("extracts first line", () => {
    const firstLine = extractMarkdownPlainText(doc, { mode: "first-line" })
    expect(firstLine).toBe("Title Heading")
  })

  it("extracts first paragraph", () => {
    const firstParagraph = extractMarkdownPlainText(doc, { mode: "first-paragraph" })
    expect(firstParagraph).toBe("This is the first paragraph with link and inline code.")
  })
})

describe("highlight", () => {
  it("highlights typescript code using CSS variables theme", () => {
    const html = highlightToHtml("const answer: number = 42", "ts")
    expect(html).toBeDefined()
    expect(html).toContain('class="shiki css-variables"')
    expect(html).toContain("const")
    expect(html).toContain("42")
  })

  it("highlights shell script", () => {
    const html = highlightToHtml("echo 'hello world'", "bash")
    expect(html).toBeDefined()
    expect(html).toContain("echo")
  })

  it("returns undefined for unknown grammar", () => {
    const html = highlightToHtml("some text", "unknown-language-12345")
    expect(html).toBeUndefined()
  })

  it("tokenizes lines into highlight spans", () => {
    const lines = highlightLines("const a = 1\nconst b = 2", "typescript")
    expect(lines).toBeDefined()
    expect(lines?.length).toBe(2)
    expect(lines?.[0]?.[0]?.text).toBe("const")
  })
})
