# DSE 7.0.0 release audit — what ships, what is deferred, what to walk through

**Purpose.** One list of every element, feature, setting and command the plugin has at
`main` (`draw-steel-elements` e0ee273), sorted into **Ship in 7.0.0** or **Defer**, with
a manual walkthrough checklist for everything that ships. Decisions were made by Scott on
2026-10-16; this file is the record. Release ticket: SC-11.

**Scott's rule:** elements that existed before 7.0.0 ship, polished in the High-Fantasy
Steel style. New elements are held back unless named below. Incomplete feature work (the
form editor, `ds-hero`) does not ship and must not be enableable with reasonable effort;
an undocumented switch is acceptable; the code stays.

Legend for *Since*: **6.0.2** = existed in the last published release (same surface as
5.1.1); **7.0.0** = new in this cycle. Legend for *7.0.0*: **Ship** / **Defer** (behind
the experimental switch, Linear ticket in §12) / **Fix** (ships once the named bug is
closed).

---

## 1. Baseline and gating mechanism

| | Count | Members |
|---|---|---|
| Elements in 6.0.2 | 11 | feature, featureblock, horizontal-rule, initiative, negotiation, statblock, stamina-bar, counter, characteristics, skills, values-row |
| Elements new in 7.0.0 | 11 | roll, scc, encounter, montage, project, party, conditions, resource, surges, tokens, hero |
| Internal display families (not public) | 11 | kit, condition, treasure, ancestry, culture, career, class, title, perk, complication, rule — reached only through `ds-scc` |

Everything in 6.0.2 was rewritten onto Element Framework v2 during this cycle, so "existed
before" means the *authoring surface* (block name + YAML) existed; the rendering is new
everywhere and needs the Steel-style polish pass regardless.

**Gating mechanism (decided 2026-10-16, implemented by SC-406).** One undocumented boolean
in the plugin's `data.json`, `"experimental": true` (absent = off), read once at load like
the existing `viewAdoption` kill switch. Not in the Settings UI. When off:

- Deferred elements are `hidden: true` (gone from `/ds`, Insert commands, docs) **and**
  render a small inert "not available in this release" card instead of the element.
  Today `hidden` only hides discovery; the block still renders fully.
- The sidebar is not registered (no leaf, ribbon, commands, or pin/unpin menu items).
- The `authoringControls` and `printPreview` descriptors are not in the catalog, so their
  settings rows disappear and per-block `prefs:` naming them is rejected.
- The legacy command alias `download-data-md-dse` is removed outright, not gated.

When on, everything is exactly as today; tests and the visual harness run with it on.

---

## 2. Elements

