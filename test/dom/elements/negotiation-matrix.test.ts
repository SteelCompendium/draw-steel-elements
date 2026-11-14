// SC-439 — the negotiation tracker's combinatorial logic as tables (values x states x variants), driven through the REAL
// ElementPipeline with real clicks / key events on the controls' `data-dse-control` ids and read back from the bytes the
// host is asked to write. The e2e specs (e2e/specs/negotiation/) then drive one plain scenario per manifest pair; this
// file holds the permutations that do not need a real browser. Scenario groups follow e2e/manifest/negotiation.ts:
// T tabs, P patience, I interest, E the standing -> ending grid, M motivation cards, A argument (chips, modifiers, tiers,
// Complete), R reset, X integrity of the note around a write.
//
// The expected values below are worked out from the Draw Steel negotiation rules (the Heroes book's argument table), not from
// the model's own `ArgumentPowerRoll`, so a change to that table fails here.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import type { SessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Menu, Notice, parseYaml, stringifyYaml, makeFakeContext } from '../../mocks/obsidian';
import { negotiationElement } from '../../../src/elements/negotiation/definition';

// -- harness ---------------------------------------------------------------------------------------------------------------

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_s: string) => true);
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (c: unknown) => c,
		getBlockInfo: () => ({ language: 'ds-negotiation', lineStart: 0, lineEnd: 40 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-negotiation::0',
		...overrides,
	};
	return host as unknown as BlockHost & { containerEl: HTMLElement; replaceSource: jest.Mock };
}

function makeDeps(session: SessionStore = createSessionStore()): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
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
		session,
		roll: createRollService(prefs),
	};
}

const OFFERS = { i5: 'five', i4: 'four', i3: 'three', i2: 'two', i1: 'one', i0: 'zero' };
const HA = 'Higher Authority';
const PEACE = 'Peace';
const POWER = 'Power';

/** A negotiation body. Standing is declared (`current_*`), so a write always carries it. `spent` names the motivations
 *  already appealed to; `over` replaces or adds any top-level key. */
function src(over: Record<string, unknown> = {}, spent: string[] = []): string {
	return stringifyYaml({
		name: 'Frodo',
		initial_interest: 3,
		initial_patience: 3,
		current_interest: 3,
		current_patience: 3,
		motivations: [
			{ name: HA, reason: 'duty', ...(spent.includes(HA) ? { hasBeenAppealedTo: true } : {}) },
			{ name: PEACE, reason: 'shire', ...(spent.includes(PEACE) ? { hasBeenAppealedTo: true } : {}) },
		],
		pitfalls: [{ name: POWER, reason: 'ring' }],
		...OFFERS,
		...over,
	}).trim();
}

/** Mount `source` through the real pipeline on fake timers; `flush()` lands the debounced write. */
async function mount(source: string, overrides: Partial<BlockHost> = {}, session?: SessionStore) {
	jest.useFakeTimers();
	const host = makeHost(overrides);
	await new ElementPipeline(makeDeps(session)).run(negotiationElement, source, host);
	const root = (): HTMLElement => host.containerEl.firstElementChild as HTMLElement;
	const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	const writes = (): string[] => host.replaceSource.mock.calls.map((c) => c[0] as string);
	const last = (): any => parseYaml(writes()[writes().length - 1]);
	return { host, root, flush, writes, last };
}

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
	Menu.lastMenu = null;
	Notice.notices.length = 0;
});

const ctl = (root: HTMLElement, id: string, nth = 0): HTMLElement =>
	root.querySelectorAll(`[data-dse-control="${id}"]`)[nth] as HTMLElement;
const ctls = (root: HTMLElement, id: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(`[data-dse-control="${id}"]`));
const seal = (root: HTMLElement, id: 'patience' | 'interest', value: number): HTMLElement =>
	root.querySelector(`[data-dse-control="negotiation.${id}.seal"][data-value="${value}"]`) as HTMLElement;
const checkedSeals = (root: HTMLElement, id: 'patience' | 'interest'): number[] =>
	ctls(root, `negotiation.${id}.seal`).filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => Number(s.dataset.value));
const press = (el: HTMLElement, key: string): void => {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};
const chip = (root: HTMLElement, kind: 'motivation' | 'pitfall', nth: number): HTMLElement => ctl(root, `negotiation.appeal.${kind}`, nth);
const tierRow = (root: HTMLElement, nth: number): HTMLElement => ctl(root, 'negotiation.tier.row', nth);
const complete = (root: HTMLElement): HTMLButtonElement => ctl(root, 'negotiation.complete') as HTMLButtonElement;
const mod = (root: HTMLElement, which: 'reuse' | 'lie' | 'same'): HTMLInputElement => ctl(root, `negotiation.mod.${which}`) as HTMLInputElement;
const tabOf = (root: HTMLElement, id: 'argument' | 'learn-more'): HTMLElement => ctl(root, `negotiation.tab.${id}`);
const panelOf = (root: HTMLElement, id: 'argument' | 'learn-more'): HTMLElement => document.getElementById(tabOf(root, id).getAttribute('aria-controls')!)!;
const bandOf = (root: HTMLElement): HTMLElement | null => root.querySelector('.dse-nt__end');
const hint = (root: HTMLElement): string => root.querySelector('.dse-nt__complete-hint')!.textContent!;

// -- T. tabs x which panel shows ---------------------------------------------------------------------------------------------

