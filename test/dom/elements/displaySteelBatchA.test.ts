// test/dom/elements/displaySteelBatchA.test.ts — SC-120 Batch A (design doc §3.1 class,
// §3.2 career): the Steel compositions for class/career (classLayout.steel/
// careerLayout.steel, layouts.ts) + the shared primitive work they ride on
// (--dse-tiles-n, the right-deck caption slot, plainText, languageCount — unit-tested
// separately in cardLayoutHelpers.test.ts). Mirrors displaySteelBatchC.test.ts's
// convention: real ElementPipeline + real fixtures for the end-to-end DOM shape, plus a
// direct-unit section calling each composition's `bands()` closure with synthetic models
// to pin band order/gating precisely.
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
import { careerElement, classElement } from '@/elements/display';
import { careerLayout, classLayout } from '@/elements/display/layouts';
import careerExample from '@/elements/display/career/example.yaml';
import classExample from '@/elements/display/class/example.yaml';
import { Career, Class } from 'steel-compendium-sdk';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';
import * as fs from 'fs';
import * as path from 'path';

const CAREER_REL = 'career/politician.md';
const CLASS_REL = 'class/tactician.md';

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

function crestIcon(card: HTMLElement): string | null {
	return card.querySelector('.dse-crest .dse-crest__glyph')?.getAttribute('data-icon') ?? null;
}

function bandHeadTexts(card: HTMLElement): (string | null)[] {
	return Array.from(card.querySelectorAll(':scope > .dse-card__band > .dse-card__band-head')).map((el) => el.textContent);
}

/** Reads a `.dse-tiles` row's own `--dse-tiles-n` inline custom property. */
function tilesN(row: Element): string {
	return (row as HTMLElement).style.getPropertyValue('--dse-tiles-n');
}

function tileValues(row: Element): string[] {
	return Array.from(row.querySelectorAll('.dse-tiles__cell .dse-tiles__value')).map((el) => el.textContent ?? '');
}

function tileLabels(row: Element): string[] {
	return Array.from(row.querySelectorAll('.dse-tiles__cell .dse-tiles__label')).map((el) => el.textContent ?? '');
}

/**
 * The trailing plain-body band's own `.dse-card__body` div. `.dse-card__body`-classed
 * divs also appear ONE LEVEL DEEPER inside the Skills/Perk (career) / Skills (class)
 * markdown bands (same class kit's headed bands already reuse) — those bands' wrapper
 * `.dse-card__band` carries a `.dse-card__band-head`, the plain trailing body band's
 * wrapper does not, which is how kit's own ancestry/perk tests (displaySteelBatchC's
 * `bodies[bodies.length - 1]` convention) disambiguate too: bands render in declared
 * order and the plain body band is always LAST.
 */
function lastBodyDiv(card: HTMLElement): HTMLElement {
	const bodies = card.querySelectorAll('.dse-card__body');
	return bodies[bodies.length - 1] as HTMLElement;
}