| Element | Aliases | Since | 7.0.0 | Notes |
|---|---|---|---|---|
| Statblock | `ds-statblock`, `ds-sb` | 6.0.2 | **Ship** | Reference (SCC code / `[[wikilink]]` / `@path`) **or** inline YAML. Snapshot insert. 11 display prefs + 3 presets. Sticky mini-header. Open: SC-367, SC-368 (card-head size/colour vs site), SC-370 (companion statblocks render no card — data side), SC-253/SC-316 (print read-only chip), SC-348 (role chips print contrast) |
| Feature / ability card | `ds-feature`, `ds-ft`, `ds-feat` | 6.0.2 | **Ship** | Abilities, traits, tests, custom power rolls, effects. Reference or inline. Snapshot insert. Keyword/distance display prefs. Optional roller (§6, ships). Open: SC-367, SC-368, SC-375 (kit name under signature ability — data side) |
| Featureblock | `ds-featureblock`, `ds-fb` | 6.0.2 | **Ship** | Malice features, dynamic terrain, fixtures, summoner. Reference or inline. Snapshot insert. 2 display prefs. Open: SC-373, SC-374 (summoner / terrain head slots), SC-237 (head-detail parity nits), SC-155 (feature_type shim, ETL side) |
| Horizontal rule | `ds-hr`, `ds-horizontal-rule` | 6.0.2 | **Ship** | Two site variants (ornate / plain, SC-128). Open: SC-238 (◆ divider paints nothing in print) |
| Initiative tracker | `ds-initiative`, `ds-it`, `ds-init`, `ds-initiative-tracker` | 6.0.2 | **Ship** | Heavily extended this cycle — see walkthrough. Its "Pinning to the sidebar" docs/command go with the sidebar. Open: SC-291, SC-292 (minion squad edge cases), SC-250, SC-251 (malice print/inputs), SC-249 (copy-pasted `_dse_from`) |
| Negotiation tracker | `ds-negotiation`, `ds-nt`, `ds-negotiation-tracker` | 6.0.2 | **Ship** | Just re-skinned (SC-379). Open: SC-388 (re-record negotiation.gif) |
| Stamina bar | `ds-stamina-bar`, `ds-stamina`, `ds-stam` | 6.0.2 | **Ship** | Redesigned from scratch (SC-132): forged gauge, temp segment, recoveries, Catch Breath, Winded/Dying. Its own edit modal (`StaminaEditModal`) |
| Counter | `ds-counter`, `ds-ct` | 6.0.2 | **Ship** | Stylised (SC-152). Open: SC-290 (write-back drops fence info string) |
| Characteristics | `ds-characteristics`, `ds-char` | 6.0.2 | **Ship** | Stylised (SC-152); roll bridge into feature cards |
| Skills | `ds-skills` | 6.0.2 | **Ship** | Overhauled (SC-182); layouts (`style`), show/hide unowned, custom skills, per-group collapse. Open: SC-349 (harness clip, gate only) |
| Values row | `ds-values-row`, `ds-value-row`, `ds-vr` | 6.0.2 | **Ship** | Stylised (SC-152) |
| Compendium reference | `ds-scc` | 7.0.0 | **Ship** | The only public way to render a synced compendium entry (SC-149); migration guide, docs index and getting-started lean on it. Open: SC-366 (web-fallback link colour), SC-362 (harness gap). SC-245 goes with the sidebar |
| Montage Test tracker | `ds-montage` | 7.0.0 | **Ship** | Scott: nearly prod-ready after SC-191/SC-334; shore up what is left. Open: SC-326 (board clips at high round counts — becomes a release item), SC-380 (shared track part, optional). Needs its own docs page (today shares `gm-trackers.md`); its "pin to the sidebar" prose goes |
| Roll | `ds-roll`, `ds-r`, `ds-power-roll` | 7.0.0 | Defer → SC-402 | Rolling on ability cards still ships (§6); only the standalone block is deferred |
| Encounter builder | `ds-encounter` | 7.0.0 | Defer → SC-395 | SC-382, SC-167, SC-248 ride along |
| Project / downtime tracker | `ds-project` | 7.0.0 | Defer → SC-396 | |
| Party tracker | `ds-party` | 7.0.0 | Defer → SC-397 | SC-192 rides along |
| Conditions strip | `ds-conditions`, `ds-cond` | 7.0.0 | Defer → SC-398 | The Conditions manager modal ships via the initiative tracker; only the standalone block is deferred. SC-344, SC-257 ride along; SC-361 stays in 7.0.0 (modal swatches) |
| Heroic resource | `ds-resource` | 7.0.0 | Defer → SC-399 | |
| Surges | `ds-surges` | 7.0.0 | Defer → SC-400 | |
| Hero tokens | `ds-tokens` | 7.0.0 | Defer → SC-401 | |
| Hero sheet | `ds-hero` | 7.0.0 | Defer → SC-194 (existing) | Already `hidden: true` (SC-190); gets the placeholder card like the others. Its "Edit definition" button is the only other door into the form editor and goes with it. SC-233, SC-293 ride along |

### 2a. Walkthrough checklists — shipping elements

