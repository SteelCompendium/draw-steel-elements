// test/dom/elements/displayFamily.test.ts — D6 Task 6 (spec §2): displayFamily() + its
// first three instances (ds-kit/ds-condition/ds-treasure). Two claims under test:
//   1. Inline: the block body IS the model's YAML (example.yaml's own text) -> the
//      pure-model DisplayCardView path (title/badges/rows/body), driven through the REAL
//      ElementPipeline (same convention as horizontal-rule.test.ts's makeDeps()).
//   2. By-SCC: a whole-block reference (bare slug + full `scc.v1:` code) resolves against
//      a fake vault seeded with the REAL md-dse fixtures (_refHarness.ts, Task 4's
//      convention) -> hybrid mode (RefUnwrapView threads a RefSource in), no error card.
//      Body rendering itself is a deliberate no-op in hybrid mode until Task 9
//      (CardLayout.ts's TODO) — this only asserts title + no error card, not body content.
//   Bare-slug scoping: `ds-kit` given `bleeding` (a condition, not a kit) error-cards.
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { createThemeService } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import { createRollService } from '@/framework/roll/service';
import type { PrefsStorage } from '@/framework/seams/prefs';
import { createReferenceService } from '@/framework/seams/refs';
import { createValidationService } from '@/framework/validation';
import { createSessionStore } from '@/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import {
	kitElement,
	conditionElement,
	treasureElement,
	ancestryElement,
	cultureElement,
	careerElement,
	classElement,
	titleElement,
	perkElement,
	complicationElement,
} from '@/elements/display';
import kitExample from '@/elements/display/kit/example.yaml';
import conditionExample from '@/elements/display/condition/example.yaml';
import treasureExample from '@/elements/display/treasure/example.yaml';
import ancestryExample from '@/elements/display/ancestry/example.yaml';
import cultureExample from '@/elements/display/culture/example.yaml';
import careerExample from '@/elements/display/career/example.yaml';
import classExample from '@/elements/display/class/example.yaml';
import titleExample from '@/elements/display/title/example.yaml';
import perkExample from '@/elements/display/perk/example.yaml';
import complicationExample from '@/elements/display/complication/example.yaml';
import type { ElementDefinition } from '@/framework/registry';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';
import { MarkdownRenderer } from '../../mocks/obsidian';

const KIT_CODE = 'mcdm.heroes.v1/kit/panther';
const KIT_REL = 'kit/panther.md';
const CONDITION_CODE = 'mcdm.heroes.v1/condition/bleeding';
const CONDITION_REL = 'condition/bleeding.md';
const TREASURE_CODE = 'mcdm.heroes.v1/treasure.leveled.weapon/executioners-blade';
const TREASURE_REL = 'treasure/leveled/weapon/executioners-blade.md';

/** Real service instances, same convention as horizontal-rule.test.ts's makeDeps() — no
 *  compendium/sccAnchors: the inline-mode tests never resolve a reference. */
function makeInlineDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
		roll: createRollService(prefs),
	};
}

function inlineHost(language: string): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => `Note.md::${language}::0`,
	};
}

