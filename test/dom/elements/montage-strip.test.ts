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

	test('a LIVE toggle of the strip rebuilds the element so the foot guide dedups immediately: the guide\'s "Each test" block collapses to the pinned stub the instant the strip pins open, and restores when it closes again', async () => {
		const { root } = await renderMontage();

		// Closed strip: the guide's own "Each test" table is the full four-tier table.
		expect(root.querySelector('.dse-mt__guide-block[data-stub="on"]')).toBeNull();
		expect(root.querySelectorAll('.dse-mt__guide-table')).toHaveLength(2); // tiers + limits

		stripHeader(root).click(); // live toggle -> full element rebuild (view.ts's onToggle)
		await flush();

		const stub = root.querySelector('.dse-mt__guide-block[data-stub="on"]');
		expect(stub).not.toBeNull();
		expect(stub!.querySelector('.dse-mt__guide-title')?.textContent).toBe('Each test');
		expect(stub!.querySelector('.dse-mt__guide-lede')?.textContent).toBe('The full tier table is pinned above the board.');
		expect(root.querySelectorAll('.dse-mt__guide-table')).toHaveLength(1); // limits only — no orphan line (round 6: the strip already carries the crit row)
		// The strip's own toggle survives the rebuild (re-read from session at the top of onMount).
		expect(stripHeader(root).getAttribute('aria-expanded')).toBe('true');

		stripHeader(root).click(); // close again — the guide's full table returns
		await flush();
		expect(root.querySelector('.dse-mt__guide-block[data-stub="on"]')).toBeNull();
		expect(root.querySelectorAll('.dse-mt__guide-table')).toHaveLength(2);
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

		const titles = Array.from(root.querySelectorAll('.dse-mt__guide-title')).map((el) => el.textContent);
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
});