**Statblock (`ds-sb`)**
- [ ] Inline YAML block renders (characteristics strip, stat tiles, traits, abilities, villain actions, flavor)
- [ ] By-SCC reference renders the real compendium file's body; unresolved code shows the not-installed card + steelcompendium.io link
- [ ] `[[wikilink]]` and `@path` references
- [ ] Each of the 3 presets (Steel card / Sourcebook / Index card) and every individual pref (§7) — light and dark
- [ ] Sticky mini-header: appears on scroll, drops to name+role at narrow width, absent in print/canvas/callout
- [ ] Narrow form at ~300px (SC-284)
- [ ] Print (Ctrl-P) and Export to PDF: no plate/shadow, villain band open, no menu panel (layout stays as-is; SC-405 owns the redesign)
- [ ] Collapse / expand via element menu; `collapsed:` / `collapse_default:` / `collapsible: false`
- [ ] Per-block `prefs:` override

**Feature (`ds-feature`)**
- [ ] Ability, trait, test, custom power roll shapes; effects list; one chip per keyword (SC-231)
- [ ] Keyword display × Distance+target display (chips / inline / grid / ledger)
- [ ] Reference by code / wikilink / path; snapshot insert strips `metadata:` (SC-165)
- [ ] Tier rows ~50px (SC-378); section titles (SC-235); headings inside markdown body (SC-318)
- [ ] With rolling ON: click-to-roll, roll bar, result card, edges/banes, crit; native and Dice Roller engines (SC-279 cleanup lands first)
- [ ] Inserted example is a valid main action (SC-236)

**Featureblock (`ds-fb`)**
- [ ] Malice, dynamic terrain, fixture/summoner bodies; option-cost text (SC-101); advancement bands
- [ ] Feature style (cards/flat) × Stat line (grid/ledger)
- [ ] Reference + snapshot paths as above

**Initiative tracker (`ds-it`)** — pre-existing element, mostly new internals
- [ ] Heroes and enemy groups; statblock refs (compendium code, unsynced-code UX SC-240); default portraits (SC-162) + `portraits` pref + default image path setting
- [ ] Minions: pool modal, captain Stamina bonus (SC-195), negative-input fix (SC-241), squad action checklist (SC-278)
- [ ] Per-actor action checklist; Round/turn controls; Reset Encounter modal
- [ ] Command bar: round + Malice pool with log and quick-add
- [ ] Stamina management (stamina designs, SC-183) and the Conditions manager (SC-186: custom conditions, icon picker, colour, duration, effect)
- [ ] Data persistence: edits write back to the note; view survives its own save (SC-340); scroll position preserved (SC-198); no jump-to-top on click
- [ ] No sidebar affordances visible anywhere (command palette, element menu)
- [ ] Print layout (malice column SC-250 is a known clip)

**Negotiation tracker (`ds-nt`)**
- [ ] Patience/interest gauges, final-offer band, argument flow (modifiers, power roll, completion), motivations/pitfalls, learn-more, end-of-negotiation states
- [ ] Collapse summary shows the NPC name

**Montage Test tracker (`ds-montage`)**
- [ ] Board: one row per hero, one column per round, running tally; cell quick-buttons (✓ / ✗ / +); cell form (result, skill, note); pencil mark on logged cells; correct/remove
- [ ] "Log an action…" picks the next hero; greys out when everyone has acted; skill-reuse warning
- [ ] End round / Back to round / Undo / Reopen / Clear all; limits reached = final; outcome banner; notes list under the banner
- [ ] Test tiers strip and "Running a montage test" panel (collapsed by default)
- [ ] Element menu (⋯): Add a round, Add a hero, Set limits…, Reset progress
- [ ] Narrow width (SC-326 clip) and touch; light/dark; print
- [ ] Docs: own page, no sidebar prose

**Stamina bar (`ds-stamina`)**
- [ ] Gauge incl. negative range and temp segment; recovery markers (click = set; popover pref); Catch Breath; Winded and Dying (badge fallback in print)
- [ ] Edit modal (temp stamina fix SC-133); Text-size scaling reaches the modal (SC-230)
- [ ] Narrow two-line rail; collapse summary "STAMINA (15/20)"

**Compendium reference (`ds-scc`)**
- [ ] One of each display family (§3) with a real synced compendium, light/dark/print
- [ ] Statblock, feature, featureblock, dynamic terrain by code
- [ ] Bad code / unsynced vault messages; not-installed card link (SC-366)

