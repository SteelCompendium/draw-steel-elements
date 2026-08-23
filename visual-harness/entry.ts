// visual-harness/entry.ts — F4 harness page logic (Plan 11). Mounts DSE elements through
// the REAL ElementPipeline, mirroring the test/dom/elements/*.test.ts makeDeps/makeHost
// convention, driven by URL params. Bundled by visual-harness/esbuild.mjs with `obsidian`
// aliased to ./shim/obsidian.ts; under jest `obsidian` maps to the test mock instead, so
// test/dom/visual-harness/fixtures.test.ts imports this module directly (the browser boot
// below is inert there — jsdom has no #mount).
import '../test/setup/polyfills';
import '../test/setup/dom-setup';

import { ElementPipeline } from '../src/framework/pipeline';
import type { ElementPipelineDeps } from '../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../src/framework/host/BlockHost';
import { createElementRegistry } from '../src/framework/registry';
import type { ElementRegistry } from '../src/framework/registry';
import { createThemeService, DEFAULT_THEME_ID } from '../src/framework/seams/theme';
import type { ThemeServiceInternal, DseThemeId } from '../src/framework/seams/theme';
import { createPreferenceStore } from '../src/framework/seams/prefs';
import { createRollService } from '../src/framework/roll/service';
import type { PrefsStorage } from '../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../src/prefs/catalog';
import { createReferenceService } from '../src/framework/seams/refs';
import { createValidationService } from '../src/framework/validation';
import { createSessionStore } from '../src/framework/session';
import { setChromeMobileOverride } from '../src/framework/chrome/platform';
import { DEFAULT_SETTINGS } from '../src/model/Settings';
import { registerFrameworkElementDefinitions, FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from '../main';
import { INTERNAL_DISPLAY_ELEMENTS } from '../src/elements/display';
import { App, Plugin } from '../test/mocks/obsidian-core';

// Fixtures — D9 (Plan 15 Task 2): single-sourced from each element's own
// authoring.example (src/elements/<id>/example.yaml), esbuild/jest `.yaml` text loader.
import characteristicsDefault from '../src/elements/characteristics/example.yaml';
import counterDefault from '../src/elements/counter/example.yaml';
import featureDefault from '../src/elements/feature/example.yaml';
import featureblockDefault from '../src/elements/featureblock/example.yaml';
import horizontalRuleDefault from '../src/elements/horizontal-rule/example.yaml';
import initiativeDefault from '../src/elements/initiative/example.yaml';
import negotiationDefault from '../src/elements/negotiation/example.yaml';
import rollDefault from '../src/elements/roll/example.yaml';
import skillsDefault from '../src/elements/skills/example.yaml';
import staminaBarDefault from '../src/elements/stamina-bar/example.yaml';
import statblockDefault from '../src/elements/statblock/example.yaml';
import valuesRowDefault from '../src/elements/values-row/example.yaml';
import encounterDefault from '../src/elements/encounter/example.yaml';
import montageDefault from '../src/elements/montage/example.yaml';
import projectDefault from '../src/elements/project/example.yaml';
import partyDefault from '../src/elements/party/example.yaml';
import conditionsDefault from '../src/elements/conditions/example.yaml';
import resourceDefault from '../src/elements/resource/example.yaml';
import surgesDefault from '../src/elements/surges/example.yaml';
import tokensDefault from '../src/elements/tokens/example.yaml';
import heroDefault from '../src/elements/hero/example.yaml';
// D6 Task 6 (plan 16, spec §2) — the first three displayFamily() instances. Task 7 adds
// the remaining seven.
import kitDefault from '../src/elements/display/kit/example.yaml';
import conditionDefault from '../src/elements/display/condition/example.yaml';
import treasureDefault from '../src/elements/display/treasure/example.yaml';
import ancestryDefault from '../src/elements/display/ancestry/example.yaml';
import cultureDefault from '../src/elements/display/culture/example.yaml';
import careerDefault from '../src/elements/display/career/example.yaml';
import classDefault from '../src/elements/display/class/example.yaml';
import titleDefault from '../src/elements/display/title/example.yaml';
import perkDefault from '../src/elements/display/perk/example.yaml';
import complicationDefault from '../src/elements/display/complication/example.yaml';
// D6 Task 8 (plan 16, spec §3) — genericCard()'s only instance: ds-rule (model-less,
// reference-only, raw-markdown inline fallback per OD-D6-7).
import ruleDefault from '../src/elements/display/rule/example.yaml';

// SC-102 fix round (task-3 review M-1): the CORPUS-SHAPED villain statblock — the shape
// steel-etl ACTUALLY emits (`cost: Villain Action N` + the lone-dash `usage: '-'` + no
// `ability_type`), as opposed to the hand-authored `ability_type: Villain Action N` every
// other villain fixture here carries. Before the fix round the villain action type was a
// NO-OP on all 156 shipped villain actions while the suite showed it working; this fixture
// makes the sweep forever render what the pipeline emits. Single-sourced with
// statblock.test.ts's DOM catcher (both import this same file). Deliberately a SEPARATE
// fixture rather than an edit to the existing statblock fixtures: adding an ability to
// those would change the FROZEN statblock shots. Its own shots
// (`statblock-villain-corpus--*`) are new filenames — invisible to the freeze baseline by
// construction (sha256sum -c only checks names it lists), widen-eligible later.
import statblockVillainCorpus from '../test/fixtures/statblock/villain-corpus.yaml';

// FOLLOWUPS #56 / SC-128: the CORPUS-SHAPED ROLELESS statblock — a card whose role maps to
// nothing, which no fixture here had ever rendered. That gap is exactly WHY #56 went
// unseen: SC-103 suppressed `.dse-sb > .dse-hr` ungated while its replacement notch was
// [data-dse-role]-gated, so a roleless card lost band, notch AND divider at once, and no
// camera could see it. steel-etl really emits this shape (5 of 512 statblocks in
// data-unified: the 4 summoner Champions + Noncombatant), so the fixture is trimmed from a
// real one rather than invented. Single-sourced with statblock.test.ts's roleless catcher.
import statblockRolelessCorpus from '../test/fixtures/statblock/roleless-corpus.yaml';

// SC-108 / FOLLOWUPS #37 (design recon 2026-08-02): a second, harness-local fixture for
// featureblock's advancement-band gate (view.ts's `run.level > 0` branch), which had never
// been rendered by any fixture. Verbatim from test/dom/elements/featureblock.test.ts's
// proven `WITH_ADVANCEMENT` constant — not sourced from example.yaml, since this is a
// harness-only variant, not the single-sourced authoring example (D9). Deliberately carries
// no top-level `level`/`ev` so the shot proves the advancement band in isolation.
const featureblockAdvancement = `type: featureblock
featureblock_type: Fixture
name: Tiered Idol
features:
  - type: feature
    feature_type: trait
    name: Base Glow
    effects:
      - effect: Sheds light 2.
  - type: feature
    feature_type: trait
    name: Blinding Flare
    level: 3
    effects:
      - effect: Each enemy within 3 squares is dazzled.
  - type: feature
    feature_type: trait
    name: Searing Beam
    level: 3
    effects:
      - effect: One enemy within 5 squares takes 5 fire damage.
  - type: feature
    feature_type: trait
    name: Solar Crown
    level: 6
    effects:
      - effect: Allies within 2 squares gain an edge.
`;

// SC-123: a featureblock carrying the LOOSE-STAT HEADER (.dse-fb__stats). Neither
// shipped fixture has one — the angulotl example declares no stamina/size/stats and
// the advancement variant deliberately carries none — so the region the new
// `fbStats` preference reflows had never been photographed at all, in any theme.
// Shape copied verbatim from test/dom/elements/featureblock.test.ts's proven
// WITH_STATS constant (the same shape SettingsPreview's featureblock uses), not
// invented here. Harness-local, like featureblockAdvancement above: it is a
// coverage variant, not the single-sourced authoring example (D9).
const featureblockStats = `type: featureblock
featureblock_type: Fixture
name: Bloodstone of Yendral
level: 2
ev: "6"
stamina: "30"
size: "2"
stats:
  - name: Speed
    value: "0"
  - name: Stability
    value: "3"
  - name: Free Strike
    value: "2"
features:
  - type: feature
    feature_type: trait
    name: Hungering Pulse
    icon: ⭐️
    effects:
      - effect: Each enemy within 2 squares takes 2 corruption damage.
  - type: feature
    feature_type: trait
    name: Blood Debt
    icon: ❇️
    cost: 3 Malice
    effects:
      - effect: The bloodstone drains one adjacent creature, which takes 5 corruption
          damage and is weakened (save ends).
`;

// SC-121 Batch 4 / batch-1 review M-4: no fixture anywhere renders a CHECKED checkbox, so
// Batch 1's themed `input[type=checkbox]:checked` rule (accent fill + accent border) was
// asserted only in rule text. This variant of the negotiation fixture pre-checks state in
// BOTH places the element draws a checkbox: `hasBeenAppealedTo` on a motivation (the
// Motivations details list, and the `--used` line class in the argument panel) and
// `currentArgument.motivationsUsed` / `lieUsed` (the "Appeals to Motivation" + modifier
// checkboxes). Keys are camelCase because NegotiationData's own serializer round-trips the
// class instance verbatim (model.ts) — that IS the persisted shape. A separate fixture, not
// an edit to example.yaml: example.yaml is the single-sourced AUTHORING example (D9) and
// its shots are freeze-pinned, so a checked-state variant belongs beside it, not inside it.
// SC-132: the stamina family had exactly ONE fixture — a healthy bar, no recoveries —
// so the subject of the whole redesign (the winded/dying state ladder, the recoveries
// strip, the temp plate against a real max) had no shot coverage at all. Three variants
// close that, and the numbers are the hero example's so the sheet and the standalone
// element can be compared side by side: max 48, winded at <= 24, 10 recoveries.
const staminaBarRecoveries = `max_stamina: 48
current_stamina: 31
temp_stamina: 4
recoveries: 6
recoveries_max: 10
`;
const staminaBarWinded = `max_stamina: 48
current_stamina: 18
temp_stamina: 0
recoveries: 4
recoveries_max: 10
`;
const staminaBarDying = `max_stamina: 48
current_stamina: -6
temp_stamina: 0
recoveries: 1
recoveries_max: 10
`;

const negotiationChecked = `name: "Convincing Frodo to remember the taste of strawberries"
initial_interest: 3
initial_patience: 3
motivations:
  - name: "Higher Authority"
    reason: "It's Frodo's duty to destroy the ring"
    hasBeenAppealedTo: true
  - name: "Peace"
    reason: "The Shire is life"
pitfalls:
  - name: "Power"
    reason: "The ring is too powerful to ignore"
currentArgument:
  motivationsUsed:
    - "Higher Authority"
  pitfallsUsed: []
  lieUsed: true
  reusedMotivation: true
  sameArgumentUsed: false
i5: "Remembers the taste of strawberries and cream!"
i4: "Remembers the taste of strawberries"
i3: "Remembers the taste of unripe strawberries"
i2: "Remembers the smell of strawberries"
i1: "Doesn't remember the taste of strawberries"
i0: "Thinks you're after the ring; becomes hostile"
`;

// SC-117 Batch 6 (catalog D9): `.dse-section--spend` never renders in the sweep —
// renderFeature.ts's `isSpend` gate only fires when an effect's RAW `cost` field starts
// with "Spend" (Draw Steel's "Spend Heroic Resource"/"Spend a Recovery" grammar, RR §—),
// and no fixture anywhere uses that wording. Verbatim copy of feature/example.yaml with
// the "Special" effect's cost changed from "2 Malice" to "Spend Heroic Resource" — the
// single-sourced default (D9-elsewhere: the authoring example) stays byte-identical and
// freeze-pinned; this is a harness-only variant, same convention as featureblockAdvancement
// above.
const featureSpend = `type: feature
feature_type: ability
name: Coverage Strike
cost: 5 Malice
ability_type: Villain Action 1
flavor: A sweeping flourish of steel.
keywords:
  - Attack
  - Weapon
usage: Main action
distance: Melee 1
target: One creature
trigger: A creature ends its turn adjacent to the target.
effects:
  - name: Effect
    effect: The primary effect text.
  - roll: Power Roll + Might
    tier1: Tier one outcome.
    tier2: Tier two outcome.
    tier3: Tier three outcome.
    crit: Crit outcome.
  - name: Special
    cost: Spend Heroic Resource
    effect: Special clause text.
  - name: Aftermath
    effect: Wrapper text.
    features:
      - type: feature
        feature_type: trait
        name: Inner Feature
        effects:
          - name: Inner Effect
            effect: Inner effect text.
`;

// SC-102 part 2 (Task 4, S-5 = (a), the recommended option): a REAL standalone villain
// card. `src/elements/feature/example.yaml` (the `feature` element's D9 single-sourced
// authoring example) is a permanent FALSE villain (D5): it carries `ability_type:
// Villain Action 1` alongside `usage: Main action`, and a real usage line always wins,
// so it renders — correctly — as a main-action card and cannot be "fixed" without either
// editing the D9 example (which would move its frozen `feature--steel-print` shot) or
// breaking the precedence rule the false-villain case exists to pin (task-3 review H-1).
// This harness-local literal (SC-108's pattern, `featureblockAdvancement` above) is the
// same shape MINUS `usage`, so `actionTypeOf` falls through to the real `ability_type`
// ladder and actually resolves 'villain' — the only way to golden-shot the standalone
// villain card (spine-less crest + eyebrow tint, no bar, per D3) without touching D9's
// single-sourced example. New shot names (`feature-villain--*`) cannot collide with a
// frozen name (`sha256sum -c` only checks names the baseline lists), so this fixture is
// invisible to the freeze check by construction.
const featureVillain = `type: feature
feature_type: ability
name: Rally the Line
ability_type: Villain Action 2
flavor: A booming command echoes across the battlefield.
keywords:
  - Command
distance: Aura 5
target: Each ally in the aura
effects:
  - effect: Each affected ally can shift 2 squares as a free action.
`;

// SC-107: the sheet's `.dse-hero__grid` had no dedicated fixture exercising a SPARSE
// region next to a fuller one — `default` (heroDefault, src/elements/hero/example.yaml)
// is a level-3 hero with a condition already on it, so its Conditions region is never the
// short one. This harness-local variant (same convention as featureSpend/featureVillain
// above, not an edit to the frozen D9 example) drops to a single skill and zero active
// conditions — a level-1 hero fresh out of session zero — so the Conditions region renders
// only its header + an empty-state line while Skills renders one chip: the shortest
// possible content next to another short-but-not-identical region, in the same grid row.
// Same ancestry/class/kit/ability refs as heroDefault to keep this an isolated
// skills/conditions change, nothing else. SC-156 replaced that pair of ability refs — in
// BOTH fixtures at once, so they stay identical — with the real corpus codes
// (fury.level-1 brutal-slam + thunder-roar), which the harness compendium now carries, so
// these rows render real ability cards instead of degrading.
const heroSparse = `name: Wren Larkspur
level: 1
ancestry: scc.v1:mcdm.heroes.v1/ancestry/dwarf
class:   scc.v1:mcdm.heroes.v1/class/fury
subclass: berserker
kits:    [scc.v1:mcdm.heroes.v1/kit/mountain]
characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 }
skills:  [Endurance]
abilities:
  - scc.v1:mcdm.heroes.v1/feature.ability.fury.level-1/brutal-slam
  - scc.v1:mcdm.heroes.v1/feature.ability.fury.level-1/thunder-roar
max_stamina: 48
recoveries_max: 10
resource: { type: Ferocity, min: 0 }
state:
  stamina: { current: 31, temp: 0 }
  resource: 4
  surges: 1
  recoveries: 6
  victories: 2
  conditions: []
`;

// SC-146 FIX ROUND 1, I3 (review's "right tier") — the review's own root-cause finding:
// the original commit shipped a fully green battery with a Critical defect (C1, gridc
// inverted under Steel) because NOTHING in the shot/freeze/parity/jest battery ever
// rendered a non-default statblock pref (`ls visual-harness/shots | grep -E
// 'featstyle|columns|stats|ledger|gridc'` returned nothing). These four re-use the
// default statblock's own DOM (so no new content to author or freeze-collide with) and
// add a per-block `prefs:` override map — the same reserved key
// (src/framework/prefOverrides.ts) an author can already put in a real vault note — so
// every combo the sweep already shoots (steel × dark/light + steel-print) now
// exists for each of the four surfaces this fix round touched. New filenames, so they
// are invisible to the freeze baseline by construction (sha256sum -c only checks names
// it lists) unless deliberately widened.
const statblockStatsLedger = `prefs:\n  sbStats: ledger\n${statblockDefault}`;
const statblockStatsGridc = `prefs:\n  sbStats: gridc\n${statblockDefault}`;
const statblockFeatstyleFlat = `prefs:\n  sbFeatureStyle: flat\n${statblockDefault}`;
const statblockColumnsWide = `prefs:\n  sbColumns: wide\n${statblockDefault}`;
// SC-146 ROUND 2, item 1 — the FOURTH secondary-stat cell. Scott's round-2 note asked what
// sits beside Movement in the second row of the secondary block ("movement (and something
// else?)"); the answer is `With Captain`, which the plugin renders whenever the field is
// present (statblock/view.ts renderMeta) and which NO fixture anywhere carried, so the
// 2x2-full case had never been photographed. Worth its own entry rather than a probe: the
// site cannot supply this picture at all — its statblock generator drops `with_captain`
// before render (verified across every captained minion page in v2/docs/Browse), so the
// three-cell layout is the only one the site can ever show. Same prefs-prefix convention as
// the four above; `sbStats: ledger` because that is the mode under review.
const statblockWithCaptain = `prefs:\n  sbStats: ledger\nwith_captain: Strike +2\n${statblockDefault}`;

// SC-169: the AUTHORED-collapsed form of each of the three prototype elements — the
// reserved top-level `collapsed:` key (src/framework/chrome/collapsedKey.ts), which the
// pipeline pops before schema validation and before def.parse. Prefixing the existing
// single-sourced example is deliberate: the collapsed one-line form must be derived from
// the SAME content the expanded golden shows, so a reviewer can read the two shots as a
// before/after of one block rather than of two different creatures.
const statblockCollapsed = `collapsed: true\n${statblockDefault}`;
const heroCollapsed = `collapsed: true\n${heroDefault}`;
const staminaBarCollapsed = `collapsed: true\n${staminaBarDefault}`;

// SC-169 round 2 (Scott's ruling 2 + the ds-stamina backward-compat requirement). Two
// fixtures for the two legacy spellings, on the one element that has always owned them as
// real model fields:
//   `collapse_default: true`  — the key an existing vault note already uses. It used to
//     start the old "Stamina Bar" disclosure header closed; with that header gone (ruling
//     3) it must still start the ELEMENT collapsed, now via the panel. This fixture is the
//     picture of that promise being kept.
//   `collapsible: false`      — no collapse control at all, and (with no other menu item)
//     no panel either. On this element the flag used to be dead weight; it is honoured now.
const staminaBarCollapseDefault = `collapse_default: true\n${staminaBarWinded}`;
const staminaBarNotCollapsible = `collapsible: false\n${staminaBarWinded}`;

// SC-169 ROUND 3 (the rollout) — three more authored-collapsed fixtures, one per ANCHOR
// SHAPE the rollout introduced, so the collapsed bar is photographed on each rather than
// only on the three prototype elements:
//   kit       — the nested `.dse-card` frame all eleven display families share, reached
//               through withReference/RefUnwrapView;
//   feature   — a static card whose FRAME IS ITS ROOT (the other anchor shape);
//   encounter — a large persisted GM tracker, the case where folding actually buys a reader
//               something, and the one whose summary carries computed detail (EV).
// Same single-sourcing rule as the prototype three: prefix the existing example, so the
// collapsed shot and the expanded golden are the same block.
const kitCollapsed = `collapsed: true\n${kitDefault}`;
const featureCollapsed = `collapsed: true\n${featureDefault}`;
const encounterCollapsed = `collapsed: true\n${encounterDefault}`;

// SC-154 / SC-162 — the default fixture (Frodo/Sam vs. Orcs/Troll) seeds an `image:` on
// every actor, so the plugin's real look for an IMAGELESS combatant — the surface SC-162
// exists to fix, and the surface most encounter/initiative notes actually start from
// before anyone bothers pointing `image:` at a token file — had never been photographed.
// No `image:` field anywhere here: every hero and creature falls through to
// InitiativeView.renderPortrait's fallback (shield glyph for heroes, skull for enemies).
// Samwise's name is also deliberately long — the row-rhythm defect class SC-154 audited
// (name column width vs. the portrait/stat columns either side of it) needs a name that
// actually threatens to wrap, which neither existing initiative fixture's names do.
const initiativeNoImages = `heroes:
  - name: "Frodo Baggins"
    max_stamina: 80
  - name: "Samwise Gamgee of the Fellowship of the Ring"
    max_stamina: 90
enemy_groups:
  - name: "Mordor Forces"
    creatures:
      - name: "Orc"
        max_stamina: 40
        amount: 4
      - name: "Troll"
        max_stamina: 150
        amount: 1
malice:
  value: 5
`;

// SC-154 — the MID-FIGHT tracker state: the command bar carrying real content. The
// `default` fixture is round 1 with an empty Malice log, which is the one state where a
// control cluster looks tidy no matter how bad its layout is: no log entries behind the
// disclosure, no multi-digit round. This one is round 3 with a real spend/gain history
// (the log's own `max-height: 6em` scroll is reachable) and a pool that has moved off its
// starting value — the state the bar layout was chosen on (round 3's A/B, Scott's pick
// 2026-08-20) and the state its narrow/log-open regression shots ride.
const initiativeControls = `heroes:
  - name: "Frodo Baggins"
    max_stamina: 80
    image: "images/frodo.png"
  - name: "Samwise Gamgee"
    max_stamina: 90
    image: "images/sam.png"
enemy_groups:
  - name: "Mordor Forces"
    creatures:
      - name: "Orc"
        max_stamina: 40
        amount: 4
        image: "images/orc.png"
      - name: "Troll"
        max_stamina: 150
        amount: 1
        image: "images/troll.png"
round: 3
malice:
  value: 7
  log:
    - round: 1
      amount: 3
      label: "Round gain"
    - round: 2
      amount: -5
      label: "Troll: Sweeping Club"
    - round: 3
      amount: 4
      label: "Feytouched"
`;

// SC-182 — the REALISTIC skills state the layouts are judged on. The D9 `default`
// fixture (2 skills + 1 custom) is the palette's minimal example and shows a list that
// is almost all catalog; a real hero owns ~6-10 skills spread unevenly across groups,
// which is exactly the scan ("which ones do I have?") the overhaul is for. Eight
// built-ins across four groups (crafting deliberately owns ZERO — a layout must keep
// an unowned group readable, not just skip it), one custom skill merged into a built-in
// group and one landing in the "Custom Skills" bucket, so every grouping rule renders.
// Harness-local (same convention as heroSparse/featureVillain — not an edit to the D9
// example); new shot names (`skills-hero-picks--*`) cannot collide with a frozen name.
const skillsPicksBody = `skills:
  - climb
  - endurance
  - hide
  - sneak
  - track
  - alertness
  - magic
  - history
custom_skills:
  - name: Falconry
    has_skill: true
    skill_group: exploration
    description: "Train and fly a falcon."
  - name: Sailing
    has_skill: true
    description: "Crew and pilot a ship."
`;
// SC-182 — every layout at the SAME hero-picks content, so all skills shots are one
// character. Round 3 flipped the bare-block default to `ledger` (Scott: "land it. Set
// the default to `ledger`"), so `hero-picks` now pins the CLASSIC checklist via an
// explicit `style: list` — keeping its screen bytes (and skills-narrow's) continuous
// with the rounds-1/2 "before" captures, and keeping it distinct from `ledger` (which
// is byte-identical to what a bare block renders at this content). The `-hidden` twins
// are the `only_show_selected: true` form — the state the menu panel's eye toggle flips
// to at runtime — photographed per layout because hiding changes each layout's
// silhouette differently (ledger niches shrink; chip fields reduce to the forged few).
const skillsHeroPicks = `style: list\n${skillsPicksBody}`;
const skillsLedger = `style: ledger\n${skillsPicksBody}`;
const skillsChips = `style: chips\n${skillsPicksBody}`;
const skillsLedgerHidden = `style: ledger\nonly_show_selected: true\n${skillsPicksBody}`;
const skillsChipsHidden = `style: chips\nonly_show_selected: true\n${skillsPicksBody}`;

// SC-183 — the tracker with real stamina STATES. The other three initiative fixtures
// are all full-health, which is the one state where a stamina redesign cannot be
// judged: no winded/dying frame, no temp plate, no wound, no pool damage. This one is
// the mid-fight roster the SC-183 instruments were designed against, one row per state
// the SC-132 cluster distinguishes:
//   - Frodo: winded (34/80 ≤ half) WITH temp stamina (the bolted-on cap + the base-max
//     index mark that appears when temp widens the scale);
//   - Samwise: DYING (-12/90 — the wound growing leftward from the zero bulkhead);
//   - Orcs: mixed damage across the instance grid (healthy / winded / at-death's-door),
//     so the cell minis differ per cell; Troll winded;
//   - a minion SQUAD with a wounded shared pool, one DEAD minion (the cell that keeps
//     its textual DEAD readout and mounts no gauge) and a captain.
//
// SC-183 ROUND 2 additions, each because a round-2 surface is invisible without it:
//   - `has_taken_turn` on Frodo and on the Mordor Forces group — the turn-economy
//     candidates (§11) are ENTIRELY about the difference between "has gone" and "has
//     not", so a fixture where nobody has gone photographs none of them;
//   - real `conditions` on both heroes and on the selected orc — the WINDED/DYING chip
//     now sits on the conditions row, and a chip beside an EMPTY row would not show the
//     thing under review (does the word crowd the icons?);
//   - `actions` part-spent on Frodo — the action pips' pressed state is half of what the
//     candidates are being judged on.
const initiativeFight = `heroes:
  - name: "Frodo Baggins"
    max_stamina: 80
    current_stamina: 34
    temp_stamina: 10
    image: "images/frodo.png"
    has_taken_turn: true
    conditions:
      - key: "slowed"
      - key: "frightened"
    actions:
      main: true
      maneuver: false
      move: true
      triggered: false
  - name: "Samwise Gamgee"
    max_stamina: 90
    current_stamina: -12
    image: "images/sam.png"
    conditions:
      - key: "prone"
enemy_groups:
  - name: "Mordor Forces"
    has_taken_turn: true
    creatures:
      - name: "Orc"
        max_stamina: 40
        amount: 3
        image: "images/orc.png"
        instances:
          - id: 1
            current_stamina: 36
            conditions:
              - key: "grabbed"
          - id: 2
            current_stamina: 17
          - id: 3
            current_stamina: 4
      - name: "Troll"
        max_stamina: 150
        amount: 1
        image: "images/troll.png"
        instances:
          - id: 1
            current_stamina: 70
  - name: "Goblin Squad"
    is_squad: true
    minion_stamina_pool: 9
    creatures:
      - name: "Goblin"
        max_stamina: 4
        amount: 5
        squad_role: minion
        instances:
          - id: 1
          - id: 2
            isDead: true
          - id: 3
          - id: 4
          - id: 5
      - name: "Goblin Captain"
        max_stamina: 40
        amount: 1
        squad_role: captain
        instances:
          - id: 1
            current_stamina: 18
round: 3
malice:
  value: 7
`;

// SC-183 round 3 — a FULL ROSTER, which is the only scale the turn indicator can
// honestly be judged at. Scott's stated goal for it is "to quickly and easily see who
// has taken their turn within a round at a glance"; a two-hero fixture cannot show
// whether a mark is scannable down a column, so this one is five heroes with three
// spent and two still to go, deliberately NOT alternating (2 gone, 1 to go, 1 gone,
// 1 to go) so the eye has to find the pattern rather than being handed it. Mixed
// stamina states ride along so the rebalanced row composition is visible at every
// state in one shot. Harness-local, new names — cannot collide with a frozen shot.
const initiativeRoster = `heroes:
  - name: "Frodo Baggins"
    max_stamina: 80
    current_stamina: 34
    temp_stamina: 10
    image: "portraits/1.svg"
    has_taken_turn: true
    conditions:
      - key: "slowed"
    actions:
      main: true
      maneuver: false
      move: true
      triggered: false
  - name: "Samwise Gamgee"
    max_stamina: 90
    current_stamina: -12
    image: "portraits/2.svg"
    has_taken_turn: true
    conditions:
      - key: "prone"
  - name: "Meriadoc Brandybuck"
    max_stamina: 72
    current_stamina: 72
    image: "portraits/3.svg"
  - name: "Peregrin Took"
    max_stamina: 68
    current_stamina: 51
    image: "portraits/4.svg"
    has_taken_turn: true
    actions:
      main: true
      maneuver: true
      move: false
      triggered: false
  - name: "Aragorn son of Arathorn"
    max_stamina: 120
    current_stamina: 44
    image: "portraits/5.svg"
enemy_groups:
  - name: "Mordor Forces"
    has_taken_turn: true
    creatures:
      - name: "Orc"
        max_stamina: 40
        amount: 3
        image: "portraits/6.svg"
        instances:
          - id: 1
            current_stamina: 36
          - id: 2
            current_stamina: 17
          - id: 3
            current_stamina: 4
round: 3
malice:
  value: 7
`;

// SC-183 round 3 / GH #67 — TWO MINION SQUADS IN ONE GROUP, the Delian Tomb W1 shape the
// issue is filed on ("Four flows of the river (minion squad)" twice, in group 3). Before
// this round `parse` rejected this outright (a squad group was capped at two creatures
// and one minion type), so no fixture could exist. It also carries the two creatures the
// change-captain affordance needs: a captain attached to the first squad by `captain_of`,
// and an `attached` creature — a promotable candidate with no squad of its own.
const initiativeSquads = `heroes:
  - name: "Frodo Baggins"
    max_stamina: 80
    current_stamina: 62
    image: "portraits/1.svg"
enemy_groups:
  - name: "Water Wolves"
    is_squad: true
    creatures:
      - name: "Flow of the River"
        max_stamina: 6
        amount: 4
        image: "portraits/1.svg"
        squad_role: minion
        minion_stamina_pool: 15
        instances:
          - id: 1
          - id: 2
          - id: 3
          - id: 4
      - name: "Sudden Downpour"
        max_stamina: 6
        amount: 4
        image: "portraits/2.svg"
        squad_role: minion
        minion_stamina_pool: 24
        instances:
          - id: 1
          - id: 2
          - id: 3
          - id: 4
      - name: "Essence of Change"
        max_stamina: 90
        amount: 1
        image: "portraits/6.svg"
        squad_role: captain
        captain_of: "Flow of the River"
        instances:
          - id: 1
            current_stamina: 71
      - name: "Water Wierd"
        max_stamina: 45
        amount: 1
        image: "portraits/3.svg"
        squad_role: attached
        instances:
          - id: 1
            current_stamina: 45
round: 2
malice:
  value: 4
`;

export const FIXTURES: Record<string, Record<string, string>> = {
	ancestry: { default: ancestryDefault },
	career: { default: careerDefault },
	characteristics: { default: characteristicsDefault },
	class: { default: classDefault },
	complication: { default: complicationDefault },
	condition: { default: conditionDefault },
	conditions: { default: conditionsDefault },
	counter: { default: counterDefault },
	culture: { default: cultureDefault },
	encounter: { default: encounterDefault, collapsed: encounterCollapsed },
	feature: { default: featureDefault, spend: featureSpend, villain: featureVillain, collapsed: featureCollapsed },
	featureblock: {
		default: featureblockDefault,
		advancement: featureblockAdvancement,
		stats: featureblockStats,
	},
	hero: { default: heroDefault, sparse: heroSparse, collapsed: heroCollapsed },
	'hero-tokens': { default: tokensDefault },
	'heroic-resource': { default: resourceDefault },
	// SC-128 variant note — the site ships TWO ◆ rules and this fixture covers ONE of them
	// by design, because only one of them is a standalone rule:
	//   variant 1 ORNATE (fading lines + two seed dots + haloed 9px ◆, site `.md-typeset hr`)
	//     → THIS fixture. `horizontal-rule--steel-{dark,light}.png` are its permanent shots.
	//   variant 2 PLAIN (the same 9px ◆ seated on a solid 1px line, no dots, no fade, site
	//     `.sb__head::after` + the band's border-bottom) → NOT a standalone element anywhere.
	//     It is the statblock head band's bottom edge, shipped by SC-103, and its permanent
	//     coverage is `statblock--*` (and the featureblock twin's `featureblock--*`).
	// The element takes no config (definition.ts `parse: () => undefined`), so there is no
	// second fixture to add here — a variant-2 entry would render an identical DOM.
	'horizontal-rule': { default: horizontalRuleDefault },
	initiative: {
		default: initiativeDefault,
		'no-images': initiativeNoImages,
		controls: initiativeControls,
		fight: initiativeFight,
		roster: initiativeRoster,
		squads: initiativeSquads,
	},
	kit: { default: kitDefault, collapsed: kitCollapsed },
	montage: { default: montageDefault },
	negotiation: { default: negotiationDefault, checked: negotiationChecked },
	party: { default: partyDefault },
	perk: { default: perkDefault },
	project: { default: projectDefault },
	roll: { default: rollDefault },
	rule: { default: ruleDefault },
	skills: {
		default: skillsDefault,
		'hero-picks': skillsHeroPicks,
		// SC-182: the shipped `style:` layouts (capture ids `skills-ledger--*` /
		// `skills-chips--*` stay stable with the round-1 review shots) + their
		// hidden-unowned twins.
		ledger: skillsLedger,
		chips: skillsChips,
		'ledger-hidden': skillsLedgerHidden,
		'chips-hidden': skillsChipsHidden,
	},
	'stamina-bar': {
		default: staminaBarDefault,
		recoveries: staminaBarRecoveries,
		winded: staminaBarWinded,
		dying: staminaBarDying,
		collapsed: staminaBarCollapsed,
		'collapse-default': staminaBarCollapseDefault,
		'not-collapsible': staminaBarNotCollapsible,
	},
	statblock: {
		default: statblockDefault,
		'villain-corpus': statblockVillainCorpus,
		'roleless-corpus': statblockRolelessCorpus,
		// SC-146 FIX ROUND 1, I3 — see the block comment above FIXTURES.
		'stats-ledger': statblockStatsLedger,
		'stats-gridc': statblockStatsGridc,
		'featstyle-flat': statblockFeatstyleFlat,
		'columns-wide': statblockColumnsWide,
		'with-captain': statblockWithCaptain,
		collapsed: statblockCollapsed,
	},
	surges: { default: surgesDefault },
	title: { default: titleDefault },
	treasure: { default: treasureDefault },
	'values-row': { default: valuesRowDefault },
};

export interface HarnessParams {
	element?: string;
	fixture: string;
	theme: DseThemeId;
	bg: 'dark' | 'light';
	print: boolean;
	readonly: boolean;
	gallery: boolean;
	/** SC-142 phase 2a: a gallery of just these element ids, in this order (`gallery=a,b,c`
	 *  rather than `gallery=1`). Used by the docs camera for the README's montage image —
	 *  the full 40-element gallery is 24 000 px tall, which is review evidence, not a
	 *  picture anyone puts at the top of a README. `gallery=1` is unchanged (every id), so
	 *  the F4 sweep's frozen `gallery--steel-*` shots cannot move. */
	galleryIds?: string[];
	/** SC-121 Batch 4: constrain #mount to this many CSS px (narrow-width coverage). */
	width?: number;
	/**
	 * SC-160: turn #mount into a fixed-height SCROLL CONTAINER `scroll` CSS px tall and
	 * scroll it to `scrollTo` before the shot.
	 *
	 * The sticky mini-header is the first surface in this repo whose whole behaviour is
	 * "what happens once you have scrolled", and the harness had no way to express that:
	 * the page is one long document and every capture is an element screenshot of #mount
	 * at rest. Making #mount itself the scroller is the smallest honest version — it is a
	 * REAL scroll container, so `position: sticky` resolves against it exactly as it
	 * resolves against Obsidian's preview scroller or a sidebar leaf, and the element
	 * screenshot of a fixed-height clipped box captures precisely the scrolled view. No
	 * faked state, no attribute stamped by the camera.
	 */
	scroll?: number;
	/** SC-160: how far to scroll that container before the shot (0 = the unscrolled twin). */
	scrollTo?: number;
	/** SC-123: preference values to apply BEFORE the mount (pref-variant coverage).
	 *  Wire format is the compact `key:value,key:value` of the `prefs` query param. */
	prefs?: Record<string, string>;
	/** SC-169: mount several elements in a column, NO gallery headings — the only way to
	 *  photograph the menu panel of one element overlapping the element above it. Wire
	 *  format `element:fixture,element:fixture`. */
	stack?: { element: string; fixture: string }[];
	/** SC-169: padding (CSS px) around #mount. The chrome panel is positioned ABOVE the
	 *  element's top edge, so without breathing room the `#mount` locator screenshot
	 *  clips it right off the frame. */
	pad?: number;
	/** SC-169: force the `Platform.isMobile` branch of the chrome (always-visible panel +
	 *  reserved top space) without a mobile Obsidian. */
	mobile?: boolean;
	/**
	 * SC-169 round 3: after everything has mounted, CLICK each element's collapse control.
	 *
	 * The rollout put the panel on thirty-one elements, and photographing a collapsed one
	 * used to require its own `collapsed: true` fixture — thirty-one near-duplicate fixture
	 * constants for one line of output each. This does it from the camera instead, and it
	 * does it by driving the REAL control rather than stamping `data-dse-collapsed` on the
	 * root: a shot taken this way proves the toggle works, not merely that the CSS for the
	 * attribute exists. (The authored-`collapsed:` path keeps its own fixtures — that is a
	 * different claim, about the YAML key, and it is worth its own pictures.)
	 */
	collapse?: boolean;
}

/** SC-123: `kwUsage:text,sbCharBox:on` → `{ kwUsage: 'text', sbCharBox: 'on' }`.
 *  Deliberately string-only: every pref a shot needs to vary is an `attr`-bearing
 *  enum whose values are strings, and keeping the wire format flat keeps the shot
 *  URL readable in a failure message. */
function parsePrefParam(raw: string | null): Record<string, string> | undefined {
	if (!raw) return undefined;
	const out: Record<string, string> = {};
	for (const part of raw.split(',')) {
		const at = part.indexOf(':');
		if (at <= 0) continue;
		out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

/** SC-169: `statblock:default,hero:collapsed` → [{element,fixture},…]. A bare `element`
 *  with no colon means the `default` fixture. */
function parseStackParam(raw: string | null): { element: string; fixture: string }[] | undefined {
	if (!raw) return undefined;
	const out = raw
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const at = part.indexOf(':');
			return at < 0
				? { element: part, fixture: 'default' }
				: { element: part.slice(0, at).trim(), fixture: part.slice(at + 1).trim() };
		});
	return out.length > 0 ? out : undefined;
}

/**
 * The theme ids this harness can actually RENDER. Steel is the only one the plugin
 * registers a value layer for; a snippet id (the DseThemeId union is still open, D3 §6)
 * would need its own stylesheet, which the harness never loads — it would stamp
 * data-dse-theme="<id>", match no rule, and quietly shoot the unscoped base.
 *
 * SC-144 review F1: the first cut of this coercion passed any non-empty value straight
 * through while the comment claimed it clamped, so `?theme=legacy` still produced a
 * legacy-stamped root long after the theme was removed. This file's whole job is to stop
 * the camera silently shooting the wrong look, so the clamp is real now: an unrecognised
 * (or retired) id resolves to the default rather than being honoured.
 */
const RENDERABLE_THEMES: readonly DseThemeId[] = ['steel'];

function coerceTheme(raw: string | null): DseThemeId {
	return raw !== null && RENDERABLE_THEMES.includes(raw as DseThemeId)
		? (raw as DseThemeId)
		: DEFAULT_THEME_ID;
}

export function parseParams(search: string): HarnessParams {
	const q = new URLSearchParams(search);
	const width = Number(q.get('width'));
	const scroll = Number(q.get('scroll'));
	const scrollTo = Number(q.get('scrollTo'));
	const pad = Number(q.get('pad'));
	return {
		scroll: Number.isFinite(scroll) && scroll > 0 ? scroll : undefined,
		// 0 is a MEANINGFUL value here (the unscrolled twin), so this cannot use the
		// `> 0 ? … : undefined` shape the width/scroll clamps use.
		scrollTo: Number.isFinite(scrollTo) && scrollTo >= 0 ? scrollTo : undefined,
		element: q.get('element') ?? undefined,
		fixture: q.get('fixture') ?? 'default',
		// SC-144: the `theme` param is still ACCEPTED (the camera keeps sending
		// `theme=steel`) but it can no longer select a different look — see coerceTheme.
		theme: coerceTheme(q.get('theme')),
		bg: q.get('bg') === 'light' ? 'light' : 'dark',
		print: q.get('print') === '1',
		readonly: q.get('readonly') === '1',
		gallery: (q.get('gallery') ?? '') !== '',
		// `gallery=1` keeps its exact meaning (all ids, unfiltered); anything else is a
		// comma-separated subset. Unknown ids are dropped by the FIXTURES lookup below.
		galleryIds:
			(q.get('gallery') ?? '1') === '1'
				? undefined
				: (q.get('gallery') ?? '')
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean),
		width: Number.isFinite(width) && width > 0 ? width : undefined,
		prefs: parsePrefParam(q.get('prefs')),
		stack: parseStackParam(q.get('stack')),
		pad: Number.isFinite(pad) && pad > 0 ? pad : undefined,
		mobile: q.get('mobile') === '1',
		collapse: q.get('collapse') === '1',
	};
}

