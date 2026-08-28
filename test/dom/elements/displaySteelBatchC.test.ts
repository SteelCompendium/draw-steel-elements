// test/dom/elements/displaySteelBatchC.test.ts — SC-120 Batch C (§3.7-§3.10 of the round-1
// design doc): the Steel compositions for ancestry/perk/condition/rule
// (ancestryLayout.steel/perkLayout.steel/conditionLayout.steel, layouts.ts; genericLayout's
// `steel`, displayFamily.ts). Mirrors kitSteel.test.ts's convention (real ElementPipeline,
// real fixtures) for the end-to-end DOM shape, plus a direct-unit section calling each
// composition's `bands()` closure with synthetic models to pin band ORDER/gating precisely
// (real corpus fixtures dedupe flavor against body almost everywhere, so the end-to-end
// tests alone can never show a non-suppressed flavor band).
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
import { ancestryElement, perkElement, conditionElement, ruleElement } from '@/elements/display';
import { ancestryLayout, perkLayout, conditionLayout } from '@/elements/display/layouts';
import ancestryExample from '@/elements/display/ancestry/example.yaml';
import perkExample from '@/elements/display/perk/example.yaml';
import conditionExample from '@/elements/display/condition/example.yaml';
import ruleExample from '@/elements/display/rule/example.yaml';
import { Ancestry, Perk, Condition } from 'steel-compendium-sdk';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const ANCESTRY_REL = 'ancestry/human.md';
const PERK_REL = 'perk/familiar.md';
const CONDITION_REL = 'condition/bleeding.md';
const RULE_REL = 'rule/combat/opportunity-attack.md';

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
	return Array.from(card.querySelectorAll('.dse-card__band-head')).map((el) => el.textContent);
}

describe('SC-120 Batch C: ds-ancestry Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-ancestry');
		await new ElementPipeline(makeInlineDeps()).run(ancestryElement, ancestryExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "users", eyebrow "Ancestry", name from the model', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(head).not.toBeNull();
		expect(crestIcon(head)).toBe('users');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Ancestry');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Human');
	});

	test('Signature Trait band: renders the name (description is 0/12 in the corpus, so name alone)', async () => {
		const card = await renderInline();
		expect(bandHeadTexts(card)).toEqual(['Signature Trait']);
		const bands = Array.from(card.querySelectorAll(':scope > .dse-card__band'));
		expect(bands[0].querySelector('.dse-card__band-head')!.textContent).toBe('Signature Trait');
		expect(bands[0].textContent).toContain('Detect the Supernatural');
	});

	test('flavor is suppressed against body (human.yaml\'s flavor duplicates content\'s lead paragraph — the same dedup guard kit\'s flavor band uses) and body renders whole (policy A)', async () => {
		const card = await renderInline();
		expect(card.querySelector('.dse-card__flavor')).toBeNull();
		// Two `.dse-card__body`-classed divs exist here — the Signature Trait band's own
		// content (same class kit's headed Signature Ability band reuses) AND the trailing
		// body band; the LAST one is the actual body band (flavor is suppressed, so body is
		// band 2 of 2 — see bandHeadTexts() above, which only ever finds one head).
		const bodies = card.querySelectorAll('.dse-card__body');
		expect(bodies.length).toBe(2);
		expect(bodies[bodies.length - 1].textContent).toContain('On Humans');
	});

	test('direct band-order proof: Signature Trait renders ABOVE flavor when neither is suppressed (site tile order) — real corpus fixtures always dedupe flavor, so this uses a synthetic model', async () => {
		const model = new Ancestry({
			name: 'Testkin',
			signature_trait_name: 'Test Sense',
			flavor: 'A flavor sentence that does not appear in the body at all.',
			content: 'Completely unrelated lore body, sharing no text with the flavor above.',
		});
		const container = document.createElement('div');
		const bands = ancestryLayout.steel!.bands(model, undefined);
		expect(bands.map((b) => b.head)).toEqual(['Signature Trait', undefined, undefined]);
		// Mount band 2 (flavor, headless) to confirm it's the flavor text, not swapped with
		// body. Round-3 review LOW-4: this render() call must be awaited — the fake
		// renderMarkdown below is async, and an un-awaited call only happened to pass
		// because it writes before its first suspension point; a real `await` landing in
		// front of `setText` would otherwise fail this assertion for an unrelated reason.
		await bands[1].render(container, async (md, el) => {
			el.setText(md);
		}, undefined as any);
		expect(container.textContent).toContain('A flavor sentence that does not appear in the body at all.');
	});

	test('direct: no signature trait, no flavor/body text -> zero bands (no stray empty band wrapper)', () => {
		const model = new Ancestry({ name: 'Empty' });
		const bands = ancestryLayout.steel!.bands(model, undefined);
		expect(bands).toEqual([]);
	});
});

