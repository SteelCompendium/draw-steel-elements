# Integration

## Dependency Map

```
steel-compendium-sdk (data-sdk-npm)
        │
        ▼ (bundled at build time)
draw-steel-elements (this repo)
        │
        ├── reads from ──> data-unified (compendium content, synced at runtime)
        │
        └── runs inside ──> Obsidian (host app)
```

## Upstream Dependencies

| Dependency | Type | How used |
|-----------|------|----------|
| `steel-compendium-sdk` (`data-sdk-npm`) | npm devDependency (bundled) | Provides TypeScript model classes and YAML parsing for Draw Steel data structures. Used by model classes in `src/model/`. Pinned to 3.2.0 (`"file:../data-sdk-npm"` until it's published to npm — see the ADR). Version changes can be breaking (6.0.0's statblock field rename required a compat shim; see `src/model/StatblockConfig.ts`). |
| `data-unified` | Runtime data (GitHub releases) | Markdown files with Draw Steel reference content, `md-dse` format. Synced (not wiped-and-replaced) via `CompendiumSyncService`. Not a build dependency. |
| Obsidian Plugin API | Runtime host | Provides `Plugin`, `App`, `Vault`, `parseYaml`, `MarkdownPostProcessorContext`, modal APIs. Externalized in esbuild config. |

## Downstream Dependents

None. This is an end-user Obsidian plugin. No other repos import or depend on it.

## API Surface

This plugin exposes no programmatic API. Its interface is the set of code block language tags:

| Language tag(s) | Element |
|----------------|---------|
| `ds-ft`, `ds-feat`, `ds-feature` | Feature (ability/power roll) |
| `ds-fb`, `ds-featureblock` | Featureblock (grouped features with stats) |
| `ds-sb`, `ds-statblock` | Statblock (creature/NPC) |
| `ds-it`, `ds-init`, `ds-initiative`, `ds-initiative-tracker` | Initiative tracker |
| `ds-nt`, `ds-negotiation`, `ds-negotiation-tracker` | Negotiation tracker |
| `ds-stam`, `ds-stamina`, `ds-stamina-bar` | Stamina bar |
| `ds-ct`, `ds-counter` | Counter |
| `ds-char`, `ds-characteristics` | Characteristics |
| `ds-skills` | Skill list |
| `ds-vr`, `ds-value-row`, `ds-values-row` | Values row |
| `ds-hr`, `ds-horizontal-rule` | Horizontal rule |
| `ds-roll` | Standalone dice roll (D5) |
| `ds-kit` | Kit reference card (D6) |
| `ds-condition` | Condition reference card (D6) |
| `ds-treasure` | Treasure reference card (D6) |
| `ds-ancestry` | Ancestry reference card (D6) |
| `ds-culture` | Culture reference card (D6) |
| `ds-career` | Career reference card (D6) |
| `ds-class` | Class reference card (D6) |
| `ds-title` | Title reference card (D6) |
| `ds-perk` | Perk reference card (D6) |
| `ds-complication` | Complication reference card (D6) |
| `ds-rule` | Rule/glossary reference card (D6; model-less — `genericCard()`, not `displayFamily()`) |
| `ds-encounter` | Encounter Builder — live EV via the compendium, budget/difficulty, hand-off to a tracker (D8) |
| `ds-montage` | Montage/Test tracker — negotiation-sibling, derived outcome bands (D8) |
| `ds-project` | Project/Downtime tracker — points, breakthroughs, respite log (D8) |
| `ds-party` | Party tracker — victories/renown/wealth, respite XP conversion, follower hints (D8) |
| `ds-conditions`, `ds-cond` | Conditions strip (single-actor) — reuses the initiative tracker's condition engine, decoupled (D7) |
| `ds-resource`, `ds-hr` | Heroic resource tracker — class-aware (D7) |
| `ds-surges`, `ds-surge` | Surge tracker (D7) |
| `ds-tokens`, `ds-hero-tokens` | Hero Tokens — canonical party-wide pool (D7) |
| `ds-hero` | Hero sheet — the flagship: composes the four D7 panels above + Characteristics/Stamina/Skills/Abilities over one persisted block (D7) |