/**
 * SC-121 Batch 4 (batch-3 review L-5): narrow-width captures. The harness page is a fixed
 * 900px viewport, so nothing in the sweep has ever rendered an element at the width of an
 * Obsidian SIDEBAR leaf (~300px) — where a wide markdown table or a multi-column row can
 * clip or collapse. Each entry re-shoots an existing element/fixture with #mount pinned to
 * `width`, under its own `id` so it never collides with the full-width golden. Declared on
 * the page (not in shoot.mjs) so the manifest stays the sweep's single source of truth.
 */
export const NARROW_SHOTS: { id: string; element: string; fixture: string; width: number }[] = [
	// The perk's "Familiar Statblock" is the plugin's only 5-column markdown pipe-table
	// (Batch 3 C-6 gave `table:not([class])` its baseline styling, incl. `overflow: hidden`
	// for the radius). 300px = Obsidian's default right-sidebar leaf width, the narrowest
	// place a reading-mode element realistically renders.
	{ id: 'perk-narrow', element: 'perk', fixture: 'default', width: 300 },
	// SC-132: the stamina cluster's RAIL form. The rail is not a separate design — it is
	// the standalone element's narrow form, selected by a container query on the element
	// root at 400px — so 300px (Obsidian's default right-sidebar leaf) is well inside it.
	// Without this entry the rail branch ships unshot.
	{ id: 'stamina-rail', element: 'stamina-bar', fixture: 'recoveries', width: 300 },
	// SC-132: the NARROWEST hero sheet this repo can produce. The sheet's grid gives
	// characteristics its 370px max-content and stamina the remainder, so 660px is where
	// the stamina region bottoms out at ~240px — the width the cluster's crest step-down
	// and the RECOVERIES eyebrow's stand-down were both measured against. The default
	// sweep shoots the sheet at 760px, which is the comfortable case.
	{ id: 'hero-narrow', element: 'hero', fixture: 'default', width: 660 },
	// SC-154 — encounter's 5-column roster table (Name/Role/Organization/Count/EV) had
	// NO narrow-width coverage at all before this fix: at 300px its natural content
	// width silently pushed Count/EV off the visible edge with no scroll affordance
	// (fixed: `.dse-enc__roster` now scrolls). This is the regression shot for that —
	// and for the root `padding: var(--dse-pad)` add, visible as the card content no
	// longer sitting flush against the mount edge at any width.
	{ id: 'encounter-narrow', element: 'encounter', fixture: 'default', width: 300 },
	// SC-154 — same padding regression coverage for the initiative tracker, plus (at
	// this width) the malice round-control buttons, which used to wrap their own TEXT
	// across 2-4 lines regardless of width (the `.dse-init__round`/`-reset`/`-advance`
	// fix below) — narrow is exactly where a leftover regression would be easiest to
	// miss since the sidebar-scoped override also touches this row.
	{ id: 'initiative-narrow', element: 'initiative', fixture: 'default', width: 300 },
	// SC-162 — the imageless-combatant fixture (shield/skull fallback glyphs) at the
	// width where the plugin's own narrow row-wrap (info stacks above stamina) is most
	// likely to crowd a 60px-square fallback the same way it used to crowd a real
	// portrait image.
	{ id: 'initiative-no-images-narrow', element: 'initiative', fixture: 'no-images', width: 300 },
	// SC-154 — the command bar's one-column branch (its @container query stacks the
	// grid below a 520px band), on the mid-fight `controls` fixture so the collapsed
	// log chip, the wrapped quick-add and the round buttons are all present. The
	// full-width bar is covered by the element sweep's `initiative-controls--*`.
	{ id: 'initiative-controls-narrow', element: 'initiative', fixture: 'controls', width: 300 },
	// SC-182 — the DEFAULT checklist at a sidebar leaf, on the realistic fixture: the
	// apples-to-apples "before" for the two styled narrow twins below (their full-width
	// "before" is the element sweep's own `skills-hero-picks--*`).
	{ id: 'skills-narrow', element: 'skills', fixture: 'hero-picks', width: 300 },
	// SC-182 round 2 — the two shipped `style:` layouts at the sidebar width (ids stable
	// with the round-1 review shots; the layouts became YAML fixtures when the hidden
	// review pref was deleted, so these moved from PREF_SHOTS to plain narrow entries).
	// The ledger's single-column branch and the chips' tighter wrap are both width
	// behaviours, which is exactly what this list exists to photograph.
	{ id: 'skills-ledger-narrow', element: 'skills', fixture: 'ledger', width: 300 },
	{ id: 'skills-chips-narrow', element: 'skills', fixture: 'chips', width: 300 },
	// SC-183 — the mid-fight stamina fixture at the two constrained widths the tracker
	// really renders at: 500px (a split-pane note — the width where the plate's identity
	// lane starts wrapping its action toggles) and 300px (the sidebar leaf). The
	// full-width plate is covered by the element sweep's `initiative-fight--*`.
	{ id: 'initiative-fight-500', element: 'initiative', fixture: 'fight', width: 500 },
	{ id: 'initiative-fight-narrow', element: 'initiative', fixture: 'fight', width: 300 },
	// SC-183 round 3 — the LAYOUT REBALANCE evidence (Scott: "the hero portrait is too
	// small and the stamina bar is lower than it needs to be"), at the three widths the
	// tracker really renders at. `roster` is five heroes, so the rebalanced row rhythm is
	// judged as a column and not as one card; the full-width twin is the element sweep's
	// own `initiative-roster--*`.
	{ id: 'initiative-roster-500', element: 'initiative', fixture: 'roster', width: 500 },
	{ id: 'initiative-roster-narrow', element: 'initiative', fixture: 'roster', width: 300 },
	// SC-183 round 3 / GH #67 — the two-squad group at a split-pane width, where a group
	// that now holds four creature entries (two squads + a captain + an attached
	// candidate) is most likely to crowd its roster grid.
	{ id: 'initiative-squads-500', element: 'initiative', fixture: 'squads', width: 500 },
];