**Counter / Characteristics / Skills / Values row / Horizontal rule**
- [ ] Each renders in Steel style light+dark, in a note, on a canvas (read-only badge), in print
- [ ] Skills: `style` layouts, unowned show/hide, custom skills, per-group collapse, no second disclosure header (SC-255)
- [ ] Counter/Characteristics write-back (counter steppers; characteristics feed the roll bridge)
- [ ] HR: both variants, print (SC-238)

---

## 3. Internal display family (via `ds-scc`) — ships with `ds-scc`

| Family | Notes |
|---|---|
| kit | signature ability nested card; band headers; SC-375 (kit name) |
| condition | |
| treasure | |
| ancestry | |
| culture | |
| career | |
| class | SC-371 (book chip missing) |
| title | |
| perk | |
| complication | |
| rule | rule-group eyebrow (SC-272) |

---

## 4. Cross-cutting element behaviour

| Feature | Since | 7.0.0 | Walkthrough / notes |
|---|---|---|---|
| **Element menu panel** (hover/top-right icon panel; always visible on mobile; keyboard reachable; absent in print) — SC-169 | 7.0.0 | **Ship** | Appears on hover and on tab-focus; sits right (SC-189). With the pencil and pin items gone it carries collapse plus any element-specific items (montage) |
| Collapse / expand + one-line collapsed summary | 7.0.0 | **Ship** | Session-only memory; prints in full; `collapsed:`, `collapse_default:`, `collapsible:` keys; vault-wide defaults in Settings → Element defaults |
| "Pin to sidebar" / "Unpin from sidebar" menu items | 7.0.0 | Defer → SC-403 | |
| Edit pencil in the menu (`authoringControls`) | 7.0.0 | Defer → SC-404 | Descriptor removed; not enableable |
| **Draw Steel sidebar** (leaf, ribbon, commands, rename/delete follow, encounter hand-off) | 7.0.0 | Defer → SC-403 | Scott: too risky for 7.0.0; target 7.1.0. SC-383, SC-354, SC-245, SC-248 ride along |
| Read-only hosts: **Canvas** text nodes (read-only badge, interaction disabled), embedded notes / exports | 7.0.0 behaviour | **Ship** | Canvas character-sheet layout from the docs; badge placement |
| **`@media print` layout** (what Ctrl-P and Export to PDF produce) | 7.0.0 | **Ship as-is** | Cannot be turned off; still better than 6.0.2's screen plate in a PDF. Scott considers it ugly; redesign is SC-405 |
| **Print preview** toggle (Appearance page) | 7.0.0 | Defer → SC-405 | Not offered as a setting; descriptor removed |
| Per-block `prefs:` overrides | 7.0.0 | **Ship** | Attr-bearing keys only; structural trio + typography rejected with a console warning; `printPreview` now rejected too |
| View adoption across a block's own save (SC-340) + hidden `viewAdoption:false` kill switch | 7.0.0 | **Ship** | Open dialogs / focus / typed text survive a write; SC-384 (Live Preview modal) |
| Content-anchored save placement (SC-343) + dropped-write notice (SC-336) | 7.0.0 | **Ship** | SC-260, SC-290, SC-350 open |
| Session store (collapse state, roll results — never written to the note) | 7.0.0 | **Ship** | |
| Reading mode only (Live Preview host is a throwing stub by design) | — | **Ship** | SC-363 |
| Mobile (`isDesktopOnly: false`; menu panel always visible) | 6.0.2 | **Ship** | Needs at least one phone/tablet pass |
| Popout windows (scc link handler attaches per window) | 7.0.0 | **Ship** | |
| Minimum Obsidian 1.13.0 | 7.0.0 | **Ship** | BREAKING entry already in changelog |
| Typography tokens: nine `--dse-fs-*` role sizes, em-only | 7.0.0 | **Ship** | SC-372 fix required (see §7) |
| Light-scheme status colours + dark-mode richness (SC-196, SC-117) | 7.0.0 | **Ship** | SC-271 open |
| External-link icon on links that leave the vault (SC-317) | 7.0.0 | **Ship** | |
| Markdown task-list checkboxes inside cards are native widgets (SC-319) | — | Ship as-is | |

