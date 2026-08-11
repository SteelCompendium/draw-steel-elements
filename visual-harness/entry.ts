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
// Same ancestry/class/kit/ability refs as heroDefault (already proven to resolve/degrade
// cleanly in the sweep) to keep this an isolated skills/conditions change, nothing else.
const heroSparse = `name: Wren Larkspur
level: 1
ancestry: scc.v1:mcdm.heroes.v1/ancestry/dwarf
class:   scc.v1:mcdm.heroes.v1/class/fury
subclass: berserker
kits:    [scc.v1:mcdm.heroes.v1/kit/mountain]
characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 }
skills:  [Endurance]
abilities:
  - scc.v1:mcdm.heroes.v1/.../brute-strike
  - scc.v1:mcdm.heroes.v1/.../into-the-fray
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
	featureblock: {
		default: featureblockDefault,
		advancement: featureblockAdvancement,
		stats: featureblockStats,
	},
	hero: { default: heroDefault, sparse: heroSparse },
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
	'stamina-bar': {
		default: staminaBarDefault,
		recoveries: staminaBarRecoveries,
		winded: staminaBarWinded,
		dying: staminaBarDying,
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
	/** SC-123: preference values to apply BEFORE the mount (pref-variant coverage).
	 *  Wire format is the compact `key:value,key:value` of the `prefs` query param. */
	prefs?: Record<string, string>;
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
	return {
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
	prefs: Record<string, string>;
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
	const ids = params.gallery
		? (params.galleryIds ?? Object.keys(FIXTURES)).filter((id) => FIXTURES[id])
		: [params.element ?? 'feature'];
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
			prefShots: {
				id: string;
				element: string;
				fixture: string;
				prefs: Record<string, string>;
			}[];
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
	};
	if (document.getElementById('mount')) {
		void mountFromParams(document, parseParams(window.location.search)).then(async (r) => {
			// Two rAF ticks so late theme re-stamps/layout settle before the camera fires.
			await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
			window.__dseHarnessDone = r;
		});
	}
}
