# Changelog

## 6.0.0

Upgrading from 5.x? See the [migration guide](docs/migrating-to-6.md) for what
needs action.

- [BREAKING] Compendium source moved from the retired `data-md-dse` repo to
  `data-unified` releases (unified Browse layout, `md-dse` format). Run
  "Sync compendium" after updating — your old release-tag setting is reset
  because old tags belong to the retired repo.
- [BREAKING] Statblock YAML follows SDK 3.x: `roles:` is now `role:` +
  `organization:`, and `ancestry:` is now `keywords:`. Legacy keys in your own
  `ds-sb`/`ds-statblock` blocks keep working for the 6.x cycle — classified the
  same way the SDK's own reader does (last entry matching a known organization
  name wins that axis, everything else becomes the role) — with a console
  deprecation warning; support is removed in 7.0.0.
- Compendium sync is now non-destructive and manifest-driven: only files the
  plugin installed are updated or removed (removals go to the trash, never a
  hard delete), any incoming path that isn't safely inside the destination
  folder is rejected outright, and your own notes inside the compendium folder
  are never touched. The first sync offers — and never forces — moving a
  pre-6.0 compendium folder to the trash.
- New: `scc.v1:` links resolve everywhere — in compendium notes, inside element
  text, and as references (e.g. initiative tracker
  `statblock: scc.v1:mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker`).
  Links resolve to your local compendium first, then optionally to
  steelcompendium.io (toggle in Settings → Links → "Fall back to
  steelcompendium.io links").
- Settings' Compendium section is reworked: destination folder, release (pin a
  tag or leave empty for latest), locale, a synced-status line, and
  Sync/Check-for-updates buttons.
- New commands: "Sync compendium" (the old command id remains as a hidden
  "Sync compendium (legacy alias)" so hotkeys keep working; it will be removed
  in 7.0.0).
- Updates `steel-compendium-sdk` to 3.x.
- New: compendium reference cards — `ds-kit`, `ds-condition`, `ds-treasure`,
  `ds-ancestry`, `ds-culture`, `ds-career`, `ds-class`, `ds-title`, `ds-perk`,
  `ds-complication`, and `ds-rule` (a general glossary/rule card) render a
  compendium entry as a styled card. Each also accepts `ds-sb`/`ds-ft`/`ds-fb`
  (statblock/feature/featureblock) as a **reference**: write `scc.v1:<code>`,
  `@<path>`, `[[wikilink]]`, or (for the 11 new cards) a bare slug like
  `panther`, instead of inline YAML, and the card renders live from your
  synced compendium — including any nested ability cards embedded in that
  entry's own content.
- New: compendium search + insert — a fuzzy search command
  ("Search compendium") to find and insert a reference or a full inline copy
  of any compendium entry, without leaving the editor.
- The `/ds` autocomplete and the per-element "Insert Draw Steel: …" commands
  automatically cover every new card above.
- New: **Draw Steel sidebar** — pin any tracker (initiative, encounter, montage,
  project, party) to a persistent right-sidebar panel that survives navigating
  between notes, via the new sword icon in the ribbon ("Open Draw Steel
  sidebar") or the "Send block to sidebar" / "Send initiative tracker to
  sidebar" commands. Edits made in the sidebar and edits made in the note stay
  in sync.
- New: **Encounter Builder** (`ds-encounter`) — plan an encounter against your
  synced compendium: add monsters by reference, see live EV/budget/difficulty
  computed from the real statblocks (never inlined stats), then hand off to a
  ready-to-run tracker with one click ("Create tracker block" or "Open in
  sidebar").
- New: **Montage tracker** (`ds-montage`), **Project/Downtime tracker**
  (`ds-project`), and **Party tracker** (`ds-party`) — trackers for Draw
  Steel's other GM subsystems (montage tests, downtime projects, and
  party-level victories/renown/wealth), following the same interactive,
  persisted-block model as the initiative tracker.
- New: the initiative tracker's **Malice panel** is now first-class — a
  keyboard-accessible pool stepper, a round counter with "Reset turns (this
  round)" vs. "Advance round" (advancing can apply a configured per-round
  Malice gain), a spend/gain log, and a labeled quick-add for trigger-based
  gains (e.g. "+3 Feytouched").
- New: heroes and creatures in the initiative tracker get a per-turn action
  checklist (Main / Maneuver / Move / Triggered).
- New: **Hero suite** — a flagship **hero sheet** (`ds-hero`) composing
  characteristics, stamina (with recoveries and a winded/dying badge), heroic
  resource, surges, conditions, skills, and abilities (with click-to-expand
  ability cards and dice rolling) over one persisted block; your authored
  definition (name, class, ancestry, kit, abilities, …) stays byte-stable —
  only the small play-state churns as you use the sheet. Also ships as four
  standalone trackers you can use on their own: **Heroic resource**
  (`ds-resource`, class-aware), **Surge tracker** (`ds-surges`), **Conditions
  strip** (`ds-conditions`), and **Hero Tokens** (`ds-tokens`, a shared
  party-wide pool). The Stamina tracker (`ds-stamina`) gains recoveries and a
  Catch Breath action. The hero sheet works from inline YAML or resolves
  class/ancestry/kit live from your synced compendium; it can also be pinned
  to the Draw Steel sidebar like any other tracker.
- [BUGFIX] Stamina: the bar's winded coloring now matches the rules (winded at
  half Stamina **or below** — it previously flipped one point late), and the
  Stamina modal's "Spend Recovery" button now spends from your tracked
  Recoveries (heals your recovery value, disables with a reason at zero)
  instead of silently healing without spending one.