describe('SC-439 T: tabs — which panel shows, from each start, by click and by key (never a write)', () => {
	const TABS = ['argument', 'learn-more'] as const;

	test.each(TABS.flatMap((from) => TABS.map((to) => ({ from, to }))))('starting on $from, clicking $to: exactly $to is selected and shown', async ({ from, to }) => {
		const { root, writes, flush } = await mount(src());
		if (from !== 'argument') tabOf(root(), from).click();
		tabOf(root(), to).click();
		await flush();
		for (const id of TABS) {
			expect(tabOf(root(), id).getAttribute('aria-selected')).toBe(String(id === to));
			expect(tabOf(root(), id).getAttribute('tabindex')).toBe(id === to ? '0' : '-1');
			expect(panelOf(root(), id).hidden).toBe(id !== to);
		}
		expect(writes()).toEqual([]);
	});

	// ArrowRight / ArrowLeft wrap (two tabs: both land on the other one); Home is the first, End the last.
	test.each([
		['argument', 'ArrowRight', 'learn-more'], ['argument', 'ArrowLeft', 'learn-more'], ['argument', 'Home', 'argument'], ['argument', 'End', 'learn-more'],
		['learn-more', 'ArrowRight', 'argument'], ['learn-more', 'ArrowLeft', 'argument'], ['learn-more', 'Home', 'argument'], ['learn-more', 'End', 'learn-more'],
	] as const)('on %s, %s selects %s (focus follows) and writes nothing', async (from, key, to) => {
		const { root, writes, flush } = await mount(src());
		if (from !== 'argument') tabOf(root(), from).click();
		tabOf(root(), from).focus();
		press(tabOf(root(), from), key);
		await flush();
		expect(tabOf(root(), to).getAttribute('aria-selected')).toBe('true');
		expect(panelOf(root(), to).hidden).toBe(false);
		expect(panelOf(root(), to === 'argument' ? 'learn-more' : 'argument').hidden).toBe(true);
		expect(document.activeElement).toBe(tabOf(root(), to));
		expect(writes()).toEqual([]);
	});

	test('the Learn Motivation/Pitfall panel is rules text only: nothing in it can be pressed, whichever tab is showing', async () => {
		const { root } = await mount(src());
		for (const id of TABS) {
			tabOf(root(), id).click();
			expect(root().querySelector('.dse-nt__learn-more button, .dse-nt__learn-more input, .dse-nt__learn-more [tabindex], .dse-nt__learn-more [role="radio"]')).toBeNull();
		}
	});

	test('the chosen tab is remembered by the block key across a rebuild (and a second block keeps its own)', async () => {
		const session = createSessionStore();
		const first = await mount(src(), {}, session);
		tabOf(first.root(), 'learn-more').click();
		document.body.innerHTML = '';
		const again = await mount(src(), {}, session);
		expect(tabOf(again.root(), 'learn-more').getAttribute('aria-selected')).toBe('true');
		document.body.innerHTML = '';
		const other = await mount(src(), { blockKey: () => 'Note.md::ds-negotiation::1' }, session);
		expect(tabOf(other.root(), 'argument').getAttribute('aria-selected')).toBe('true');
	});
});

// -- P / I. the two tracks ---------------------------------------------------------------------------------------------------

const VALUES = [0, 1, 2, 3, 4, 5];
/** The book's stop conditions on the 0..5 scale: Interest 5 is a deal, Interest 0 hostile, otherwise spent Patience is a final offer. */
const endingOf = (interest: number, patience: number): 'deal' | 'hostile' | 'final' | null =>
	interest >= 5 ? 'deal' : interest <= 0 ? 'hostile' : patience <= 0 ? 'final' : null;

describe('SC-439 P: Patience seals — click from every start value to every value', () => {
	test.each(VALUES.flatMap((start) => VALUES.map((value) => ({ start, value }))))('patience $start: click seal $value', async ({ start, value }) => {
		const { root, writes, last, flush } = await mount(src({ current_patience: start }));
		expect(checkedSeals(root(), 'patience')).toEqual([start]);
		seal(root(), 'patience', value).click();
		await flush();
		expect(checkedSeals(root(), 'patience')).toEqual([value]);
		expect(root().querySelector('.dse-nt__readout-value')!.textContent).toBe(String(value));
		// the fill grammar: 0 is the floor, 1..value are on, the rest spent
		expect(VALUES.map((v) => seal(root(), 'patience', v).getAttribute('data-fill'))).toEqual(VALUES.map((v) => (v === 0 ? 'floor' : v <= value ? 'on' : 'spent')));
		if (value === start) {
			expect(writes()).toEqual([]); // the checked seal is a no-op
		} else {
			expect(writes()).toHaveLength(1);
			expect(last()).toMatchObject({ current_patience: value, current_interest: 3, initial_patience: 3 });
		}
		expect(root().querySelector('.dse-nt')!.getAttribute('data-ended') ?? null).toBe(endingOf(3, value));
	});

	// Left/Up = the previous seal, Right/Down = the next (both wrap), Home = 0, End = 5; selection follows focus.
	test.each(
		VALUES.flatMap((start) =>
			[
				['ArrowRight', (start + 1) % 6], ['ArrowDown', (start + 1) % 6], ['ArrowLeft', (start + 5) % 6], ['ArrowUp', (start + 5) % 6], ['Home', 0], ['End', 5],
			].map(([key, to]) => ({ start, key: key as string, to: to as number })),
		),
	)('patience $start: $key lands on $to', async ({ start, key, to }) => {
		const { root, writes, last, flush } = await mount(src({ current_patience: start }));
		const from = seal(root(), 'patience', start);
		from.focus();
		press(from, key);
		await flush();
		expect(checkedSeals(root(), 'patience')).toEqual([to]);
		expect(document.activeElement).toBe(seal(root(), 'patience', to));
		if (to === start) expect(writes()).toEqual([]);
		else {
			expect(writes()).toHaveLength(1);
			expect(last().current_patience).toBe(to);
		}
	});

	test.each([
		['below zero (-3)', -3, 0], ['past the max (7)', 7, 5], ['a quoted number ("4")', '4', 4], ['a fraction rounds to the nearest seal (2.6)', 2.6, 3],
	])('a hand-typed Patience %s (typed %j) is shown on seal %d: only the display is clamped, the note is untouched by rendering', async (_label, typed, shown) => {
		const { root, writes, flush } = await mount(src({ current_patience: typed }));
		await flush();
		expect(checkedSeals(root(), 'patience')).toEqual([shown]);
		expect(root().querySelector('.dse-nt__readout-value')!.textContent).toBe(String(shown));
		expect(writes()).toEqual([]);
	});
});