---

## 5. Authoring (D9)

| Feature | Since | 7.0.0 | Notes |
|---|---|---|---|
| **Form editor modal** (`FormModal.ts`/`formModel.ts`) | 7.0.0 | Defer → SC-404 | Scott: ugly, confusing, hard to use; hide it, keep the code. Reached only from the pencil and `ds-hero`'s "Edit definition" — verified: Insert commands, `/ds` and the compendium inserts never import it. Both doors close with the gating |
| `authoringControls` pref + Authoring settings page | 7.0.0 | Defer → SC-404 | Descriptor removed. No vault migration: Scott expects no user vault to carry the key |
| Insert commands: one `Insert Draw Steel: <element>` per non-hidden element | 7.0.0 | **Ship** | Set shrinks automatically with the hidden list |
| `/ds` EditorSuggest scaffolder | 7.0.0 | **Ship** | Same registry loop |
| Schema key/enum autocomplete inside an open `ds-*` fence | 7.0.0 | **Ship** | Always on |
| Compendium search modal + **Insert Draw Steel: compendium reference** (Shift = inline `scc.v1:` link, Ctrl/Cmd = copy code) | 7.0.0 | **Ship** | Writes `ds-scc` for everything except statblock/feature/featureblock |
| **Insert Draw Steel: compendium block (snapshot)** (statblock / feature / featureblock) | 7.0.0 | **Ship** | SC-165 strips `metadata:`; "Customize a monster" guide depends on it |
| Never built: SDK-reader text importer (F2), CM6 squiggle linter | — | n/a | Listed so nobody looks for them |

---

## 6. Rolling (D5)

| Feature | Since | 7.0.0 | Notes |
|---|---|---|---|
| Pure roll engine (2d10, tiers, edges/banes, crit on 19–20) | 7.0.0 | **Ship** | |
| `rollingEnabled` pref (default OFF) → roller on ability cards (roll bar, result card, history) | 7.0.0 | **Ship** | Scott: simple enough. SC-279 (roll UI/UX cleanup, Todo in the 7.0.0 project) lands first |
| `rollClickToRoll` pref | 7.0.0 | **Ship** | |
| `rollerEngine` pref: native / community Dice Roller bridge | 7.0.0 | **Ship** | |
| Characteristics → feature-card roll bridge | 7.0.0 | **Ship** | |
| Results session-only | 7.0.0 | **Ship** | |
| `ds-roll` standalone element | 7.0.0 | Defer → SC-402 | `docs/Roll.md` goes with it |

---

## 7. Settings & preferences

Settings UI: an index of pages, searchable via Obsidian's own settings search, with a live
preview on five pages and a per-page Reset. After gating the index has **eight** pages
(Authoring gone; Appearance loses its Print preview row). Sparse `prefs` storage,
`settingsVersion: 3`.

