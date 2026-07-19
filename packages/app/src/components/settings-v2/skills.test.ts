import { describe, expect, test } from "bun:test"
import { skillIcon } from "./skills"

describe("skillIcon", () => {
  test("uses the visual treatment for the built-in skill families", () => {
    expect(skillIcon({ name: "image-gen", category: "creative" })).toBe("image")
    expect(skillIcon({ name: "openai-docs", category: "reference" })).toBe("docs")
    expect(skillIcon({ name: "plugin-creator", category: "development" })).toBe("plugin")
    expect(skillIcon({ name: "review-agent", category: "quality" })).toBe("review")
    expect(skillIcon({ name: "skill-installer", category: "utility" })).toBe("installer")
  })

  test("falls back to the neutral skill icon", () => {
    expect(skillIcon({ name: "custom-skill", category: "other" })).toEqual("sparkles")
  })
})
