// SC-191 impl spec §I slice 3 / §G — the cheat-sheet strip (StripView) and the foot rules
// guide (GuideView): two `kit/collapsible` regions, closed by default, session-persisted at
// `(blockKey, 'montage.strip')` / `(blockKey, 'montage.guide')` — never the note (spec §C:
// "UI state … goes to cx.session … and never to the note"). Drives the element through the
// REAL ElementPipeline, same convention as montage.test.ts / skills.test.ts.
//
// A NOTE ON THE RIDER COUNT the spec's own §G prose gets wrong: it says "the pip renders on
// exactly the six rider cells", but the CANONICAL source — spec §A's design freeze, which
// names `mock6.js`'s `STRIP6` constant as authoritative, and the book table it transcribes
// (Draw Steel Heroes:20471) — carries SEVEN: low (≤11) has two ("with a consequence" on
// Easy and Hard), mid (12-16) has one (Medium), high (17+) has one (Easy), and crit has
// three (all three, "success with a reward" at every difficulty on a nat 19-20). Counted
// directly off `mock6.js:545-578`'s `STRIP6.rows` — not a guess. This file asserts the
// number the canonical mock/book data actually produces (seven), matching StripView's own
// verbatim transcription; the discrepancy is reported to the ticket-owner rather than
// silently "corrected" by dropping a rider the book states.
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import type { SessionStore } from '../../../src/framework/session';
import type { RollService } from '../../../src/framework/roll/service';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { montageElement } from '../../../src/elements/montage/definition';
import { styleGuardFindings } from '../kit/styleGuard';
import montageMidYaml from '../../../src/elements/montage/fixture-mid.yaml';

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-montage', lineStart: 0, lineEnd: 12 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-montage::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Same convention as skills.test.ts's makeDeps(session): an optional SHARED SessionStore
 *  lets the cross-talk test drive two independent pipeline.run() calls against one store. */
function makeDeps(session: SessionStore = createSessionStore()): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const roll: RollService = { resolve: () => ({ total: 0, tier: 1 }) } as unknown as RollService;
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
		roll,
	};
}

