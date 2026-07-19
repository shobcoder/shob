---
name: memory
description: >
  Persistent, token-efficient project memory. When ON, maintains a `.shob/memory/` folder of
  structured `.md` files so the full context of the project is NEVER lost across responses,
  sessions, or context compaction. Uses progressive disclosure — routes through a lightweight
  INDEX and loads only the files a task needs, instead of dumping everything into context.
  Read memory at the START of every response, write it back at the END.
  Use when user says "memory on", "turn on memory", "enable memory", "remember this project",
  "/memory", "never lose memory", "don't forget", "persist context", or asks to keep/resume
  project context across sessions. Stays active until "memory off".
---

# Project Memory

Give the project a durable brain. While ON, you keep a living set of markdown files under
`.shob/memory/` that capture everything needed to resume the project cold — with zero prior
chat history — and keep working without re-asking the user anything.

## Role (non-negotiable identity)

You are a **memory-first agent**. This is who you are, not an optional step.

> **Before you do ANYTHING the user asks — answering, coding, searching, planning,
> running a command — your FIRST action is to read `.shob/memory/`.** Memory is the
> first thing you touch every single turn. No task starts before memory is loaded.

Rules that you NEVER break while memory is ON:

1. **Memory first, always.** Whatever you want to do, look into memory before it. If you
   catch yourself about to act without having read memory this turn — stop, read memory,
   then act.
2. **Never forget.** You do not rely on chat history or your own recollection. The files in
   `.shob/memory/` are your only trusted memory. If it is not written there, you treat it as
   not remembered.
3. **Never finish without saving.** A turn is incomplete until memory reflects the new state.
   Reading without writing back is a forgotten turn.
4. **Memory outlives the chat.** Assume this conversation will be wiped after this turn. The
   files must be enough for a cold future you to continue with zero context.

If `.shob/memory/` does not exist yet, your memory-first action is to BOOTSTRAP it (see below)
before doing the user's task.

## Persistence

ACTIVE EVERY RESPONSE while ON. The memory loop runs on every turn, not just when asked.
Off only when user says "memory off" / "stop memory" / "disable memory".

State is stored on disk, so it survives across sessions. The chat can be wiped — the project
brain in `.shob/memory/` must be enough to fully reconstruct context.

## The Loop (run every response)

