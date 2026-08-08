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
import { createThemeService } from '../src/framework/seams/theme';
import type { ThemeServiceInternal, DseThemeId } from '../src/framework/seams/theme';
import { createPreferenceStore } from '../src/framework/seams/prefs';
import { createRollService } from '../src/framework/roll/service';
import type { PrefsStorage } from '../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../src/prefs/catalog';
import { createReferenceService } from '../src/framework/seams/refs';
import { createValidationService } from '../src/framework/validation';
import { createSessionStore } from '../src/framework/session';
import { DEFAULT_SETTINGS } from '../src/model/Settings';
import { registerFrameworkElementDefinitions, FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from '../main';
import { App, Plugin } from '../test/mocks/obsidian-core';
// SC-132 candidate stage only (see src/framework/kit/staminaCandidate.ts).
import { parseStaminaCandidate, setStaminaCandidate } from '../src/framework/kit';
import type { StaminaCandidate } from '../src/framework/kit';

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
// those would change the FROZEN statblock--legacy-{dark,light}.png. Its own shots
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
// editing the D9 example (which would move its frozen `feature--legacy-*` shots) or
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
	encounter: { default: encounterDefault },
	feature: { default: featureDefault, spend: featureSpend, villain: featureVillain },
	featureblock: { default: featureblockDefault, advancement: featureblockAdvancement },
	hero: { default: heroDefault },
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
	initiative: { default: initiativeDefault },
	kit: { default: kitDefault },
	montage: { default: montageDefault },
	negotiation: { default: negotiationDefault, checked: negotiationChecked },
	party: { default: partyDefault },
	perk: { default: perkDefault },
	project: { default: projectDefault },
	roll: { default: rollDefault },
	rule: { default: ruleDefault },
	skills: { default: skillsDefault },
	'stamina-bar': { default: staminaBarDefault },
	statblock: {
		default: statblockDefault,
		'villain-corpus': statblockVillainCorpus,
		'roleless-corpus': statblockRolelessCorpus,
	},
	surges: { default: surgesDefault },
	title: { default: titleDefault },
	treasure: { default: treasureDefault },
	'values-row': { default: valuesRowDefault },
};

/* ------------------------------------------------------------------ */
/* SC-132 CANDIDATE STAGE ONLY — stamina-cluster design boards          */
/* ------------------------------------------------------------------ */
/*
   These fixtures are deliberately NOT in FIXTURES: the manifest drives the whole
   `npm run shots` sweep, so adding them there would put ~70 new PNGs into every
   run and into the freeze surface. They are reachable only through `?cand=` /
   `?board=1`, which only visual-harness/candidates.mjs ever passes.

   The five states are the cluster's honest-state matrix (SC-132): healthy,
   temp > 0, winded (at half max or below, RR §8), dying (at or below 0 — a hero
   keeps a negative "dying zone" down to -max/2, which is why the bar's coordinate
   space is [-max/2 … +max]), and read-only (canPersist false — driven by the
   existing `?readonly=1` param, not a fixture).
*/
const staminaState = (current: number, temp: number, recoveries = 5): string =>
	`max_stamina: 30\ncurrent_stamina: ${current}\ntemp_stamina: ${temp}\nrecoveries: ${recoveries}\nrecoveries_max: 8\n`;

/** Hero-sheet context: the same states inside the flagship composition. */
const heroState = (current: number, temp: number, recoveries: number): string => `name: Torin Stonefist
level: 3
subclass: berserker
characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 }
skills:  [Endurance, Intimidate, Nature]
max_stamina: 30
recoveries_max: 8
state:
  stamina: { current: ${current}, temp: ${temp} }
  recoveries: ${recoveries}
  victories: 2
`;

