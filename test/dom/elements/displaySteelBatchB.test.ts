// test/dom/elements/displaySteelBatchB.test.ts — SC-120 Batch B (design doc §3.3 treasure,
// §3.4 complication, §3.5 title, §3.6 culture): the Steel compositions for the four
// "labeled-line" families (treasureLayout.steel/titleLayout.steel/
// complicationLayout.steel/cultureLayout.steel, layouts.ts) + the shared
// `stripLabeledLines`/`bodyLabeledLine` helpers they ride on (unit-tested directly in
// cardLayoutHelpers.test.ts). Mirrors displaySteelBatchA.test.ts/displaySteelBatchC.test.ts's
// convention: real ElementPipeline + real fixtures for the end-to-end DOM shape, plus a
// direct-unit section calling each composition's `bands()` closure with synthetic models
// (including VERBATIM real-corpus body text, per the batch brief) to pin gating/ordering
// precisely.
//
// Fixture note: `treasure/example.yaml` and the by-SCC md-dse fixture
// (`test/fixtures/md-dse/treasure/leveled/weapon/executioners-blade.md`) both predate this
// batch and have incomplete frontmatter relative to their own `content`/body text (missing
// `item_prerequisite`/`project_source`, and the md-dse fixture also missing
// `level_effects`) — real corpus files always carry both consistently (verified against
// `v2/docs/Browse/treasure/**` in this worktree). Deliberately NOT edited here to avoid
// touching shared fixtures other tests depend on (`test/dom/framework/chromeRollout.test.ts`
// pins an exact-match summary line against `treasure/example.yaml`, and the by-SCC fixture
// is shared by the ALL_TEN table in displayFamily.test.ts) — Prerequisite/Source/
// leveled-effects band behavior is proven instead by the direct `bands()`-closure tests
// below, which use synthetic models built from VERBATIM real corpus text.
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementPipelineDeps } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { createThemeService } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import type { PrefsStorage } from '@/framework/seams/prefs';
import { createRollService } from '@/framework/roll/service';
import { createReferenceService } from '@/framework/seams/refs';
import { createValidationService } from '@/framework/validation';
import { createSessionStore } from '@/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { treasureElement, titleElement, complicationElement, cultureElement } from '@/elements/display';
import { treasureLayout, titleLayout, complicationLayout, cultureLayout } from '@/elements/display/layouts';
import treasureExample from '@/elements/display/treasure/example.yaml';
import titleExample from '@/elements/display/title/example.yaml';
import complicationExample from '@/elements/display/complication/example.yaml';
import cultureExample from '@/elements/display/culture/example.yaml';
import { Treasure, Title, Complication, Culture } from 'steel-compendium-sdk';
import type { SteelBand } from '@/elements/shared/CardLayout';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const TREASURE_REL = 'treasure/leveled/weapon/executioners-blade.md';
const TITLE_REL = 'title/back-from-the-grave.md';
const COMPLICATION_REL = 'complication/chosen-one.md';
const CULTURE_REL = 'culture/urban.md';

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

function crestIcon(head: HTMLElement): string | null {
	return head.querySelector('.dse-crest .dse-crest__glyph')?.getAttribute('data-icon') ?? null;
}

function bandHeadTexts(card: HTMLElement): (string | null)[] {
	return Array.from(card.querySelectorAll(':scope > .dse-card__band > .dse-card__band-head')).map((el) => el.textContent);
}

/** Same convention as displaySteelBatchA.test.ts: the trailing plain-body band's own
 *  `.dse-card__body` div — bands render in declared order and the plain body band is
 *  always LAST. */
function lastBodyDiv(card: HTMLElement): HTMLElement {
	const bodies = card.querySelectorAll('.dse-card__body');
	return bodies[bodies.length - 1] as HTMLElement;
}

/** Renders one band's content into a scratch div through a synchronous-looking fake
 *  `renderMarkdown` (async, per ruling 13/16's floating-promise lesson — always awaited). */
async function renderBand(band: SteelBand): Promise<string> {
	const container = document.createElement('div');
	await band.render(container, async (md, el) => { el.setText(md); }, undefined as any);
	return container.textContent ?? '';
}