Users interact by writing YAML inside these fenced code blocks in Obsidian notes. The 11
D6 elements above, plus `ds-sb`/`ds-ft`/`ds-fb`, additionally accept a **whole-block
reference** instead of inline YAML — see "Compendium reference (by-SCC)" below. All 32
elements register through the SAME `registerFrameworkElementDefinitions` (`main.ts`) —
there is no longer a legacy (non-framework) element in this plugin.

## Data Contracts

### Element YAML format

Each element type expects YAML conforming to its model class. Schemas in `src/model/schemas/` define the expected structure for validated elements. Unvalidated elements rely on the model's `parseYaml()` method to extract fields.

### Reference syntax

Elements can reference content in other notes:
- `@path/to/note` -- resolve by vault path
- `[[Note Name]]` -- resolve by Obsidian wikilink

The `ReferenceResolver` searches: exact path, path + `.md`, compendium directory prefix, then Obsidian metadata cache.

### Compendium reference (by-SCC) — D6

`CompendiumIndex` (`src/services/CompendiumIndex.ts`, `createCompendiumIndex(app,
sccResolver)`) is the typed-model accessor D8 (encounter builder) and the compendium
search/insert commands consume: `getEntry`/`getEntity`/`getStatblock`/`query`/
`resolveSlug`, backed by an LRU model cache (generation-guarded against races with vault
events) and `SccResolver`'s frontmatter `scc:` index (Task 1's read seam — a file is only
indexed if its frontmatter carries `scc: <code>`, matching real md-dse output).
`main.ts` constructs it in `onload` right after `sccResolver` (it depends on nothing
else), then threads it into `initializeElementFrameworkV2` as the `compendium` param —
`ElementPipeline` carries it into every `RenderContext` as `cx.compendium`, symmetric
with `cx.sccAnchors`.