/**
 * SC-117 Batch 6 (catalog consumer #16): `.dse-pr__row[aria-checked='true']` never
 * renders in the sweep — negotiation's power-roll radiogroup (powerRollPanel's ONLY
 * `selectable: true` call site, ArgumentView.buildPowerRoll) only reaches a checked
 * state on real user selection; no `selected` prop exists to express it statically in a
 * fixture. Each entry re-shoots an existing element/fixture with a REAL click on
 * `click` (the production affordance — the row's own button) performed by shoot.mjs
 * between mount-done and the screenshot, under its own `id` so it never collides with
 * the resting golden. Declared on the page (not shoot.mjs), same convention as
 * NARROW_SHOTS.
 */
export const INTERACTION_SHOTS: { id: string; element: string; fixture: string; click: string }[] =
	[
		// Selects the mid tier (12-16, data-tier="mid") — feature/statblock/featureblock/
		// kit's power-roll panels are all static (`selectable` defaults false), so
		// negotiation is the only element anywhere this state can be reached from. The
		// `button.` prefix is load-bearing: negotiation ALSO mounts a second, always-static
		// powerRollPanel (LearnMoreView's rules-text panel, a `<div>` row) with the same
		// `data-tier="mid"`, so an unscoped selector hits two elements.
		{
			id: 'negotiation-pr-checked',
			element: 'negotiation',
			fixture: 'default',
			click: "button.dse-pr__row[data-tier='mid']",
		},
		// SC-154 — the command bar's Malice-log drawer OPEN: the state that proves the
		// list drops onto its own full-width line UNDER the strip instead of displacing
		// the Malice column. Only reachable by a real toggle of the collapsible's
		// header (the kit button), same as a user's click.
		{
			id: 'initiative-log-open',
			element: 'initiative',
			fixture: 'controls',
			click: 'button.dse-init__malice-log-heading',
		},
		// SC-183 — a NON-DEFAULT creature selected: clicking Orc #3 (4/40, at death's
		// door) proves the detail row rebuild carries the stamina instrument (creature
		// coordinate model, no dying reserve), the selection ring on the clicked cell,
		// and the two staying in sync — the state the resting shot can never show
		// because the default selection is always the first instance.
		// (`data-instance-key` is only unique WITHIN a group — CB-6's own contract — so
		// the selector pins the first enemy group's entry too.)
		{
			id: 'initiative-cell-selected',
			element: 'initiative',
			fixture: 'fight',
			click: '.dse-init__group--enemies .dse-init__entry:first-of-type .dse-init__cell[data-instance-key="0-3"]',
		},
	];

