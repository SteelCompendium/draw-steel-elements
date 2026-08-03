// test/dom/elements/kitSteel.test.ts — Plan 24 / SC-100 Task 3: the Steel kit
// composition (kitLayout.steel, layouts.ts) rendered through DisplayCardView's
// renderSteel() branch (CardLayout.ts, Task 2's seam). Mirrors the site's
// `renderKitPlate` (kit_page.go) point-for-point (the plan's Design section):
// cardHead crest + kind eyebrow, boxed Equipment band, the 2x4 dash-aware stat-tile
// grid, and the kept (richer) signature-ability sub-render — inline mode through
// renderFeatureList, hybrid mode through the stripped source body.
//
// DEFAULT_THEME_ID is 'steel' (framework/seams/theme.ts), so these tests render
// under the ambient default — no `setActive` needed — UNLIKE displayFamily.test.ts /
// displayCardHybrid.test.ts, which now pin `setActive('legacy')` explicitly to keep
// proving the OLD DOM still renders (Task 2's invariant 2). This file is the Steel
// branch's own coverage.
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
import { kitElement, conditionElement } from '@/elements/display';
import kitExample from '@/elements/display/kit/example.yaml';
import conditionExample from '@/elements/display/condition/example.yaml';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const KIT_CODE = 'mcdm.heroes.v1/kit/panther';
const KIT_REL = 'kit/panther.md';

/** Same convention as displayFamily.test.ts's own makeInlineDeps() — real service
 *  instances, no compendium/sccAnchors (inline-mode tests never resolve a reference). */
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

/** [value, label] pairs for every `.dse-tiles__cell` in document order. */
function tileTexts(card: HTMLElement): Array<[string, string]> {
	return Array.from(card.querySelectorAll('.dse-tiles__cell')).map((cell) => [
		cell.querySelector('.dse-tiles__value')!.textContent ?? '',
		cell.querySelector('.dse-tiles__label')!.textContent ?? '',
	]);
}

function bandHead(card: HTMLElement, label: string): HTMLElement | null {
	return (
		(Array.from(card.querySelectorAll('.dse-card__band')).find(
			(b) => b.querySelector(':scope > .dse-card__band-head')?.textContent === label,
		) as HTMLElement | undefined) ?? null
	);
}

