// SC-438 — the montage tracker's combinatorial logic as tables (values x states x variants), driven through the REAL ElementPipeline
// with real clicks on the controls' `data-dse-control` ids and read back from the bytes the host is asked to write. The e2e specs
// (e2e/specs/montage/) then drive one plain scenario per manifest pair; this file holds the permutations that do not need a real
// browser. Scenario groups follow e2e/manifest/montage*.ts: O outcome band, B board, R action bar, C chrome panel, G strip + guide,
// L Log an action sheet, H Add a hero, S Set limits, X integrity of the note around the block.
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DseModal } from '../../../src/framework/kit/managedModal';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Notice, makeFakeContext, parseYaml } from '../../mocks/obsidian';
import { montageElement } from '../../../src/elements/montage/definition';
import { attachObsidianKeymap, pressEscape } from '../_obsidianKeymap';

// ----------------------------------------------------------------------------------------------------------------- harness

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_s: string) => true);
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Montage.md',
		containerEl,
		canPersist: true,
		addChild: (c: unknown) => c,
		getBlockInfo: () => ({ language: 'ds-montage', lineStart: 0, lineEnd: 40 }),
		replaceSource,
		blockKey: () => 'Montage.md::ds-montage::0',
		...overrides,
	};
	return host as unknown as BlockHost & { containerEl: HTMLElement; replaceSource: jest.Mock };
}

function makeDeps(app: App = new App(), plugin: Plugin = new Plugin(app)): ElementPipelineDeps {
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: { resolve: () => ({ total: 0, tier: 1 }) } as any,
	};
}

/** Mount `src` (fake timers: `flush()` lands the debounced write) and hand back the root plus readers for what was written. */
async function mount(src: string, overrides: Partial<BlockHost> = {}) {
	jest.useFakeTimers();
	const host = makeHost(overrides);
	await new ElementPipeline(makeDeps()).run(montageElement, src, host);
	const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	const writes = (): string[] => host.replaceSource.mock.calls.map((c) => c[0] as string);
	const last = (): any => parseYaml(writes()[writes().length - 1]);
	/** The CURRENT root: every write rebuilds the element in place, so a held `root` goes stale. */
	const live = (): HTMLElement => host.containerEl.firstElementChild as HTMLElement;
	return { host, root: live(), live, flush, writes, last };
}

/** The n-th node carrying a control id (throws when absent, so a missing control is a failure, not a silent no-op). */
const ctl = <T extends HTMLElement = HTMLElement>(root: Element, id: string, n = 0): T => {
	const el = root.querySelectorAll<T>(`[data-dse-control="${id}"]`)[n];
	if (!el) throw new Error(`no [data-dse-control="${id}"][${n}]`);
	return el;
};
const count = (root: Element, id: string): number => root.querySelectorAll(`[data-dse-control="${id}"]`).length;
const has = (root: Element, id: string): boolean => count(root, id) > 0;
const isDisabled = (el: HTMLElement): boolean => (el as HTMLButtonElement).disabled;
/** The content of the open modal that holds control `id` (the page holds at most one at a time in these tests). */
const modalOf = (id: string): HTMLElement => (ctl(document.body, id).closest('.modal-content') as HTMLElement);
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
};
const modalOpen = (id: string): boolean => has(document.body, id);
/** The title of the modal whose content element is `content` (the mock puts the title bar next to the content, not inside it). */
const titleOf = (content: HTMLElement): string | undefined => content.parentElement?.querySelector('.dse-modal__title-text')?.textContent ?? undefined;

/** Every `DseModal` opened while a test runs, so a test can hand the real keymap the open one. */
function captureModals(): DseModal[] {
	const opened: DseModal[] = [];
	const open = DseModal.prototype.open;
	jest.spyOn(DseModal.prototype, 'open').mockImplementation(function (this: DseModal) {
		opened.push(this);
		open.call(this);
	});
	return opened;
}

// The hand-written fixtures hold an unrecognised result on purpose: the model warns about it, which is not what is under test.
beforeEach(() => {
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
	document.body.innerHTML = '';
	Notice.notices.length = 0;
});

// A montage block as a table row: `skills` undefined = the hero has no `skills_used` key at all.
interface Hero {
	name: string;
	skills?: string[];
}
interface Entry {
	hero: string;
	round: number;
	result: string;
	skill?: string;
	note?: string;
}
interface Spec {
	title?: string;
	rounds?: number;
	sl?: number;
	fl?: number;
	successes?: number;
	failures?: number;
	round?: number;
	heroes?: Array<string | Hero>;
	entries?: Entry[];
}
const KIRA: Hero = { name: 'Kira', skills: [] };
const BRAM: Hero = { name: 'Bram', skills: [] };

/** The block body for `s`. Counters default to what `entries` add up to, so a row is coherent unless it says otherwise. */
function yaml(s: Spec): string {
	const entries = s.entries ?? [];
	const lines: string[] = [];
	if (s.title) lines.push(`title: ${s.title}`);
	lines.push(`rounds: ${s.rounds ?? 3}`, `success_limit: ${s.sl ?? 3}`, `failure_limit: ${s.fl ?? 2}`);
	lines.push(`successes: ${s.successes ?? entries.filter((e) => e.result === 'success').length}`);
	lines.push(`failures: ${s.failures ?? entries.filter((e) => e.result === 'failure').length}`);
	const heroes = (s.heroes ?? [KIRA, BRAM]).map((h) => (typeof h === 'string' ? { name: h, skills: [] as string[] } : h));
	if (heroes.length > 0) {
		lines.push('participants:');
		for (const h of heroes) {
			lines.push(`  - name: ${h.name}`);
			if (h.skills) lines.push(`    skills_used: [${h.skills.join(', ')}]`);
		}
	}
	if (entries.length > 0) {
		lines.push('entries:');
		for (const e of entries) {
			lines.push(`  - hero: ${e.hero}`, `    round: ${e.round}`, `    result: ${e.result}`);
			if (e.skill) lines.push(`    skill: ${e.skill}`);
			if (e.note) lines.push(`    note: ${JSON.stringify(e.note)}`);
		}
	}
	lines.push(`current_round: ${s.round ?? 1}`);
	return lines.join('\n');
}

const shown = (root: Element, sel: string): string | undefined => root.querySelector(sel)?.textContent ?? undefined;
const word = (root: Element): string | undefined => shown(root, '.dse-mt__verdict-word');
const slots = (root: Element, kind: 'success' | 'failure'): { total: number; filled: number } => {
	const all = Array.from(root.querySelectorAll(`.dse-mt__track[data-kind="${kind}"] .dse-mt__track-slot`));
	return { total: all.length, filled: all.filter((s) => s.getAttribute('data-filled') === 'on').length };
};
const tail = (root: Element, kind: 'success' | 'failure'): string | undefined => shown(root, `.dse-mt__prog[data-kind="${kind}"] .dse-mt__prog-tail`);
const cellOf = (root: Element, hero: string, round: number): HTMLElement =>
	root.querySelector(`.dse-mt__cell[data-hero="${hero}"][data-round="${round}"]`) as HTMLElement;
/** One letter per round: C a `montage.cell`, S the open socket, - no id at all. */
const rowCodes = (root: Element, hero: string, rounds: number): string =>
	Array.from({ length: rounds }, (_v, i) => {
		const id = cellOf(root, hero, i + 1).getAttribute('data-dse-control');
		return id === 'montage.cell' ? 'C' : id === 'montage.cell.socket' ? 'S' : id === null ? '-' : '?';
	}).join('');
const barIds = (root: Element): string[] =>
	Array.from(root.querySelectorAll('.dse-mt__actionrow [data-dse-control]')).map((el) => el.getAttribute('data-dse-control') as string);
const tallyOf = (root: Element, hero: string): string =>
	['success', 'failure'].map((k) => root.querySelector(`.dse-mt__board-total[data-hero="${hero}"] .dse-mt__tally[data-kind="${k}"] .dse-mt__tally-n`)?.textContent).join('/');

// ------------------------------------------------------------------------------------------------- O. the outcome band