describe('SC-439 I: Interest rows — click from every start value to every value', () => {
	test.each(VALUES.flatMap((start) => VALUES.map((value) => ({ start, value }))))('interest $start: click row $value', async ({ start, value }) => {
		const { root, writes, last, flush } = await mount(src({ current_interest: start }));
		expect(checkedSeals(root(), 'interest')).toEqual([start]);
		seal(root(), 'interest', value).click();
		await flush();
		expect(checkedSeals(root(), 'interest')).toEqual([value]);
		// the "now" tag rides the checked row, and there is only ever one
		expect(root().querySelectorAll('.dse-nt__now')).toHaveLength(1);
		expect(seal(root(), 'interest', value).querySelector('.dse-nt__now')).not.toBeNull();
		if (value === start) expect(writes()).toEqual([]);
		else {
			expect(writes()).toHaveLength(1);
			expect(last()).toMatchObject({ current_interest: value, current_patience: 3 });
		}
		expect(root().querySelector('.dse-nt')!.getAttribute('data-ended') ?? null).toBe(endingOf(value, 3));
	});

	// The rows read 5..0 top to bottom, so Down/Right is the NEXT row (a LOWER interest), Home is 5, End is 0.
	const nextOf = (start: number, step: number): number => 5 - ((5 - start + step + 6) % 6);
	test.each(
		VALUES.flatMap((start) =>
			[
				['ArrowDown', nextOf(start, 1)], ['ArrowRight', nextOf(start, 1)], ['ArrowUp', nextOf(start, -1)], ['ArrowLeft', nextOf(start, -1)], ['Home', 5], ['End', 0],
			].map(([key, to]) => ({ start, key: key as string, to: to as number })),
		),
	)('interest $start: $key lands on $to', async ({ start, key, to }) => {
		const { root, writes, last, flush } = await mount(src({ current_interest: start }));
		const from = seal(root(), 'interest', start);
		from.focus();
		press(from, key);
		await flush();
		expect(checkedSeals(root(), 'interest')).toEqual([to]);
		expect(document.activeElement).toBe(seal(root(), 'interest', to));
		if (to === start) expect(writes()).toEqual([]);
		else {
			expect(writes()).toHaveLength(1);
			expect(last().current_interest).toBe(to);
		}
	});

	test.each([
		['below zero (-2): hostile', -2, 0, 'hostile'], ['past the max (9): a deal', 9, 5, 'deal'], ['a quoted number ("5"): a deal', '5', 5, 'deal'], ['a quoted number ("2")', '2', 2, null],
	])('a hand-typed Interest %s (typed %j) is shown on row %d, and rendering writes nothing', async (_label, typed, shown, ending) => {
		const { root, writes, flush } = await mount(src({ current_interest: typed }));
		await flush();
		expect(checkedSeals(root(), 'interest')).toEqual([shown]);
		expect(root().querySelector('.dse-nt')!.getAttribute('data-ended') ?? null).toBe(ending);
		expect(writes()).toEqual([]);
	});

	test('every row carries the authored outcome for its value', async () => {
		const { root } = await mount(src());
		for (const v of VALUES) expect(seal(root(), 'interest', v).querySelector('.dse-track__text')!.textContent).toBe(OFFERS[`i${v}` as keyof typeof OFFERS]);
	});
});

// -- E. standing x ending ----------------------------------------------------------------------------------------------------

describe('SC-439 E: Interest x Patience -> the ending, the band, the now-tag and what Complete offers (all 36 standings)', () => {
	test.each(VALUES.flatMap((interest) => VALUES.map((patience) => ({ interest, patience }))))('interest $interest / patience $patience', async ({ interest, patience }) => {
		const { root, writes } = await mount(src({ current_interest: interest, current_patience: patience }));
		const r = root();
		const ending = endingOf(interest, patience);
		expect(r.querySelector('.dse-nt')!.getAttribute('data-ended') ?? null).toBe(ending);
		const band = bandOf(r);
		if (ending === null) {
			expect(band).toBeNull();
			expect(ctls(r, 'negotiation.tier.row')).toHaveLength(4); // a live argument has its four tiers to choose from
			expect(hint(r)).toBe('Choose the test result to complete the argument');
		} else {
			expect(band!.getAttribute('data-kind')).toBe(ending);
			expect(band!.querySelector('.dse-nt__end-label')!.textContent).toBe(ending === 'final' ? 'Final offer' : 'Negotiation over');
			const offer = ending === 'deal' ? 'five' : ending === 'hostile' ? 'zero' : OFFERS[`i${interest}` as keyof typeof OFFERS];
			expect(band!.querySelector('.dse-nt__end-text strong')!.textContent).toBe(offer);
			expect(ctls(r, 'negotiation.tier.row')).toHaveLength(0); // nothing to choose once it is over: the tiers are static
			expect(hint(r)).toMatch(/^The negotiation is over/);
		}
		expect(r.querySelector('.dse-nt__now')!.textContent).toContain(ending === null ? 'now' : ending === 'final' ? 'final offer' : 'outcome');
		expect(complete(r).disabled).toBe(true); // armed only by a chosen tier, and never once over
		expect(writes()).toEqual([]);
	});
});

// -- M. motivation cards x spent / unspent x the argument ----------------------------------------------------------------------

