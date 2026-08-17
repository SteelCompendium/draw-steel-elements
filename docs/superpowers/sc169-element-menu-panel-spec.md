# SC-169 — Standard element menu panel + whole-element collapse

**Status:** spec + working prototype, awaiting Scott's taste gate on SC-169.
**Scope of this document:** the framework contract, the CSS contract, collapse semantics,
mobile rules, print exclusion, the rollout plan, and the open questions.
**Not in scope yet:** rolling the panel out beyond the three prototype elements, and the
`DESIGN.md` entry (that lands with the rollout, per the workspace routing table).

Canon for everything below: the SC-169 description plus Scott's four rulings
(SC-169 comment, 2026-08-16).

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

Known limitation, deliberately deferred (§9 open question 5): for a *reference* body the
resolved entity lives inside `RefUnwrapView`, not in the model the pipeline holds, so the
collapsed line reads `Statblock: scc.v1:…` rather than the creature's name.

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
| top-right, **outside** the container, overlapping above its top edge | `position: absolute; right: .6em; bottom: 100%; margin-bottom: -1px` on the anchor |
| hidden until the cursor is over the container **or the panel** | `opacity: 0; pointer-events: none`, flipped by `[data-dse-chrome]:hover .dse-chrome`. The panel is a DESCENDANT of the root, so hovering it keeps the root `:hover` even though it paints outside the box. `:focus-within` is the keyboard twin. |
| icon-only, short, OS-window-controls form factor | kit `iconButton` with no `text` → `.dse-btn--icon`; the panel overrides the kit box to a flat, borderless 1.7em × 1.5em control |
| **grows right-to-left** as items are added | the panel is right-anchored and the collapse toggle is kept as its LAST child (`pushItem` re-appends it), so new items extend leftward from a fixed anchor |
| native to High-Fantasy Steel | `--dse-surface-raised` / `--dse-border` / `--dse-radius` / `--dse-hover`; square bottom corners, no bottom border, an upward-cast shadow |
| may overlap the element above, but ownership must read | it is seated ON the card's top edge with the shared 1px hairline (`margin-bottom: -1px`), reads as a tab attached to the card below it |
| no reserved top margin on desktop | the panel is out of flow; only mobile reserves space (§6) |

### 3.1 The panel is anchored to the CARD FRAME, not to the root

The panel's containing block is `view.authoringAnchor()` — SC-145's existing answer to
"which node carries this element's visible card frame" (`root` for most elements,
`.dse-sb` for statblock, `.dse-card` for the display family). Seating the panel on the
ROOT's top edge instead leaves it floating in dead space for any element whose frame
starts lower than its root; measured on `ds-stamina`, whose root also holds the kit
collapsible's "Stamina Bar" header.

Consequence: `StaminaBarView` gained an `authoringAnchor()` override returning the kit
collapsible's region (its framed card). Nothing else moved — the D9 pencil is a chrome
panel item for any chrome-bearing element, so the anchor's other consumer is unaffected.

CSS trap worth recording: the containing-block rule needs **both** forms,

```css
[data-dse-theme='steel']:not([data-dse-print="on"]).dse-chrome-anchor,   /* anchor IS root */
[data-dse-theme='steel']:not([data-dse-print="on"]) .dse-chrome-anchor   /* anchor is nested */
```

With only the descendant arm, root-anchored elements get no containing block and the panel
positions against the initial containing block — measured at viewport `y = -24` on the hero
sheet, i.e. invisible.

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

### 4.1 The key is `collapsed:`, not `collapse_default:` — and why

The existing vocabulary is the ComponentWrapper pair `collapsible:` / `collapse_default:`
(`framework/dependencySchemas.ts`; models `Skills` and `StaminaBar`). Neither spelling is
reusable:

- **`collapsible:` is the wrong axis.** Whether an element can be collapsed at all is
  decided by its definition's `chrome` slot, not by the author — and the key is already
  dead weight where it is declared (`stamina-bar/view.ts` honours `collapse_default` and
  deliberately ignores `collapsible`).
- **`collapse_default:` is already taken, on one of the three prototype elements.** On
  `ds-stamina` a top-level `collapse_default: true` means "start the INNER Stamina Bar
  wrapper collapsed". If the framework claimed the same spelling, one key would mean two
  things on one block, and popping it before `def.parse` would silently break every
  existing `ds-stamina` / `ds-skills` block that uses it.