export const CANDIDATE_FIXTURES: Record<string, Record<string, string>> = {
	'stamina-bar': {
		healthy: staminaState(24, 0),
		temp: staminaState(24, 6),
		winded: staminaState(11, 0),
		dying: staminaState(-4, 0),
		// SC-133 geometry cases — the three ranges the Legacy overlay gets wrong.
		'temp-full': staminaState(30, 6),
		'temp-over': staminaState(8, 40),
		'temp-dying': staminaState(-4, 5),
		// SC-132 round 3 (component option strips).
		'winded-temp': staminaState(11, 6),
		'rec-none': staminaState(24, 0, 0),
		'rec-full': staminaState(24, 0, 8),
	},
	hero: {
		healthy: heroState(24, 0, 5),
		temp: heroState(24, 6, 5),
		winded: heroState(11, 0, 2),
		dying: heroState(-4, 0, 0),
	},
};

/** The board layout: one labeled row per state. */
const BOARD_ROWS: { fixture: string; caption: string }[] = [
	{ fixture: 'healthy', caption: 'Healthy — 24/30' },
	{ fixture: 'temp', caption: 'Temp Stamina — 24/30 +6' },
	{ fixture: 'winded', caption: 'Winded — 11/30 (at or below half)' },
	{ fixture: 'dying', caption: 'Dying — -4/30 (in the dying zone)' },
];

/**
 * SC-133 geometry proof, standalone board only (the hero board is already tall, and
 * these prove the GAUGE, which is identical on both surfaces). The three ranges where
 * the Legacy temp overlay is wrong: temp with no headroom left, temp larger than max,
 * and temp while dying — each one a case where the old `left: 0` overlay renders a nub
 * in the Dying hatch, overflows the track, or goes co-extensive with the fill.
 */
const BOARD_ROWS_TEMP: { fixture: string; caption: string }[] = [
	{ fixture: 'temp-full', caption: 'SC-133 · Temp at full Stamina — 30/30 +6 (no headroom under a fixed scale)' },
	{ fixture: 'temp-over', caption: 'SC-133 · Temp greater than max — 8/30 +40 (old bar overflows the track)' },
	{ fixture: 'temp-dying', caption: 'SC-133 · Temp while dying — -4/30 +5 (old bar draws temp inside the hatch)' },
];

/* ------------------------------------------------------------------ */
/* SC-132 ROUND 3 — per-COMPONENT option strips                         */
/* ------------------------------------------------------------------ */
/*
   Round 2 asked Scott to pick a LAYOUT (A/B/C/D). He deliberately declined and asked
   for the appearance of the individual COMPONENTS to be nailed first. So round 3's
   artifact is not another four whole-cluster boards: it is one strip per component
   question, each showing the SAME state(s) rendered under every option side by side,
   so the only variable in a comparison is the thing being decided.

   Mechanics, and why they stay clear of production:
     * A strip mounts the real element N times (once per option) and stamps
       `data-dse-stamina-var="<option>"` on a WRAPPER around each mount. The variant is
       per-instance rather than on <html> precisely because a strip has to show several
       variants on ONE page; the candidate attribute stays on <html> as before, so every
       round-3 CSS rule is still double-gated (`[data-dse-stamina-cand]` root attr +
       the variant attr) and still matches nothing in production.
     * Anything a strip needs that the plugin does not emit (marker labels, condition
       chips, the ledger's step) is injected HERE, by `decorateStripCell`, not by
       src/. Round 3 therefore touches zero plugin DOM: `src/` is unchanged, so jest,
       the swept shots and the freeze surface cannot move by construction.
*/
interface StripState {
	fixture: string;
	caption: string;
	readonly?: boolean;
}
interface StripOption {
	/** Stamped as `data-dse-stamina-var`; also the label's leading code (T1, R2, …). */
	id: string;
	label: string;
	note?: string;
}
interface StripDef {
	title: string;
	sub: string;
	cand: StaminaCandidate;
	element?: 'stamina-bar' | 'hero';
	/** Trims the mounted cluster down to the part under discussion (harness chrome). */
	focus?: 'gauge' | 'rec' | 'full';
	/** CSS `zoom` on each cell, for boundary-level crops. */
	zoom?: number;
	states: StripState[];
	options: StripOption[];
}

