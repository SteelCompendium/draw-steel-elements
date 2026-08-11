# Architecture

## System Overview

The plugin follows a processor-based architecture where each Draw Steel element type has
a dedicated processor (or, for migrated elements, an `ElementDefinition`) that parses
YAML input and renders DOM output. Two rendering strategies coexist: **Element Framework
v2** (`src/framework/`) handles migrated elements via a declarative
registry/pipeline/view model; plain TypeScript DOM manipulation (`src/drawSteelAdmonition/`)
handles the rest via hand-rolled processors. Vue 3 was adopted (2025-08-22) and later
removed (2026-04-06, see `decisions/2026-04-06-revert-vue-3-adoption.md`) — Framework v2
is what replaced it, not a return to DOM-only. See "Framework v2 (`src/framework/`)"
below for the coexistence model.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Obsidian App                                  │
│                                                                          │
│  ┌──────────────┐    ┌──────────────────────────────────────────────┐  │
│  │  Markdown     │    │  Draw Steel Elements Plugin                    │  │
│  │  Note with    │───>│                                               │  │
│  │  ```ds-*      │    │  main.ts (Plugin entry, onload)               │  │
│  │  blocks       │    │    │                                          │  │
│  └──────────────┘    │    ├── registerElements(this)  [legacy path]   │  │
│                      │    │     │                                     │  │
│                      │    │     ├── FeatureProcessor                  │  │
│                      │    │     ├── FeatureblockProcessor             │  │
│                      │    │     ├── StatblockProcessor                │  │
│                      │    │     ├── InitiativeProcessor                │  │
│                      │    │     ├── CounterProcessor                  │  │
│                      │    │     ├── CharacteristicsProcessor           │  │
│                      │    │     └── ValuesRowProcessor                │  │
│                      │    │                                          │  │
│                      │    ├── initializeElementFrameworkV2(...)       │  │
│                      │    │     [framework/: registry + pipeline +    │  │
│                      │    │      theme/prefs/refs/validation/session] │  │
│                      │    ├── registerFrameworkElementDefinitions(..) │  │
│                      │    │     ├── horizontal-rule (elements/)       │  │
│                      │    │     ├── skills (elements/)                │  │
│                      │    │     ├── stamina-bar (elements/)           │  │
│                      │    │     └── negotiation (elements/)           │  │
│                      │    └── registerFrameworkElements(this, fw)     │  │
│                      │          [wiring loop, F1 §2.3]                │  │
│                      │                                               │  │
│                      │  Utils:                                       │  │
│                      │    ├── ReferenceResolver   (legacy)            │  │
│                      │    ├── JsonSchemaValidator (legacy, singleton) │  │
│                      │    └── CompendiumDownloader                    │  │
│                      └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

## Components

### Plugin Entry (`main.ts`)

- **Responsibility:** Loads settings, initializes the legacy schema registry, calls
  `registerElements(this)` (legacy path), constructs the Framework v2 service bundle
  (`initializeElementFrameworkV2`), populates its registry
  (`registerFrameworkElementDefinitions`), wires framework elements into Obsidian
  (`registerFrameworkElements`), and adds the compendium download command. Drops the
  framework bundle and clears `SessionStore` in `onunload`.
- **Depends on:** `RegisterElements`, `JsonSchemaValidator`, `Settings`,
  `CompendiumDownloader`, `src/framework/*` (registry, pipeline, session, validation,
  seams), `src/elements/*` (migrated element definitions)
- **Depended on by:** Obsidian app (plugin lifecycle)

### Legacy Element Registration (`src/utils/RegisterElements.ts`)

- **Responsibility:** Maps code block language tags (e.g., `ds-ft`, `ds-feature`) to
  their legacy processors. Each element type gets multiple aliases. Owns every element
  **not yet migrated** onto Framework v2 — as an element migrates, its
  `registerMarkdownCodeBlockProcessor` call is deleted here (left as a code comment
  pointing at the framework registration) and the alias moves to
  `src/elements/<name>/definition.ts` instead.
- **Depends on:** All legacy processor classes, model classes
- **Depended on by:** `main.ts`

### Legacy Processors (`src/drawSteelAdmonition/`)

Each not-yet-migrated element type has a processor with this pattern — parse YAML,
create HTML elements via Obsidian's `createEl` API, manage any interactive state
directly in the processor/View class:

| Processor | Directory | Aliases |
|-----------|-----------|---------|
| FeatureProcessor | `Features/` | `ds-ft`, `ds-feat`, `ds-feature` |
| FeatureblockProcessor | `featureblock/` | `ds-fb`, `ds-featureblock` |
| StatblockProcessor | `statblock/` | `ds-sb`, `ds-statblock` |
| InitiativeProcessor | `initiativeProcessor.ts` | `ds-it`, `ds-init`, `ds-initiative`, `ds-initiative-tracker` |
| CounterProcessor | `Counter/` | `ds-ct`, `ds-counter` |
| CharacteristicsProcessor | `Characteristics/` | `ds-char`, `ds-characteristics` |
| ValuesRowProcessor | `ValuesRow/` | `ds-vr`, `ds-value-row`, `ds-values-row` |

These 7 element families are the "legacy" side of the coexistence model. (The
`negotiation/` directory still exists, but only its four sub-views remain — its
processor migrated onto Framework v2 in Plan 05; see Migrated Elements below.) They may
migrate onto Framework v2 in future work; nothing in this list is Framework-v2-only or
Vue-based today.

### Framework v2 (`src/framework/`)

Element Framework v2 replaces Vue's role (declarative components, structured lifecycle,
one error boundary) with a small, Obsidian-decoupled-where-possible layer purpose-built
for this plugin. Element authors declare an `ElementDefinition`; the framework handles
everything else (parsing, validation, ref resolution, mounting, error rendering,
lifecycle cleanup, persistence write-back).

| File | Responsibility |
|------|-----------------|
| `registry.ts` | `ElementRegistry` — pure in-memory `id`/alias → `ElementDefinition` lookup. No Obsidian coupling; unit-testable without a real `Plugin`. Rejects duplicate ids/aliases and `shape: "persisted"` definitions missing `serialize`. |
| `pipeline.ts` | `ElementPipeline` — the render pipeline: parse → validate (AJV) → resolve refs → `createView` → mount, behind **one** error boundary (`renderErrorCard`, four failure stages: `parse`/`schema`/`reference`/`render`). Constructed once per plugin load with the service bundle; `run()` executes once per rendered block instance. |
| `view.ts` | `ElementView<M>` — abstract view lifecycle base (extends Obsidian `Component`). Owns DOM (`rootEl`) and the current model; subclasses implement `onMount` (required) and optionally `onUpdate`. Implements the debounced (~400ms) `persist()` write-behind path for `shape: "persisted"` elements, flushed on unload. Also ships a `HeroPanel<S>` stub (unused in D1; reserved for a later effort). |
| `context.ts` | `RenderContext` — the immutable per-block-instance DTO the pipeline builds and hands to `createView`/views: `app`, `plugin`, `settings`, `host`, `mode`, and the service seams (`theme`, `prefs`, `refs`, `session`, plus the optional `roll` — a real `RollService` since D5, supplied by the pipeline; see "Rolling" below). Frozen at construction. |
| `host/BlockHost.ts` | The `BlockHost` interface — the single seam between a mounted `ElementView` and *where* it lives (`containerEl`, `canPersist`, `replaceSource()`, `addChild()`, `getBlockInfo()`, `blockKey()`). `RenderMode` is `"reading" \| "live-preview" \| "sidebar"`. |
| `host/ReadingModeBlockHost.ts` | The only implemented `BlockHost` (D1 ships reading mode only, matching the standing 2024-08-18 reading-mode-only decision). Fixes two legacy bugs on top of `src/utils/CodeBlocks.ts`'s approach: atomic read-modify-write via `Vault.process` (no lost updates from concurrent edits) and fence-language preservation on write-back (no silent alias-to-canonical rewriting). |
| `host/LivePreviewBlockHost.ts` | Deliberately unimplemented stub — every member throws. Documents the CM6 realization of each `BlockHost` member for a future Live Preview effort; not to be constructed until that effort supersedes the reading-mode-only decision. |
| `seams/theme.ts` | `ThemeService` — stamps `data-dse-theme="<active>"` on every element root, token → CSS var resolution (`cssVar()`). Minimal in D1 (effectively one constant theme); the token/theme value space is a later effort's scope. |
| `seams/prefs.ts` | `PreferenceStore` — a typed preference store (`DsePrefs`, built-in `theme` key only) backed by an injected `PrefsStorage` adapter, with `reflect()` stamping any `attr`-bearing preference as `data-dse-<attr>` on element roots and writing any `css`-bearing preference (SC-112) as an inline `--dse-*` custom property (`reflectCss()` is the css-only twin for roots outside the pipeline, e.g. managed modals). The preference catalog, settings tab, and per-block overrides are D4's scope — see "Preferences (`src/prefs/`, D4)" below. |
| `seams/refs.ts` | `ReferenceService` — generalizes `src/utils/ReferenceResolver.ts` into a provider chain (`RefProvider`). Ships `at-path` (`@Creatures/Goblin`) and `wikilink` (`[[Thorn Dragon]]`) providers ported verbatim from the legacy resolver, plus a reserved, always-failing `scc`/`scc.vN:` provider placeholder for a future effort to supersede. `resolveDeep()` walks arbitrary parsed YAML. Does **not** replace `ReferenceResolver.ts`, which stays live for legacy elements. |
| `session.ts` | `SessionStore` — plugin-scoped, in-memory, best-effort UI state (e.g. collapse open/closed) keyed by `(blockKey, slot)`. Cleared on plugin `onunload`. Pure — no Obsidian imports. Never used for document state. |
| `validation.ts` | `ValidationService` — a plugin-scoped AJV wrapper (2019 dialect, `ajv-keywords` + `ajv-errors`, ported from `src/utils/JsonSchemaValidator.ts`) that compiles and caches one validator per element id (fixing the legacy validator's recompile-on-every-call cost). One instance per plugin load, dropped on unload — no module-global singleton (unlike the legacy validator, which stays a singleton for its own unmigrated clients). |
| `registerFrameworkElements.ts` | The framework → Obsidian wiring loop: for every `ElementDefinition` currently in the registry, registers one `plugin.registerMarkdownCodeBlockProcessor` per alias, each invoking `pipeline.run(def, source, new ReadingModeBlockHost(...))`. A one-shot pass over `registry.all()` at call time — called once from `main.ts onload`, after the registry is populated. |
| `kit/collapsible.ts`, `kit/componentWrapper.ts` | Small reusable, purely presentational DOM-mounting helpers (vanilla ports of the former `CollapsibleHeading.vue`/`RightArrowToggleIndicator.vue` and `ComponentWrapper.vue`/`ComponentHideIndicator.vue`+`VerticalRule.vue`). No persistence or service coupling; the calling `ElementView` owns state and lifecycle-binds listeners via `owner.registerDomEvent`. |

**Coexistence model:** `main.ts onload` calls the legacy `registerElements(this)` and the
framework wiring (`registerFrameworkElementDefinitions` + `registerFrameworkElements`)
back to back. Obsidian's markdown code-block processor registry is owned by both paths
at once, one alias at a time — an element belongs to exactly one path (never both), and
which path owns it is a one-line decision recorded at the call site (a live
`registerMarkdownCodeBlockProcessor` call in `RegisterElements.ts`, or a
`registry.register(...)` line in `registerFrameworkElementDefinitions`). This is the
incremental migration switch F1 designed for: elements move off `RegisterElements.ts`
one at a time as they migrate, with no big-bang rewrite and no window where both paths
fight over the same alias.

### Migrated Elements (`src/elements/`)

The elements migrated onto Framework v2 so far (Horizontal Rule → Skills → Stamina Bar
in D1, simplest-to-most-complex by `ElementShape`; Negotiation Tracker in Plan 05):

| Element | Directory | `shape` | Aliases | Notes |
|---------|-----------|---------|---------|-------|
| Horizontal Rule | `horizontal-rule/` | `static` | `ds-hr`, `ds-horizontal-rule` | No model (`parse` returns `undefined`); `onMount` reuses the legacy `HorizontalRuleProcessor.build()` DOM builder verbatim (that builder also stays live for Statblock/Featureblock, which embed it directly — not yet migrated). `noClickShield: true` matches the legacy Vue element's behavior. |
| Skills | `skills/` | `interactive` | `ds-skills` | First interactive element: per-group and whole-element collapse state lives in `SessionStore`, never written back to the note (no `serialize`, matching the legacy Vue element). `model.ts` wraps `@model/Skills` verbatim. |
| Stamina Bar | `stamina-bar/` | `persisted` | `ds-stam`, `ds-stamina`, `ds-stamina-bar` | First (and only, in D1) persisted element: edits write back via `ElementView.persist()` → `serialize()` → `host.replaceSource()`. `serialize()` reuses `@model/StaminaBar`'s own field/order shape (`stringifyYaml(model).trim()`) to stay byte-compatible with the legacy write path. Was the last Vue element — its migration unblocked Vue removal (D1 Task 4). |
| Negotiation Tracker | `negotiation/` | `persisted` | `ds-nt`, `ds-negotiation`, `ds-negotiation-tracker` | Plan 05 (F1 §6 step 8): `NegotiationView` re-expresses the deleted `NegotiationTrackerProcessor`'s orchestration and REUSES the four sub-views still under `src/drawSteelAdmonition/negotiation/`, which now take an injected `persist: () => void` instead of calling `CodeBlocks.updateNegotiationTracker`. No schema (the legacy element never had one). Active tab is `SessionStore` state; rendering never writes (the legacy processor persisted during render — deliberately dropped). |

Each element directory follows the same shape: `definition.ts` (the `ElementDefinition`,
registered in `main.ts`'s `registerFrameworkElementDefinitions`), `view.ts` (the
`ElementView` subclass), and — for Skills/Stamina Bar — `model.ts` (a thin `parse`/
`serialize` wrapper around the pre-existing `@model/*` class, kept renderer-agnostic so
the same model classes still back the legacy validator/schemas).

### Steel card compositions (`CardLayout.steel`, plan 24 / SC-100; de-branched by SC-144)

The display-card family (the eleven D6 reference cards — kit, condition, treasure,
ancestry, culture, career, class, title, perk, complication, rule — all rendered by the
shared `DisplayCardView` driven by a declarative `CardLayout<M>`,
`src/elements/shared/CardLayout.ts`) builds its DOM from a declarative layout. Most
families build one shape; a family may opt into a richer, composed shape instead.

**History worth knowing, because the shape of the code still reflects it.** SC-100 added
this as a THEME-aware seam: the composition rendered only under the Steel theme, the other
theme got the base DOM, and a mounted view subscribed to `cx.theme.onChange` so flipping
the picker swapped branches live. SC-144 dropped the legacy theme, which collapsed all of
that — with one theme, the branch is a static property of the layout. It is now a plain
"does this layout have a composition" check, and the subscription, its re-entrancy guard
and the tear-down/re-render path are gone.

- **The slot.** `CardLayout<M>` has an optional `steel?: SteelCardComposition<M>`
  (eyebrow + crest for the shared `cardHead`, an optional `crestSize`, and ordered
  `SteelBand`s — each band an optional small-caps head plus its own `render()` into a
  positioned container). Absent (every layout except kit today) ⇒ zero behavior change:
  the view never takes the composition branch.
- **Branch condition.** `DisplayCardView.computeBranch()` is `layout.steel ? 'steel' :
  'base'`, evaluated once at mount. The base branch is the pre-seam `onMount` body **moved
  verbatim** (same statements, same order) — it is the old code relocated, not a copy, so
  the base DOM cannot drift.
- **The branch cannot change at runtime.** Nothing re-renders a mounted card on a theme
  event, and the view registers no theme subscription at all. If you ever need one back,
  note what it cost the first time: a re-enterable `onMount` stacks one leaked closure per
  `update()` call unless it is guarded.
- **`cardEl` still matters.** `renderBranch()` tracks the `.dse-card` node it created,
  because SC-145's authoring pencil anchors to it (`authoringAnchor()`) rather than to the
  element root — the pencil would otherwise render outside the card's border.
- **The two invariants** (contract-tested in
  `test/dom/elements/displayCardBranch.test.ts`):
  1. Branch selection follows the layout, not the theme: a layout with `steel` renders the
     composition, one without renders the base DOM, and neither changes with the active
     theme id (including a hand-set snippet id).
  2. No theme subscription is ever registered, for either kind of layout, across mount and
     repeated `update()` calls.
- **Print never branches the render** — `data-dse-print` stays a pure CSS attribute over
  whatever DOM was built. Corollary, and the one that costs money: a composition for a
  family necessarily changes that family's frozen `*--steel-print.png`, which needs its own
  sanctioned single-line rebaseline sign-off (see the workspace `dse-verify` skill's freeze
  section; SC-100's `kit--steel-print.png` was the first). Since SC-144, `steel-print` is
  the ONLY frozen class, so this is the whole freeze exposure of a composition.
- **First consumer: kit** (`kitLayout.steel`, `src/elements/display/layouts.ts`): crest +
  kind-eyebrow head via `cardHead`, a boxed Equipment band, "Kit Bonuses" as two rows of
  four **fixed-slot** stat tiles via the generic `statTiles()` primitive
  (`src/framework/kit/statTiles.ts`, its own `.dse-tiles*` class grammar — an absent bonus
  renders its slot as an em dash, never an omitted cell), then the signature ability
  through the existing `renderFeatureList` sub-render (deliberately richer than the site's
  tile). Remaining display families are sequenced as SC-120 — the seam + primitive make
  each one layout-data + CSS + one sanctioned rebaseline. (SC-149 did not change any of
  this: the display families' LAYOUTS are all still live — they are what `ds-scc` renders
  once it resolves a code — only their ten typed code-block languages were retired.)
- **Dark-mode material rule** (SC-100 visual-gate finding — read before styling any sunken
  surface inside a Steel card): the site's "rich" dark tiles carry **no gradient of their
  own**; the richness is the parent card's diagonal gradient bleeding through
  **translucent-black** fills (`.sc-card__stat` `rgba(0,0,0,.25)` dark / `.04` light;
  `.sc-kit__equip` `rgba(0,0,0,.22)` dark / `.04` light). Two selectors
  (`.dse-tiles__cell`, `.dse-kit__equip`) carry the site's literal translucent-black
  values with light-mode twins. **SC-117 closed the general case:** the shared
  `--dse-surface-sunken` token used to resolve under Steel dark to a **6%-white wash** (and
  under Steel light to opaque `#eaeeef`) — the opposite direction, occluding the card
  gradient on all 13 of its declaration sites — and now resolves to the site's own
  `rgba(0,0,0,.18)` dark / `rgba(0,0,0,.02)` light. The four surfaces whose site value
  differs from `.18` carry their own literal, SC-100-style: `--distance`/`--target` cells
  `.2/.03`, `.dse-sb__item` `.22/.03`, `.dse-sb__kv` `.16/.024`. The rule for any NEW sunken
  surface inside a Steel card: reach for the token, and only hardcode a literal when the
  site measurably uses a different step of its ladder.

### The action spine: a nested-card frame, not a standalone ornament (plan 25 / SC-101–103)

The Steel action-type accent (the coloured left bar on an ability/feature card, keyed off
`[data-dse-act]`) had drifted from the site's actual rule for years — read this before
touching `.dse-feature[data-dse-act]`, `renderFeature.ts`'s `actionTypeOf`, or the statblock/
featureblock head band. **The rule the site actually draws:** the spine is not a standalone
card ornament, it is the left edge of a per-option **card** inside a nested feature list, and
the site paints the *identical* declaration in two sheets and *nothing* in the third:

| context | selector (site) | selector (plugin, Steel) | spine? |
|---|---|---|---|
| standalone ability/feature card | `.sc-ability` (no `border-left` anywhere; `--act` only tints the crest + eyebrow) | `[data-dse-theme='steel'][data-dse-element='feature'] .dse-feature[data-dse-act]` | **no** — bar `display: none`, lane collapsed to 0 |
| nested in a statblock or featureblock list | `[data-sb-featstyle="card"] .sb__feat` / `[data-fb-featstyle="card"] .fb__feat` (byte-identical recipe in both sheets) | `[data-dse-theme='steel'] :is(.dse-sb, .dse-fb) .dse-feature__nested > .dse-feature` (ONE shared rule, not a per-family fork) | **yes** — a full per-option card (fill, `9px` radius, real list `gap`) with the bar as its rounded left edge |
| kit / display-card family (`CardLayout`'s `.dse-card`) | — | untouched by either rule above (anchored on `.dse-sb`/`.dse-fb`/`[data-dse-element='feature']`, none of which `.dse-card` carries) | unchanged (plain bar, no frame) — verified structurally, not assumed, and pinned by `kit--steel-print.png` staying in the freeze OK set |

Both rules are **structure tier** (`[data-dse-theme='steel']`, no print exclusion — "print
follows structure"; only the nested card's *fill* is `:not([data-dse-print="on"])`, matching
the site's own `@media print` which keeps the border/radius/padding and drops only the
background). The fail-safe: the **frame** keys on `.dse-feature`, the **bar** keys on
`[data-dse-act]`, so an option whose action type doesn't map still gets a card, just with no
coloured edge — matching the site, which always frames and lets `--act` fall back. Full
selectors, fixture-shaped fill values and the flat-mode interaction: `styles-source.css`
`~3408–3610` (inline comments there are the authoritative reference, this section is the map).

**A future contributor's most likely mistake:** styling only the featureblock (or only the
statblock) when a new nested-card concern comes up. Don't — it's one mechanism for both
families (`:is(.dse-sb, .dse-fb)`), and `test/dom/theme/steelMaterial.test.ts` pins the shape
so a per-family fork fails loudly.

**The `villain` action type (SC-102).** `ActionType` (`src/elements/feature/renderFeature.ts`)
is `'main' | 'maneuver' | 'triggered' | 'move' | 'none' | 'trait' | 'villain'` — the 7th and
newest member. `actionTypeOf` resolves it in this order: `isTrait()` → `trait`; a real
(non-blank, non-dash) `usage` line wins outright; otherwise a `cost` field starting with
"villain action" (`isVillainCost`, links stripped, case-insensitive) → `villain`; otherwise the
`ability_type` string ladder (villain matched **before** the generic "action" catch-all, since
"Villain Action 1" contains "action"). `crestIconFor` maps it to Lucide's `skull`. Token:
`--dse-act-villain` — `none` in the unscoped base, `#e0584b` in Steel dark (the site's literal, scheme-
invariant — it is **not** re-listed in the Steel-light block on purpose, matching the site
having no light variant), `#b03a2e` in both print blocks (a deliberate ink-economy darkening
with no site value behind it). Full token-block-by-block reasoning and the guard-test
arithmetic: workspace `docs/superpowers/dse-overhaul/D3-token-map.md`.

**Why the classifier reads `cost`, not `ability_type` (the compendium-format archaeology).**
steel-etl emits every villain action as `cost: "Villain Action N"` + the lone-dash
`usage: "-"` and **no `ability_type` field at all** — `ability_type: Villain…` occurs zero
times anywhere in `data-unified`. `isVillainCost` mirrors steel-etl's own classifier verbatim
(`HasPrefix(lower(trim(linkText(cost))), "villain action")`, `statblock_page.go`/
`featureblock_page.go`), including the markdown-link strip. Exactly **two** compendium shapes
have ever existed for villain actions (verified against `data-unified` history):

- **Legacy (vaults synced before the 2026-07-16 regen):** villain actions ship as **body
  markdown only** — a `> ☠️ **Name ([Villain Action](scc…) N)**` blockquote callout, no
  structured YAML feature at all. There is nothing to classify; these notes render as plain
  prose, unchanged, until the user re-syncs (which 7.0.0 already prompts for).
- **Current (2026-07-16 regen onward):** `cost: "Villain Action N"` + `usage: '-'`, no
  `ability_type` — the shape `isVillainCost` classifies.

No intermediate shape ever existed (`usage: Villain` / `ability_type: Villain` both have zero
hits in the whole history), so `cost` + the `ability_type` fallback (for hand-authored notes,
e.g. this element's own `example.yaml`) cover the entire structured universe — no compatibility
branch was needed. `renderFeature.ts`'s `isVillainCost` doc comment carries this same note.

**The statblock/featureblock diamond notch (SC-103).** The ◆ divider
(`kit/divider.ts`) mounts as a real, theme-agnostic DOM node — `statblock/view.ts` inserts it
unconditionally after the characteristics strip, and three test files assert it. Until SC-144
it **could not move or disappear in TS** without breaking the legacy theme; that constraint is
now lifted (with legacy gone, the node's only job is to be hidden under Steel), but **nothing
here has acted on it** — moving or deleting the node is a DOM change with its own freeze
exposure and belongs to its own ticket. Steel currently
hides it (`[data-dse-theme='steel'] .dse-sb > .dse-hr { display: none }` / the `.dse-fb`
twin) and paints the site's real notch — `.sb__head::after` / `.fb__head::after`, a 9px
role-hued diamond straddling the head band's bottom edge — as a Steel-scoped `::after` on
`.dse-sb[data-dse-role] > .dse-head` / `.dse-fb > .dse-head` instead (`position: relative` +
the `::after`, both structure tier so the notch's *placement* reaches print; the band's own
background/border stay `:not([data-dse-print="on"])`). This is the general pattern for any
future "the site draws X where the plugin's DOM node lives at Y" fix: hide the old node under
Steel, paint the site's version as new Steel-scoped CSS on an existing anchor — never relocate
or delete the shared DOM node itself.

Deliberately **not** built here (scope boundary, not an oversight): villain-action **banding**
(the site's default `<details>` grouping of villain actions into their own collapsible
section, `.sb__band--villain`) — the plugin has no band concept at all today, it is a named
setting in SC-123's inventory, and shipping only the inline presentation of an attribute whose
site-default value is "banded" would make the attribute a lie. Filed as a FOLLOWUPS item
linked from SC-102 and SC-123.

### Preferences (`src/prefs/`, D4)

Descriptor-driven: one `PrefDescriptor` list drives storage, CSS reflection, the
settings tab, and per-block overrides — adding a pref means adding a descriptor, not
hand-wiring four call sites.

- **Catalog** (`src/prefs/catalog.ts`): owns the `DsePrefs` module-augmentation (F1's
  `seams/prefs.ts` ships only the built-in `theme` key), `DSE_PREF_DESCRIPTORS`, the
  finalized `PrefUi` shape (group/label/help/control/options — F1 left `ui` `unknown`),
  and the statblock preset bundles (`SB_PRESETS`; `deriveSbPreset` re-derives "Custom"
  the moment any one member diverges — a preset is never itself stored). Defaults
  reproduce today's look byte-for-byte (`catalog.test.ts` guards it).
- **Storage chain**: `DsePreferenceStore` (`seams/prefs.ts`) holds live values and calls
  out to an injected `PrefsStorage` adapter. Production's adapter
  (`main.ts createSaveDataPrefsStorage`) mirrors the snapshot onto `plugin.settings.prefs`
  synchronously, then debounces the `saveData` disk write 250ms (`flush()` forces it on
  unload). The snapshot is **sparse** — only values differing from their descriptor
  default are written (`DSESettings.prefs: Partial<DsePrefs>`) — so new prefs and default
  changes are migration-free. `DSESettings.settingsVersion` (currently 1) is reserved for
  future *structural* changes only, via `migrateSettings()`.
- **Reflection**: `reflect(root, owner)` stamps every `attr`-bearing descriptor as
  `data-dse-<attr>="<value>"` and keeps it live. The pipeline (`framework/pipeline.ts`)
  calls it once per block, after `def.createView()` and before `view.mount()`. `theme` is
  deliberately attr-less in the catalog: `ThemeService.apply()` is the sole writer of
  `data-dse-theme` (D3 §7.1); double-stamping here would race.
  **`css`-bearing descriptors (SC-112)** are the second, independent reflection channel —
  same principle, different sink: a descriptor may carry
  `css: { varName: '--dse-…', toCss(value) }`, and the same `reflect()` subscription writes
  `toCss(value)` as an **inline custom property on the element root**
  (`style.setProperty(varName, …)`); a `toCss` return of `null` calls `removeProperty`
  instead, so **defaults are inert** — a root at defaults carries no inline style and the
  stylesheet's `:root` values win (the freeze bar). A descriptor may carry `attr`, `css`,
  both, or neither. The Typography prefs (six `font<Slot>` keys whose `''` sentinel means
  "Default (Obsidian vault fonts)" → `null`, plus `textScale`/`cardScale` whose site-mirrored
  `snap()` maps the 1.0 default → `null`) are all css-bearing and attr-less. Adding a
  font/scale pref is still just adding a descriptor — no new wiring. Managed modals
  (`framework/kit/managedModal.ts`) call `reflectCss()`, the css-only twin — deliberately
  not `reflect()`, since modals must not receive the element-root attr stamps; per-block
  `prefs:` overrides reject attr-less keys (`prefOverrides.ts`), so css-bearing prefs are
  global-only by design.
- **Settings tab** (`src/views/SettingsTab.ts`): groups descriptors by `PrefUi.group` in
  `GROUP_ORDER` and renders one `Setting` row per descriptor — no per-pref branching.
  SC-112 additions: `ui.advanced` rows collapse behind a per-group `<details>` ("Advanced";
  the group reset still resets them), and the `'font'` control renders a curated dropdown
  led by the uniform "Default (Obsidian vault fonts)" option, a "Custom…" free-text entry
  (sanitized via `prefs/fontStacks.ts`), and a user-activation "List installed fonts"
  affordance (`queryLocalFonts`, feature-detected — curated+Custom is the unconditional
  fallback). Sliders (`textScale`/`cardScale`) use `prefs/scale.ts`'s site-mirrored
  ranges/step/snap.
  `onChange` calls `prefs.set()` directly (no Apply button): `set()` notifies `reflect()`'s
  subscribers synchronously, so open elements reflow live behind the dialog. Per-group and
  whole-tab reset actions write descriptor defaults (sparse storage then drops them). The
  Statblock display group also renders the preset dropdown and a live preview
  (`SettingsPreview.ts`), both wholly derived, never persisted. SC-123 added a
  **Featureblock display** section (`fbFeatureStyle`/`fbStats`) and five secondary
  Statblock-display rows (`kwUsage`/`distTarget`/`sbCharLine`/`sbCharBox`/`sbVillain`,
  all `ui.advanced`); the preview's SUBJECT now follows the section — a featureblock
  under the featureblock page, the canned statblock everywhere else.
- **Conditional-DOM preferences (SC-123)** — the one class of pref that is NOT a pure CSS
  reflow, and the reason it exists. Three keys change what the statblock view BUILDS:
  `sbCharLine`/`sbCharBox` (the merged `"Might +2"` text node vs the site's
  `.dse-sb__char-box`/`-v`/`-l` split) and `sbVillain` (villain actions inline vs lifted
  into one kit `collapsible()` band). Their DEFAULT values emit exactly the DOM the element
  emitted before, which is what kept the then-frozen legacy shots byte-identical (SC-144
  retired those; the reason for the defaults is now history, and revisiting them is a live
  design question filed as its own ticket) — a
  plain always-on split was tried in SC-10 Task 4 and reverted because two inline spans
  moved Chromium's sub-pixel text shaping. Consequences: the view subscribes those three
  keys to a remount (the D5 rolling-pref mechanism, `src/elements/statblock/view.ts`), and
  all three descriptors carry **`perBlock: false`** — a per-block `prefs:` map warns and
  ignores them (SC-123 fix round, review M-1). The rejection is structural, not stylistic:
  `applyPrefOverrides` runs after the view mounted and re-stamps the ATTRIBUTE only, so an
  honoured override would dress the global DOM shape in a local attribute — measured as a
  characteristics cell reading `"+2Might"` (global `two`, block `one`) and, for
  `sbVillain`, a silent no-op with the band still built. Adding another conditional-DOM
  pref means repeating exactly that trio of moves: build the old DOM at the default value,
  subscribe the key to a remount, mark it `perBlock: false`.
- **Per-block `prefs:` overrides** (`framework/prefOverrides.ts`): a reserved `prefs:`
  map, presentation keys only. `extractPrefOverrides` pops it off the parsed YAML BEFORE
  schema validation and `def.parse`; three classes are dropped with a `console.warn`, not
  an error card — unknown keys, attr-less keys (behavioral, or SC-112's css-bearing
  typography; those use the block's own `collapsible:`/`collapse_default:`, see
  `resolveCollapsePrefs`), and `perBlock: false` keys (the conditional-DOM trio above). `applyPrefOverrides` pins the override AFTER
  `reflect()` runs, so it wins on any later global change (listener-order precedence, no
  F1 signature change). For `shape: "persisted"` elements, `withPrefOverrides` wraps
  `def.serialize` to re-emit the `prefs:` map on every write-back — content-preserving but
  re-stringified (key order/values intact, formatting may normalize); blocks with no
  `prefs:` map are untouched.
- **Deliberate deferrals** (cataloged, not built): `sbChars`/`sbVillain`/`sbStickyMeta`
  (need D2-level statblock DOM changes); `cardStyle` (needs a designed compact card
  treatment); D3-aware filtering of the theme option list. Rationale + open-decisions
  table: workspace repo `docs/superpowers/dse-overhaul/D4-preferences-spec.md`.

### Rolling (`src/framework/roll/`, D5)

Interactive Draw Steel dice rolling, split pure-engine / service on purpose:

- **Engine** (`engine.ts` `resolveRoll` + `types.ts`, `parse.ts`): pure and total — no
  Obsidian, no DOM, no `Math.random` (dice come from an injected `DiceSource`). This is
  the ONE module where tier/crit/edge-bane resolution happens; D7/D8 import it rather
  than re-derive the math. Edges/banes cap each side at 2 FIRST, then cancel (rulebook
  "Rolling With Edges and Banes"); natural 19–20 is always tier 3; crits require
  power-roll mode + a main action. `parse.ts parseRollExpression` maps the ability
  YAML's free-text `roll:` strings to a partial roll shape, leniently (garbage ⇒ bare
  power roll), as a pure module export — not a service method.
- **Service** (`service.ts` `RollService`, the `cx.roll` seam): owns the RNG source and
  delegation. An optional field on `RenderContext`, supplied by the pipeline
  (`main.ts` constructs it after prefs); views null-check it and degrade to a static
  card. `roll()` uses native `Math.random` d10s, or — when the `rollerEngine` pref is
  `dice-roller` — the Dice Roller community-plugin bridge (`diceBridge.ts`):
  capability-detected over `app.plugins` per roll (never version-detected, no import,
  no dependency), per-die `1dN` formulas so the faces stay exact, and null/throw on ANY
  failure falls back to native — the bridge can never break rolling. The bridge only
  supplies faces; they replay into `resolveRoll`, so the math ownership rule holds.
- **Pref gates** (`src/prefs/catalog.ts`, "Rolling" group): `rollingEnabled` (master,
  default `false` — defaults render zero roll UI on ability cards), `rollClickToRoll`
  (default `true`, click a tier row to roll; moot until the master is on), and
  `rollerEngine` (`native` default / `dice-roller`). The `ds-roll` element ignores
  `rollingEnabled`: authoring the block is its own opt-in.
- **UI composition** (`kit/rollBar.ts`, `kit/rollResultCard.ts`,
  `kit/powerRollPanel.ts`; `src/elements/feature/rollController.ts` for the shared
  feature grammar, `src/elements/roll/` for the standalone element): the panel's
  roll-result highlight is a separate `data-dse-roll-result="active|dimmed"` attribute
  channel, deliberately disjoint from Negotiation's selectable rows (`role="radio"` +
  `aria-checked`) — roll highlighting never touches selection semantics, so it works on
  static panels.
- **State**: session-only. Callers (not the service) write `SessionStore` slots
  `roll.lastInput.<n>` / `roll.history.<n>` (`<n>` = per-block rolling-effect ordinal;
  history capped at the last 10 results), keyed by `blockKey` — best-effort, so key
  drift after note edits just means a cold bar. Rolling NEVER writes the note;
  read-only hosts roll fine.
- **Deliberate deferrals**: a history popover UI (recording already ships), note-pin
  persistence for `ds-roll`, two-sided opposed-roll compare, and D7 wiring of the live
  `CharacteristicProvider` hook (`binding.ts`) to a real hero. Spec + open-decision
  rationale: workspace repo `docs/superpowers/dse-overhaul/D5-rolling-interactivity-spec.md`.

### Authoring (`src/authoring/`, D9)

Four generators over the registry, no per-element code: register an `ElementDefinition` and
authoring support (insert command, `/ds` scaffold, in-fence autocomplete, form editor) comes
free, derived from `def.schema`/`def.authoring`.

- **`authoring` contract** (`framework/registry.ts`): the one additive touch D9 makes to F1's
  `ElementDefinition` — an optional `AuthoringHint` (`example`/`sdkModel`/`fields`). Absence
  changes nothing (every tool falls back to the schema); presence enriches (a curated starter
  body, the SDK model the deferred text importer would route to, per-field form UI overrides).
- **Insert commands** (`insert.ts`) and **`/ds`** (`suggest.ts`, an `EditorSuggest`): both build
  their scaffold via `scaffold.ts` (`buildScaffold` — curated `authoring.example` else a
  schema-walked stub, cursor at the first body character) and only ever `replaceSelection`/
  `replaceRange` over the trigger token — INSERT ONLY, never a range-replace over existing
  content. `/ds` suppresses itself inside any already-open fence (`fenceScan.ts`'s top-down
  scan, shared with the in-fence suggester below) so accepting it can never corrupt a block
  the cursor happens to be inside.
- **In-fence autocomplete** (`schemaSuggest.ts`): key/enum completion inside an open `ds-*`
  fence only, top-level keys only (an indented line suppresses suggestion, never resolves
  against the wrong scope). Schema shapes (`allOf`/`$ref` resolved against the same
  `FRAMEWORK_V2_DEPENDENCY_SCHEMAS` AJV registers) come from `schemaShape.ts`'s
  `shapeFromSchemaYaml` — the SAME resolver `formModel.ts` uses for form fields, so the two
  never drift.
- **Form editor** (`FormModal.ts`/`formModel.ts`): one modal for every element — schema fields
  render as `Setting` controls (schemaless, or a complex array/object/`$ref` field, falls back
  to a raw-YAML textarea), reachable from a reading-mode pencil the pipeline stamps only when
  `cx.host.canPersist` AND the `authoringControls` pref (default OFF) is on.
  `ValidationService` is passed to the modal explicitly as a constructor argument — NOT read
  off `cx`, which carries no validation seam. Save hard-fails closed (disabled while the
  working data is invalid, OD-6) and writes through `host.replaceSource` — the SAME path
  persisted elements use, no parallel writer. The live preview mounts through a
  `canPersist: false` host stamped `data-dse-readonly`; a reserved `prefs:` override map is
  popped before validation/preview and re-emitted on Save via the pipeline's own
  `withPrefOverrides` wrapper.
- **`example.yaml`** (`src/elements/<id>/example.yaml`): one YAML body per element is the
  SINGLE source for the curated `authoring.example` scaffold, the F4 visual-harness fixture
  (`visual-harness/entry.ts`), and the F5 Obsidian-camera notes (`visual-harness/notes-gen.mjs`
  reads it straight off disk) — no second hand-maintained fixture. Validity-gated by
  `test/dom/visual-harness/fixtures.test.ts`, which mounts every fixture through the real
  pipeline and asserts no error card.
- **Deliberate deferrals**: the SDK-reader text importer (blocked on F2 — the pinned SDK lacks
  the reader/writer types it needs; `authoring.sdkModel` is declared now so it's purely
  additive once F2 bumps the SDK) and the CM6 inline-validation squiggle linter (§5.2 — a
  bigger, riskier CM6 surface than the `EditorSuggest`-based tools above). Spec + open-decision
  rationale: workspace repo `docs/superpowers/dse-overhaul/D9-authoring-ux-spec.md`.

### Models (`src/model/`)

- **Responsibility:** Define TypeScript types and provide `parseYaml(source)` static
  methods that convert raw YAML strings into typed objects. Shared by both rendering
  strategies — Framework v2 elements' `model.ts` wrappers call into the same classes the
  legacy processors use directly.
- **Pattern:** Each model class has a static `parseYaml()` method using Obsidian's
  `parseYaml` function. Some models use the SDK (`steel-compendium-sdk`) for parsing.
- **Schemas:** `src/model/schemas/` contains YAML-format JSON Schemas. Legacy elements
  validate via the `JsonSchemaValidator.ts` singleton; Framework v2 elements validate via
  `framework/validation.ts`'s `ValidationService`. Both load the same schema files and
  both register the shared `component-wrapper` dependency schema independently (once
  each, at plugin load).

### Utilities (`src/utils/`)

| Utility | Purpose |
|---------|---------|
| `ReferenceResolver.ts` | Resolves `@path` and `[[wikilink]]` references to content in other vault notes. Legacy-only — stays live until every element that uses it migrates; Framework v2 elements use `framework/seams/refs.ts` instead. |
| `JsonSchemaValidator.ts` | AJV-based validation with YAML schema support, singleton registry pattern. Legacy-only. |
| `CompendiumDownloader.ts` | Downloads and extracts GitHub release zips into the Obsidian vault. |
| `RegisterElements.ts` | Legacy code block processor registration (see above). |
| `Conditions.ts` | Draw Steel condition definitions. |
| `SkillsData.ts` | Draw Steel skill definitions. |
| `Images.ts` | Image handling utilities. |
| `CodeBlocks.ts` | Legacy code-block read/write helpers (`Vault.read`/`Vault.modify`-based). Superseded for migrated elements by `framework/host/ReadingModeBlockHost.ts`'s atomic `Vault.process`-based `replaceSource()`; stays live for legacy elements. |
| `ModalProcessor.ts` | Modal dialog utilities. |
| `common.ts` | Shared utility functions. |

### Views (`src/views/`)

- **Responsibility:** Obsidian modal dialogs for interactive elements.
- **Key modals:** `ConditionSelectModal` (pick conditions), `CustomizeConditionModal`
  (modify condition details), `MinionStaminaPoolModal` (manage minion shared stamina),
  `StaminaEditModal` (edit stamina values), `ResetEncounterModal` (reset initiative
  tracker), `SettingsTab` (plugin settings UI).

## Data Flow

### Code Block Rendering — legacy path

```
User writes ```ds-feature YAML``` in a note
        │
        ▼
Obsidian detects registered language tag (RegisterElements.ts)
        │
        ▼
FeatureProcessor.handler(source, el, ctx) called
        │
        ▼
YAML source parsed (Obsidian parseYaml or model.parseYaml)
        │
        ├── If references found (@path / [[link]])
        │   └── ReferenceResolver fetches content from other notes
        │
        ▼
Optional: Schema validation (JsonSchemaValidator singleton, AJV)
        │
        ▼
DOM elements created and appended to container (el)
        │
        ▼
Rendered element visible in Reading mode
```

### Code Block Rendering — Framework v2 path

```
User writes ```ds-stam YAML``` in a note
        │
        ▼
Obsidian detects registered language tag (registerFrameworkElements wiring loop)
        │
        ▼
ElementPipeline.run(def, source, new ReadingModeBlockHost(...))
        │
        ├── Step 1: build RenderContext (services + host); stamp
        │           data-dse-element, arm click shield on root
        ├── Step 2: parse    — parseYaml(source)                    ─┐
        ├── Step 3: validate — ValidationService (AJV), if def.schema │ any throw here
        ├── Step 4/5: resolve refs (def.resolveRefs or                │ → renderErrorCard
        │            autoResolveRefs), if declared                    │   (stage-tagged)
        ├── Step 6: def.parse() → model                              ─┘
        ▼
def.createView(cx) → ElementView; theme.apply() + prefs.reflect() stamped on root
        │
        ▼
view.mount(root, model) → subclass onMount() builds DOM
        │
        ▼
Rendered element visible in Reading mode
(shape: "persisted" elements: user edits → view.persist() → serialize(model) →
 host.replaceSource() → debounced ~400ms write-behind to the note)
```

### Compendium Download

```
User triggers "Download Compendium" command
        │
        ▼
CompendiumDownloader fetches GitHub release API
        │
        ▼
Downloads repo.zip asset
        │
        ▼
Deletes existing compendium directory
        │
        ▼
Extracts zip contents into vault (batch of 20 files)
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Two rendering strategies (Framework v2 + legacy DOM) | Framework v2 replaced Vue (2026-04-06 revert) as the strategy for elements needing structured lifecycle/state/persistence; simpler/not-yet-migrated elements stay on hand-rolled DOM processors. Migration is ongoing, alias-by-alias — see "Coexistence model" above. |
| One error boundary per Framework v2 render (`renderErrorCard`) | Replaces six-plus hand-rolled try/catch error `<div>`s in the legacy processors with one visual + copy standard, stage-tagged (`parse`/`schema`/`reference`/`render`). |
| `ReferenceService`/`ValidationService` generalize rather than replace their legacy counterparts | Legacy elements keep using `ReferenceResolver.ts`/`JsonSchemaValidator.ts` untouched until they migrate; Framework v2 elements get purpose-built, plugin-scoped (non-singleton) equivalents. Avoids a risky shared-state rewrite while both strategies coexist. |
| Multiple code block aliases per element | Convenience for users: `ds-ft`, `ds-feat`, `ds-feature` all work. Short aliases for frequent use, full names for readability. |
| esbuild, no framework compilation step | Fast builds. YAML loaded as raw strings via a custom loader plugin; CSS is a single `styles-source.css` import bundled by esbuild and copied to `styles.css` (no per-component style extraction, unlike the removed Vue SFC pipeline). |
| Singleton AJV schema registry (legacy) / per-load `ValidationService` (Framework v2) | Legacy: schemas registered once at plugin load, reused across validations, fresh AJV instances per validation to avoid compiled-schema conflicts. Framework v2: one `ValidationService` per plugin load, compile-and-cache per element id, dropped on unload — no module-global singleton. |
| Reading mode only | Obsidian's Live Preview mode uses CodeMirror 6 with a different rendering pipeline. Supporting it requires significant additional work; `framework/host/LivePreviewBlockHost.ts` documents the seam for a future effort but is an unimplemented stub today. |
| SDK as devDependency | `steel-compendium-sdk` is bundled at build time by esbuild, not needed at runtime as a separate package. |

## Dependencies

| Package | Why |
|---------|-----|
| `ajv` / `ajv-errors` / `ajv-keywords` | Runtime YAML schema validation for element inputs (both the legacy `JsonSchemaValidator` singleton and Framework v2's `ValidationService`). |
| `obsidian` (dev) | Obsidian Plugin API types and runtime APIs |
| `steel-compendium-sdk` (dev) | Draw Steel data model parsing (bundled at build time) |
| `esbuild` (dev) | Fast bundler producing `main.js` |
| `jszip` / `jszip-utils` (dev) | Zip extraction for compendium downloads (bundled) |
| `jest` / `ts-jest` (dev) | Test framework: `unit` (node) and `dom` (jsdom) Jest projects, 308 tests as of D1 |

Vue (`vue`, `@vue/compiler-sfc`, `unplugin-vue`, `vue-tsc`) was removed in D1 (2026-07) —
see `decisions/2026-04-06-revert-vue-3-adoption.md`.

## Extension Points

- **Adding a new legacy (DOM) element type:**
  1. Create a processor class in `src/drawSteelAdmonition/<ElementName>/`
  2. Create a model in `src/model/` with a `parseYaml()` method
  3. Register code block languages in `src/utils/RegisterElements.ts`
  4. Add CSS in `styles-source.css`
  5. Add docs in `docs/`

- **Adding a new Framework v2 element type:**
  1. Create `src/elements/<name>/definition.ts` exporting an `ElementDefinition` (id,
     name, aliases, `shape`, optional `schema`, `parse`, optional `serialize` — required
     when `shape: "persisted"` — and `createView`)
  2. Create `src/elements/<name>/view.ts` with an `ElementView` subclass implementing
     `onMount` (and optionally `onUpdate`)
  3. If reusing an existing `@model/` class, add a thin `src/elements/<name>/model.ts`
     wrapper (`parse`/`serialize`) around it, per the Skills/Stamina Bar pattern
  4. Register the definition in `main.ts`'s `registerFrameworkElementDefinitions()`
  5. Add CSS in `styles-source.css`, scoped under `[data-dse-element="<id>"]`
  6. Add docs in `docs/`

- **Migrating an existing legacy element onto Framework v2:** follow the Framework v2
  steps above, then delete the element's `registerMarkdownCodeBlockProcessor` call(s)
  from `RegisterElements.ts` (leave a comment pointing at the framework registration, per
  the existing Horizontal Rule/Skills/Stamina Bar comments there).

- **Adding a schema:** Create a YAML schema in `src/model/schemas/`, register it in
  `main.ts` `initializeSchemas()` (legacy validator) and/or pass it as a
  `def.schema` (Framework v2 — validated by `ValidationService` automatically).

## Constraints

- Must work in Obsidian's sandboxed plugin environment (no direct filesystem access, use
  Vault API).
- Output must be CJS format (`format: "cjs"`) for Obsidian compatibility.
- Target ES2018 for broad Obsidian version support.
- `obsidian`, `electron`, and CodeMirror packages are external (provided by the host
  app).