describe('SC-120 Batch A: ds-class Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-class');
		await new ElementPipeline(makeInlineDeps()).run(classElement, classExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "shield", eyebrow "Class", name from the model, right rail carries primary characteristics', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(head).not.toBeNull();
		expect(crestIcon(head)).toBe('shield');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Class');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Tactician');
		expect(head.querySelector('.dse-head__primary--right')!.textContent).toBe('Might · Reason');
		expect(head.querySelector('.dse-head__deck--right')!.textContent).toBe('primary characteristics');
	});

	test('tactician.yaml: flavor is suppressed against body (dedup) — Basics/Potency/Skills bands then body (policy A, kept whole)', async () => {
		const card = await renderInline();
		expect(card.querySelector(':scope > .dse-card__flavor')).toBeNull();
		expect(bandHeadTexts(card)).toEqual(['Basics', 'Potency', 'Skills']);
	});

	test('Basics band: 3 dash-aware tiles, --dse-tiles-n="3", exact site-parity values', async () => {
		const card = await renderInline();
		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const basics = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Basics')!;
		const row = basics.querySelector('.dse-tiles')!;
		expect(tilesN(row)).toBe('3');
		expect(tileValues(row)).toEqual(['21', '+9', '10']);
		expect(tileLabels(row)).toEqual(['Starting stamina', 'Stamina per level', 'Recoveries']);
	});

	test('Potency band: 3 dash-aware tiles, --dse-tiles-n="3", plainText() strips the SCC links (site parity: "Reason − 2", not the raw markdown)', async () => {
		const card = await renderInline();
		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const potency = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Potency')!;
		const row = potency.querySelector('.dse-tiles')!;
		expect(tilesN(row)).toBe('3');
		expect(tileValues(row)).toEqual(['Reason − 2', 'Reason − 1', 'Reason']);
		expect(tileLabels(row)).toEqual(['Weak potency', 'Average potency', 'Strong potency']);
	});

	test('Skills band renders the skills sentence; body (policy A) is kept WHOLE — Basics heading and the Advancement Table both survive', async () => {
		const card = await renderInline();
		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const skills = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Skills')!;
		expect(skills.textContent).toContain('Lead');
		const body = lastBodyDiv(card);
		expect(body).not.toBeNull();
		// Raw markdown, verbatim (jest's MarkdownRenderer mock appends source text, not
		// rendered HTML) — "### Basics" proves the body's own heading survives (policy A:
		// the site's own class page repeats Basics below the head too), "Tactician
		// Advancement Table" proves the real asset further down the body isn't eaten.
		expect(body.textContent).toContain('### Basics');
		expect(body.textContent).toContain('Tactician Advancement Table');
	});

	test('kit--steel byte-identity proof, part 1: kit still writes --dse-tiles-n="4" on both its rows (statTiles() generalization is behavior-preserving)', async () => {
		// Direct-unit check on statTiles() itself rather than a second full kit render —
		// the shots/freeze gate is the authoritative byte-identity proof; this pins the
		// property VALUE the generalization depends on.
		const { statTiles } = await import('@/framework/kit/statTiles');
		const parent = document.createElement('div');
		const row = statTiles(parent, [
			{ value: '1', label: 'a' },
			{ value: '2', label: 'b' },
			{ value: '3', label: 'c' },
			{ value: '4', label: 'd' },
		]);
		expect(tilesN(row)).toBe('4');
	});

	test('direct: no primary_characteristics -> rightPrimary/rightDeck both undefined (site parity — the pair is gated together)', () => {
		const model = new Class({ name: 'X', content: 'body' });
		expect(classLayout.steel!.rightPrimary!(model, undefined)).toBeUndefined();
		expect(classLayout.steel!.rightDeck!(model, undefined)).toBeUndefined();
	});

	test('direct: Basics/Potency tiles dash-fill missing fields (SC-100 ruling 2 — never omit the cell)', () => {
		const model = new Class({ name: 'X', content: 'unrelated body' });
		const bands = classLayout.steel!.bands(model, undefined);
		const headTexts = bands.map((b) => b.head);
		expect(headTexts).toContain('Basics');
		expect(headTexts).toContain('Potency');
	});
});