| Page | Pref key | Control / values | Default | Per-block? | Since | 7.0.0 |
|---|---|---|---|---|---|---|
| Appearance | `reduceMotion` | toggle | off | yes | 7.0.0 | **Ship** |
| Appearance | `printPreview` | toggle | off | yes | 7.0.0 | Defer → SC-405 |
| Appearance | `portraits` | toggle — initiative portraits | on | yes | 7.0.0 | **Ship** |
| Typography | `fontTitle`, `fontBody`, `fontControls` | curated font list or free text | vault default | no | 7.0.0 | **Ship** |
| Typography (Advanced) | `fontCardBody`, `fontLabel`, `fontMono` | font | vault default | no | 7.0.0 | **Ship** |
| Typography | `textScale` (60–140%), `cardScale` (80–120%) | slider | 100% | no (screen-only) | 7.0.0 | **Ship** |
| Typography | `smallTextScale`, `largeTextScale`, `controlTextScale` (80–120%) | slider | 100% | no | 7.0.0 | **Fix → Ship** (SC-372) |
| Statblock display | **Preset**: Steel card / Sourcebook / Index card / Custom (writes 9 prefs) | select | Steel card | — | 7.0.0 | **Ship** (SC-247 note) |
| Statblock display | `sbFeatureStyle` | card / flat | card | yes | 7.0.0 | **Ship** |
| Statblock display | `sbDensity` | comfortable / compact | comfortable | yes | 7.0.0 | **Ship** |
| Statblock display | `sbColumns` | single / wide | single | yes | 7.0.0 | **Ship** |
| Statblock display | `sbStats` | grid / gridc / ledger | grid | yes | 7.0.0 | **Ship** |
| Statblock display | `sbSticky` | toggle | on | yes | 7.0.0 | **Ship** |
| Statblock display | `sbStickyMeta` | toggle (greyed when sticky off) | on | yes | 7.0.0 | **Ship** |
| Statblock (Advanced) | `sbCharLine` | one / two | two | **no** (structural) | 7.0.0 | **Ship** |
| Statblock (Advanced) | `sbCharBox` | off / on / onword | off | **no** | 7.0.0 | **Ship** |
| Statblock (Advanced) | `sbVillain` | inline / banded | banded | **no** | 7.0.0 | **Ship** |
| Featureblock display | `fbFeatureStyle` | card / flat | card | yes | 7.0.0 | **Ship** |
| Featureblock display | `fbStats` | grid / ledger | grid | yes | 7.0.0 | **Ship** |
| Feature display | `kwUsage` | crest(chips) / text / grid / ledger | crest | yes | 7.0.0 | **Ship** |
| Feature display | `distTarget` | grid / text / ledger | grid | yes | 7.0.0 | **Ship** |
| Element defaults | `collapsibleDefault` | toggle | on | — | 7.0.0 | **Ship** |
| Element defaults | `collapseDefault` | toggle | off | — | 7.0.0 | **Ship** |
| Element defaults (Advanced) | `staminaRecoveryPopover` | toggle | off | — | 7.0.0 | **Ship** |
| Rolling | `rollingEnabled`, `rollerEngine`, `rollClickToRoll` | toggle / select / toggle | off / native / on | — | 7.0.0 | **Ship** |
| Authoring | `authoringControls` | toggle | off | — | 7.0.0 | Defer → SC-404 |
| Compendium | `compendiumDestinationDirectory`, `compendiumReleaseTag`, `compendiumLocale` + **Sync** / **Check for updates** buttons (busy state SC-243) + status line | text / buttons | `DS Compendium` / latest / `en` | — | 6.0.2 / 7.0.0 | **Ship** |
| Links | `sccWebFallback` | toggle | on | — | 7.0.0 | **Ship** |
| Initiative tracker | `defaultImagePath` | text | `Media/token_1.png` | — | 6.0.2 | **Ship** |
| (hidden, `data.json` only) | `viewAdoption` | boolean | absent = on | — | 7.0.0 | **Ship** (undocumented) |
| (hidden, `data.json` only) | `experimental` | boolean | absent = off | — | 7.0.0 | **Ship** (undocumented; SC-406) |

**SC-372 (the text-scale fix).** The nine `--dse-fs-*` tokens are declared on `:root` as
`calc(<r>em * var(--dse-fs-<x>-scale))`; the `var()` resolves where the property is
declared, so the per-element inline stamp never reaches it. Re-declaring the token block
on `[data-dse-element], .dse-modal` (keeping the `:root` copy for any consumer outside
those roots) makes all three knobs work with no change at defaults. Small; do it for
7.0.0.

Walkthrough for the settings surface: every page opens, search jumps to a row, live
preview re-renders on each change (except sticky), Reset restores defaults, nothing
scrolls inside the preview (SC-187), Text size reaches dialogs (SC-230), the three
text-scale sliders visibly move the preview after SC-372.

---

## 8. Compendium sync, migration and SCC references