/**
 * SC-123: PREFERENCE-VARIANT captures. Every presentation preference before this
 * ticket was a CSS reflow of DOM the default sweep already photographed, so the
 * sweep never needed to vary one — but a preference nobody shoots is a preference
 * nobody reviews, and three of SC-123's ports (the characteristics split, the
 * boxed letter, the villain band) change the DOM itself. Each entry re-shoots an
 * existing element/fixture with `prefs` applied to the harness PreferenceStore
 * before mount, under its own `id` so it can never collide with — or overwrite —
 * the default-value golden the freeze baseline pins. Declared on the page (not in
 * shoot.mjs), same convention as NARROW_SHOTS / INTERACTION_SHOTS.
 *
 * One entry per NON-DEFAULT value of each new preference: the default value is
 * already the whole rest of the sweep.
 */
export const PREF_SHOTS: {
	id: string;
	element: string;
	fixture: string;
	/** Optional as of the SC-183 promotion round: a shot kept alive under its own id for
	 *  review-history continuity (e.g. `initiative-mark-seal`) after its preference was
	 *  promoted to unconditional and deleted has nothing left to vary. */
	prefs?: Record<string, string>;
	/** SC-183: optional narrow-axis override, routed through snap() exactly like
	 *  NARROW_SHOTS' width — a preference whose whole point is a layout needs its
	 *  narrow branch photographed under the same pref. */
	width?: number;
}[] = [
	// Keyword display (`kwUsage`) — the chip band's other three presentations.
	{ id: 'statblock-kwusage-text', element: 'statblock', fixture: 'default', prefs: { kwUsage: 'text' } },
	{ id: 'statblock-kwusage-grid', element: 'statblock', fixture: 'default', prefs: { kwUsage: 'grid' } },
	{ id: 'statblock-kwusage-ledger', element: 'statblock', fixture: 'default', prefs: { kwUsage: 'ledger' } },
	// Distance + target (`distTarget`) — the rail's other two.
	{ id: 'statblock-disttarget-text', element: 'statblock', fixture: 'default', prefs: { distTarget: 'text' } },
	{ id: 'statblock-disttarget-ledger', element: 'statblock', fixture: 'default', prefs: { distTarget: 'ledger' } },
	// Characteristics (`sbCharLine`/`sbCharBox`) — the three split-DOM shapes. The
	// fourth combination (two + onword) is the site's own quirk: identical to two +
	// on, so shooting it would pin a duplicate picture rather than a behaviour.
	{ id: 'statblock-charline-two', element: 'statblock', fixture: 'default', prefs: { sbCharLine: 'two' } },
	{ id: 'statblock-charbox-on', element: 'statblock', fixture: 'default', prefs: { sbCharBox: 'on' } },
	{ id: 'statblock-charbox-onword', element: 'statblock', fixture: 'default', prefs: { sbCharBox: 'onword' } },
	// Villain actions (`sbVillain`) — on the CORPUS-shaped fixture, the only one whose
	// villain actions carry the shape steel-etl really emits (see the import above).
	{
		id: 'statblock-villain-banded',
		element: 'statblock',
		fixture: 'villain-corpus',
		prefs: { sbVillain: 'banded' },
	},
	// Featureblock display — the option list on the three-option angulotl example, the
	// stat line on the (new) stats-bearing fixture above.
	{
		id: 'featureblock-featstyle-flat',
		element: 'featureblock',
		fixture: 'default',
		prefs: { fbFeatureStyle: 'flat' },
	},
	{
		id: 'featureblock-stats-ledger',
		element: 'featureblock',
		fixture: 'stats',
		prefs: { fbStats: 'ledger' },
	},
	// SC-145: `authoringControls` ("Show edit button on rendered blocks") had NO harness
	// coverage before this ticket — the default sweep always renders with it off, so the
	// generic reading-mode pencil (D9 Plan 15 Task 5, pipeline.ts) was never photographed
	// at all, in either its pre-fix (outside the card) or post-fix (inside the card)
	// shape. One entry per element family the fix touches: `complication` is Scott's own
	// bad-placement screenshot on the ticket (a DisplayCardView card — the pencil used to
	// land as a stray `root` sibling below `.dse-card`); `counter` is the
	// already-correct family (root itself is the card) — a non-regression witness;
	// `statblock` is the OTHER previously-broken family this audit found (nested
	// `.dse-sb`, not called out in the ticket's screenshots but the same bug);
	// `horizontal-rule` proves the `noAuthoringButton` opt-out renders NO pencil at all.
	{ id: 'complication-edit-btn', element: 'complication', fixture: 'default', prefs: { authoringControls: 'true' } },
	{ id: 'counter-edit-btn', element: 'counter', fixture: 'default', prefs: { authoringControls: 'true' } },
	{ id: 'statblock-edit-btn', element: 'statblock', fixture: 'default', prefs: { authoringControls: 'true' } },
	{
		id: 'horizontal-rule-edit-btn',
		element: 'horizontal-rule',
		fixture: 'default',
		prefs: { authoringControls: 'true' },
	},
	// SC-183 promotion round — the portrait's turn-mark. Round 3 built four candidates
	// behind a hidden `initPortrait` review switch, judged at ROSTER scale (the whole job
	// of the indicator is an at-a-glance scan) on the five-hero `roster` fixture (3 spent,
	// 2 to go). Scott picked `seal` (2026-08-23: "Seal option looks good. I like that."):
	// the mark is unconditional now and the review switch is deleted, so this shot is a
	// plain roster capture kept under its own id for continuity with the review history.
	{ id: 'initiative-mark-seal', element: 'initiative', fixture: 'roster' },
	// SC-183 round 3 — PORTRAITS OFF over the promoted layout: the one configuration in
	// which a portrait-only turn control would disappear, so the checkbox has to come back
	// (styles-source §12c). A shot, not just a test, because "the control is gone" is
	// exactly the class of regression a human notices instantly and a selector does not.
	{ id: 'initiative-portraits-off', element: 'initiative', fixture: 'roster', prefs: { portraits: 'off' } },
];

