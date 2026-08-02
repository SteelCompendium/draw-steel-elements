# Visual parity harness

This directory holds the **style parity contract** between the live
[steelcompendium.io/v2](https://steelcompendium.io/v2/) site and the `draw-steel-elements`
plugin's "Steel" theme (`styles-source.css`, `[data-dse-theme='steel']`).

## The workflow in one screen

| When you… | Run | Notes |
|---|---|---|
| Change any Steel CSS in `styles-source.css` | `npm run parity` | Must end **0 GAPs, exit 0**, and **no WARN except the documented deferrals** in `selector-map.json`'s `expectedGaps` (4 rows today — see "Documented deferrals"). Close a GAP by fixing the CSS — never by deleting or weakening the pair that reports it, and never by loosening a tolerance. |
| Change any Steel CSS | `npx jest test/dom/theme/steelMaterial.test.ts` | The material contract (see below). Runs as part of `npx jest`, so the normal full-suite gate covers it. |
| Know the **live site itself** changed | `npm run parity:site` | **Only then.** Regenerating the baseline for any other reason re-points the reference of record at whatever the plugin happens to look like. |
| Open a PR that touched either | — | **Review the JSON diff** of `baseline/site-inventory.json` in the PR. A baseline diff must be explained by a real site change; if it isn't, a page failed to load/render and the capture is garbage. |

`npm run parity` is the *computed-style* half of the gate (it renders the plugin and diffs
`getComputedStyle()` against the committed site baseline). `test/dom/theme/steelMaterial.test.ts`
is the *source-text* half: it reads `styles-source.css` and asserts that the Steel material
tokens carry live values and that each primitive is forged or flat as the site is. The two
catch different failures — the diff has documented blind spots (surface colour, pseudo
elements, rendered-vs-declared font face — see below) and only fires on selectors that are in
`selector-map.json`, while the jest test pins named declarations regardless of whether
anything renders. Keep both green.

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
  the script (background/border/shadow/color/typography/spacing — see `PROPS` in the
  script). `plugin-capture.mjs`'s `PROPS` array must stay a byte-identical *property-name
  sequence* to this one (whitespace/indent style may differ between the two files — p21
  constraint C2 — but the ordered list of property-name strings must match exactly).
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

- **`GAP`** — a real difference. Rules 1–3 are the original **material** checks, all in the
  "site is richer than the plugin" direction, because that is the failure mode that shipped a
  flat theme before. Rules 4–7 are the **type/space/ink** checks added in plan 21 task 1 (and
  widened in its fix round), which catch the *other* failure mode the material checks are
  blind to: a surface that is already forged (gradient + bevel + hairline all present) but
  still reads cramped, sans, over-tracked and flat-grey because nothing measured padding,
  margin, line-height, tracking, the body font or the ink.
  1. site has a `background-image` (gradient/sheen), plugin has `none`;
  2. site has a `box-shadow` (bevel/lift), plugin has `none`;
  3. site has a visible hairline on an edge — `border-top` **or `border-bottom`** — and the
     plugin has `border-<edge>-style: none` there. Both edges matter: nearly every head
     strip on these surfaces (`.sc-ability__section-head`, `.sc-ability__pr-head`,
     `.sb__head`, `.fb__head`) is `border-top-style: none` with a `border-bottom` hairline,
     so while the rule checked only `border-top` it was inert on all of them.
  4. **length misses** — `font-size`, `line-height`, each of
     `padding-top/right/bottom/left` **and `margin-top`/`margin-bottom`** are parsed as px and
     compared against **one uniform tolerance, `LEN_TOL` = 1.5px**.

     *Why one number, and why 1.5.* The rule shipped with a per-property table (font-size
     1.5 / line-height 2 / padding 3). That table was **structurally hiding 14 real misses**
     that the Steel typography plan is itself required to fix — `section-head` padding 10 vs
     7.2 (28% tight), `tier-row` 11 vs 8.8 (20% tight), `chip` padding 9.2 vs 6.8 and `chip`
     line-height 18 vs 16.32 all sat in the `0 < diff <= tol` dead zone. 1.5px is tighter
     than every value it replaces, so this is a **widening**, and it is still wide enough for
     the residual each spacing target leaves: the site renders at a 20px rem base and the
     plugin at 16px (p21 constraint C4), and the tightest target on the worklist — a uniform
     ~24px card padding against the site's 23/25/25/25 — lands 1px out. **Never raise it to
     make a row go away.**

     A **non-px value on either side (`normal` line-height, `auto` padding) is not silently
     skipped — it emits a WARN**, so a regression to `line-height: normal` fails loudly
     instead of vanishing from the report. (Zero such values exist today, in either
     inventory; the WARN is there so that stays true.)

     `margin-top`/`margin-bottom` are in this list because they were *captured but asserted
     by nothing*, which left gap-inventory **A4** (card-to-card margin: site `.sc-ability`
     24px vs plugin 8px, both schemes) invisible to the gate. Capturing without asserting is
     precisely the blind spot this harness exists to remove.

     Since both inventories capture **computed px**, comparing px is coherent and correct —
     do not "correct" for the 20/16 ratio. Fix a miss in `styles-source.css` using whatever
     authored unit keeps the plugin's own scale intact, and cite the target computed px in a
     comment.
  5. **`body-font`** — GAP when the site selector's `font-family` first-listed face is *not* a
     known sans (i.e. it's serif/slab) and the plugin's first-listed face **is** a known sans
     (`-apple-system`/`system-ui`/`BlinkMac`/`Segoe`/`Roboto`/`Helvetica`/`Arial`/
     `sans-serif`/`Inter`). This asserts the plugin is routing that text through **a** serif
     token, never that it matches the site's exact licensed face — the site's body/label face
     (`BerlingskeSlab-DBd`) and its chip face (`Newzald`) are both licensed and
     un-bundleable (see the gap-inventory doc's font-licensing caveat), so pinning the exact
     name would be unfixable by design. Comparing family *names* for equality is deliberately
     out of scope for this rule.

     **Known limit — this rule asserts the *declared* family, not the *rendered* face.**
     `getComputedStyle().fontFamily` returns the resolved *declaration string*, not the face
     the browser actually painted with. If the plugin routes body text to
     `--dse-font-body` ("Source Serif 4" under Steel — one of the six font slots added by
     SC-105; body/card-body/title text all resolve to the same face today) and that face is
     **not installed/loaded in the harness browser**, the computed string still reads
     `"Source Serif 4", serif`, this rule goes green, and the pixels stay whatever the
     fallback resolves to. Nothing in this gate can catch that. Its only backstop is a
     **human shot-read** — the golden PNGs in `visual-harness/shots/` under the Steel schemes,
     checked by eye when the body face changes. Treat a green `body-font` row as "the
     declaration is right", never as "the glyphs are right".
  6. **`letter-spacing`** — computed `normal` **is** zero tracking, so it is normalised to `0`
     and compared in px like any other length, with tolerance **0.25px**. Gap-inventory
     **A7**: the plugin tracks body text at `.03em` (0.48px at its 16px base) where the site
     is `normal`.

     *Why 0.25.* The captured spread is bimodal. Every independent miss is ≥ 0.48px
     (`section`, `pr-head`, `tier-row`, `head` at 0.48; `section-head` at 1.12). The one
     smaller non-zero difference is `chip` at 0.176px (site 0.72 vs plugin 0.544) — and that
     one is **not independent**: both sides author `.04em`, and the px difference exists only
     because the chip's `font-size` is 13.6px in the plugin against the site's 18px, which is
     already its own GAP under rule 4. Closing that font-size GAP collapses the tracking
     difference to 0. 0.25px sits in the empty band between the two, so the rule fires on
     every real miss without double-reporting one that another rule already owns.
  7. **`ink`** — the captured `color` value, parsed as `rgb()`/`rgba()` and compared on two
     axes independently: **max RGB channel difference > 2**, or **alpha difference > 0.03**
     (alpha rounded to 3dp first, so a pair sitting exactly at tolerance isn't tripped by
     binary float error). Either axis alone fires. A value that does not parse as
     `rgb()`/`rgba()` emits a WARN rather than being skipped. Gap-inventory **A6**: dark body
     ink is a flat `rgb(218,218,218)` against the site's cooler, alpha-carrying
     `rgba(220,226,230,.88)`; light is `rgb(34,34,34)` against the site's `rgb(44,46,48)`.

     *Why 2 and 0.03.* Taken from the actual spread in the two inventories, which leaves a
     wide empty band. Every pair that already agrees agrees **exactly** — `chip`, `head`,
     `statblock-band` and `featureblock-band` match on all four channels in both schemes,
     difference 0. Every pair that misses, misses by **≥ 5 on some RGB channel** (`card`,
     `section`, `tier-row`, `statblock`, `featureblock`, `card-ref` by 12–14; `section-head`
     by 5) **or by ≥ 0.07 on alpha** (`pr-head` dark: identical RGB, alpha .95 vs the site's
     .88 — the case a hue-only comparison would have missed). 2/255 (<1%) and 0.03 alpha sit
     in that band: they absorb the ±1 rounding a future `color-mix()`- or
     percentage-authored token could introduce, while letting nothing that misses today
     through. Note `card` dark misses by exactly 2 on its red channel — it still fires,
     because green and blue are 8 and 12 out. The rule passes the moment the plugin carries
     the site's value verbatim.

     This is the **only** colour-valued rule in the gate; checks 1–3 still test
     flat-vs-non-flat only, and `background-color` / gradient hue / `border-*-color` remain
     unasserted (see blind spots).
  Each rule runs per scheme, so the same pair can report in `dark`, `light`, or both.
  A `GAP` is closed by **fixing `styles-source.css`** — never by deleting or weakening the
  pair that reports it.
- **`WARN`** — the comparison did not happen, or happened and was deliberately downgraded.
  Three causes, and they are **not** interchangeable:
  1. **One side never rendered / was never captured.** **This is a bug in the selector map,
     not a passing pair**: a wrong selector silently reports "absent" instead of the gap it
     was meant to catch. Fix the selector against the real markup (live site DOM for `site`,
     rendered harness DOM for `plugin`) and re-run.
  2. **A value could not be parsed** — a non-px length (rule 4) or a non-`rgb()` colour
     (rule 7). Also a defect: make both sides compute to a comparable value.
  3. **A documented deferral** listed in `selector-map.json`'s `expectedGaps` — a real
     difference that cannot be closed on the node the pair names, each citing a numbered
     workspace `FOLLOWUPS.md` item. **4 rows today** (`featureblock:margin-top` /
     `:margin-bottom` × 2 schemes, FOLLOWUPS #39).

  **Every WARN that is not cause 3 must be driven to zero before the report is trustworthy.**

### Known blind spots of the current diff

- **Typography is *mostly* asserted (plan 21 task 1 + its fix round).** `font-size`,
  `line-height`, `letter-spacing`, `color`, the block margins and the "serif vs sans" shape of
  `font-family` are all compared now (rules 4–7 above). Still **not** compared:
  `font-weight`, `font-variant-caps`, `text-transform`, and the exact `font-family`
  name/stack beyond its first entry's serif-vs-sans shape — all sampled into `PROPS` and
  present in both inventories, but read by hand, not asserted. Concretely, the `chip` pair's
  small-caps rendering (`font-variant-caps: small-caps` on the site) is still a blind spot.
  Read the inventories directly when one of those matters. See also the "declared family, not
  rendered face" limit under rule 5.
- **Block margin is asserted, but only on the node each pair names.** Rule 4 covers
  `margin-top`/`margin-bottom`, which is what makes gap-inventory **A4** visible: the site's
  `.sc-ability` computes `margin: 24px` (authored `1.2rem 0`, `steel-ability-cards.css:39`)
  against the plugin's `0.5em`/8px — the plugin is the tight one. The blind spot that remains
  is *which node* carries it: for `statblock`/`featureblock` the site's block rhythm lives on
  the `.sb-wrap`/`.fb-wrap` positioning wrapper (`margin: 1.7rem auto` = 34px), which no pair
  names, while the pairs compare the site's inner plate (`margin: 0`) to the plugin's
  outermost host. That mismatch is deferred and filed — **FOLLOWUPS #39**, which also records
  the real 34px-vs-8px number so it is not lost.
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
- **Surface colour is still not asserted — only "flat vs. non-flat".** (Text `color` *is*
  asserted, by rule 7; everything below is about the surface.) Checks 1 and 2 fire on
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
- **Material-only pairs can still be structurally inert on rules 1–3.** A pair only fails
  rules 1–3 if the *site* side is forged on one of those three properties, so a pair whose
  site node is bare on all three can never report a material gap. The `head` pair
  (`.sc-head` → `.dse-head`) is exactly this: `.sc-head` samples `background-image: none`,
  `box-shadow: none`, and both `border-top-style`/`border-bottom-style` `none`, in both
  schemes. **It is no longer inert overall as of plan 21 task 1** — rules 4–7 fire on it
  normally (`line-height`, `body-font` and `letter-spacing` all GAP for `head` in both schemes
  at time of writing), so "material-inert" is not the same as "untested."
- **A pair only monitors the node it names.** Wrapper-vs-plate mismatches used to read as
  clean here (see "Selector corrections already applied"); the same trap applies to any new
  pair, so verify against the real DOM on both sides before adding one.

## Documented deferrals (`expectedGaps`)

`selector-map.json` carries an `expectedGaps` array of entries. `diff.mjs` downgrades the
matching findings from `GAP` to `WARN`, so the gate stays green. This exists for the
one legitimate case: a real difference that **cannot be closed in CSS** because it needs a
DOM/TS change. Every entry in the array must cite a numbered workspace `FOLLOWUPS.md` item in
the sibling `expectedGapsNote`, naming the selector, the site value, the plugin value, and
why DOM is required. **`diff.mjs` enforces the citation mechanically**: if an entry in
`expectedGaps` does not appear anywhere in `expectedGapsNote`, the run exits 1 before any
comparison — so the array cannot quietly become a mute button. It is **never** a way to silence a gap that CSS could close — and
deleting or weakening a pair is never acceptable either.

Two entry shapes are accepted (as of plan 21 task 1, p21 constraint C3):

- **A bare pair id** (e.g. `"chip"`) downgrades *every* rule on that pair — the original,
  coarser behaviour. Kept for back-compat; prefer the scoped form below for any new
  deferral so a filed DOM gap doesn't also mute unrelated CSS-fixable rules on the same
  pair.
- **`"<pairId>:<rule>"`** (e.g. `"kit:body-font"`) downgrades only the named rule on that
  pair. Valid `rule` names: `bg`, `shadow`, `hairline-top`, `hairline-bottom`, `font-size`,
  `line-height`, `padding-top`, `padding-right`, `padding-bottom`, `padding-left`,
  `margin-top`, `margin-bottom`, `body-font`, `letter-spacing`, `ink` — i.e. the same string
  `diff.mjs` passes to `sevFor(pair, rule)` at each call site. This is a **widening** (more
  precise deferrals), never a narrowing of coverage.

**Currently deferred: `featureblock:margin-top`, `featureblock:margin-bottom`** (workspace
FOLLOWUPS #39). The `featureblock` pair maps the site's *inner plate* `.md-typeset.fb`
(deliberately `margin: 0`) to the plugin's *outermost host*
`[data-dse-element='featureblock']` (`margin: 0.5em` = 8px), so the rule prints "site 0px,
plugin 8px" and demands a shrink to 0 — which would be the **wrong** fix. The site's block
rhythm lives one level up on `.fb-wrap` (`margin: 1.7rem auto` = 34px at the site's 20px rem
base, `steel-featureblock.css:40`), so the real miss runs in the opposite direction. Closing
it needs new `sb-wrap`/`fb-wrap` pairs plus a live-site baseline regeneration — a change to
the shape of the contract, not to CSS.

**Deliberately NOT deferred**, for contrast, so the bar is legible:
`statblock-band` / `featureblock-band` `margin-top` (site `0px` vs plugin `-8px`) stay
**GAPs**. The plugin band's negative pull exists only to cancel `.dse-sb`/`.dse-fb`'s own
plate padding (`styles-source.css` ~3937/~3963), and that padding is *itself* on the
worklist — the site's plate carries none. The two move together, so whoever changes the plate
padding owns the band pull; pre-deferring it would delete that information.

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