describe('[O] the outcome band: successes x failures x limits x round progress', () => {
	// successes, failures, success limit, failure limit, round, rounds, then what the band says
	const ROWS: Array<[string, Spec, Record<string, unknown>]> = [
		['[O01] nothing logged yet', { sl: 3, fl: 2, round: 1 }, { band: 'pending', word: 'Not started', ok: [0, 3], bad: [0, 2], tails: ['3 from Total Success', '2 more end it'], complete: false, chip: 'Round 1 / 3' }],
		['[O02] a lead of two with a round to spare is a partial success if it ended now', { sl: 3, fl: 2, successes: 2, failures: 0, round: 2 }, { band: 'partial', word: 'Partial Success', ok: [2, 3], bad: [0, 2], tails: ['1 from Total Success', '2 more end it'], complete: false, brink: true, chip: 'Round 2 / 3' }],
		['[O03] a one-point lead is still a total failure if it ended now', { sl: 5, fl: 3, successes: 2, failures: 1, round: 2 }, { band: 'failure', word: 'Total Failure', ok: [2, 5], bad: [1, 3], tails: ['3 from Total Success', '2 more end it'], complete: false, brink: false, chip: 'Round 2 / 3' }],
		['[O04] the success limit reached ends the montage with a total success', { sl: 3, fl: 2, successes: 3, failures: 0, round: 1 }, { band: 'total', word: 'Total Success', ok: [3, 3], bad: [0, 2], tails: ['the success limit, reached', '2 under the failure limit'], complete: true, chip: 'Complete', eyebrow: 'Final result' }],
		['[O05] the failure limit reached ends the montage with a total failure', { sl: 3, fl: 2, successes: 0, failures: 2, round: 1 }, { band: 'failure', word: 'Total Failure', ok: [0, 3], bad: [2, 2], tails: ['3 short of the success limit', 'the failure limit, reached'], complete: true, chip: 'Complete', eyebrow: 'Final result' }],
		['[O06] past the success limit (hand-edited): the track stays at its limit', { sl: 3, fl: 2, successes: 4, failures: 0, round: 1 }, { band: 'total', word: 'Total Success', ok: [3, 3], bad: [0, 2], tails: ['the success limit, reached', '2 under the failure limit'], complete: true, chip: 'Complete' }],
		['[O07] past the failure limit (hand-edited): the track stays at its limit', { sl: 3, fl: 2, successes: 0, failures: 5, round: 1 }, { band: 'failure', word: 'Total Failure', ok: [0, 3], bad: [2, 2], tails: ['3 short of the success limit', 'the failure limit, reached'], complete: true, chip: 'Complete' }],
		['[O08] no limits set: no track, "no limit set", never complete by a tally', { sl: 0, fl: 0, successes: 2, failures: 1, round: 1 }, { band: 'failure', word: 'Total Failure', ok: null, bad: null, tails: ['no success limit set', 'no failure limit set'], complete: false, chip: 'Round 1 / 3' }],
		['[O09] out of rounds with a one-point lead: complete, a total failure, three rounds used', { sl: 5, fl: 5, successes: 2, failures: 1, round: 4 }, { band: 'failure', word: 'Total Failure', ok: [2, 5], bad: [1, 5], tails: ['3 short of the success limit', '4 under the failure limit'], complete: true, chip: 'Complete', used: '3' }],
		['[O10] out of rounds with a lead of two: complete, a partial success', { sl: 5, fl: 5, successes: 3, failures: 1, round: 4 }, { band: 'partial', word: 'Partial Success', ok: [3, 5], bad: [1, 5], tails: ['2 short of the success limit', '4 under the failure limit'], complete: true, chip: 'Complete', used: '3', rule: 'Partial Success awards 1 Victory on a moderate or hard montage.' }],
		['[O11] the failure limit with a lead of two is a complete partial success', { sl: 6, fl: 3, successes: 5, failures: 3, round: 2 }, { band: 'partial', word: 'Partial Success', ok: [5, 6], bad: [3, 3], tails: ['1 short of the success limit', 'the failure limit, reached'], complete: true, chip: 'Complete', rule: 'Partial Success awards 1 Victory on a moderate or hard montage.' }],
		['[O12] the live rule line states the current margin', { sl: 6, fl: 4, successes: 1, failures: 3, round: 2 }, { band: 'failure', word: 'Total Failure', complete: false, rule: 'Partial Success needs successes to lead failures by 2 — currently -2.' }],
		['[O13] a total success states the Victory rule of a total success', { sl: 1, fl: 2, successes: 1, failures: 0, round: 1 }, { band: 'total', complete: true, rule: 'Total Success awards 1 Victory on an easy or moderate montage, 2 on a hard one.' }],
		['[O14] a total failure states that no Victory is awarded', { sl: 3, fl: 1, successes: 0, failures: 1, round: 1 }, { band: 'failure', complete: true, rule: 'Total Failure — no Victories awarded.' }],
	];

	test.each(ROWS)('%s', async (_name, spec, want) => {
		const { root } = await mount(yaml(spec));
		const band = root.querySelector('.dse-mt__outcome') as HTMLElement;
		expect(band.getAttribute('data-band')).toBe(want.band);
		if (want.word) expect(word(root)).toBe(want.word);
		if (want.complete !== undefined) expect(root.querySelector('.dse-mt__actionrow')!.getAttribute('data-complete')).toBe(want.complete ? 'on' : 'off');
		if (want.chip) expect(shown(root, '.dse-head__eyebrow--right')).toBe(want.chip);
		if (want.eyebrow) expect(shown(root, '.dse-mt__verdict-eyebrow')).toBe(want.eyebrow);
		if (want.tails) expect([tail(root, 'success'), tail(root, 'failure')]).toEqual(want.tails);
		if (want.ok) expect(slots(root, 'success')).toEqual({ total: (want.ok as number[])[1], filled: (want.ok as number[])[0] });
		if (want.bad) expect(slots(root, 'failure')).toEqual({ total: (want.bad as number[])[1], filled: (want.bad as number[])[0] });
		if (want.ok === null) expect(root.querySelectorAll('.dse-mt__track-empty')).toHaveLength(2);
		if (want.brink !== undefined) expect(band.getAttribute('data-brink')).toBe(want.brink ? 'on' : 'off');
		if (want.used) expect(shown(root, '.dse-mt__stat-value')).toBe(want.used);
		if (want.rule) expect(shown(root, '.dse-mt__verdict-rule')).toBe(want.rule);
	});

	test('[O15] the hero-actions-left count: rounds left x heroes, minus the actions already taken from the round in play on', async () => {
		const spec: Spec = { sl: 9, fl: 9, round: 2, entries: [{ hero: 'Kira', round: 1, result: 'success' }, { hero: 'Kira', round: 2, result: 'failure' }] };
		const { root } = await mount(yaml(spec)); // rounds 2..3 x 2 heroes = 4, Kira has acted in round 2
		expect(shown(root, '.dse-mt__stat-value')).toBe('3');
		expect(shown(root, '.dse-mt__stat-label')).toBe('hero actions left');
	});

	test('[O16] the notes list: only entries with a note, ordered by round then board order, each with its glyph, hero, skill and text', async () => {
		const { root } = await mount(
			yaml({
				sl: 9,
				fl: 9,
				round: 3,
				entries: [
					{ hero: 'Bram', round: 2, result: 'failure', skill: 'Lift', note: 'Dropped the cask.' },
					{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' },
					{ hero: 'Bram', round: 1, result: 'assist', note: 'Held the rope.' },
					{ hero: 'Kira', round: 2, result: 'success', skill: 'Insight', note: 'Found the pass.' },
				],
			}),
		);
		const notes = Array.from(root.querySelectorAll('.dse-mt__note')).map((li) => [
			li.getAttribute('data-kind'),
			li.querySelector('.dse-mt__note-hero')!.textContent,
			li.querySelector('.dse-mt__note-where')!.textContent,
			li.querySelector('.dse-mt__note-text')!.textContent,
		]);
		expect(notes).toEqual([
			['assist', 'Bram', 'round 1', 'Held the rope.'],
			['success', 'Kira', 'round 2 · insight', 'Found the pass.'],
			['failure', 'Bram', 'round 2 · lift', 'Dropped the cask.'],
		]);
		const none = await mount(yaml({ round: 1 }));
		expect(none.live().querySelector('.dse-mt__notes')).toBeNull();
	});
});

// ------------------------------------------------------------------------------------------------------ B. the board

describe('[B] the board: round progress x entries x heroes', () => {
	const GRID: Spec = {
		rounds: 3,
		sl: 9,
		fl: 9,
		entries: [
			{ hero: 'Kira', round: 1, result: 'success' },
			{ hero: 'Bram', round: 1, result: 'failure' },
			{ hero: 'Bram', round: 2, result: 'assist' },
		],
	};

	test.each([
		// round in play, Kira's cells, Bram's cells (C a cell, S the open socket, - no id)
		['[B01] round 1 in play: both heroes have acted, an entry in a coming round is still a cell', { ...GRID, round: 1 }, 'C--', 'CC-'],
		['[B02] round 2 in play: Kira\'s empty cell is the open socket', { ...GRID, round: 2 }, 'CS-', 'CC-'],
		['[B03] round 3 in play: Kira\'s empty past cell is a cell, round 3 the socket', { ...GRID, round: 3 }, 'CCS', 'CCS'],
		['[B04] rounds exhausted: complete, only a filled cell stays one (no past-empty cell, no socket)', { ...GRID, round: 4 }, 'C--', 'CC-'],
		['[B05] the success limit reached: complete, the same shape', { ...GRID, sl: 1, round: 2 }, 'C--', 'CC-'],
	])('%s', async (_name, spec, kira, bram) => {
		const { root } = await mount(yaml(spec as Spec));
		expect(rowCodes(root, 'Kira', 3)).toBe(kira);
		expect(rowCodes(root, 'Bram', 3)).toBe(bram);
		// one socket carries one quick trio; the trio exists nowhere else
		const sockets = count(root, 'montage.cell.socket');
		for (const kind of ['success', 'failure', 'assist']) expect(count(root, `montage.quick.${kind}`)).toBe(sockets);
	});

	test('[B06] the Heroes column and the tallies: one row per hero, a tally per hero from ITS OWN entries', async () => {
		const { root } = await mount(yaml({ ...GRID, round: 3 }));
		expect(Array.from(root.querySelectorAll('.dse-mt__board-who')).map((e) => e.textContent)).toEqual(['Kira', 'Bram']);
		expect(tallyOf(root, 'Kira')).toBe('1/0');
		expect(tallyOf(root, 'Bram')).toBe('0/1');
		expect(root.querySelector('.dse-mt__board-total[data-hero="Bram"]')!.getAttribute('aria-label')).toBe('Bram: 0 successes, 1 failure');
		expect(shown(root, '.dse-head__deck--left')).toBe('2 heroes · one action each per round');
	});

	test.each([
		['[B07] no heroes: the board says so, and no per-hero control exists', { heroes: [] as Hero[], round: 1 }],
	])('%s', async (_name, spec) => {
		const { root } = await mount(yaml(spec as Spec));
		expect(shown(root, '.dse-mt__board-empty')).toBe('No heroes yet — add one from the montage menu.');
		for (const id of ['montage.board.row-act', 'montage.cell', 'montage.cell.socket', 'montage.quick.success']) expect(has(root, id)).toBe(false);
		expect(has(root, 'montage.board.add-hero')).toBe(true);
		expect(shown(root, '.dse-head__deck--left')).toBe('0 heroes · one action each per round');
		expect(isDisabled(ctl(root, 'montage.bar.log'))).toBe(true); // nobody to pre-fill
	});

	test.each([
		['has a skills list', { name: 'Kira', skills: ['Nature'] }],
		['has an empty skills list', { name: 'Kira', skills: [] as string[] }],
		['has no skills key at all', { name: 'Kira' }],
	])('[B08] a hero who %s: a quick log writes the entry and the board is rebuilt with the cell filled', async (_name, hero) => {
		const { live, flush, last } = await mount(yaml({ heroes: [hero as Hero], round: 1 }));
		ctl(live(), 'montage.quick.success').click();
		await flush();
		expect(last().entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect(cellOf(live(), 'Kira', 1).getAttribute('data-kind')).toBe('success');
		expect(rowCodes(live(), 'Kira', 3)).toBe('C--');
	});

	test.each([
		// the quick button, then what the write adds: successes, failures
		['success', 1, 0],
		['failure', 0, 1],
		['assist', 0, 0],
	])('[B09] the %s quick button writes {hero, round, result} only: tally +%i / +%i, no skill, no note, skills untouched, one write', async (kind, plusS, plusF) => {
		const { live, flush, writes, last } = await mount(yaml({ heroes: [{ name: 'Kira', skills: ['Nature'] }, BRAM], sl: 9, fl: 9, round: 2, successes: 4, failures: 4 }));
		ctl(live(), `montage.quick.${kind}`, 1).click(); // the second hero's trio
		await flush();
		expect(writes()).toHaveLength(1);
		const data = last();
		expect(data.entries).toEqual([{ hero: 'Bram', round: 2, result: kind }]);
		expect([data.successes, data.failures]).toEqual([4 + plusS, 4 + plusF]);
		expect(data.participants[0].skills_used).toEqual(['Nature']);
		expect(data.participants[1].skills_used).toEqual([]);
		expect(modalOpen('montage.log.submit')).toBe(false); // a quick tap opens no sheet
	});

	test('[B10] a click on the socket outside the trio opens the new sheet for that hero and round; a trio button does not (it stops the click)', async () => {
		const { root } = await mount(yaml({ round: 2, sl: 9, fl: 9 }));
		ctl(root, 'montage.cell.socket', 1).click();
		const sheet = modalOf('montage.log.submit');
		expect(titleOf(sheet)).toBe('Bram · round 2');
	});

	test.each([
		['a live montage, nothing in the round yet', { round: 1 }, 'new', 'Kira · round 1', false],
		['the hero has acted in the round in play: the button edits that entry', { round: 1, entries: [{ hero: 'Kira', round: 1, result: 'failure' }] }, 'edit', 'Kira · round 1', false],
		['a complete montage: the row button is real-disabled', { round: 1, sl: 1, entries: [{ hero: 'Kira', round: 1, result: 'success' }] }, 'none', '', true],
	])('[B11] "Log an action for Kira": %s', async (_name, spec, mode, title, disabled) => {
		const { root, writes } = await mount(yaml(spec as Spec));
		const button = ctl(root, 'montage.board.row-act', 0);
		expect(isDisabled(button)).toBe(disabled);
		expect(button.getAttribute('aria-label')).toBe('Log an action for Kira');
		button.click();
		if (mode === 'none') {
			expect(modalOpen('montage.log.submit')).toBe(false);
		} else {
			const sheet = modalOf('montage.log.submit');
			expect(titleOf(sheet)).toBe(title);
			expect(sheet.querySelector('.dse-mt__sheet-eyebrow')!.textContent).toBe(mode === 'new' ? 'Log an action' : 'Correct');
			expect(has(sheet, 'montage.log.remove')).toBe(mode === 'edit');
		}
		expect(writes()).toHaveLength(0);
	});

	test.each([
		['click', (el: HTMLElement) => el.click(), true],
		['Enter', (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })), true],
		['Space', (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })), true],
		['Ctrl+Enter', (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })), false],
		['another key (a)', (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })), false],
		['a held Enter (repeat)', (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })), false],
	])('[B12] %s on a filled cell: opens its edit sheet = %s', async (_name, act, opens) => {
		const { root } = await mount(yaml({ round: 2, entries: [{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }] }));
		act(ctl(root, 'montage.cell', 0));
		expect(modalOpen('montage.log.submit')).toBe(opens);
		if (opens) expect(modalOf('montage.log.submit').querySelector('.dse-mt__sheet-eyebrow')!.textContent).toBe('Correct');
	});

	test('[B13] a past empty cell opens a NEW sheet for its own round, and the sheet says the round is already played', async () => {
		const { root } = await mount(yaml({ round: 3, sl: 9, fl: 9 }));
		ctl(root, 'montage.cell', 0).click(); // Kira round 1
		const sheet = modalOf('montage.log.submit');
		expect(titleOf(sheet)).toBe('Kira · round 1');
		expect(sheet.querySelector('.dse-mt__sheet-sub')!.textContent).toBe('a round already played');
	});

	test('[B14] a cell with an unrecognised result is a cell that edits, with the entry shown as unrecorded and not tallied on the board', async () => {
		const { root } = await mount(yaml({ round: 2, successes: 0, entries: [{ hero: 'Kira', round: 1, result: 'dodged' }] }));
		const cell = cellOf(root, 'Kira', 1);
		expect(cell.getAttribute('data-kind')).toBe('none');
		expect(cell.getAttribute('aria-label')).toBe('Kira, round 1: unrecognised result "dodged" — edit');
		expect(cell.getAttribute('data-dse-control')).toBe('montage.cell');
		expect(tallyOf(root, 'Kira')).toBe('0/0');
	});

	test('[B15] the board header "+" opens Add a hero', async () => {
		const { root, writes } = await mount(yaml({ round: 1 }));
		ctl(root, 'montage.board.add-hero').click();
		expect(modalOpen('montage.add-hero.submit')).toBe(true);
		expect(writes()).toHaveLength(0);
	});

	test('[B16] a read-only host (canvas): every control is a real-disabled stub or an aria-disabled cell, no socket listens, nothing writes', async () => {
		const { root, writes, flush } = await mount(yaml({ round: 2, entries: [{ hero: 'Kira', round: 1, result: 'success' }] }), { canPersist: false });
		for (const id of ['montage.board.add-hero', 'montage.board.row-act', 'montage.quick.success', 'montage.quick.failure', 'montage.quick.assist', 'montage.bar.log', 'montage.bar.undo', 'montage.bar.end-round']) {
			expect(isDisabled(ctl(root, id))).toBe(true);
			ctl(root, id).click();
		}
		const cell = ctl(root, 'montage.cell', 0);
		expect(cell.getAttribute('aria-disabled')).toBe('true');
		cell.click();
		cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		await flush();
		expect(modalOpen('montage.log.submit')).toBe(false);
		expect(writes()).toHaveLength(0);
	});
});