describe('SC-120 Batch A: ds-career Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-career');
		await new ElementPipeline(makeInlineDeps()).run(careerElement, careerExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "briefcase", eyebrow "Career", name from the model, no right rail (career declares none)', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(crestIcon(head)).toBe('briefcase');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Career');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Politician');
		expect(head.querySelector('.dse-head__primary--right')).toBeNull();
		expect(head.querySelector('.dse-head__deck--right')).toBeNull();
	});

	test('politician.yaml: flavor is suppressed against body (dedup) — Career Benefits/Skills/Perk bands then body', async () => {
		const card = await renderInline();
		expect(card.querySelector(':scope > .dse-card__flavor')).toBeNull();
		expect(bandHeadTexts(card)).toEqual(['Career Benefits', 'Skills', 'Perk']);
	});

	test('Career Benefits band: 4 dash-filled tiles, --dse-tiles-n="4", languageCount() reduces "One language" -> "1" (owner ruling 18: the NUMERAL, not the word), absent fields dash', async () => {
		const card = await renderInline();
		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const benefits = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Career Benefits')!;
		const row = benefits.querySelector('.dse-tiles')!;
		expect(tilesN(row)).toBe('4');
		expect(tileLabels(row)).toEqual(['Languages', 'Project Pts', 'Renown', 'Wealth']);
		const values = tileValues(row);
		expect(values[0]).toBe('1'); // languageCount("One language") -- owner ruling 18
		expect(values[1]).toBe('—'); // project_points: absent in politician.yaml
		expect(values[2]).toBe('+1'); // renown
		expect(values[3]).toBe('+1'); // wealth
	});

	test('Skills/Perk bands render the same markdown the legacy rows used; body (policy B) strips the labeled lines but keeps the questions prose AND the d6 Inciting Incident table', async () => {
		const card = await renderInline();
		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		const skills = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Skills')!;
		const perk = bands.find((b) => b.querySelector('.dse-card__band-head')?.textContent === 'Perk')!;
		expect(skills.textContent).toContain('interpersonal skill group');
		expect(perk.textContent).toContain('Engrossing Monologue');

		const body = lastBodyDiv(card);
		expect(body).not.toBeNull();
		// Survives: the "questions" prose and the d6 table (load-bearing per the brief).
		expect(body.textContent).toContain('think about the following questions');
		expect(body.textContent).toContain('Diplomatic Immunity');
		expect(body.textContent).toContain('Unbound');
		// Gone: the raw labeled lines the bands above now own (mock MarkdownRenderer
		// appends markdown verbatim, so the literal "**Skills:**" syntax would still be
		// visible in textContent if the strip had failed to remove the line).
		expect(body.textContent).not.toContain('**Skills:**');
		expect(body.textContent).not.toContain('**Languages:**');
		expect(body.textContent).not.toContain('**Perk:**');
		expect(body.textContent).not.toContain('[Renown]');
		expect(body.textContent).not.toContain('[Wealth]');
		// Round-5 review MED-1: the orphaned lead-in sentence is gone too -- the
		// "Career Benefits" band head is its structural replacement.
		expect(body.textContent).not.toContain('You gain the following career benefits');
		// The Skills/Perk sentences appear via their OWN bands, not a second time via body.
		expect(body.textContent).not.toContain('interpersonal skill group');
		expect(body.textContent).not.toContain('Engrossing Monologue');
	});

	test('direct: stripped body also removes a real "**[Project Points](...):**" corpus line (artisan.md shape) — deviation from the design doc\'s 5-label list, documented in the Batch A report — and the "You gain the following career benefits:" lead-in (round-5 review MED-1)', async () => {
		const model = new Career({
			name: 'Artisan',
			// Fix round 3 (owner ruling 26): the strip list is band-gated, so every label
			// this body carries needs its matching model field set too (skills/language/
			// perk/project_points) — matching how a real generated career's body labels
			// always have a backing field. Renown/Wealth aren't in this body, so they're
			// deliberately left unset.
			skills: ['Two skills'],
			language: 'One language',
			perk: 'One perk',
			project_points: 240,
			content:
				'You gain the following career benefits:\n\n**Skills:** Two skills.\n\n**Languages:** One language\n\n**[Project Points](scc.v1:mcdm.heroes.v1/rule.downtime/project-points):** 240\n\n**Perk:** One perk.\n\n| d6 | Inciting Incident |\n|----|----|\n| 1 | Something happens. |',
		});
		const bands = careerLayout.steel!.bands(model, undefined);
		// LOW-4 (round-5 review): the body band is always LAST by declaration order — a
		// `find(b => b.head === undefined)` lookup would ambiguously match career's
		// headless FLAVOR band too, for any model whose flavor doesn't dedupe against the
		// body (this model has none, so `find` happened to pass, but proved nothing about
		// the strip). `bands[bands.length - 1]` mirrors `lastBodyDiv()`'s convention.
		const bodyBand = bands[bands.length - 1];
		const container = document.createElement('div');
		// LOW-5 (round-5 review): awaited, per owner ruling 13's precedent — the fake
		// renderMarkdown below is async, so an un-awaited call is a floating-promise
		// hazard even though it happens to pass today.
		await bodyBand.render(container, async (md, el) => { el.setText(md); }, undefined as any);
		expect(container.textContent).not.toContain('Project Points');
		expect(container.textContent).not.toContain('240');
		expect(container.textContent).not.toContain('You gain the following career benefits');
		expect(container.textContent).toContain('Inciting Incident');
		expect(container.textContent).toContain('Something happens');
	});

	test('direct: Career Benefits tiles render even when every field is absent (dash-fill, never an omitted band)', () => {
		const model = new Career({ name: 'X', content: 'unrelated body' });
		const bands = careerLayout.steel!.bands(model, undefined);
		expect(bands.map((b) => b.head)).toContain('Career Benefits');
	});

	test('direct: no skills/perk -> those bands are gated off (not pushed empty)', () => {
		const model = new Career({ name: 'X', content: 'unrelated body' });
		const bands = careerLayout.steel!.bands(model, undefined);
		expect(bands.map((b) => b.head)).not.toContain('Skills');
		expect(bands.map((b) => b.head)).not.toContain('Perk');
	});

	test('direct (round-5 review LOW-1): a bold-LED PROSE paragraph with no colon survives — "**Wealth** is a measure of…" is not a labeled line', async () => {
		const model = new Career({
			name: 'X',
			content: '**Wealth** is a measure of your character\'s buying power and financial standing.',
		});
		const bands = careerLayout.steel!.bands(model, undefined);
		const bodyBand = bands[bands.length - 1];
		const container = document.createElement('div');
		await bodyBand.render(container, async (md, el) => { el.setText(md); }, undefined as any);
		expect(container.textContent).toContain('is a measure of your character');
	});

	test('direct (round-5 review LOW-2): an indented continuation line survives — a labeled line under a list item is not stripped', async () => {
		const model = new Career({
			name: 'X',
			content: '- An item\n    **Perk:** One perk described inline under the bullet.',
		});
		const bands = careerLayout.steel!.bands(model, undefined);
		const bodyBand = bands[bands.length - 1];
		const container = document.createElement('div');
		await bodyBand.render(container, async (md, el) => { el.setText(md); }, undefined as any);
		expect(container.textContent).toContain('One perk described inline under the bullet');
	});

	// Fix round 3 (owner ruling 26, r7 delta re-review "Judgment call 2 — career latent
	// shape"): the strip list is now BAND-GATED per label, matching how the Batch B
	// families (treasure/title/complication/culture) already gate theirs.
	test('fix round 3 (ruling 26a): a hand-authored "**Skills:**" line with no skills/skill_group survives in the body — the Skills band never renders, so nothing structural owns the line', async () => {
		const model = new Career({
			name: 'X',
			content: '**Skills:** Criminal Underworld, Sneak',
		});
		const bands = careerLayout.steel!.bands(model, undefined);
		expect(bands.map((b) => b.head)).not.toContain('Skills');
		const bodyBand = bands[bands.length - 1];
		const container = document.createElement('div');
		await bodyBand.render(container, async (md, el) => { el.setText(md); }, undefined as any);
		expect(container.textContent).toContain('Criminal Underworld, Sneak');
	});

	test('fix round 3 (ruling 26a): a hand-authored "**Perk:**" line with no perk/perk_group survives in the body — the Perk band never renders', async () => {
		const model = new Career({
			name: 'X',
			content: '**Perk:** Shadowmeld',
		});
		const bands = careerLayout.steel!.bands(model, undefined);
		expect(bands.map((b) => b.head)).not.toContain('Perk');
		const bodyBand = bands[bands.length - 1];
		const container = document.createElement('div');
		await bodyBand.render(container, async (md, el) => { el.setText(md); }, undefined as any);
		expect(container.textContent).toContain('Shadowmeld');
	});

	// Fix round 4 (owner ruling 28, r7 delta re-review LOW-1): the fix-round-3 gap test
	// above only pinned Renown; mutations M4 (reintroduce the Wealth strip-unconditionally
	// bug) and M5 (mispair the Languages gate onto `m.wealth`) both stayed GREEN because
	// only "populated all six" and "dash-filled all six" were covered, never a gap for
	// Languages/Wealth/Project Points individually. Parameterized over all four Career
	// Benefits tile labels; note the tile FACE label for "Project Points" is "Project Pts"
	// (`layouts.ts` tile row) while the BODY label (and `stripCareerBodyLabels`'s match
	// target) is "Project Points" — same distinction the delta re-reviewer's gate table
	// drew.
	//
	// Each case leaves ONLY the target label's own backing field absent while every OTHER
	// backing field is populated — not just "all six absent" (which is exactly the shape
	// the r7 dash-fill-all-six test already used, and under which a mispaired gate like M5
	// is invisible: two absent fields are indistinguishable). With the other five fields
	// live, a gate that got redirected to the WRONG field (M5's `m.language` -> `m.wealth`)
	// now fires true where it must stay false, over-strips the target's body line, and the
	// "line survives" assertion below catches it.
	test.each([
		{
			label: 'Languages',
			tileLabel: 'Languages',
			value: 'One language',
			fields: { skills: ['One skill'], renown: 1, wealth: '+1', perk: 'A perk', project_points: 21 },
		},
		{
			label: 'Renown',
			tileLabel: 'Renown',
			value: '+1',
			fields: { skills: ['One skill'], language: 'One language', wealth: '+1', perk: 'A perk', project_points: 21 },
		},
		{
			label: 'Wealth',
			tileLabel: 'Wealth',
			value: '+1',
			fields: { skills: ['One skill'], language: 'One language', renown: 1, perk: 'A perk', project_points: 21 },
		},
		{
			label: 'Project Points',
			tileLabel: 'Project Pts',
			value: '21',
			fields: { skills: ['One skill'], language: 'One language', renown: 1, wealth: '+1', perk: 'A perk' },
		},
	])(
		'fix round 4 (ruling 28): a "**$label:**" body line with no matching model field dash-fills the Career Benefits tile ($tileLabel) AND keeps the body line — every OTHER backing field is populated so a mispaired/unconditional gate (reviewer mutations M4/M5) is caught',
		async ({ label, tileLabel, value, fields }) => {
			const model = new Career({
				name: 'X',
				content: `**${label}:** ${value}`,
				...fields,
			});
			const bands = careerLayout.steel!.bands(model, undefined);
			const benefits = bands.find((b) => b.head === 'Career Benefits')!;
			const container = document.createElement('div');
			await benefits.render(container, async (md, el) => { el.setText(md); }, undefined as any);
			const row = container.querySelector('.dse-tiles')!;
			const tileIndex = tileLabels(row).indexOf(tileLabel);
			expect(tileValues(row)[tileIndex]).toBe('—'); // the omitted field -> dash-filled
			const bodyBand = bands[bands.length - 1];
			const bodyContainer = document.createElement('div');
			await bodyBand.render(bodyContainer, async (md, el) => { el.setText(md); }, undefined as any);
			expect(bodyContainer.textContent).toContain(value); // duplication, never deletion
		},
	);

	test('fix round 3 (ruling 26c): populated harness-fixture shape (career/example.yaml) still strips Skills/Languages/Renown/Wealth/Perk exactly as today, and a model with ALL SIX matching fields strips all six', async () => {
		const card = await renderInline();
		const body = lastBodyDiv(card);
		expect(body.textContent).not.toContain('**Skills:**');
		expect(body.textContent).not.toContain('**Languages:**');
		expect(body.textContent).not.toContain('[Renown]');
		expect(body.textContent).not.toContain('[Wealth]');
		expect(body.textContent).not.toContain('**Perk:**');

		// Direct unit: all six labels populated with matching fields (the harness fixture
		// has no Project Points line, so this proves the sixth label's gate too).
		const model = new Career({
			name: 'Y',
			skills: ['One skill'],
			language: 'One language',
			renown: 1,
			wealth: '+1',
			perk: 'A perk',
			project_points: 21,
			content:
				'**Skills:** One skill\n\n**Languages:** One language\n\n**Renown:** +1\n\n**Wealth:** +1\n\n**Perk:** A perk\n\n**Project Points:** 21\n\nUnrelated trailing prose survives.',
		});
		const bands = careerLayout.steel!.bands(model, undefined);
		const bodyBand = bands[bands.length - 1];
		const container = document.createElement('div');
		await bodyBand.render(container, async (md, el) => { el.setText(md); }, undefined as any);
		expect(container.textContent).not.toContain('**Skills:**');
		expect(container.textContent).not.toContain('**Languages:**');
		expect(container.textContent).not.toContain('**Renown:**');
		expect(container.textContent).not.toContain('**Wealth:**');
		expect(container.textContent).not.toContain('**Perk:**');
		expect(container.textContent).not.toContain('**Project Points:**');
		expect(container.textContent).toContain('Unrelated trailing prose survives');
	});
});