async function renderMontage(hostOverrides: Partial<BlockHost> = {}, session?: SessionStore) {
	const pipeline = new ElementPipeline(makeDeps(session));
	const host = makeHost(hostOverrides);
	await pipeline.run(montageElement, montageMidYaml, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

/** A strip toggle triggers a FULL element rebuild (view.ts's onToggle -> `this.update()`,
 *  so the foot guide's dedup stays correct live — see the file header) — an async chain
 *  through `onMount`'s own `await this.buildBrief(...)`, fired-and-forgotten from the
 *  kit's synchronous click handler. A real macrotask tick flushes it; the guide's own
 *  toggle is synchronous, kit-only DOM (no onToggle wired), and needs no flush. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const stripHeader = (root: HTMLElement) => root.querySelector('.dse-mt__strip .dse-collapse__header') as HTMLButtonElement;
const stripRegion = (root: HTMLElement) => root.querySelector('.dse-mt__strip .dse-collapse__region') as HTMLElement;
const guideHeader = (root: HTMLElement) => root.querySelector('.dse-mt__guide .dse-collapse__header') as HTMLButtonElement;
const guideRegion = (root: HTMLElement) => root.querySelector('.dse-mt__guide .dse-collapse__region') as HTMLElement;
const tierRows = (root: HTMLElement) => Array.from(root.querySelectorAll('.dse-mt__tier-row:not(.dse-mt__tier-row--head)'));
const tierBadgeIn = (row: Element) => row.querySelector('.dse-mt__tier-key .dse-pr__badge') as HTMLElement;

describe('SC-191 slice 3: StripView + GuideView — closed by default, real disclosures', () => {
	test('both the strip and the guide render CLOSED by default: aria-expanded="false", region hidden, positioned brief-then-strip-then-board and outcome-band-then-guide', async () => {
		const { root } = await renderMontage();

		expect(stripHeader(root).getAttribute('aria-expanded')).toBe('false');
		expect(stripRegion(root).hidden).toBe(true);
		expect(guideHeader(root).getAttribute('aria-expanded')).toBe('false');
		expect(guideRegion(root).hidden).toBe(true);

		// Order in the DOM: brief, strip, board, outcome band, guide (spec §A "above the
		// table"; the guide sits at the card's foot).
		const regions = Array.from(root.querySelector('.dse-mt')!.children).map((el) => el.className);
		const briefIdx = regions.findIndex((c) => c.includes('dse-mt__brief'));
		const stripIdx = regions.findIndex((c) => c.includes('dse-collapse') && c.includes('dse-mt__strip'));
		const boardIdx = regions.findIndex((c) => c.includes('dse-mt__board-wrap'));
		const outcomeIdx = regions.findIndex((c) => c.includes('dse-mt__outcome'));
		const guideIdx = regions.findIndex((c) => c.includes('dse-collapse') && c.includes('dse-mt__guide'));
		expect(briefIdx).toBeGreaterThanOrEqual(0);
		expect(briefIdx).toBeLessThan(stripIdx);
		expect(stripIdx).toBeLessThan(boardIdx);
		expect(boardIdx).toBeLessThan(outcomeIdx);
		expect(outcomeIdx).toBeLessThan(guideIdx);
	});

	test('clicking the strip header opens it (aria-expanded true, region visible) and writes ONLY to SessionStore at (blockKey, "montage.strip") — never the note', async () => {
		const session = createSessionStore();
		const { host, root } = await renderMontage({}, session);

		stripHeader(root).click();
		await flush();

		expect(stripHeader(root).getAttribute('aria-expanded')).toBe('true');
		expect(stripRegion(root).hidden).toBe(false);
		expect(session.get<boolean>(host.blockKey(), 'montage.strip')).toBe(true);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('clicking the guide header opens it independently at (blockKey, "montage.guide") — the strip is unaffected', async () => {
		const session = createSessionStore();
		const { host, root } = await renderMontage({}, session);

		guideHeader(root).click();

		expect(guideHeader(root).getAttribute('aria-expanded')).toBe('true');
		expect(guideRegion(root).hidden).toBe(false);
		expect(session.get<boolean>(host.blockKey(), 'montage.guide')).toBe(true);
		expect(stripHeader(root).getAttribute('aria-expanded')).toBe('false');
		expect(host.replaceSource).not.toHaveBeenCalled();
	});

	test('the open state PERSISTS ACROSS A RE-RENDER via SessionPersist (same blockKey, fresh host)', async () => {
		const session = createSessionStore();
		const { root: rootA } = await renderMontage({}, session);
		stripHeader(rootA).click();
		await flush();

		const { root: rootB } = await renderMontage({}, session); // fresh pipeline.run, same session+blockKey
		expect(stripHeader(rootB).getAttribute('aria-expanded')).toBe('true');
		expect(stripRegion(rootB).hidden).toBe(false);
	});

	test('spec §C integrity probe 2, applied to session state: TWO ds-montage blocks keep independent strip/guide state under the SAME session store', async () => {
		const session = createSessionStore();
		const { root: rootA } = await renderMontage({ blockKey: () => 'Note.md::ds-montage::0' }, session);
		const { root: rootB } = await renderMontage({ blockKey: () => 'Note.md::ds-montage::1' }, session);

		stripHeader(rootA).click();
		await flush();

		expect(stripHeader(rootA).getAttribute('aria-expanded')).toBe('true');
		expect(stripHeader(rootB).getAttribute('aria-expanded')).toBe('false'); // untouched
	});

	// FIX ROUND 3 (review-2 H-1's dedup half): BOTH the full "Each test" table and the
	// pinned stub are now ALWAYS in the DOM (print needs the stub regardless of the
	// strip's screen pin state, since the strip itself now always prints its own full
	// table too — see GuideView.ts's file header) — CSS, keyed off
	// `.dse-mt__guide[data-strip-open]`, picks which one is visible on SCREEN. jsdom
	// computes no layout, so these tests assert the real signal (the attribute + which
	// block exists), not a `display` value jsdom can't compute anyway.
	test('a LIVE toggle of the strip rebuilds the element and flips data-strip-open immediately — the CSS dedup switch, not a DOM presence/absence', async () => {
		const { root } = await renderMontage();

		expect(root.querySelector('.dse-mt__guide')?.getAttribute('data-strip-open')).toBe('off');
		expect(root.querySelector('.dse-mt__guide-tiers-full')).not.toBeNull();
		const stub = root.querySelector('.dse-mt__guide-tiers-stub');
		expect(stub).not.toBeNull();
		expect(stub!.querySelector('.dse-mt__guide-title')?.textContent).toBe('Each test');
		expect(stub!.querySelector('.dse-mt__guide-lede')?.textContent).toBe('The full tier table is pinned above the board.');

		stripHeader(root).click(); // live toggle -> full element rebuild (view.ts's onToggle)
		await flush();

		expect(root.querySelector('.dse-mt__guide')?.getAttribute('data-strip-open')).toBe('on');
		// The strip's own toggle survives the rebuild (re-read from session at the top of onMount).
		expect(stripHeader(root).getAttribute('aria-expanded')).toBe('true');

		stripHeader(root).click(); // close again
		await flush();
		expect(root.querySelector('.dse-mt__guide')?.getAttribute('data-strip-open')).toBe('off');
	});

	test('the four tier rows carry the SHIPPED Power Roll badge classes and range strings, in book order (≤11 / 12-16 / 17+ / crit)', async () => {
		const { root } = await renderMontage();
		const rows = tierRows(root);
		expect(rows).toHaveLength(4);

		const expected: [string, string][] = [
			['t1', '≤11'],
			['t2', '12-16'],
			['t3', '17+'],
			['crit', 'crit'],
		];
		rows.forEach((row, i) => {
			const [mod, text] = expected[i];
			expect(row.getAttribute('data-tier')).toBe(['low', 'mid', 'high', 'crit'][i]);
			const badge = tierBadgeIn(row);
			expect(badge.classList.contains(`dse-pr__badge--${mod}`)).toBe(true);
			expect(badge.querySelector('.dse-pr__badge-text')?.textContent).toBe(text);
			// §J1: no local width/max-width override on the shipped badge itself.
			expect(badge.getAttribute('style')).toBeNull();
		});
	});

	test('the pip renders on exactly the seven rider cells the canonical mock/book data carries (not the spec §G prose\'s "six" — see file header), keyed off data-rider, never on a bare cell', async () => {
		const { root } = await renderMontage();
		const cells = Array.from(root.querySelectorAll('.dse-mt__tier-cell'));
		expect(cells).toHaveLength(12); // 4 tiers x 3 difficulties

		const pips = root.querySelectorAll('.dse-mt__tier-pip');
		expect(pips).toHaveLength(7);

		const withRider = cells.filter((c) => c.getAttribute('data-rider') !== 'none');
		expect(withRider).toHaveLength(7);
		for (const cell of withRider) {
			expect(cell.querySelector('.dse-mt__tier-pip')).not.toBeNull();
		}
		const withoutRider = cells.filter((c) => c.getAttribute('data-rider') === 'none');
		expect(withoutRider).toHaveLength(5);
		for (const cell of withoutRider) {
			expect(cell.querySelector('.dse-mt__tier-pip')).toBeNull();
		}

		// The crit row (round 6: "kept — the strip carries the whole book table") is all
		// reward, at every difficulty — 3 of the 7 riders.
		const critRow = tierRows(root)[3];
		const critRiders = Array.from(critRow.querySelectorAll('.dse-mt__tier-cell')).map((c) => c.getAttribute('data-rider'));
		expect(critRiders).toEqual(['reward', 'reward', 'reward']);
	});

	test('every cell states its rider in WORDS beside the pip ("with a reward" / "with a consequence") — colour is never the only channel (colourblind rule)', async () => {
		const { root } = await renderMontage();
		const rewardCell = root.querySelector('.dse-mt__tier-cell[data-rider="reward"]')!;
		expect(rewardCell.querySelector('.dse-mt__tier-word-rider')?.textContent).toBe('with a reward');
		const consequenceCell = root.querySelector('.dse-mt__tier-cell[data-rider="consequence"]')!;
		expect(consequenceCell.querySelector('.dse-mt__tier-word-rider')?.textContent).toBe('with a consequence');
		const bareCell = root.querySelector('.dse-mt__tier-cell[data-rider="none"]')!;
		expect(bareCell.querySelector('.dse-mt__tier-word-rider')).toBeNull();
	});

	test('the foot guide, closed strip: "Each test" states the full power-roll x difficulty table incl. the nat 19-20 row, plus "The montage" limits table and "At the table" bullets', async () => {
		const { root } = await renderMontage();
		guideHeader(root).click();

		// FIX ROUND 3: the pinned STUB also carries an "Each test" title now (always
		// built, see the file header above) — excluded here since this test is about
		// the FULL table specifically.
		const titles = Array.from(root.querySelectorAll('.dse-mt__guide-title'))
			.filter((el) => !el.closest('.dse-mt__guide-tiers-stub'))
			.map((el) => el.textContent);
		expect(titles).toEqual(['Each test', 'The montage', 'At the table']);

		const tiersTable = root.querySelectorAll('.dse-mt__guide-table')[0];
		const keyCells = Array.from(tiersTable.querySelectorAll('.dse-mt__guide-td[data-col="key"]')).map((el) => el.textContent);
		expect(keyCells).toEqual(['≤11', '12–16', '17+', 'nat 19–20']);

		expect(root.querySelectorAll('.dse-mt__guide-item')).toHaveLength(5);
	});

	test('keyboard/a11y: both disclosure headers are real, tab-reachable <button>s with a non-empty accessible name, and aria-expanded tracks state', async () => {
		const { root } = await renderMontage();
		for (const header of [stripHeader(root), guideHeader(root)]) {
			expect(header.tagName).toBe('BUTTON');
			expect(header.getAttribute('type')).toBe('button');
			expect(header.hasAttribute('disabled')).toBe(false);
			expect(header.textContent?.trim().length).toBeGreaterThan(0);
			expect(header.hasAttribute('aria-expanded')).toBe(true);
		}
	});

	test('source hygiene: StripView + GuideView pass the shared kit style guard (no inline color, no color literals)', () => {
		const files = ['../../../src/elements/montage/StripView.ts', '../../../src/elements/montage/GuideView.ts'];
		for (const file of files) {
			const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
			expect(styleGuardFindings(src)).toEqual([]);
		}
	});

	// FIX ROUND 3 (review-2 H-1/L-2) — the strip has NO print layout at all pre-fix (every
	// rule lives in the Steel skin tier, `:not([data-dse-print="on"])`), but print
	// force-opens every `kit/collapsible` regardless of screen pin state, so it printed as
	// an unlaid-out run-on blob. jsdom computes no real layout/cascade (no var(), no
	// specificity resolution), so — matching this codebase's own established convention
	// for print-scoped CSS contracts (e.g. `montage.test.ts`'s own "CSS contract" describe
	// block) — these are SOURCE-TEXT assertions against the montage print tier, not a
	// rendered-pixel check.
	describe('SC-191 fix round 3 (H-1/L-2): the strip prints as a laid-out tier table', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		// The montage print tier — every rule here is `[data-dse-print="on"]
		// [data-dse-element="montage"] …`, unscoped from the Steel skin tier the strip's
		// OWN rules live in (spec §E; the strip was correctly excluded from the three
		// named print-reaching exceptions on the wrong assumption it would never render
		// on paper — it does, force-opened).
		const printTier = sheet.slice(sheet.indexOf('Fix-round-1 H-2 — the montage\'s own PRINT tier'));

		test('the tier row gets an actual GRID layout under print — not display:block/grid-template-columns:none (H-1\'s own measured failure)', () => {
			expect(printTier).toMatch(/\[data-dse-print="on"\]\[data-dse-element="montage"\] \.dse-mt__tier-row \{[^}]*display:\s*grid;/);
			expect(printTier).toMatch(/\[data-dse-print="on"\]\[data-dse-element="montage"\] \.dse-mt__tier-row \{[^}]*grid-template-columns:/);
		});

		test('the seal and pip get real print geometry (position/border-radius/clip-path) — not a 0×0 static box', () => {
			expect(printTier).toMatch(/\.dse-mt__tier-seal \{[^}]*border-radius:\s*50%;/);
			expect(printTier).toMatch(/\.dse-mt__tier-pip \{[^}]*position:\s*absolute;/);
			expect(printTier).toContain("clip-path: polygon(50% 0, 100% 100%, 0 100%)");
			expect(printTier).toContain("clip-path: polygon(0 0, 100% 0, 50% 100%)");
		});

		test('the seal ink comes from the SAME meaning-bearing tokens the screen rule uses (--dse-turn-done/--dse-danger), which the D3 print scheme resolves to real darkened colour — never a Steel-only token like --dse-metal-line, which resolves to nothing under print', () => {
			expect(printTier).toMatch(/\.dse-mt__tier-seal\[data-kind='success'\] \{[^}]*var\(--dse-turn-done\)/);
			expect(printTier).toMatch(/\.dse-mt__tier-seal\[data-kind='failure'\] \{[^}]*var\(--dse-danger\)/);
			const pipFillRule = printTier.match(/\.dse-mt__tier-pip \{[^}]*\}/)?.[0] ?? '';
			expect(pipFillRule).not.toContain('--dse-metal-line');
		});

		// FIX ROUND 4 (re-review-2 M-A) — the print `::after` pip rule above supplies
		// clip-path geometry only; its fill (`var(--dse-vp)`) lives in the Steel skin tier
		// opened `:not([data-dse-print="on"])`, so it is print-EXCLUDED, not shared, and the
		// pip painted 0 gold pixels under print despite being correctly shaped and clipped.
		// The prior test above only asserted the ABSENCE of a Steel-only token — it passed
		// vacuously on a pip with no fill at all. This asserts the PRESENCE of one.
		test('M-A: the print ::after pip rule carries its own fill (var(--dse-vp)) — not just the absence of --dse-metal-line', () => {
			// `::after` appears twice in the print tier: once as the second selector of the
			// shared geometry rule (`::before, ::after { content/position/inset }`), and once
			// (post-fix) as its own dedicated rule carrying the fill. Match every `::after {…}`
			// block and require at least one to declare the fill — the shared geometry block
			// alone must NOT satisfy this.
			const afterRules = [...printTier.matchAll(/\.dse-mt__tier-pip::after \{([^}]*)\}/g)].map((m) => m[1]);
			expect(afterRules.some((body) => body.includes('background: var(--dse-vp);'))).toBe(true);
		});

		test('L-2: the strip\'s screen-only pin-state hint ("pinned" / "easy · medium · hard") is print-hidden — it means nothing on paper', () => {
			expect(printTier).toMatch(/\[data-dse-print="on"\]\[data-dse-element="montage"\] \.dse-mt__strip-hint \{\s*display:\s*none;/);
		});

		test('the dedup half: the guide\'s FULL "Each test" table is print-hidden and the STUB is print-shown, regardless of the strip\'s screen pin state — the strip now always prints its own full table too, so showing both would duplicate it on paper', () => {
			expect(printTier).toMatch(/\[data-dse-print="on"\]\[data-dse-element="montage"\] \.dse-mt__guide-tiers-full \{\s*display:\s*none;/);
			expect(printTier).toMatch(/\[data-dse-print="on"\]\[data-dse-element="montage"\] \.dse-mt__guide-tiers-stub \{\s*display:\s*block;/);
		});

		// FIX ROUND 3 (H-1 dedup, screen-side specificity fix): eyeballing the after-print
		// crop per the review-2 H-1 instruction caught a real bug jsdom's own source-text
		// contract couldn't — the SCREEN half of this same toggle used to live nested under
		// `.dse-mt`, which gave it MORE compound-selector weight than the flat print rule
		// above, so it silently won the cascade regardless of source order and left the
		// guide's "Each test" area entirely blank (neither table nor stub) whenever the
		// strip was not screen-pinned. The fix moves the screen half out flat, guarded with
		// `:not([data-dse-print="on"])` so it structurally cannot apply under print at all —
		// no specificity fight to win or lose.
		test('the dedup half, screen side: the toggle is flat and print-excluded, not nested under .dse-mt where it would out-specificity the print rule above', () => {
			expect(sheet).toMatch(
				/\[data-dse-element="montage"\]:not\(\[data-dse-print="on"\]\) \.dse-mt \.dse-mt__guide\[data-strip-open='off'\] \.dse-mt__guide-tiers-stub \{\s*display:\s*none;/,
			);
			expect(sheet).toMatch(
				/\[data-dse-element="montage"\]:not\(\[data-dse-print="on"\]\) \.dse-mt \.dse-mt__guide\[data-strip-open='on'\] \.dse-mt__guide-tiers-full \{\s*display:\s*none;/,
			);
			// And the old nested (buggy) form must be gone, not just supplemented.
			expect(sheet).not.toMatch(/\n\t\.dse-mt__guide\[data-strip-open='off'\] \.dse-mt__guide-tiers-stub \{/);
			expect(sheet).not.toMatch(/\n\t\.dse-mt__guide\[data-strip-open='on'\] \.dse-mt__guide-tiers-full \{/);
		});
	});

	test('fix round 3 (H-1 dedup, DOM half): both the full table and the pinned stub exist in the DOM regardless of the strip\'s screen state — CSS, not this DOM presence, is what picks between them', async () => {
		const { root: closed } = await renderMontage();
		expect(closed.querySelector('.dse-mt__guide-tiers-full')).not.toBeNull();
		expect(closed.querySelector('.dse-mt__guide-tiers-stub')).not.toBeNull();
		expect(closed.querySelector('.dse-mt__guide')?.getAttribute('data-strip-open')).toBe('off');

		const session = createSessionStore();
		const { root: pinned } = await renderMontage({}, session);
		stripHeader(pinned).click();
		await flush();
		const { root: pinnedRebuilt } = await renderMontage({}, session); // fresh mount reading the same session
		expect(pinnedRebuilt.querySelector('.dse-mt__guide-tiers-full')).not.toBeNull();
		expect(pinnedRebuilt.querySelector('.dse-mt__guide-tiers-stub')).not.toBeNull();
		expect(pinnedRebuilt.querySelector('.dse-mt__guide')?.getAttribute('data-strip-open')).toBe('on');
	});
});
