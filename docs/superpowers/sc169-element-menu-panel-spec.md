# SC-169 — Standard element menu panel + whole-element collapse

**Status:** ROUND 3 (rollout) complete. Scott's taste gate is closed — *"Option D and E3.
Sanctioned"* (SC-169, 2026-08-18) — and the panel is live on all 31 card-like elements.
**Scope of this document:** the framework contract, the CSS contract, collapse semantics,
mobile rules, print exclusion, the rollout, and what remains open.

Canon for everything below: the SC-169 description, Scott's four rulings of 2026-08-16, his
six rulings of 2026-08-18 (round 2), and his round-3 pick of ownership option **D** + style
**E3**.

**Round 3 in one paragraph.** E1's chamfer was replaced by E3's hairline crown as the shipped
material (§3.1b); every card-like element opted in — 15 reference-capable families in wave 1
(including `ds-scc`, overturning this doc's original "never" list — §10) and 16 hero-suite /
GM-tracker elements in wave 2; the placement gate widened from 3 element families to 7; one
real defect the rollout exposed was fixed (a collapsed root-framed element rendered a box
inside a box — §4.3a); and the whole thing moved **zero** frozen print bytes beyond the 10
stamina lines round 2 already had sanctioned. User docs, `DESIGN.md` and both changelogs
landed with it.

---

## 1. What this replaces

Today the only standard per-element affordance is the D9 authoring pencil: one
`iconButton` appended to `view.authoringAnchor()` after mount, gated by the default-OFF
`authoringControls` pref (SC-145 fixed *where* it lands; it never fixed *what it is*).
There is nowhere to put a second affordance, and "add to encounter", "export",
"collapse" are all coming.

SC-169 adds **element chrome**: one framework-level implementation of a standard,
hover-revealed, icon-only menu panel plus a whole-element collapse, opted into per element
by one new `ElementDefinition` slot.

---

## 2. The slot API

```ts
// src/framework/chrome/types.ts
interface ElementSummary {
  label: string;    // type label, e.g. "Hero", "Statblock", "Stamina"
  name?: string;    // instance name, e.g. "Frodo Baggins"
  detail?: string;  // a few characters of key data, e.g. "22/48"
}

interface ChromeMenuItem { id: string; icon: string; label: string; onClick(): void }

interface ElementChromeContext<M> {
  readonly model: M;
  readonly def: { readonly id: string; readonly name: string };
}

interface ElementChrome<M = unknown> {
  summary(ctx: ElementChromeContext<M>): ElementSummary;
  items?(ctx: ElementChromeContext<M>): ChromeMenuItem[];   // v1: nobody uses it
}

// src/framework/registry.ts
interface ElementDefinition<M = unknown> {
  …
  chrome?: ElementChrome<M>;   // presence IS the opt-in
}
```

Three design points worth defending:

- **Presence is the opt-in** (ruling 3). No boolean, no allow-list. An element with no
  slot emits zero extra DOM and zero extra attributes, which is what makes a three-element
  prototype safe on a 30-element plugin — and what makes the print freeze hold by
  construction (§7). `ds-hr` and the other trivial elements simply never declare it.
- **`summary()` returns STRUCTURE, not a joined string.** The framework owns the
  punctuation and the DOM (`LABEL: Name (detail)`), so every collapsed element reads
  identically and each part gets its own span for styling and truncation. Only the element
  knows which field is the name and which two numbers are worth twelve characters.
- **`summary()` is called lazily, at collapse time** — not at mount. A live model (stamina
  after a Catch Breath, a resource after a spend) shows its current numbers.

### 2.1 Reference-capable elements get it for free

`withReference()` wraps a base def and changes the model type to `RefOrInline<M>`, so a
`chrome` slot declared on the base would arrive typed against the wrong model. The wrapper
therefore **lifts** it (`liftChrome`, `src/elements/shared/withReference.ts`): an inline
body delegates to the element's own `summary()` with its real model; a whole-block
reference falls back to `{ label: def.name, name: <the reference text> }`.

That means statblock/feature/featureblock and all eleven internal display-family elements
declare chrome **once, on their base def, in terms of their real model** — which is the
whole rollout, mechanically.

That was true of the ROUND-1 limitation too — for a *reference* body the resolved entity lives
inside `RefUnwrapView`, not in the model the pipeline holds, so the lifted fallback can only
report the code the author typed. **Round 2 closed it** (Scott's ruling 5): the framework asks
the VIEW first via `ElementView.chromeSummary()`, and `RefUnwrapView` answers with the resolved
entry's model through whichever definition actually rendered it, so `scc.v1:…goblin-stinker`
folds to "STATBLOCK: Goblin Stinker". The lifted fallback remains as the honest pre-resolution
line. See §4.3.

---

## 3. Panel: shape and behaviour

DOM (`src/framework/chrome/mountChrome.ts`), all of it appended after `view.mount()`:

```
[data-dse-element] [data-dse-chrome]              ← the element root
├── .dse-chrome-summary                            ← the collapsed one-line form (in flow)
│   ├── .dse-chrome-summary__text
│   │   ├── .dse-chrome-summary__label   "STATBLOCK"
│   │   ├── .dse-chrome-summary__name    ": Human Bandit Chief"
│   │   └── .dse-chrome-summary__detail  " (31/48)"
│   └── button[data-dse-chrome-item="expand"]      ← always visible while collapsed
└── …the element's own DOM…
    └── .dse-chrome-anchor                          ← the visible card frame
        └── .dse-chrome[role=toolbar]               ← the panel (out of flow)
            ├── button[data-dse-chrome-item="edit"]        (iff authoringControls)
            └── button[data-dse-chrome-item="collapse"]    (always, ALWAYS last)
```

| Requirement (SC-169) | How |
|---|---|
| top-right, **outside** the container, overlapping above its top edge | `position: absolute` against the anchor, `right: calc(var(--dse-chrome-inset) - …frame-border-right)`, `bottom: calc(100% + …frame-border-top)` — the round-2 geometry (§3.1a); round 1's `right: .6em` + `margin-bottom: -1px` are gone |
| hidden until the cursor is over the container **or the panel** | `opacity: 0; pointer-events: none`, flipped by `[data-dse-chrome]:hover .dse-chrome`. The panel is a DESCENDANT of the root, so hovering it keeps the root `:hover` even though it paints outside the box. `:focus-within` is the keyboard twin. |
| icon-only, short, OS-window-controls form factor | kit `iconButton` with no `text` → `.dse-btn--icon`; the panel overrides the kit box to a flat, borderless 1.7em × 1.5em control |
| **grows right-to-left** as items are added | the panel is right-anchored and the collapse toggle is kept as its LAST child (`pushItem` re-appends it), so new items extend leftward from a fixed anchor |
| native to High-Fantasy Steel | `--dse-surface-raised` / `--dse-border` / `--dse-radius` / `--dse-hover`; square bottom corners, no bottom border, a bright top hairline and an upward-cast shadow (style E3, §3.1b) |
| may overlap the element above, but ownership must read | its bottom edge lands exactly ON the card frame's border-box top, so the card's own unbroken 1px border is the panel's floor — ownership option D (§3.1a) |
| no reserved top margin on desktop | the panel is out of flow; only mobile reserves space (§6) |

### 3.1 The panel is anchored to the CARD FRAME, not to the root

The panel's containing block is `view.authoringAnchor()` — SC-145's existing answer to
"which node carries this element's visible card frame" (`root` for most elements,
`.dse-sb` for statblock, `.dse-card` for the display family). Seating the panel on the
ROOT's top edge instead leaves it floating in dead space for any element whose frame
starts lower than its root; measured on `ds-stamina`, whose root also holds the kit
collapsible's "Stamina Bar" header.

Consequence: `StaminaBarView` gained an `authoringAnchor()` override. Round 2 sharpened it
to the `.dse-stamina__cluster` plate — the node that actually draws the visible frame, and
whose 1px border turns amber when winded and red when dying. (Round 1 returned the kit
collapsible's region, which is a bare wrapper with no border of its own; that header is gone
now anyway, §4.2a.) Nothing else moved — the D9 pencil is a chrome panel item for any
chrome-bearing element, so the anchor's other consumer is unaffected.

### 3.1a ROUND 2 — one placement geometry, and the panel never covers the border

Scott, 2026-08-18: *"The placement of the menu panel should be consistent across the
Elements… the panel should not cover the Element's border."* Both were real, and both had
concrete causes that the round-1 shots showed but did not explain.

**Placement.** Measured on the round-1 branch, the panel's inset from the card's right edge
was **34.6px on `ds-statblock` vs 9.6px on `ds-hero` / `ds-stamina`**. Three causes, all
fixed:

1. **An inherited content gutter.** The panel is a child of the card frame, so statblock's
   own `.dse-sb > :not(.dse-head) { margin-left/right: 1.5rem }` applied to it too — 24 of
   the 25px. That rule is (0,4,0) and beat the panel's own, so the fix is
   `margin: 0 !important` on the panel: "no element's content gutter may move the chrome" is
   a framework invariant, and racing arbitrary per-element selectors on specificity would
   make correct placement depend on what a future author happens to write.
2. **An `em` inset.** `right: 0.6em` resolves against whatever font-size the card sets. The
   inset is now one named token, `--dse-chrome-inset: 10px`, declared once on the anchor.
3. **Padding box vs border box.** An absolutely positioned child is offset from its
   containing block's PADDING box; what a reader measures against is the frame's BORDER box.
   The two differ by the frame's own border width for any element whose anchor IS the framed
   card. CSS cannot read that width, so `mountChrome` measures it once at mount and
   republishes it as `--dse-chrome-frame-border-{top,right}`, which the sheet subtracts.
   (A style read, not a layout read — border widths are not layout-dependent — and a detached
   node yields 0, i.e. the pre-correction geometry, never a crash.)

**Layering.** Round 1 pulled the panel 1px DOWN (`margin-bottom: -1px`) so panel and card
shared one hairline — the "seated tab" read. That is exactly what cropped `ds-stamina`'s
state-coloured frame. The panel's bottom margin edge now lands **exactly on the frame's
border-box top**, so the card's own 1px border is the panel's floor and paints complete and
unbroken beneath the whole plate. The panel keeps no bottom border and square bottom corners:
the line under it belongs to the card.

**Measured after, all three families: inset `10.00px`, border overlap `0.00px`.**

**The gate is `assertChromePlacement` in `visual-harness/shoot.mjs`**, not a jest test. jsdom
computes no layout — every `getBoundingClientRect` there is zeros — so a jest assertion could
only ever pass vacuously. The harness measures the rendered page in Chromium and fails
`npm run shots`, naming which element moved and by how much.
`test/dom/framework/chromeRound2.test.ts` pins the CSS declarations the measurement depends
on, so a regression is also named in the suite.

CSS trap worth recording: the containing-block rule needs **both** forms,

```css
[data-dse-theme='steel']:not([data-dse-print="on"]).dse-chrome-anchor,   /* anchor IS root */
[data-dse-theme='steel']:not([data-dse-print="on"]) .dse-chrome-anchor   /* anchor is nested */
```

With only the descendant arm, root-anchored elements get no containing block and the panel
positions against the initial containing block — measured at viewport `y = -24` on the hero
sheet, i.e. invisible.

### 3.1b ROUND 3 — E3, the hairline crown, is the shipped material

Scott picked **E3** over the shipped E1 chamfer and over E2's bronze edge. What that means in
the sheet, replacing the whole E1 block:

- **no `clip-path`, no `filter`.** E1 needed both — `clip-path` to cut the leading edge so the
  border followed the diagonal, and a `drop-shadow()` filter because `clip-path` clips a
  `box-shadow` away entirely. Both are gone, so the panel's silhouette is a plain rounded box
  again: it cannot clip its own shadow, cannot clip a focus ring, and the top-left radius
  comes back.
- **the crown:** `inset 0 1px 0 rgba(255,255,255,.22)` — the same gesture `--dse-bevel` uses
  on every other raised Steel surface, which is what makes the panel read as the same material
  as the cards — plus `0 -3px 7px rgb(0 0 0 / 34%)`, an upward cast.
- **D's geometry is untouched.** E3 is a pure paint change; the panel's box, and therefore
  every number `assertChromePlacement` measures, is identical. Verified: 10.00px inset,
  0.00px border overlap, now across seven element families.

**The light-theme arm is new, and is not what the round-2 render showed.** E3's honest weakness
at the taste gate was that in light mode it was *nearly invisible*: a white hairline over
`--dse-surface-raised` (#edf0f0) is a ~2% luminance step. On light the crown is therefore
carried by contrast rather than brightness — the hairline goes to full white and the plate's
own top border is deepened one step (`#a9b1b5`, a literal rather than a `color-mix()` of the
token, which keeps the panel off the SC-171 support-floor ladder), so the sequence reads dark
edge → bright lip → plate. The cast shadow drops to 15% black; 34% under a light card reads as
grime, not lift.

Evidence: `.superpowers/sdd/sc169/evidence/round3/hover-kit--{dark,light}.png` and the
`chrome-border-{winded,dying}` captures.

### 3.2 The edit item

The gate is **unchanged** from D9: `host.canPersist && !def.noAuthoringButton &&
authoringControls === true`. Only the location moves: for a chrome-bearing element the
pencil is a panel item (`data-dse-chrome-item="edit"`), not a card-corner button, so there
is never a second pencil. Elements without chrome keep `authoringAnchor()` placement
verbatim.

`ds-hero` sets `noAuthoringButton` (it mounts its own "Edit definition" header affordance),
so its panel carries collapse only.

---

## 4. Collapse: the two-layer contract

Generalised from the pattern that already exists (ruling 1):

| Layer | Mechanism | Lifetime |
|---|---|---|
| authored default | the reserved top-level `collapsed:` YAML key | the note |
| user toggle | `SessionStore`, key `(host.blockKey(), "chrome.collapsed")` | the Obsidian session |

- A persisted session value **wins** over the authored default (survives the reading-mode
  echo-rebuild).
- **Mounting writes nothing** to the session — only real state changes are persisted, the
  kit collapsible's contract.
- **Toggling NEVER writes the note.**

### 4.1 Three keys, one ladder (ROUND 2 — supersedes the single-key design)

Round 1 shipped `collapsed:` alone and argued the other two spellings away. Scott's ruling
of 2026-08-18 — *"`collapsed` is great. Elements should also get `collapsible` and
`collapse_default`"* — replaces that. All three are reserved framework keys now:

| key | meaning |
|---|---|
| `collapsible: <bool>` | CAN this element collapse at all? `false` removes the collapse control — and if nothing else would be in the panel, the panel is not mounted at all. |
| `collapsed: <bool>` | the authored initial state. The canonical spelling. |
| `collapse_default: <bool>` | a **synonym** of `collapsed:`, kept because it is the spelling the pre-SC-169 vocabulary already used. |

**Precedence, per key, highest first** — the same three-tier ladder D4 §1.3 gave the
ComponentWrapper pair (block key > global preference > built-in):

- `collapsible:` → the `collapsibleDefault` preference (default `true`)
- `collapsed:` → `collapse_default:` → the `collapseDefault` preference (default `false`)

`collapsed:` beats `collapse_default:` when a block sets both. They are two spellings of one
fact, and "the canonical, more specific name wins" is the only rule that does not require the
reader to know which key was invented first.

Because both global preferences default to the values above, an install that has touched
neither behaves exactly as the round-1 prototype did.

### 4.2 Reserved-key mechanics — and the backward-compatibility rule

Exactly the D4 `prefs:` mechanics (`framework/prefOverrides.ts`), reused:

1. `prepareModel` pops a reserved key off the parsed body **before** schema validation, so no
   element schema needs an `additionalProperties` hole, and **before** `def.parse`, so it
   never enters a semantic model.
2. A non-boolean value warns to the console and is ignored; the block still renders.
3. For a persisted element the serializer is wrapped (`withCollapseKeys`) so a play-state
   write-back cannot delete the author's keys.

**Who pops what.** `collapsed:` is a brand-new spelling no element owns, so it is always
popped. `collapsible:` / `collapse_default:` are NOT new — they are real ComponentWrapper
**model fields** on `ds-stamina` and `ds-skills` (validated by `component-wrapper-1.0.0`,
materialised onto the model, re-emitted by the element's own serializer). Popping those would
hide them from `def.parse`, let ComponentWrapper's constructor substitute its own
`?? true` / `?? false`, and rewrite the author's values on the next write-back. So the
pipeline claims the pair only when **both**:

- the definition declares the `chrome` slot — a non-chrome element is left completely alone,
  which is what keeps the ~30 un-rolled-out elements (`ds-skills` included) byte-identical;
  **and**
- the definition does not set `collapseKeysOwnedByModel` — the flag `ds-stamina` sets, which
  switches the read to non-destructive.

That combination is the whole backward-compatibility story for §4.2a below.

### 4.2a `ds-stamina`: the old header is gone, the keys are not

Scott's ruling 3: *"Remove the old. Replace with the consistent option that all card elements
use."* `ds-stamina` used to mount its own kit `collapsible()` — a "Stamina Bar" disclosure
header above the framed bar. That is removed; the bar mounts straight onto root.

An existing vault note is unaffected in the way that matters: `collapse_default: true` still
starts the element collapsed, now through the panel, and the block body is byte-identical
(the model still owns and re-emits the key). Two deliberate behaviour changes ride along:

- **`collapsible: false` is now honoured.** The legacy quirk (D1 spec §"Step 3":
  `StaminaBar.vue` always passed `!disable_click`, never `model.collapsible`, so the flag was
  dead weight) is retired. A key that has always been in the schema, documented as "whether
  the component can be collapsed or not", should mean what it says.
- **The user's toggle is session-persisted now.** The old wrapper passed no `SessionPersist`,
  so a reading-mode echo-rebuild threw the reader's collapse away. Chrome persists per
  (blockKey, slot) like every other element — and still never writes the note.

This moves 10 frozen print lines (5 stamina capture ids × twin + realprint). The ready-to-apply
rebaseline and its before/after evidence are in `.superpowers/sdd/sc169/`.

### 4.3 The collapsed form

One line: `LABEL: Name (detail)` on the left, an always-visible expand button on the right.

- "HERO: Torin Stonefist"
- "STATBLOCK: Human Bandit Chief"
- "STAMINA (15/20)" — the key-data case; a standalone `ds-stamina` block has no name.

The expand button is **in flow, inside the collapsed bar** — not the hover panel. A
collapsed element must not be a dead end anywhere hover is unavailable (touch, stylus).

**Round 2, ruling 4 — while collapsed, that button is the ONLY control.** *"For now, only
show the expand icon when an Element is collapsed… lets keep it simple."* The floating panel
is suppressed outright under `[data-dse-collapsed='on']`, not merely emptied of its other
items, so hovering a collapsed element cannot summon a second, differently-placed expand
affordance above the bar.

**Round 2, ruling 5 — a reference body shows the RESOLVED name, never the code.** *"I think
the collapsed form should show the actual name, not the scc entity."* A whole-block reference
parses to a `{kind:'ref', raw}` wrapper, so the definition's own `summary()` can only see the
code the author typed. `ElementView.chromeSummary()` is the seam: the framework consults the
VIEW first, every time the element collapses, and `RefUnwrapView` answers with the resolved
entry's model through whichever definition actually rendered it — so `scc.v1:…goblin-stinker`
collapses to "STATBLOCK: Goblin Stinker". Before a resolution succeeds the override returns
`undefined` and the honest fallback (type name + the reference text) is used, so a failed
reference never shows a name it does not have.

**Known gap:** a bare whole-block reference body IS the reference, so there is nowhere to put
a `collapsed:` line — `collapsed: true\nscc.v1:…` is not valid YAML. The authored default is
unreachable for ref bodies today; the user's own collapse (session-persisted) is not. See §9.

Collapse is implemented by attribute, not by unmounting: `data-dse-collapsed="on"` on the
root, and CSS hides every root child except the panel and the summary bar. The element's
view stays mounted, so expanding is instant and no state is lost.

### 4.3a ROUND 3 — the collapsed root stops painting (a defect the rollout exposed)

The rule above hides root's CHILDREN. It cannot hide the root, which is the node carrying the
attribute and hosting the summary bar — and that is fine only for an element whose visible card
frame is a *nested* node. All three prototype elements were that shape (`.dse-sb`,
`.dse-hero`, `.dse-stamina__cluster`), so the bug was invisible in rounds 1 and 2.

Roughly half the newly opted-in families paint the plate on the ROOT instead — the shared
card-ground selector list in `styles-source.css` covers `feature`, `featureblock`, `counter`
and all six GM trackers. Collapsed, those rendered the summary bar nested inside the element's
own still-painted, still-padded plate: a visible **box inside a box**, on nine elements.

Fixed by one rule in the COLLAPSED block: while collapsed, the root drops its padding,
background, border colour and shadow, so the bar's own frame is the only frame. `!important`,
for the same reason the two rules beside it use it. Margins are deliberately left alone (block
rhythm between elements is not part of the plate) and the border is made transparent rather
than removed, so the box does not change width. Pinned in
`test/dom/framework/chromeRollout.test.ts`; the before/after is visible between the two
generations of `evidence/round3/collapsed-wave2-trackers--dark.png`.

---

## 5. CSS contract

All of it lives in one block at the foot of `styles-source.css`
("Element chrome — standard menu panel + whole-element collapse (SC-169)").

| Selector family | Layer |
|---|---|
| `.dse-chrome, .dse-chrome-summary { display: none }` | **unscoped base** — chrome does not exist unless a theme opts it in |
| `[data-dse-theme='steel']:not([data-dse-print="on"]) …` | everything that makes it visible or positions it |
| `:is([data-dse-element], .dse-modal):not([data-dse-print="on"]) .dse-chrome-summary__{label,name}` | the two `--dse-font-*` slot consumers — theme-agnostic by the SC-112 slot contract, print-excluded by the same contract's anchor rule (`steelTypography.test.ts` gates both) |

Classes are `.dse-chrome`, `.dse-chrome-anchor`, `.dse-chrome-summary`,
`.dse-chrome-summary__{text,label,name,detail}`; attributes are `data-dse-chrome`,
`data-dse-chrome-mobile`, `data-dse-collapsed`, `data-dse-chrome-item`.

The collapse rule uses `!important`:

```css
[data-dse-theme='steel']:not([data-dse-print="on"])[data-dse-collapsed='on']
  > *:not(.dse-chrome):not(.dse-chrome-summary) { display: none !important; }
```

for the same reason print rule 3 does: the children being hidden carry their own `display`
declarations from selectors of equal-or-greater specificity that appear later in the sheet,
and this rule must beat all of them without enumerating them.

---

## 6. Mobile

`Platform.isMobile` (ruling 4), read through one seam —
`src/framework/chrome/platform.ts`, which also exposes `setChromeMobileOverride()` so
jsdom tests and the visual harness can render the branch without a mobile Obsidian.
`mountChrome` stamps `data-dse-chrome-mobile="on"` on the root.

- **Mobile:** panel always visible (`opacity: 1`), and the element reserves `margin-top:
  2.1em` so the always-visible panel does not cover the element above it.
- **Desktop:** hover-reveal, no reserved space at all.

Both arms carry the print exclusion, so neither mode reaches paper (§7).

---

## 7. Print: absent by construction

SC-169's hard requirement is that the panel is **completely absent** from the print scheme
in *both* modes, with **zero frozen-shot movement**. Four independent reasons it holds:

1. The unscoped base hides both nodes; every rule that reveals them is scoped
   `[data-dse-theme='steel']:not([data-dse-print="on"])`. Print has no rule that could
   reveal them.
2. Both class names are additionally listed in the two existing print hide-lists (the
   `@media print` block and its `[data-dse-print="on"]` on-screen twin) — redundant, but it
   makes the exclusion greppable from the print scheme itself.
3. The panel is out of flow, so even a leaked rule could not reflow the card. The mobile
   `margin-top` — the one piece of chrome that *does* occupy layout — is print-excluded.
4. The collapse rules are print-excluded too, so **a collapsed element prints in full**:
   the same answer print rule 3 already gives the kit collapsible (nothing on paper hides
   behind a fold).

**The pencil relocation is also print-invisible**, which is not obvious and is worth
recording: `[data-dse-print="on"] .dse-btn { display: none }` (print rule 4) already hid the
card-corner pencil on paper. Proof in the baseline itself —
`statblock--steel-print.png` and `statblock-edit-btn--steel-print.png` carry the **same
sha256**. Moving the pencil into the panel therefore changes no print byte.

Measured (round 1, against the then-67-line baseline): `freeze OK (67/67 steel-print PNGs
byte-identical)` with the prototype live on three elements.

**Round 2 moves 10 lines, and only those.** Removing `ds-stamina`'s "Stamina Bar" header
(§4.2a) is real DOM leaving the flow, so the five `ds-stamina` capture ids move on BOTH print
classes (twin + realprint, together — the SC-170 invariant). `ds-hero` and `ds-statblock` are
byte-identical to `origin/develop` despite carrying the same chrome, which is the standing
proof that the panel itself is print-invisible. Ready-to-apply lines, before/after PNGs and
the sanction rationale: `.superpowers/sdd/sc169/rebaseline.txt` + `rebaseline-README.md`.

**Unrelated, recorded because it will be mistaken for this work:** `check-freeze.sh` already
fails on `origin/develop` (`da96da2`) itself, on 6 `hero{,-sparse,-narrow}--steel-{print,realprint}`
lines. Reproduced by a full sweep at a detached `origin/develop`, deterministic across two
runs. Not SC-169's; diagnose separately.

A cheap standing version of the same claim is a CSS-text gate in
`test/dom/framework/chrome.test.ts` §6: every `.dse-chrome*` rule is either a pure
`display: none` or carries the print exclusion.

---

## 8. Prototype + evidence

Opted in: **`ds-statblock`** (nested card frame, `withReference`-wrapped, name summary),
**`ds-hero`** (root frame, `noAuthoringButton`, name summary), **`ds-stamina`**
(key-data summary, nested anchor).

New harness capture list `CHROME_SHOTS` (`visual-harness/entry.ts`), driven by three new
harness params — `stack=` (mount several elements in a column, no gallery headings),
`pad=` (padding around `#mount`, or the above-the-edge panel is clipped out of the
`#mount` locator screenshot) and `mobile=1` — plus `hover` support in `shoot.mjs`
(`page.locator(sel).hover()`, the exact opposite of the interaction shot's
`mouse.move(0,0)` park).

| Shot id | What it proves |
|---|---|
| `chrome-hover-statblock` | the panel, with `authoringControls` ON → two items, right-to-left growth |
| `chrome-hover-hero` | the default one-item panel on a second family |
| `chrome-stacked-hover` | **ownership**: two adjacent elements, the lower one hovered, its panel painted above its own top edge |
| `chrome-collapsed-trio` | all three collapsed summary shapes in one image |
| `chrome-mobile` | always-visible panels + reserved top space, no hover |
| `chrome-placement-trio` | **round 2**: three families, every panel visible at once — the same inset from each card's right edge |
| `chrome-border-winded` / `chrome-border-dying` | **round 2**: the amber / red state frame renders complete beneath the panel |
| `chrome-legacy-keys` | **round 2**: `collapse_default: true` starts collapsed via the panel; `collapsible: false` renders no panel at all |
| `{statblock,hero,stamina-bar}-collapsed` | each element's authored-collapsed form, per element |

24 new shot names (8 capture ids × 3 combos), all new names, so the freeze baseline is
untouched by construction. A widening is optional and is a landing decision.

---

## 9. Open questions

### 9a. ANSWERED by Scott, 2026-08-18 (round 2 implements all of these)

| round-1 question | ruling | where it lives now |
|---|---|---|
| YAML key spelling | keep `collapsed:`, **add** `collapsible:` and `collapse_default:` | §4.1 / §4.2 |
| attachment treatment | do not cover the border; four options to review, ship the cleanest | §3.1a, and the A/B/C/D renders |
| panel while collapsed | **only** the expand icon, keep it simple | §4.3 |
| reference-body summaries | show the resolved name, never the code | §4.3 |
| `ds-stamina`'s own wrapper | remove it; use the consistent chrome | §4.2a |
| placement consistency | one geometry, same inset everywhere, assert it | §3.1a |

### 9b. ANSWERED by Scott at the ROUND 3 gate (2026-08-18): *"Option D and E3. Sanctioned"*

1. **Which ownership treatment ships → D.** The panel stops exactly on the frame's border-box
   top. It was already the shipped default and stays; B/A/C are not carried in the sheet.
2. **Which HFS character style ships → E3**, the hairline crown, replacing E1's chamfer. See
   §3.1b for exactly what changed, including the light-theme retune the round-2 render's
   "nearly invisible on light" note demanded.
3. **The 10-line stamina print rebaseline** is sanctioned by the same comment (it was the
   explicit ask in the round-2 gate). Regenerated from the rebased tree at round 3 and
   byte-identical to round 2's: `.superpowers/sdd/sc169/rebaseline{.txt,-README.md}`.

### 9c. STILL OPEN

1. **A whole-block REFERENCE body cannot carry an authored `collapsed:`.** The body IS the
   reference, so `collapsed: true\nscc.v1:…` is not valid YAML and error-cards. The user's own
   collapse works and is session-persisted. Options if this matters: accept it; support a
   mapping form (`ref: <code>` + `collapsed: true`); or let a fenced-block info string carry
   framework keys. No work done here — flagged only. **Round 3 widened this**: it is not only
   `ds-scc`. `ds-rule` (`genericCard`) has a RAW-MARKDOWN body, so a `collapsed:` line turns it
   into invalid YAML too. Same root cause (the body is not a mapping), same workaround (the
   user's own, session-persisted collapse), same three options. Documented for users in
   `docs/common-element-fields.md` → "One limitation worth knowing".
2. **`ds-skills` still has two collapse mechanisms.** Its own "Skills" disclosure header plus
   the element menu — the double affordance Scott's ruling 3 retired on `ds-stamina`. Not taken
   in round 3 because removing it moves 2 more frozen print lines, outside the sanction given.
   Filed as workspace `FOLLOWUPS.md` #76; §10 has the detail.
3. **`collapsible: false` on `ds-stamina` is a behaviour change.** The flag used to be ignored
   (§4.2a). Any existing note that set it will now lose its collapse control. Believed rare
   and believed correct; say if you would rather keep the quirk.
4. **The two global collapse preferences now reach every chrome element.** `collapseDefault`
   / `collapsibleDefault` used to affect only `ds-skills` and `ds-stamina`'s inner wrappers.
   They are the middle rung of the chrome ladder now, so turning `collapseDefault` on will
   start every chrome-bearing card collapsed. Both keep their current defaults (`false` /
   `true`), so nobody is affected until they opt in — but the blast radius grows at rollout.
5. **`withPrefOverrides` double-emit.** The same round-trip hazard `withCollapseKeys` guards
   against exists, unguarded, for `prefs:` on a raw-splicing serializer (`ds-hero`).
   Pre-existing; should it become a FOLLOWUPS item?
6. **Does the existing edit pencil belong in print at all?** It currently does not (print
   rule 4 hides `.dse-btn`) — stated so nobody "fixes" it later.
7. ~~**A pre-existing freeze drift on `origin/develop`.**~~ **CLOSED at round 3, not a
   defect.** The six `hero{,-sparse,-narrow}--steel-{print,realprint}` lines were the SC-156
   rebaseline landing mid-flight; after rebasing onto `3bc7685` they reproduce clean and
   `check-freeze.sh` reports only the 10 sanctioned stamina lines.

---

## 10. Rollout — DONE (round 3, 2026-08-18)

**31 elements in, 2 out.** The roster is pinned executably in
`test/dom/framework/chrome.test.ts` ("ROUND 3 — the rollout roster") and every collapsed line
in `test/dom/framework/chromeRollout.test.ts`, so the decision cannot quietly rot.

**Wave 1 — reference-capable card families (15).** `statblock`, `feature`, `featureblock`,
the eleven internal display families, and `ds-scc`. All are `withReference`-wrapped, so each
is one `chrome` slot on its base def and `liftChrome` handles the rest; their
`authoringAnchor()` already returns `.dse-card`/`.dse-sb`, so no view changed. The eleven
display families cost exactly **two** slots, not eleven: one in `displayFamily()` (whose
summary is `layout.title(model)` — the very string the expanded card prints in its head, so
folding can never show a different name than unfolding) and one in `genericCard()` for
`ds-rule`.

**`ds-scc` is IN, overturning this document's original "never" list.** That list reasoned from
"trivial or bodiless"; `ds-scc` is neither — it renders a full statblock/kit/feature card. It
is also, post-SC-149, the **only public reference element** (`ds-kit` & co. are no longer
code-block languages), and the pipeline reads `def.chrome` off the block's own def, never off
the family it resolves to. Leaving it out would have made all of wave 1 invisible in a real
vault while looking complete in the harness. Its slot's *presence* is the opt-in; the line a
reader sees comes from `liftChrome`'s non-inline arm before resolution and from
`RefUnwrapView.chromeSummary()` after it, so a synced code folds to "KIT: Panther".

**Wave 2 — the hero suite + GM subsystems (16).** `hero`, `stamina-bar`, `conditions`,
`resource`, `surges`, `tokens`, `skills`, `characteristics`, `values-row`, `counter`,
`encounter`, `montage`, `project`, `party`, `initiative`, `negotiation`. Summary grammar
decisions are in the round-3 report's opt-in table; the shape of the reasoning is: a bare
number where it is unambiguous ("Surges (3)"), a fraction for a track ("Stamina (15/20)"), and
**worded** where a bare number would read two ways ("Skills (3 selected)", "Party (2 heroes)").

`ds-skills` is the one wave-2 element that also sets `collapseKeysOwnedByModel` (with
`ds-stamina`): `collapsible:`/`collapse_default:` are real ComponentWrapper model fields there,
so the framework reads them but must not pop them. It also still carries its own "Skills"
disclosure header — the double affordance ruling 3 retired on `ds-stamina`. Removing it moves
2 more frozen print lines, outside the sanction given, so it is filed as workspace
`FOLLOWUPS.md` #76 rather than taken here.

**Never, and still never:** `horizontal-rule` (no body, no name, nothing to fold) and `roll`
(an inline dice affordance, not a card).

**Landed with the rollout:** the `DESIGN.md` entry ("The element chrome panel" — form factor,
D geometry, E3 material, hover/mobile/print rules, the collapsed-line grammar); the user-facing
page `docs/common-element-fields.md`, rewritten as "The element menu, and collapsing a block",
with the pencil references in `writing-blocks.md`/`settings.md`/`advanced-usage.md` pointed at
it; bullets in both changelogs. The freeze widening for the 5 new capture ids is a landing
decision for the orchestrator (all new names — additions-only, no sanction needed).
