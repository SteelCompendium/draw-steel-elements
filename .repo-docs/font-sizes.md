# Font sizes — the type-size role scale (SC-185)

**Binding rule for anyone (human or agent) editing `styles-source.css` or writing element
CSS:**

> **A font size is stated as one of the nine `--dse-fs-*` ROLE tokens. A hardcoded
> `font-size` — `0.85em`, `0.82rem`, `14px` — is prohibited, and so is reaching for one of
> Obsidian's absolute `--font-ui-*` interface sizes.**

This is enforced, not merely requested: `test/unit/build/fontSizeContract.test.ts` walks the
sheet and fails on any `font-size` that is not on the scale and not on its allowlist of
pre-existing sites, and fails again on an allowlist entry that no longer matches anything.
The list only ever shrinks.

The tokens are defined in one place — the `:root` block in `styles-source.css` under
"**THE TYPE-SIZE ROLE SCALE**" — and are mirrored in `src/framework/tokens.ts`
(`DSE_TOKEN_NAMES`) and the workspace `docs/superpowers/dse-overhaul/D3-token-map.md`.

## The scale

| Token | Default | Use it for |
|---|---|---|
| `--dse-fs-heading` | `1.25em` | The headline a card is *about* — a statblock or ability name. |
| `--dse-fs-subheading` | `1.15em` | A band, group or section title underneath that. |
| `--dse-fs-numeral` | `1.75em` | A display stat VALUE meant to be read across a table (Stamina, a counter's number). |
| `--dse-fs-body` | `1em` | The element's own reading size — i.e. the host note's. Also the explicit "stop inheriting a smaller context" reset. |
| `--dse-fs-control` | `1em` | Interactive control text: buttons, steppers, tabs, collapse headers, inputs. |
| `--dse-fs-secondary` | `0.9em` | Supporting prose and dense tables — quieter than body, still prose. |
| `--dse-fs-label` | `0.85em` | Field labels, card-header eyebrows and decks, chips. |
| `--dse-fs-caption` | `0.8em` | Hints, log lines, small badges. |
| `--dse-fs-micro` | `0.7em` | Tallies, tags, superscript markers. |

Three user knobs multiply the bands, and are what the settings sliders write:

| Knob | Setting | Multiplies |
|---|---|---|
| `--dse-fs-small-scale` | Small text size | `secondary`, `label`, `caption`, `micro` |
| `--dse-fs-large-scale` | Large text size | `heading`, `subheading`, `numeral` |
| `--dse-fs-control-scale` | Control text size | `control` |

All three default to `1` and are stamped inline per element root only when moved off `1`
(`css: { varName, toCss }` in `src/prefs/catalog.ts`, same remove-on-default semantics as
every other css-bearing pref), so a vault that never opens Settings renders exactly what it
rendered before the scale existed.

## How to pick one

**Pick the role that describes what the text IS, never how big you want it to look.** That
is the whole mechanism. Two elements that agree about what a "label" is agree about its size
for free, which is the failure SC-185 was filed for — before the scale, the sheet carried
116 `font-size` declarations across **30 distinct values**, so a label was `0.85em` in one
element, `0.82em` in another and `var(--font-ui-smaller)` in a third.

If genuinely no role fits, that is a **scale change**, not an exemption: add or retune a
`--dse-fs-*` token, document it here and in the D3 token map, and update the guard's counts.
Do not add a site to the test's allowlist to turn a red run green.

Deriving from a role is fine and normal — `calc(var(--dse-fs-caption) * 0.6)` for a
sub-glyph inside a composite numeral, for instance. The contract is that the size traces
back to the scale, not that it equals a token exactly.

## Why ratios, and why not Obsidian's variables

Every role is an **`em` ratio**, so the root of the scale is whatever the user's theme gives
the note. The plugin never states an absolute size, and therefore can never fight a theme's
typography: a bigger reading font makes every DSE role bigger, in proportion, with no
setting touched.

This is deliberately *not* how Obsidian's own `--font-ui-*` variables behave, and the
difference is the substance of the design decision:

- `--font-ui-smaller/small/medium/large` are **absolute px** (12/13/15/20px) keyed to
  Obsidian's **interface** font-size slider.
- Note text is keyed to the **text** font-size slider — a different control.

So a card whose body text is `1em` (from the note) and whose stat value is
`calc(var(--font-ui-large) * 1.4)` (from the interface scale) has two sizes that **drift
apart whenever the user moves either slider**. That is a mechanical, reproducible source of
"the font sizes are all over the place", and it is why the scale owns its own vocabulary
instead of aliasing Obsidian's.

The relative Obsidian sizes (`--font-smaller`, `--font-smallest`, `--tag-size`) do not have
that problem — they are `em` — but they are still a second, undocumented vocabulary with no
role names and no user control, so they are on the same list.

**Where Obsidian's UI variables remain correct:** genuine Obsidian *chrome* — modal
furniture, suggest popups, settings rows — which is interface, sizes with the interface, and
is not note content. Prefer the role scale even there when the surface is a DSE element
rendered inside a modal.

## What the scale does NOT replace

Three other size mechanisms exist and are legitimate; they are separate systems, not
violations:

- **`--dse-text-scale` / `--dse-card-scale`** (SC-112) — whole-element zoom and whole-card
  zoom, driven by the "Text size" / "Card size" sliders. These change how big an element is;
  the role scale changes how its parts relate. Both are print-EXCLUDED (a printout must fit
  the page).
- **`--dse-value-scale` / `--dse-label-scale`** — the per-block YAML knobs on
  `ds-counter` / `ds-values-row` / `ds-characteristics`. Author-controlled, per-block, and
  reflected as custom properties by the element views (never as an inline `font-size`).
- **Obsidian's own font-FAMILY slots** (`--dse-font-title/body/card-body/label/controls/mono`)
  — the parallel vocabulary for *which face*, with its own six settings pickers. The size
  scale mirrors its shape on purpose, including the shared "controls" concept.

## Print and export

The role scale is **theme- and print-invariant**: no theme block and no print block
overrides any of the twelve tokens. A caption is still a caption on paper, and the size prefs
are documented to apply everywhere including print and export — the same contract the six
font-family pickers already carry, and the reason the print value blocks deliberately avoid
`!important`.

The one exception is `--dse-fs-control`, whose single consumer rule is itself print-excluded
(`:is([data-dse-element], .dse-modal):not([data-dse-print="on"])`), because controls are
screen chrome and do not print. That also makes "Control text size" structurally unable to
move a frozen print byte.

## No inline `font-size` from TypeScript

An `el.style.fontSize = …` bypasses the sheet, and with it the scale, the settings sliders
and the print layer. The plugin has never done this — the element views that need dynamic
sizing set a custom property and let CSS do the arithmetic — and
`fontSizeContract.test.ts`'s second describe block pins that as a contract rather than a
habit.

## Adoption status

SC-185 round 1 shipped the scale, the settings, this document and the guard, and adopted
**11 declarations** as proof (the shared card-header grammar, the generic `.dse-card`
frame, the statblock's label tier, the power-roll tier badge, and the shared control-text
rule).

SC-185 round 2 (2026-08-25) adopted the **44 inert-available** declarations the round-1
audit identified — a pure rename, each swap byte-identical (freeze 210/210, zero
mismatches; shots byte-identical across two runs). It also applied **C-1**: retuned
`--dse-fs-control`'s default from `1em` to `0.85em` (a bare `.dse-btn` computed 16px
against a native Obsidian button's 13.33px). **62 declarations remain hardcoded** — that is
exactly `ALLOWLIST.length` in the guard. Of those, 8 belong to the other, deliberate scale
systems (`--dse-text-scale`, `--dse-value-scale`/`--dse-label-scale`) and stay as they are;
the remaining 54 are real rendering changes awaiting Scott's sanction, grouped by visual
effect in `.superpowers/sdd/sc185/sc185-round2-report.md`.