/**
 * SC-160: SCROLL-STATE captures — the sticky mini-header.
 *
 * Every other list above photographs an element AT REST. This one exists because the
 * surface under review only exists while the reader is scrolled: `#mount` becomes a real
 * `overflow-y: auto` box `scroll` px tall, the page scrolls it to `scrollTo`, waits for
 * the reveal to settle, and the existing `#mount` element screenshot then captures
 * exactly the clipped, scrolled view. Same "own id, own manifest array" convention as
 * NARROW_SHOTS / INTERACTION_SHOTS / PREF_SHOTS, so every name is new and the freeze
 * baseline is untouched by construction.
 *
 * `scroll: 560` is the visible window; `scrollTo: 320` clears the statblock's head band
 * (~150px) with room to spare, so the bar is fully revealed and there is card body
 * beneath it to prove the bar is painting OVER content rather than sitting in flow.
 */
export const SCROLL_SHOTS: {
	id: string;
	element: string;
	fixture: string;
	scroll: number;
	scrollTo: number;
	width?: number;
	prefs?: Record<string, string>;
}[] = [
	// The default state: sticky on, secondary stats on — what a fresh install renders.
	{ id: 'statblock-sticky', element: 'statblock', fixture: 'with-captain', scroll: 560, scrollTo: 320 },
	// The same scroll position BEFORE scrolling — the "no bar until you need it" twin, and
	// the control that proves the anchor reserves no flow space (the card must lay out
	// byte-identically to the ordinary `statblock--*` capture).
	{ id: 'statblock-sticky-unscrolled', element: 'statblock', fixture: 'with-captain', scroll: 560, scrollTo: 0 },
	// The sub-toggle off: row 1 only.
	{
		id: 'statblock-sticky-nometa',
		element: 'statblock',
		fixture: 'with-captain',
		scroll: 560,
		scrollTo: 320,
		prefs: { sbStickyMeta: 'off' },
	},
	// The parent off: scrolled past the header with NO bar at all. Deliberately a separate
	// picture from the unscrolled twin — they look similar and mean different things, and
	// this is the one that would go wrong if the reveal rule lost its pref guard.
	{
		id: 'statblock-sticky-off',
		element: 'statblock',
		fixture: 'with-captain',
		scroll: 560,
		scrollTo: 320,
		prefs: { sbSticky: 'off' },
	},
	// Sidebar-leaf width (the same 300px NARROW_SHOTS uses): the container-query compact
	// treatment — no second row, no stat pills, just the truncating name + role.
	{
		id: 'statblock-sticky-narrow',
		element: 'statblock',
		fixture: 'with-captain',
		scroll: 560,
		scrollTo: 320,
		width: 300,
	},
];

