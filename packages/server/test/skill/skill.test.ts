import { afterEach, test, expect } from "bun:test"
import { Skill } from "../../src/skill"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import fs from "fs/promises"

afterEach(async () => {
  await Instance.disposeAll()
})

async function createGlobalSkill(homeDir: string) {
  const skillDir = path.join(homeDir, ".claude", "skills", "global-test-skill")
  await fs.mkdir(skillDir, { recursive: true })
  await Bun.write(
    path.join(skillDir, "SKILL.md"),
    `---
name: global-test-skill
description: A global skill from ~/.claude/skills for testing.
---

# Global Test Skill

This skill is loaded from the global home directory.
`,
  )
}

test("discovers skills from .shob/skill/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".shob", "skill", "test-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: test-skill
description: A test skill for verification.
---

# Test Skill

Instructions here.
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      const testSkill = skills.find((s) => s.name === "test-skill")
      expect(testSkill).toBeDefined()
      expect(testSkill!.description).toBe("A test skill for verification.")
      expect(testSkill!.location).toContain(path.join("skill", "test-skill", "SKILL.md"))
    },
  })
})

test("returns skill directories from Skill.dirs", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".shob", "skill", "dir-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: dir-skill
description: Skill for dirs test.
---

# Dir Skill
`,
      )
    },
  })

  const home = process.env.SHOB_TEST_HOME
  process.env.SHOB_TEST_HOME = tmp.path

  try {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const dirs = await Skill.dirs()
        const skillDir = path.join(tmp.path, ".shob", "skill", "dir-skill")
        expect(dirs).toContain(skillDir)
      },
    })
  } finally {
    process.env.SHOB_TEST_HOME = home
  }
})

test("discovers multiple skills from .shob/skill/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir1 = path.join(dir, ".shob", "skill", "skill-one")
      const skillDir2 = path.join(dir, ".shob", "skill", "skill-two")
      await Bun.write(
        path.join(skillDir1, "SKILL.md"),
        `---
name: skill-one
description: First test skill.
---

# Skill One
`,
      )
      await Bun.write(
        path.join(skillDir2, "SKILL.md"),
        `---
name: skill-two
description: Second test skill.
---

# Skill Two
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.find((s) => s.name === "skill-one")).toBeDefined()
      expect(skills.find((s) => s.name === "skill-two")).toBeDefined()
    },
  })
})

test("skips skills with missing frontmatter", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".shob", "skill", "no-frontmatter")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `# No Frontmatter

Just some content without YAML frontmatter.
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.find((s) => s.name === "no-frontmatter")).toBeUndefined()
    },
  })
})

test("discovers skills from .claude/skills/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".claude", "skills", "claude-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      const claudeSkill = skills.find((s) => s.name === "claude-skill")
      expect(claudeSkill).toBeDefined()
      expect(claudeSkill!.location).toContain(path.join(".claude", "skills", "claude-skill", "SKILL.md"))
    },
  })
})

test("discovers global skills from ~/.claude/skills/ directory", async () => {
  await using tmp = await tmpdir({ git: true })

  const originalHome = process.env.SHOB_TEST_HOME
  process.env.SHOB_TEST_HOME = tmp.path

  try {
    await createGlobalSkill(tmp.path)
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        const globalSkill = skills.find((s) => s.name === "global-test-skill")
        expect(globalSkill).toBeDefined()
        expect(globalSkill!.description).toBe("A global skill from ~/.claude/skills for testing.")
        expect(globalSkill!.location).toContain(path.join(".claude", "skills", "global-test-skill", "SKILL.md"))
      },
    })
  } finally {
    process.env.SHOB_TEST_HOME = originalHome
  }
})

test("returns empty array when no skills exist", async () => {
  await using tmp = await tmpdir({ git: true })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.every((skill) => !skill.location.startsWith(tmp.path))).toBe(true)
    },
  })
})

test("discovers skills from .agents/skills/ directory", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const skillDir = path.join(dir, ".agents", "skills", "agent-skill")
      await Bun.write(
        path.join(skillDir, "SKILL.md"),
        `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      const agentSkill = skills.find((s) => s.name === "agent-skill")
      expect(agentSkill).toBeDefined()
      expect(agentSkill!.location).toContain(path.join(".agents", "skills", "agent-skill", "SKILL.md"))
    },
  })
})