// -------------------------------------------------------------------------------------------------- R. the action bar

describe('[R] the action bar: state x which buttons exist x which are disabled, then what each one writes', () => {
	const ACTED: Spec = { round: 1, sl: 5, fl: 5, entries: [{ hero: 'Kira', round: 1, result: 'success' }, { hero: 'Bram', round: 1, result: 'failure' }] };
	const EXHAUSTED: Spec = { rounds: 2, sl: 5, fl: 5, round: 3, entries: [{ hero: 'Kira', round: 1, result: 'success' }, { hero: 'Kira', round: 2, result: 'success' }] };

	test.each([
		// state, its bar (id: disabled?)
		['[R01] fresh: Log enabled, Undo disabled, End round 1, no Back', { round: 1 }, { 'montage.bar.log': false, 'montage.bar.undo': true, 'montage.bar.end-round': false }],
		['[R02] round 2 with entries: Back to round 1 appears before End round 2', { round: 2, sl: 9, fl: 9, entries: [{ hero: 'Kira', round: 1, result: 'success' }] }, { 'montage.bar.log': false, 'montage.bar.undo': false, 'montage.bar.back': false, 'montage.bar.end-round': false }],
		['[R03] every hero has acted in the round in play: Log is disabled, the rest live', ACTED, { 'montage.bar.log': true, 'montage.bar.undo': false, 'montage.bar.end-round': false }],
		['[R04] no heroes: Log and Undo disabled, End round still live', { heroes: [], round: 1 }, { 'montage.bar.log': true, 'montage.bar.undo': true, 'montage.bar.end-round': false }],
		['[R05] complete by a limit: Undo and Clear all, no Back, no Reopen', { round: 2, sl: 1, entries: [{ hero: 'Kira', round: 1, result: 'success' }] }, { 'montage.bar.undo': false, 'montage.bar.clear-all': false }],
		['[R06] complete by the failure limit: the same bar', { round: 2, fl: 1, entries: [{ hero: 'Kira', round: 1, result: 'failure' }] }, { 'montage.bar.undo': false, 'montage.bar.clear-all': false }],
		['[R07] out of rounds with limits unmet: Undo, Back to round 2, Reopen, Clear all', EXHAUSTED, { 'montage.bar.undo': false, 'montage.bar.back': false, 'montage.bar.reopen': false, 'montage.bar.clear-all': false }],
	])('%s', async (_name, spec, bar) => {
		const { root } = await mount(yaml(spec as Spec));
		const expected = Object.keys(bar);
		expect(barIds(root)).toEqual(expected);
		for (const id of expected) expect(isDisabled(ctl(root, id))).toBe(bar[id as keyof typeof bar]);
	});

	test('[R08] the labels carry the round they act on', async () => {
		const live = await mount(yaml({ round: 3, sl: 9, fl: 9, entries: [{ hero: 'Kira', round: 1, result: 'success' }] }));
		expect(ctl(live.root, 'montage.bar.end-round').getAttribute('aria-label')).toBe('End round 3');
		expect(ctl(live.root, 'montage.bar.back').getAttribute('aria-label')).toBe('Back to round 2');
		document.body.innerHTML = '';
		const done = await mount(yaml(EXHAUSTED));
		expect(ctl(done.root, 'montage.bar.back').getAttribute('aria-label')).toBe('Back to round 2'); // the last round, not the one that never happened
	});

	test('[R09] "Log an action..." opens the sheet for the first hero yet to act, and only that hero', async () => {
		const { root } = await mount(yaml({ round: 1, sl: 9, fl: 9, entries: [{ hero: 'Kira', round: 1, result: 'success' }] }));
		ctl(root, 'montage.bar.log').click();
		expect(titleOf(modalOf('montage.log.submit'))).toBe('Bram · round 1');
	});

	test('[R10] a disabled button never acts: clicking Log (all acted), Undo (empty) writes nothing and opens nothing', async () => {
		const acted = await mount(yaml(ACTED));
		ctl(acted.root, 'montage.bar.log').click();
		expect(modalOpen('montage.log.submit')).toBe(false);
		await acted.flush();
		expect(acted.writes()).toHaveLength(0);
		document.body.innerHTML = '';
		const fresh = await mount(yaml({ round: 1 }));
		ctl(fresh.root, 'montage.bar.undo').click();
		await fresh.flush();
		expect(fresh.writes()).toHaveLength(0);
	});

	test.each([
		// the last entry, then what Undo does to the tallies and the hero's skills
		['a success with a skill', { hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }, { successes: 0, failures: 0, kira: [] as string[] }],
		['a failure with a skill', { hero: 'Kira', round: 1, result: 'failure', skill: 'Nature' }, { successes: 0, failures: 0, kira: [] as string[] }],
		['an assist (not tallied) with a skill', { hero: 'Kira', round: 1, result: 'assist', skill: 'Nature' }, { successes: 0, failures: 0, kira: [] as string[] }],
		['a success with no skill', { hero: 'Kira', round: 1, result: 'success' }, { successes: 0, failures: 0, kira: ['Nature'] }],
	])('[R11] Undo removes %s: tally and skill are given back, the entry list empties, one write', async (_name, entry, want) => {
		const successes = entry.result === 'success' ? 1 : 0;
		const failures = entry.result === 'failure' ? 1 : 0;
		const { live, flush, writes, last } = await mount(yaml({ heroes: [{ name: 'Kira', skills: ['Nature'] }], sl: 9, fl: 9, successes, failures, entries: [entry] }));
		ctl(live(), 'montage.bar.undo').click();
		await flush();
		expect(writes()).toHaveLength(1);
		const data = last();
		expect([data.successes, data.failures]).toEqual([want.successes, want.failures]);
		expect(data.entries).toBeUndefined();
		expect(data.participants[0].skills_used).toEqual(want.kira);
		expect(isDisabled(ctl(live(), 'montage.bar.undo'))).toBe(true); // nothing left to undo
	});

	test('[R12] Undo takes the LAST entry of the list, one per click, across heroes and rounds', async () => {
		const { live, flush, last } = await mount(
			yaml({ round: 2, sl: 9, fl: 9, entries: [{ hero: 'Kira', round: 1, result: 'success' }, { hero: 'Bram', round: 1, result: 'failure' }, { hero: 'Kira', round: 2, result: 'success' }] }),
		);
		ctl(live(), 'montage.bar.undo').click();
		await flush();
		expect(last().entries.map((e: Entry) => `${e.hero}${e.round}`)).toEqual(['Kira1', 'Bram1']);
		ctl(live(), 'montage.bar.undo').click();
		await flush();
		expect(last().entries.map((e: Entry) => `${e.hero}${e.round}`)).toEqual(['Kira1']);
		expect([last().successes, last().failures]).toEqual([1, 0]);
	});

	test.each([
		['mid-montage', { round: 1, sl: 9, fl: 9 }, 2, false],
		['on the last round: the montage ends with the round', { rounds: 2, round: 2, sl: 9, fl: 9 }, 3, true],
	])('[R13] End round %s: current_round goes to %i, complete = %s, nothing else changes', async (_name, spec, round, complete) => {
		const { live, flush, writes, last } = await mount(yaml({ ...(spec as Spec), entries: [{ hero: 'Kira', round: (spec as Spec).round!, result: 'success' }] }));
		ctl(live(), 'montage.bar.end-round').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last().current_round).toBe(round);
		expect(last().entries).toHaveLength(1);
		expect([last().successes, last().failures]).toEqual([1, 0]);
		expect(live().querySelector('.dse-mt__actionrow')!.getAttribute('data-complete')).toBe(complete ? 'on' : 'off');
	});

	test.each([
		['live, round 3', { round: 3, sl: 9, fl: 9 }, 2],
		['live, round 2', { round: 2, sl: 9, fl: 9 }, 1],
		['out of rounds (round 3 of 2) goes back to the LAST round, 2', EXHAUSTED, 2],
	])('[R14] Back to round: %s -> %i, entries and tallies untouched', async (_name, spec, round) => {
		const { live, flush, last } = await mount(yaml({ entries: [{ hero: 'Kira', round: 1, result: 'success' }], ...(spec as Spec) }));
		const before = (spec as Spec).entries ?? [{ hero: 'Kira', round: 1, result: 'success' }];
		ctl(live(), 'montage.bar.back').click();
		await flush();
		expect(last().current_round).toBe(round);
		expect(last().entries).toHaveLength(before.length);
		expect(live().querySelector('.dse-mt__actionrow')!.getAttribute('data-complete')).toBe('off');
	});

	test('[R15] Reopen on an out-of-rounds montage adds one round and puts the play on it', async () => {
		const { live, flush, writes, last } = await mount(yaml(EXHAUSTED));
		ctl(live(), 'montage.bar.reopen').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last().rounds).toBe(3);
		expect(last().current_round).toBe(3);
		expect(shown(live(), '.dse-head__eyebrow--right')).toBe('Round 3 / 3');
		expect(has(live(), 'montage.bar.reopen')).toBe(false);
	});

	test('[R16] Clear all on a complete montage zeroes the progress and keeps the config, with a Notice', async () => {
		const { live, flush, last } = await mount(
			yaml({ title: 'Keep Me', rounds: 4, sl: 1, fl: 2, round: 2, heroes: [{ name: 'Kira', skills: ['Nature'] }], entries: [{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }] }),
		);
		ctl(live(), 'montage.bar.clear-all').click();
		await flush();
		const data = last();
		expect(data).toEqual({ title: 'Keep Me', rounds: 4, success_limit: 1, failure_limit: 2, successes: 0, failures: 0, participants: [{ name: 'Kira', skills_used: [] }], current_round: 1 });
		expect(Notice.notices).toEqual(['Montage progress cleared']);
	});
});