| Feature | Since | 7.0.0 | Notes |
|---|---|---|---|
| Manifest-driven, non-destructive sync from the data-unified GitHub release (fflate) | 6.0.2 / 7.0.0 | **Ship** | Open: SC-358 (pre-download errors silent), SC-357 (migration can run during sync) |
| Command **Sync compendium** | 6.0.2 | **Ship** | |
| Command **Sync compendium (legacy alias)** (`download-data-md-dse`) | 6.0.2 | **Remove** (SC-406) | Scott: a silent bound hotkey is acceptable; two sync entries is confusing. One line in `migrating-to-7.md` |
| First-sync-into-existing-folder dialog (`LegacyCompendiumModal`: keep everything / trash old copy) | 7.0.0 | **Ship** | Every upgrading user sees it; part of the migration path |
| **Pre-7.0.0 → unified layout migration** (`CompendiumMigrationModal`, `migrationMap.json`, Obsidian-rename engine, backups; command **Migrate compendium from the pre-7.0.0 layout**) — SC-125 | 7.0.0 | **Ship** | Required by `migrating-to-7.md` |
| `CompendiumIndex` (typed accessor, vault watchers) | 7.0.0 | **Ship** | |
| Whole-block references in statblock / feature / featureblock (`scc.v1:` code, bare code, `@path`, `[[wikilink]]`) | 7.0.0 | **Ship** | |
| `scc.v1:` **inline links** everywhere (reading rewrite, LP/Source CM6 extension, popouts, modifier clicks, web fallback) — SC-135 | 7.0.0 | **Ship** | SC-252 open; docs list the "can't do yet" set |
| `SccRefProvider` (`scc:` refs resolve to the first `ds-*` block of the target file) | 7.0.0 | **Ship** | |
| Not-installed card for unresolved codes | 7.0.0 | **Ship** | SC-366 |
| PDF export link fidelity | — | Never built → SC-124 | |

---

## 9. Commands after gating

| Command id | Name | 7.0.0 |
|---|---|---|
| `insert-<element>` (every non-hidden element: 12 + montage = 13) | Insert Draw Steel: `<name>` | **Ship** |
| `insert-compendium-reference` | Insert Draw Steel: compendium reference | **Ship** |
| `insert-compendium-block` | Insert Draw Steel: compendium block (snapshot) | **Ship** |
| `sync-compendium` | Sync compendium | **Ship** |
| `migrate-compendium-layout` | Migrate compendium from the pre-7.0.0 layout | **Ship** |
| `download-data-md-dse` | Sync compendium (legacy alias) | **Removed** |
| `open-dse-sidebar`, `send-block-to-sidebar`, `send-initiative-to-sidebar`, ribbon icon | sidebar | Defer → SC-403 |

---

## 10. Dialogs / modals

| Modal | Used by | 7.0.0 |
|---|---|---|
| `StaminaEditModal` | stamina bar, initiative | **Ship** |
| `ConditionsModal` (manager: add/remove, custom conditions, icon search, colour, duration, effect) | initiative | **Ship** (SC-361 swatch focus stays a 7.0.0 item) |
| `MinionStaminaPoolModal` | initiative | **Ship** |
| `ResetEncounterModal` | initiative | **Ship** |
| `CompendiumSearchModal` | insert commands | **Ship** |
| `CompendiumMigrationModal`, `LegacyCompendiumModal` | sync | **Ship** |
| Montage log / limits forms; negotiation argument / learn-more views; undo notice | montage / negotiation | **Ship** |
| Settings preview | settings tab | **Ship** |
| `FormModal` (form editor) | pencil, hero | Defer → SC-404 |

All dialogs: Steel theme reaches them (SC-104), Text size scales them (SC-230), focus
rings (SC-338), a11y role is "generic" not "dialog" (SC-355 open).

---

## 11. Docs and release artefacts — SC-407