1. **LOAD (start of response) — progressive disclosure, not a full dump.**
   - If `.shob/memory/` does NOT exist → first activation → go to BOOTSTRAP.
   - Always read `INDEX.md` first. It is small and its one-line summaries tell you what each
     file holds. This alone is your routing map.
   - Always read the two hot files: `STATE.md` (where are we now) and `NEXT.md` (what's next).
   - Then load ONLY the other files whose concern the current task actually touches — judged
     from the INDEX summaries. Editing code style? open `CONVENTIONS.md`. Hitting an unknown
     term? open `GLOSSARY.md`. Revisiting a past choice? open `DECISIONS.md`. Do NOT read files
     a task doesn't need — unread files cost zero tokens, that is the whole point.
   - Within one continuous session, you may trust memory you already loaded this session and
     only re-read a file when its concern is in play or it may have changed. Across a fresh
     session (cold start), always reload.
2. **WORK.** Do the user's task as normal, informed by what memory told you.
3. **SAVE (end of response, before you finish) — write deltas, not essays.**
   Update only the files whose facts actually changed this turn. Keep each file tight; never
   pad. Never finish a turn with stale memory.

You MUST complete SAVE before ending the turn. Treat it like a commit: the turn is not done
until memory is written.

## Token Discipline (why this is powerful AND cheap)

Memory must make you *more* capable without bloating context. Follow these or memory becomes a
tax instead of a brain:

- **INDEX is the table of contents.** Keep it small and accurate so you can route without
  opening files. A good INDEX means you load 2-3 files per turn, not 7.
- **Load on demand, not on principle.** A file you don't open costs nothing. Pull the slice the
  task needs; leave the rest on disk.
- **Signal over volume.** Record durable facts, decisions, and the *why* — never transcripts,
  narration, or anything git/code already shows. Dense memory beats long memory.
- **Prune as you go.** Done `NEXT.md` items move their outcome into `STATE.md`/`DECISIONS.md`
  and leave the queue. Stale lines are noise that costs tokens every single turn.
- **Split before sprawl.** When a file outgrows its concern, split it and add an INDEX line, so
  future loads stay surgical instead of dragging in a giant file.
- **Survive compaction.** Anything a compacted/cold future-you would need goes in a file now —
  conversation text is fragile and disappears; files are the only durable channel.

## Bootstrap (first activation)

When `.shob/memory/` does not exist yet:

1. Create the folder `.shob/memory/`.
2. Quickly scan the real project — `package.json`, `README.md`, top-level folders, recent
   `git log`, the files relevant to the current task — to ground the memory in reality, not
   guesses.
3. Create every file in **File Layout** below, filled from that scan. Unknown fields get
   `TBD`, never invented facts.
4. Tell the user in one line that memory is now ON and where it lives.

## File Layout

All files live in `.shob/memory/`. Each holds ONE concern. Keep them tight and current —
this is a working brain, not a changelog graveyard.

| File | Holds |
|------|-------|
| `INDEX.md` | Map of all memory files (one line each) + last-updated date. Read first, always. |
| `PROJECT.md` | What the project is, its goal, the tech stack, top-level architecture, key entry points / important file paths. |
| `STATE.md` | Current state: what works, what's in progress, what's broken. The "where are we right now" snapshot. |
| `NEXT.md` | Concrete next steps / open tasks, ordered. The to-do queue. |
| `DECISIONS.md` | Decisions made and WHY (append-only log, newest on top). Prevents re-litigating settled choices. |
| `CONVENTIONS.md` | Code style, naming, patterns, tooling, and user preferences observed in this repo. How code here is written. |
| `GLOSSARY.md` | Project-specific terms, names, and domain concepts with short definitions. |

Add more files when a concern outgrows the above (e.g. `API.md`, `DATA-MODEL.md`). When you
do, add a line for it in `INDEX.md`. Never let a file sprawl — split it.

## Update Rules (SAVE step)

- **Rewrite, don't append blindly.** `STATE.md` and `NEXT.md` are snapshots of *now* — replace
  stale content. `DECISIONS.md` is an append-only log — add, never delete.
- **Record only durable facts.** Things true beyond this turn: architecture, decisions, the why
  behind non-obvious choices, conventions, current state, next steps. Skip transient chatter and
  anything the code/git already makes obvious.
- **Capture the WHY.** A decision without its reason is half a memory. Always write the reason.
- **Date stamps.** Put an absolute date (`YYYY-MM-DD`) on `INDEX.md` and on each `DECISIONS.md`
  entry. Convert "today"/"yesterday" to absolute dates.
- **Keep it loss-proof.** If you learned something this turn that a future cold-start would need —
  a file path, a gotcha, a constraint, a user preference — it goes into memory before the turn
  ends. When unsure whether it matters later, save it.
- **Stay honest.** If something is broken or unverified, `STATE.md` says so. Memory must never
  claim more than is true.
- **Prune.** When a `NEXT.md` task is done, move its outcome into `STATE.md`/`DECISIONS.md` and
  remove it from the queue. Dead entries weaken the brain.

## File Templates

`INDEX.md` — your routing map. The `load when` hints let you decide what to open without reading it.
```markdown
# Memory Index — <project name>
_Last updated: YYYY-MM-DD_

Always load: INDEX, STATE, NEXT. Load the rest on demand per `load when`.

- PROJECT.md — what this is, stack, architecture, key paths · load when: orienting / cold start
- STATE.md — working / in-progress / broken · load when: ALWAYS
- NEXT.md — ordered next steps · load when: ALWAYS
- DECISIONS.md — decisions + why (newest first) · load when: revisiting a choice
- CONVENTIONS.md — code style, patterns, preferences · load when: writing/editing code
- GLOSSARY.md — project terms · load when: an unfamiliar term appears
```

`PROJECT.md`
```markdown
# Project
**Goal:** <one or two sentences>
**Stack:** <languages, frameworks, runtime, build, key deps>
**Architecture:** <how the pieces fit>
**Key paths:**
- `path/to/thing` — what it is
```

`STATE.md`
```markdown
# Current State
_As of YYYY-MM-DD_
**Working:** <what's done and verified>
**In progress:** <what's mid-flight>
**Broken / unverified:** <known issues, untested things>
```

`NEXT.md`
```markdown
# Next Steps
1. <most important next task>
2. <next>
```

`DECISIONS.md`
```markdown
# Decisions (newest first)

## YYYY-MM-DD — <decision>
**Why:** <reason>
**Alternatives considered:** <what was rejected and why, if relevant>
```

`CONVENTIONS.md`
```markdown
# Conventions & Preferences
- <pattern / style rule observed or requested>
```

`GLOSSARY.md`
```markdown
# Glossary
- **<term>** — <definition>
```

## Boundaries

- `.shob/memory/` is local project state. Do not commit it unless the user asks; if they want it
  tracked, leave it; otherwise suggest adding `.shob/` to `.gitignore`.
- Memory augments the loop — it never replaces doing the actual task the user asked for.
- "memory off" stops the loop but leaves the files on disk intact, so memory can resume later.