// -------------------------------------------------------------------------------------------------- C. the chrome panel

describe('[C] the chrome panel items', () => {
	test('[C01] Add a round: one more round column and a write, the position and the entries stay', async () => {
		const { live, flush, writes, last } = await mount(yaml({ round: 2, entries: [{ hero: 'Kira', round: 1, result: 'success' }] }));
		ctl(live(), 'montage.chrome.add-round').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect([last().rounds, last().current_round, last().entries.length]).toEqual([4, 2, 1]);
		expect(live().querySelectorAll('.dse-mt__board-rhead')).toHaveLength(4);
		expect(shown(live(), '.dse-head__eyebrow--right')).toBe('Round 2 / 4');
	});

	test('[C02] Add a round on an out-of-rounds montage makes it live again (the play lands on the new round)', async () => {
		const { live, flush } = await mount(yaml({ rounds: 2, round: 3, sl: 9, fl: 9, entries: [{ hero: 'Kira', round: 1, result: 'success' }] }));
		expect(live().querySelector('.dse-mt__actionrow')!.getAttribute('data-complete')).toBe('on');
		ctl(live(), 'montage.chrome.add-round').click();
		await flush();
		expect(live().querySelector('.dse-mt__actionrow')!.getAttribute('data-complete')).toBe('off');
	});

	test('[C03] Reset progress: successes, failures, round, entries and every hero\'s skills go, the title, limits, rounds and roster stay, with a Notice', async () => {
		const { live, flush, writes, last } = await mount(
			yaml({ title: 'T', rounds: 5, sl: 4, fl: 3, round: 3, heroes: [{ name: 'Kira', skills: ['Nature'] }, { name: 'Bram' }], entries: [{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }] }),
		);
		ctl(live(), 'montage.chrome.reset-progress').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last()).toEqual({
			title: 'T',
			rounds: 5,
			success_limit: 4,
			failure_limit: 3,
			successes: 0,
			failures: 0,
			participants: [{ name: 'Kira', skills_used: [] }, { name: 'Bram' }], // a hero who never had a list is not given one
			current_round: 1,
		});
		expect(Notice.notices).toEqual(['Montage progress reset']);
	});

	test('[C04] Add a hero and Set limits open their modal and write nothing by themselves', async () => {
		const { live, writes, flush } = await mount(yaml({ round: 1 }));
		ctl(live(), 'montage.chrome.add-hero').click();
		expect(modalOpen('montage.add-hero.submit')).toBe(true);
		document.body.innerHTML = '';
		ctl(live(), 'montage.chrome.set-limits').click();
		expect(modalOpen('montage.limits.save')).toBe(true);
		await flush();
		expect(writes()).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------------------------------- G. strip and guide

describe('[G] the strip and the guide: session-only disclosures', () => {
	/** A strip toggle rebuilds the element from a floating promise: let it land. */
	const settle = (): Promise<void> => jest.advanceTimersByTimeAsync(0);
	test('[G01] the strip opens and closes by click, shows "pinned" while open, and writes nothing to the note', async () => {
		const { live, flush, writes } = await mount(yaml({ round: 1 }));
		const header = (): HTMLElement => ctl(live(), 'montage.strip');
		expect(header().getAttribute('aria-expanded')).toBe('false');
		expect(shown(live(), '.dse-mt__strip-hint')).toBe('easy · medium · hard');
		header().click();
		await settle();
		expect(header().getAttribute('aria-expanded')).toBe('true'); // the element was rebuilt, the state came from the session
		expect(shown(live(), '.dse-mt__strip-hint')).toBe('pinned');
		header().click();
		await settle();
		expect(header().getAttribute('aria-expanded')).toBe('false');
		await flush();
		expect(writes()).toHaveLength(0);
	});

	test('[G02] the guide opens in place by click; its "Each test" block stands down while the strip is pinned', async () => {
		const { live, flush, writes } = await mount(yaml({ round: 1 }));
		const guide = (): HTMLElement => ctl(live(), 'montage.guide');
		expect(guide().getAttribute('aria-expanded')).toBe('false');
		expect(live().querySelector('.dse-mt__guide')!.getAttribute('data-strip-open')).toBe('off');
		guide().click();
		expect(guide().getAttribute('aria-expanded')).toBe('true');
		ctl(live(), 'montage.strip').click();
		await settle();
		expect(live().querySelector('.dse-mt__guide')!.getAttribute('data-strip-open')).toBe('on');
		expect(guide().getAttribute('aria-expanded')).toBe('true'); // the guide kept its own state across the strip's rebuild
		await flush();
		expect(writes()).toHaveLength(0);
	});

	test('[G03] both disclosures keep their state across a write', async () => {
		const { live, flush } = await mount(yaml({ round: 1 }));
		ctl(live(), 'montage.strip').click();
		await settle();
		ctl(live(), 'montage.guide').click();
		ctl(live(), 'montage.bar.end-round').click();
		await flush();
		expect(ctl(live(), 'montage.strip').getAttribute('aria-expanded')).toBe('true');
		expect(ctl(live(), 'montage.guide').getAttribute('aria-expanded')).toBe('true');
	});

	test('[G04] a read-only host still opens both disclosures', async () => {
		const { live } = await mount(yaml({ round: 1 }), { canPersist: false });
		ctl(live(), 'montage.guide').click();
		expect(ctl(live(), 'montage.guide').getAttribute('aria-expanded')).toBe('true');
	});
});

// ------------------------------------------------------------------------------------------------------- L. the sheet

describe('[L] the Log an action sheet: result x skill x note, edit x old result x new result, every way out', () => {
	let opened: DseModal[] = [];
	const NATURE: Hero = { name: 'Kira', skills: ['Nature'] };

	/** Open the sheet for Kira's open socket of round `round` (the bar button when she is next, else the socket). */
	const openNew = async (spec: Spec) => {
		const m = await mount(yaml(spec));
		ctl(m.root, 'montage.cell.socket', 0).click();
		return { ...m, sheet: modalOf('montage.log.submit') };
	};
	const chip = (sheet: HTMLElement, kind: string): HTMLElement => ctl(sheet, `montage.log.result.${kind}`);
	const pressed = (sheet: HTMLElement): string[] =>
		['success', 'failure', 'assist'].filter((k) => chip(sheet, k).getAttribute('aria-pressed') === 'true');

	test('[L01] a new sheet starts on Success, names the hero and round, and says which kind of round it is', async () => {
		const { sheet } = await openNew({ round: 2, sl: 9, fl: 9 });
		expect(titleOf(sheet)).toBe('Kira · round 2');
		expect(pressed(sheet)).toEqual(['success']);
		expect(shown(sheet, '.dse-mt__sheet-sub')).toBe('the round in play');
		expect(isDisabled(ctl(sheet, 'montage.log.submit'))).toBe(false);
		expect(ctl(sheet, 'montage.log.submit').getAttribute('aria-label')).toBe('Log');
		expect(has(sheet, 'montage.log.remove')).toBe(false);
		expect(Array.from(sheet.querySelectorAll('.dse-mt__sheet-field .dse-mt__sheet-label')).map((l) => l.textContent)).toEqual(['Result', 'Skill', 'Note']);
	});

	test.each([
		// result, skill typed, note typed, then the write: successes, failures, the hero's skills, the entry
		['success', '', '', 1, 0, ['Nature'], { hero: 'Kira', round: 1, result: 'success' }],
		['failure', '', '', 0, 1, ['Nature'], { hero: 'Kira', round: 1, result: 'failure' }],
		['assist', '', '', 0, 0, ['Nature'], { hero: 'Kira', round: 1, result: 'assist' }],
		['success', 'Insight', '', 1, 0, ['Nature', 'Insight'], { hero: 'Kira', round: 1, result: 'success', skill: 'Insight' }],
		['failure', 'Insight', 'Too slow.', 0, 1, ['Nature', 'Insight'], { hero: 'Kira', round: 1, result: 'failure', skill: 'Insight', note: 'Too slow.' }],
		['assist', 'Insight', 'Held the rope.', 0, 0, ['Nature', 'Insight'], { hero: 'Kira', round: 1, result: 'assist', skill: 'Insight', note: 'Held the rope.' }],
		['success', '', 'Only a note', 1, 0, ['Nature'], { hero: 'Kira', round: 1, result: 'success', note: 'Only a note' }],
		['success', '  Insight  ', '  padded  ', 1, 0, ['Nature', 'Insight'], { hero: 'Kira', round: 1, result: 'success', skill: 'Insight', note: 'padded' }],
		['failure', '   ', '   ', 0, 1, ['Nature'], { hero: 'Kira', round: 1, result: 'failure' }],
	])('[L02] Log: %s, skill "%s", note "%s" -> +%i successes, +%i failures, skills %j, one entry, one write', async (result, skill, note, plusS, plusF, skills, entry) => {
		const { live, sheet, flush, writes, last } = await openNew({ heroes: [NATURE], round: 1, sl: 9, fl: 9, successes: 3, failures: 3 });
		chip(sheet, result as string).click();
		type(ctl<HTMLInputElement>(sheet, 'montage.log.skill'), skill as string);
		type(ctl<HTMLTextAreaElement>(sheet, 'montage.log.note'), note as string);
		ctl(sheet, 'montage.log.submit').click();
		await flush();
		expect(writes()).toHaveLength(1);
		const data = last();
		expect(data.entries).toEqual([entry]);
		expect([data.successes, data.failures]).toEqual([3 + (plusS as number), 3 + (plusF as number)]);
		expect(data.participants[0].skills_used).toEqual(skills);
		expect(modalOpen('montage.log.submit')).toBe(false); // it closed itself
		expect(cellOf(live(), 'Kira', 1).getAttribute('data-kind')).toBe(result);
	});

	test('[L03] a result chip is a one-of-three group: pressing one un-presses the others, and the last pressed wins', async () => {
		const { sheet, flush, last } = await openNew({ round: 1, sl: 9, fl: 9 });
		chip(sheet, 'assist').click();
		expect(pressed(sheet)).toEqual(['assist']);
		chip(sheet, 'failure').click();
		expect(pressed(sheet)).toEqual(['failure']);
		ctl(sheet, 'montage.log.submit').click();
		await flush();
		expect(last().entries[0].result).toBe('failure');
	});

	test.each([
		// skill typed, the warning text (hidden = none)
		['Nature', 'Kira already used Nature in this montage — reuse is not allowed'],
		['Insight', ''],
		['  Nature ', 'Kira already used Nature in this montage — reuse is not allowed'],
		['', ''],
	])('[L04] typing the skill "%s": the reuse warning reads %j, and Log stays enabled (a warning, never a block)', async (skill, warning) => {
		const { sheet } = await openNew({ heroes: [NATURE, BRAM], round: 1, sl: 9, fl: 9, entries: [] });
		type(ctl<HTMLInputElement>(sheet, 'montage.log.skill'), skill);
		const warn = sheet.querySelector('.dse-mt__sheet-warn') as HTMLElement;
		expect(warn.textContent).toBe(warning);
		expect(warn.hidden).toBe(warning === '');
		expect(isDisabled(ctl(sheet, 'montage.log.submit'))).toBe(false);
	});

	test('[L05] a reused skill is still logged when the Director confirms it (the warning is not a block), and the skill is listed twice', async () => {
		const { sheet, flush, last } = await openNew({ heroes: [NATURE], round: 1, sl: 9, fl: 9 });
		type(ctl<HTMLInputElement>(sheet, 'montage.log.skill'), 'Nature');
		ctl(sheet, 'montage.log.submit').click();
		await flush();
		expect(last().participants[0].skills_used).toEqual(['Nature', 'Nature']);
	});

	test.each([
		// the old entry's result, the new one: successes, failures after the correction (start 3 / 3 with the old entry counted)
		['success', 'success', 3, 3],
		['success', 'failure', 2, 4],
		['success', 'assist', 2, 3],
		['failure', 'success', 4, 2],
		['failure', 'failure', 3, 3],
		['failure', 'assist', 3, 2],
		['assist', 'success', 4, 3],
		['assist', 'failure', 3, 4],
		['assist', 'assist', 3, 3],
	])('[L06] Save an edit: %s -> %s leaves the tallies at %i / %i (a delta on the stored counters, not a recount)', async (from, to, successes, failures) => {
		const { root, flush, writes, last } = await mount(
			yaml({ heroes: [NATURE], sl: 9, fl: 9, round: 2, successes: 3, failures: 3, entries: [{ hero: 'Kira', round: 1, result: from as string, skill: 'Nature' }] }),
		);
		ctl(root, 'montage.cell', 0).click();
		const sheet = modalOf('montage.log.submit');
		expect(pressed(sheet)).toEqual([from]);
		chip(sheet, to as string).click();
		ctl(sheet, 'montage.log.submit').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect([last().successes, last().failures]).toEqual([successes, failures]);
		expect(last().entries).toEqual([{ hero: 'Kira', round: 1, result: to, skill: 'Nature' }]);
		expect(last().participants[0].skills_used).toEqual(['Nature']); // the same skill: untouched
	});

	test('[L07] an edit starts pre-filled (skill, note, the "recorded as" line) and Save with nothing changed leaves the data as it was', async () => {
		const entry = { hero: 'Kira', round: 1, result: 'failure', skill: 'Nature', note: 'Slipped.' };
		const { root, flush, last } = await mount(yaml({ heroes: [NATURE], sl: 9, fl: 9, round: 2, entries: [entry] }));
		ctl(root, 'montage.cell', 0).click();
		const sheet = modalOf('montage.log.submit');
		expect(shown(sheet, '.dse-mt__sheet-sub')).toBe('recorded as a failure with Nature');
		expect(ctl<HTMLInputElement>(sheet, 'montage.log.skill').value).toBe('Nature');
		expect(ctl<HTMLTextAreaElement>(sheet, 'montage.log.note').value).toBe('Slipped.');
		expect(ctl(sheet, 'montage.log.submit').getAttribute('aria-label')).toBe('Save');
		expect((sheet.querySelector('.dse-mt__sheet-warn') as HTMLElement).hidden).toBe(true); // its own skill is not "reused"
		ctl(sheet, 'montage.log.submit').click();
		await flush();
		expect(last().entries).toEqual([entry]);
		expect([last().successes, last().failures]).toEqual([0, 1]);
		expect(last().participants[0].skills_used).toEqual(['Nature']);
	});

	test.each([
		// the new skill and note in the edit, then the entry and the hero's list
		['a different skill', 'Insight', 'Slipped.', { skill: 'Insight', note: 'Slipped.' }, ['Insight']],
		['the skill cleared', '', 'Slipped.', { note: 'Slipped.' }, []],
		['the note cleared', 'Nature', '', { skill: 'Nature' }, ['Nature']],
		['both cleared', '', '', {}, []],
	])('[L08] edit: %s -> the keys that are empty are removed from the entry, the skill list follows', async (_name, skill, note, extra, skills) => {
		const { root, flush, last } = await mount(
			yaml({ heroes: [NATURE], sl: 9, fl: 9, round: 2, entries: [{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature', note: 'Slipped.' }] }),
		);
		ctl(root, 'montage.cell', 0).click();
		const sheet = modalOf('montage.log.submit');
		type(ctl<HTMLInputElement>(sheet, 'montage.log.skill'), skill);
		type(ctl<HTMLTextAreaElement>(sheet, 'montage.log.note'), note);
		ctl(sheet, 'montage.log.submit').click();
		await flush();
		expect(last().entries).toEqual([{ hero: 'Kira', round: 1, result: 'success', ...extra }]);
		expect(last().participants[0].skills_used).toEqual(skills);
	});

	test.each([
		['success', 3, 3, 2, 3],
		['failure', 3, 3, 3, 2],
		['assist', 3, 3, 3, 3],
	])('[L09] Remove an entry of %s: the tallies go from %i / %i to %i / %i, the skill is given back, the entry list empties, one write', async (result, s0, f0, s1, f1) => {
		const { root, flush, writes, last } = await mount(
			yaml({ heroes: [NATURE], sl: 9, fl: 9, round: 2, successes: s0, failures: f0, entries: [{ hero: 'Kira', round: 1, result, skill: 'Nature' }] }),
		);
		ctl(root, 'montage.cell', 0).click();
		ctl(modalOf('montage.log.remove'), 'montage.log.remove').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect([last().successes, last().failures]).toEqual([s1, f1]);
		expect(last().entries).toBeUndefined();
		expect(last().participants[0].skills_used).toEqual([]);
		expect(modalOpen('montage.log.remove')).toBe(false);
	});

	test('[L10] an entry whose result is unrecognised: no chip is pressed and Save is disabled until one is chosen; Remove works at once', async () => {
		const spec: Spec = { heroes: [NATURE], sl: 9, fl: 9, round: 2, successes: 0, entries: [{ hero: 'Kira', round: 1, result: 'dodged', skill: 'Nature' }] };
		const first = await mount(yaml(spec));
		ctl(first.root, 'montage.cell', 0).click();
		let sheet = modalOf('montage.log.submit');
		expect(pressed(sheet)).toEqual([]);
		expect(isDisabled(ctl(sheet, 'montage.log.submit'))).toBe(true);
		ctl(sheet, 'montage.log.submit').click(); // click-disabled: nothing happens
		await first.flush();
		expect(first.writes()).toHaveLength(0);
		chip(sheet, 'failure').click();
		expect(isDisabled(ctl(sheet, 'montage.log.submit'))).toBe(false);
		ctl(sheet, 'montage.log.submit').click();
		await first.flush();
		expect(first.last().entries).toEqual([{ hero: 'Kira', round: 1, result: 'failure', skill: 'Nature' }]);
		expect([first.last().successes, first.last().failures]).toEqual([0, 1]);
		document.body.innerHTML = '';
		const second = await mount(yaml(spec));
		ctl(second.root, 'montage.cell', 0).click();
		sheet = modalOf('montage.log.remove');
		ctl(sheet, 'montage.log.remove').click();
		await second.flush();
		expect(second.last().entries).toBeUndefined();
		expect([second.last().successes, second.last().failures]).toEqual([0, 0]);
	});

	test('[L11] a hero whose entry has no skills list (a fixed bug): edit, Save and Remove all work, and a skill typed is listed', async () => {
		const spec: Spec = { heroes: [{ name: 'Kira' }], sl: 9, fl: 9, round: 2, entries: [{ hero: 'Kira', round: 1, result: 'success' }] };
		const edit = await mount(yaml(spec));
		ctl(edit.root, 'montage.cell', 0).click();
		const sheet = modalOf('montage.log.submit');
		type(ctl<HTMLInputElement>(sheet, 'montage.log.skill'), 'Nature');
		ctl(sheet, 'montage.log.submit').click();
		await edit.flush();
		expect(edit.last().participants[0].skills_used).toEqual(['Nature']);
		document.body.innerHTML = '';
		const remove = await mount(yaml(spec));
		ctl(remove.root, 'montage.cell', 0).click();
		ctl(modalOf('montage.log.remove'), 'montage.log.remove').click();
		await remove.flush();
		expect(remove.last().entries).toBeUndefined();
		expect(remove.last().participants).toEqual([{ name: 'Kira' }]);
	});

	test.each([
		['Cancel', 'new', (sheet: HTMLElement) => ctl(sheet, 'montage.log.cancel').click()],
		['Cancel', 'edit', (sheet: HTMLElement) => ctl(sheet, 'montage.log.cancel').click()],
		['Escape', 'new', () => { attachObsidianKeymap(opened[0]); pressEscape(document.body); }],
		['Escape', 'edit', () => { attachObsidianKeymap(opened[0]); pressEscape(document.body); }],
	])('[L12] %s on a %s sheet with typed data writes nothing and closes it', async (_way, kind, leave) => {
		opened = captureModals();
		const { root, flush, writes } = await mount(yaml({ heroes: [NATURE], sl: 9, fl: 9, round: 2, entries: [{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }] }));
		ctl(root, kind === 'edit' ? 'montage.cell' : 'montage.cell.socket', 0).click();
		const sheet = modalOf('montage.log.submit');
		chip(sheet, 'failure').click();
		type(ctl<HTMLInputElement>(sheet, 'montage.log.skill'), 'Insight');
		type(ctl<HTMLTextAreaElement>(sheet, 'montage.log.note'), 'draft');
		leave(sheet);
		await flush();
		expect(modalOpen('montage.log.submit')).toBe(false);
		expect(writes()).toHaveLength(0);
	});

	test('[L13] Escape typed INTO the note field closes the sheet and drops the draft (the field has no draft guard of its own)', async () => {
		opened = captureModals();
		const { root, writes, flush } = await mount(yaml({ round: 1, sl: 9, fl: 9 }));
		ctl(root, 'montage.cell.socket', 0).click();
		const note = ctl<HTMLTextAreaElement>(modalOf('montage.log.submit'), 'montage.log.note');
		type(note, 'a long consequence');
		attachObsidianKeymap(opened[0]);
		pressEscape(note);
		await flush();
		expect(modalOpen('montage.log.submit')).toBe(false);
		expect(writes()).toHaveLength(0);
	});

	test('[L14] the sheet opened for a (hero, round) that already has an entry, or for a round with no column, cannot be logged (Log disabled)', async () => {
		const { LogActionModal } = await import('../../../src/elements/montage/LogActionModal');
		const { parse } = await import('../../../src/elements/montage/model');
		const model = parse(parseYaml(yaml({ round: 1, sl: 9, fl: 9, entries: [{ hero: 'Kira', round: 1, result: 'success' }] })), '');
		for (const [hero, round, disabled] of [['Kira', 1, true], ['Kira', 0, true], ['Kira', 4, true], ['Bram', 1, false], ['Bram', 3, false]] as const) {
			const modal = new LogActionModal(new App() as any, { model, mode: { kind: 'new', hero, round }, onSubmit: jest.fn() });
			modal.open();
			expect(isDisabled(ctl(modal.contentEl, 'montage.log.submit'))).toBe(disabled);
			modal.close();
		}
	});

	test.each([
		[1, 3, 'a round already played'],
		[2, 2, 'the round in play'],
		[3, 2, 'a round still to come'],
	])('[L15] a new sheet for round %i with round %i in play reads "%s"', async (round, inPlay, sub) => {
		const { LogActionModal } = await import('../../../src/elements/montage/LogActionModal');
		const { parse } = await import('../../../src/elements/montage/model');
		const model = parse(parseYaml(yaml({ round: inPlay, sl: 9, fl: 9 })), '');
		const modal = new LogActionModal(new App() as any, { model, mode: { kind: 'new', hero: 'Kira', round }, onSubmit: jest.fn() });
		modal.open();
		expect(shown(modal.contentEl, '.dse-mt__sheet-sub')).toBe(sub);
	});
});

// ------------------------------------------------------------------------------------------------------- H. Add a hero

describe('[H] Add a hero: name x roster shape x every way out', () => {
	const openAdd = async (spec: Spec | string) => {
		const m = await mount(typeof spec === 'string' ? spec : yaml(spec));
		ctl(m.root, 'montage.board.add-hero').click();
		return { ...m, modal: modalOf('montage.add-hero.submit') };
	};

	test('[H01] a fresh modal: empty name, Add disabled, Cancel enabled; typing a name enables Add, clearing it disables again', async () => {
		const { modal } = await openAdd({ round: 1 });
		const add = ctl(modal, 'montage.add-hero.submit');
		expect(isDisabled(add)).toBe(true);
		expect(titleOf(modal)).toBe('Add a hero');
		type(ctl<HTMLInputElement>(modal, 'montage.add-hero.name'), 'Osric');
		expect(isDisabled(add)).toBe(false);
		type(ctl<HTMLInputElement>(modal, 'montage.add-hero.name'), '');
		expect(isDisabled(add)).toBe(true);
	});

	test.each([
		['Osric', 'Osric'],
		['  Osric  ', 'Osric'],
		['Zoe: the Bold', 'Zoe: the Bold'],
		['007', '007'],
		['true', 'true'],
		['- dash', '- dash'],
	])('[H02] Add "%s": a hero named "%s" is appended with an empty skills list, a new board row, one write, and the name survives a re-read', async (typed, stored) => {
		const { live, modal, flush, writes, last } = await openAdd({ round: 1 });
		type(ctl<HTMLInputElement>(modal, 'montage.add-hero.name'), typed);
		ctl(modal, 'montage.add-hero.submit').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last().participants).toEqual([{ name: 'Kira', skills_used: [] }, { name: 'Bram', skills_used: [] }, { name: stored, skills_used: [] }]);
		expect(Array.from(live().querySelectorAll('.dse-mt__board-who')).map((e) => e.textContent)).toEqual(['Kira', 'Bram', stored]);
		expect(shown(live(), '.dse-head__deck--left')).toBe('3 heroes · one action each per round');
		expect(modalOpen('montage.add-hero.submit')).toBe(false);
	});

	test.each([
		['empty', ''],
		['only spaces', '   '],
		['only a tab and a space', '\t '],
	])('[H03] a %s name: Add is disabled and a click on it writes nothing and leaves the modal open', async (_name, typed) => {
		const { modal, flush, writes } = await openAdd({ round: 1 });
		type(ctl<HTMLInputElement>(modal, 'montage.add-hero.name'), typed);
		expect(isDisabled(ctl(modal, 'montage.add-hero.submit'))).toBe(true);
		ctl(modal, 'montage.add-hero.submit').click();
		await flush();
		expect(writes()).toHaveLength(0);
		expect(modalOpen('montage.add-hero.submit')).toBe(true);
	});

	test.each([
		['no participants key', yaml({ heroes: [], round: 1 }), [{ name: 'Osric', skills_used: [] }]],
		['one hero', yaml({ heroes: [{ name: 'Kira' }], round: 1 }), [{ name: 'Kira' }, { name: 'Osric', skills_used: [] }]],
		['a hand-written participants line that is not a list', ['rounds: 2', 'participants: Kira', 'current_round: 1'].join('\n'), ['Kira', { name: 'Osric', skills_used: [] }]],
		['list items that are not heroes, kept as typed', ['rounds: 2', 'participants:', '  - Kira', '  - name: Bram', 'current_round: 1'].join('\n'), ['Kira', { name: 'Bram' }, { name: 'Osric', skills_used: [] }]],
	])('[H04] the roster shape "%s": the new hero is added and what was typed there is written back as it was', async (_name, source, participants) => {
		const { modal, flush, last } = await openAdd(source as string);
		type(ctl<HTMLInputElement>(modal, 'montage.add-hero.name'), 'Osric');
		ctl(modal, 'montage.add-hero.submit').click();
		await flush();
		expect(last().participants).toEqual(participants);
	});

	test.each(['Cancel', 'Escape', 'Escape typed in the name field'])('[H05] %s leaves the roster and the note alone', async (way) => {
		const opened = captureModals();
		const { modal, flush, writes } = await openAdd({ round: 1 });
		const name = ctl<HTMLInputElement>(modal, 'montage.add-hero.name');
		type(name, 'Osric');
		if (way === 'Cancel') ctl(modal, 'montage.add-hero.cancel').click();
		else {
			attachObsidianKeymap(opened[0]);
			pressEscape(way === 'Escape' ? document.body : name);
		}
		await flush();
		expect(modalOpen('montage.add-hero.submit')).toBe(false);
		expect(writes()).toHaveLength(0);
	});

	test('[H06] a new hero can act at once: the board has a socket for them in the round in play', async () => {
		const { live, modal, flush } = await openAdd({ round: 2, sl: 9, fl: 9, entries: [{ hero: 'Kira', round: 1, result: 'success' }] });
		type(ctl<HTMLInputElement>(modal, 'montage.add-hero.name'), 'Osric');
		ctl(modal, 'montage.add-hero.submit').click();
		await flush();
		expect(rowCodes(live(), 'Osric', 3)).toBe('CS-'); // round 1 is past and empty (a cell), round 2 is in play
		expect(isDisabled(ctl(live(), 'montage.bar.log'))).toBe(false);
	});
});

// ------------------------------------------------------------------------------------------------------ S. Set limits

describe('[S] Set limits: typed value x current tally x every way out', () => {
	const openLimits = async (spec: Spec) => {
		const m = await mount(yaml(spec));
		ctl(m.root, 'montage.chrome.set-limits').click();
		return { ...m, modal: modalOf('montage.limits.save') };
	};
	const fill = (modal: HTMLElement, success: string, failure: string): void => {
		type(ctl<HTMLInputElement>(modal, 'montage.limits.success'), success);
		type(ctl<HTMLInputElement>(modal, 'montage.limits.failure'), failure);
	};

	test('[S01] the fields open pre-filled with the current limits, on a numeric field with a minimum of 0', async () => {
		const { modal } = await openLimits({ sl: 6, fl: 3, round: 1 });
		expect(ctl<HTMLInputElement>(modal, 'montage.limits.success').value).toBe('6');
		expect(ctl<HTMLInputElement>(modal, 'montage.limits.failure').value).toBe('3');
		for (const id of ['montage.limits.success', 'montage.limits.failure']) {
			expect(ctl(modal, id).getAttribute('type')).toBe('number');
			expect(ctl(modal, id).getAttribute('min')).toBe('0');
		}
		expect(titleOf(modal)).toBe('Set limits…');
	});

	test.each([
		// typed success, typed failure, the stored limits
		['plain values', '8', '4', 8, 4],
		['zero means no limit', '0', '0', 0, 0],
		['cleared fields count as 0', '', '', 0, 0],
		['a negative value floors at 0', '-3', '-1', 0, 0],
		['a fraction is truncated, not rounded', '2.9', '1.2', 2, 1],
		['only one field changed', '6', '1', 6, 1],
		['a large value is kept', '25', '12', 25, 12],
		['an exponent is read as a number', '1e1', '2', 10, 2],
	])('[S02] Save, %s: success "%s", failure "%s" -> %i / %i, one write, and the tracks redraw with that many slots', async (_name, s, f, sl, fl) => {
		const { live, modal, flush, writes, last } = await openLimits({ sl: 6, fl: 3, round: 1 });
		fill(modal, s, f);
		ctl(modal, 'montage.limits.save').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect([last().success_limit, last().failure_limit]).toEqual([sl, fl]);
		expect(slots(live(), 'success').total).toBe(sl);
		expect(slots(live(), 'failure').total).toBe(fl);
		expect(modalOpen('montage.limits.save')).toBe(false);
	});

	test.each([
		// the stored tally, the new limits, whether the montage is now complete and what the band calls it
		['a success limit BELOW the successes so far: it ends as a total success', { successes: 5, sl: 6 }, '3', '3', true, 'Total Success'],
		['a success limit equal to the successes: the same', { successes: 5, sl: 6 }, '5', '3', true, 'Total Success'],
		['a success limit raised past the successes: it plays on, a lead of 3 reads as a partial success', { successes: 3, sl: 3 }, '4', '3', false, 'Partial Success'],
		['a failure limit below the failures so far: it ends', { successes: 1, failures: 3, sl: 6, fl: 5 }, '6', '2', true, 'Total Failure'],
		['the success limit cleared to 0: a reached limit no longer ends it', { successes: 3, sl: 3 }, '0', '2', false, 'Partial Success'],
		['the failure limit cleared to 0: the montage plays on past its old limit', { successes: 0, failures: 2, sl: 3, fl: 2 }, '3', '0', false, 'Total Failure'],
	])('[S03] %s', async (_name, spec, s, f, complete, bandWord) => {
		const { live, modal, flush, last } = await openLimits({ round: 1, fl: 3, ...(spec as Spec) });
		fill(modal, s, f);
		ctl(modal, 'montage.limits.save').click();
		await flush();
		expect(live().querySelector('.dse-mt__actionrow')!.getAttribute('data-complete')).toBe(complete ? 'on' : 'off');
		expect(word(live())).toBe(bandWord);
		expect(last().successes).toBe((spec as Spec).successes ?? 0); // the stored tallies are never touched by a limit
		expect(last().failures).toBe((spec as Spec).failures ?? 0);
	});

	test.each(['Cancel', 'Escape'])('[S04] %s leaves the limits and the note alone, whatever was typed', async (way) => {
		const opened = captureModals();
		const { modal, flush, writes } = await openLimits({ sl: 6, fl: 3, round: 1 });
		fill(modal, '9', '9');
		if (way === 'Cancel') ctl(modal, 'montage.limits.cancel').click();
		else {
			attachObsidianKeymap(opened[0]);
			pressEscape(document.body);
		}
		await flush();
		expect(modalOpen('montage.limits.save')).toBe(false);
		expect(writes()).toHaveLength(0);
	});
});

// ----------------------------------------------------------------------------- X. the note around the block stays intact

describe('[X] integrity: what a montage write leaves alone', () => {
	const vaultNote = (name: string): string => fs.readFileSync(path.join(__dirname, '../../../e2e/vaults/shipped/Montage', `${name}.md`), 'utf8');
	const FENCE = /```ds-montage\n([\s\S]*?)\n```/g;
	const blocksOf = (note: string): string[] => Array.from(note.matchAll(FENCE)).map((m) => m[1]);

	/** Mount block `index` of `note` through a REAL Reading-view host over a fake vault: the write goes through the product's own splice. */
	async function mountNote(note: string, index = 0) {
		jest.useFakeTimers();
		const app = new App();
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md', index);
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-montage');
		await new ElementPipeline(makeDeps(app, plugin)).run(montageElement, blocksOf(note)[index], host);
		document.body.appendChild(host.containerEl);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
		return { app, root, flush, text: (): string => app.vault.getContent('Note.md')! };
	}

	/** Every way the montage writes, each as a click sequence on a root that has Kira and room to act. */
	const ACTIONS: Array<[string, (root: HTMLElement) => void]> = [
		['a quick log', (root) => ctl(root, 'montage.quick.failure', 0).click()],
		['the sheet (Log)', (root) => { ctl(root, 'montage.bar.log').click(); ctl(modalOf('montage.log.submit'), 'montage.log.submit').click(); }],
		['End round', (root) => ctl(root, 'montage.bar.end-round').click()],
		['Add a round', (root) => ctl(root, 'montage.chrome.add-round').click()],
		['Reset progress', (root) => ctl(root, 'montage.chrome.reset-progress').click()],
		['Add a hero', (root) => { ctl(root, 'montage.board.add-hero').click(); const m = modalOf('montage.add-hero.submit'); type(ctl<HTMLInputElement>(m, 'montage.add-hero.name'), 'Osric'); ctl(m, 'montage.add-hero.submit').click(); }],
		['Set limits', (root) => { ctl(root, 'montage.chrome.set-limits').click(); const m = modalOf('montage.limits.save'); type(ctl<HTMLInputElement>(m, 'montage.limits.success'), '7'); ctl(m, 'montage.limits.save').click(); }],
	];

	test.each(ACTIONS)('[X01] %s inside the second of two blocks: the prose above, between and below and the first block stay byte for byte', async (_name, act) => {
		const note = vaultNote('two-blocks');
		const { root, flush, text } = await mountNote(note, 1);
		act(root);
		await flush();
		const after = text();
		expect(after).not.toBe(note);
		const [firstBefore, secondBefore] = blocksOf(note);
		const [firstAfter, secondAfter] = blocksOf(after);
		expect(firstAfter).toBe(firstBefore);
		expect(secondAfter).not.toBe(secondBefore);
		// everything outside the second block's body is untouched
		expect(after.replace(secondAfter, '').length).toBe(note.replace(secondBefore, '').length);
		expect(after.replace(secondAfter, '')).toBe(note.replace(secondBefore, ''));
	});

	// (Reset progress is left out of the twin tables: a fresh twin has nothing to reset, so its bytes would not change.)
	const TWIN_ACTIONS = ACTIONS.filter(([name]) => name !== 'Reset progress');

	test.each(TWIN_ACTIONS)('[X02] %s in the FIRST of two IDENTICAL blocks changes that block only (the twin below stays byte for byte)', async (_name, act) => {
		const note = vaultNote('twins');
		const { root, flush, text } = await mountNote(note, 0);
		act(root);
		await flush();
		const [firstAfter, secondAfter] = blocksOf(text());
		expect(secondAfter).toBe(blocksOf(note)[1]);
		expect(firstAfter).not.toBe(blocksOf(note)[0]);
		expect(text().endsWith('BELOW\n')).toBe(true);
		expect(text().startsWith('# Montage: two identical blocks\n\nABOVE\n')).toBe(true);
	});

	test.each(TWIN_ACTIONS)('[X03] %s in the SECOND of two identical blocks changes that block only (the twin above stays byte for byte)', async (_name, act) => {
		const note = vaultNote('twins');
		const { root, flush, text } = await mountNote(note, 1);
		act(root);
		await flush();
		const [firstAfter, secondAfter] = blocksOf(text());
		expect(firstAfter).toBe(blocksOf(note)[0]);
		expect(secondAfter).not.toBe(blocksOf(note)[1]);
	});

	test('[X04] one write per action, and the fence lines and the prose around a single block are kept', async () => {
		const note = vaultNote('mid');
		const { app, root, flush, text } = await mountNote(note);
		ctl(root, 'montage.quick.success', 0).click();
		await flush();
		expect(app.vault.modifyCalls).toHaveLength(1);
		expect(text().startsWith('# Montage: mid-game\n\nABOVE\n\n```ds-montage\n')).toBe(true);
		expect(text().endsWith('\n```\n\nBELOW\n')).toBe(true);
	});

	test('[X05] the hand-written block: another hero\'s scalar skills, a hero with no list and an unrecognised result survive a write for a third hero', async () => {
		const note = vaultNote('hand-written');
		const { root, flush, text } = await mountNote(note);
		// round 2 is in play: Kira's and Bram's round-2 sockets are open
		ctl(root, 'montage.quick.assist', 0).click(); // Kira
		await flush();
		const data = parseYaml(blocksOf(text())[0]);
		expect(data.participants[0].skills_used).toBe('Nature'); // still the scalar the Director wrote
		expect(data.participants[1]).toEqual({ name: 'Bram' }); // still no list
		expect(data.entries).toEqual([
			{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' },
			{ hero: 'Bram', round: 1, result: 'dodged' },
			{ hero: 'Kira', round: 2, result: 'assist' },
		]);
		expect(data.successes).toBe(1);
	});

	test('[X06] a participant carrying extra keys of its own keeps them through a write for that hero and for another', async () => {
		const note = ['```ds-montage', 'rounds: 2', 'success_limit: 3', 'failure_limit: 2', 'participants:', '  - name: Kira', '    player: Sam', '    skills_used: []', '  - name: Bram', '    skills_used: []', 'current_round: 1', '```'].join('\n');
		const { root, flush, text } = await mountNote(note);
		ctl(root, 'montage.quick.success', 0).click();
		await flush();
		const data = parseYaml(blocksOf(text())[0]);
		expect(data.participants[0]).toEqual({ name: 'Kira', player: 'Sam', skills_used: [] });
	});

	test('[X07] an edit the Director made to the prose above the block after it was drawn is kept by the write (the splice re-reads the note)', async () => {
		const note = vaultNote('fresh');
		const { app, root, flush, text } = await mountNote(note);
		app.vault.setFile('Note.md', note.replace('ABOVE', 'ABOVE, edited by hand'));
		ctl(root, 'montage.quick.success', 0).click();
		await flush();
		expect(text()).toContain('ABOVE, edited by hand');
		expect(parseYaml(blocksOf(text())[0]).entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
	});

	test('[X08] a block with no heroes and no limits (the empty fixture) takes Add a round without touching anything else', async () => {
		const note = vaultNote('empty');
		const { root, flush, text } = await mountNote(note);
		ctl(root, 'montage.chrome.add-round').click();
		await flush();
		expect(text().replace('rounds: 3', 'rounds: 2')).toBe(note);
	});
});

// ------------------------------------------------------------------------------------------------ K. filed bugs (test.failing)
// A bug a ticket owns is a `test.failing` that encodes the CORRECT behaviour with the ticket in its title: it passes while the bug exists and FAILS
// the moment the bug is fixed, so the marker is removed then. The e2e twins (e2e/specs/montage/) cover what shows in real Obsidian.

describe('[K] filed bugs', () => {
	const UNKNOWN = ['table_notes: keep me', 'rounds: 3', 'success_limit: 5', 'failure_limit: 5', 'successes: 1', 'failures: 0', 'participants:', '  - name: Kira', '    skills_used: [Nature]', 'entries:', '  - hero: Kira', '    round: 1', '    result: success', '    skill: Nature', '    dc: 12', 'current_round: 2'].join('\n');

	test.failing('[K01] a write keeps a top-level key the product does not know [known bug SC-625]', async () => {
		const { root, flush, last } = await mount(UNKNOWN);
		ctl(root, 'montage.quick.failure', 0).click();
		await flush();
		expect(last().table_notes).toBe('keep me');
	});

	test.failing('[K02] a write keeps a key the product does not know inside an entry [known bug SC-625]', async () => {
		const { root, flush, last } = await mount(UNKNOWN);
		ctl(root, 'montage.quick.failure', 0).click();
		await flush();
		expect(last().entries[0].dc).toBe(12);
	});

	test('[K03] after a write the rebuilt montage gives keyboard focus back to the control that replaced the pressed one', async () => {
		const { root, flush, live } = await mount(yaml({ round: 1 }));
		const end = ctl(root, 'montage.bar.end-round');
		end.focus();
		end.click();
		await flush();
		expect(document.activeElement?.closest('[data-dse-control]')?.getAttribute('data-dse-control')).toBe('montage.bar.end-round');
		expect(live().contains(document.activeElement)).toBe(true);
	});

	test.failing('[K04] typing a skill in another case still warns that the hero used it [known bug SC-631]', async () => {
		const { root } = await mount(yaml({ heroes: [{ name: 'Kira', skills: ['Nature'] }], round: 2, sl: 9, fl: 9, entries: [{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }] }));
		ctl(root, 'montage.cell.socket', 0).click();
		const sheet = modalOf('montage.log.submit');
		type(ctl<HTMLInputElement>(sheet, 'montage.log.skill'), 'nature');
		expect((sheet.querySelector('.dse-mt__sheet-warn') as HTMLElement).hidden).toBe(false);
	});
});
