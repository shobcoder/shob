# Shobcoder Agent Plugin System — Architecture

This document defines the **Shobcoder agent plugin architecture**: what a
plugin is, how it composes skills, MCP, tools, and hooks, what exists in the
repo today, and how to design and ship a full plugin.

Shobcoder owns this model end-to-end. It does **not** depend on any other agent
product’s plugin runtime, marketplace, or package format.

---

## Table of contents

1. [Problem and goals](#1-problem-and-goals)
2. [Core concepts](#2-core-concepts)
3. [What Shobcoder has today](#3-what-shobcoder-has-today)
4. [Target architecture](#4-target-architecture)
5. [Plugin package format](#5-plugin-package-format)
6. [Runtime pipeline](#6-runtime-pipeline)
7. [Capability layers](#7-capability-layers)
8. [Lifecycle](#8-lifecycle)
9. [Security and permissions](#9-security-and-permissions)
10. [How to create a full plugin](#10-how-to-create-a-full-plugin)
11. [Example: computer-use plugin](#11-example-computer-use-plugin)
12. [Built-in vs user plugins](#12-built-in-vs-user-plugins)
13. [Config and install surfaces](#13-config-and-install-surfaces)
14. [Desktop app UI](#14-desktop-app-ui)
15. [Implementation roadmap](#15-implementation-roadmap)
16. [File / package ownership](#16-file--package-ownership)
17. [Glossary](#17-glossary)
18. [Related docs](#18-related-docs)

---

## 1. Problem and goals

### Problem

Shobcoder already has several extension mechanisms, but they are **fragmented**:

| Mechanism | What it does | Gap |
| --- | --- | --- |
| Skills | On-demand playbooks (`SKILL.md`) | No tools by itself |
| MCP | External tools/servers | Separate config, not packaged with skills |
| V1 `@shob/plugin` hooks | Tools, auth, chat lifecycle | Developer-oriented, not install UX |
| V2 `@shob/plugin` domains | Catalog, agents, AI SDK | Server host, not a single agent plugin package |
| Built-in tools | `bash`, `browser`, … | Hard-coded product surface |

Product and authors need **one installable unit** that can give the agent new
workflows **and** new tools (and optional hooks), for example computer use,
security review, or a custom connector.

### Goals

1. **One concept:** a **Plugin** is the installable unit for agent extension  
2. **Composable contents:** skills + MCP + tools + hooks + optional assets  
3. **Progressive disclosure:** model sees names/descriptions first; deep content
   loads on demand (skills)  
4. **Safe by default:** permissions, approval modes, disable switches  
5. **Local-first:** filesystem / package install without requiring a cloud store  
6. **Built-in path:** product can ship first-party plugins the same way  
7. **Compatible with existing code:** map onto Skills, MCP, V1/V2 hosts rather
   than replace them overnight  
8. **Independent runtime:** no dependency on third-party agent plugin systems  

### Non-goals (v1 of this architecture)

- Full marketplace backend / billing  
- Arbitrary untrusted native code without permission gates  
- Replacing MCP with a proprietary tool protocol  
- Compatibility layers or importers for other products’ plugin formats  

---

## 2. Core concepts

| Concept | Role |
| --- | --- |
| **Skill** | How the agent should do a class of work (instructions, progressive load) |
| **Tool** | What the agent can call (builtin, MCP, or plugin-native) |
| **MCP server** | Isolated process that exposes tools over Model Context Protocol |
| **Hook** | Server lifecycle callback (before/after tool, chat, permissions, …) |
| **Plugin** | Package that installs skills + tools/MCP + hooks together |

```text
Skill     = playbook (when / how)
Tool/MCP  = capability (do the work)
Hook      = policy around runs
Plugin    = one package that wires them for install/enable
```

---

## 3. What Shobcoder has today

### Power already in the stack

```text
                    ┌─────────────────────────────────────┐
                    │           Agent session              │
                    │  tools: bash, browser, skill, …     │
                    │  + MCP tools + custom V1 tools      │
                    └───────────────┬─────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   Skills system              MCP runtime                 Plugin hosts
   SKILL.md / skill tool      local/remote servers        V1 Hooks / V2 domains
   discovery paths/urls       config.mcp.servers          config.plugins
```

| Layer | Location | Agent-visible? |
| --- | --- | --- |
| Skills | `packages/shob/src/skill`, `packages/core/src/skill.ts`, skill tool | Yes |
| MCP | `ConfigMCP`, MCP services | Yes (as tools) |
| V1 hooks/tools | `packages/shob/src/plugin`, `@shob/plugin` | Yes if tools/hooks fire |
| V2 domains | `PluginV2`, providers, catalog | Indirect (models/agents) |
| Browser tool | `packages/shob/src/tool/browser.ts` | Yes (web UI control) |

### Gaps for a full agent plugin product

- Single **plugin manifest** that wires skills + MCP + hooks together  
- Install directory + enable/disable UX  
- Official **plugin package layout** for authors  
- First-class **computer-use** desktop tools (OS mouse/keyboard); browser-only today  

---

## 4. Target architecture

### 4.1 Definition

A **Shobcoder Agent Plugin** is an installable package that may contribute any of:

1. **Skills** — instruction packs for progressive disclosure  
2. **Tools** — native/V1 tools or MCP servers that expose tools  
3. **Hooks** — session lifecycle callbacks (V1-compatible)  
4. **Config fragments** — default MCP, permissions, agent hints  
5. **Metadata** — id, name, version, description, icons  

The agent runtime **activates** an enabled plugin by:

```text
load manifest
  → register skill sources
  → start/attach MCP servers (or register native tools)
  → install hooks
  → publish plugin tools into tool registry (permission-gated)
```

### 4.2 Layered stack

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentation (desktop)                                       │
│  Plugins page: browse / install / enable / configure         │
└────────────────────────────┬─────────────────────────────────┘
                             │ IPC / config write
┌────────────────────────────▼─────────────────────────────────┐
│ Plugin Manager (orchestration layer)                         │
│  install · resolve · enable · disable · validate · order     │
└───┬──────────────┬──────────────┬──────────────┬─────────────┘
    │              │              │              │
    ▼              ▼              ▼              ▼
 Skill sources   MCP registry   Tool registry  Hook bus (V1)
 (SkillV2)       (existing)     (existing)     (Plugin.Service)
    │              │              │              │
    └──────────────┴──────────────┴──────────────┘
                             │
                             ▼
                    Session runner / agent turn
```

### 4.3 Design principles

1. **Plugin Manager is orchestration only** — do not reimplement Skills/MCP/tools  
2. **Manifest is source of truth** for package contents  
3. **Enable ≠ install** — installed plugins can be disabled without delete  
4. **Order is deterministic** — enable order affects hook/tool registration  
5. **Same format for built-in and user plugins**  
6. **Fail closed** — bad plugin does not take down the server; report errors  
7. **Shobcoder-native** — format, IDs, and runtime are owned by this product  

---

## 5. Plugin package format

### 5.1 Directory layout (target)

```text
my-plugin/
  plugin.json                 # required manifest
                              # (or .shob-plugin/plugin.json)
  README.md                   # human docs
  skills/                     # optional
    computer-use/
      SKILL.md
      references/
  mcp/                        # optional: local MCP helpers / configs
    servers.json              # or inline in plugin.json
  hooks/                      # optional
    hooks.json                # declarative, or
    index.ts                  # V1/V2 module entry
  assets/
    icon.png
```

### 5.2 Manifest (`plugin.json`)

```jsonc
{
  "$schema": "https://shob.local/schemas/plugin.json",
  "id": "acme.computer-use",
  "name": "Computer Use",
  "version": "0.1.0",
  "description": "Desktop and multi-OS computer use workflows for the agent.",
  "author": "acme",
  "license": "MIT",

  "skills": ["./skills/computer-use"],

  "mcpServers": {
    "computer-use": {
      "type": "local",
      "command": ["node", "./mcp/server.js"],
      "environment": {}
    }
  },

  "entry": {
    "server": "./hooks/index.ts"
  },

  "permissions": {
    "tools": ["computer_screenshot", "computer_click", "computer_type"],
    "skills": ["computer-use"]
  },

  "engines": {
    "shob": ">=1.0.0"
  }
}
```

### 5.3 ID rules

- Stable reverse-DNS or scoped name: `acme.computer-use`  
- Unique per install root  
- Version is semver; replace keeps enable state when possible  

---

## 6. Runtime pipeline

### 6.1 Boot (per project / location)

```text
1. Load user + project config
2. Plugin Manager lists:
     - built-in plugins (product)
     - installed plugins (global + project)
     - enabled set + order
3. For each enabled plugin (in order):
     a. validate manifest + engines
     b. register skill sources
     c. register MCP servers (namespaced: pluginId/serverName)
     d. load entry.server (hooks/tools)
     e. record activation errors without aborting others
4. Session starts with union of tools + skill catalog
```

### 6.2 Per agent turn

```text
System context
  → available skills (enabled plugins + user skills)
  → tool list (builtins + MCP + plugin tools), permission-filtered

Model may:
  → skill({ name })           // load playbook
  → call MCP / plugin tool    // real capability
  → bash / browser / …        // builtins
```

### 6.3 Disable / uninstall

```text
Disable:
  - stop plugin MCP processes
  - unregister tools/hooks (or mark inactive)
  - hide skills from available list
  - keep files on disk

Uninstall:
  - disable first
  - delete install directory
  - clean config entries
```

---

## 7. Capability layers

| Need | Prefer | Why |
| --- | --- | --- |
| Teach workflow only | **Skill** | No process, easy to author |
| Call external API / GUI driver | **MCP server** | Isolated process, standard protocol |
| Tight in-process tool | **V1 tools / core tool** | Low latency, deep integration |
| Auth to a provider | **Integration / auth host** | Existing host |
| Change model catalog | **V2 catalog transform** | Domain system |
| Mutate chat/tools lifecycle | **V1 hooks** | Already triggered by server |

### Skills

Documented in [skills-system.md](./skills-system.md). Plugin Manager only
**adds sources** pointing at plugin `skills/`. Model still loads via `skill`
tool.

### MCP

Existing config shape (`ConfigMCP`):

```jsonc
{
  "mcp": {
    "servers": {
      "my-server": {
        "type": "local",
        "command": ["npx", "-y", "some-mcp-server"],
        "environment": { "TOKEN": "…" }
      }
    }
  }
}
```

Plugin-bundled servers should be **namespaced** and **toggleable**:

```text
plugins."acme.computer-use".mcpServers.computer-use.enabled = true
```

### Native tools

- Built-ins: `packages/core/src/tool`, `packages/shob/src/tool`  
- Plugin tools via V1 `Hooks.tool` merge as custom tools  
- Desktop OS control: `packages/desktop` main/preload — renderer never talks
  to OS APIs directly  

### Hooks

V1 hooks: `event`, `config`, `tool`, `auth`, `chat.*`, `permission.ask`,
`tool.execute.before/after`, experimental compaction, etc.

---

## 8. Lifecycle

```text
discover → install → enable → activate(boot) → session use → disable → uninstall
```

| State | Disk | Config enabled | Runtime active |
| --- | --- | --- | --- |
| Not installed | no | n/a | no |
| Installed, disabled | yes | false | no |
| Enabled | yes | true | yes after boot |
| Error | yes | true | partial / none + error record |

---

## 9. Security and permissions

### Trust model

| Source | Trust |
| --- | --- |
| Built-in (shipped in app) | Product-reviewed |
| Local path plugin | User trust (project/dev) |
| npm / remote package | User trust + version pin + optional integrity hash |

### Runtime gates

1. **Tool permissions** — existing permission system  
2. **MCP approval mode** — prompt / allow / deny per server or tool  
3. **Hook isolation** — failures must not crash session  
4. **No auto-elevation** — plugins cannot grant themselves allow-all  
5. **Desktop capabilities** — OS control requires explicit capability + user enable  

### Optional manifest capabilities

```jsonc
{
  "capabilities": [
    "skills",
    "mcp",
    "tools",
    "hooks",
    "desktop.input",
    "desktop.screen"
  ]
}
```

---

## 10. How to create a full plugin

### Step 0 — Choose scope

| Scope | When |
| --- | --- |
| Skill only | Pure process guidance |
| Skill + MCP | Real external tools (recommended for computer use, SaaS) |
| Skill + native tools | Deep desktop integration |
| Full (skill + MCP + hooks) | Production agent plugin |

### Step 1 — Scaffold

```text
plugins/computer-use/
  plugin.json
  skills/computer-use/SKILL.md
  mcp/server.ts
  hooks/index.ts
  README.md
```

### Step 2 — Write skill(s)

```markdown
---
name: computer-use
description: >
  Control desktop or browser UIs across Linux, macOS, and Windows.
  Use when the user asks for screenshots, clicks, typing, or multi-step UI automation.
---

# Computer use

## Prefer
1. browser tool for web pages
2. computer_* tools for OS desktop
3. shell only when no GUI tool exists

## Safety
Confirm destructive UI actions…
```

### Step 3 — Add real capability (MCP or tools)

**MCP (default for isolation):**

- Tools: `screenshot`, `click`, `type`, `key`  
- Reference in `plugin.json` → `mcpServers`  

**Native V1 tools:**

```ts
import type { Plugin } from "@shob/plugin"
import { tool } from "@shob/plugin/tool"

export default async function (): ReturnType<Plugin> {
  return {
    tool: {
      computer_screenshot: tool({
        description: "Capture desktop screenshot",
        args: {},
        async execute(_args, ctx) {
          return { title: "screenshot", output: "…" }
        },
      }),
    },
  }
}
```

### Step 4 — Optional hooks

```ts
export default async function (): ReturnType<Plugin> {
  return {
    "tool.execute.before": async (input, output) => {
      // audit / sanitize
    },
  }
}
```

### Step 5 — Install / enable

**Today (manual composition until Plugin Manager ships):**

```jsonc
// shob.json
{
  "skills": {
    "paths": ["./plugins/computer-use/skills"]
  },
  "mcp": {
    "servers": {
      "computer-use": {
        "type": "local",
        "command": ["bun", "run", "./plugins/computer-use/mcp/server.ts"]
      }
    }
  },
  "plugins": ["./plugins/computer-use/hooks/index.ts"]
}
```

**Target (single unit):**

```jsonc
{
  "agentPlugins": {
    "entries": [{ "id": "acme.computer-use", "source": "path", "path": "./plugins/computer-use" }],
    "enabled": ["acme.computer-use"]
  }
}
```

### Step 6 — Verify

1. Restart desktop / server  
2. Skill listed  
3. Tools / MCP listed  
4. Session: load skill → call tools  
5. Disable plugin → contributions disappear  

---

## 11. Example: computer-use plugin

### Package

```text
plugins/computer-use/
  plugin.json
  skills/computer-use/SKILL.md
  mcp/
    src/index.ts
    src/backends/linux.ts
    src/backends/macos.ts
    src/backends/windows.ts
  hooks/index.ts
```

### Manifest

```json
{
  "id": "shob.computer-use",
  "name": "Computer Use",
  "version": "0.1.0",
  "description": "Cross-platform desktop computer use for the agent.",
  "skills": ["./skills/computer-use"],
  "mcpServers": {
    "desktop": {
      "type": "local",
      "command": ["bun", "run", "./mcp/src/index.ts"]
    }
  },
  "capabilities": ["skills", "mcp", "desktop.screen", "desktop.input"]
}
```

### Runtime behavior

```text
User: "Open System Settings and enable dark mode"
  → model loads skill computer-use
  → screenshot / click / type via MCP
  → verify with screenshot
```

Desktop backends that need privileged UI access should live in
`packages/desktop` main and be exposed via a local MCP or tool bridge.
Renderer stays on `window.api` only.

---

## 12. Built-in vs user plugins

| Kind | Location | Update path |
| --- | --- | --- |
| **Built-in** | Shipped inside app | App release |
| **User global** | e.g. `~/.shob/plugins/<id>/` | Install UI/CLI |
| **Project** | e.g. `.shob/plugins/<id>/` or repo `plugins/` | Git / local path |

Same manifest format for all three.

---

## 13. Config and install surfaces

### Target config sketch

```jsonc
{
  "agentPlugins": {
    "enabled": ["shob.computer-use", "acme.security"],
    "entries": [
      { "id": "shob.computer-use", "source": "builtin" },
      { "id": "acme.security", "source": "path", "path": "./plugins/security" },
      { "id": "other.tool", "source": "npm", "package": "@other/shob-plugin@1.2.0" }
    ],
    "overrides": {
      "shob.computer-use": {
        "mcpServers": {
          "desktop": { "enabled": true }
        }
      }
    }
  }
}
```

### Transition mapping (until Plugin Manager exists)

| Plugin field | Expand to |
| --- | --- |
| `skills[]` | `skills.paths` / SkillV2 directory sources |
| `mcpServers` | `mcp.servers` with namespaced keys |
| `entry.server` | `plugins` / V1 plugin list |

---

## 14. Desktop app UI

Suggested **Plugins** settings page:

1. List installed plugins (name, version, enabled, errors)  
2. Toggle enable  
3. Install from path / package  
4. Per-plugin MCP on/off and capability grants  
5. Show skills/tools contributed by each plugin  

Homes: UI in `@shob/app`, state via config/SDK, manager in core/shob.

---

## 15. Implementation roadmap

### Phase 0 — Conventions (this doc)

Package layout + manifest + manual wiring guide.

### Phase 1 — Plugin Manager MVP (server)

Load `plugin.json`, register skills + MCP, enable/disable in config.

### Phase 2 — Entry modules + hooks

Wire `entry.server` into V1 host; namespaced tools; activation errors.

### Phase 3 — Desktop UX

Settings Plugins tab; path install; capability consent.

### Phase 4 — Built-in full plugins

Ship first-party packages (e.g. computer-use) using the same format.

### Phase 5 — Distribution

npm package convention, integrity / compatibility checks.

---

## 16. File / package ownership

| Concern | Package |
| --- | --- |
| Manifest schema | `@shob/schema` |
| Plugin Manager | `@shob/core` or `packages/shob` |
| Skills | existing skill services |
| MCP | existing MCP config + runtime |
| V1 entry/hooks | `packages/shob` Plugin.Service |
| V2 domains | `@shob/core` PluginV2 |
| Desktop install UI | `@shob/app` |
| OS computer backends | `@shob/desktop` main + optional MCP |

**Dependency rule:** Plugin Manager may depend on Skills/MCP/Plugin hosts.
Those hosts must not depend on Plugin Manager.

---

## 17. Glossary

| Term | Meaning |
| --- | --- |
| **Agent plugin** | Installable package of skills + tools/MCP + hooks for Shobcoder’s agent |
| **Skill** | Progressive-disclosure instruction pack (`SKILL.md`) |
| **MCP** | Model Context Protocol — external tool server |
| **Tool** | Model-callable action |
| **Hook** | Server lifecycle callback (V1) |
| **Manifest** | `plugin.json` describing package contents |
| **Plugin Manager** | Orchestrator that activates packages into host systems |
| **Capability** | Declared high-risk power (e.g. desktop input) |
| **Developer plugin host** | `@shob/plugin` V1/V2 engines under the hood |

---

## 18. Related docs

| Doc | Use when |
| --- | --- |
| [skills-system.md](./skills-system.md) | Skills only |
| [plugin-system.md](./plugin-system.md) | V1/V2 `@shob/plugin` host internals |
| [architecture.md](./architecture.md) | Desktop ↔ server wiring |
| [architecture-overview.md](./architecture-overview.md) | Package map |

---

## Appendix A — Decision matrix

| You want… | Build… |
| --- | --- |
| Reusable instructions only | Skill (optionally wrap as plugin later) |
| New tools for the agent | MCP **or** V1 tools; package as plugin with skill |
| Computer use (OS UI) | MCP/native tools + skill + capabilities; desktop backends |
| Provider OAuth | Existing auth/integration plugins |
| Share with team via git | Project plugin folder + enable list |
| Ship in app binary | Built-in plugin package |

---

## Appendix B — Full plugin checklist

- [ ] `plugin.json` with stable `id` + `version`  
- [ ] At least one of: `skills`, `mcpServers`, `entry.server`  
- [ ] Skill descriptions written for model routing  
- [ ] Tools named clearly and permission-gated  
- [ ] README with enable/disable instructions  
- [ ] No secrets committed; env vars documented  
- [ ] Tested on target OS(es)  
- [ ] High-risk capabilities declared  

---

*Shobcoder agent plugins unify skills, MCP, and server hosts into one product
concept. Implementation can land incrementally via the roadmap without a
big-bang rewrite, and without coupling to any external agent product.*