/**
 * SC-169: ELEMENT-CHROME captures. The standard menu panel is hover-revealed, positioned
 * OUTSIDE the container (above its top edge), and its mobile form is chosen by
 * `Platform.isMobile` — none of which any existing capture list can express:
 *   - NARROW_SHOTS varies width, PREF_SHOTS varies preferences, INTERACTION_SHOTS fires
 *     one CLICK. A hover is not a click (clicking the collapse toggle would photograph
 *     the collapsed form, not the panel).
 *   - the panel of ONE element overlapping the element ABOVE it can only be photographed
 *     with two elements mounted in a column, which no list could ask for.
 *   - `#mount`'s screenshot is clipped to its own box, so a panel that deliberately
 *     overflows the top edge needs `pad`.
 * Each entry gets its own `id`, so every file it writes is a NEW name — invisible to the
 * freeze baseline by construction (`sha256sum -c` only checks the names it lists).
 */
export const CHROME_SHOTS: {
	id: string;
	stack: { element: string; fixture: string }[];
	/** CSS selector inside #mount that shoot.mjs hovers before the shot. */
	hover?: string;
	/** Force the mobile branch. */
	mobile?: boolean;
	/** Padding (CSS px) around #mount so the above-the-edge panel stays in frame. */
	pad?: number;
	prefs?: Record<string, string>;
}[] = [
	// (1) The panel itself, on the element with the most chrome: `authoringControls` ON,
	// so the panel carries TWO items and the right-to-left growth is visible.
	{
		id: 'chrome-hover-statblock',
		stack: [{ element: 'statblock', fixture: 'default' }],
		hover: '[data-dse-element="statblock"]',
		pad: 56,
		prefs: { authoringControls: 'true' },
	},
	// (2) The default one-item panel, on a second family (and `ds-hero` sets
	// noAuthoringButton, so this is also the "chrome does not duplicate an element's own
	// edit affordance" witness).
	{
		id: 'chrome-hover-hero',
		stack: [{ element: 'hero', fixture: 'default' }],
		hover: '[data-dse-element="hero"]',
		pad: 56,
	},
	// (2b) SC-182 — the first VIEW-contributed panel item (ElementView.chromeItems):
	// ds-skills' show/hide-unowned eye toggle, left of the collapse control. On the
	// ledger fixture so the panel is judged against the layout it will actually be used
	// with; authoringControls stays off, so the two buttons in frame are exactly the
	// toggle + collapse.
	{
		id: 'chrome-skills-menu',
		stack: [{ element: 'skills', fixture: 'ledger' }],
		hover: '[data-dse-element="skills"]',
		pad: 56,
	},
	// (3) OWNERSHIP — the shot the design decision hangs on. Two elements vertically
	// adjacent; the LOWER one is hovered, so its panel is painted on top of the upper
	// element. If the attachment styling does not read, it reads here.
	{
		id: 'chrome-stacked-hover',
		stack: [
			{ element: 'stamina-bar', fixture: 'default' },
			{ element: 'stamina-bar', fixture: 'winded' },
		],
		hover: '[data-dse-harness-index="1"] [data-dse-element]',
		pad: 24,
	},
	// (4) All three prototype elements in their authored-collapsed form, so the three
	// summary shapes (name / name / key-data) can be compared in one image.
	{
		id: 'chrome-collapsed-trio',
		stack: [
			{ element: 'hero', fixture: 'collapsed' },
			{ element: 'statblock', fixture: 'collapsed' },
			{ element: 'stamina-bar', fixture: 'collapsed' },
		],
		pad: 24,
	},
	// (5) MOBILE — panel always visible, extra top space above each element, no hover.
	{
		id: 'chrome-mobile',
		stack: [
			{ element: 'stamina-bar', fixture: 'default' },
			{ element: 'stamina-bar', fixture: 'winded' },
		],
		mobile: true,
		pad: 24,
	},
	// (6) SC-169 round 2 — PLACEMENT CONSISTENCY (Scott's first ruling). Three DIFFERENT
	// element families in one frame with every panel visible at once, which is the only way
	// a difference in the offset from the card's right edge is visible rather than
	// remembered between two shots. Mobile mode is the reveal mechanism purely because it is
	// the one that shows all three simultaneously — it changes opacity and the root's top
	// margin, never the panel's own placement rules, which are the thing under review.
	// `authoringControls` ON so the two-item and one-item panels are both represented (the
	// hero sheet opts out of the generic pencil), proving the right edge is what is pinned
	// and the panel grows leftward from it.
	// The NUMBERS behind this picture are asserted in test/dom/framework/chromePlacement.test.ts.
	{
		id: 'chrome-placement-trio',
		stack: [
			{ element: 'statblock', fixture: 'default' },
			{ element: 'hero', fixture: 'sparse' },
			{ element: 'stamina-bar', fixture: 'winded' },
		],
		mobile: true,
		pad: 24,
		prefs: { authoringControls: 'true' },
	},
	// (7) SC-169 round 2 — THE BORDER PROOF (Scott's second ruling: "the panel should not
	// cover the Element's border"). A WINDED stamina bar, whose plate draws a 1px AMBER
	// frame, hovered so the panel is up. The panel's bottom edge now stops on the frame's
	// border-box top instead of 1px inside it, so the amber line runs unbroken beneath the
	// whole panel. Tight `pad` and a single element so the top-right corner is large in
	// frame — this shot exists to be looked at closely.
	{
		id: 'chrome-border-winded',
		stack: [{ element: 'stamina-bar', fixture: 'winded' }],
		hover: '[data-dse-element="stamina-bar"]',
		pad: 40,
		prefs: { authoringControls: 'true' },
	},
	// (8) The DYING twin — a 1px RED frame. Same proof, the other state colour, because the
	// two colours have different luminance against the plate and a crop that hides in one
	// can be obvious in the other.
	{
		id: 'chrome-border-dying',
		stack: [{ element: 'stamina-bar', fixture: 'dying' }],
		hover: '[data-dse-element="stamina-bar"]',
		pad: 40,
	},
	// (9) SC-169 round 2 — the two LEGACY collapse spellings on `ds-stamina`, side by side:
	// `collapse_default: true` (top) must start collapsed through the panel now that the old
	// "Stamina Bar" header is gone, and `collapsible: false` (bottom) must render no panel
	// and no collapse at all. One frame, because the pair is the backward-compatibility
	// claim and it is only convincing together.
	{
		id: 'chrome-legacy-keys',
		stack: [
			{ element: 'stamina-bar', fixture: 'collapse-default' },
			{ element: 'stamina-bar', fixture: 'not-collapsible' },
		],
		pad: 24,
	},
	// (10) SC-169 ROUND 3 — the panel on a WAVE-1 card family. `ds-kit` stands for all eleven
	// display families: they share one view (DisplayCardView), one anchor (`.dse-card`) and
	// one chrome slot (the displayFamily factory's), so a panel that is right here is right on
	// all of them — and this is the nested-anchor-through-RefUnwrapView path, which is how
	// every reference-capable family reaches the pipeline. `authoringControls` ON so the
	// two-item panel and the relocated pencil are both in frame.
	{
		id: 'chrome-hover-card',
		stack: [{ element: 'kit', fixture: 'default' }],
		hover: '[data-dse-element="kit"]',
		pad: 56,
		prefs: { authoringControls: 'true' },
	},
	// (11) SC-169 ROUND 3 — the collapsed bar across the rollout's three anchor shapes in one
	// frame: a display card (nested `.dse-card`), a static card whose frame IS its root
	// (feature), and a large GM tracker (encounter, the case where folding earns its keep).
	// Read alongside `chrome-collapsed-trio`, which is the same picture for the prototype
	// three; together they are every summary shape — name-only, name+detail, detail-only.
	{
		id: 'chrome-collapsed-rollout',
		stack: [
			{ element: 'kit', fixture: 'collapsed' },
			{ element: 'feature', fixture: 'collapsed' },
			{ element: 'encounter', fixture: 'collapsed' },
		],
		pad: 24,
	},
	// (12) SC-189 ROUND 2 — the panel-SEATING candidates, one frame each.
	//
	// The complaint is about a seam that only exists on cards with a role-tinted header
	// band ("the menu panel feels off... almost looks 1 pixel too low" — measured as a
	// ΔL ≈ 34-37 contrast step, not a position error), so every frame stacks the two
	// headered families with a headerless one: statblock (role band), featureblock
	// (unconditional band) and feature (no band, the CONTROL that already reads seated and
	// which no candidate may disturb). `mobile: true` is the reveal mechanism for the same
	// reason `chrome-placement-trio` uses it — it is the only mode that shows all three
	// panels at once, and it changes opacity and the root's top margin, never the panel's
	// own seating rules, which are the thing under review. `authoringControls` ON so the
	// panel carries two items, as it does in the report crops.
	//
	// `chrome-seat-current` is the before-picture; the other four are the candidates.
	// Disposable ids, deleted with the losing branches when Scott picks — and new names, so
	// invisible to the freeze baseline by construction.
	...(['current', 'hush', 'crown', 'ledge', 'drop'] as const).map((seat) => ({
		id: `chrome-seat-${seat}`,
		stack: [
			{ element: 'statblock', fixture: 'default' },
			{ element: 'featureblock', fixture: 'default' },
			{ element: 'feature', fixture: 'default' },
		],
		mobile: true,
		pad: 24,
		prefs: { chromeSeat: seat, authoringControls: 'true' },
	})),
];


