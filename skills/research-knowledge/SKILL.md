---
name: deep-research
user-invocable: true
description: >
  GOD MODE deep research skill. Multi-phase autonomous research loop:
  query decomposition → multi-source crawling → claim cross-referencing →
  conflict resolution → structured synthesis with inline citations.
  Use for any question that demands depth, sourcing, and verifiable accuracy.
---

# Deep Research — GOD MODE

## Trigger
`/deep-research <query>` or when user says "research this deeply", "go deep on",
"full research report on", "investigate this thoroughly".

## Core Philosophy

> Raw search results are noise. Verified synthesis is signal.
> Every claim needs a source. Every conflict needs a resolution.
> A great deep research report is a structured intelligence brief, not a search summary.

## Architecture

```
Query
  └── Phase 1: Decompose → Sub-questions
        └── Phase 2: Parallel Search → Raw Sources
              └── Phase 3: Crawl & Extract → Claims
                    └── Phase 4: Cross-Reference → Verify / Conflict
                          └── Phase 5: Synthesize → Report
                                └── Phase 6: Quality Gates → Deliver
```

---

## Phase 1 — Query Decomposition

Break the user's query into **3–7 atomic sub-questions**. Each must be:
- Independently searchable
- Non-overlapping with others
- Ordered from foundational to advanced

**Example:**

> Query: "Is Company X profitable?"

Sub-questions:
1. What is Company X's current revenue model?
2. What are its reported ARR and revenue figures?
3. What is its burn rate and cost structure?
4. What do investors say about its path to profitability?
5. How does it compare to competitors on unit economics?

---

## Phase 2 — Multi-Source Search Strategy

For each sub-question, issue **2–4 targeted searches** using varied query angles:

```
[primary term] [year]
[primary term] site:official OR filetype:pdf
[primary term] analysis OR breakdown OR report
[primary term] vs [competitor]
```

**Source Priority Tiers:**

| Tier | Type | Trust Weight |
|------|------|-------------|
| 1 | Official docs, SEC filings, company blogs, government data, peer-reviewed papers | 1.0 |
| 2 | Major news outlets (Reuters, Bloomberg, FT), industry analysts (Gartner, CB Insights) | 0.85 |
| 3 | Tech blogs, newsletters, podcasts | 0.65 |
| 4 | Forums, Reddit, social media | 0.40 |

Minimum sources per report: **8 unique domains**
Target for complex topics: **15–25 sources**

---

## Phase 3 — Deep Crawl and Extraction

For each source, fetch the full page (not just the snippet), then extract structured claims:

- Numerical facts (stats, dates, prices, percentages)
- Named entities (people, companies, products)
- Causal claims ("X caused Y because Z")
- Comparative claims ("A is better than B")

Tag each claim with source URL, publish date, tier rating, and a paraphrase or verbatim quote under 15 words.

**Extraction template per source:**

```yaml
source: https://example.com/article
published: 2026-04-12
tier: 2
claims:
  - text: "Company reached $100M ARR in Q1 2026"
    type: numerical
    confidence: high
  - text: "CEO stated profitability target by 2027"
    type: causal
    confidence: medium
```

---

## Phase 4 — Cross-Reference and Conflict Resolution

### 4a. Claim Clustering
Group identical or related claims across sources. If 3+ Tier 1–2 sources agree, mark as **Verified**.

### 4b. Conflict Detection
Flag claims where sources contradict each other:

```
CONFLICT DETECTED
  Claim A: "Revenue is $50M ARR" — Source A, 2026-01
  Claim B: "Revenue is $80M ARR" — Source B, 2026-03
  Resolution: Use most recent Tier 1–2 source. Note discrepancy in report.
```

### 4c. Gap Detection
If a sub-question has zero Tier 1–2 sources, mark it `[unverified]` and flag it in the report.

### 4d. Confidence Scoring

```
Confidence = (sum of tier_weights x recency_factor) / num_claims

recency_factor:
  < 30 days:   1.0
  30–90 days:  0.9
  3–12 months: 0.75
  > 1 year:    0.60
```

---

## Phase 5 — Report Synthesis

### Report Structure

