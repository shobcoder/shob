# Skills System (Agent “Plugins”)

In the Shob **agent**, the practical “plugin” model for extending the model’s
capabilities is **Skills** — not the developer SDK at `@shob/plugin`.

A **skill** is a folder (or remote pack) of instructions and optional files that
the agent can **discover**, see in context, then **load on demand** with the
`skill` tool. Think of skills as **installable playbooks**: Cloudflare,
configuring Shob, your team’s deploy runbook, etc.

This document explains how skills work end-to-end in the desktop/server stack.

> **Full agent plugins** (skills + MCP + tools + package install):  
> see **[agent-plugin-architecture.md](./agent-plugin-architecture.md)**.  
> **Server developer host** (`@shob/plugin` V1/V2): [plugin-system.md](./plugin-system.md).  
> **This doc:** skills only (`SKILL.md`, discovery, permissions, `skill` tool).

---

## Table of contents

1. [What a skill is](#1-what-a-skill-is)
2. [End-to-end flow](#2-end-to-end-flow)
3. [Skill package layout](#3-skill-package-layout)
4. [Where skills are discovered](#4-where-skills-are-discovered)
5. [Config](#5-config)
6. [Runtime services](#6-runtime-services)
7. [The `skill` tool](#7-the-skill-tool)
8. [Permissions](#8-permissions)
9. [Built-in skills](#9-built-in-skills)
10. [Remote skills (URLs)](#10-remote-skills-urls)
11. [How the model sees skills](#11-how-the-model-sees-skills)
12. [Authoring guide](#12-authoring-guide)
13. [Debugging](#13-debugging)
14. [File index](#14-file-index)

---

## 1. What a skill is

| Concept | Meaning |
| --- | --- |
| **Skill** | Named instruction pack the agent may load when relevant |
| **SKILL.md** | Canonical entry file (YAML frontmatter + markdown body) |
| **Skill directory** | Folder containing `SKILL.md` plus optional `scripts/`, `references/`, etc. |
| **Source** | Where skills come from: directory, URL index, or embedded (built-in) |
| **`skill` tool** | Model tool that injects a skill’s body (and file list) into the conversation |

Skills are **not** always in the prompt. The model usually sees a **catalog**
(name + description). When a task matches, it calls the tool with the skill
`name` and receives the full instructions.

That design keeps the system prompt small while allowing deep, specialized
guidance on demand — the same idea as “plugins” in many agent products.

---

## 2. End-to-end flow

```text
┌──────────────────────────────────────────────────────────────────┐
│ Discovery (project / global / config / URL / built-in)           │
│   → parse SKILL.md frontmatter → Skill.Info { name, description, │
│     location, content }                                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ Availability filter (agent permissions for action "skill")       │
│   → list shown to the model in system / context                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ Model decides task matches a skill description                   │
│   → tool call: skill({ name: "cloudflare" })                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ Skill tool                                                       │
│   1. Resolve skill by name                                       │
│   2. Permission assert (skill / name)                            │
│   3. Load content + sample sibling files (if SKILL.md folder)    │
│   4. Return <skill_content>… into the conversation               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Skill package layout

### Minimal skill

```text
my-skill/
  SKILL.md
```

### Full skill (common pattern)

```text
my-skill/
  SKILL.md                 # required entry
  references/              # deep docs the skill body points to
    workers.md
  scripts/                 # optional helper scripts
  assets/
```

### SKILL.md format

YAML frontmatter + markdown body:

```markdown
---
name: cloudflare
description: >
  Comprehensive Cloudflare platform skill covering Workers, Pages, storage…
  Use for any Cloudflare development task.
---

# Cloudflare Platform Skill

…instructions, decision trees, paths to references/…
```

| Frontmatter field | Required | Purpose |
| --- | --- | --- |
| `name` | Yes (V1 host); V2 can fall back to file basename in some cases | Stable ID used by the `skill` tool |
| `description` | Strongly recommended | Shown in the available-skills list; drives model selection |
| `slash` | Optional (V2 schema) | Whether the skill participates in slash UX (if wired) |

**Body:** free-form markdown. Best skills tell the model *when* to use them,
*decision trees*, and *relative paths* into the skill folder.

When loaded, the tool tells the model the **base directory** of the skill so
relative paths (`references/workers.md`) resolve correctly.

### Name rules and duplicates

- Skills are keyed by **`name`** (not folder name).
- If two files declare the same `name`, the later load typically **overwrites**
  or logs a warning (V1 logs `"duplicate skill name"` with both paths).
- Built-in skills are registered **first** so a disk skill with the same name
  can override them.

---

## 4. Where skills are discovered

There are two related implementations in the monorepo:

| Layer | Package | Role today |
| --- | --- | --- |
| **V1 Skill service** | `packages/shob/src/skill` | Project-instance discovery used heavily by the product server |
| **V2 SkillV2 domain** | `packages/core/src/skill.ts` | Source-based transform domain + shared skill tool |

They share the same *idea* (SKILL.md packs + load tool). Details below focus on
behavior the agent actually sees.

### 4.1 Project and config directories (V1 discovery)

Scanned patterns include:

| Pattern | Roots |
| --- | --- |
| `{skill,skills}/**/SKILL.md` | Config directories (`.shob/`, etc.) |
| `skills/**/SKILL.md` | Global / project external dirs |
| `**/SKILL.md` | Explicit `skills.paths` entries |

### 4.2 “External” agent skill conventions

Unless disabled by runtime flags:

| Directory | Scope |
| --- | --- |
| `~/.claude/skills/**/SKILL.md` | Global (optional; can disable) |
| `~/.agents/skills/**/SKILL.md` | Global |
| Project-upward `.claude` / `.agents` | From project dir up to worktree |

Flags:

- `disableExternalSkills` — skip external agent skill roots
- `disableClaudeCodeSkills` — skip `.claude` only, keep `.agents`

### 4.3 Config-declared paths and URLs

From config (see [§5](#5-config)):

- **paths** — extra directories to scan recursively for `SKILL.md`
- **urls** — remote skill indexes (downloaded/cached, then scanned)

### 4.4 V2 sources (SkillV2)

`SkillV2` tracks **sources**, not raw file lists:

| Source type | Meaning |
| --- | --- |
| `directory` | Absolute path to scan for `*.md` / `**/SKILL.md` |
| `url` | Pull via discovery, then scan cached dirs |
| `embedded` | In-memory skill (built-ins) |

Config projection plugin (`config-skill`) registers:

- `{configDir}/skill` and `{configDir}/skills` for each config directory
- Each config `skills` entry as directory or URL source

Built-in `SkillPlugin` registers the embedded `customize-shob` skill.

---

## 5. Config

Typical shape (names may appear under `skills` in config docs / V1):

```jsonc
{
  "skills": {
    // Extra folders (absolute, project-relative, or ~/…)
    "paths": ["./team-skills", "~/shared/shob-skills"],
    // Remote indexes ending in / with index.json
    "urls": ["https://example.com/.well-known/skills/"]
  }
}
```

V2 config documents may also list skill path/url strings under `skills` arrays
that `ConfigSkillPlugin` turns into sources.

**Path expansion:**

- `~/…` → user home
- Relative → project directory
- Absolute → used as-is
- Missing directory → warning, skip

---

## 6. Runtime services

### 6.1 V1 `Skill.Service` (`@shob/Skill`)

`packages/shob/src/skill/index.ts`

| API | Behavior |
| --- | --- |
| `get(name)` | Lookup one skill |
| `require(name)` | Lookup or `NotFoundError` with available names |
| `all()` | Every loaded skill |
| `dirs()` | Directories involved in discovery |
| `available(agent?)` | Filter by permission for that agent |

Init per project instance:

1. Seed built-in `customize-shob`
2. Discover paths (external + config + urls)
3. Parse each `SKILL.md` (frontmatter validation)
4. Publish session errors on parse failure

Helper `Skill.fmt(list, { verbose })` formats the catalog for prompts:

- Short: markdown bullet list of name + description  
- Verbose: XML-ish `<available_skills>` block including locations  

### 6.2 V2 `SkillV2.Service` (`@shob/v2/Skill`)

`packages/core/src/skill.ts`

| API | Behavior |
| --- | --- |
| `transform` / `reload` | Domain transform pattern (plugins add sources) |
| `sources()` | Registered sources |
| `list()` | Load all sources (cached per source key), merge by name |

`SkillV2.available(skills, agent)` filters with `PermissionV2.evaluate("skill", name, agent.permissions)`.

### 6.3 Skill discovery (remote)

`packages/shob/src/skill/discovery.ts` (and core counterpart under `skill/discovery`):

1. GET `{base}/index.json`
2. Schema: `{ skills: [{ name, files[], version? }] }`
3. Each skill must include `SKILL.md` in `files` or is skipped with a warning
4. Download listed files into a cache dir (e.g. under global cache `skills/`)
5. Return local directories for scanning

Index example (fixture style):

```json
{
  "skills": [
    {
      "name": "cloudflare",
      "files": ["SKILL.md", "references/workers.md"]
    }
  ]
}
```

---

## 7. The `skill` tool

Implementation: `packages/core/src/tool/skill.ts` (V2 registry).  
Related V1 tool wiring lives under `packages/shob/src/tool/skill.ts` + registry.

### Contract

| Field | Value |
| --- | --- |
| Tool name | `skill` |
| Input | `{ name: string }` — must match a skill in the available list |
| Output | `{ name, directory, output }` where `output` is text for the model |

### Description (model-facing)

Roughly:

> Load a specialized skill when the task matches one of the available skills.  
> Injects instructions and resources. Name must match the available list.

### Execute steps

1. `skills.list()` (or V1 equivalent)
2. Find skill by `name` → else failure `"Unable to load skill …"`
3. **Permission assert** for action `skill`, resource = skill name
4. If entry file is `SKILL.md`, glob sibling files under the skill directory
   (exclude `SKILL.md` itself), sort, take up to **10** sample paths
5. Build model text via `toModelOutput`:

```xml
<skill_content name="cloudflare">
# Skill: cloudflare

…markdown body…

Base directory for this skill: /path/to/cloudflare
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
Note: file list is sampled.

<skill_files>
<file>/path/to/cloudflare/references/workers.md</file>
…
</skill_files>
</skill_content>
```

The model is expected to follow the body and use other tools (`read`, `bash`, …)
against that base directory as needed. The skill tool itself does **not** execute
scripts; it only injects guidance + path hints.

---

## 8. Permissions

Skills participate in the permission system like other gated actions.

| Piece | Role |
| --- | --- |
| Action | `"skill"` |
| Resource | Skill **name** (e.g. `cloudflare`) |
| List filter | `available()` drops skills with effect/action `deny` |
| Tool load | `permission.assert` before returning content |

Agents can be configured so some skills never appear, or appear but require
approval when loaded. Exact rule syntax follows the shared permission config
used for tools.

---

## 9. Built-in skills

### `customize-shob`

Registered as:

- V1: hardcoded into skill state before disk load  
- V2: `packages/core/src/plugin/skill.ts` embedded source  

**When to use (description summary):** only when the user is editing Shob’s own
configuration (`shob.json`, `.shob/`, agents, skills, MCP, permissions, etc.) —
not for the user’s application code.

Body content is shipped as markdown
(`packages/core/src/plugin/skill/customize-opencode.md`).

Users can override by providing a disk skill with the same `name`.

---

## 10. Remote skills (URLs)

Remote skills are **indexes**, not a single SKILL.md URL.

```text
https://example.com/.well-known/skills/
  index.json
  cloudflare/SKILL.md
  cloudflare/references/...
```

Flow:

```text
config.skills.urls[]
  → Discovery.pull(url)
  → cache under global skills cache
  → scan SKILL.md
  → same Info registry as local skills
```

Failures (network, bad index) are logged; discovery returns empty dirs so local
skills still work.

---

## 11. How the model sees skills

Typical agent turn:

1. System / context includes an **available skills** section (`Skill.fmt` or
   equivalent context source)
2. Only skills with descriptions (and not denied) are listed
3. Model chooses to call `skill` when the user task matches a description
4. Tool result expands the skill body into the transcript
5. Model continues with normal tools, following skill instructions

Skills that lack `description` may be omitted from the short catalog (V1 `fmt`
filters to skills with a description). Always set a clear description.

---

## 12. Authoring guide

### Create a project skill

```text
# in the project (or under .shob / skills roots your discovery uses)
skills/
  deploy/
    SKILL.md
    scripts/
      deploy.sh
```

`SKILL.md`:

```markdown
---
name: deploy
description: >
  Deploy this service to staging or production. Use when the user asks to
  ship, release, or deploy. Do not use for local-only builds.
---

# Deploy skill

## When to use
- User asks to deploy / release / ship

## Steps
1. Confirm environment (staging vs prod)
2. Run `scripts/deploy.sh` from this skill's base directory via the bash tool
3. Verify health endpoint …

## Notes
- Never deploy prod without explicit user confirmation
```

### Writing a good description

The description is the **routing signal**. Bad: `"Helper skill"`.  
Good: concrete triggers + boundaries (“Use when… Do not use when…”).

### Relative resources

Prefer paths relative to the skill folder. After load, the model knows the base
directory and the sampled file list.

### Team distribution

- **Git:** commit `skills/` in the repo  
- **Shared disk:** `skills.paths`  
- **Remote pack:** host `index.json` + files; add URL in config  

### Do / don’t

| Do | Don’t |
| --- | --- |
| One clear `name` per skill | Reuse names across unrelated packs |
| Strong description for matching | Dump entire monorepo docs into SKILL.md |
| Decision trees + next files to read | Assume the model already knows your layout |
| Permission-sensitive names | Put secrets inside SKILL.md |

---

## 13. Debugging

| Symptom | Check |
| --- | --- |
| Skill missing from list | Path/pattern, frontmatter parse, missing `description`, permission deny, flags |
| `Unable to load skill X` | Name typo vs frontmatter `name`; skill not discovered |
| Parse errors in session | Invalid YAML frontmatter; look for `SkillInvalidError` / frontmatter logs |
| Duplicate name warning | Two SKILL.md files share `name` — last wins |
| Remote skill empty | `index.json` fetch failed; skill entry missing `SKILL.md` in `files` |
| External Claude skills missing | `disableClaudeCodeSkills` or `disableExternalSkills` |
| Tool denied | Permission rules for action `skill` / resource name |

Useful code:

- Discovery + load: `packages/shob/src/skill/index.ts`
- Tool: `packages/core/src/tool/skill.ts`
- Built-in: `packages/core/src/plugin/skill.ts`
- Config sources: `packages/core/src/config/plugin/skill.ts`
- Remote pull: `packages/shob/src/skill/discovery.ts`
- Fixtures: `packages/shob/test/fixture/skills/`

---

## 14. File index

| Path | Role |
| --- | --- |
| `packages/schema/src/skill.ts` | Skill Info + Source schemas |
| `packages/core/src/skill.ts` | SkillV2 domain (sources, list, cache) |
| `packages/core/src/tool/skill.ts` | `skill` tool implementation |
| `packages/core/src/plugin/skill.ts` | Built-in embedded skill plugin |
| `packages/core/src/plugin/skill/customize-opencode.md` | Built-in body |
| `packages/core/src/config/plugin/skill.ts` | Config → skill sources |
| `packages/shob/src/skill/index.ts` | Product Skill service + discovery scan |
| `packages/shob/src/skill/discovery.ts` | URL index download/cache |
| `packages/shob/src/tool/skill.ts` | V1 tool description/wiring |
| `packages/shob/test/fixture/skills/` | Example skill packs |

---

## Glossary

| Term | Meaning |
| --- | --- |
| **Skill** | On-demand instruction pack for the coding agent |
| **SKILL.md** | Entry document with frontmatter + body |
| **Source** | Directory, URL, or embedded origin of skills |
| **Discovery** | Scan/download that finds SKILL.md files |
| **Catalog** | Name + description list shown to the model |
| **`skill` tool** | Loads full skill content into the conversation |
| **Permission `skill`** | Gate on listing/loading by skill name |

---

## Related docs

| Doc | Relationship |
| --- | --- |
| [architecture-overview.md](./architecture-overview.md) | Where `skill` sits among tools and core domains |
| [plugin-system.md](./plugin-system.md) | **Different** system: developer server plugins (`@shob/plugin`) |
| [architecture.md](./architecture.md) | Desktop ↔ server wiring |

---

*Skills are the agent’s extensibility layer for specialized knowledge. Prefer
adding a skill when you want the model to follow a playbook; use the developer
plugin host only when you need new tools, providers, or server hooks.*