describe('SC-120 Batch B: ds-treasure Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-treasure');
		await new ElementPipeline(makeInlineDeps()).run(treasureElement, treasureExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "package", eyebrow titleCase(treasure_type) + "· Echelon N" (owner ruling 19 — the fixture carries echelon: "1", not level), name from the model, no rightEyebrow (rarity absent in the fixture)', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(crestIcon(head)).toBe('package');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Trinket · Echelon 1');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Color Cloak (Blue)');
		expect(head.querySelector('.dse-head__eyebrow--right')).toBeNull();
	});

	test('color-cloak-blue.yaml: flavor is suppressed against body (dedup); keyword chips render headless; Project/Effect bands then body (policy B)', async () => {
		const card = await renderInline();
		expect(card.querySelector(':scope > .dse-card__flavor')).toBeNull();
		const badgeTexts = Array.from(card.querySelectorAll('.dse-card__badges .dse-card__badge--keyword')).map((el) => el.textContent);
		expect(badgeTexts).toEqual(['Magic', 'Neck']);
		expect(bandHeadTexts(card)).toEqual(['Project', 'Effect']);
	});

	test('Project band: 2 dash-aware tiles, both slots populated (plainText() strips the SCC links)', async () => {
		const card = await renderInline();
		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const project = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Project')!;
		const row = project.querySelector('.dse-tiles')!;
		expect(Array.from(row.querySelectorAll('.dse-tiles__value')).map((el) => el.textContent)).toEqual([
			'150',
			'Reason or Intuition',
		]);
		expect(Array.from(row.querySelectorAll('.dse-tiles__label')).map((el) => el.textContent)).toEqual([
			'Project Goal',
			'Roll Characteristic',
		]);
	});

	test('Effect band renders m.effect PLUS the absorbed "Additionally, ..." rider (owner ruling 23(a)); body (policy B) strips the labeled lines and no longer carries the rider, but keeps the flavor paragraph (which never had its own bold label)', async () => {
		const card = await renderInline();
		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const effect = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Effect')!;
		expect(effect.textContent).toContain('cold immunity equal to your level');
		// Fix round 2 (ruling 23(a)): the rider paragraph now lives INSIDE the Effect band,
		// immediately beside the sentence it continues, not stranded in the trailing body.
		expect(effect.textContent).toContain('Additionally, when you are targeted');

		const body = lastBodyDiv(card);
		expect(body).not.toBeNull();
		expect(body.textContent).toContain('Anjali sigil');
		// Gone: the raw labeled lines the bands above now own, AND the rider (moved above).
		expect(body.textContent).not.toContain('**Keywords:**');
		expect(body.textContent).not.toContain('**Project Goal:**');
		expect(body.textContent).not.toContain('[Project Roll]');
		expect(body.textContent).not.toContain('Additionally, when you are targeted');
		// The Effect sentence appears via its OWN band, not a second time via body.
		expect(body.textContent).not.toContain('cold immunity equal to your level');
	});

	describe('direct: bands() closure', () => {
		test('eyebrow (owner ruling 19): titleCase(treasure_type), fallback "Treasure" when absent, "· Echelon N" when m.echelon is present, else "· Level N" when m.level is present, else bare type', () => {
			// Bare type: neither echelon nor level.
			expect(treasureLayout.steel!.eyebrow(new Treasure({ name: 'X', treasure_type: 'armor' }))).toBe('Armor');
			expect(treasureLayout.steel!.eyebrow(new Treasure({ name: 'X' }))).toBe('Treasure');
			// Level-only: echelon absent, level present.
			expect(treasureLayout.steel!.eyebrow(new Treasure({ name: 'X', treasure_type: 'armor', level: '5' }))).toBe(
				'Armor · Level 5',
			);
			// Echelon present: PREFERRED over level, even when both are set (echelon is the
			// live field — 77/127 in the corpus — and the base branch's only home for it).
			expect(
				treasureLayout.steel!.eyebrow(new Treasure({ name: 'X', treasure_type: 'armor', echelon: '3' })),
			).toBe('Armor · Echelon 3');
			expect(
				treasureLayout.steel!.eyebrow(
					new Treasure({ name: 'X', treasure_type: 'armor', echelon: '3', level: '5' }),
				),
			).toBe('Armor · Echelon 3');
		});

		test('rightEyebrow: reflects rarity when present, undefined otherwise', () => {
			expect(treasureLayout.steel!.rightEyebrow!(new Treasure({ name: 'X', rarity: 'Rare' }))).toBe('Rare');
			expect(treasureLayout.steel!.rightEyebrow!(new Treasure({ name: 'X' }))).toBeUndefined();
		});

		test('crestIcon is "package" (owner ruling 1)', () => {
			expect(treasureLayout.steel!.crestIcon(new Treasure({ name: 'X' }))).toBe('package');
		});

		test('Project band suppressed ONLY when BOTH slots are absent; a single populated slot still renders the band, dash-filling the other', () => {
			const neither = treasureLayout.steel!.bands(new Treasure({ name: 'X', content: 'body' }), undefined);
			expect(neither.map((b) => b.head)).not.toContain('Project');

			const goalOnly = treasureLayout.steel!.bands(
				new Treasure({ name: 'X', content: 'body', project_goal: '200' }),
				undefined,
			);
			expect(goalOnly.map((b) => b.head)).toContain('Project');
		});

		test('Prerequisite/Source/Effect bands are gated independently — each renders only when its own field is populated', () => {
			const none = treasureLayout.steel!.bands(new Treasure({ name: 'X', content: 'unrelated body' }), undefined);
			expect(none.map((b) => b.head)).not.toContain('Prerequisite');
			expect(none.map((b) => b.head)).not.toContain('Source');
			expect(none.map((b) => b.head)).not.toContain('Effect');

			const prereqOnly = treasureLayout.steel!.bands(
				new Treasure({ name: 'X', content: 'unrelated body', item_prerequisite: 'A thing' }),
				undefined,
			);
			const heads = prereqOnly.map((b) => b.head);
			expect(heads).toContain('Prerequisite');
			expect(heads).not.toContain('Source');
			expect(heads).not.toContain('Effect');
		});

		// r7 review HIGH-2, fix round 2 (owner ruling 22(i)): the plugin's own
		// `treasure/example.yaml`/md-dse fixtures carry EXACTLY this gap (ruling 21) --
		// `**Item Prerequisite:**`/`**Project Source:**` lines in the body with no matching
		// model field. Before the fix these were stripped with NOTHING structural covering
		// them (an information regression vs. the base branch). After: neither band
		// renders (correctly), and the raw lines survive in the body untouched --
		// duplication/preservation, never silent deletion.
		test('HIGH-2 regression: a labeled body line whose model field is ABSENT is never stripped, even though no band renders it', async () => {
			const content = [
				'*Flavor text.*',
				'',
				'**[Item Prerequisite](scc.v1:...):** A pint of blue ichor, soul chalk',
				'',
				'**[Project Source](scc.v1:...):** Licensing agreements in Anjali',
			].join('\n');
			const model = new Treasure({ name: 'X', flavor: 'Flavor text.', content });
			const bands = treasureLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).not.toContain('Prerequisite');
			expect(bands.map((b) => b.head)).not.toContain('Source');
			const bodyText = await renderBand(bands[bands.length - 1]);
			expect(bodyText).toContain('A pint of blue ichor');
			expect(bodyText).toContain('Licensing agreements in Anjali');
		});

		// r7 review HIGH-1, fix round 2 (owner ruling 22(ii)): the real corpus body
		// (`v2/docs/Browse/treasure/1st-echelon/consumable/portable-cloud.md`, verbatim)
		// packs the Item Prerequisite label the composition owns onto the SAME physical
		// line as an unrelated treasure-variant paragraph ("Thunderhead Cloud"). Proven at
		// the FULL composition level (bands + body-strip together), not just the shared
		// helper (`cardLayoutHelpers.test.ts` covers the helper in isolation).
		test('portable-cloud.md real corpus shape survives end-to-end: the Thunderhead Cloud variant (its packed segment) is never deleted', async () => {
			const content = [
				'*This thin glass sphere holds a tiny roiling cloud.*',
				'',
				'**Keywords:** Magic',
				'',
				'**[Item Prerequisite](../../../rule/downtime/item-prerequisite.md):** A cup of rainwater from a sacred fey grove, plus an optional prerequisite (see below)',
				'',
				'**[Project Source](../../../rule/downtime/project-source.md):** Texts or lore in Caelian',
				'',
				'**[Project Roll](../../../rule/downtime/project-roll.md) [Characteristic](../../../rule/character/characteristic.md):** [Reason](../../../rule/character/reason.md) or [Intuition](../../../rule/character/intuition.md)',
				'',
				'**Project Goal:** 30 or 45 (see below)',
				'',
				'**Effect:** As a maneuver, you throw this delicate glass sphere up to 5 squares, breaking it and creating a 4 cube of fog.',
				'',
				"Enterprising mages within various thieves' guilds have developed variations of the Portable Cloud. Each variation has a secondary item prerequisite and a project goal of 45.",
				'',
				'**Noxious Cloud:** Filled with a green or putrid yellow haze, this sphere spreads a choking, foul-smelling mist when broken.',
				'',
				'**[Item Prerequisite](../../../rule/downtime/item-prerequisite.md):** An ounce of undead flesh. **Thunderhead Cloud:** Small lightning bolts arc around the black cloud in this sphere, which creates a 3 cube of cloud and lightning when broken.',
				'',
				'**[Item Prerequisite](../../../rule/downtime/item-prerequisite.md):** A spool of copper wire.',
			].join('\n');
			const model = new Treasure({
				name: 'Portable Cloud',
				flavor: 'This thin glass sphere holds a tiny roiling cloud.',
				keywords: ['Magic'],
				item_prerequisite: 'A cup of rainwater from a sacred fey grove, plus an optional prerequisite (see below)',
				project_source: 'Texts or lore in Caelian',
				project_roll_characteristic:
					'[Reason](../../../rule/character/reason.md) or [Intuition](../../../rule/character/intuition.md)',
				project_goal: '30 or 45 (see below)',
				effect: 'As a maneuver, you throw this delicate glass sphere up to 5 squares, breaking it and creating a 4 cube of fog.',
				content,
			});
			const bands = treasureLayout.steel!.bands(model, undefined);
			const effect = bands.find((b) => b.head === 'Effect')!;
			// Owner ruling 23(a): the rider paragraph is absorbed into the Effect band.
			const effectText = await renderBand(effect);
			expect(effectText).toContain('Enterprising mages');

			const bodyText = await renderBand(bands[bands.length - 1]);
			// The model's own (first) Item Prerequisite occurrence is gone (owned by the
			// Prerequisite band).
			expect(bodyText).not.toContain('A cup of rainwater');
			expect(bodyText).not.toContain('Enterprising mages'); // moved into the Effect band
			// Every other real variant paragraph survives, including the packed segment.
			expect(bodyText).toContain('Noxious Cloud');
			expect(bodyText).toContain('Thunderhead Cloud');
			expect(bodyText).toContain('An ounce of undead flesh');
			expect(bodyText).toContain('A spool of copper wire');
		});

		test('leveled-effects bands are sorted by LEADING INTEGER, not declaration/lexical order ("9th" declared first must still render LAST)', () => {
			const model = new Treasure({
				name: 'X',
				content: 'unrelated body',
				level_effects: { '9th': 'nine effect', '1st': 'one effect', '5th': 'five effect' },
			});
			const bands = treasureLayout.steel!.bands(model, undefined);
			const tierHeads = bands.map((b) => b.head).filter((h): h is string => !!h && h.endsWith(' Level'));
			expect(tierHeads).toEqual(['1st Level', '5th Level', '9th Level']);
		});

		// Verified against the REAL corpus body (v2/docs/Browse/treasure/leveled/armor/
		// grand-scarab.md, verbatim), fed through a synthetic model — proves the FULL
		// composition (bands + body-strip together), not just the shared strip helper
		// (cardLayoutHelpers.test.ts covers that in isolation).
		test('grand-scarab.md real corpus shape: Project + Prerequisite + Source + 3 level-tier bands render their own values, and none of those values double-renders in the stripped body', async () => {
			const levelEffects = {
				'1st': "While you wear this armor, you gain a +6 bonus to Stamina and you can fly. If you don't end your turn on the ground, you fall.",
				'5th': "The armor's bonus to Stamina increases to +12. Additionally, you no longer need to end your turn on the ground to avoid falling.",
				'9th': "The armor's bonus to Stamina increases to +21. Additionally, if you fly any distance before making a strike, that strike gains an edge.",
			};
			const content = [
				'*The blue-purple carapace and wings of a gigantic scarab beetle have been formed into an ornate breastplate.*',
				'',
				'**Keywords:** Magic, Medium Armor',
				'',
				'**[Item Prerequisite](scc.v1:mcdm.heroes.v1/rule.downtime/item-prerequisite):** A giant scarab beetle carapace',
				'',
				'**[Project Source](scc.v1:mcdm.heroes.v1/rule.downtime/project-source):** Texts or lore in Phaedran',
				'',
				'**[Project Roll](scc.v1:mcdm.heroes.v1/rule.downtime/project-roll) [Characteristic](scc.v1:mcdm.heroes.v1/rule.character/characteristic):** [Might](scc.v1:mcdm.heroes.v1/rule.character/might), [Reason](scc.v1:mcdm.heroes.v1/rule.character/reason), or [Intuition](scc.v1:mcdm.heroes.v1/rule.character/intuition)',
				'',
				'**Project Goal:** 450',
				'',
				`**1st Level:** ${levelEffects['1st']}`,
				'',
				`**5th Level:** ${levelEffects['5th']}`,
				'',
				`**9th Level:** ${levelEffects['9th']}`,
			].join('\n');
			const model = new Treasure({
				name: 'Grand Scarab',
				flavor: 'The blue-purple carapace and wings of a gigantic scarab beetle have been formed into an ornate breastplate.',
				keywords: ['Magic', 'Medium Armor'],
				item_prerequisite: 'A giant scarab beetle carapace',
				project_source: 'Texts or lore in Phaedran',
				project_roll_characteristic:
					'[Might](scc.v1:mcdm.heroes.v1/rule.character/might), [Reason](scc.v1:mcdm.heroes.v1/rule.character/reason), or [Intuition](scc.v1:mcdm.heroes.v1/rule.character/intuition)',
				project_goal: '450',
				level_effects: levelEffects,
				content,
			});
			const bands = treasureLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).toEqual([
				undefined, // keyword chips (headless)
				'Project',
				'Prerequisite',
				'Source',
				'1st Level',
				'5th Level',
				'9th Level',
				undefined, // trailing body
			]);

			const tier1 = await renderBand(bands.find((b) => b.head === '1st Level')!);
			expect(tier1).toContain('+6 bonus to Stamina');
			const tier9 = await renderBand(bands.find((b) => b.head === '9th Level')!);
			expect(tier9).toContain('gains an edge');

			const bodyText = await renderBand(bands[bands.length - 1]);
			expect(bodyText).not.toContain('**1st Level:**');
			expect(bodyText).not.toContain('**[Item Prerequisite]');
			expect(bodyText).not.toContain('**Project Goal:**');
			// The level-tier VALUE text never repeats in the body (the double-render defect
			// the ticket named for treasure).
			expect(bodyText).not.toContain('gains an edge');
			expect(bodyText).not.toContain('+6 bonus to Stamina');
		});
	});

	// Hybrid mode: proves the composition mounts against a real by-SCC resolved source.
	// The md-dse fixture's frontmatter is missing item_prerequisite/project_source/
	// level_effects (see the file-header note) — that gap is exercised structurally by the
	// direct grand-scarab.md test above instead, using a synthetic model.
	test('by-SCC hybrid: cardHead + keyword chips + Project band + body from the resolved source, no error card', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, TREASURE_REL);
		const host = makeHost('ds-treasure');
		await new ElementPipeline(deps).run(treasureElement, 'executioners-blade', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe("Executioner's Blade");
		expect(card.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Weapon');
		expect(bandHeadTexts(card)).toEqual(['Project']);
		expect(lastBodyDiv(card).textContent).toContain('faint hum');
	});
});

