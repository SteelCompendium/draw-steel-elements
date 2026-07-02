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

Migration is complete (D1, 2026-07). Vue is fully removed: `vue`, `@vue/compiler-sfc`,
`unplugin-vue`, and `vue-tsc` are gone from `package.json` and `package-lock.json`, no
`.vue` file exists in the repo, and `esbuild.config.mjs` no longer has a Vue SFC
compilation step. `npm run tsc` runs plain `tsc --noEmit` (0 errors) instead of
`vue-tsc --noEmit`, and the CI type-check step is a hard gate (no more
`continue-on-error`).

The three former Vue components did not simply become hand-rolled DOM processors as
originally planned here — instead they became the first elements migrated onto
**Element Framework v2** (`src/framework/`, see `architecture.md`), a new declarative
element model (`ElementRegistry` + `ElementPipeline` + `ElementView`) built specifically
to replace Vue's role (reactive state, lifecycle, structured error handling) without a
UI framework dependency. Migration order was simplest-to-most-complex: Horizontal Rule
(static) → Skills (interactive, session state) → Stamina Bar (persisted, write-back to
the note). Vue was only removed once all three were re-implemented on the framework and
verified equivalent.

This leaves the plugin with **two coexisting rendering strategies**, not the single
DOM-only strategy this ADR originally proposed: Framework v2 for the 3 migrated elements,
and legacy `createEl`-based DOM processors (`src/drawSteelAdmonition/`) for the other 8
element types. Both are Vue-free. The two-mental-models cost this ADR set out to
eliminate was the Vue/non-Vue split specifically — that split is gone. The
framework/legacy split is an intentional, temporary migration path (more elements are
expected to move onto Framework v2 over time), not a return to the pre-Vue single
strategy.

Net result: smaller bundle, one less dependency family, standard `tsc` sufficient for
type-checking the whole repo, and a clear (documented) path for retiring the legacy DOM
processors incrementally rather than in one large rewrite.