describe('D6 Task 6: displayFamily inline rendering', () => {
	test('ds-kit: inline example.yaml renders title/subtitle/badges/rows/body', async () => {
		const host = inlineHost('ds-kit');
		await new ElementPipeline(makeInlineDeps()).run(kitElement, kitExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Panther');

		const rowLabels = Array.from(root.querySelectorAll('.dse-card__row-label')).map((el) => el.textContent);
		expect(rowLabels).toContain('Stamina');
		expect(rowLabels).toContain('Equipment');
		const staminaRow = Array.from(root.querySelectorAll('.dse-card__row')).find(
			(el) => el.querySelector('.dse-card__row-label')!.textContent === 'Stamina',
		)!;
		expect(staminaRow.querySelector('.dse-card__row-value')!.textContent).toContain('+6 per');

		// Inline body: no more YAML-fence body — the signature ability instead renders
		// as a REAL feature card (Task 6 review Finding 4) through the shared
		// renderFeature grammar (src/elements/feature/renderFeature.ts), the same
		// mechanism featureblock/view.ts uses. Assert the feature card structure
		// exists (title node) and that no raw YAML dump (`feature_type:`) leaks
		// anywhere in the rendered output.
		expect(root.querySelector('.dse-card__body')).toBeNull();
		const featureCard = root.querySelector('.dse-feature')!;
		expect(featureCard).not.toBeNull();
		expect(featureCard.querySelector('.dse-head__primary--left')!.textContent).toBe('Devastating Rush');
		expect(root.textContent).not.toContain('feature_type:');
		expect(root.textContent).not.toContain('```ds-feature');
	});

	test('ds-kit: Stamina (and other *_bonus rows) render their inline SCC link through renderMarkdown', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		const host = inlineHost('ds-kit');
		await new ElementPipeline(makeInlineDeps()).run(kitElement, kitExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const staminaRow = Array.from(root.querySelectorAll('.dse-card__row')).find(
			(el) => el.querySelector('.dse-card__row-label')!.textContent === 'Stamina',
		)!;
		const staminaValueText = staminaRow.querySelector('.dse-card__row-value')!.textContent;
		// The raw markdown source string for stamina_bonus, verbatim from example.yaml.
		const staminaMarkdown = '+6 per [echelon](scc.v1:mcdm.heroes.v1/rule.general/echelon)';
		expect(staminaValueText).toBe(staminaMarkdown);
		// The dispatch recorder proves it went through renderMarkdown (markdown: true),
		// not the plain-text valEl.setText() path — the two are indistinguishable by
		// DOM text alone under the jest mock (F3 §4.2), so the recorder is the only
		// reliable signal that the fix actually flipped the row's markdown flag.
		expect(renderSpy.mock.calls.some((c) => c[1] === staminaMarkdown)).toBe(true);
	});

	test('ds-condition: inline example.yaml renders title/badge/body', async () => {
		const host = inlineHost('ds-condition');
		await new ElementPipeline(makeInlineDeps()).run(conditionElement, conditionExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Bleeding');
		expect(root.querySelector('.dse-card__badge--type')!.textContent).toBe('Condition');
		expect(root.querySelector('.dse-card__body')!.textContent).toContain('lose');
	});

	test('ds-treasure: inline example.yaml renders title/badges/rows/body', async () => {
		const host = inlineHost('ds-treasure');
		await new ElementPipeline(makeInlineDeps()).run(treasureElement, treasureExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		// Task 6 review Finding 5: example.yaml is now a REAL 1st-echelon trinket
		// (data-unified/en/unified/yaml/treasure/1st-echelon/trinket/color-cloak-blue.yaml)
		// instead of the leveled weapon, so the echelon badge and Effect row — both
		// previously uncovered by any fixture — get real assertions.
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Color Cloak (Blue)');
		const badgeTexts = Array.from(root.querySelectorAll('.dse-card__badge')).map((el) => el.textContent);
		expect(badgeTexts).toEqual(expect.arrayContaining(['Echelon 1', 'Magic', 'Neck']));
		expect(root.querySelector('.dse-card__badge--echelon')!.textContent).toBe('Echelon 1');

		const projectRow = Array.from(root.querySelectorAll('.dse-card__row')).find(
			(el) => el.querySelector('.dse-card__row-label')!.textContent === 'Project',
		)!;
		expect(projectRow.querySelector('.dse-card__row-value')!.textContent).toContain('150');

		// D6 Task 7 review fix (Finding 2): the Effect row's value re-states verbatim as a
		// labeled sentence in `content` (`m.effect` === the "**Effect:**" line's text once
		// normalized) — the duplication guard suppresses the row so the effect prose renders
		// exactly once, via body. `Project`'s row value is a `·`-joined synthesis of three
		// separate fields (Source/Roll Characteristic/Goal) that never appears in that exact
		// joined form in `content`, so it isn't (and shouldn't be) suppressed — see the
		// dedicated duplication-guard describe block below for the exact-once assertion.
		const rowLabels = Array.from(root.querySelectorAll('.dse-card__row-label')).map((el) => el.textContent);
		expect(rowLabels).not.toContain('Effect');

		expect(root.querySelector('.dse-card__body')!.textContent).toContain('Anjali sigil');
		expect(root.querySelector('.dse-card__body')!.textContent).toContain('cold immunity');
	});
});

// D6 Task 7 (spec §2): the remaining seven displayFamily() instances. Recon against every
// real yaml in data-unified (not just the picked fixture) found several `rows` fields the
// brief's draft layout left plain even though the corpus links them (Career.skills/perk,
// Class.skills/*_potency, Title.prerequisite — same Task 6 Finding 2 pattern); each of
// those gets a renderSpy assertion here, mirroring ds-kit's Stamina test above. It also
// found several spec fields that are NEVER populated anywhere in the current corpus
// (Culture's entire row set, Ancestry.{ancestry_points,purchased_traits}, Perk.{perk_group,
// prerequisites}) — ds-culture's test asserts that omission directly (no `.dse-card__rows`
// at all) so a future data-driven regression is caught instead of silently "still passing."
describe('D6 Task 7: displayFamily inline rendering (remaining seven)', () => {
	test('ds-ancestry: inline example.yaml renders title/signature-trait row/body, omits ungrounded rows', async () => {
		const host = inlineHost('ds-ancestry');
		await new ElementPipeline(makeInlineDeps()).run(ancestryElement, ancestryExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Human');

		const rowLabels = Array.from(root.querySelectorAll('.dse-card__row-label')).map((el) => el.textContent);
		expect(rowLabels).toEqual(['Signature trait']);
		const traitRow = root.querySelector('.dse-card__row-value')!;
		expect(traitRow.textContent).toBe('Detect the Supernatural');
		// human.yaml has no signature_trait_description/ancestry_points/purchased_traits
		// (0/12 ancestries in the corpus populate them today) — those rows are correctly
		// omitted rather than rendering "undefined".
		expect(rowLabels).not.toContain('Ancestry points');
		expect(rowLabels).not.toContain('Purchased traits');

		expect(root.querySelector('.dse-card__body')!.textContent).toContain('On Humans');
	});

	test('ds-culture: inline example.yaml renders title/body with NO rows (every Culture row field is unpopulated corpus-wide) and NO separate flavor slot (D6 Task 7 review fix: flavor duplicates content\'s lead paragraph)', async () => {
		const host = inlineHost('ds-culture');
		await new ElementPipeline(makeInlineDeps()).run(cultureElement, cultureExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Urban');
		expect(root.querySelector('.dse-card__rows')).toBeNull();
		// D6 Task 7 review fix (Finding 1): `flavor` === (a markdown-free copy of) content's
		// lead paragraph in the real corpus — the duplication guard suppresses the redundant
		// `.dse-card__flavor` slot so the prose renders exactly once, via body. See the
		// dedicated duplication-guard describe block below for the exact-once assertion.
		expect(root.querySelector('.dse-card__flavor')).toBeNull();
		expect(root.querySelector('.dse-card__body')!.textContent).toContain('centered in a city');
		expect(root.querySelector('.dse-card__body')!.textContent).toContain('Skill Options');
	});

	test('ds-career: inline example.yaml renders title/badges; Skills and Perk rows are suppressed (D6 Task 7 review fix: both duplicate content verbatim) and their markdown renders once, via body', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		const host = inlineHost('ds-career');
		await new ElementPipeline(makeInlineDeps()).run(careerElement, careerExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Politician');
		const badgeTexts = Array.from(root.querySelectorAll('.dse-card__badge')).map((el) => el.textContent);
		expect(badgeTexts).toEqual(expect.arrayContaining(['Renown +1', 'Wealth +1']));

		// D6 Task 7 review fix (Finding 1): `m.skills`/`m.perk` re-state verbatim as labeled
		// sentences in `content` — the duplication guard suppresses both rows so the prose
		// (with its inline SCC links) renders exactly once, via body, instead of once as a
		// row AND again in body. See the dedicated duplication-guard describe block below
		// for the exact-once assertion.
		const rowLabels = Array.from(root.querySelectorAll('.dse-card__row-label')).map((el) => el.textContent);
		expect(rowLabels).not.toContain('Skills');
		expect(rowLabels).not.toContain('Perk');
		expect(renderSpy.mock.calls.some((c) => typeof c[1] === 'string' && c[1].includes('[Lead](scc.v1:'))).toBe(
			true,
		);
		expect(
			renderSpy.mock.calls.some((c) => typeof c[1] === 'string' && c[1].includes('[Engrossing Monologue](scc.v1:')),
		).toBe(true);

		// inciting_incidents is never populated in the real corpus (embedded in `content`
		// prose instead) — the row is correctly absent, not rendering "undefined".
		expect(rowLabels).not.toContain('Inciting incidents');
	});

	test('ds-class: inline example.yaml renders title/badges/rows; Potencies and Skills rows render their inline SCC links through renderMarkdown', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		const host = inlineHost('ds-class');
		await new ElementPipeline(makeInlineDeps()).run(classElement, classExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Tactician');
		const badgeTexts = Array.from(root.querySelectorAll('.dse-card__badge')).map((el) => el.textContent);
		expect(badgeTexts).toEqual(expect.arrayContaining(['Might', 'Reason']));

		const rowByLabel = (label: string) =>
			Array.from(root.querySelectorAll('.dse-card__row')).find(
				(el) => el.querySelector('.dse-card__row-label')!.textContent === label,
			)!;
		expect(rowByLabel('Starting stamina').querySelector('.dse-card__row-value')!.textContent).toBe('21');
		expect(rowByLabel('Stamina / level').querySelector('.dse-card__row-value')!.textContent).toBe('9');
		expect(rowByLabel('Recoveries').querySelector('.dse-card__row-value')!.textContent).toBe('10');
		const potenciesMarkdown =
			'[Reason](scc.v1:mcdm.heroes.v1/rule.character/reason) − 2 / [Reason](scc.v1:mcdm.heroes.v1/rule.character/reason) − 1 / [Reason](scc.v1:mcdm.heroes.v1/rule.character/reason)';
		expect(rowByLabel('Potencies').querySelector('.dse-card__row-value')!.textContent).toBe(potenciesMarkdown);
		expect(renderSpy.mock.calls.some((c) => c[1] === potenciesMarkdown)).toBe(true);
		expect(renderSpy.mock.calls.some((c) => typeof c[1] === 'string' && c[1].includes('[Lead](scc.v1:'))).toBe(
			true,
		);
	});

	test('ds-title: inline example.yaml renders title/echelon badge; Prerequisite, Effect, and flavor are suppressed (D6 Task 7 review fix: all three duplicate content verbatim), Prerequisite renders once, via body', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		const host = inlineHost('ds-title');
		await new ElementPipeline(makeInlineDeps()).run(titleElement, titleExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Back From the Grave');
		expect(root.querySelector('.dse-card__badge--echelon')!.textContent).toBe('Echelon 3');

		// D6 Task 7 review fix (Finding 1): `flavor` and `m.prerequisite`/`m.effect` all
		// re-state verbatim in `content` — the duplication guard suppresses the flavor slot
		// and both rows so the prose (with its inline SCC links) renders exactly once, via
		// body. See the dedicated duplication-guard describe block below for the exact-once
		// assertion.
		expect(root.querySelector('.dse-card__flavor')).toBeNull();
		const rowLabels = Array.from(root.querySelectorAll('.dse-card__row-label')).map((el) => el.textContent);
		expect(rowLabels).not.toContain('Prerequisite');
		expect(rowLabels).not.toContain('Effect');
		// benefits[] is never populated in the real corpus (0/66 titles) — correctly absent.
		expect(rowLabels).not.toContain('Benefits');

		const prereqMarkdown = "You die at the hands of your greatest foe, that foe still lives, and you aren't a [revenant](scc.v1:mcdm.heroes.v1/ancestry/revenant).";
		expect(renderSpy.mock.calls.some((c) => typeof c[1] === 'string' && c[1].includes(prereqMarkdown))).toBe(true);
		expect(root.querySelector('.dse-card__body')!.textContent).toContain('restored to life');
	});

	test('ds-perk: inline example.yaml renders title/body, no flavor slot (D6 Task 7 review fix: flavor duplicates content) and no Prerequisites row (unpopulated)', async () => {
		const host = inlineHost('ds-perk');
		await new ElementPipeline(makeInlineDeps()).run(perkElement, perkExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Familiar');
		expect(root.querySelector('.dse-card__rows')).toBeNull();
		expect(root.querySelector('.dse-card__flavor')).toBeNull();
		expect(root.querySelector('.dse-card__body')!.textContent).toContain('Familiar Statblock');
	});

	test('ds-complication: inline example.yaml renders title; Benefit and Drawback rows are suppressed (D6 Task 7 review fix: both duplicate content verbatim) and render once, via body', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		const host = inlineHost('ds-complication');
		await new ElementPipeline(makeInlineDeps()).run(complicationElement, complicationExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Chosen One');

		// D6 Task 7 review fix (Finding 1): `flavor`, `m.benefit`, and `m.drawback` all
		// re-state verbatim in `content` — the duplication guard suppresses the flavor slot
		// and both rows so the prose (with its inline SCC links) renders exactly once, via
		// body. See the dedicated duplication-guard describe block below for the exact-once
		// assertion.
		expect(root.querySelector('.dse-card__flavor')).toBeNull();
		expect(root.querySelector('.dse-card__rows')).toBeNull();

		const benefitMarkdown =
			"You have 3 destiny points. Whenever you spend your [Heroic Resource](scc.v1:mcdm.heroes.v1/rule.resource/heroic-resource) for your class, you can spend 1 or more destiny points instead. Each time you earn a [Victory](scc.v1:mcdm.heroes.v1/rule.resource/victories), you regain 1 destiny point.";
		expect(renderSpy.mock.calls.some((c) => typeof c[1] === 'string' && c[1].includes(benefitMarkdown))).toBe(true);
		expect(root.querySelector('.dse-card__body')!.textContent).toContain('psychic damage');
	});
});

// D6 Task 7 review fix (Finding 1/2): the direct regression coverage the review asked for —
// for each affected type, assert the previously-duplicated text (flavor's lead paragraph,
// and — where applicable — a duplicated row's value) appears EXACTLY ONCE in the whole
// rendered card, not zero (over-suppressed) and not two-plus (the original bug). Comparison
// normalizes whitespace AND markdown (link syntax stripped to link text, emphasis markers
// stripped) — mirroring CardLayout.ts's own `normalizeForDuplicateCheck` — because the DOM
// text content is the RAW markdown string (the jest MarkdownRenderer mock appends markdown
// verbatim as a text node, per F3 §4.2), so a duplicated sentence can appear once as plain
// text (a row/flavor field) and once wrapped in `[text](url)` link syntax (inside `content`).
describe('D6 Task 7 review fix: previously-duplicated flavor/row text appears exactly once per card', () => {
	function normalizeForCount(s: string): string {
		return s
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/[*_`]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.toLowerCase();
	}

	function countOccurrences(haystack: string, needle: string): number {
		const h = normalizeForCount(haystack);
		const n = normalizeForCount(needle);
		if (!n) return 0;
		let count = 0;
		let from = 0;
		for (;;) {
			const at = h.indexOf(n, from);
			if (at === -1) break;
			count++;
			from = at + n.length;
		}
		return count;
	}

	// Task 11 carry-forward (Task 7 re-review nit): ancestry was covered by the earlier
	// inline-rendering describe block above (title/rows/body) but never got its own
	// exact-once pin, even though its flavor is the SAME "content's lead paragraph"
	// duplication shape as class/culture/perk/etc below (human.yaml's `flavor` is a
	// markdown-free copy of `content`'s opening paragraph).
	test('ds-ancestry: the flavor/opening paragraph appears exactly once (Finding 1)', async () => {
		const host = inlineHost('ds-ancestry');
		await new ElementPipeline(makeInlineDeps()).run(ancestryElement, ancestryExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const snippet =
			'Humans belong to the world in a way the other speaking peoples do not';
		expect(countOccurrences(root.textContent ?? '', snippet)).toBe(1);
		expect(root.querySelector('.dse-card__flavor')).toBeNull();
	});

	test('ds-class: the flavor/opening paragraph appears exactly once (Finding 1)', async () => {
		const host = inlineHost('ds-class');
		await new ElementPipeline(makeInlineDeps()).run(classElement, classExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const snippet =
			'Strategist. Defender. Leader. With weapon in hand, you lead allies into the maw of battle, barking out commands';
		expect(countOccurrences(root.textContent ?? '', snippet)).toBe(1);
	});

	test('ds-culture: the flavor/opening paragraph appears exactly once (Finding 1)', async () => {
		const host = inlineHost('ds-culture');
		await new ElementPipeline(makeInlineDeps()).run(cultureElement, cultureExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const snippet = 'An urban culture is always centered in a city. Such a culture might arise within the walls of';
		expect(countOccurrences(root.textContent ?? '', snippet)).toBe(1);
	});

	test('ds-perk: the flavor/opening paragraph appears exactly once (Finding 1)', async () => {
		const host = inlineHost('ds-perk');
		await new ElementPipeline(makeInlineDeps()).run(perkElement, perkExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const snippet = 'A supernatural spirit who has taken the form of a specific small animal or animated object';
		expect(countOccurrences(root.textContent ?? '', snippet)).toBe(1);
	});

	test('ds-complication: flavor, Benefit, and Drawback each appear exactly once (Finding 1)', async () => {
		const host = inlineHost('ds-complication');
		await new ElementPipeline(makeInlineDeps()).run(complicationElement, complicationExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const text = root.textContent ?? '';
		expect(countOccurrences(text, 'Perhaps the stars marked you out at birth')).toBe(1);
		expect(countOccurrences(text, 'You have 3 destiny points')).toBe(1);
		expect(countOccurrences(text, "you take 1d10 psychic damage that can't be reduced in any way")).toBe(1);
	});

	test('ds-title: flavor, Prerequisite, and Effect each appear exactly once (Finding 1)', async () => {
		const host = inlineHost('ds-title');
		await new ElementPipeline(makeInlineDeps()).run(titleElement, titleExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const text = root.textContent ?? '';
		expect(countOccurrences(text, 'Hi! Remember me?')).toBe(1);
		expect(countOccurrences(text, "You die at the hands of your greatest foe, that foe still lives")).toBe(1);
		expect(countOccurrences(text, 'You are restored to life')).toBe(1);
	});

	test('ds-treasure: the Effect row value appears exactly once (Finding 2)', async () => {
		const host = inlineHost('ds-treasure');
		await new ElementPipeline(makeInlineDeps()).run(treasureElement, treasureExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const snippet = 'While worn, a blue Color Cloak grants you cold immunity equal to your level';
		expect(countOccurrences(root.textContent ?? '', snippet)).toBe(1);
	});

	test('ds-career: Skills and Perk rows each appear exactly once (Finding 1)', async () => {
		const host = inlineHost('ds-career');
		await new ElementPipeline(makeInlineDeps()).run(careerElement, careerExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const text = root.textContent ?? '';
		expect(countOccurrences(text, 'Two skills from the interpersonal skill group')).toBe(1);
		expect(countOccurrences(text, 'One interpersonal perk')).toBe(1);
	});
});

describe('D6 Task 6: displayFamily by-SCC reference (spec §1, §2.3)', () => {
	test('ds-kit: full scc.v1: code and bare slug both resolve, no error card', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, KIT_REL);

		const codeHost = makeHost('ds-kit');
		await new ElementPipeline(deps).run(kitElement, `scc.v1:${KIT_CODE}`, codeHost);
		const codeRoot = codeHost.containerEl.firstElementChild as HTMLElement;
		expect(codeRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(codeRoot.querySelector('.dse-card__title')!.textContent).toBe('Panther');

		const slugHost = makeHost('ds-kit');
		await new ElementPipeline(deps).run(kitElement, 'panther', slugHost);
		const slugRoot = slugHost.containerEl.firstElementChild as HTMLElement;
		expect(slugRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(slugRoot.querySelector('.dse-card__title')!.textContent).toBe('Panther');
	});

	test('ds-condition: full scc.v1: code and bare slug both resolve, no error card', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, CONDITION_REL);

		const codeHost = makeHost('ds-condition');
		await new ElementPipeline(deps).run(conditionElement, `scc.v1:${CONDITION_CODE}`, codeHost);
		const codeRoot = codeHost.containerEl.firstElementChild as HTMLElement;
		expect(codeRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(codeRoot.querySelector('.dse-card__title')!.textContent).toBe('Bleeding');

		const slugHost = makeHost('ds-condition');
		await new ElementPipeline(deps).run(conditionElement, 'bleeding', slugHost);
		const slugRoot = slugHost.containerEl.firstElementChild as HTMLElement;
		expect(slugRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(slugRoot.querySelector('.dse-card__title')!.textContent).toBe('Bleeding');
	});

	test('ds-treasure: full scc.v1: code and bare slug both resolve, no error card', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, TREASURE_REL);

		const codeHost = makeHost('ds-treasure');
		await new ElementPipeline(deps).run(treasureElement, `scc.v1:${TREASURE_CODE}`, codeHost);
		const codeRoot = codeHost.containerEl.firstElementChild as HTMLElement;
		expect(codeRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(codeRoot.querySelector('.dse-card__title')!.textContent).toBe("Executioner's Blade");

		const slugHost = makeHost('ds-treasure');
		await new ElementPipeline(deps).run(treasureElement, 'executioners-blade', slugHost);
		const slugRoot = slugHost.containerEl.firstElementChild as HTMLElement;
		expect(slugRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(slugRoot.querySelector('.dse-card__title')!.textContent).toBe("Executioner's Blade");
	});

	test('bare slug scoped to a DIFFERENT type family: ds-kit given "bleeding" (a condition) error-cards', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, KIT_REL);
		loadMdDseFixture(vault, CONDITION_REL);

		const host = makeHost('ds-kit');
		await new ElementPipeline(deps).run(kitElement, 'bleeding', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('No compendium entry matches');
		expect(card?.textContent).toContain('bleeding');
	});
});

// D6 Task 7 (spec §2): "every one of the ten mounts inline and by-SCC with no error card"
// — parametrized over ALL TEN displayFamily() elements (the three from Task 6 + the seven
// from this task). Inline mounts here are a light title-only smoke check; the rich
// title/badges/rows/markdown-flag assertions live in the per-element describe blocks
// above. By-SCC repeats each element's own describe-block assertion (full code + bare
// slug, no error card) in one place so the "all ten" invariant is a single, obviously
// exhaustive table rather than implied by scattered individual tests.
const ALL_TEN: {
	id: string;
	element: ElementDefinition<any>;
	example: string;
	/** Inline-mode title (from `example`). */
	inlineTitle: string;
	/** By-SCC title (from the md-dse fixture at `rel`) — differs from `inlineTitle` for
	 *  ds-treasure only (Task 6 review Finding 5 swapped the inline example.yaml to a
	 *  different real treasure than the by-SCC fixture; both are real, just different). */
	refTitle: string;
	code: string;
	rel: string;
	slug: string;
}[] = [
	{ id: 'ds-kit', element: kitElement, example: kitExample, inlineTitle: 'Panther', refTitle: 'Panther', code: KIT_CODE, rel: KIT_REL, slug: 'panther' },
	{
		id: 'ds-condition',
		element: conditionElement,
		example: conditionExample,
		inlineTitle: 'Bleeding',
		refTitle: 'Bleeding',
		code: CONDITION_CODE,
		rel: CONDITION_REL,
		slug: 'bleeding',
	},
	{
		id: 'ds-treasure',
		element: treasureElement,
		example: treasureExample,
		inlineTitle: 'Color Cloak (Blue)',
		refTitle: "Executioner's Blade",
		code: TREASURE_CODE,
		rel: TREASURE_REL,
		slug: 'executioners-blade',
	},
	{
		id: 'ds-ancestry',
		element: ancestryElement,
		example: ancestryExample,
		inlineTitle: 'Human',
		refTitle: 'Human',
		code: 'mcdm.heroes.v1/ancestry/human',
		rel: 'ancestry/human.md',
		slug: 'human',
	},
	{
		id: 'ds-culture',
		element: cultureElement,
		example: cultureExample,
		inlineTitle: 'Urban',
		refTitle: 'Urban',
		code: 'mcdm.heroes.v1/culture/urban',
		rel: 'culture/urban.md',
		slug: 'urban',
	},
	{
		id: 'ds-career',
		element: careerElement,
		example: careerExample,
		inlineTitle: 'Politician',
		refTitle: 'Politician',
		code: 'mcdm.heroes.v1/career/politician',
		rel: 'career/politician.md',
		slug: 'politician',
	},
	{
		id: 'ds-class',
		element: classElement,
		example: classExample,
		inlineTitle: 'Tactician',
		refTitle: 'Tactician',
		code: 'mcdm.heroes.v1/class/tactician',
		rel: 'class/tactician.md',
		slug: 'tactician',
	},
	{
		id: 'ds-title',
		element: titleElement,
		example: titleExample,
		inlineTitle: 'Back From the Grave',
		refTitle: 'Back From the Grave',
		code: 'mcdm.heroes.v1/title/back-from-the-grave',
		rel: 'title/back-from-the-grave.md',
		slug: 'back-from-the-grave',
	},
	{
		id: 'ds-perk',
		element: perkElement,
		example: perkExample,
		inlineTitle: 'Familiar',
		refTitle: 'Familiar',
		code: 'mcdm.heroes.v1/perk/familiar',
		rel: 'perk/familiar.md',
		slug: 'familiar',
	},
	{
		id: 'ds-complication',
		element: complicationElement,
		example: complicationExample,
		inlineTitle: 'Chosen One',
		refTitle: 'Chosen One',
		code: 'mcdm.heroes.v1/complication/chosen-one',
		rel: 'complication/chosen-one.md',
		slug: 'chosen-one',
	},
];

describe('D6 Task 7: all ten displayFamily elements mount inline and by-SCC with no error card', () => {
	test.each(ALL_TEN)('$id: inline example.yaml mounts with the expected title, no error card', async ({ id, element, example, inlineTitle }) => {
		const host = inlineHost(id);
		await new ElementPipeline(makeInlineDeps()).run(element, example, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-card__title')!.textContent).toBe(inlineTitle);
	});

	test.each(ALL_TEN)('$id: full scc.v1: code and bare slug both resolve, no error card', async ({ id, element, refTitle, code, rel, slug }) => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, rel);

		const codeHost = makeHost(id);
		await new ElementPipeline(deps).run(element, `scc.v1:${code}`, codeHost);
		const codeRoot = codeHost.containerEl.firstElementChild as HTMLElement;
		expect(codeRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(codeRoot.querySelector('.dse-card__title')!.textContent).toBe(refTitle);

		const slugHost = makeHost(id);
		await new ElementPipeline(deps).run(element, slug, slugHost);
		const slugRoot = slugHost.containerEl.firstElementChild as HTMLElement;
		expect(slugRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(slugRoot.querySelector('.dse-card__title')!.textContent).toBe(refTitle);
	});
});
