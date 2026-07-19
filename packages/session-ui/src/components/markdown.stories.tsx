// @ts-nocheck
import * as mod from "./markdown"
import { create } from "@shob/ui/storybook/scaffold"
import { markdown } from "@shob/ui/storybook/fixtures"

const docs = `### Overview
Render sanitized Markdown with dense IDE-style typography, code panels, inline code, and safe links.

Pair with \`Code\` for standalone code views.

### API
- Required: \`text\` Markdown string.
- Uses the Marked context provider for parsing and sanitization.

### Variants and states
- Code blocks render as panels with a language header and copy control.

### Behavior
- Sanitizes HTML and auto-converts inline URL code to links.
- Adds language labels and copy buttons to code blocks.

### Accessibility
- Copy buttons include aria-labels from i18n.
- TODO: confirm link target behavior in sanitized output.

### Theming/tokens
- Uses \`data-component="markdown"\` plus \`markdown-code-header\` / \`markdown-code-language\` slots.

`

const story = create({
  title: "UI/Markdown",
  mod,
  args: {
    text: markdown,
  },
})

export default {
  title: "UI/Markdown",
  id: "components-markdown",
  component: story.meta.component,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const Basic = story.Basic