describe('SC-120 Batch A: by-SCC hybrid mode still resolves both families (source body drives content)', () => {
	test('ds-class hybrid: cardHead + right rail + Basics/Potency/Skills bands + body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, CLASS_REL);
		const host = makeHost('ds-class');
		await new ElementPipeline(deps).run(classElement, 'tactician', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Tactician');
		expect(card.querySelector('.dse-head__primary--right')!.textContent).toBe('Might · Reason');
		expect(bandHeadTexts(card)).toEqual(['Basics', 'Potency', 'Skills']);
		expect(lastBodyDiv(card).textContent).toContain('Tactician Advancement Table');
	});

	test('ds-career hybrid: cardHead + Career Benefits/Skills/Perk bands + stripped body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, CAREER_REL);
		const host = makeHost('ds-career');
		await new ElementPipeline(deps).run(careerElement, 'politician', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Politician');
		expect(bandHeadTexts(card)).toEqual(['Career Benefits', 'Skills', 'Perk']);
		const body = lastBodyDiv(card);
		expect(body.textContent).toContain('Diplomatic Immunity');
		expect(body.textContent).not.toContain('**Skills:**');
	});
});

// Round-5 review LOW-3 (+ owner ruling 17's rightPrimary addendum): nothing previously
// pinned these right-rail un-chip rules' Steel/print scope as a RULE (only DOM
// assertions existed, which can't see a dropped `:not([data-dse-print="on"])` guard —
// the freeze is blind to it too this batch, since class's print pair is already moving
// for MED-2/ruling-17's DOM reasons). Mirrors chromeRound2.test.ts's convention: read
// the real sheet, find each block by its selector text, and assert on both the selector
// and its declarations directly — a sheet-scan a future edit can't silently narrow.
describe('SC-120 Batch A round-5 review LOW-3 / owner ruling 17: the right-rail un-chip rules keep their full Steel/print scope', () => {
	const CSS = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

	function ruleBlock(selector: string): string {
		const start = CSS.indexOf(`${selector} {`);
		expect(start).toBeGreaterThan(-1); // the gate HAS TEETH: a renamed/dropped selector fails here first
		return CSS.slice(start, CSS.indexOf('}', start));
	}

	describe('the right-deck caption rule (round-5 review MED-2)', () => {
		const SELECTOR =
			"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-card > .dse-head .dse-head__deck--right";

		test('the selector carries BOTH halves of the Steel scope', () => {
			expect(SELECTOR).toContain("[data-dse-theme='steel']");
			expect(SELECTOR).toContain(':not([data-dse-print="on"])');
			expect(CSS).toContain(`${SELECTOR} {`);
		});

		test('the block un-chips the deck and states its 3 typographic properties via role tokens/literals, never a bare font-size', () => {
			const block = ruleBlock(SELECTOR);
			expect(block).toContain('background: none;');
			expect(block).toContain('border: none;');
			expect(block).toContain('padding: 0;');
			expect(block).toContain('font-size: var(--dse-fs-micro);');
			expect(block).toContain('letter-spacing: 0.07em;');
			expect(block).toContain('color: var(--dse-fg-faint);');
		});
	});

	describe('the right-primary un-chip rule (owner ruling 17)', () => {
		const SELECTOR =
			"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-card > .dse-head .dse-head__primary--right";

		test('the selector carries BOTH halves of the Steel scope', () => {
			expect(SELECTOR).toContain("[data-dse-theme='steel']");
			expect(SELECTOR).toContain(':not([data-dse-print="on"])');
			expect(CSS).toContain(`${SELECTOR} {`);
		});

		test('the block un-chips the mini-title: no background, no border, no padding', () => {
			const block = ruleBlock(SELECTOR);
			expect(block).toContain('background: none;');
			expect(block).toContain('border: none;');
			expect(block).toContain('padding: 0;');
		});
	});
});