```markdown
# [Topic] — Deep Research Report

> Researched: [date] | Sources: [N] | Confidence: [X]% | Sub-questions: [N]

---

## Executive Summary

2–4 sentence synthesis of the most important findings.
Lead with the single most important fact.

---

## Table of Contents

1. [Sub-question 1 title](#anchor)
2. [Sub-question 2 title](#anchor)
...
N.   Conflicts and Uncertainties
N+1. Sources

---

## 1. [Sub-question Title]

### Finding
One clear, direct answer to the sub-question.

### Evidence
- [Claim] — Source: [Name], [Date], Tier 1
- [Claim] — Source: [Name], [Date], Tier 2
- [Claim] — Source: [Name], [Date], unverified

### Confidence: [X]% | Coverage: [N] sources

---

## [Repeat for each sub-question]

---

## Conflicts and Uncertainties

| Topic | Claim A | Claim B | Resolution |
|-------|---------|---------|------------|
| Revenue | $50M (Source A) | $80M (Source B) | Use Source B (more recent) |

---

## Knowledge Gaps

- [Field X]: No Tier 1–2 sources found. Flagged as unverified.
- [Field Y]: Only sources older than 12 months available.

---

## Research Metadata

| Metric | Value |
|--------|-------|
| Total sources | N |
| Tier 1–2 sources | N |
| Sub-questions answered | N / N |
| Average confidence | X% |
| Date range of sources | YYYY-MM to YYYY-MM |
| Conflicts detected | N |
| Gaps flagged | N |

---

## Sources

| # | URL | Type | Tier | Date | Used For |
|---|-----|------|------|------|----------|
| 1 | https://... | Official | 1 | 2026-05-01 | Revenue data |
| 2 | https://... | News | 2 | 2026-04-10 | Funding round |
```

---

## Phase 6 — Quality Gates

Run all checks before delivering the report. Fail = do not deliver until resolved.

| Gate | Requirement | Action if Fail |
|------|-------------|----------------|
| Source minimum | 8+ unique domains | Run additional search passes |
| Tier coverage | 40%+ Tier 1–2 sources | Flag low-quality sourcing in report |
| Conflict resolution | All conflicts documented | Add to conflicts table |
| Gap flagging | All unanswered sub-questions noted | Add to gaps section |
| Citation accuracy | Every claim has a source | Remove or flag orphan claims |
| Recency | 50%+ sources within 12 months | Flag stale data in report |

---

## Output Modes

Use a flag in the trigger to switch modes:

| Flag | Mode | Description |
|------|------|-------------|
| (none) | Standard | Full report as specified above |
| `[academic]` | Academic | Adds abstract, methodology, limitations, further research |
| `[brief]` | Quick Brief | Executive summary + top 5 facts + source list. Max 300 words |
| `[compare]` | Comparison | Side-by-side table of N items across shared dimensions |

---

## Iteration Protocol

If confidence is below 70% after the first pass:

```
ITERATION 2:
  - Re-run searches with refined queries
  - Target gaps identified in Phase 4
  - Fetch Tier 1 sources directly (company.com, arxiv.org, gov sites)
  - Update confidence scores
  - Note in report: "This section required 2 research iterations"

Maximum iterations: 3
If confidence remains below 60% after 3 iterations, deliver with prominent uncertainty warnings.
```

---

## Anti-Hallucination Rules

1. Never invent a statistic. If a number is not sourced, write `[no data found]`.
2. Never paraphrase into a stronger claim. If a source says "may reach", do not write "will reach".
3. Never merge two sources' claims into one sentence without attributing both.
4. Never omit a conflict because it is inconvenient — surface it in the conflicts table.
5. Date every claim. Undated claims receive a recency penalty in confidence scoring.
6. If uncertain, say so explicitly using `[unverified]` or `[disputed]` inline tags.
7. Never reproduce more than 15 words verbatim from any single source.

---

## Trigger Examples

```
/deep-research What is the current state of fusion energy?
/deep-research [academic] Impact of LLMs on scientific paper quality
/deep-research [compare] React vs Vue vs Svelte for large-scale apps
/deep-research [brief] What caused the 2023 banking crisis?
```

---

## Skill Outputs

| File | Description |
|------|-------------|
| `{topic}/report.md` | Full research report |
| `{topic}/sources.yaml` | Structured source list with tier ratings |
| `{topic}/claims.yaml` | All extracted claims with provenance |
| `{topic}/conflicts.md` | Conflict log with resolutions |
| `{topic}/metadata.json` | Confidence scores, coverage stats, iteration log |