describe('SC-120 Batch B: ds-title Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-title');
		await new ElementPipeline(makeInlineDeps()).run(titleElement, titleExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "crown", eyebrow "Echelon 3" (from m.echelon), name from the model', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(crestIcon(head)).toBe('crown');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Echelon 3');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Back From the Grave');
	});

	test('back-from-the-grave.yaml: flavor is suppressed against body (dedup); Prerequisite/Effect bands then body (policy B)', async () => {
		const card = await renderInline();
		expect(card.querySelector(':scope > .dse-card__flavor')).toBeNull();
		expect(bandHeadTexts(card)).toEqual(['Prerequisite', 'Effect']);

		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const prereq = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Prerequisite')!;
		expect(prereq.textContent).toContain("aren't a");
		const effect = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Effect')!;
		expect(effect.textContent).toContain('restored to life');

		const body = lastBodyDiv(card);
		expect(body.textContent).toContain('Hi! Remember me?');
		expect(body.textContent).not.toContain('**Prerequisite:**');
		expect(body.textContent).not.toContain('**Effect:**');
		expect(body.textContent).not.toContain('restored to life');
	});

	describe('direct: bands() closure', () => {
		test('eyebrow: "Echelon N" when m.echelon is present, "Title" otherwise', () => {
			expect(titleLayout.steel!.eyebrow(new Title({ name: 'X', echelon: '2' }))).toBe('Echelon 2');
			expect(titleLayout.steel!.eyebrow(new Title({ name: 'X' }))).toBe('Title');
		});

		test('crestIcon is "crown"', () => {
			expect(titleLayout.steel!.crestIcon(new Title({ name: 'X' }))).toBe('crown');
		});

		test('Prerequisite/Effect bands are gated independently', () => {
			const none = titleLayout.steel!.bands(new Title({ name: 'X', content: 'unrelated' }), undefined);
			expect(none.map((b) => b.head)).not.toContain('Prerequisite');
			expect(none.map((b) => b.head)).not.toContain('Effect');

			const prereqOnly = titleLayout.steel!.bands(
				new Title({ name: 'X', content: 'unrelated', prerequisite: 'You must have done a thing.' }),
				undefined,
			);
			const heads = prereqOnly.map((b) => b.head);
			expect(heads).toContain('Prerequisite');
			expect(heads).not.toContain('Effect');
		});

		// r7 review HIGH-2, fix round 2 (owner ruling 22(i)): 'Echelon'/'Prerequisite'/
		// 'Effect' body lines whose model field is ABSENT are never stripped -- nothing
		// renders them, so deleting them would be a pure information loss.
		test('HIGH-2 regression: Echelon/Prerequisite/Effect body lines survive when their own model field is absent', async () => {
			const content = [
				'*Flavor.*',
				'',
				'**Echelon:** 2nd',
				'',
				'**Prerequisite:** You must have done a thing.',
				'',
				'**Effect:** Something happens.',
			].join('\n');
			const model = new Title({ name: 'X', flavor: 'Flavor.', content });
			const bands = titleLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).not.toContain('Prerequisite');
			expect(bands.map((b) => b.head)).not.toContain('Effect');
			const bodyText = await renderBand(bands[bands.length - 1]);
			expect(bodyText).toContain('2nd');
			expect(bodyText).toContain('You must have done a thing');
			expect(bodyText).toContain('Something happens');
		});

		// Verified against the REAL corpus body (v2/docs/Browse/title/marshal.md, verbatim):
		// Echelon/Prerequisite/Effect strip, the bullet-list benefits (a separate paragraph
		// after Effect) survive.
		test('marshal.md real corpus shape: Echelon/Prerequisite/Effect strip, the bullet-list benefits survive whole', async () => {
			const content = [
				'*I said you had twenty-four hours to leave town. That was... what, about twenty-four hours ago?*',
				'',
				'**Echelon:** 1st',
				'',
				'**Prerequisite:** You join an organization that hunts criminals, such as the Far Mariners.',
				'',
				'**Effect:** Choose one of the following benefits:',
				'',
				"- *Guess It's the Hard Way Then:* When combat begins and you aren't surprised, the first time you take damage before taking your turn, you halve that damage.",
				'- *Heedless Pursuer:* Once on each of your turns, you can use a free maneuver to deal yourself 1d6 damage.',
			].join('\n');
			const model = new Title({
				name: 'Marshal',
				echelon: '1',
				flavor: 'I said you had twenty-four hours to leave town. That was... what, about twenty-four hours ago?',
				prerequisite: 'You join an organization that hunts criminals, such as the Far Mariners.',
				effect: 'Choose one of the following benefits:',
				content,
			});
			const bands = titleLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).toEqual(['Prerequisite', 'Effect', undefined]);
			const bodyText = await renderBand(bands[bands.length - 1]);
			expect(bodyText).not.toContain('**Echelon:**');
			expect(bodyText).not.toContain('**Prerequisite:**');
			expect(bodyText).not.toContain('**Effect:**');
			expect(bodyText).toContain("Guess It's the Hard Way Then");
			expect(bodyText).toContain('Heedless Pursuer');
		});
	});

	test('by-SCC hybrid: cardHead + Prerequisite/Effect bands + stripped body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, TITLE_REL);
		const host = makeHost('ds-title');
		await new ElementPipeline(deps).run(titleElement, 'back-from-the-grave', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Back From the Grave');
		expect(bandHeadTexts(card)).toEqual(['Prerequisite', 'Effect']);
	});
});

