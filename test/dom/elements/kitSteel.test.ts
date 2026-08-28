// test/dom/elements/kitSteel.test.ts — Plan 24 / SC-100 Task 3: the Steel kit
// composition (kitLayout.steel, layouts.ts) rendered through DisplayCardView's
// renderSteel() branch (CardLayout.ts, Task 2's seam). Mirrors the site's
// `renderKitPlate` (kit_page.go) point-for-point (the plan's Design section):
// cardHead crest + kind eyebrow, boxed Equipment band, the 2x4 dash-aware stat-tile
// grid, and the kept (richer) signature-ability sub-render — inline mode through
// renderFeatureList, hybrid mode through the stripped source body.
//
// SC-144 — with the legacy theme dropped, the branch is a static property of the layout
// (`layout.steel` present => the composition), so this is no longer "the Steel-theme
// coverage" but simply the coverage of the ds-kit card, full stop: it is the only card
// with a composition, and it renders it unconditionally. displayFamily.test.ts /
// displayCardHybrid.test.ts, which used to pin `setActive('legacy')` to reach kit's base
// DOM, now exercise the base branch through steel-less clones of kitLayout.
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
import { kitElement, cultureElement } from '@/elements/display';
import kitExample from '@/elements/display/kit/example.yaml';
import cultureExample from '@/elements/display/culture/example.yaml';
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

// SC-120 Batch C §8 (Scott's ledger comment 1) — the empty-band-head guard's own positive
// test: a hybrid-mode note whose stripped body carries NO signature-ability content (no
// ```ds-feature fence, and every line lives under a stripped "Equipment"/"Kit Bonuses"
// heading) must render NO "Signature Ability" band-head at all — the defect this batch
// closes. Corpus-safe today (no tooling produces such a note), so this is a synthetic
// fixture, not a real md-dse file; homed here per the design doc's own instruction ("the
// existing by-SCC kit DOM suite is the right home").
describe("SC-120 Batch C §8: kit hybrid mode's empty-band-head guard", () => {
	const EMPTY_SIG_CODE = 'mcdm.heroes.v1/kit/empty-sig';
	const EMPTY_SIG_BODY = [
		'##### Equipment',
		'',
		'You wear no armor and carry no weapon.',
		'',
	].join('\n');
	const EMPTY_SIG_MD = [
		'---',
		'file_basename: empty-sig',
		'file_dpath: kit',
		'item_id: empty-sig',
		'item_name: Empty Sig',
		'name: Empty Sig',
		`scc: ${EMPTY_SIG_CODE}`,
		'source: mcdm.heroes.v1',
		'type: kit',
		'---',
		'',
		EMPTY_SIG_BODY,
	].join('\n');

	test('hybrid + empty stripped body ⇒ no .dse-card__band-head for Signature Ability (the ENTIRE body lives under the stripped "Equipment" heading, so stripKitBodySections leaves nothing)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		(vault as any).setFile(`${DEFAULT_SETTINGS.compendiumDestinationDirectory}/kit/empty-sig.md`, EMPTY_SIG_MD);
		const host = makeHost('ds-kit');
		await new ElementPipeline(deps).run(kitElement, `scc.v1:${EMPTY_SIG_CODE}`, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		const card = root.querySelector('.dse-card') as HTMLElement;

		// The card still mounts (cardHead + whatever bonus/equipment bands the frontmatter
		// supports) — only the Signature Ability band is suppressed.
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Empty Sig');
		const headTexts = Array.from(card.querySelectorAll('.dse-card__band-head')).map((el) => el.textContent);
		expect(headTexts).not.toContain('Signature Ability');
		expect(bandHead(card, 'Signature Ability')).toBeNull();
	});
});

describe('Plan 24 / SC-100 Task 3: kit\'s composition never leaks into a sibling family', () => {
	// Pre-SC-144 this compared ds-condition's inline DOM under 'legacy' vs 'steel'. With one
	// theme left that comparison is vacuous, but the claim underneath it is not: a family
	// with no `.steel` composition of its own must still get the base card frame, never any
	// part of kit's. Asserted directly against the DOM instead of against a theme flip.
	//
	// SC-120 Batch C: ds-condition gained its OWN Steel composition (a real cardHead of its
	// own), so it stopped being a clean "no composition at all" example — swapped for
	// ds-culture, still base-branch-only (Batch C's scope is ancestry/perk/condition/rule
	// only; culture is untouched, Batch B's problem).
	test('ds-culture: renders the base card frame — none of the kit composition\'s grammar', async () => {
		const host = inlineHost('ds-culture');
		await new ElementPipeline(makeInlineDeps()).run(cultureElement, cultureExample, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const card = root.querySelector('.dse-card') as HTMLElement;

		expect(card.querySelector('.dse-card__title')!.textContent).toBe('Urban');
		// The composition's own grammar: cardHead, crest, bands, stat tiles. None of it here.
		expect(card.querySelector('.dse-head')).toBeNull();
		expect(card.querySelector('.dse-crest')).toBeNull();
		expect(card.querySelector('.dse-card__band')).toBeNull();
		expect(card.querySelector('.dse-tiles__cell')).toBeNull();
	});
});
