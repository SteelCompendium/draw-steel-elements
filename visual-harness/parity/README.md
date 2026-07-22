# Visual parity harness

This directory holds the **style parity contract** between the live
[steelcompendium.io/v2](https://steelcompendium.io/v2/) site and the `draw-steel-elements`
plugin's "Steel" theme (`styles-source.css`, `[data-dse-theme='steel']`).

## The workflow in one screen

| When you… | Run | Notes |
|---|---|---|
| Change any Steel CSS in `styles-source.css` | `npm run parity` | Must end **0 GAPs / 0 WARNs, exit 0**. Close a GAP by fixing the CSS — never by deleting or weakening the pair that reports it. |
| Change any Steel CSS | `npx jest test/dom/theme/steelMaterial.test.ts` | The material contract (see below). Runs as part of `npx jest`, so the normal full-suite gate covers it. |
| Know the **live site itself** changed | `npm run parity:site` | **Only then.** Regenerating the baseline for any other reason re-points the reference of record at whatever the plugin happens to look like. |
| Open a PR that touched either | — | **Review the JSON diff** of `baseline/site-inventory.json` in the PR. A baseline diff must be explained by a real site change; if it isn't, a page failed to load/render and the capture is garbage. |

`npm run parity` is the *computed-style* half of the gate (it renders the plugin and diffs
`getComputedStyle()` against the committed site baseline). `test/dom/theme/steelMaterial.test.ts`
is the *source-text* half: it reads `styles-source.css` and asserts that the Steel material
tokens carry live values and that each primitive is forged or flat as the site is. The two
catch different failures — the diff has documented blind spots (typography, colour, pseudo
elements — see below) and only fires on selectors that are in `selector-map.json`, while the
jest test pins named declarations regardless of whether anything renders. Keep both green.

Both exist for one reason: plan 19 shipped structurally-correct Steel markup with completely
flat surfaces and **passed human review**, because reviewers compared layout against
screenshots and said "close match." Nothing could mechanically fail. If you add a material
surface, add it to *both* — a pair here and an assertion there.

Two gotchas when extending the jest test:

- **Strip CSS comments before matching.** `styles-source.css` documents its own selectors in
  prose; a naive text match can bind to a comment instead of a rule (this already broke
  `test/dom/kit/powerRollPanel.test.ts` once, which locates rules by first textual occurrence).
- **The Steel scope is written two ways** — `[data-dse-theme='steel']` (single quotes) on
  component rules, `[data-dse-element][data-dse-theme="steel"]` (double quotes) on the token
  blocks. Match both, or the assertion silently matches nothing and passes vacuously.

And after writing an assertion, **break the rule it pins, confirm the test fails, restore it.**
An assertion that cannot fail is worse than no assertion.

## What's here

- **`urls.json`** — the list of live site pages to crawl, one per element family/variant
  (power-roll ability, effect-only ability, minion/leader/solo/companion statblocks,
  malice featureblock, kit, the plain-prose reference pages — condition, ancestry, class,
  treasure — and the `kit`/`perk` **index** pages, which are the only place the site emits
  the `.sc-card` reference tile). Each entry is `{ id, url, waitFor, note }` — `waitFor` is the selector
  the capture script waits for before sampling, so a broken URL or a page that never
  finishes loading fails loudly instead of silently capturing garbage.
- **`selector-map.json`** — the parity contract itself: pairs of `{ site, plugin }`
  selectors that are supposed to render the same "material" (same surface, same
  typography). This is the single source of truth for *which* selectors get sampled —
  the capture script only ever samples the `site` side of each pair.
- **`site-capture.mjs`** — a Playwright script that visits every URL in `urls.json`, in
  both the `dark` and `light` colour scheme, and records `getComputedStyle()` for every
  distinct `site` selector in `selector-map.json`, for the fixed property list baked into
  the script (background/border/shadow/color/typography — see `PROPS` in the script).
- **`baseline/site-inventory.json`** (generated, committed) — **the reference of record.**
  Shaped `{ capturedAt, note, entries: { "<pageId>--<scheme>": { "<selector>": { "<prop>":
  "<computed value>" } } } }`. A selector absent from a given page/scheme entry means it
  wasn't found on that page — not an error, just "not present here."
- **`baseline/site-shots/*.png`** (generated, committed) — one screenshot per
  `<pageId>--<scheme>`, viewport-sized (not full-page). These are a human sanity check,
  not something anything diffs against programmatically — the JSON inventory is what
  later tooling compares.

## Regenerating the reference

```bash
npm run parity:site
```

This is a **deliberate act, not part of CI** — the live site is the source of truth, but
it can change over time (new selectors, new tokens, a redesign). Re-run it when you
suspect the site has drifted from the committed baseline, then **review the JSON diff**
before committing: a diff means either the site changed on purpose (fine, update the
baseline) or a page failed to load/render correctly (not fine, investigate before
committing).

The script throws immediately if any URL doesn't return `200`, or if a page's `waitFor`
selector never appears within 15s — it will not silently commit a capture of a 404 or a
half-loaded page.

- **`plugin-capture.mjs`** — the mirror of `site-capture.mjs` for the plugin: renders the
  built harness page (`visual-harness/index.html?element=…&fixture=default&theme=steel&bg=…`)
  for each element in its `ELEMENTS` list, in both `dark` and `light`, and records
  `getComputedStyle()` for every distinct `plugin` selector in `selector-map.json`. Its
  `PROPS` array **must stay identical to `site-capture.mjs`'s** — if the two lists drift the
  inventories stop being comparable. It throws if the harness reports mount errors, so a
  broken fixture fails loudly instead of yielding an empty sample.
- **`plugin-inventory.json`** (generated, **gitignored**) — same shape as the site
  inventory, keyed `"<elementId>--<bg>"`. Regenerated on every `npm run parity`; nothing
  reviews its diff, so it is not committed.
- **`diff.mjs`** — pairs `baseline/site-inventory.json` against `plugin-inventory.json`
  through `selector-map.json` and writes `parity-report.md`. Exits 1 while any `GAP`
  remains.
- **`parity-report.md`** (generated, **gitignored**) — the current gap list.

## Checking the plugin against the reference

```bash
npm run parity
```

This builds the harness, samples the `plugin` side of every pair in `selector-map.json`,
and diffs each `plugin` selector's computed styles against its paired `site` selector's
values in `baseline/site-inventory.json`. It compares the first occurrence of each selector
on either side **in each colour scheme — dark and light are both checked**, and every
reported row names its scheme. (Dark-only comparison was a real hole: a light-scheme-only
flat surface — plan 19's exact failure mode, surviving in half the theme — passed both this
gate and jest.)

Two severities:

- **`GAP`** — a real material difference. The diff deliberately checks only three things,
  all in the "site is richer than the plugin" direction, because that is the failure mode
  that shipped a flat theme before:
  1. site has a `background-image` (gradient/sheen), plugin has `none`;
  2. site has a `box-shadow` (bevel/lift), plugin has `none`;
  3. site has a visible hairline on an edge — `border-top` **or `border-bottom`** — and the
     plugin has `border-<edge>-style: none` there. Both edges matter: nearly every head
     strip on these surfaces (`.sc-ability__section-head`, `.sc-ability__pr-head`,
     `.sb__head`, `.fb__head`) is `border-top-style: none` with a `border-bottom` hairline,
     so while the rule checked only `border-top` it was inert on all of them.
  Each rule runs per scheme, so the same pair can report in `dark`, `light`, or both.
  A `GAP` is closed by **fixing `styles-source.css`** — never by deleting or weakening the
  pair that reports it.
- **`WARN`** — one side of the pair never rendered/was never captured, so the comparison
  did not happen at all. **A `WARN` is a bug in the selector map, not a passing pair**: a
  wrong selector silently reports "absent" instead of the gap it was meant to catch. Fix
  the selector against the real markup (live site DOM for `site`, rendered harness DOM for
  `plugin`) and re-run. **Zero WARNs is the precondition for trusting the report.**

### Known blind spots of the current diff

- **Typography is sampled but not asserted.** `font-family` / `font-size` / `font-weight` /
  `font-variant-caps` / `letter-spacing` / `text-transform` are in `PROPS` and land in both
  inventories, but no rule compares them, so e.g. the `chip` pair reports clean while the
  site chip is `"Test Newzald"` 18px small-caps and the plugin's is 13.6px system-sans.
  Read the inventories directly when working a typographic surface.
- **Pseudo-element material is invisible to the diff.** `getComputedStyle(el)` is sampled
  without a pseudo-element argument, so e.g. `.sc-ability::before`'s decorative SVG flourish
  is not represented on either side.
- **Only the three "site is richer" checks above are asserted.** A surface can differ
  materially in ways the diff does not model: any two non-flat values pass, however far
  apart they are, and `border-radius` is captured but never compared at all. This is not
  hypothetical — the statblock/featureblock plate sat at the plugin's card values
  (`0 8px 22px rgba(0,0,0,.34)`, `--dse-radius`) while the site forges a heavier, rounder
  plate (`0 10px 26px rgba(0,0,0,.36)`, `.65rem`), and the pair passed clean throughout.
  It was found by reading the inventories, not by the gate, and closed by hand
  (`styles-source.css`, the sb/fb plate deviation after the shared ground). Read the
  inventories directly when the exact value matters.
- **Colour is not asserted either — only "flat vs. non-flat".** Checks 1 and 2 fire on
  `none` vs. *anything*, so two surfaces can pass while being different colours; check 3
  looks at `border-<edge>-style`, never `border-<edge>-color`. Concretely: the
  `statblock-band` pair compares whichever page/element the diff samples **first**, which is
  `statblock-minion` (a harrier, `.sb__head` = `linear-gradient(… color(srgb .421961 .275294
  .355294) …)`, pink) against the plugin's statblock fixture — whose role is **leader**, so
  its `.dse-sb > .dse-head` grey ramp is the *correct* tint for that role
  (`--dse-role-leader: var(--sc-role-leader, #9aa2a8)`, `styles-source.css:3206`), not an
  untinted band. Both sides are role-tinted gradients of different roles, and the pair reads
  clean either way: the diff would equally not notice if the plugin band really were
  untinted. Same trap for `background-color` and `color`. Read the inventories directly when
  the hue matters — and note that a like-for-like hue comparison would need the two sides
  pinned to the same role, which the current fixture/URL sets do not guarantee.
- **Some pairs are structurally inert.** A pair only fails if the *site* side is forged on
  one of the three checked properties, so a pair whose site node is bare can never report.
  Today that is the `head` pair: `.sc-head` samples `background-image: none`,
  `box-shadow: none`, and both `border-top-style` and `border-bottom-style` `none`, in both
  schemes — its real divergence is typographic, which nothing asserts. So "12 pairs" is
  **11 live pairs + 1 inert one**. (Re-checked after check 3 was widened to `border-bottom`:
  still inert.) Keep it — it costs nothing and starts working the day the site forges that
  node — but do not count it as coverage.
- **A pair only monitors the node it names.** Wrapper-vs-plate mismatches used to read as
  clean here (see "Selector corrections already applied"); the same trap applies to any new
  pair, so verify against the real DOM on both sides before adding one.

## Documented deferrals (`expectedGaps`)

`selector-map.json` carries an `expectedGaps` array of pair `id`s. `diff.mjs` downgrades
those pairs' findings from `GAP` to `WARN`, so the gate stays green. This exists for the
one legitimate case: a real difference that **cannot be closed in CSS** because it needs a
DOM/TS change. Every id in the array must cite a numbered workspace `FOLLOWUPS.md` item in
the sibling `expectedGapsNote`, naming the selector, the site value, the plugin value, and
why DOM is required. **`diff.mjs` enforces the citation mechanically**: if an id in
`expectedGaps` does not appear anywhere in `expectedGapsNote`, the run exits 1 before any
comparison — so the array cannot quietly become a mute button. It is **never** a way to silence a gap that CSS could close — and
deleting or weakening a pair is never acceptable either. The array is currently empty.

## Adding a new surface to the contract

1. Add a `{ site, plugin, why }` pair to `selector-map.json` (and a `{ id, url, waitFor,
   note }` entry to `urls.json` if the surface isn't already covered by an existing
   page).
2. Re-run `npm run parity:site` to add the new selector's values to the baseline.
3. Re-run `npm run parity` to check the plugin's current output against it.

## Selector corrections already applied

The seeded map shipped with two selectors that did not exist, each of which would have
reported its surface as "absent" rather than as a gap. Both are fixed; recorded here so
they aren't reintroduced:

- **`chip` (site side): `.sc-ability__cost` → `.sc-head__slot--chip`.** `.sc-ability__cost`
  appears nowhere in the live markup. The live site has two chip-ish classes:
  `.sc-ability__chip` (a keyword pill inside a statblock's `Keywords` field, e.g. "Charge",
  "Melee") and `.sc-head__slot--chip` (a card-head rail slot, e.g. "Level 1", "EV 3"). The
  plugin's `.dse-head__deck--chip` renders `EV 20` in the card head, so
  `.sc-head__slot--chip` is the structural counterpart. Note the live chip is **flat** —
  transparent fill, no gradient, no shadow, no `::before`/`::after` — so the plan's
  "forged chip: sheen + inset bevel" describes an intent, not the live site; the real chip
  divergence is typographic (see blind spots above).
- **`section-head` (plugin side): `.dse-section__head` → `.dse-section__title`.** The plugin
  emits `<section class="dse-section"><span class="dse-section__title">Effect</span>…` —
  there is no `.dse-section__head` node in the DOM or rule in `styles-source.css`.
  `.dse-section__title` is the node that must carry the site's
  `.sc-ability__section-head` sheen.
- **`card` (plugin side): `.dse-feature` → `[data-dse-element='feature']`.** The plugin's
  card plate (gradient + bevel + hairline) is applied to the **host** element —
  `pipeline.ts` stamps `data-dse-element` on the same root `seams/theme.ts` stamps
  `data-dse-theme` on, and `styles-source.css`'s card-ground rule targets that compound.
  `.dse-feature` is an inner content `<div>` created by `renderFeature.ts` and carries no
  plate, so the pair reported three phantom GAPs (flat surface / no bevel / no hairline)
  against a plate that was already byte-identical to the site's.
- **`statblock` / `featureblock` (site side): `.sb-wrap` / `.fb-wrap` → `.md-typeset.sb` /
  `.md-typeset.fb`.** The `*-wrap` nodes are unstyled positioning wrappers
  (`steel-statblock.css:58`, `steel-featureblock.css:38` — `position`/`max-width`/`margin`
  and a couple of custom properties, nothing material), so those pairs could **never**
  produce a `GAP` and the plugin's plate was unmonitored. The plate lives on
  `.md-typeset.sb` / `.md-typeset.fb`. The `featureblock` **plugin** side moved to
  `[data-dse-element='featureblock']` for the same host-vs-inner reason as `card`.
- **Added `statblock-band` / `featureblock-band`** (`.sb__head` / `.fb__head` →
  `.dse-sb > .dse-head` / `.dse-fb > .dse-head`): the role/malice gradient band was
  likewise unmonitored once the `*-wrap` pairs are discounted.
- **Added `card-ref`** (`.md-typeset .sc-card` → `.dse-card`): the whole reference-card
  family (kit/condition/ancestry/treasure/perk/… via `CardLayout`) had **no pair at all**,
  so the gate was blind to it even though `urls.json` already crawled four of its pages.
  Note *why* those pages were not enough: the site's **detail** pages are not the
  counterpart — a kit detail page is a single `.sc-kit` page-plate (`steel-kit.css:19`) and
  the condition / ancestry / treasure detail pages emit no `sc-` card node at all (they are
  plain typeset). `.sc-card` only exists on **index** pages, which is why `urls.json` gained
  `kit-index` and `perk-index`. `perk-index` is the `.sc-card--wide` variant, included to
  prove `--wide` only re-lays-out the tile (`steel-redesign.css:331-338` sets
  `grid-template-columns`/`padding` and nothing material) — both index captures sample
  byte-identical values, so the single pair covers both.