describe('SC-120 Batch C: ds-perk Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-perk');
		await new ElementPipeline(makeInlineDeps()).run(perkElement, perkExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "gem", eyebrow "Perk" (perk_group is 0/55 in the corpus), name from the model', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(crestIcon(head)).toBe('gem');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Perk');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Familiar');
	});

	test('familiar.yaml: flavor is suppressed against body (dedup) and no Prerequisites band (unpopulated) — body carries the whole card, headless', async () => {
		const card = await renderInline();
		expect(card.querySelector('.dse-card__flavor')).toBeNull();
		expect(bandHeadTexts(card)).toEqual([]);
		expect(card.querySelector('.dse-card__body')!.textContent).toContain('Familiar Statblock');
	});

	test('eyebrow includes the perk group when populated: "${Group} Perk"', () => {
		const model = new Perk({ name: 'X', perk_group: 'interpersonal', content: 'body' });
		expect(perkLayout.steel!.eyebrow(model, undefined)).toBe('Interpersonal Perk');
	});

	test('direct: Prerequisites band is gated on non-empty, and sits between flavor and body', () => {
		const model = new Perk({
			name: 'X',
			flavor: 'flavor text not present in body',
			prerequisites: 'Must have the [Familiar](scc.v1:mcdm.heroes.v1/perk/familiar) perk.',
			content: 'unrelated body prose',
		});
		const bands = perkLayout.steel!.bands(model, undefined);
		expect(bands.map((b) => b.head)).toEqual([undefined, 'Prerequisites', undefined]);
	});
});

describe('SC-120 Batch C: ds-condition Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-condition');
		await new ElementPipeline(makeInlineDeps()).run(conditionElement, conditionExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "zap", eyebrow "Condition", name from the model; head-only composition (body, no head label)', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(crestIcon(head)).toBe('zap');
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Condition');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Bleeding');
		expect(bandHeadTexts(card)).toEqual([]);
		// The legacy type-tone badge is superseded by the eyebrow — renderSteel() never
		// calls layout.badges.
		expect(card.querySelector('.dse-card__badge')).toBeNull();
		expect(card.querySelector('.dse-card__body')!.textContent).toContain('lose');
	});

	test('direct: no content -> zero bands (no stray empty band wrapper)', () => {
		const model = new Condition({ name: 'Empty' });
		expect(conditionLayout.steel!.bands(model, undefined)).toEqual([]);
	});
});

describe('SC-120 Batch C: ds-rule (genericCard) Steel composition', () => {
	async function renderInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-rule');
		// ruleExample's own body is a single paragraph in a few places — reuse the same
		// two-paragraph body ruleCard.test.ts's own inline test already proved is real
		// md-dse shape, but here just exercise the packaged example.yaml text (multi-line).
		await new ElementPipeline(makeInlineDeps()).run(ruleElement, ruleExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest "book-open"; head-only composition (body, no head label)', async () => {
		const card = await renderInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(crestIcon(head)).toBe('book-open');
		expect(bandHeadTexts(card)).toEqual([]);
		expect(card.querySelector('.dse-card__body')!.textContent).toContain('opportunity attack');
	});
});

describe('SC-120 Batch C: by-SCC hybrid mode still resolves each family (source body drives content)', () => {
	test('ds-ancestry hybrid: cardHead + Signature Trait band + body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, ANCESTRY_REL);
		const host = makeHost('ds-ancestry');
		await new ElementPipeline(deps).run(ancestryElement, 'human', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Human');
		expect(bandHeadTexts(card)).toEqual(['Signature Trait']);
	});

	test('ds-perk hybrid: cardHead renders, body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, PERK_REL);
		const host = makeHost('ds-perk');
		await new ElementPipeline(deps).run(perkElement, 'familiar', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Familiar');
		expect(card.querySelector('.dse-card__body')!.textContent).toContain('Familiar Statblock');
	});

	test('ds-condition hybrid: cardHead renders, body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, CONDITION_REL);
		const host = makeHost('ds-condition');
		await new ElementPipeline(deps).run(conditionElement, 'bleeding', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Bleeding');
		expect(card.querySelector('.dse-card__body')!.textContent).toContain('lose');
	});

	test('ds-rule hybrid: eyebrow falls back to "Rule" (frontmatter type is always the bare "rule" in the real corpus), body from the resolved source', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, RULE_REL);
		const host = makeHost('ds-rule');
		await new ElementPipeline(deps).run(ruleElement, 'opportunity-attack', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Opportunity Attacks');
		expect(card.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Rule');
		expect(card.querySelector('.dse-card__body')!.textContent).toContain('opportunity attack');
	});
});