describe('SC-439 M: the Spent chip on a motivation card, against the argument that is being built', () => {
	const arg = (used: string[]) => ({ motivationsUsed: used, pitfallsUsed: [], lieUsed: false, sameArgumentUsed: false, reusedMotivation: false });
	const spentChip = (root: HTMLElement, nth: number): HTMLElement => ctl(root, 'negotiation.spent', nth);

	test.each([
		// spent before, used by the argument, then the toggle -> spent after / reuse flag after
		{ label: 'unspent, not in the argument: marks it spent, the argument is untouched', spent: [], used: [], nth: 0, after: true, reuse: false },
		{ label: 'spent, not in the argument: marks it unspent, the argument is untouched', spent: [HA], used: [], nth: 0, after: false, reuse: false },
		{ label: 'unspent but appealed to in this argument: spending it makes the argument a reuse', spent: [], used: [HA], nth: 0, after: true, reuse: true },
		{ label: 'spent and appealed to in this argument (reuse on): unspending it clears the reuse', spent: [HA], used: [HA], nth: 0, after: false, reuse: false },
		{ label: 'both spent, both appealed to: unspending one leaves the reuse on (the other is still reused)', spent: [HA, PEACE], used: [HA, PEACE], nth: 0, after: false, reuse: true },
		{ label: 'a second motivation: Peace marked spent while only Higher Authority is in the argument', spent: [], used: [HA], nth: 1, after: true, reuse: false },
	])('$label', async ({ spent, used, nth, after, reuse }) => {
		const reusing = used.some((n) => spent.includes(n));
		const { root, writes, last, flush } = await mount(src({ currentArgument: { ...arg(used), reusedMotivation: reusing } }, spent));
		const name = [HA, PEACE][nth];
		expect(spentChip(root(), nth).getAttribute('aria-pressed')).toBe(String(spent.includes(name)));
		spentChip(root(), nth).click();
		await flush();
		expect(spentChip(root(), nth).getAttribute('aria-pressed')).toBe(String(after));
		expect(writes()).toHaveLength(1);
		const written = last();
		expect(written.motivations[nth].hasBeenAppealedTo).toBe(after);
		expect(written.currentArgument.reusedMotivation).toBe(reuse);
		expect(written.currentArgument.motivationsUsed).toEqual(used); // the cards never touch which motivations the argument uses
		// the card repaints in place: the glyph, the strike-through and the open count follow the model
		const row = spentChip(root(), nth).closest('.dse-nt__dos')!;
		expect(row.classList.contains('is-spent')).toBe(after);
		expect(row.querySelector('.dse-nt__dos-glyph')!.textContent).toBe(after ? '◇' : '◆');
		const openCount = [HA, PEACE].filter((n) => (n === name ? !after : !spent.includes(n))).length;
		expect(root().querySelector('.dse-nt__dossier-col[data-kind="motivation"] .dse-nt__dossier-count')!.textContent).toBe(`${openCount} of 2 open`);
		// the argument tab's chip and the reuse checkbox follow the card
		expect(chip(root(), 'motivation', nth).classList.contains('is-spent')).toBe(after);
		expect(mod(root(), 'reuse').disabled).toBe(!root().querySelector('.dse-nt__argument .dse-nt__chip.is-spent[aria-pressed="true"]'));
	});

	test('a pitfall has no Spent chip, and the open count only counts motivations', async () => {
		const { root } = await mount(src());
		expect(ctls(root(), 'negotiation.spent')).toHaveLength(2);
		expect(root().querySelectorAll('.dse-nt__dossier-col[data-kind="pitfall"] button')).toHaveLength(0);
		expect(root().querySelector('.dse-nt__dossier-col[data-kind="pitfall"] .dse-nt__dossier-count')!.textContent).toBe('1 known');
	});

});

// -- A. the argument: chips x modifiers x tier x Complete -----------------------------------------------------------------------

type Sel = { mot: 'none' | 'A' | 'B'; pit: boolean; lie: boolean; same: boolean };
const TIERS = ['low', 'mid', 'high', 'crit'] as const;

/** The book's argument table, worked out by hand. B (Peace) is the spent motivation in these runs, so appealing to it is a reuse. */
function delta(sel: Sel, tier: (typeof TIERS)[number]): [number, number] {
	const t = TIERS.indexOf(tier);
	let result: [number, number];
	if (sel.pit) result = [-1, -1];
	else if (sel.mot === 'B') result = [0, -1]; // reusing a spent motivation: Interest stays, Patience drops
	else if (sel.mot === 'A') result = ([[0, -1], [1, -1], [1, 0], [1, 0]] as Array<[number, number]>)[t];
	else if (sel.same) result = [-1, -1];
	else result = ([[-1, -1], [0, -1], [1, -1], [1, 0]] as Array<[number, number]>)[t];
	// a caught lie costs one more Interest whenever the argument did not raise it
	if (sel.lie && result[0] <= 0) result = [result[0] - 1, result[1]];
	return result;
}