export const STRIPS: Record<string, StripDef> = {
	/* 1 — the temp-stamina edge defect Scott flagged ("the left and right edges of
	   temp stamina make no sense... some css thats not working as expected"). */
	'temp-edge': {
		title: 'Temp-stamina edges — the defect, and the fix',
		sub: 'Candidate A channel · zoomed 2× on the fill→temp boundary',
		cand: 'a',
		focus: 'gauge',
		zoom: 2,
		states: [
			{ fixture: 'temp', caption: '24/30 +6' },
			{ fixture: 'temp-over', caption: '8/30 +40' },
		],
		options: [
			{ id: 'e0', label: 'E0 — as reviewed', note: 'notch bitten out of the left edge; the separator shadow is clipped away' },
			{ id: 'e1', label: 'E1 — forged seam', note: 'a real two-tone seam at the boundary, both edges square' },
		],
	},

	/* 2 — the "separator that doesnt match any marker im familiar with": the BASE-MAX
	   index mark, which lands mid-bar once temp widens the scale. */
	'max-mark': {
		title: 'The unexplained mid-bar separator — what to do with the base-max mark',
		sub: 'Candidate A channel · the mark only exists when temp is present',
		cand: 'c',
		focus: 'gauge',
		states: [
			{ fixture: 'temp', caption: '24/30 +6 — mark lands at the temp plate’s far edge' },
			{ fixture: 'temp-over', caption: '8/30 +40 — mark lands INSIDE the temp plate' },
			{ fixture: 'winded-temp', caption: '11/30 +6 — winded, with temp' },
		],
		options: [
			{ id: 'm0 h2', label: 'M0 — as reviewed', note: 'a bare metal hairline, unexplained' },
			{ id: 'm1 h2', label: 'M1 — drop it', note: 'no mark; temp’s own material is the only boundary' },
			{ id: 'm2 h2', label: 'M2 — material tells it', note: 'the temp region is a different material, so the boundary IS the mark' },
			{ id: 'm3 h2', label: 'M3 — ◆ grammar', note: 'the same milled ◆ notch the zero bulkhead uses' },
		],
	},

	/* 3 — C's "wanting": is the underline too short, weakening the gradient? */
	'c-height': {
		title: 'Candidate C — gauge height ladder',
		sub: 'Same banner, same states; only the gauge’s depth changes',
		cand: 'c',
		states: [
			{ fixture: 'healthy', caption: 'Healthy 24/30' },
			{ fixture: 'winded', caption: 'Winded 11/30' },
			{ fixture: 'temp', caption: 'Temp 24/30 +6' },
		],
		options: [
			{ id: 'h1', label: 'H1 — hairline (as reviewed)', note: '0.30rem rule' },
			{ id: 'h2', label: 'H2 — channel', note: '0.62rem — A’s milled channel at banner scale' },
			{ id: 'h3', label: 'H3 — full channel', note: '1.05rem — A’s channel at full depth' },
		],
	},

	/* 4 — the centrepiece: make temp read as EPHEMERAL / other. */
	temp: {
		title: 'Temp stamina — five materials',
		sub: 'Appended at the end in all five; geometry (origin + scale) is identical throughout',
		cand: 'a',
		focus: 'gauge',
		states: [
			{ fixture: 'temp', caption: '24/30 +6' },
			{ fixture: 'temp-over', caption: '8/30 +40 (temp > max)' },
			{ fixture: 'temp-dying', caption: '-4/30 +5 (temp while dying)' },
		],
		options: [
			{ id: 't1 e1', label: 'T1 — solid plate', note: 'as reviewed: opaque violet, same weight as the pour' },
			{ id: 't2 e1', label: 'T2 — spectral glass', note: 'translucent; the channel’s recess reads straight through it' },
			{ id: 't3 e1', label: 'T3 — hollow vessel', note: 'outlined walls, unfilled — capacity that is not substance' },
			{ id: 't4 e1', label: 'T4 — crystalline', note: 'faceted plates, each one a shard that can shatter off' },
			{ id: 't5 e1', label: 'T5 — shimmer', note: 'T2 plus a slow travelling gleam (static frame here; honours reduce-motion)' },
		],
	},

	/* 5 — recovery markers: "they look more like some kind of HR design element than
	   an interactive checkbox-style element." */
	'rec-shape': {
		title: 'Recovery markers — shape',
		sub: 'Remaining vs. spent must survive a grayscale glance, and must read as CHECKBOXES',
		cand: 'a',
		focus: 'rec',
		states: [
			{ fixture: 'healthy', caption: '5 of 8 remaining' },
			{ fixture: 'rec-none', caption: '0 of 8 — all spent' },
			{ fixture: 'rec-full', caption: '8 of 8 — none spent' },
		],
		options: [
			{ id: 'r1', label: 'R1 — diamond (as reviewed)', note: 'the ornament read Scott rejected' },
			{ id: 'r2', label: 'R2 — square cell', note: 'the checkbox convention, forged' },
			{ id: 'r3', label: 'R3 — round pip', note: 'tally/token read' },
			{ id: 'r4', label: 'R4 — ingot', note: 'wide mini-plate: a spendable thing, not a dot' },
		],
	},

	/* 6 — "Having 8 random elements that are unlabeled doesnt help users." */
	'rec-label': {
		title: 'Recovery markers — labelling',
		sub: 'Shown on R2; the labelling choice is independent of the shape choice',
		cand: 'a',
		focus: 'rec',
		states: [{ fixture: 'healthy', caption: '5 of 8 remaining' }],
		options: [
			{ id: 'l1 r2', label: 'L1 — eyebrow + count', note: 'RECOVERIES · 5/8' },
			{ id: 'l2 r2', label: 'L2 — count only', note: '5/8' },
			{ id: 'l3 r2', label: 'L3 — unlabeled', note: 'as reviewed' },
		],
	},

	/* 7 — "Im not sure what the intention of the Catch Breath chip is." */
	'catch-breath': {
		title: 'Catch Breath — the control',
		sub: 'The markers are shown with R2 + L1 throughout; only the control changes',
		cand: 'a',
		focus: 'rec',
		states: [{ fixture: 'healthy', caption: '5 of 8 remaining' }],
		options: [
			{ id: 'cb1 r2 l1', label: 'CB1 — no chip; markers are the control', note: 'the leftmost remaining marker shown under hover' },
			{ id: 'cb2 r2 l1', label: 'CB2 — icon-only button', note: 'D’s control at full-cluster scale' },
			{ id: 'cb3 r2 l1', label: 'CB3 — labelled icon button', note: 'as reviewed' },
		],
	},

	/* 8 — "the red border in Candidate A and D, or the entire red background in
	   Candidate C are really nice looking." Standardise one vocabulary. */
	dying: {
		title: 'Dying — one vocabulary, three intensities',
		sub: 'Keep-per-context: the rail may want border-only where the sheet wants both',
		cand: 'a',
		states: [
			{ fixture: 'dying', caption: 'Dying -4/30' },
			{ fixture: 'temp-dying', caption: 'Dying -4/30 +5' },
		],
		options: [
			{ id: 'y1 r2 l1', label: 'Y1 — border only', note: 'A/D’s danger hairline' },
			{ id: 'y2 r2 l1', label: 'Y2 — ground only', note: 'C’s blood-black plate' },
			{ id: 'y3 r2 l1', label: 'Y3 — border + ground', note: 'both, at the same intensities' },
		],
	},

	/* 9 — "there have been lots of HP bar designs over the years." Two directions that
	   are not a re-skin of the four. */
	fresh: {
		title: 'Two fresh directions',
		sub: 'Full state matrix, not a sketch — these are alternatives to the bar idea itself',
		cand: 'a',
		states: [
			{ fixture: 'healthy', caption: 'Healthy 24/30' },
			{ fixture: 'winded', caption: 'Winded 11/30' },
			{ fixture: 'dying', caption: 'Dying -4/30' },
			{ fixture: 'temp', caption: 'Temp 24/30 +6' },
		],
		options: [
			{
				id: 'f1 r2 l1 e1',
				label: 'F1 — Recovery Ledger',
				note: 'the gauge is graduated in RECOVERIES: every division is one Catch Breath’s worth of stamina',
			},
			{
				id: 'f2 r2 l1 e1',
				label: 'F2 — Forge Heat',
				note: 'the bar is solid steel at all times; stamina is how much of it is still hot',
			},
		],
	},

	/* 10 — "where are conditions in this? Are conditions expected to be managed in
	   another UI?" */
	conditions: {
		title: 'Conditions — in the cluster, or left where they are?',
		sub: 'Conditions are a separate subsystem today (see the comment); this is the only question',
		cand: 'a',
		states: [
			{ fixture: 'winded', caption: 'Winded 11/30, three conditions' },
			{ fixture: 'healthy', caption: 'Healthy 24/30, three conditions' },
		],
		options: [
			{ id: 'x1 r2 l1', label: 'X1 — cluster carries a condition row', note: 'net-new: a third register under the recoveries strip' },
			{ id: 'x2 r2 l1', label: 'X2 — cluster untouched', note: 'as today: conditions stay in their own element / hero region' },
		],
	},
};

