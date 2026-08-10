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
	/** SC-121 Batch 4: constrain #mount to this many CSS px (narrow-width coverage). */
	width?: number;
}

export function parseParams(search: string): HarnessParams {
	const q = new URLSearchParams(search);
	const width = Number(q.get('width'));
	return {
		element: q.get('element') ?? undefined,
		fixture: q.get('fixture') ?? 'default',
		theme: (q.get('theme') === 'steel' ? 'steel' : 'legacy') as DseThemeId,
		bg: q.get('bg') === 'light' ? 'light' : 'dark',
		print: q.get('print') === '1',
		readonly: q.get('readonly') === '1',
		gallery: q.get('gallery') === '1',
		width: Number.isFinite(width) && width > 0 ? width : undefined,
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
	// root at 340px — so 300px (Obsidian's default right-sidebar leaf) is the width that
	// actually renders it. Without this entry the rail branch ships unshot.
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
	registerFrameworkElementDefinitions(registry);
	const { deps, theme } = makeHarnessDeps();
	theme.setActive(params.theme);
	const pipeline = new ElementPipeline(deps);
	const mount = doc.getElementById('mount');
	const errors: string[] = [];
	if (!mount) return { errors: ['no #mount element'] };
	mount.empty();
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