/* SC-183 round 3 — REAL PORTRAIT PIXELS for the round-3 review fixtures.
   Every initiative fixture before this round rendered SHIELD/SKULL fallbacks: the mock
   vault's `getResourcePath` returns `app://vault/<path>`, which no browser can load, so
   every `<img>` fired its error handler and SC-162's fallback capsule took over. That is
   fine for the layout fixtures — and it is exactly what the frozen print shots contain,
   so it must not change for them — but it makes the round-3 turn-mark candidates
   unjudgeable: three of the four act ON the picture (a seal pressed into its corner, a
   portcullis over it, a desaturation of it), and a monochrome shield glyph has nothing to
   desaturate.

   So: an inline SVG bust per hero, distinct in hue and value, served as a data: URI —
   and served ONLY for paths under `portraits/`, which no pre-round-3 fixture uses. Every
   existing fixture keeps its `images/…` paths and therefore keeps its fallback capsules,
   byte for byte. */
function harnessPortrait(hue: number): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">` +
		`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
		`<stop offset="0" stop-color="hsl(${hue},52%,44%)"/>` +
		`<stop offset="1" stop-color="hsl(${hue + 26},44%,18%)"/>` +
		`</linearGradient></defs>` +
		`<rect width="120" height="120" fill="url(#g)"/>` +
		`<circle cx="60" cy="44" r="20" fill="hsl(${hue + 14},38%,84%)"/>` +
		`<path d="M20 120c3-25 19-36 40-36s37 11 40 36z" fill="hsl(${hue + 14},38%,84%)"/>` +
		`<path d="M0 0h120v6H0z" fill="hsla(0,0%,100%,0.35)"/>` +
		`</svg>`;
	return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** `portraits/<n>.svg` → a real picture. Paths outside `portraits/` are untouched. */
export const HARNESS_PORTRAITS: Record<string, string> = {
	'portraits/1.svg': harnessPortrait(210),
	'portraits/2.svg': harnessPortrait(20),
	'portraits/3.svg': harnessPortrait(132),
	'portraits/4.svg': harnessPortrait(330),
	'portraits/5.svg': harnessPortrait(46),
	'portraits/6.svg': harnessPortrait(268),
};

/** Real service instances — the same convention as the dom tests' makeDeps(). */
export function makeHarnessDeps(): { deps: ElementPipelineDeps; theme: ThemeServiceInternal } {
	const app = new App();
	// Seed the default token image so Images.resolveImageSourceOrDefault's fallback
	// resolves for fixtures with images (e.g. initiative) — avoids CB-14 unhandled
	// rejections during render (same seeding as test/dom/elements/initiative.test.ts's
	// makeEnv()).
	app.vault.setFile(DEFAULT_SETTINGS.defaultImagePath, '');
	// SC-183 round 3 — the round-3 fixtures' real portraits (see HARNESS_PORTRAITS).
	for (const path of Object.keys(HARNESS_PORTRAITS)) app.vault.setFile(path, '');
	const realResourcePath = app.vault.getResourcePath.bind(app.vault);
	app.vault.getResourcePath = (file: { path: string }): string =>
		HARNESS_PORTRAITS[file.path] ?? realResourcePath(file as never);
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	// Mirrors main.ts's initializeElementFrameworkV2: element schemas (e.g. Skills,
	// Stamina Bar) $ref the shared component-wrapper dependency schema, which is only
	// ever registered at real plugin onload — without it, validation fails with
	// "can't resolve reference ...component-wrapper-1.0.0".
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		validation.addDependencySchema(id, schema);
	}
	const session = createSessionStore();
	return {
		deps: {
			app: app as any,
			plugin: plugin as any,
			settings: DEFAULT_SETTINGS,
			theme,
			prefs,
			refs,
			validation,
			session,
			roll: createRollService(prefs),
		},
		theme,
	};
}

/**
 * SC-149 — the harness's registry is the PUBLIC registry plus the eleven internal
 * display-family definitions. `main.ts` stopped registering `ds-kit` & co. (they are no
 * longer public code-block languages; `ds-scc` is the one public reference element), but
 * they are still the card renderers `ds-scc` mounts by resolved type, and the harness
 * photographs each of them directly through its own fixture — so the harness registers
 * them itself. Their ids and aliases are unchanged, which is what keeps every existing
 * shot name (and the FROZEN gallery's `<id> (<alias>)` headings) byte-identical.
 *
 * There is deliberately NO `scc` fixture: `ds-scc` renders nothing without a synced
 * compendium, and this harness has no `cx.compendium`, so every body it could be given
 * would produce an error card — which `mountFromParams` (correctly) counts as a failed
 * shot. `ds-scc`'s own coverage is the jsdom suite (test/dom/elements/sccElement.test.ts),
 * which has a real CompendiumIndex over the md-dse fixtures.
 */
export function registerHarnessElementDefinitions(registry: ElementRegistry): void {
	registerFrameworkElementDefinitions(registry);
	for (const el of INTERNAL_DISPLAY_ELEMENTS) registry.register(el);
}

export function makeHarnessHost(
	containerEl: HTMLElement,
	opts: { readonly: boolean; language: string },
): BlockHost {
	return {
		mode: 'reading' as RenderMode,
		// sourcePath '' mirrors the canvas quarantine → the read-only affordance shows.
		sourcePath: opts.readonly ? '' : 'Harness.md',
		containerEl,
		canPersist: !opts.readonly,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: opts.language, lineStart: 0, lineEnd: 0 }),
		replaceSource: async () => true,
		blockKey: () => `Harness.md::${opts.language}::0`,
	} as BlockHost;
}

async function mountOne(
	pipeline: ElementPipeline,
	registry: ElementRegistry,
	mount: HTMLElement,
	id: string,
	fixtureName: string,
	params: HarnessParams,
	errors: string[],
): Promise<void> {
	const def = registry.get(id);
	// Elements with a single fixture fall back to it in gallery sweeps.
	const fixtures = FIXTURES[id] ?? {};
	const source = fixtures[fixtureName] ?? fixtures['default'];
	if (!def || source === undefined) {
		errors.push(`unknown element/fixture: ${id}/${fixtureName}`);
		return;
	}
	const section = mount.createDiv({ cls: 'dse-harness-section' });
	// SC-169: a stable per-section address so a stacked capture can name WHICH element to
	// hover ("the lower one"). No CSS keys on it, so it renders nothing.
	section.setAttribute('data-dse-harness-index', String(mount.children.length - 1));
	if (params.gallery) section.createEl('h2', { text: `${id} (${def.aliases[0]})` });
	const container = section.createDiv();
	const host = makeHarnessHost(container, { readonly: params.readonly, language: def.aliases[0] });
	try {
		await pipeline.run(def, source, host);
	} catch (e) {
		errors.push(`${id}/${fixtureName}: ${String(e)}`);
	}
	if (params.print) {
		for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-dse-element]'))) {
			el.setAttribute('data-dse-print', 'on');
		}
	}
}

export async function mountFromParams(
	doc: Document,
	params: HarnessParams,
): Promise<{ errors: string[] }> {
	doc.body.classList.remove('theme-dark', 'theme-light');
	doc.body.classList.add(params.bg === 'light' ? 'theme-light' : 'theme-dark');
	// SC-169: chosen BEFORE any element mounts — the chrome reads it once, at mount time.
	// Always written (not only when true) so a direct test caller cannot inherit a
	// previous call's mobile mode.
	setChromeMobileOverride(params.mobile === true ? true : undefined);
	const registry = createElementRegistry();
	registerHarnessElementDefinitions(registry);
	const { deps, theme } = makeHarnessDeps();
	theme.setActive(params.theme);
	const errors: string[] = [];
	// SC-123: pref-variant captures. Applied BEFORE the pipeline runs, so a preference
	// that changes DOM SHAPE (the characteristics split, the villain band) is built the
	// right way on first paint rather than through a remount — the store is per-mount
	// here, so this can never leak into another shot.
	//
	// SC-145: `parsePrefParam` (above) always yields STRING values (it parses a
	// `key:value,…` query param) — every PREF_SHOTS entry before this ticket varied a
	// string-enum pref (kwUsage/distTarget/sbCharLine/…), so the raw string passed
	// straight through undetected. `authoringControls` is the first BOOLEAN pref a shot
	// varies, and the pipeline's own gate (`isAuthoringControlsOn`, framework/pipeline.ts)
	// is a strict `=== true` — the un-coerced string `'true'` would silently fail that
	// check and produce an authoringControls-OFF shot with no error, no button, and no
	// hint anything was wrong. Coerce the two literal boolean spellings; every existing
	// string-enum pref value ('text'/'grid'/'two'/…) is untouched by this.
	for (const [key, rawValue] of Object.entries(params.prefs ?? {})) {
		const value: unknown = rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue;
		try {
			await deps.prefs.set(key as never, value as never);
		} catch (e) {
			errors.push(`unknown pref: ${key}=${rawValue} (${String(e)})`);
		}
	}
	const pipeline = new ElementPipeline(deps);
	const mount = doc.getElementById('mount');
	if (!mount) return { errors: [...errors, 'no #mount element'] };
	mount.empty();
	// Narrow captures pin #mount's own box; the shot is the #mount locator, so this is
	// what makes the element lay out at sidebar width. Always reset it (the page is
	// re-navigated per shot, but mountFromParams is also called directly by tests).
	mount.style.width = params.width ? `${params.width}px` : '';
	// SC-160: the scroll-state captures. Always RESET both properties — the page is
	// re-navigated per shot, but mountFromParams is also called directly by tests, where a
	// leftover scroller would silently change what the next mount lays out in.
	mount.style.height = params.scroll ? `${params.scroll}px` : '';
	mount.style.overflowY = params.scroll ? 'auto' : '';
	// SC-169: the chrome panel overflows the element's TOP edge, and the shot is the
	// #mount locator — without padding the camera clips the very thing under review.
	mount.style.padding = params.pad ? `${params.pad}px` : '';
	const targets: { element: string; fixture: string }[] = params.stack
		? params.stack
		: params.gallery
			? (params.galleryIds ?? Object.keys(FIXTURES))
					.filter((id) => FIXTURES[id])
					.map((id) => ({ element: id, fixture: params.fixture }))
			: [{ element: params.element ?? 'feature', fixture: params.fixture }];
	for (const target of targets) {
		await mountOne(pipeline, registry, mount, target.element, target.fixture, params, errors);
	}
	// SC-169 round 3 — `collapse=1`: fold every mounted element via its own control. Done
	// AFTER the whole stack has mounted so the clicks cannot race a later element's async
	// mount, and reported as an error if an element that should have one has no control —
	// a silently-expanded element in a "collapsed forms" shot is the failure this guards.
	if (params.collapse) {
		for (const root of Array.from(mount.querySelectorAll<HTMLElement>('[data-dse-chrome]'))) {
			const toggle = root.querySelector<HTMLElement>('.dse-chrome [data-dse-chrome-item="collapse"]');
			if (!toggle) {
				errors.push(`collapse=1: ${root.getAttribute('data-dse-element')} has no collapse control`);
				continue;
			}
			toggle.click();
			if (root.getAttribute('data-dse-collapsed') !== 'on') {
				errors.push(`collapse=1: ${root.getAttribute('data-dse-element')} did not collapse`);
			}
		}
	}
	// Error cards the pipeline rendered (parse/schema/render failures) count as failures.
	for (const card of Array.from(mount.querySelectorAll('.dse-error-card'))) {
		errors.push(`error card: ${(card.textContent ?? '').slice(0, 160)}`);
	}
	if (params.scroll !== undefined) await settleScroll(mount, params.scrollTo ?? 0, errors);
	return { errors };
}

/**
 * SC-160 — scroll the mount and WAIT for the sticky state to settle before the camera
 * fires.
 *
 * IntersectionObserver delivers asynchronously, so a bare `scrollTop = n` followed by the
 * boot's two rAF ticks is a race: sometimes the bar is revealed in the shot, sometimes it
 * is not, and a golden that flickers is worse than no golden. Poll for the state the
 * scroll should have produced instead. The stuck class is written by the observer
 * regardless of the `sbSticky` preference (the pref is CSS-only), so this is the right
 * wait even for the sticky-OFF capture — which is the point: that shot proves the CSS is
 * off, not that the observer never ran.
 *
 * A scroll of 0 is the unscrolled twin and has nothing to wait for.
 */
async function settleScroll(mount: HTMLElement, scrollTo: number, errors: string[]): Promise<void> {
	mount.scrollTop = scrollTo;
	if (scrollTo === 0) return;
	const deadline = Date.now() + 2000;
	while (Date.now() < deadline) {
		if (mount.querySelector('.dse-sb__sticky--stuck')) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	// Loud, not silent: a scroll capture that never reached the stuck state would
	// otherwise photograph the resting card under a name promising the opposite.
	errors.push(`scroll capture: no .dse-sb__sticky--stuck after scrolling to ${scrollTo}px`);
}

declare global {
	interface Window {
		__dseHarnessManifest?: {
			elements: { id: string; fixtures: string[] }[];
			narrowShots: { id: string; element: string; fixture: string; width: number }[];
			interactionShots: { id: string; element: string; fixture: string; click: string }[];
			prefShots: {
				id: string;
				element: string;
				fixture: string;
				prefs?: Record<string, string>;
			}[];
			scrollShots: {
				id: string;
				element: string;
				fixture: string;
				scroll: number;
				scrollTo: number;
				width?: number;
				prefs?: Record<string, string>;
			}[];
			chromeShots: typeof CHROME_SHOTS;
		};
		__dseHarnessDone?: { errors: string[] };
	}
}

// Browser boot — inert under jest (jsdom's default document has no #mount).
if (typeof window !== 'undefined') {
	window.__dseHarnessManifest = {
		elements: Object.keys(FIXTURES).map((id) => ({ id, fixtures: Object.keys(FIXTURES[id]) })),
		narrowShots: NARROW_SHOTS,
		interactionShots: INTERACTION_SHOTS,
		prefShots: PREF_SHOTS,
		scrollShots: SCROLL_SHOTS,
		chromeShots: CHROME_SHOTS,
	};
	if (document.getElementById('mount')) {
		void mountFromParams(document, parseParams(window.location.search)).then(async (r) => {
			// Two rAF ticks so late theme re-stamps/layout settle before the camera fires.
			await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
			window.__dseHarnessDone = r;
		});
	}
}
