# Decision Log

## Why We Log Decisions

Context doesn't survive in memory. Six months from now, nobody will remember why
we chose esbuild over Vite, or why Power Roll was renamed to Feature. Decision
records prevent relitigating settled choices and give new contributors the "why"
behind the codebase.

## What to Log

Every decision, regardless of size:

- Library and framework choices
- Data format or schema changes
- Naming changes (element types, YAML fields)
- Rejected approaches and why they were rejected
- Conventions established (naming, file organization)
- Reverted experiments and what was learned
- Breaking changes and migration strategies

## How to Create a Record

1. Copy the template below into a new file
2. Name it `YYYY-MM-DD-short-description.md` (files sort chronologically)
3. Fill in all sections. Leave **Outcome** blank if the decision is recent.
4. Set the status field

Multiple decisions on the same date are fine.

## Status Definitions

| Status | Meaning |
|--------|---------|
| `proposed` | Under discussion, not yet implemented |
| `accepted` | Agreed upon and implemented |
| `tried` | Implemented but didn't work out |
| `superseded` | Replaced by a later decision |
| `deprecated` | Still in place but being phased out |

## Template

```markdown
# Title

**Date:** YYYY-MM-DD
**Status:** proposed | accepted | tried | superseded | deprecated

## Context

Why was this decision needed?

## Options Considered

### Option A
- Pros: ...
- Cons: ...

### Option B
- Pros: ...
- Cons: ...

## Decision

What was chosen and why.

## Consequences

- Positive outcomes
- Accepted tradeoffs

## Outcome

Leave blank until there's real experience to report.
What actually happened? Lessons learned? Would you choose the same again?
```

## Index

| Date | Decision | Status |
|------|----------|--------|
| 2026-04-06 | [Revert Vue 3 adoption](2026-04-06-revert-vue-3-adoption.md) | accepted |
| 2024-03-01 | [Adopt Vue 3 for interactive components](2024-03-01-adopt-vue-3.md) | superseded |
| 2024-01-15 | [Adopt steel-compendium-sdk for data parsing](2024-01-15-adopt-sdk.md) | accepted |
| 2023-10-01 | [Replace Power Roll with Feature element](2023-10-01-power-roll-to-feature.md) | accepted |
| 2023-06-01 | [Use esbuild as bundler](2023-06-01-esbuild-bundler.md) | accepted |
| 2023-06-01 | [Reading mode only -- no Live Preview](2023-06-01-reading-mode-only.md) | accepted |
