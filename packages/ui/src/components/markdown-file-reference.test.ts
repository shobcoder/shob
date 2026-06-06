import { describe, expect, test } from "bun:test"
import { markdownInlineCodeFileReference, splitMarkdownFileReferences } from "./markdown"

function files(text: string) {
  return splitMarkdownFileReferences(text)
    .filter((segment) => segment.file)
    .map((segment) => segment.text)
}

describe("markdown file references", () => {
  test("marks inline code paths as file references", () => {
    expect(markdownInlineCodeFileReference("src/routes/contact/+page.svelte")).toEqual({
      text: "src/routes/contact/+page.svelte",
      path: "src/routes/contact/+page.svelte",
    })
    expect(markdownInlineCodeFileReference("src/routes/[slug]/+page.svelte:123")).toEqual({
      text: "src/routes/[slug]/+page.svelte:123",
      path: "src/routes/[slug]/+page.svelte",
    })
    expect(markdownInlineCodeFileReference("Header.svelte")).toEqual({
      text: "Header.svelte",
      path: "Header.svelte",
    })
    expect(markdownInlineCodeFileReference("src/components/AgentView.tsx (line 218)")).toEqual({
      text: "src/components/AgentView.tsx (line 218)",
      path: "src/components/AgentView.tsx",
    })
    expect(markdownInlineCodeFileReference("C:\\Users\\sera\\Desktop\\shob\\src\\index.css")).toEqual({
      text: "C:\\Users\\sera\\Desktop\\shob\\src\\index.css",
      path: "C:\\Users\\sera\\Desktop\\shob\\src\\index.css",
    })
  })

  test("keeps non-path inline code normal", () => {
    expect(markdownInlineCodeFileReference("Undo")).toBeUndefined()
    expect(markdownInlineCodeFileReference("bun run build:renderer")).toBeUndefined()
    expect(markdownInlineCodeFileReference("fef115c")).toBeUndefined()
  })

  test("finds relative file paths with line suffixes", () => {
    expect(files("Changed src/components/AgentView.tsx (line 218) and src/index.css:3759.")).toEqual([
      "src/components/AgentView.tsx (line 218)",
      "src/index.css:3759",
    ])
  })

  test("finds route paths with brackets and plus-prefixed files", () => {
    expect(files("Updated src/routes/[slug]/+page.svelte and src/routes/api/contact/+server.ts")).toEqual([
      "src/routes/[slug]/+page.svelte",
      "src/routes/api/contact/+server.ts",
    ])
  })

  test("finds Windows-style paths", () => {
    expect(files("Open C:\\Users\\sera\\Desktop\\shob\\src\\index.css next.")).toEqual([
      "C:\\Users\\sera\\Desktop\\shob\\src\\index.css",
    ])
  })

  test("does not mark commands or URLs as file references", () => {
    expect(files("Run bun run build:renderer and see https://example.com/src/index.ts")).toEqual([])
  })
})
