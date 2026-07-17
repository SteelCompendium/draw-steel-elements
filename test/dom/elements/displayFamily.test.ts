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
import { kitElement, conditionElement, treasureElement } from '@/elements/display';
import kitExample from '@/elements/display/kit/example.yaml';
import conditionExample from '@/elements/display/condition/example.yaml';
import treasureExample from '@/elements/display/treasure/example.yaml';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

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

		// Inline body: the signature ability re-serialized into a nested ds-feature
		// fence (layouts.ts's featureToYaml) — the jest MarkdownRenderer mock appends
		// raw markdown as a text node (test/mocks/obsidian-core.ts), so its literal
		// text is asserted rather than a rendered nested card.
		const body = root.querySelector('.dse-card__body')!;
		expect(body.textContent).toContain('```ds-feature');
		expect(body.textContent).toContain('Devastating Rush');
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
		expect(root.querySelector('.dse-card__title')!.textContent).toBe("Executioner's Blade");
		const badgeTexts = Array.from(root.querySelectorAll('.dse-card__badge')).map((el) => el.textContent);
		expect(badgeTexts).toEqual(expect.arrayContaining(['Heavy Weapon', 'Psionic']));

		const projectRow = Array.from(root.querySelectorAll('.dse-card__row')).find(
			(el) => el.querySelector('.dse-card__row-label')!.textContent === 'Project',
		)!;
		expect(projectRow.querySelector('.dse-card__row-value')!.textContent).toContain('450');

		expect(root.querySelector('.dse-card__body')!.textContent).toContain('quarry weakens');
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