- [BUGFIX] A freshly-synced compendium file is now immediately resolvable by
  reference blocks (no more transient "found but not renderable — re-sync"
  card right after a sync).
- New: the **Steel theme** now matches the steelcompendium.io High-Fantasy
  Steel look — forged cards, embossed serif titles, crest badges, role-tinted
  statblock plates; the original look remains available as the **Legacy**
  style. Switch themes in Settings → Appearance.

## 5.1.1

- Corrects issue where double-clicking on an Element in reading mode will open edit mode

## 5.1.0

- Adds support for referencing statblocks within the initiative tracker (see docs for details)

## 5.0.0

- Support for Featureblocks!
- [BREAKING] Statblock CSS changed slightly
  - While this is incredibly minor, it is technically breaking

## 4.1.0

- Corrects an issue with rendering `0` in the values-row element
- Documentation cleanup
- Adds support for a default image in the initiative tracker

## 4.0.0

- [BREAKING] Updates to sdk 2.1.5 (up from v0) to support new schema
  - There are a LOT of changes, please read the [changelog](https://github.com/SteelCompendium/data-sdk-npm/blob/main/CHANGELOG.md)
- Due to changes in the schema, be sure to redownload the compendium 
  - IMPORTANT: this will delete the old compendium!  Be sure none of your homebrew is in that directory!

## 3.4.3

- Correctly supports `ds-negotiation` language

## 3.4.2

- Visual updates to the StaminaBar for the information icon
- Docs updates

## 3.4.1

- Stamina Element Updates
  - Migrated to use Vue
  - Updated visual appearance
  - Updated the modal to be more minimal
  - Temp stamina bar separated

## 3.3.0

- Skill Element updated to support `only_show_selected` to hide unselected skills from the Element
- Begins migrating to Vue
  - Boilerplate implemented
  - Updates Skill Element to use Vue
- New fields for Vue Elements (Currently only Skill Element)
  - `collapsible` (boolean) if `true` allows the Element to collapse
  - `collapse_default` (boolean) if `true` will set the default state of the Element to collapsed when rendered.
  - See the docs for Common Element Fields for details
    
## 3.2.2

- (Quietly) enabling mobile support

## 3.2.1

- Fixes to TestEffect parsing (`data-sdk-npm` `0.0.37`)

## 3.2.0

- Updates to `data-sdk-npm` `0.0.36` to support TestEffects 

## 3.1.0

- Minor updates to the statblock UI

## 3.0.0

- Uses the npm steel-compendium-sdk for parsing
  - Supports latest yaml format for statblocks and abilities

## 2.3.0

- Adds support for Canvas Character Sheets
  - Stamina Bar Element
  - Characteristics Element
  - Counter Element
  - Skills Element
  - Values Row Element

## 2.2.0

- Updates Initiative Element to use `Malice` instead of `VP`
  - Using `villain_power` in the codeblock should still work for now, but it will automatically get rewritten by the element
  - `villain_power` will be removed in `v3`

## 2.1.2

- Compendium Downloader yields to avoid hanging the main thread

## 2.1.1

- [BUGFIX] Correctly displays weaknesses

## 2.1.0

- Adds better error handling on Ability, Negotiation, and Statblock Elements
- Cleanup
- [BUGFIX] Properly handles tiered results in some views

## 2.0.0

- [BREAKING] The Power Roll Element has been replaced by the Ability Element
  - Instead of having a flat structure for the yaml, the `effects` field will list effects, power rolls, etc in an ordered manner
  - As a side effect, the Statblock Element inherits these changes as well
  - For details on the new structure, see the [Ability Documentation](./docs/Abilities.md) 
- Adds ability to [download the Draw Steel Compendium](./docs/compendium-downloader.md)

## 1.6.0

- Adds the statblock element! See the [statblock](./docs/statblock.md) documentation for details!
- Initiative tracker can be triggered with `ds-it` and `ds-initiative-tracker` now

## 1.5.0

- Adds basic support for Negotiation Tracking!

## 1.4.0

- Initiative Tracker
  - Adds basic support for tracking minions!
  - [BUGFIX] Prevents VP text from highlighting when changing
  - [BUGFIX] Allows click-to-remove conditions when blinking

## 1.3.0

- Add ability to reset the encounter

## 1.2.0

- Initiative Tracker
  - Overhauls the condition modal and adds support for customizing the condition appearance 

## 1.1.2

- [BUGFIX] Allow enemies to use recoveries

## 1.1.1

- [BUGFIX] Corrects bugs allowing for non-integer stamina

## 1.1.0

- Adds the Initiative Tracker Element!

## 1.0.2

- Corrects sizing issue on power roll tiers

## 1.0.1

- Cleanup bulleted lists

## 1.0.0

- Adds `horizontal-rule` element
- Adds a ton of new fields to `power-roll` element (See readme)
- [PSEUDO-BREAKING] No longer supports inline-codeblocks for `horizontal-rule`
  - This was unreleased, but for those who built manually...
  - Use a regular multi-line codeblock for functionality
- Adds support for rendering markdown in Power Roll values
- Much more!

## 0.0.6

- Internal cleanup, bugfixes

## 0.0.5

- Avoids innerHTML call for compliance

## 0.0.4

- Prep for inclusion in community plugins

## 0.0.2

- Adds `indent` property to Power Roll Element to support nested lists

## 0.0.1

- Initial release: Power Roll Element basics