`src/elements/shared/withReference.ts` wraps a base element definition (`statblock`,
`feature`, `featureblock`, and the 11 `displayFamily()`/`genericCard()` elements above) so
its block body may be **either** inline YAML **or** a whole-block reference:
`scc.v1:<code>` (or bare `scc:<code>`), `@<vault-path>`, `[[wikilink]]`, or (for the
`displayFamily()` elements only) a **bare slug** scoped to that element's own type family
(`ds-kit` given `panther` resolves; given `bleeding`, a condition, it error-cards — no
cross-family guessing). `RefUnwrapView` (`src/elements/shared/RefUnwrapView.ts`) owns
resolution against `cx.compendium` and the §1.5 degrade ladder: unresolvable code → plain
"not found" card; `cx.compendium` absent (harness/test caller that didn't construct one)
→ "compendium not installed" card; resolved but the wrong type family → "wrong type"
card. Recursion is depth-guarded (a resolved file whose own body embeds another
whole-block reference to itself/a cycle cannot recurse unboundedly).

In **hybrid** mode (a reference resolved to a real vault file), `CardLayout`
(`src/elements/shared/CardLayout.ts`) renders the card's chrome (title/badges/rows) from
the typed model as usual, but its trailing body region renders the **real resolved
file's markdown body** (`useSourceBody`, default true) through Obsidian's own
`MarkdownRenderer.render` — which means a nested `ds-*` code block inside that real body
(e.g. a kit's signature-ability `ds-feature` block) recurses through the SAME registered
code-block processors and mounts as a real, nested element card. This can only be proven
in a real Obsidian host (jsdom/unit tests stub `MarkdownRenderer`) — see
`visual-harness/obsidian-camera.mjs`'s dedicated `by-scc-kit` capture (D6 Task 11), which
seeds a real `kit/panther.md` fixture into the demo vault's managed compendium root and
asserts a nested `[data-dse-element="feature"]` actually mounts. A `flavor`/row value that
duplicates (a prefix of) the real source body is suppressed rather than shown twice
(`omitWhenSource` rows; the flavor/body duplicate-text guard).

Compendium search (`Ctrl/Cmd+P` → "Search compendium") and insert
(`src/authoring/CompendiumSearchModal.ts` + `src/authoring/compendiumInsert.ts`) are a
fuzzy `SuggestModal` over `CompendiumIndex.query()`, offering both a `scc.v1:` reference
insert and a full-code inline insert.

Deferred (recorded, not shipped): hover-preview on an `scc.v1:` link (OD-D6-5) and
autocomplete for by-SCC block bodies (OD-D6-4) — both future work, not blocking.

### Sidebar host (D8)

`src/framework/sidebar/` + `src/framework/host/SidebarBlockHost.ts` give any registered
element a THIRD mount surface — a persistent `ItemView` leaf — alongside the existing
reading-mode and live-preview `BlockHost`s, with **zero element-code changes** (the D7
consumer contract, spec §1.9: "element-agnostic — `onUpdate` works for any view"). This
is the running-session tracker use case: pin a `ds-initiative`/`ds-encounter`/… block so
it survives navigating between notes.

- **`DseSidebarView`** (`VIEW_TYPE_DSE_SIDEBAR = "dse-sidebar"`) is the `ItemView` shell.
  It owns a list of `SidebarPanel` children (`panels[]` from day one, OD-4 — a
  multi-panel GM dashboard is a pure additive follow-up on top of today's one-panel MVP).
  `getState()`/`setState()` serialize `{ panels: SidebarPanelState[] }`
  (`{ filePath, alias, anchorId, collapsed? }`) so panels survive an Obsidian restart.
- **`SidebarBlockHost`** is the third concrete `BlockHost` (`mode: "sidebar"` — the
  **already-reserved** `RenderMode` member from F1, OD-1: no union widening needed).
  Unlike a markdown-leaf host it isn't tied to the active editor — it reads/writes the
  backing file **directly by path** via `Vault.process`, so it keeps persisting correctly
  no matter which note has focus.
- **`_dse_anchor` contract (OD-9):** a sidebar panel can't rely on `getSectionInfo` (no
  live editor). Block identity is instead a reserved YAML key, `_dse_anchor: <id>`,
  stamped into the block body on first hand-off (`anchor.ts`'s `ensureAnchor`) and
  round-tripped by every element's `serialize()` like any other passthrough field —
  durable across line drift, greppable, never an Obsidian `^block-id`.
- **`onUpdate` live-refresh + self-echo guard:** `SidebarBlockHost` watches the backing
  file for external edits. On a genuine external change it calls the mounted view's
  `update(newModel)` (F1's in-place `onUpdate` path, §1.6) — the sidebar is the first
  real consumer of that path. Its OWN writes (`replaceSource`) must not re-trigger this:
  `SidebarBlockHost` records the body it just wrote (`lastWritten`) and a vault `modify`
  event that matches it is treated as **self-echo** and dropped (`host/SidebarBlockHost.ts`
  — "self-echo: our own write, not an external edit") — only a body that differs fires
  `onUpdate`.
- **D7 consumer contract (spec §1.9):** any caller — a future hero-sheet element, not
  just the D8 trackers — pins a block the same way: ensure `_dse_anchor` (`ensureAnchor`),
  then `view.addPanel({ filePath, alias, anchorId })`. `sendToSidebar(services, filePath,
  alias, cursorLine?)` (`framework/sidebar/registration.ts`) is the shared entry point
  every caller in this repo uses: the generic "Send block to sidebar" command (cursor
  inside a `ds-*` fence), the initiative-specific "Send initiative tracker to sidebar"
  command (scans the note's `ds-it`/`ds-init`/`ds-initiative`/`ds-initiative-tracker`
  aliases), and the encounter builder's "Open in sidebar" hand-off (below) all resolve to
  this one function — no bespoke second path.
- **Encounter's "Open in sidebar" hand-off (spec §2.4/OD-5):** `encounter/view.ts` writes
  a fresh `ds-initiative` tracker block from the resolved roster ("Create tracker block"),
  then — via a late-bound module hook (`setEncounterSidebarHandoff`, wired to
  `sendToSidebar` in `main.ts`'s `onload`, cleared in `onunload`) — opens it straight in
  the sidebar. The hand-off is optional at the type level (defaults to `null`) precisely
  so a caller that never wires it (an older test harness, a future build before this
  wiring lands) degrades to a visible Notice instead of a silent no-op.
- **Sidebar-width layout:** the sidebar leaf is ~300 CSS px (Obsidian's default
  right-sidebar width) — narrower than any note column the base element CSS assumes. A
  `@media (max-width: …)` query can't reach this (it queries the whole Obsidian window,
  which stays wide even when a side leaf is narrow); layout adaptations are DOM-scoped
  instead, under `.dse-sidebar [data-dse-element="…"] …` in `styles-source.css` (see its
  own "Sidebar-width layout adaptations" section, D8 Task 10 — currently covers the
  initiative tracker; any tracker sharing `.dse-init` inherits it for free).

### Turn/round economy + Malice panel (D8)

`EncounterData` (shared by `ds-initiative` and the encounter hand-off above) gained
three ADDITIVE-OPTIONAL fields (never emitted unless set, never materialized by `parse`):

- **`round`** — the encounter's round counter. `advanceRound(data)` (initiative model)
  is the round-boundary transition: increments `round`, clears every `has_taken_turn` +
  materialized per-actor `actions`, and (if `malice.round_gain` is configured) applies +
  logs the auto-gain. `resetRound(data)` is a DISTINCT, narrower control — the same
  turn/action clear WITHOUT touching `round` or re-granting the auto-gain — for a
  mid-round correction (a misclick, re-running the current round).
- **`actions`** (on `Hero` and `CreatureInstance`) — a per-turn action checklist
  (`{ main, maneuver, move, triggered }`, spec §7.2). Absent means "nothing tracked yet";
  materialized on the actor only on the first toggle. "Triggered" resets on `advanceRound`
  (per-round, spec §7.1), not on a per-turn clear.
- **`malice.round_gain`** / **`malice.log`** — the Malice panel (an `ds-initiative`
  sub-view, OD-6: no standalone `ds-malice` element) adds a keyboard-accessible pool
  stepper, the round display + its two controls above, a read-only spend/gain log
  (`{ round, amount, label }`, oldest-first), and a labeled quick-add for manual
  trigger-based gains (spec §3.3). `round_gain` absent means no configured auto-gain
  (OD-3 — never a fabricated Director's-guide default). **The log is capped** at
  `MALICE_LOG_MAX_ENTRIES` (50, `EncounterData.ts`) via the single sanctioned
  `appendMaliceLogEntry` helper — both the round-gain and quick-add call sites use it, so
  a long campaign's log can never grow the note without bound; it trims the OLDEST
  entries first. Monster malice-feature spends (spec §3.2, OD-7) parse the existing
  `cost: "N Malice"` string (`/^\s*(\d+)\s+Malice/i`) — no new typed SDK field.

### Hero suite (D7)

Five new elements (27→32) implementing `D7-hero-suite-spec.md`: four small standalone
trackers that each prove one composition seam, then the flagship `ds-hero` sheet that
composes all of them plus three extracted presentational cores over a single persisted
block.

- **`HeroPanel<S>` contract + the three extracted kit cores** (`src/framework/kit/`,
  spec §2.1/§2.3, OD-7 — "yes, factor into `framework/kit/`"): `HeroPanel` is the
  presentational-sub-view abstraction (`mountPanel(root, slice, onChange)` /
  `updatePanel(slice)`, an `obsidian.Component` with no model/persist/refs of its own —
  mirrors `ElementView`'s `onMount`/`onUpdate` split minus the container concerns).
  `CharacteristicsGrid` and `StaminaBarPanel` are raw render-function extractions (not
  `HeroPanel` subclasses — the spec's own fallback for panels with "no reusable
  `HeroPanel` wrapper," since the sheet's `HeroState` shape isn't the standalone
  `ds-characteristics`/`ds-stamina` model); `conditionIcons` is the third extraction. The
  container/presentational split is the load-bearing rule: **persistence and model
  ownership live in the container** (`HeroSheetView`, the standalone elements'
  `*PanelContainer`s); **rendering + mutation-intent live in the panels**, which only
  emit `onChange(patch)` upward. This extraction changed **no** rendered DOM (Task 1's
  neutrality proof: every existing `stamina-bar`/`characteristics`/`initiative` golden
  and DOM test passed unmodified).
- **The five new elements:** `conditions` (`ds-conditions`/`ds-cond`), `heroic-resource`
  (`ds-resource`/`ds-hr`), `surges` (`ds-surges`/`ds-surge`), `hero-tokens`
  (`ds-tokens`/`ds-hero-tokens`), and `hero` (`ds-hero`, the flagship). **Note:** for the
  two multi-word elements, the registered `id` (aliases.json key, registry identity) is
  NOT the source directory's basename — `heroic-resource`'s code lives in
  `src/elements/resource/` and `hero-tokens`'s in `src/elements/tokens/` (shorter names
  used by every production import site and ~10 test files). `visual-harness/notes-gen.mjs`
  bridges this id→dirname exception via a small `DIRNAME_OVERRIDES` lookup (Task 11 fix —
  see "Known breaks fixed this task" below).
- **The `hero:`/`state:` split + byte-stable state-scoped splice serialize** (spec §3.1/
  §3.4, OD-1/OD-2): a `ds-hero` block has authored **definition** fields (name, level,
  class/ancestry/kits refs, characteristics, abilities, …) at the block's top level, plus
  a nested `state:` map (the volatile play surface: stamina, resource, surges,
  recoveries, victories, conditions). OD-1's "`hero:`/`state:` split" is conceptual, not
  a literal `hero:` wrapper key — the definition fields sit flat alongside `state:` (spec
  §3.6's `ElementDefinition` sketch, confirmed in `hero/model.ts`). `HeroModel.parse`
  captures the definition region **verbatim** as `defnRaw` (a real structural scan for
  `state:`'s exact source span, not a naive regex — handles CRLF, out-of-order
  placement, and a `state:` substring inside a string value); `serializeStateSplice`
  re-emits `defnRaw + "\nstate:\n" + indent(stringifyYaml(model.state))`, splicing the
  untouched authored definition back byte-for-byte. Result: hand-authored content
  (comments, key order, ability list) never gets re-emitted by a stamina click — only the
  small `state:` map churns.
- **The `setCharacteristicProvider` roll bridge** (spec §3.5/§7, OD-6, recon delta 1):
  the D7 spec's own proposed `RollService.rollPower(req)` seam is superseded — D5's
  actual roll bridge already existed (`feature/view.ts`'s `setCharacteristicProvider`).
  `HeroSheetView` reuses it as-is: each expanded ability row mounts a real
  `FeatureElementView` (`this.addChild` + `.mount`) and calls
  `view.setCharacteristicProvider(this.provider)` — no new roll interface. Surges are
  spent **only** by explicit player choice via `SurgePanel`'s own stepper (never
  auto-decremented on a roll result) — a MUST-FIX correction from the spec's suggested
  "decrement `state.surges` by `result.surgesSpent`" auto-spend, which would have
  fabricated a tier≥2 rule Draw Steel doesn't specify.
- **View-level compendium resolution, not `def.resolveRefs`** (spec §3.5, `hero/
  resolve.ts`): `ds-hero` sets `autoResolveRefs: false` and has no `resolveRefs` at all.
  Resolution of `class`/`ancestry`/`kits[]` happens in the VIEW (`resolve.ts`,
  mirroring `RefUnwrapView`'s seam) because the sheet needs the **typed SDK model**
  (`Class`/`Kit`/`Ancestry`, for `deriveHeroStats`' math), not a whole-block mount —
  `def.resolveRefs`/`cx.refs` is only right for bare vault paths, and `SccRefProvider`
  throws on web/unresolved. Each ref degrades independently (a per-field `RefIssue`
  ladder: unresolved → inline overrides + a "not found in compendium — sync
  compendium?" notice, never a hard failure) — this is the degrade-per-ref behavior
  visible in the camera shots when the demo vault's small seeded compendium subtree
  doesn't cover a hero's specific refs. `abilities[]` SCC codes are explicitly out of
  this scope — left unresolved, rendered lazily per-row on expand via the existing
  by-SCC path.
- **Loosened conditions modals** (`ConditionSelectModal`/`CustomizeConditionModal`, spec
  §2.4, recon delta 7): `character`'s parameter type widened from the encounter-specific
  `Hero | CreatureInstance` to the structural `ConditionHolder` superset (`{
  conditions?: (string|Condition)[] }`, `EncounterData.ts`) — source-compatible (the
  field is stored but never read), so `ds-conditions`'s standalone panel can open the
  SAME modal with a minimal `{conditions}` holder instead of fabricating encounter-only
  fields (id, statblock ref, initiative order) onto a fake `CreatureInstance`. Both
  `Hero` and `CreatureInstance` structurally satisfy the wider type, so the initiative
  tracker's existing call site keeps typechecking unmodified.
- **Known break fixed this task:** `npm run obsidian-shots`'s full chain
  (`notes-gen.mjs && build-no-check && obsidian-camera.mjs`) failed at `notes-gen.mjs`
  before this task — its `examplePathFor(id)` assumed `src/elements/<id>/` (the id→
  dirname assumption above), which broke for `heroic-resource`/`hero-tokens`. Fixed via
  `DIRNAME_OVERRIDES`. Separately, the hero-in-sidebar ground-truth capture (step 3d,
  D7 Task 10) produced a **silently wrong screenshot** once run after step 3c
  (initiative-sidebar) in the same sweep: `DseSidebarView` is a multi-panel host
  (D8 spec §1.3/§1.7) that reuses/APPENDS to an existing `dse-sidebar` leaf rather than
  opening a fresh one, so step 3d's hero panel mounted correctly but below step 3c's
  still-present initiative panel — the leaf-clip (fixed sidebar height, scrolled to top)
  silently captured the wrong (initiative) content. Fixed by detaching any existing
  `dse-sidebar` leaves before each ground-truth sidebar capture
  (`closeDseSidebarLeaves`), so each starts from a clean, single-panel leaf.

### Adopted open decisions (D7, spec §8)

| OD | Decision |
|----|----------|
| OD-1 | In-block `hero:`/`state:` split (conceptual, not a literal `hero:` wrapper key) — definition fields flat, `state:` nested. |
| OD-2 | State-scoped splice serialize (byte-stable authored definition) over a full re-serialize. |
| OD-3 | Canonical standalone `ds-tokens` party pool now; true cross-note live sync deferred to a party tracker (landed as D8's `ds-party`). |
| OD-4 | Derived stats (max Stamina/recoveries/resource) derive from class+kit+level when compendium-resolved; always allow explicit override. |
| OD-5 | Compact ability rows, lazy-expand to a full card, with a cost/type tab filter. |
| OD-6 | D5 owns the roll + edge/bane resolver; the sheet only supplies context and reacts (realized via the existing `setCharacteristicProvider` bridge, not a new `RollService`). |
| OD-7 | `HeroPanel` lives in `framework/kit/`; Characteristics/Stamina/Skills factor render into panels (or a documented raw-extraction fallback where a full panel wrapper doesn't fit). |
| OD-8 | Minimal `[respite]` action (restore Stamina+Recoveries, clear surges+temp+EoE conditions); Victories→XP conversion prompt deferred. |
| OD-9 | Multi-hero/party-in-one-note + initiative import: out of D7 core, a cross-effort follow-up. |

### Adopted open decisions (D8, spec §0)

| OD | Decision |
|----|----------|
| OD-1 | Sidebar mode reuses the already-reserved `"sidebar"` `RenderMode` member — no F1 union widening. |
| OD-2 | Encounter budget/band/payout are parameterized, user-editable tables with defaults flagged for verification; shows spent EV vs. an "unset" budget before configured. |
| OD-3 | Malice per-round gain is a configurable value (`malice.round_gain`); absent → manual-only. |
| OD-4 | Sidebar ships single-panel MVP; `panels[]` is a list from day one. |
| OD-5 | Encounter hand-off offers both "Create tracker block" and "Open in sidebar". |
| OD-6 | Malice tracker is an initiative sub-view (single source of truth); standalone `ds-malice` deferred. |
| OD-7 | Malice-feature spend parses the existing `cost: "N Malice"` string; no cross-repo typed-field request. |
| OD-8 | Party↔hero linkage is ref-by-link (`hero_ref`); inline fields are the fallback. |
| OD-9 | Sidebar block anchoring is the reserved YAML key `_dse_anchor`, never an Obsidian `^block-id`. |

### Compendium release format

`CompendiumSyncService` resolves a `data-unified` GitHub release (latest, or a pinned tag), downloads its `md-dse-unified-{locale}.zip` asset, and diffs the archive against a manifest before writing anything into the configured destination directory (default: `DS Compendium`) — see the "Compendium data source" section below.

### Compendium data source (6.0.0+)

- **Repo:** `SteelCompendium/data-unified`, GitHub Releases (timestamp tags, `v4.<UTC>`).
- **Asset contract:** `{format}-unified-{locale}.zip` — the plugin downloads
  `md-dse-unified-en.zip`. The zip's internal root is the format directory's *content*
  (`class/…`, `monster/…` at top level).
- **Layout consumed:** `en/unified/md-dse` (Browse aggregate). File path ≡
  `sccToFilePath(code)` (drop source segment, expand dots) — the SCC resolver's primary
  lookup relies on this.
- **Sync:** manifest-driven (`compendium-manifest.json` in the plugin config folder);
  only manifest-tracked files are updated/trashed. See
  `.repo-docs/decisions/2026-07-01-data-unified-and-scc-resolution.md`.
- **SCC references:** `scc:`/`scc.v1:` links + reference strings resolve via
  `src/refs/SccResolver.ts` (vault path → frontmatter index → steelcompendium.io →
  unresolved). `scc.v2:`+ is refused by design.

## Cross-Repo Workflows

### SDK version bump

1. New version of `steel-compendium-sdk` is published to npm.
2. In this repo: `npm install steel-compendium-sdk@<version>`.
3. Update model classes if schemas changed.
4. Rebuild and test with existing compendium content.
5. If breaking: bump major version, update CHANGELOG, note that users must re-download compendium.

### Compendium content update

1. New content is added/updated in `data-unified` and a release is created (`just release-data`).
2. Users run the "Sync compendium" command in Obsidian to fetch and apply the latest release.
3. No code changes needed in this repo unless the content format changed.

## Integration Testing

No automated integration tests exist. Manual testing:

1. Install the plugin in a test vault.
2. Create notes with various `ds-*` code blocks.
3. Sync the compendium and verify rendering.
4. Test reference resolution across notes.
5. Test initiative tracker interactivity (adding/removing creatures, conditions, stamina changes).