Every deferred item has a docs footprint to remove or mark "coming in a later release":
`README.md`, `docs/index.md`, `getting-started.md`, `migrating-to-7.md` (at-a-glance
list), `gm-trackers.md` (→ montage only), `hero-suite.md` (→ Stamina pointer),
`Roll.md` (out), the sidebar sections in `initiative-tracker.md` / `running-an-encounter.md`
/ `writing-blocks.md` / `advanced-usage.md`, the pencil bullet in
`common-element-fields.md`, the Authoring page + Print preview row in `settings.md`, and
the `CHANGELOG.md` 7.0.0 FEATURE bullets for deferred items. Then `npm run docs-shots`
(SC-388 negotiation.gif is hand-recorded), `just release <version>`, mike docs deploy.
Gates: `dse-verify` battery.

---

## 12. Linear map

**7.0.0 work created from this audit (project "DSE 7.0.0"):**

| Ticket | What |
|---|---|
| SC-406 | `experimental` switch; hidden-element placeholder card; sidebar/authoring/print-preview off; drop legacy sync command |
| SC-407 | Docs + CHANGELOG + README prune to the shipped set |
| SC-372 | Text-scale fix (already in the project) |
| SC-279 | Roll UI/UX cleanup (already in the project) |
| SC-326 | Montage board clip at high round counts — **should move into the project** now that montage ships |
| SC-333 | App walkthrough bug hunting — this file's §2a is its script |

**Deferred (label `Deferred from 7.0.0`, team Steel Compendium):**

| Ticket | Item |
|---|---|
| SC-395 | `ds-encounter` |
| SC-396 | `ds-project` |
| SC-397 | `ds-party` |
| SC-398 | `ds-conditions` |
| SC-399 | `ds-resource` |
| SC-400 | `ds-surges` |
| SC-401 | `ds-tokens` |
| SC-402 | `ds-roll` |
| SC-403 | Draw Steel sidebar (pin/unpin, commands, ribbon, hand-off) |
| SC-404 | Form editor / `authoringControls` |
| SC-405 | Print/PDF design pass; Print preview toggle |
| SC-194 | `ds-hero` stabilisation (existing) |
| Also labelled | SC-233, SC-293 (hero); SC-382, SC-167, SC-248 (encounter / hand-off); SC-192 (party); SC-344 (conditions); SC-383, SC-354, SC-245 (sidebar; SC-354 pulled out of the 7.0.0 project); SC-124 (PDF links) |

Open 7.0.0-project bugs on shipping surfaces, for the walkthrough to start from: SC-367,
SC-368 (card-head size / colour vs site), SC-366 (web-fallback link colour), SC-361
(swatch focus), SC-290 (fence info string), SC-260 (no-op writes), SC-324 (kit icon
tooltips). DSE-labelled bugs outside the project that touch shipping surfaces: SC-370,
SC-375, SC-373, SC-374, SC-291, SC-292, SC-250, SC-251, SC-253, SC-316, SC-238, SC-348,
SC-271, SC-358, SC-357, SC-252, SC-384.

---

## 13. Decisions record (Scott, 2026-10-16)

1. Deferral mechanism: single undocumented `experimental` switch in `data.json`; code stays; deferred blocks render a placeholder.
2. `ds-scc`: ships.
3. Sidebar: deferred to 7.1.0 ("a bit risky").
4. Rolling on ability cards: ships ("simple enough"). `ds-roll` element: deferred.
5. Form editor: hidden, code kept ("ugly, confusing, hard to use; fixing it would take too long").
6. Legacy sync command alias: removed; the lost hotkey is acceptable.
7. `ds-conditions` strip: deferred; the Conditions manager modal ships via the initiative tracker.
8. Montage: ships ("nearly prod-ready; shore up what's left").
9. Print/PDF: the print layout stays (unavoidable; printing is fine) but is not offered as a setting; the Print preview toggle is hidden; the look is "ugly and embarrassing" and gets its own ticket.
10. `LegacyCompendiumModal`: ships (needed by every upgrade).
11. `authoringControls`: no vault migration; no user vault should carry it.
12. Text-scale trio: ships, with SC-372 fixed for 7.0.0 (cheap).
13. Everything deferred gets a Linear ticket under the `Deferred from 7.0.0` label.