export interface HarnessParams {
	element?: string;
	fixture: string;
	theme: DseThemeId;
	bg: 'dark' | 'light';
	print: boolean;
	readonly: boolean;
	gallery: boolean;
	/** SC-121 Batch 4: constrain #mount to this many CSS px (narrow-width coverage). */
	width?: number;
	/** SC-132 candidate stage: the stamina-cluster design direction (a|b|c|d). */
	cand?: StaminaCandidate | null;
	/** SC-132 candidate stage: render the labeled state-matrix board. */
	board?: 'stamina-bar' | 'hero' | null;
	/** SC-132 round 3: render the named per-component option strip. */
	strip?: string | null;
}

export function parseParams(search: string): HarnessParams {
	const q = new URLSearchParams(search);
	const width = Number(q.get('width'));
	const board = q.get('board');
	return {
		element: q.get('element') ?? undefined,
		fixture: q.get('fixture') ?? 'default',
		theme: (q.get('theme') === 'steel' ? 'steel' : 'legacy') as DseThemeId,
		bg: q.get('bg') === 'light' ? 'light' : 'dark',
		print: q.get('print') === '1',
		readonly: q.get('readonly') === '1',
		gallery: q.get('gallery') === '1',
		width: Number.isFinite(width) && width > 0 ? width : undefined,
		cand: parseStaminaCandidate(q.get('cand')),
		board: board === 'stamina-bar' || board === 'hero' ? board : null,
		strip: q.get('strip'),
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
	];

/** Real service instances — the same convention as the dom tests' makeDeps(). */
export function makeHarnessDeps(): { deps: ElementPipelineDeps; theme: ThemeServiceInternal } {
	const app = new App();
	// Seed the default token image so Images.resolveImageSourceOrDefault's fallback
	// resolves for fixtures with images (e.g. initiative) — avoids CB-14 unhandled
	// rejections during render (same seeding as test/dom/elements/initiative.test.ts's
	// makeEnv()).
	app.vault.setFile(DEFAULT_SETTINGS.defaultImagePath, '');
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
	// SC-132: the candidate fixtures are merged in AFTER the real ones so they can
	// never shadow a swept fixture name, and they are invisible to the manifest (and
	// therefore to `npm run shots`) by construction — see CANDIDATE_FIXTURES.
	const fixtures = { ...(FIXTURES[id] ?? {}), ...(CANDIDATE_FIXTURES[id] ?? {}) };
	const source = fixtures[fixtureName] ?? fixtures['default'];
	if (!def || source === undefined) {
		errors.push(`unknown element/fixture: ${id}/${fixtureName}`);
		return;
	}
	const section = mount.createDiv({ cls: 'dse-harness-section' });
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

/**
 * SC-132 candidate stage: the labeled state-matrix board. One page holding every
 * honest state of the stamina cluster under one candidate + one colour scheme, so a
 * single screenshot is a reviewable artifact instead of a pile of loose PNGs.
 * Captions are plain harness chrome (`.dse-cand-*`), outside any element root, so
 * they carry none of the plugin's own styling.
 */
async function mountBoard(
	pipeline: ElementPipeline,
	registry: ElementRegistry,
	mount: HTMLElement,
	params: HarnessParams,
	errors: string[],
): Promise<void> {
	const element = params.board === 'hero' ? 'hero' : 'stamina-bar';
	const head = mount.createDiv({ cls: 'dse-cand-head' });
	head.createDiv({
		cls: 'dse-cand-title',
		text: `Candidate ${String(params.cand ?? '-').toUpperCase()} — ${element === 'hero' ? 'hero sheet' : 'standalone ds-stamina element'}`,
	});
	head.createDiv({ cls: 'dse-cand-sub', text: `Steel · ${params.bg} scheme` });

	const rows = element === 'hero' ? BOARD_ROWS : [...BOARD_ROWS, ...BOARD_ROWS_TEMP];
	for (const row of rows) {
		const sec = mount.createDiv({ cls: 'dse-cand-row' });
		sec.createDiv({ cls: 'dse-cand-cap', text: row.caption });
		await mountOne(pipeline, registry, sec, element, row.fixture, params, errors);
	}
	// Read-only is a HOST state, not a fixture: re-mount the healthy case with
	// canPersist false so the inert affordance is part of the same board.
	const ro = mount.createDiv({ cls: 'dse-cand-row' });
	ro.createDiv({ cls: 'dse-cand-cap', text: 'Read-only — inert (canPersist false)' });
	await mountOne(pipeline, registry, ro, element, 'healthy', { ...params, readonly: true }, errors);
}

/**
 * SC-132 round 3: everything a strip needs that the PLUGIN does not emit. Kept here,
 * in the harness, rather than in `src/`, so round 3 leaves the plugin's DOM untouched
 * and the freeze/jest surfaces cannot move.
 */
function decorateStripCell(cell: HTMLElement, optId: string): void {
	// Options COMPOSE ("cb1 r2 l1"), matching the CSS's `~=` token semantics — so this
	// has to test membership, not equality.
	const opts = new Set(optId.split(/\s+/).filter(Boolean));
	const rec = cell.querySelector<HTMLElement>('.dse-stamina-rec');
	const pips = Array.from(cell.querySelectorAll<HTMLElement>('.dse-stamina-rec__pip'));

	// -- Marker labelling (L1/L2; L3 and the shape strip simply hide it) ------------
	// The plugin has no label node today, which is exactly Scott's complaint ("8
	// random elements that are unlabeled"). Injected as harness chrome so the option
	// can be judged before anything is committed to the renderer.
	if (rec && pips.length) {
		const remaining = pips.filter((p) => p.classList.contains('dse-stamina-rec__pip--filled')).length;
		const lab = createDiv({ cls: 'dse-stamina-rec__eyebrow' });
		lab.createSpan({ cls: 'dse-stamina-rec__eyebrow-word', text: 'Recoveries' });
		lab.createSpan({ cls: 'dse-stamina-rec__eyebrow-count', text: `${remaining}/${pips.length}` });
		rec.prepend(lab);
	}

	// -- CB1: the markers ARE the control, so one of them has to be shown mid-hover
	// or the option is invisible in a still. The leftmost REMAINING marker is the one
	// a click would spend.
	if (opts.has('cb1')) {
		const firstRemaining = pips.find((p) => p.classList.contains('dse-stamina-rec__pip--filled'));
		firstRemaining?.setAttribute('data-demo', 'hover');
	}

	// -- X1: the optional condition register ---------------------------------------
	if (opts.has('x1') && rec) {
		const row = createDiv({ cls: 'dse-stamina__conds' });
		for (const [name, dur] of [
			['Slowed', ''],
			['Bleeding', 'save ends'],
			['Weakened', 'EoT'],
		] as [string, string][]) {
			const chip = row.createSpan({ cls: 'dse-stamina__cond' });
			chip.createSpan({ cls: 'dse-stamina__cond-name', text: name });
			if (dur) chip.createSpan({ cls: 'dse-stamina__cond-dur', text: dur });
		}
		rec.insertAdjacentElement('afterend', row);
	}

	// -- F1: the ledger's division width -------------------------------------------
	// Derived from the numbers the PANEL already computed (`--dse-zone`, `--dse-max-x`),
	// not from a re-implementation of its geometry: `--dse-max-x - --dse-zone` is
	// exactly `max` stamina wide, so one recovery is that span × recoveryValue/max.
	// Re-expressed as a fraction of the LIVE region, because the gradient that paints
	// the divisions is boxed to the live region and % there resolves against ITS width.
	if (opts.has('f1')) {
		const root = cell.querySelector<HTMLElement>('.dse-stamina__cand');
		const maxTxt = cell.querySelector('.dse-stamina__cmax')?.textContent ?? '';
		const max = Number(maxTxt);
		const num = (name: string): number => Number.parseFloat(root?.style.getPropertyValue(name) ?? '');
		const zone = num('--dse-zone');
		const maxX = num('--dse-max-x');
		if (root && Number.isFinite(max) && max > 0 && Number.isFinite(zone) && Number.isFinite(maxX)) {
			// RR §8 / StaminaBar.recoveryValue: a recovery restores floor(max / 3).
			const recoveryValue = Math.floor(max / 3);
			const live = 100 - zone;
			if (live > 0 && recoveryValue > 0) {
				const step = ((maxX - zone) / live) * 100 * (recoveryValue / max);
				root.style.setProperty('--dse-recstep', `${step}%`);
			}
		}
	}
}

/**
 * SC-132 round 3: one component question per page. Rows are OPTIONS, columns are
 * STATES — so reading across a row shows one option surviving every state, and reading
 * down a column shows the options differing with everything else held fixed.
 */
async function mountStrip(
	pipeline: ElementPipeline,
	registry: ElementRegistry,
	mount: HTMLElement,
	def: StripDef,
	params: HarnessParams,
	errors: string[],
): Promise<void> {
	const element = def.element ?? 'stamina-bar';
	const head = mount.createDiv({ cls: 'dse-cand-head' });
	head.createDiv({ cls: 'dse-cand-title', text: def.title });
	head.createDiv({ cls: 'dse-cand-sub', text: `${def.sub} · Steel · ${params.bg} scheme` });

	const grid = mount.createDiv({ cls: 'dse-cand-strip' });
	if (params.strip) grid.setAttribute('data-strip', params.strip);
	if (def.focus) grid.setAttribute('data-focus', def.focus);
	grid.style.setProperty('--cols', String(def.states.length));

	// Column headers, once at the top — the state is constant down a column.
	grid.createDiv({ cls: 'dse-cand-optlab dse-cand-optlab--corner' });
	for (const st of def.states) grid.createDiv({ cls: 'dse-cand-colcap', text: st.caption });

	for (const opt of def.options) {
		const lab = grid.createDiv({ cls: 'dse-cand-optlab' });
		lab.createDiv({ cls: 'dse-cand-optlab-name', text: opt.label });
		if (opt.note) lab.createDiv({ cls: 'dse-cand-optlab-note', text: opt.note });
		for (const st of def.states) {
			const cell = grid.createDiv({ cls: 'dse-cand-cell' });
			cell.setAttribute('data-dse-stamina-var', opt.id);
			if (def.zoom) cell.style.zoom = String(def.zoom);
			await mountOne(pipeline, registry, cell, element, st.fixture, { ...params, readonly: st.readonly ?? false }, errors);
			decorateStripCell(cell, opt.id);
		}
	}
}

export async function mountFromParams(
	doc: Document,
	params: HarnessParams,
): Promise<{ errors: string[] }> {
	doc.body.classList.remove('theme-dark', 'theme-light');
	doc.body.classList.add(params.bg === 'light' ? 'theme-light' : 'theme-dark');
	// SC-132: both halves of the candidate switch come from the SAME param — the
	// module flag the kit's DOM builder reads, and the root attribute every candidate
	// CSS rule is prefixed with. Cleared explicitly so a re-navigation to a
	// candidate-less URL cannot leave a stale attribute behind.
	setStaminaCandidate(params.cand ?? null);
	if (params.cand) doc.documentElement.setAttribute('data-dse-stamina-cand', params.cand);
	else doc.documentElement.removeAttribute('data-dse-stamina-cand');
	const registry = createElementRegistry();
	registerFrameworkElementDefinitions(registry);
	const { deps, theme } = makeHarnessDeps();
	theme.setActive(params.theme);
	const pipeline = new ElementPipeline(deps);
	const mount = doc.getElementById('mount');
	const errors: string[] = [];
	if (!mount) return { errors: ['no #mount element'] };
	mount.empty();
	if (params.strip) {
		const def = STRIPS[params.strip];
		if (!def) return { errors: [`unknown strip: ${params.strip}`] };
		// The strip's own candidate wins over any `?cand=` — a strip is defined against
		// one base treatment, and mismatching the two would compare nothing.
		setStaminaCandidate(def.cand);
		doc.documentElement.setAttribute('data-dse-stamina-cand', def.cand);
		mount.style.width = '';
		await mountStrip(pipeline, registry, mount, def, params, errors);
		for (const card of Array.from(mount.querySelectorAll('.dse-error-card'))) {
			errors.push(`error card: ${(card.textContent ?? '').slice(0, 160)}`);
		}
		return { errors };
	}
	if (params.board) {
		mount.style.width = '';
		await mountBoard(pipeline, registry, mount, params, errors);
		for (const card of Array.from(mount.querySelectorAll('.dse-error-card'))) {
			errors.push(`error card: ${(card.textContent ?? '').slice(0, 160)}`);
		}
		return { errors };
	}
	// Narrow captures pin #mount's own box; the shot is the #mount locator, so this is
	// what makes the element lay out at sidebar width. Always reset it (the page is
	// re-navigated per shot, but mountFromParams is also called directly by tests).
	mount.style.width = params.width ? `${params.width}px` : '';
	const ids = params.gallery ? Object.keys(FIXTURES) : [params.element ?? 'feature'];
	for (const id of ids) {
		await mountOne(pipeline, registry, mount, id, params.fixture, params, errors);
	}
	// Error cards the pipeline rendered (parse/schema/render failures) count as failures.
	for (const card of Array.from(mount.querySelectorAll('.dse-error-card'))) {
		errors.push(`error card: ${(card.textContent ?? '').slice(0, 160)}`);
	}
	return { errors };
}

declare global {
	interface Window {
		__dseHarnessManifest?: {
			elements: { id: string; fixtures: string[] }[];
			narrowShots: { id: string; element: string; fixture: string; width: number }[];
			interactionShots: { id: string; element: string; fixture: string; click: string }[];
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
	};
	if (document.getElementById('mount')) {
		void mountFromParams(document, parseParams(window.location.search)).then(async (r) => {
			// Two rAF ticks so late theme re-stamps/layout settle before the camera fires.
			await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
			window.__dseHarnessDone = r;
		});
	}
}
