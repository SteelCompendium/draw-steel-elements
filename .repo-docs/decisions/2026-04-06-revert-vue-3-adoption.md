# Revert Vue 3 Adoption

**Date:** 2026-04-06
**Status:** accepted

## Context

The 2025-08-22 decision adopted Vue 3 for interactive components. After living
with the two-rendering-strategy approach, the added complexity — build tooling
(`unplugin-vue`, `vue-tsc`), larger bundle, two mental models for contributors —
is not justified by the benefits. The juice isn't worth the squeeze.

## Options Considered

### Keep Vue 3
- Pros: Already integrated, reactive state management, familiar to some contributors
- Cons: Extra build complexity, increased bundle size, two rendering strategies to maintain, `vue-tsc` needed alongside `tsc`

### Remove Vue 3, return to DOM manipulation only
- Pros: Single rendering strategy, simpler build pipeline, smaller bundle, one less dependency, lower contributor onboarding cost
- Cons: Slightly more verbose for interactive elements, lose reactivity system

## Decision

Remove Vue 3 and return to DOM-based rendering for all elements. Existing Vue
components (StaminaBar, SkillList) will be rewritten as DOM-based processors
using the same pattern as the rest of the codebase.

This supersedes [2025-08-22-adopt-vue-3](2025-08-22-adopt-vue-3.md).

## Consequences

- Single, consistent rendering strategy across the entire plugin
- Simpler build configuration (remove `unplugin-vue/esbuild`)
- Standard `tsc` sufficient for type checking (no `vue-tsc` needed)
- Smaller bundle size
- Interactive components will need rewriting, but the scope is small

## Outcome

_To be filled in after migration is complete._