describe('SC-120 Batch B: ds-complication Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-complication');
		await new ElementPipeline(makeInlineDeps()).run(complicationElement, complicationExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "octagon-alert", eyebrow "Complication", name from the model', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(crestIcon(head)).toBe('octagon-alert');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Complication');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Chosen One');
	});

	test('chosen-one.yaml: flavor is suppressed against body (dedup); Benefit/Drawback bands then body (policy B)', async () => {
		const card = await renderInline();
		expect(card.querySelector(':scope > .dse-card__flavor')).toBeNull();
		expect(bandHeadTexts(card)).toEqual(['Benefit', 'Drawback']);

		const body = lastBodyDiv(card);
		expect(body.textContent).toContain('Perhaps the stars marked you out');
		expect(body.textContent).not.toContain('**Benefit:**');
		expect(body.textContent).not.toContain('**Drawback:**');
		expect(body.textContent).not.toContain('destiny points. Whenever you spend');
	});

	describe('direct: bands() closure', () => {
		test('Benefit/Drawback bands are gated independently', () => {
			const none = complicationLayout.steel!.bands(new Complication({ name: 'X', content: 'unrelated' }), undefined);
			expect(none.map((b) => b.head)).not.toContain('Benefit');
			expect(none.map((b) => b.head)).not.toContain('Drawback');

			const benefitOnly = complicationLayout.steel!.bands(
				new Complication({ name: 'X', content: 'unrelated', benefit: 'A benefit.' }),
				undefined,
			);
			const heads = benefitOnly.map((b) => b.head);
			expect(heads).toContain('Benefit');
			expect(heads).not.toContain('Drawback');
		});

		// r7 review HIGH-2, fix round 2 (owner ruling 22(i)): 'Benefit'/'Drawback' body
		// lines whose model field is ABSENT are never stripped -- nothing renders them.
		test('HIGH-2 regression: Benefit/Drawback body lines survive when their own model field is absent', async () => {
			const content = ['*Flavor.*', '', '**Benefit:** A benefit text.', '', '**Drawback:** A drawback text.'].join(
				'\n',
			);
			const model = new Complication({ name: 'X', flavor: 'Flavor.', content });
			const bands = complicationLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).not.toContain('Benefit');
			expect(bands.map((b) => b.head)).not.toContain('Drawback');
			const bodyText = await renderBand(bands[bands.length - 1]);
			expect(bodyText).toContain('A benefit text');
			expect(bodyText).toContain('A drawback text');
		});

		// Verified against the REAL corpus body (v2/docs/Browse/complication/wodewalker.md,
		// verbatim): Benefit/Drawback strip, the un-italicized flavor paragraph survives.
		test('wodewalker.md real corpus shape: Benefit/Drawback strip, the flavor paragraph survives whole', async () => {
			const content = [
				'You were dying in the wode, collapsing while starving and wounded. When you woke, you discovered that a group of green elementalists had saved your life by infusing the regenerative bark of a tree to your body.',
				'',
				'**Benefit:** Your recovery value increases by an amount equal to your highest characteristic score.',
				'',
				'**Drawback:** You have fire weakness 5.',
			].join('\n');
			const model = new Complication({
				name: 'Wodewalker',
				flavor:
					'You were dying in the wode, collapsing while starving and wounded. When you woke, you discovered that a group of green elementalists had saved your life by infusing the regenerative bark of a tree to your body.',
				benefit: 'Your recovery value increases by an amount equal to your highest characteristic score.',
				drawback: 'You have fire weakness 5.',
				content,
			});
			const bands = complicationLayout.steel!.bands(model, undefined);
			// Flavor duplicates content's lead paragraph verbatim -> suppressed.
			expect(bands.map((b) => b.head)).toEqual(['Benefit', 'Drawback', undefined]);
			const bodyText = await renderBand(bands[bands.length - 1]);
			expect(bodyText).not.toContain('**Benefit:**');
			expect(bodyText).not.toContain('**Drawback:**');
			expect(bodyText).not.toContain('fire weakness 5');
			expect(bodyText).toContain('dying in the wode');
		});
	});

	test('by-SCC hybrid: cardHead + Benefit/Drawback bands + stripped body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, COMPLICATION_REL);
		const host = makeHost('ds-complication');
		await new ElementPipeline(deps).run(complicationElement, 'chosen-one', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Chosen One');
		expect(bandHeadTexts(card)).toEqual(['Benefit', 'Drawback']);
	});
});