describe('Plan 24 / SC-100 Task 3: kit Steel composition — inline mode (Panther fixture)', () => {
	async function renderPantherInline(): Promise<HTMLElement> {
		const host = inlineHost('ds-kit');
		await new ElementPipeline(makeInlineDeps()).run(kitElement, kitExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest present, "Martial Kit" eyebrow (keyword-sniffed — no Psionic/Magic keyword in Panther\'s signature ability), name', async () => {
		const card = await renderPantherInline();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(head).not.toBeNull();

		const crest = head.querySelector<HTMLElement>(':scope > .dse-crest');
		expect(crest).not.toBeNull();
		expect(crest!.hasClass('dse-crest--lg')).toBe(true);
		expect(crest!.querySelector('.dse-crest__glyph')!.getAttribute('data-icon')).toBe('backpack');

		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Martial Kit');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Panther');
	});

	test('Kit Bonuses: all 8 tiles in order, "per Echelon" folded into the Stamina label, "—" for every absent bonus (Ranged Dmg/Melee Dist/Ranged Dist/Disengage — Panther has none of these)', async () => {
		const card = await renderPantherInline();
		expect(tileTexts(card)).toEqual([
			['+6', 'Stamina per Echelon'],
			['+1', 'Speed'],
			['+1', 'Stability'],
			['—', 'Disengage'],
			['+0/+0/+4', 'Melee Dmg'],
			['—', 'Ranged Dmg'],
			['—', 'Melee Dist'],
			['—', 'Ranged Dist'],
		]);
		// The is-dmg accent hook (site's `.is-dmg`) lands on exactly the two damage cells.
		const dmgCells = card.querySelectorAll('.dse-tiles__cell--dmg');
		expect(dmgCells).toHaveLength(2);
		expect(Array.from(dmgCells).map((c) => c.querySelector('.dse-tiles__label')!.textContent)).toEqual([
			'Melee Dmg',
			'Ranged Dmg',
		]);
	});

	test('Equipment band: verbatim equipment_text under an "Equipment" band-head', async () => {
		const card = await renderPantherInline();
		const band = bandHead(card, 'Equipment');
		expect(band).not.toBeNull();
		expect(band!.querySelector('.dse-kit__equip')!.textContent).toBe('You wear no armor and wield a heavy weapon.');
	});

	test('Signature Ability band: the kept (richer) real feature card, via renderFeatureList — same mechanism the legacy `features` slot uses', async () => {
		const card = await renderPantherInline();
		const band = bandHead(card, 'Signature Ability');
		expect(band).not.toBeNull();
		const featureCard = band!.querySelector('.dse-feature');
		expect(featureCard).not.toBeNull();
		expect(featureCard!.querySelector('.dse-head__primary--left')!.textContent).toBe('Devastating Rush');
		// No raw YAML/fence dump anywhere on the card (Task 6 review Finding 4's guard,
		// still true on the Steel branch).
		expect(card.textContent).not.toContain('feature_type:');
		expect(card.textContent).not.toContain('```ds-feature');
	});

	test('flavor renders (inline mode never suppresses it — kitLayout.body is undefined whenever a signature ability is present, so the dedup guard never fires)', async () => {
		const card = await renderPantherInline();
		// Nested TWO levels deep (`.dse-card > .dse-card__band > .dse-card__flavor`) —
		// the flavor band is headless (no `.dse-card__band-head`), but renderSteel()'s
		// generic band loop still wraps every band's content in its own `.dse-card__band`.
		expect(card.querySelector('.dse-card__flavor')!.textContent).toContain('good balance of protection');
	});

	test('band order: Equipment -> Kit Bonuses -> Signature Ability (Design section order, after the flavor)', async () => {
		const card = await renderPantherInline();
		const headTexts = Array.from(card.querySelectorAll('.dse-card__band-head')).map((el) => el.textContent);
		expect(headTexts).toEqual(['Equipment', 'Kit Bonuses', 'Signature Ability']);
	});
});

describe('Plan 24 / SC-100 Task 3: kit Steel composition — hybrid by-SCC mode (real panther.md fixture)', () => {
	async function renderPantherHybrid(): Promise<HTMLElement> {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, KIT_REL);
		const host = makeHost('ds-kit');
		await new ElementPipeline(deps).run(kitElement, `scc.v1:${KIT_CODE}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		return root.querySelector('.dse-card') as HTMLElement;
	}

	test('cardHead: crest + "Martial Kit" eyebrow derived from the resolved source BODY (frontmatter has no signature_ability key at all — hybrid model is frontmatter-only)', async () => {
		const card = await renderPantherHybrid();
		const head = card.querySelector(':scope > .dse-head') as HTMLElement;
		expect(head.querySelector(':scope > .dse-crest')).not.toBeNull();
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Martial Kit');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Panther');
	});

	test('Equipment/Kit Bonuses bands still render from frontmatter (hybrid has NO signature_ability field, but every *_bonus/equipment_text field IS frontmatter)', async () => {
		const card = await renderPantherHybrid();
		expect(bandHead(card, 'Equipment')!.querySelector('.dse-kit__equip')!.textContent).toBe(
			'You wear no armor and wield a heavy weapon.',
		);
		expect(tileTexts(card)).toEqual([
			['+6', 'Stamina per Echelon'],
			['+1', 'Speed'],
			['+1', 'Stability'],
			['—', 'Disengage'],
			['+0/+0/+4', 'Melee Dmg'],
			['—', 'Ranged Dmg'],
			['—', 'Melee Dist'],
			['—', 'Ranged Dist'],
		]);
	});

	test('Signature Ability band: the source body reaches renderMarkdown with the Equipment heading/prose STRIPPED but the ```ds-feature fence (and its "Devastating Rush" name) KEPT — the fence recursing into a real nested card is real-Obsidian-only (by-scc-kit--obsidian-recursion), unreachable from the jest mock (test/mocks/obsidian-core.ts appends markdown as an inert text node, same ceiling displayCardHybrid.test.ts (b) documents)', async () => {
		const card = await renderPantherHybrid();
		const band = bandHead(card, 'Signature Ability');
		expect(band).not.toBeNull();
		const body = band!.querySelector('.dse-card__body');
		expect(body).not.toBeNull();

		// KEPT: the fence + the signature ability's own name/prose.
		expect(body!.textContent).toContain('```ds-feature');
		expect(body!.textContent).toContain('Devastating Rush');
		expect(body!.textContent).toContain('feature_type: ability');

		// STRIPPED: the "##### Equipment" heading and its prose sentence — that
		// information is now shown STRUCTURALLY by the Equipment band above, so
		// showing it a second time here would be a duplicate.
		expect(body!.textContent).not.toContain('Equipment');
		expect(body!.textContent).not.toContain('You wear no armor and wield a heavy weapon.');

		// The intro paragraph (a near-duplicate of the frontmatter flavor) is NOT
		// stripped — only the headed Equipment/Kit Bonuses sections are — so the
		// flavor/body dedup guard (not the section-stripper) is what decides whether
		// it double-renders; assert that guard fired (no separate `.dse-card__flavor`
		// slot), same claim displayCardHybrid.test.ts (e) makes for the legacy branch.
		expect(card.querySelector(':scope > .dse-card__flavor')).toBeNull();
		expect(body!.textContent).toContain('good balance of protection');
	});

	test('the fence never actually recurses into a real [data-dse-element="feature"] card here (documented jest ceiling, not a bug)', async () => {
		const card = await renderPantherHybrid();
		const body = bandHead(card, 'Signature Ability')!.querySelector('.dse-card__body')!;
		expect(body.querySelector('[data-dse-element="feature"]')).toBeNull();
	});
});

describe('Plan 24 / SC-100 Task 3: non-kit families stay byte-identical across themes (no `.steel` composition of their own)', () => {
	test('ds-condition: inline DOM is byte-identical under legacy vs. steel (mirrors Task 2 contract (a) — regression proof that kit\'s new composition never leaks into a sibling family)', async () => {
		async function renderUnder(themeId: 'legacy' | 'steel'): Promise<string> {
			const host = inlineHost('ds-condition');
			const deps = makeInlineDeps();
			(deps.theme as unknown as { setActive: (t: string) => void }).setActive(themeId);
			await new ElementPipeline(deps).run(conditionElement, conditionExample, host);
			// innerHTML, not outerHTML (Task 2 contract (a)'s own convention): the ROOT
			// itself legitimately carries a different `data-dse-theme` stamp per theme —
			// that attribute isn't part of the "same DOM shape" claim being tested here.
			return (host.containerEl.firstElementChild as HTMLElement).innerHTML;
		}
		expect(await renderUnder('steel')).toBe(await renderUnder('legacy'));
	});
});