test("discovers global skills from ~/.agents/skills/ directory", async () => {
  await using tmp = await tmpdir({ git: true })

  const originalHome = process.env.SHOB_TEST_HOME
  process.env.SHOB_TEST_HOME = tmp.path

  try {
    const skillDir = path.join(tmp.path, ".agents", "skills", "global-agent-skill")
    await fs.mkdir(skillDir, { recursive: true })
    await Bun.write(
      path.join(skillDir, "SKILL.md"),
      `---
name: global-agent-skill
description: A global skill from ~/.agents/skills for testing.
---

# Global Agent Skill

This skill is loaded from the global home directory.
`,
    )

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        const globalSkill = skills.find((s) => s.name === "global-agent-skill")
        expect(globalSkill).toBeDefined()
        expect(globalSkill!.description).toBe("A global skill from ~/.agents/skills for testing.")
        expect(globalSkill!.location).toContain(path.join(".agents", "skills", "global-agent-skill", "SKILL.md"))
      },
    })
  } finally {
    process.env.SHOB_TEST_HOME = originalHome
  }
})

test("discovers global skills from ~/.shob/skills/ directory", async () => {
  await using tmp = await tmpdir({ git: true })

  const originalHome = process.env.SHOB_TEST_HOME
  process.env.SHOB_TEST_HOME = tmp.path

  try {
    const skillDir = path.join(tmp.path, ".shob", "skills", "global-shob-skill")
    await fs.mkdir(skillDir, { recursive: true })
    await Bun.write(
      path.join(skillDir, "SKILL.md"),
      `---
name: global-shob-skill
description: A global skill from ~/.shob/skills for testing.
---

# Global Shob Skill
`,
    )

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const skills = await Skill.all()
        const globalSkill = skills.find((s) => s.name === "global-shob-skill")
        expect(globalSkill).toBeDefined()
        expect(globalSkill!.description).toBe("A global skill from ~/.shob/skills for testing.")
        expect(globalSkill!.location).toContain(path.join(".shob", "skills", "global-shob-skill", "SKILL.md"))
      },
    })
  } finally {
    process.env.SHOB_TEST_HOME = originalHome
  }
})

test("discovers skills from both .claude/skills/ and .agents/skills/", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const claudeDir = path.join(dir, ".claude", "skills", "claude-skill")
      const agentDir = path.join(dir, ".agents", "skills", "agent-skill")
      await Bun.write(
        path.join(claudeDir, "SKILL.md"),
        `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
      )
      await Bun.write(
        path.join(agentDir, "SKILL.md"),
        `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const skills = await Skill.all()
      expect(skills.find((s) => s.name === "claude-skill")).toBeDefined()
      expect(skills.find((s) => s.name === "agent-skill")).toBeDefined()
    },
  })
})

test("properly resolves directories that skills live in", async () => {
  await using tmp = await tmpdir({
    git: true,
    init: async (dir) => {
      const shobSkillDir = path.join(dir, ".shob", "skill", "agent-skill")
      const shobSkillsDir = path.join(dir, ".shob", "skills", "agent-skill")
      const claudeDir = path.join(dir, ".claude", "skills", "claude-skill")
      const agentDir = path.join(dir, ".agents", "skills", "agent-skill")
      await Bun.write(
        path.join(claudeDir, "SKILL.md"),
        `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
      )
      await Bun.write(
        path.join(agentDir, "SKILL.md"),
        `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
      )
      await Bun.write(
        path.join(shobSkillDir, "SKILL.md"),
        `---
name: shob-skill
description: A skill in the .shob/skill directory.
---

# Shob Skill
`,
      )
      await Bun.write(
        path.join(shobSkillsDir, "SKILL.md"),
        `---
name: shob-skill
description: A skill in the .shob/skills directory.
---

# Shob Skill
`,
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const dirs = await Skill.dirs()
      expect(dirs).toContain(path.join(tmp.path, ".claude", "skills", "claude-skill"))
      expect(dirs).toContain(path.join(tmp.path, ".agents", "skills", "agent-skill"))
      expect(dirs).toContain(path.join(tmp.path, ".shob", "skill", "agent-skill"))
      expect(dirs).toContain(path.join(tmp.path, ".shob", "skills", "agent-skill"))
    },
  })
})