describe('SC-120 Batch B: ds-culture Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-culture');
		await new ElementPipeline(makeInlineDeps()).run(cultureElement, cultureExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "map" (owner ruling 3 — follows cards.go), eyebrow "Culture", name from the model', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(crestIcon(head)).toBe('map');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Culture');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Urban');
	});

	test('urban.yaml: flavor is suppressed against body (dedup); Skill Options band (body fallback, since skill_options/quick_build_skill are frontmatter-empty) then body (policy B)', async () => {
		const card = await renderInline();
		expect(card.querySelector(':scope > .dse-card__flavor')).toBeNull();
		expect(bandHeadTexts(card)).toEqual(['Skill Options']);

		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const skillOptions = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Skill Options')!;
		expect(skillOptions.textContent).toContain('interpersonal');
		expect(skillOptions.textContent).toContain('Quick Build');

		const body = lastBodyDiv(card);
		expect(body.textContent).toContain('centered in a city');
		expect(body.textContent).not.toContain('**Skill Options:**');
		// The Skill Options sentence appears via its OWN band, not a second time via body.
		expect(body.textContent).not.toContain('Quick Build');
	});

	describe('direct: bands() closure — the three-way Skill Options fallback (design §3.6)', () => {
		test('structured skill_options wins when present', () => {
			const model = new Culture({ name: 'X', content: 'unrelated', skill_options: ['Alertness', 'Brag'] });
			const bands = cultureLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).toContain('Skill Options');
		});

		test('quick_build_skill wins when skill_options is absent', () => {
			const model = new Culture({ name: 'X', content: 'unrelated', quick_build_skill: 'Alertness' });
			const bands = cultureLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).toContain('Skill Options');
		});

		test('falls back to the body\'s own "**Skill Options:**" line when both structured fields are absent', () => {
			const model = new Culture({
				name: 'X',
				content: 'Some prose.\n\n**Skill Options:** One skill from the intrigue skill group.',
			});
			const bands = cultureLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).toContain('Skill Options');
		});

		test('band omitted entirely when all three are empty (never a lie about the data)', () => {
			const model = new Culture({ name: 'X', content: 'Some prose with no Skill Options line at all.' });
			const bands = cultureLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).not.toContain('Skill Options');
		});

		test('crestIcon is "map"', () => {
			expect(cultureLayout.steel!.crestIcon(new Culture({ name: 'X' }))).toBe('map');
		});

		// Verified against the REAL corpus body (v2/docs/Browse/culture/bureaucratic.md,
		// verbatim, including the nested italic "(*Quick Build:* ...)" parenthetical, which
		// must survive as part of the Skill Options sentence, not be mistaken for a second
		// labeled line).
		test('bureaucratic.md real corpus shape: Skill Options extracted via the body fallback, Quick Build parenthetical intact, label stripped from body', async () => {
			const content = [
				'[Bureaucratic](scc.v1:mcdm.heroes.v1/culture/bureaucratic) cultures are steeped in official leadership and formally recorded laws.',
				'',
				'**Skill Options:** One skill from the [interpersonal](scc.v1:mcdm.heroes.v1/skill.group/interpersonal) or [intrigue](scc.v1:mcdm.heroes.v1/skill.group/intrigue) skill groups. (*Quick Build:* [Persuade](scc.v1:mcdm.heroes.v1/skill.interpersonal/persuade).)',
			].join('\n');
			const model = new Culture({
				name: 'Bureaucratic',
				flavor:
					'Bureaucratic cultures are steeped in official leadership and formally recorded laws.',
				content,
			});
			const bands = cultureLayout.steel!.bands(model, undefined);
			expect(bands.map((b) => b.head)).toEqual(['Skill Options', undefined]);
			const skillText = await renderBand(bands[0]);
			expect(skillText).toContain('Quick Build');
			expect(skillText).toContain('Persuade');
			const bodyText = await renderBand(bands[bands.length - 1]);
			expect(bodyText).not.toContain('**Skill Options:**');
			expect(bodyText).not.toContain('Quick Build');
		});
	});

	test('by-SCC hybrid: cardHead + Skill Options band + stripped body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, CULTURE_REL);
		const host = makeHost('ds-culture');
		await new ElementPipeline(deps).run(cultureElement, 'urban', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Urban');
		expect(bandHeadTexts(card)).toEqual(['Skill Options']);
	});
});