describe('SC-439 A: Complete Argument — every legal combination of appeals and modifiers at every tier', () => {
	const sels: Sel[] = [];
	for (const mot of ['none', 'A', 'B'] as const) {
		for (const pit of [false, true]) {
			for (const lie of [false, true]) {
				for (const same of mot === 'none' ? [false, true] : [false]) sels.push({ mot, pit, lie, same });
			}
		}
	}
	const label = (s: Sel): string => `${s.mot === 'none' ? 'no appeal' : s.mot === 'A' ? 'appeal to Higher Authority' : 'appeal to the spent Peace'}${s.pit ? ' + pitfall' : ''}${s.lie ? ' + lie' : ''}${s.same ? ' + same argument' : ''}`;

	test.each(sels.flatMap((sel) => TIERS.map((tier) => ({ sel, tier, name: `${label(sel)} @ ${tier}` }))))('$name', async ({ sel, tier }) => {
		const { root, writes, last, flush } = await mount(src({ current_interest: 3, current_patience: 4 }, [PEACE]));
		if (sel.mot === 'A') chip(root(), 'motivation', 0).click();
		if (sel.mot === 'B') chip(root(), 'motivation', 1).click();
		if (sel.pit) chip(root(), 'pitfall', 0).click();
		if (sel.lie) mod(root(), 'lie').click();
		if (sel.same) mod(root(), 'same').click();
		// the modifier lines: reuse is only possible with the spent motivation, same-argument only without any motivation
		expect(mod(root(), 'reuse').disabled).toBe(sel.mot !== 'B');
		expect(mod(root(), 'reuse').checked).toBe(sel.mot === 'B');
		expect(mod(root(), 'same').disabled).toBe(sel.mot !== 'none');
		expect(complete(root()).disabled).toBe(true); // no tier chosen yet
		tierRow(root(), TIERS.indexOf(tier)).click();
		expect(complete(root()).disabled).toBe(false);
		expect(tierRow(root(), TIERS.indexOf(tier)).getAttribute('aria-checked')).toBe('true');
		expect(writes()).toEqual([]); // choosing never writes
		complete(root()).click();
		await flush();

		const [dI, dP] = delta(sel, tier);
		const clamp = (n: number): number => Math.max(0, Math.min(5, n));
		expect(writes()).toHaveLength(1);
		const written = last();
		expect([written.current_interest, written.current_patience]).toEqual([clamp(3 + dI), clamp(4 + dP)]);
		// the motivation just appealed to is spent; the argument is cleared
		expect(written.motivations[0].hasBeenAppealedTo ?? false).toBe(sel.mot === 'A');
		expect(written.motivations[1].hasBeenAppealedTo).toBe(true);
		expect(written.currentArgument ?? { motivationsUsed: [], pitfallsUsed: [], lieUsed: false, sameArgumentUsed: false, reusedMotivation: false }).toEqual({
			motivationsUsed: [], pitfallsUsed: [], lieUsed: false, sameArgumentUsed: false, reusedMotivation: false,
		});
		// and the card shows the new standing in place, with Complete disarmed
		expect(checkedSeals(root(), 'interest')).toEqual([clamp(3 + dI)]);
		expect(checkedSeals(root(), 'patience')).toEqual([clamp(4 + dP)]);
		expect(complete(root()).disabled).toBe(true);
		expect(ctls(root(), 'negotiation.tier.row').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(0);
	});
});

describe('SC-439 A: the tier rows state each tier\'s result, per combination of appeals', () => {
	const row = (root: HTMLElement, nth: number): string => tierRow(root, nth).querySelector('.dse-pr__text')!.textContent!;
	test.each([
		{ name: 'no appeal', click: [] as string[], rows: ['-1 Interest, -1 Patience', '-1 Patience', '+1 Interest, -1 Patience', '+1 Interest'] },
		{ name: 'an appeal to Higher Authority', click: ['A'], rows: ['-1 Patience', '+1 Interest, -1 Patience', '+1 Interest', '+1 Interest'] },
		{ name: 'an appeal to the spent Peace (a reuse)', click: ['B'], rows: ['-1 Patience', '-1 Patience', '-1 Patience', '-1 Patience'] },
		{ name: 'a pitfall (overrides an appeal)', click: ['A', 'P'], rows: ['-1 Interest, -1 Patience', '-1 Interest, -1 Patience', '-1 Interest, -1 Patience', '-1 Interest, -1 Patience'] },
		{ name: 'a caught lie', click: ['L'], rows: ['-2 Interest, -1 Patience', '-1 Interest, -1 Patience', '+1 Interest, -1 Patience', '+1 Interest'] },
		{ name: 'the same argument again', click: ['S'], rows: ['-1 Interest, -1 Patience', '-1 Interest, -1 Patience', '-1 Interest, -1 Patience', '-1 Interest, -1 Patience'] },
	])('$name', async ({ click, rows }) => {
		const { root } = await mount(src({}, [PEACE]));
		for (const c of click) {
			if (c === 'A') chip(root(), 'motivation', 0).click();
			if (c === 'B') chip(root(), 'motivation', 1).click();
			if (c === 'P') chip(root(), 'pitfall', 0).click();
			if (c === 'L') mod(root(), 'lie').click();
			if (c === 'S') mod(root(), 'same').click();
		}
		expect([0, 1, 2, 3].map((n) => row(root(), n))).toEqual(rows);
	});
});

describe('SC-439 A: Complete never writes past the 0..5 scale, from the edges of it', () => {
	test.each([
		{ name: 'Interest 4 + a crit reaches the deal at 5 and stops there', start: [4, 3], pick: ['A'], tier: 3, want: [5, 3] },
		{ name: 'Interest 4 + a high roll with an appeal reaches 5 (a deal) with Patience unchanged', start: [4, 3], pick: ['A'], tier: 2, want: [5, 3] },
		{ name: 'Interest 1 + a lie + the lowest tier would be -1, so it is 0 (hostile) and Patience 0 too', start: [1, 1], pick: ['L'], tier: 0, want: [0, 0] },
		{ name: 'Patience 1 + any argument that costs one is 0 (a final offer), Interest kept', start: [3, 1], pick: [], tier: 1, want: [3, 0] },
		{ name: 'Patience 5 + a crit that costs nothing stays 5', start: [3, 5], pick: [], tier: 3, want: [4, 5] },
		{ name: 'a pitfall and a caught lie together cost 2 Interest (0 from 2) and 1 Patience', start: [2, 4], pick: ['P', 'L'], tier: 3, want: [0, 3] },
	])('$name', async ({ start, pick, tier, want }) => {
		const { root, last, flush } = await mount(src({ current_interest: start[0], current_patience: start[1] }));
		if (pick.includes('A')) chip(root(), 'motivation', 0).click();
		if (pick.includes('P')) chip(root(), 'pitfall', 0).click();
		if (pick.includes('L')) mod(root(), 'lie').click();
		tierRow(root(), tier).click();
		complete(root()).click();
		await flush();
		expect([last().current_interest, last().current_patience]).toEqual(want);
	});
});

describe('SC-439 A: Complete Argument and the tier radiogroup — enabled or disabled, keys, no-op presses', () => {
	test.each([
		{ name: 'live, no tier chosen', over: {}, choose: null, disabled: true },
		{ name: 'live, a tier chosen', over: {}, choose: 2, disabled: false },
		{ name: 'Patience spent (a final offer), no tier to choose', over: { current_patience: 0 }, choose: null, disabled: true },
		{ name: 'a deal, no tier to choose', over: { current_interest: 5 }, choose: null, disabled: true },
		{ name: 'hostile, no tier to choose', over: { current_interest: 0 }, choose: null, disabled: true },
	])('$name: Complete is disabled=$disabled, and pressing it while disabled writes nothing', async ({ over, choose, disabled }) => {
		const { root, writes, flush } = await mount(src(over));
		if (choose !== null) tierRow(root(), choose).click();
		expect(complete(root()).disabled).toBe(disabled);
		if (disabled) {
			complete(root()).click();
			await flush();
			expect(writes()).toEqual([]);
		}
		expect(complete(root()).classList.contains('dse-btn--accent')).toBe(!disabled);
	});

	// ArrowDown/Right = next row, ArrowUp/Left = previous (both wrap), Home = Low, End = Crit: selection follows focus and arms Complete.
	test.each(
		[0, 1, 2, 3].flatMap((start) =>
			[
				['ArrowDown', (start + 1) % 4], ['ArrowRight', (start + 1) % 4], ['ArrowUp', (start + 3) % 4], ['ArrowLeft', (start + 3) % 4], ['Home', 0], ['End', 3],
			].map(([key, to]) => ({ start, key: key as string, to: to as number })),
		),
	)('from tier $start, $key chooses tier $to', async ({ start, key, to }) => {
		const { root, writes, flush } = await mount(src());
		tierRow(root(), start).click();
		tierRow(root(), start).focus();
		press(tierRow(root(), start), key);
		await flush();
		expect(ctls(root(), 'negotiation.tier.row').map((r) => r.getAttribute('aria-checked'))).toEqual([0, 1, 2, 3].map((n) => String(n === to)));
		expect(document.activeElement).toBe(tierRow(root(), to));
		expect(complete(root()).disabled).toBe(false);
		expect(writes()).toEqual([]);
	});

	test('before any tier is chosen the first row is the single Tab stop; a click moves it onto the chosen row', async () => {
		const { root } = await mount(src());
		expect(ctls(root(), 'negotiation.tier.row').map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
		tierRow(root(), 2).click();
		expect(ctls(root(), 'negotiation.tier.row').map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '-1', '0', '-1']);
	});

	test('a chosen tier stays chosen while the appeals change under it (its result is recomputed), and is dropped when the negotiation ends', async () => {
		const { root } = await mount(src({ current_patience: 2 }));
		tierRow(root(), 1).click();
		chip(root(), 'motivation', 0).click();
		expect(tierRow(root(), 1).getAttribute('aria-checked')).toBe('true');
		expect(tierRow(root(), 1).querySelector('.dse-pr__text')!.textContent).toBe('+1 Interest, -1 Patience');
		seal(root(), 'patience', 0).click(); // patience spent: the negotiation is over
		expect(ctls(root(), 'negotiation.tier.row')).toHaveLength(0);
		expect(complete(root()).disabled).toBe(true);
		seal(root(), 'patience', 2).click(); // re-opened: no tier is chosen any more
		expect(ctls(root(), 'negotiation.tier.row').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(0);
		expect(complete(root()).disabled).toBe(true);
	});
});

describe('SC-439 A: appeal / mention chips and the modifier lines, for every subset', () => {
	const SUBSETS: Array<{ name: string; mots: number[]; pit: boolean }> = [];
	for (const mots of [[], [0], [1], [0, 1]]) for (const pit of [false, true]) SUBSETS.push({ name: `motivations ${JSON.stringify(mots)}${pit ? ' + the pitfall' : ''}`, mots, pit });

	// Higher Authority (0) is unspent, Peace (1) is spent: the reuse line needs Peace, the same-argument line needs no motivation at all.
	test.each(SUBSETS)('$name', async ({ mots, pit }) => {
		const { root, writes, last, flush } = await mount(src({}, [PEACE]));
		for (const m of mots) chip(root(), 'motivation', m).click();
		if (pit) chip(root(), 'pitfall', 0).click();
		await flush();
		expect(ctls(root(), 'negotiation.appeal.motivation').map((c) => c.getAttribute('aria-pressed'))).toEqual([0, 1].map((m) => String(mots.includes(m))));
		expect(chip(root(), 'pitfall', 0).getAttribute('aria-pressed')).toBe(String(pit));
		const reuses = mots.includes(1);
		expect(mod(root(), 'reuse').disabled).toBe(!reuses);
		expect(mod(root(), 'reuse').checked).toBe(reuses);
		expect(mod(root(), 'same').disabled).toBe(mots.length > 0);
		expect(mod(root(), 'lie').disabled).toBe(false);
		// the reason a line is greyed out is shown on that line, and only while it is
		const why = (w: 'reuse' | 'same'): string | null => mod(root(), w).closest('label')!.querySelector('.dse-nt__why')?.textContent ?? null;
		expect(why('reuse')).toBe(reuses ? null : 'only when a spent Motivation is appealed to');
		expect(why('same')).toBe(mots.length > 0 ? 'not while a Motivation is appealed to' : null);
		if (mots.length === 0 && !pit) expect(writes()).toHaveLength(0);
		else {
			expect(writes()).toHaveLength(1);
			expect(last().currentArgument.motivationsUsed).toEqual(mots.map((m) => [HA, PEACE][m]));
			expect(last().currentArgument.pitfallsUsed).toEqual(pit ? [POWER] : []);
			expect(last().currentArgument.reusedMotivation).toBe(reuses);
		}
	});

	test('clicking a chip twice undoes it (the argument is back to what the block never declared, so the key is not written), and a greyed-out modifier ignores a press', async () => {
		const { root, writes, last, flush } = await mount(src({}, [PEACE]));
		chip(root(), 'motivation', 1).click();
		chip(root(), 'motivation', 1).click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last().currentArgument).toBeUndefined();
		expect(mod(root(), 'reuse').disabled).toBe(true);
		mod(root(), 'reuse').click(); // disabled: the browser sends no click, jsdom neither
		await flush();
		expect(writes()).toHaveLength(1);
	});

	test('the three modifiers write their own flag: lie, same-argument and (with the spent motivation appealed) reuse switched off by hand', async () => {
		const { root, last, flush } = await mount(src({}, [PEACE]));
		mod(root(), 'lie').click();
		mod(root(), 'same').click();
		await flush();
		expect(last().currentArgument).toMatchObject({ lieUsed: true, sameArgumentUsed: true, reusedMotivation: false });
		mod(root(), 'same').click();
		chip(root(), 'motivation', 1).click(); // reuse switches itself on...
		expect(mod(root(), 'reuse').checked).toBe(true);
		mod(root(), 'reuse').click(); // ...and the Director may switch it back off: that choice sticks
		await flush();
		expect(last().currentArgument).toMatchObject({ lieUsed: true, sameArgumentUsed: false, reusedMotivation: false });
	});
});

// -- R. reset from every state --------------------------------------------------------------------------------------------------

describe('SC-439 R: Reset negotiation, from every kind of state', () => {
	const STATES: Array<{ name: string; source: string }> = [
		{ name: 'the standing moved (interest 1, patience 1)', source: src({ current_interest: 1, current_patience: 1 }) },
		{ name: 'a final offer (patience 0)', source: src({ current_patience: 0 }) },
		{ name: 'a deal (interest 5)', source: src({ current_interest: 5 }) },
		{ name: 'hostile (interest 0)', source: src({ current_interest: 0 }) },
		{ name: 'both motivations spent', source: src({}, [HA, PEACE]) },
		{ name: 'an argument under way: both kinds of appeal and a lie', source: src({ currentArgument: { motivationsUsed: [HA], pitfallsUsed: [POWER], lieUsed: true, sameArgumentUsed: false, reusedMotivation: false } }) },
		{ name: 'hand-typed standing ("2" quoted, 9 past the scale)', source: src({ current_patience: '2', current_interest: 9 }) },
		{ name: 'the initial state already (nothing to reset)', source: src() },
	];

	test.each(STATES)('$name', async ({ source }) => {
		const { root, writes, last, flush, host } = await mount(source);
		ctl(root(), 'negotiation.menu').click();
		expect(Menu.lastMenu!.items).toHaveLength(1);
		expect(writes()).toEqual([]); // opening the menu is not a write
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		expect(Notice.notices).toContain('Negotiation reset to initial state');
		const r = host.containerEl.firstElementChild as HTMLElement;
		expect(checkedSeals(r, 'patience')).toEqual([3]);
		expect(checkedSeals(r, 'interest')).toEqual([3]);
		expect(r.querySelector('.dse-nt')!.hasAttribute('data-ended')).toBe(false);
		expect(bandOf(r)).toBeNull();
		expect(ctls(r, 'negotiation.spent').map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
		expect(ctls(r, 'negotiation.appeal.motivation').concat(ctls(r, 'negotiation.appeal.pitfall')).map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
		expect([mod(r, 'reuse'), mod(r, 'lie'), mod(r, 'same')].map((m) => m.checked)).toEqual([false, false, false]);
		expect(ctls(r, 'negotiation.tier.row').filter((t) => t.getAttribute('aria-checked') === 'true')).toHaveLength(0);
		expect(complete(r).disabled).toBe(true);
		// exactly one write, carrying the initial standing, no spent motivation and a cleared argument
		expect(writes()).toHaveLength(1);
		const w = last();
		expect([w.current_patience, w.current_interest]).toEqual([3, 3]);
		expect(w.motivations.map((m: any) => m.hasBeenAppealedTo ?? false)).toEqual([false, false]);
		expect(w.currentArgument ?? { motivationsUsed: [], pitfallsUsed: [], lieUsed: false, sameArgumentUsed: false, reusedMotivation: false }).toEqual({
			motivationsUsed: [], pitfallsUsed: [], lieUsed: false, sameArgumentUsed: false, reusedMotivation: false,
		});
	});

	test('the tab the Director was on survives the rebuild', async () => {
		const { root, flush, host } = await mount(src({ current_patience: 1 }));
		tabOf(root(), 'learn-more').click();
		ctl(root(), 'negotiation.menu').click();
		Menu.lastMenu!.items[0].onClickCallback!();
		await flush();
		const r = host.containerEl.firstElementChild as HTMLElement;
		expect(tabOf(r, 'learn-more').getAttribute('aria-selected')).toBe('true');
		expect(panelOf(r, 'learn-more').hidden).toBe(false);
	});

	test('the menu button and its one item exist only where a write can land (a read-only host has neither)', async () => {
		const live = await mount(src());
		expect(ctls(live.root(), 'negotiation.menu')).toHaveLength(1);
		document.body.innerHTML = '';
		const readOnly = await mount(src(), { canPersist: false });
		expect(ctls(readOnly.root(), 'negotiation.menu')).toHaveLength(0);
	});
});

// -- X. the note around a write ---------------------------------------------------------------------------------------------------

describe('SC-439 X: a write lands in its own block and nowhere else in the note', () => {
	const NOTE_BEFORE = '# Session 4\n\nABOVE: the **innkeeper** scene, `inline code`, a [[link]] and a rule\n\n---\n\n';
	const SIBLING = '```js\nconst keep = "this fence stays";\n```\n\n';
	const BETWEEN = '\nBETWEEN the two negotiations\n\n';
	const NOTE_AFTER = '\nBELOW: closing prose\n\n- a list\n- of things\n';
	const fence = (body: string): string => '```ds-negotiation\n' + body + '\n```\n';
	const bodyA = src({ name: 'First' });
	const bodyB = src({ name: 'Second', current_interest: 2 });
	const NOTE = NOTE_BEFORE + SIBLING + fence(bodyA) + BETWEEN + fence(bodyB) + NOTE_AFTER;
	const bodies = [bodyA, bodyB];

	/** The note with the body of the n-th negotiation fence blanked out: what must be byte-identical after a write to it. */
	const outside = (note: string, n: number): string => {
		let i = -1;
		return note.replace(/```ds-negotiation\n([\s\S]*?)\n```/g, (all) => (++i === n ? '```ds-negotiation\n@@\n```' : all));
	};
	const bodyOf = (note: string, n: number): string => [...note.matchAll(/```ds-negotiation\n([\s\S]*?)\n```/g)][n][1];

	/** Mount block `n` of NOTE through a real ReadingModeBlockHost over a real FakeVault. */
	async function mountBlock(n: number, note = NOTE) {
		jest.useFakeTimers();
		const app = new App();
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md', n);
		document.body.appendChild(ctx.el);
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-negotiation');
		await new ElementPipeline(makeDeps()).run(negotiationElement, bodyOf(note, n), host);
		const root = ctx.el.firstElementChild as HTMLElement;
		return { app, root, flush: () => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50) };
	}

	const ACTIONS: Array<{ name: string; act: (root: HTMLElement) => void }> = [
		{ name: 'a Patience seal', act: (r) => seal(r, 'patience', 1).click() },
		{ name: 'an Interest row', act: (r) => seal(r, 'interest', 4).click() },
		{ name: 'an appeal chip', act: (r) => chip(r, 'motivation', 0).click() },
		{ name: 'a pitfall chip', act: (r) => chip(r, 'pitfall', 0).click() },
		{ name: 'a Spent chip', act: (r) => ctl(r, 'negotiation.spent', 0).click() },
		{ name: 'a modifier checkbox', act: (r) => mod(r, 'lie').click() },
		{ name: 'Complete Argument', act: (r) => { tierRow(r, 2).click(); complete(r).click(); } },
		{ name: 'Reset negotiation', act: (r) => { seal(r, 'patience', 1).click(); ctl(r, 'negotiation.menu').click(); Menu.lastMenu!.items[0].onClickCallback!(); } },
	];

	test.each(ACTIONS.flatMap((a) => [0, 1].map((n) => ({ ...a, n, name: `${a.name} in block ${n}` }))))('$name: the other block, the prose, the code fence and the rule are byte-identical', async ({ act, n }) => {
		const { app, root, flush } = await mountBlock(n);
		act(root);
		await flush();
		const after = app.vault.getContent('Note.md')!;
		expect(after).not.toBe(NOTE);
		expect(outside(after, n)).toBe(outside(NOTE, n));
		expect(bodyOf(after, n)).not.toBe(bodies[n]); // and the block itself did change
		expect(bodyOf(after, 1 - n)).toBe(bodies[1 - n]);
	});

	test.each([0, 1])('two IDENTICAL blocks: a write in block %i changes that block only, and the twin and the prose stay byte-identical', async (n) => {
		const twin = fence(bodyA);
		const twins = NOTE_BEFORE + SIBLING + twin + BETWEEN + twin + NOTE_AFTER;
		const { app, root, flush } = await mountBlock(n, twins);
		seal(root, 'patience', 1).click();
		await flush();
		const after = app.vault.getContent('Note.md')!;
		expect(bodyOf(after, n)).not.toBe(bodyA);
		expect(bodyOf(after, 1 - n)).toBe(bodyA);
		expect(outside(after, n)).toBe(outside(twins, n));
		// and the other twin takes its own write next, from its own state
		const second = await mountBlock(1 - n, after);
		seal(second.root, 'interest', 4).click();
		await second.flush();
		const both = second.app.vault.getContent('Note.md')!;
		expect(bodyOf(both, n)).toBe(bodyOf(after, n));
		expect((parseYaml(bodyOf(both, 1 - n)) as any).current_interest).toBe(4);
		expect(outside(both, 1 - n)).toBe(outside(after, 1 - n));
	});

	test('a block somebody edited by hand since the card was drawn: drawn afresh, the next write keeps the hand edit and the prose edit', async () => {
		const edited = NOTE.replace('ABOVE:', 'ABOVE (edited):').replace('i5: five', 'i5: five EDITED').replace('reason: duty', 'reason: duty EDITED');
		const { app, root, flush } = await mountBlock(0, edited);
		seal(root, 'patience', 1).click();
		await flush();
		const after = app.vault.getContent('Note.md')!;
		expect(after).toContain('ABOVE (edited):');
		expect(bodyOf(after, 0)).toContain('i5: five EDITED');
		expect(bodyOf(after, 0)).toContain('reason: duty EDITED');
		expect(bodyOf(after, 0)).toContain('current_patience: 1');
		expect(outside(after, 0)).toBe(outside(edited, 0));
	});

	test('two writes in a row to the same block each land (the second starts from the first)', async () => {
		const { app, root, flush } = await mountBlock(1);
		seal(root, 'patience', 1).click();
		await flush();
		seal(root, 'interest', 4).click();
		await flush();
		const written = parseYaml(bodyOf(app.vault.getContent('Note.md')!, 1)) as any;
		expect([written.current_patience, written.current_interest]).toEqual([1, 4]);
		expect(outside(app.vault.getContent('Note.md')!, 1)).toBe(outside(NOTE, 1));
	});
});