`collapsed:` is unambiguous, reads as state (matching HTML's own `hidden` / `open`), and is
short. It is a framework **reserved key**: an element must not declare a field with that
name. (See §9 open question 1 — Scott may prefer a namespaced spelling.)

### 4.2 Reserved-key mechanics

Exactly the D4 `prefs:` mechanics (`framework/prefOverrides.ts`), reused verbatim:

1. `prepareModel` pops `collapsed:` off the parsed body **before** schema validation, so no
   element schema needs an `additionalProperties` hole, and **before** `def.parse`, so it
   never enters a semantic model.
2. A non-boolean value warns to the console and is ignored; the block still renders.
3. For a persisted element the serializer is wrapped (`withCollapsedDefault`) so a
   play-state write-back cannot delete the author's key.

`withCollapsedDefault` carries **one guard `withPrefOverrides` does not**: it prepends only
when the serialized body does not already declare `collapsed:` at column 0. `ds-hero`
splices the author's raw definition text back verbatim
(`HeroModel.serializeStateSplice`), so the key is already in the output and prepending
unconditionally would emit it twice. (`withPrefOverrides` has the same latent double-emit
against a raw-splicing serializer — filed, not fixed here: §9 open question 6.)

### 4.3 The collapsed form

One line: `LABEL: Name (detail)` on the left, an always-visible expand button on the right.

- "HERO: Torin Stonefist"
- "STATBLOCK: Human Bandit Chief"
- "STAMINA (15/20)" — the key-data case; a standalone `ds-stamina` block has no name.

The expand button is **in flow, inside the collapsed bar** — not the hover panel. A
collapsed element must not be a dead end anywhere hover is unavailable (touch, stylus).

Collapse is implemented by attribute, not by unmounting: `data-dse-collapsed="on"` on the
root, and CSS hides every root child except the panel and the summary bar. The element's
view stays mounted, so expanding is instant and no state is lost.

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

Measured: `check-freeze.sh` → `freeze OK (67/67 steel-print PNGs byte-identical)` with the
prototype live on three elements.

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
| `{statblock,hero,stamina-bar}-collapsed` | each element's authored-collapsed form, per element |

24 new shot names (8 capture ids × 3 combos), all new names, so the freeze baseline is
untouched by construction. A widening is optional and is a landing decision.

---

## 9. Open questions for Scott

1. **The YAML key spelling.** `collapsed: true` (shipped) vs a namespaced
   `dse_collapsed: true`. `collapsed:` is nicer to type; namespacing removes any chance of
   ever colliding with an element's own field, the way `collapse_default:` already collides.
2. **Attachment treatment.** The panel currently reads as a tab seated on the card's top
   edge (shared hairline, square bottom corners, upward shadow). Alternatives if it does
   not read strongly enough: a downward notch/tail bridging into the card, or tucking the
   panel a few pixels *under* the card's top edge.
3. **Should the panel also carry the collapse affordance while the element is collapsed?**
   Today the collapsed bar has its own always-visible expand button and the panel is
   inside the hidden card, so an author cannot reach *Edit* without expanding first.
4. **Does the existing edit pencil belong in print at all?** It currently does not (print
   rule 4 hides `.dse-btn`) — this is stated so nobody "fixes" it later.
5. **Reference-body summaries.** A `ds-statblock` whose body is an SCC code collapses to
   the reference text, not the creature's name. Fixing it needs a view-driven chrome
   refresh after async resolution. Worth doing at rollout, or acceptable?
6. **`withPrefOverrides` double-emit.** The same round-trip hazard `withCollapsedDefault`
   guards against exists, unguarded, for `prefs:` on a raw-splicing serializer (`ds-hero`).
   Pre-existing; should it become a FOLLOWUPS item?
7. **`ds-stamina`'s own wrapper.** The element already has a whole-element collapse — the
   kit collapsible's "Stamina Bar" header. Chrome now provides that framework-wide, so the
   wrapper is redundant. Removing it is a visible change **and** moves
   `stamina-bar--steel-print.png` (a sanctioned rebaseline), so it is a rollout decision,
   not a prototype one.

---

## 10. Rollout plan (after the taste gate)

**Wave 1 — reference-capable card families (mechanical).** `statblock` (done),
`feature`, `featureblock`, and the eleven internal display-family elements
(`kit`/`condition`/`treasure`/`ancestry`/`culture`/`career`/`class`/`title`/`perk`/
`complication`/`rule`). All are `withReference`-wrapped, so each is one `chrome` slot on
its base def and `liftChrome` handles the rest. Their `authoringAnchor()` already returns
`.dse-card` / `.dse-sb`, so the panel is correctly anchored with no view change.
Summary: `{ label: <family>, name: model.name }`.

**Wave 2 — the hero suite + GM subsystems (each needs a summary decision).**
`hero` (done), `stamina-bar` (done), `conditions`, `resource`, `surges`, `tokens`,
`initiative`, `encounter`, `montage`, `project`, `party`, `negotiation`, `counter`,
`skills`, `characteristics`, `values-row`. Several want key data:
`Resource: Ferocity (4)`, `Initiative: Round 3`, `Conditions (2)`.

**Never** — trivial or bodiless elements: `horizontal-rule`, `roll`, `scc`.

**At landing, also:** decide the freeze widening for the new fixtures; add the
`DESIGN.md` entry for the chrome (component map + the hover-chrome rule); add a
`CHANGELOG.md` bullet; document `collapsed:` in the user docs; resolve open questions 1–7.
