// SC-437 — the initiative tracker's combinatorial logic as tables (values x states x variants), driven through the REAL
// ElementPipeline with real clicks / key events on the controls' `data-dse-control` ids and read back from the bytes the
// host is asked to write. The e2e specs (e2e/specs/initiative/) then drive one plain scenario per manifest pair; this file
// holds the permutations that do not need a real browser. Scenario groups follow e2e/manifest/initiative.ts:
// T title edit, R round, M Malice, N turn, A action checklist, K captain, S selection, X reset.
import { ElementPipeline, prepareModel } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, parseYaml } from '../../mocks/obsidian';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { ResetEncounterModal } from '../../../src/views/ResetEncounterModal';
import { attachObsidianKeymap, pressEscape } from '../_obsidianKeymap';

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_s: string) => true);
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Encounter.md',
		containerEl,
		canPersist: true,
		addChild: (c: unknown) => c,
		getBlockInfo: () => ({ language: 'ds-initiative', lineStart: 0, lineEnd: 40 }),
		replaceSource,
		blockKey: () => 'Encounter.md::ds-initiative::0',
		...overrides,
	};
	return host as unknown as BlockHost & { containerEl: HTMLElement; replaceSource: jest.Mock };
}

function makeDeps(vault: Record<string, string> = {}): ElementPipelineDeps {
	const app = new App();
	app.vault.setFile('Media/token_1.png', '');
	for (const [path, text] of Object.entries(vault)) app.vault.setFile(path, text);
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

/** Mount `src` and hand back the root plus readers for what was written. Fake timers: `flush()` lands the debounced write.
 *  A `vault` (notes the block's `statblock:` refs read) makes the mount use REAL timers instead: the vault read does not
 *  settle under fake ones, and `flush()` then waits the debounce out for real. */
async function mount(src: string, overrides: Partial<BlockHost> = {}, vault: Record<string, string> = {}) {
	const real = Object.keys(vault).length > 0;
	if (!real) jest.useFakeTimers();
	const host = makeHost(overrides);
	const deps = makeDeps(vault);
	await new ElementPipeline(deps).run(initiativeElement, src, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	const flush = async (): Promise<void> => {
		if (real) await new Promise((resolve) => setTimeout(resolve, PERSIST_DEBOUNCE_MS + 60));
		else await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	};
	const writes = (): string[] => host.replaceSource.mock.calls.map((c) => c[0] as string);
	const last = (): any => parseYaml(writes()[writes().length - 1]);
	return { host, root, flush, writes, last, deps };
}

/** The n-th node carrying a control id (throws when absent, so a missing control is a failure, not a silent no-op). */
const ctl = <T extends HTMLElement = HTMLElement>(root: Element, id: string, n = 0): T => {
	const el = root.querySelectorAll<T>(`[data-dse-control="${id}"]`)[n];
	if (!el) throw new Error(`no [data-dse-control="${id}"][${n}]`);
	return el;
};
const has = (root: Element, id: string): boolean => root.querySelector(`[data-dse-control="${id}"]`) !== null;
const press = (el: HTMLElement, key: string, init: KeyboardEventInit = {}): void => {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
};

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
});

const HEROES = ['heroes:', '  - name: "Alice"', '    max_stamina: 30', '  - name: "Bruno"', '    max_stamina: 40'];
const OGRES = ['enemy_groups:', '  - name: "Ogres"', '    creatures:', '      - name: "Ogre"', '        max_stamina: 60', '        amount: 3'];
const src = (...parts: string[][]): string => parts.map((p) => p.join('\n')).join('\n');
const TRACKER = src(HEROES, OGRES, ['malice:', '  value: 3']);

// ---------------------------------------------------------------------------------------------------- T. title edit

describe('[T] the title edit: open gesture x finish gesture x starting title x typed text', () => {
	const titled = (name: string): string => `name: "${name}"\n${TRACKER}`;
	const text = (root: Element): HTMLElement => root.querySelector('.dse-init__title-text') as HTMLElement;
	const field = (root: Element): HTMLTextAreaElement | null => root.querySelector('.dse-init__title-input');

	test.each([
		['click', (el: HTMLElement) => el.click(), true],
		['Enter', (el: HTMLElement) => press(el, 'Enter'), true],
		['Space', (el: HTMLElement) => press(el, ' '), true],
		['another key (a)', (el: HTMLElement) => press(el, 'a'), false],
		['Escape', (el: HTMLElement) => press(el, 'Escape'), false],
	])('[T01-T03] %s on the title text %s the editor', async (_gesture, act, opens) => {
		const { root } = await mount(titled('Old'));
		act(ctl(root, 'init.title'));
		expect(field(root) !== null).toBe(opens);
		expect(text(root).hidden).toBe(opens);
		if (opens) expect(ctl(root, 'init.title.input')).toBe(field(root));
	});

	test.each([
		// starting title, typed text, finish gesture, resulting title (undefined = no title key), writes
		['untitled', 'New', 'Enter', 'New', 1],
		['untitled', 'New', 'Shift+Enter', 'New', 1],
		['untitled', 'New', 'blur', 'New', 1],
		['untitled', 'New', 'Escape', undefined, 0],
		['untitled', '   ', 'blur', undefined, 0],
		['untitled', '   ', 'Enter', undefined, 0],
		['Old', 'New', 'Enter', 'New', 1],
		['Old', 'New', 'Shift+Enter', 'New', 1],
		['Old', 'New', 'blur', 'New', 1],
		['Old', 'New', 'Escape', 'Old', 0],
		['Old', '', 'Enter', undefined, 1],
		['Old', '   ', 'blur', undefined, 1],
		['Old', '  Old  ', 'Enter', 'Old', 0],
		['Old', 'Old', 'blur', 'Old', 0],
		['Old', 'two\nlines', 'Enter', 'two lines', 1],
	] as const)('[T04-T07] %s, typed %j, finished by %s -> title %j with %i write(s)', async (start, typed, finish, expected, writeCount) => {
		const { root, flush, writes, last } = await mount(start === 'untitled' ? TRACKER : titled(start));
		ctl(root, 'init.title').click();
		const input = ctl<HTMLTextAreaElement>(root, 'init.title.input');
		expect(input.value).toBe(start === 'untitled' ? '' : start);
		input.value = typed;
		if (finish === 'blur') input.dispatchEvent(new FocusEvent('blur'));
		else if (finish === 'Shift+Enter') press(input, 'Enter', { shiftKey: true });
		else press(input, finish);
		await flush();
		expect(field(root)).toBeNull(); // the editor is always gone afterwards
		expect(text(root).hidden).toBe(false);
		expect(text(root).textContent).toBe(expected ?? '');
		expect(root.querySelector('.dse-init__title')!.hasAttribute('data-empty')).toBe(expected === undefined);
		expect(writes()).toHaveLength(writeCount);
		if (writeCount) {
			if (expected === undefined) expect(last().name).toBeUndefined();
			else {
				expect(last().name).toBe(expected);
				expect(writes()[0].startsWith('name:')).toBe(true); // a title is written first, where an author puts it
			}
		}
	});

	test('[T04-T06] focus goes back to the text after Enter and Escape, and stays where the user put it after a blur', async () => {
		for (const finish of ['Enter', 'Escape', 'blur']) {
			const { root } = await mount(titled('Old'));
			ctl(root, 'init.title').click();
			const input = ctl<HTMLTextAreaElement>(root, 'init.title.input');
			input.value = 'Other';
			if (finish === 'blur') input.dispatchEvent(new FocusEvent('blur'));
			else press(input, finish);
			expect(document.activeElement === text(root)).toBe(finish !== 'blur');
			document.body.innerHTML = '';
		}
	});

	test.each(['Ambush: part 2', '# not a comment', '- dash first', 'true', 'null', '123', "it's", '"quoted"', 'a  b', '日本語'])(
		'[T04] the title %j survives a write and a re-parse unchanged',
		async (title) => {
			const { root, flush, last } = await mount(TRACKER);
			ctl(root, 'init.title').click();
			const input = ctl<HTMLTextAreaElement>(root, 'init.title.input');
			input.value = title;
			press(input, 'Enter');
			await flush();
			expect(last().name).toBe(title);
		},
	);
});

// ------------------------------------------------------------------------------------- R. round, N. turn taken

describe('[R] Advance round vs Reset turns: starting round x round_gain x what is marked', () => {
	const marked = (round: number | undefined, gain: number | undefined): string =>
		src(
			['heroes:', '  - name: "Alice"', '    max_stamina: 30', '    has_taken_turn: true', '    actions: { main: true, maneuver: false, move: true, triggered: true }',
				'  - name: "Bruno"', '    max_stamina: 40'],
			OGRES,
			['    has_taken_turn: true'],
			['malice:', '  value: 3', ...(gain === undefined ? [] : [`  round_gain: ${gain}`])],
			round === undefined ? [] : [`round: ${round}`],
		);
	const advance = (root: Element): void => ctl(root, 'init.round.advance').click();
	const resetTurns = (root: Element): void => ctl(root, 'init.reset-turns').click();

	test.each([
		// starting round, round_gain, resulting round, resulting Malice, log entries
		[undefined, undefined, 2, 3, 0],
		[1, undefined, 2, 3, 0],
		[4, undefined, 5, 3, 0],
		[1, 0, 2, 3, 0],
		[1, 2, 2, 5, 1],
		[4, 3, 5, 6, 1],
		[1, -2, 2, 1, 1], // a negative gain still applies...
		[1, -5, 2, 0, 1], // ...and stops at 0 (the log shows the -3 it applied, and the -5 asked for: SC-578)
	] as const)('[R01] Advance round from round %s with round_gain %s -> round %i, Malice %i, %i log entr(ies); every turn mark and checklist cleared', async (round, gain, nextRound, malice, logLen) => {
		const { root, flush, last, writes } = await mount(marked(round, gain));
		advance(root);
		await flush();
		expect(writes()).toHaveLength(1);
		const data = last();
		expect(data.round).toBe(nextRound);
		expect(data.malice.value).toBe(malice);
		expect(data.malice.log ?? []).toHaveLength(logLen);
		if (logLen) {
			// SC-578: `amount` is what the pool did (Malice went from 3 to `malice`); `requested` appears only when that differs from the gain.
			const applied = malice - 3;
			expect(data.malice.log[0]).toEqual({ round: nextRound, amount: applied, label: 'Round gain', ...(applied === gain ? {} : { requested: gain }) });
		}
		expect(data.heroes[0].has_taken_turn).toBe(false);
		expect(data.heroes[0].actions).toEqual({ main: false, maneuver: false, move: false, triggered: false });
		expect(data.heroes[1].actions).toBeUndefined(); // never toggled: nothing is fabricated
		expect(data.enemy_groups[0].has_taken_turn).toBe(false);
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe(`Round ${nextRound}`);
	});

	test.each([undefined, 1, 4])('[R02] Reset turns from round %s clears the same marks and leaves the round, Malice and log alone', async (round) => {
		const { root, flush, last, writes } = await mount(marked(round, 2));
		resetTurns(root);
		await flush();
		expect(writes()).toHaveLength(1);
		const data = last();
		expect(data.round).toBe(round);
		expect(data.malice).toEqual({ value: 3, round_gain: 2 });
		expect(data.heroes[0].has_taken_turn).toBe(false);
		expect(data.heroes[0].actions).toEqual({ main: false, maneuver: false, move: false, triggered: false });
		expect(data.enemy_groups[0].has_taken_turn).toBe(false);
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe(`Round ${round ?? 1}`);
	});

	test.each([
		[undefined, 'Advance round'],
		[0, 'Advance round'],
		[2, 'Advance round (+2 Malice)'],
		[-3, 'Advance round (-3 Malice)'],
	])('[R01] round_gain %s labels the Advance round button %j', async (gain, label) => {
		const { root } = await mount(marked(undefined, gain));
		expect(ctl(root, 'init.round.advance').getAttribute('aria-label')).toBe(label);
	});
});

describe('[N] turn taken: control x starting state, and the controls agree', () => {
	test.each([
		['init.hero.turn', false, true],
		['init.hero.turn', true, false],
		['init.hero.turnbox', false, true],
		['init.hero.turnbox', true, false],
	] as const)('[N01-N02] %s on a hero who %s taken a turn flips has_taken_turn to %s, in both controls, in one write', async (id, startTaken, expected) => {
		const source = src(['heroes:', '  - name: "Alice"', '    max_stamina: 30', `    has_taken_turn: ${startTaken}`], OGRES);
		const { root, flush, last, writes } = await mount(source);
		ctl(root, id).click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last().heroes[0].has_taken_turn).toBe(expected);
		for (const control of ['init.hero.turn', 'init.hero.turnbox']) expect(ctl(root, control).getAttribute('aria-pressed')).toBe(String(expected));
		expect(ctl(root, 'init.hero.turn').hasAttribute('data-taken')).toBe(expected);
	});

	test.each([false, true])('[N03] the enemy group header button with has_taken_turn: %s flips the group only', async (startTaken) => {
		const source = src(HEROES, OGRES, [`    has_taken_turn: ${startTaken}`]);
		const { root, flush, last } = await mount(source);
		ctl(root, 'init.group.turn').click();
		await flush();
		expect(last().enemy_groups[0].has_taken_turn).toBe(!startTaken);
		expect(last().heroes.map((h: any) => h.has_taken_turn)).toEqual([undefined, undefined]);
		expect(ctl(root, 'init.group.turn').getAttribute('aria-pressed')).toBe(String(!startTaken));
	});

	test('[N01] two heroes keep their own turn state; only the clicked one changes', async () => {
		const { root, flush, last } = await mount(TRACKER);
		ctl(root, 'init.hero.turn', 1).click();
		await flush();
		expect(last().heroes.map((h: any) => h.has_taken_turn)).toEqual([undefined, true]);
		expect(ctl(root, 'init.hero.turn', 0).getAttribute('aria-pressed')).toBe('false');
	});
});

// -------------------------------------------------------------------------------------------------- A. action pips

describe('[A] action checklists: which slots end up pressed after a sequence of presses', () => {
	const slotsOf = (root: Element, id: string): Record<string, boolean> =>
		Object.fromEntries(Array.from(root.querySelectorAll<HTMLElement>(`[data-dse-control="${id}"]`)).map((b) => [b.getAttribute('data-slot')!, b.getAttribute('aria-pressed') === 'true']));
	const pressed = (slots: Record<string, boolean>): string[] => Object.keys(slots).filter((k) => slots[k]);

	test.each([
		[['main'], ['main']],
		[['move', 'triggered'], ['move', 'triggered']],
		[['main', 'maneuver', 'move', 'triggered'], ['main', 'maneuver', 'move', 'triggered']],
		[['main', 'main'], []],
		[['triggered', 'move', 'triggered'], ['move']],
	])('[A01] a hero: pressing %j leaves %j pressed (slots are independent), written on the hero only', async (presses, expected) => {
		const { root, flush, last } = await mount(TRACKER);
		const order = ['main', 'maneuver', 'move', 'triggered'];
		for (const slot of presses) ctl(root, 'init.hero.action', order.indexOf(slot)).click();
		await flush();
		const alice = root.querySelector('.dse-init__group--heroes .dse-init__entry') as HTMLElement;
		expect(pressed(slotsOf(alice, 'init.hero.action'))).toEqual(order.filter((s) => expected.includes(s)));
		expect(Object.keys(last().heroes[0].actions).sort()).toEqual(['main', 'maneuver', 'move', 'triggered']);
		expect(last().heroes[1].actions).toBeUndefined();
	});

	test('[A02] a creature instance: the four slots are bound to the SELECTED instance only', async () => {
		const { root, flush, last } = await mount(TRACKER);
		ctl(root, 'init.detail.action', 3).click(); // Triggered on Ogre #1
		ctl(root, 'init.cell.stamina', 1).click(); // select Ogre #2
		await flush();
		expect(pressed(slotsOf(root, 'init.detail.action'))).toEqual([]);
		ctl(root, 'init.cell.stamina', 0).click(); // and back to #1
		expect(pressed(slotsOf(root, 'init.detail.action'))).toEqual(['triggered']);
		await flush();
		const ogre = last().enemy_groups[0].creatures[0];
		expect(ogre.instances[0].actions.triggered).toBe(true);
		expect(ogre.instances[1].actions).toBeUndefined();
	});

	const SQUAD = src(HEROES, ['enemy_groups:', '  - name: "Goblins"', '    is_squad: true', '    creatures:', '      - name: "Goblin"', '        max_stamina: 4', '        amount: 3', '        squad_role: minion']);
	test.each([
		[['main'], ['main']],
		[['main', 'maneuver'], ['maneuver']],
		[['maneuver', 'second_move'], ['second_move']],
		[['second_move', 'main'], ['main']],
		[['main', 'move'], ['main', 'move']],
		[['move', 'second_move'], ['move', 'second_move']],
		[['main', 'triggered', 'maneuver'], ['maneuver', 'triggered']],
		[['main', 'main'], []],
		[['move', 'move'], []],
		[['move', 'main', 'maneuver', 'second_move', 'triggered'], ['move', 'second_move', 'triggered']],
	])('[A03-A04] a minion squad: pressing %j leaves %j (Main, Maneuver and Second move exclude each other)', async (presses, expected) => {
		const { root, flush, last } = await mount(SQUAD);
		const order = ['move', 'main', 'maneuver', 'second_move', 'triggered'];
		for (const slot of presses) ctl(root, 'init.detail.squad-action', order.indexOf(slot)).click();
		await flush();
		expect(pressed(slotsOf(root, 'init.detail.squad-action'))).toEqual(order.filter((s) => expected.includes(s)));
		const written = last().enemy_groups[0].creatures[0].actions;
		expect(Object.keys(written).filter((k) => written[k]).sort()).toEqual([...expected].sort());
		expect(has(root, 'init.detail.action')).toBe(false); // a minion row carries the squad's checklist, not its own
	});

	test('[A03] every minion cell of the squad shows the SAME checklist state', async () => {
		const { root } = await mount(SQUAD);
		ctl(root, 'init.detail.squad-action', 0).click();
		ctl(root, 'init.cell.stamina', 2).click();
		expect(pressed(slotsOf(root, 'init.detail.squad-action'))).toEqual(['move']);
	});
});

// ------------------------------------------------------------------------------------------------------- M. Malice

describe('[M] Malice: the stepper, the quick-add row and the log disclosure', () => {
	const withMalice = (value: number, extra: string[] = []): string => src(HEROES, OGRES, ['malice:', `  value: ${value}`, ...extra]);
	const shown = (root: Element): string => root.querySelector('.dse-init__malice-value')!.textContent as string;
	const logLines = (root: Element): string[] => [...root.querySelectorAll('.dse-init__malice-log-entry')].map((e) => e.textContent as string);

	test.each([
		[3, ['inc'], 4],
		[3, ['dec'], 2],
		[3, ['inc', 'inc', 'dec'], 4],
		[0, ['inc'], 1],
		[10, ['dec', 'dec', 'dec'], 7],
	] as const)('[M01-M02] from %i, pressing %j gives Malice %i; one coalesced write and the display agrees', async (start, presses, expected) => {
		const { root, flush, last, writes } = await mount(withMalice(start));
		for (const p of presses) ctl(root, `init.malice.${p}`).click();
		expect(shown(root)).toBe(`Malice: ${expected}`);
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last().malice.value).toBe(expected);
		expect(has(root, 'init.malice.value')).toBe(true);
	});

	test.each([
		// amount, label, starting Malice -> hint (rejected) | resulting Malice (accepted); the field that takes focus
		['', 'Gain', 3, 'Amount required', 'amount'],
		['1.5', 'Gain', 3, 'Whole numbers only', 'amount'],
		['1e2', 'Gain', 3, 'Whole numbers only', 'amount'],
		['0', 'Gain', 3, 'Not zero', 'amount'],
		['-0', 'Gain', 3, 'Not zero', 'amount'],
		['5', '', 3, 'Label required', 'label'],
		['5', '   ', 3, 'Label required', 'label'],
	] as const)('[M03-M05] a rejected quick-add (amount %j, label %j) says %j and writes nothing', async (amount, label, start, hint, focused) => {
		const { root, flush, writes } = await mount(withMalice(start));
		const amountEl = ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount');
		const labelEl = ctl<HTMLInputElement>(root, 'init.malice.quickadd.label');
		amountEl.value = amount;
		labelEl.value = label;
		ctl(root, 'init.malice.quickadd.add').click();
		await flush();
		expect(writes()).toHaveLength(0);
		expect(root.querySelector('.dse-init__malice-quickadd-hint')!.textContent).toBe(hint);
		expect(document.activeElement).toBe(focused === 'amount' ? amountEl : labelEl);
		expect((focused === 'amount' ? amountEl : labelEl).getAttribute('aria-invalid')).toBe('true');
	});

	test.each([
		['5', 'Gain', 3, 8],
		['007', 'Gain', 3, 10],
		['-2', 'Spend', 5, 3],
		['-5', 'Spend', 5, 0],
	] as const)('[M03-M05] a valid quick-add (amount %j, label %j) from Malice %i gives Malice %i and one log entry', async (amount, label, start, expected) => {
		const { root, flush, last, writes } = await mount(withMalice(start));
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = amount;
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = label;
		ctl(root, 'init.malice.quickadd.add').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last().malice.value).toBe(expected);
		expect(last().malice.log).toEqual([{ round: 1, amount: Number(amount), label }]);
		expect(shown(root)).toBe(`Malice: ${expected}`);
	});

	test('[M03-M05] a quick-add the pool clamps (-9 from 2) still lands Malice at 0 with one entry that still names its label', async () => {
		const { root, flush, last, writes } = await mount(withMalice(2));
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = '-9';
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = 'Spend';
		ctl(root, 'init.malice.quickadd.add').click();
		await flush();
		expect(writes()).toHaveLength(1);
		expect(last().malice.value).toBe(0);
		expect(last().malice.log).toHaveLength(1);
		expect(last().malice.log[0].label).toMatch(/Spend/i);
	});

	test.each(['amount', 'label'] as const)('[M04] Enter in the %s field submits the same way the Add button does', async (field) => {
		const { root, flush, last } = await mount(withMalice(3));
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = '2';
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = 'Feytouched';
		press(ctl(root, `init.malice.quickadd.${field}`), 'Enter');
		await flush();
		expect(last().malice).toEqual({ value: 5, log: [{ round: 1, amount: 2, label: 'Feytouched' }] });
	});

	test('[M05] a rejected quick-add clears its flag on the next keystroke', async () => {
		const { root } = await mount(withMalice(3));
		ctl(root, 'init.malice.quickadd.add').click();
		const amountEl = ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount');
		expect(amountEl.getAttribute('aria-invalid')).toBe('true');
		amountEl.dispatchEvent(new Event('input'));
		expect(amountEl.hasAttribute('aria-invalid')).toBe(false);
		expect(root.querySelector('.dse-init__malice-quickadd-hint')!.textContent).toBe('');
	});

	test('[M09] a quick-add the pool clamps logs what it did: -5 from 2 is an entry of -2 that records the -5 asked for', async () => {
		const { root, flush, last } = await mount(withMalice(2));
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = '-5';
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = 'Spend';
		ctl(root, 'init.malice.quickadd.add').click();
		await flush();
		expect(last().malice.value).toBe(0);
		expect(last().malice.log).toEqual([{ round: 1, amount: -2, requested: -5, label: 'Spend' }]);
		expect(logLines(root)).toEqual(['R1: -2 — Spend (-5, capped at 0)']);
	});

	test('[M09] a quick-add that applies nothing (-5 from 0) is still logged: amount 0 shows as "0", not "+0"', async () => {
		const { root, flush, last } = await mount(withMalice(0));
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = '-5';
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = 'Spend';
		ctl(root, 'init.malice.quickadd.add').click();
		await flush();
		expect(last().malice.value).toBe(0);
		expect(last().malice.log).toEqual([{ round: 1, amount: 0, requested: -5, label: 'Spend' }]);
		expect(logLines(root)).toEqual(['R1: 0 — Spend (-5, capped at 0)']);
	});

	test('[M09] an uncapped spend and gain carry no `requested` key and read as before', async () => {
		const { root, flush, last } = await mount(withMalice(5));
		const add = async (amount: string, label: string): Promise<void> => {
			ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = amount;
			ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = label;
			ctl(root, 'init.malice.quickadd.add').click();
			await flush();
		};
		await add('-2', 'Spend');
		await add('3', 'Gain');
		const log = last().malice.log;
		expect(log).toEqual([
			{ round: 1, amount: -2, label: 'Spend' },
			{ round: 1, amount: 3, label: 'Gain' },
		]);
		log.forEach((entry: object) => expect('requested' in entry).toBe(false));
		expect(logLines(root)).toEqual(['R1: -2 — Spend', 'R1: +3 — Gain']);
	});

	test('[M09] a hand-edited entry whose `requested` equals its amount reads as an uncapped line, with no suffix', async () => {
		const { root } = await mount(withMalice(3, ['  log:', '    - { round: 1, amount: 1, label: "Same", requested: 1 }', '    - { round: 1, amount: -2, label: "Capped", requested: -5 }']));
		expect(logLines(root)).toEqual(['R1: +1 — Same', 'R1: -2 — Capped (-5, capped at 0)']);
	});

	test('[M09] a fractional gain the pool takes in full writes no `requested` key (0.2 + round_gain 0.1)', async () => {
		const { root, flush, last } = await mount(src(HEROES, OGRES, ['malice:', '  value: 0.2', '  round_gain: 0.1']));
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(last().malice.log).toHaveLength(1);
		expect('requested' in last().malice.log[0]).toBe(false);
		expect(logLines(root)[0]).not.toContain('capped');
	});

	test('[M09] Advance round with round_gain -3 from Malice 0 still logs the gain: amount 0, requested -3', async () => {
		const { root, flush, last } = await mount(src(HEROES, OGRES, ['malice:', '  value: 0', '  round_gain: -3'], ['round: 2']));
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(last().malice.value).toBe(0);
		expect(last().malice.log).toEqual([{ round: 3, amount: 0, requested: -3, label: 'Round gain' }]);
		expect(logLines(root)).toEqual(['R3: 0 — Round gain (-3, capped at 0)']);
	});

	test('[M09] Advance round with round_gain -3 from Malice 1 logs the -1 it applied and the -3 asked for', async () => {
		const { root, flush, last } = await mount(src(HEROES, OGRES, ['malice:', '  value: 1', '  round_gain: -3']));
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(last().malice.value).toBe(0);
		expect(last().malice.log).toEqual([{ round: 2, amount: -1, requested: -3, label: 'Round gain' }]);
		expect(logLines(root)).toEqual(['R2: -1 — Round gain (-3, capped at 0)']);
	});

	test('[M09] a positive round_gain logs as before: +2, no `requested` key', async () => {
		const { root, flush, last } = await mount(src(HEROES, OGRES, ['malice:', '  value: 1', '  round_gain: 2']));
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(last().malice.log).toEqual([{ round: 2, amount: 2, label: 'Round gain' }]);
		expect('requested' in last().malice.log[0]).toBe(false);
		expect(logLines(root)).toEqual(['R2: +2 — Round gain']);
	});

	const log = (n: number): string[] => Array.from({ length: n }, (_, i) => `    - { round: ${i + 1}, amount: 1, label: "Entry ${i + 1}" }`);
	test.each([
		[0, 'Malice log · no entries'],
		[1, 'Malice log · 1 entry'],
		[3, 'Malice log · 3 entries'],
	])('[M06] a log of %i entries is headed %j, closed at first, and the header toggles it', async (n, title) => {
		const { root } = await mount(withMalice(3, n ? ['  log:', ...log(n)] : []));
		const header = ctl(root, 'init.malice.log');
		expect(header.textContent).toBe(title);
		expect(header.getAttribute('aria-expanded')).toBe('false');
		header.click();
		expect(header.getAttribute('aria-expanded')).toBe('true');
		expect(root.querySelectorAll('.dse-init__malice-log-entry')).toHaveLength(n);
		header.click();
		expect(header.getAttribute('aria-expanded')).toBe('false');
	});

	test('[M06] the log stays open across the rebuild a quick-add causes (session state)', async () => {
		const { root, flush } = await mount(withMalice(3));
		ctl(root, 'init.malice.log').click();
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = '1';
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = 'X';
		ctl(root, 'init.malice.quickadd.add').click();
		await flush();
		expect(ctl(root, 'init.malice.log').getAttribute('aria-expanded')).toBe('true');
		expect(ctl(root, 'init.malice.log').textContent).toBe('Malice log · 1 entry');
	});

	test('[M10] a half-typed quick-add survives Advance round', async () => {
		const { root, flush } = await mount(TRACKER);
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = '2';
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = 'Feyt';
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value).toBe('2');
		expect(ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value).toBe('Feyt');
	});
});

// ----------------------------------------------------------------------------------------- S. selection, K. captain

describe('[S] roster selection across row kinds', () => {
	const MIXED = src(HEROES, [
		'enemy_groups:',
		'  - name: "Patrol"',
		'    is_squad: true',
		'    creatures:',
		'      - { name: Goblin, max_stamina: 4, amount: 2, squad_role: minion }',
		'      - { name: Captain, max_stamina: 20, amount: 1, squad_role: captain }',
		'      - { name: Rider, max_stamina: 30, amount: 1, squad_role: attached }',
		'  - name: "Ogres"',
		'    creatures:',
		'      - { name: Ogre, max_stamina: 60, amount: 2 }',
	]);
	const keys = ['0-1', '0-2', '1-1', '2-1'];

	test.each([
		// cell, detail name, squad checklist, captain control
		['0-2', 'Goblin #2', true, null],
		['1-1', 'Captain #1', false, 'init.captain.relieve'],
		['2-1', 'Rider #1', false, 'init.captain.make'],
	])('[S01] selecting cell %s opens %j (squad checklist %s, captain control %s) and persists the key', async (key, name, squadChecklist, captainControl) => {
		const { root, flush, last } = await mount(MIXED);
		const group = root.querySelectorAll<HTMLElement>('.dse-init__groupbody')[0];
		group.querySelector<HTMLElement>(`[data-instance-key="${key}"]`)!.click();
		const detail = group.querySelector('.dse-init__detail') as HTMLElement;
		expect(detail.querySelector('.dse-init__name')!.textContent!.startsWith(name)).toBe(true);
		expect(detail.getAttribute('data-detail-key')).toBe(key);
		expect(has(detail, 'init.detail.squad-action')).toBe(squadChecklist);
		for (const id of ['init.captain.make', 'init.captain.relieve']) expect(has(detail, id)).toBe(id === captainControl);
		// exactly one cell of the group is selected, in aria-pressed, data-selected and the label
		const cells = Array.from(group.querySelectorAll<HTMLElement>('[data-dse-control="init.cell.stamina"]'));
		expect(cells.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.getAttribute('data-instance-key'))).toEqual([key]);
		expect(cells.filter((c) => c.hasAttribute('data-selected')).map((c) => c.getAttribute('data-instance-key'))).toEqual([key]);
		expect(cells.filter((c) => /^Selected — /.test(c.getAttribute('aria-label')!))).toHaveLength(1);
		await flush();
		expect(last().enemy_groups[0].selectedInstanceKey).toBe(key);
	});

	test('[S01] a selection in one group does not touch the other group\'s selection', async () => {
		const { root, flush, last } = await mount(MIXED);
		const groups = root.querySelectorAll<HTMLElement>('.dse-init__groupbody');
		groups[1].querySelector<HTMLElement>('[data-instance-key="0-2"]')!.click();
		await flush();
		expect(last().enemy_groups[1].selectedInstanceKey).toBe('0-2');
		expect(last().enemy_groups[0].selectedInstanceKey).toBeUndefined();
		expect(groups[0].querySelector('.dse-init__detail')!.getAttribute('data-detail-key')).toBe('0-1');
	});

	test.each(keys)('[S01] the selection of cell %s survives the rebuild Advance round causes', async (key) => {
		const { root, flush } = await mount(MIXED);
		root.querySelector<HTMLElement>(`.dse-init__groupbody [data-instance-key="${key}"]`)!.click();
		ctl(root, 'init.round.advance').click();
		await flush();
		const group = root.querySelectorAll<HTMLElement>('.dse-init__groupbody')[0];
		expect(group.querySelector('.dse-init__detail')!.getAttribute('data-detail-key')).toBe(key);
		expect(group.querySelector(`[data-instance-key="${key}"]`)!.getAttribute('aria-pressed')).toBe('true');
	});

	test('[S01] a single creature (amount 1) has a detail row and no grid, so no cell to click', async () => {
		const { root } = await mount(src(HEROES, ['enemy_groups:', '  - name: "Boss"', '    creatures:', '      - { name: Troll, max_stamina: 100, amount: 1 }']));
		expect(has(root, 'init.detail.stamina')).toBe(true);
		expect(has(root, 'init.cell.stamina')).toBe(false);
	});
});

describe('[K] the captain badge: who it offers, what a click does', () => {
	const group = (...creatures: string[]): string =>
		src(HEROES, ['enemy_groups:', '  - name: "Patrol"', '    is_squad: true', '    creatures:', ...creatures.map((c) => `      - ${c}`)]);
	const roles = (data: any): Array<[string, string, string | undefined]> =>
		data.enemy_groups[0].creatures.map((c: any) => [c.name, c.squad_role, c.captain_of]);
	const select = (root: Element, key: string): void => (root.querySelector(`[data-instance-key="${key}"]`) as HTMLElement).click();
	const GOB = '{ name: Goblin, max_stamina: 4, amount: 2, squad_role: minion }';
	const CAP = '{ name: Cap, max_stamina: 20, amount: 1, squad_role: captain }';
	const RIDER = '{ name: Rider, max_stamina: 30, amount: 1, squad_role: attached }';

	test.each([
		// description, creatures, selected cell, expected control, label, word
		['no captain yet', [GOB, RIDER], '1-1', 'init.captain.make', 'Make Rider captain of Goblin', 'Make captain'],
		['a captain exists', [GOB, CAP, RIDER], '2-1', 'init.captain.make', 'Make Rider captain of Goblin', 'Make captain'],
		['the captain is open', [GOB, CAP, RIDER], '1-1', 'init.captain.relieve', 'Relieve Cap as captain', 'Captain'],
		['two squads', [GOB, '{ name: Wolf, max_stamina: 4, amount: 2, squad_role: minion }', RIDER], '2-1', 'init.captain.make', 'Make Rider captain of Goblin', 'Make captain: Goblin'],
	])('[K01-K02] %s: the badge is %s labelled %j reading %j', async (_d, creatures, key, id, label, word) => {
		const { root } = await mount(group(...creatures));
		select(root, key);
		const badge = ctl(root, id);
		expect(badge.getAttribute('aria-label')).toBe(label);
		expect(badge.textContent).toBe(word);
		expect(badge.getAttribute('aria-pressed')).toBe(id === 'init.captain.relieve' ? 'true' : 'false');
	});

	test.each([
		['promote with no captain: no captain_of when there is one squad', [GOB, RIDER], '1-1', [['Goblin', 'minion', undefined], ['Rider', 'captain', undefined]]],
		['promote over an existing captain: the old one is attached', [GOB, CAP, RIDER], '2-1', [['Goblin', 'minion', undefined], ['Cap', 'attached', undefined], ['Rider', 'captain', undefined]]],
		['relieve the captain: attached, the squad keeps them', [GOB, CAP, RIDER], '1-1', [['Goblin', 'minion', undefined], ['Cap', 'attached', undefined], ['Rider', 'attached', undefined]]],
	])('[K01-K02] %s', async (_d, creatures, key, expected) => {
		const { root, flush, last, writes } = await mount(group(...creatures));
		select(root, key);
		const button = root.querySelector('[data-dse-control="init.captain.make"], [data-dse-control="init.captain.relieve"]') as HTMLElement;
		const clicked = button.getAttribute('data-dse-control');
		button.click();
		await flush();
		expect(roles(last())).toEqual(expected);
		expect(writes().length).toBeGreaterThanOrEqual(1);
		// the whole tracker was rebuilt: the badge now offers the opposite change on the same creature (no re-select: the persisted selection is shown)
		expect(has(root, clicked === 'init.captain.make' ? 'init.captain.relieve' : 'init.captain.make')).toBe(true);
	});

	test('[K01] a minion\'s detail row offers no captain control, and nothing else does either once the host is read-only', async () => {
		const { root } = await mount(group(GOB, CAP, RIDER));
		select(root, '0-1');
		expect(has(root, 'init.captain.make') || has(root, 'init.captain.relieve')).toBe(false);
		const ro = await mount(group(GOB, CAP, RIDER), { canPersist: false });
		expect(has(ro.root, 'init.captain.make') || has(ro.root, 'init.captain.relieve')).toBe(false);
		expect(ro.root.querySelector('.dse-init__captain[data-role="captain"]')).not.toBeNull(); // the word is still shown
	});
});

// ------------------------------------------------------------------------------- F. focus after a whole-tracker rebuild (SC-588)

describe('[F] keyboard focus survives the actions that rebuild the whole tracker (SC-588)', () => {
	/** The control holding focus, by id (null when focus is on <body> or on a node with none). */
	const focused = (): string | null => document.activeElement?.getAttribute('data-dse-control') ?? null;
	const CAPTAINED = src(HEROES, [
		'enemy_groups:', '  - name: "Patrol"', '    is_squad: true', '    creatures:',
		'      - { name: Goblin, max_stamina: 4, amount: 2, squad_role: minion }',
		'      - { name: Cap, max_stamina: 20, amount: 1, squad_role: captain }',
		'      - { name: Rider, max_stamina: 30, amount: 1, squad_role: attached }',
	]);

	test('[F01] Advance round: the rebuilt Advance round button holds focus, not <body>', async () => {
		const { root, flush } = await mount(TRACKER);
		const before = ctl(root, 'init.round.advance');
		before.focus();
		before.click();
		await flush();
		const after = ctl(root, 'init.round.advance');
		expect(after).not.toBe(before); // the tracker really was rebuilt
		expect(document.activeElement).toBe(after);
	});

	test('[F02] Reset turns (a chrome item): the rebuilt chrome item holds focus', async () => {
		const { root, flush } = await mount(TRACKER);
		const before = ctl(root, 'init.reset-turns');
		before.focus();
		before.click();
		await flush();
		expect(ctl(root, 'init.reset-turns')).not.toBe(before);
		expect(focused()).toBe('init.reset-turns');
		expect(document.activeElement).toBe(ctl(root, 'init.reset-turns'));
	});

	test.each([
		['amount', 'init.malice.quickadd.amount'],
		['label', 'init.malice.quickadd.label'],
	])('[F03] Enter in the quick-add %s box: the rebuilt box holds focus (and, as before, comes back empty)', async (_which, id) => {
		const { root, flush } = await mount(TRACKER);
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = '2';
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = 'Kbd';
		const field = ctl<HTMLInputElement>(root, id);
		field.focus();
		press(field, 'Enter');
		await flush();
		expect(ctl(root, 'init.malice.log').textContent).toBe('Malice log · 1 entry'); // the add happened
		expect(document.activeElement).toBe(ctl(root, id));
		expect(ctl<HTMLInputElement>(root, id).value).toBe('');
	});

	test.each([
		['Make captain', '2-1', 'init.captain.make', 'init.captain.relieve'],
		['Relieve captain', '1-1', 'init.captain.relieve', 'init.captain.make'],
	])('[F04] %s: focus moves to the badge that replaced it, on the same creature', async (_name, key, from, to) => {
		const { root, flush } = await mount(CAPTAINED);
		(root.querySelector(`[data-instance-key="${key}"]`) as HTMLElement).click();
		const before = ctl(root, from);
		before.focus();
		before.click();
		await flush();
		expect(has(root, from)).toBe(false);
		expect(focused()).toBe(to);
		expect(document.activeElement).toBe(ctl(root, to));
	});

	test('[F05] Reset encounter -> Yes, Reset: the confirm modal closes and the rebuilt Reset encounter item holds focus', async () => {
		const { root, flush } = await mount(TRACKER);
		const item = ctl(root, 'init.reset-encounter');
		item.focus();
		item.click();
		const modal = document.body.lastElementChild as HTMLElement;
		expect(root.contains(document.activeElement)).toBe(false); // the modal took focus
		ctl(modal, 'init.reset-encounter.confirm').click();
		await flush();
		expect(document.querySelector('.dse-modal')).toBeNull();
		expect(ctl(root, 'init.reset-encounter')).not.toBe(item);
		expect(document.activeElement).toBe(ctl(root, 'init.reset-encounter'));
	});

	test('[F05] Reset encounter -> Cancel rebuilds nothing and moves nothing', async () => {
		const { root, flush } = await mount(TRACKER);
		const item = ctl(root, 'init.reset-encounter');
		item.focus();
		item.click();
		ctl(document.body.lastElementChild as HTMLElement, 'init.reset-encounter.cancel').click();
		await flush();
		expect(ctl(root, 'init.reset-encounter')).toBe(item);
	});

	test('[F06] focus that was not inside the tracker is left where it is: a rebuild raised from elsewhere never steals it', async () => {
		const { root, flush } = await mount(TRACKER);
		const other = document.createElement('input');
		document.body.appendChild(other);
		other.focus();
		ctl(root, 'init.round.advance').click(); // a click with focus elsewhere (e.g. scripted, or another pane's input)
		await flush();
		expect(document.activeElement).toBe(other);
		other.blur();
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(document.activeElement).toBe(document.body);
	});

	test('[F07] a mouse press on Advance round restores focus WITHOUT forcing a keyboard ring', async () => {
		const { root, flush } = await mount(TRACKER);
		const before = ctl(root, 'init.round.advance');
		before.focus();
		const matches = jest.spyOn(Element.prototype, 'matches').mockReturnValue(false); // a pointer focus is not :focus-visible
		before.click();
		matches.mockRestore();
		const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');
		await flush();
		expect(document.activeElement).toBe(ctl(root, 'init.round.advance'));
		expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
		focusSpy.mockRestore();
	});
});

// ------------------------------------------------------------------------------------------ X. Reset encounter

describe('[X] Reset encounter state: what a confirm clears, what every other way out leaves', () => {
	const LIVE = src(
		['name: "Warren Ambush"', 'round: 3'],
		['heroes:', '  - name: "Alice"', '    max_stamina: 30', '    current_stamina: 11', '    has_taken_turn: true', '    conditions: [grabbed]'],
		OGRES,
		['    has_taken_turn: true'],
		['malice:', '  value: 7', '  round_gain: 2', '  log:', '    - { round: 2, amount: 2, label: "Round gain" }'],
	);
	const open = (root: Element) => {
		ctl(root, 'init.reset-encounter').click();
		return document.body.lastElementChild as HTMLElement;
	};

	test('[X01] Yes, Reset: the live state is cleared, the authored setup (title, max stamina, round_gain) stays, in one write', async () => {
		const { root, flush, writes, last } = await mount(LIVE);
		const modal = open(root);
		ctl(modal, 'init.reset-encounter.confirm').click();
		await flush();
		expect(writes()).toHaveLength(1);
		const data = last();
		expect(data.name).toBe('Warren Ambush');
		expect(data.round).toBeUndefined();
		expect(data.malice).toEqual({ value: 0, round_gain: 2 });
		expect(data.heroes[0]).toEqual({ name: 'Alice', max_stamina: 30, conditions: [] }); // `conditions` was authored, so it is written back, emptied
		expect(data.enemy_groups[0].has_taken_turn).toBeUndefined();
		expect(document.querySelector('.dse-modal')).toBeNull(); // the modal closed itself
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 1');
	});

	const confirmReset = (root: Element): void => {
		ctl(open(root), 'init.reset-encounter.confirm').click();
	};

	test('[X05] after Reset the tracker still shows the enemy roster and the heroes at full stamina, as a fresh parse of the written note would [SC-576]', async () => {
		const { root, flush, last } = await mount(src(
			['heroes:', '  - name: "Alice"', '    max_stamina: 30', '    current_stamina: -4', '  - name: "Bruno"', '    max_stamina: 40', '    current_stamina: 12'],
			OGRES,
		));
		confirmReset(root);
		await flush();
		const view = document.querySelector('.dse-init') as HTMLElement;
		const cells = (): HTMLElement[] => Array.from(view.querySelectorAll<HTMLElement>('[data-dse-control="init.cell.stamina"]'));
		expect(cells()).toHaveLength(3);
		expect(ctl(view, 'init.detail.stamina', 0).textContent).toBe('60/60');
		expect(ctl(view, 'init.hero.stamina', 0).textContent).toBe('30/30');
		expect(ctl(view, 'init.hero.stamina', 1).textContent).toBe('40/40');
		expect(view.querySelector('.dse-init__stamina[data-state="dying"]')).toBeNull();
		expect(view.querySelector('.dse-init__state[data-state="dying"]')).toBeNull();
		expect(view.querySelector('.dse-init__state[data-state="dead"]')).toBeNull();
		// What was written is the reset model as it stood when Reset ran: no stamina, no instances.
		expect(last().heroes[0]).toEqual({ name: 'Alice', max_stamina: 30 });
		expect(last().enemy_groups[0].creatures[0].instances).toBeUndefined();
		// The rebuilt tracker is live: a click on the rebuilt cells writes the new selection onto a full roster.
		cells()[1].click();
		await flush();
		expect(last().enemy_groups[0].selectedInstanceKey).toBe('0-2');
	});

	test('[X05] after Reset a minion squad is back at its full shared pool, with all of its cells [SC-576]', async () => {
		const squad = src(HEROES, ['enemy_groups:', '  - name: "Goblins"', '    is_squad: true', '    minion_stamina_pool: 5', '    creatures:', '      - { name: Goblin, max_stamina: 4, amount: 3, squad_role: minion }']);
		const { root, flush } = await mount(squad);
		confirmReset(root);
		await flush();
		const view = document.querySelector('.dse-init') as HTMLElement;
		expect(view.querySelectorAll('[data-dse-control="init.cell.stamina"]')).toHaveLength(3);
		expect(ctl(view, 'init.detail.stamina', 0).textContent).toMatch(/^12\/12/); // "12/12 (4)": the pool, then the effective per-minion Stamina
	});

	// A tracker whose creatures and heroes come from `statblock:` notes (name and max Stamina are merged in on load).
	const dsNote = (...lines: string[]): string => ['```ds-statblock', ...lines, '```'].join('\n');
	const VAULT = {
		'Bestiary/Orc Warrior.md': dsNote('name: Orc Warrior', 'stamina: "40"'),
		'Frodo Baggins.md': dsNote('name: Frodo Baggins', 'stamina: "80"'),
	};
	const REFS = src(
		['heroes:', '  - statblock: "Frodo Baggins"', '    current_stamina: 33'],
		['enemy_groups:', '  - name: "Orcs"', '    creatures:', '      - statblock: "Orc Warrior"', '        amount: 2'],
	);
	const gateResolve = (deps: ElementPipelineDeps): (() => void) => {
		const refs = deps.refs as unknown as { resolveBarePath: (p: string) => Promise<unknown> };
		const original = refs.resolveBarePath.bind(refs);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		refs.resolveBarePath = async (p: string) => {
			await gate;
			return original(p);
		};
		return release;
	};

	test('[X05] after Reset a tracker built from statblock notes shows the merged names and full stamina, as a reload does [SC-576]', async () => {
		const { root, flush, last } = await mount(REFS, {}, VAULT);
		confirmReset(root);
		await flush();
		const view = document.querySelector('.dse-init') as HTMLElement;
		expect(view.querySelectorAll('[data-dse-control="init.cell.stamina"]')).toHaveLength(2);
		expect(ctl(view, 'init.hero.stamina', 0).textContent).toBe('80/80');
		expect(ctl(view, 'init.detail.stamina', 0).textContent).toBe('40/40');
		// the merged `name` / `max_stamina` are not authored keys, and Reset must not start writing them
		expect(last().heroes[0]).toEqual({ statblock: 'Frodo Baggins' });
	});

	test('[X05] if the statblock note stopped resolving before Reset, the card shows the error a reload would, not the empty tracker [SC-576]', async () => {
		const { root, flush, deps, writes } = await mount(REFS, {}, VAULT);
		(deps.app as unknown as App).vault.setFile('Bestiary/Orc Warrior.md', 'no statblock here any more');
		const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			confirmReset(root);
			await flush();
		} finally {
			errors.mockRestore();
		}
		expect(writes()).toHaveLength(1); // the note was still reset
		const card = root.querySelector('.dse-error-card') as HTMLElement;
		expect(card).not.toBeNull();
		expect(root.getAttribute('data-dse-error-stage')).toBe('reference');
		expect(card.textContent).toContain('Orc Warrior');
		// never the screen this bug painted: no roster cells, no 0-Stamina Dying heroes, no controls that would edit a stale model
		expect(root.querySelector('[data-dse-control="init.cell.stamina"]')).toBeNull();
		expect(root.querySelector('[data-state="dying"]')).toBeNull();
		expect(has(root, 'init.hero.stamina')).toBe(false);
		expect(root.hasAttribute('inert')).toBe(false);
		// Reset acts on the model, and on the card's note the model is the stale one: neither reset action is offered
		expect(has(root, 'init.reset-encounter')).toBe(false);
		expect(has(root, 'init.reset-turns')).toBe(false);
	});

	/** Mount REFS, break the Orc note, Reset (so the error card is up), and hand back the same view for an outside update(). */
	async function brokenThenReset() {
		const created: Array<{ update(model: unknown): Promise<void>; currentModel(): unknown }> = [];
		const createView = initiativeElement.createView;
		const spy = jest.spyOn(initiativeElement, 'createView').mockImplementation((cx) => {
			const view = createView(cx);
			created.push(view);
			return view;
		});
		const env = await mount(REFS, {}, VAULT);
		spy.mockRestore();
		const vault = (env.deps.app as unknown as App).vault;
		vault.setFile('Bestiary/Orc Warrior.md', 'no statblock here any more');
		const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			confirmReset(env.root);
			await env.flush();
		} finally {
			errors.mockRestore();
		}
		expect(env.root.querySelector('.dse-error-card')).not.toBeNull();
		const restore = (): void => {
			vault.setFile('Bestiary/Orc Warrior.md', VAULT['Bestiary/Orc Warrior.md']);
		};
		return { ...env, view: created[0], restore };
	}

	test('[X05] the error card after a failed re-parse ends when the same view is given a freshly prepared model (the sidebar refresh) [SC-576]', async () => {
		const { root, view, restore, deps } = await brokenThenReset();
		restore();
		const prepared = await prepareModel(initiativeElement, REFS, {
			prefs: deps.prefs,
			refs: deps.refs,
			validation: deps.validation,
			sourcePath: 'Encounter.md',
		});
		await view.update(prepared.model);
		expect(root.querySelector('.dse-error-card')).toBeNull();
		expect(root.hasAttribute('data-dse-error-stage')).toBe(false);
		expect(root.querySelectorAll('[data-dse-control="init.cell.stamina"]')).toHaveLength(2);
		expect(has(root, 'init.reset-encounter')).toBe(true);
		expect(has(root, 'init.reset-turns')).toBe(true);
	});

	test('[X05] an update with the model already on screen leaves the error card up [SC-576]', async () => {
		const { root, view } = await brokenThenReset();
		await view.update(view.currentModel());
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('[data-dse-control="init.cell.stamina"]')).toBeNull();
		expect(has(root, 'init.reset-encounter')).toBe(false);
	});

	test('[X05] while Reset re-reads the statblock notes the tracker is inert and busy, and is live again once it has rebuilt [SC-576]', async () => {
		const { root, flush, deps } = await mount(REFS, {}, VAULT);
		const release = gateResolve(deps);
		confirmReset(root);
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(root.hasAttribute('inert')).toBe(true);
		expect(root.getAttribute('aria-busy')).toBe('true');
		release();
		await flush();
		expect(root.hasAttribute('inert')).toBe(false);
		expect(root.hasAttribute('aria-busy')).toBe(false);
		expect(root.querySelectorAll('[data-dse-control="init.cell.stamina"]')).toHaveLength(2);
	});

	/** Open the modal through the tracker's chrome item and keep the instance, so a test can close it the way Obsidian does. */
	function openCapturing(root: Element): { modal: ResetEncounterModal; el: HTMLElement } {
		const opened: ResetEncounterModal[] = [];
		const original = ResetEncounterModal.prototype.open;
		const spy = jest.spyOn(ResetEncounterModal.prototype, 'open').mockImplementation(function (this: ResetEncounterModal) {
			opened.push(this);
			original.call(this);
		});
		try {
			const el = open(root);
			return { modal: opened[0], el };
		} finally {
			spy.mockRestore();
		}
	}

	test.each([
		['Cancel', (m: ResetEncounterModal, el: HTMLElement) => ctl(el, 'init.reset-encounter.cancel').click()],
		['the X (close())', (m: ResetEncounterModal) => m.close()],
		['Escape through the modal Scope', (m: ResetEncounterModal) => {
			const detach = attachObsidianKeymap(m);
			expect(pressEscape(document.body)).toBe(false); // Obsidian's Scope handled it: preventDefault + stop
			detach();
		}],
	])('[X02-X03] leaving through %s changes nothing and writes nothing', async (_way, leave) => {
		const { root, flush, writes } = await mount(LIVE);
		const { modal, el } = openCapturing(root);
		expect(has(el, 'init.reset-encounter.confirm')).toBe(true);
		leave(modal, el);
		await flush();
		expect(document.querySelector('.modal-container')).toBeNull(); // it closed
		expect(writes()).toHaveLength(0);
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 3');
		expect(ctl(root, 'init.hero.turn').getAttribute('aria-pressed')).toBe('true');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 7');
	});

	test('[X02] the modal\'s first control is Cancel (the safe default for a destructive confirm) and Yes, Reset is the danger button', () => {
		const modal = new ResetEncounterModal(new App() as any, jest.fn());
		modal.open();
		const buttons = Array.from(modal.contentEl.querySelectorAll<HTMLElement>('[data-dse-control]'));
		expect(buttons.map((b) => b.getAttribute('data-dse-control'))).toEqual(['init.reset-encounter.cancel', 'init.reset-encounter.confirm']);
		expect(buttons[1].classList.contains('dse-btn--danger')).toBe(true);
	});

	test('[X07] after Reset a minion squad\'s shared action pips are cleared', async () => {
		const squad = src(HEROES, ['enemy_groups:', '  - name: "Goblins"', '    is_squad: true', '    creatures:', '      - { name: Goblin, max_stamina: 4, amount: 3, squad_role: minion }']);
		const { root, flush, last } = await mount(squad);
		ctl(root, 'init.detail.squad-action', 0).click(); // Move
		await flush();
		confirmReset(root);
		await flush();
		const goblin = last().enemy_groups[0].creatures[0];
		expect(Object.values(goblin.actions ?? {}).some(Boolean)).toBe(false);
		expect(goblin).toMatchObject({ name: 'Goblin', max_stamina: 4, amount: 3, squad_role: 'minion' }); // authored setup survives
	});

	test('[X01] a read-only host offers neither chrome item', async () => {
		const { root } = await mount(LIVE, { canPersist: false });
		expect(has(root, 'init.reset-encounter') || has(root, 'init.reset-turns')).toBe(false);
	});
});

// ------------------------------------------------------------------------------- Malice never goes below 0 (SC-577)

describe('Malice never goes below 0 (SC-577)', () => {
	test('[M07] the Malice stepper stops at 0', async () => {
		const { root, flush, writes } = await mount(src(HEROES, OGRES, ['malice:', '  value: 0']));
		ctl(root, 'init.malice.dec').click();
		await flush();
		// Under a `min: 0` fix the button is disabled and no write lands, so assert the screen and "nothing negative is ever written".
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 0');
		expect(writes().every((w) => parseYaml(w).malice.value >= 0)).toBe(true);
	});

	test('[R01] a negative round_gain never takes Malice below 0, and the Advance label reads "-3" not "+-3"', async () => {
		const { root, flush, last } = await mount(src(HEROES, OGRES, ['malice:', '  value: 1', '  round_gain: -3']));
		expect(ctl(root, 'init.round.advance').getAttribute('aria-label')).not.toContain('+-');
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(last().malice.value).toBeGreaterThanOrEqual(0);
	});

	test('[M07] a hand-edited negative value counts as 0: the read-only tracker shows "Malice: 0", like the stepper', async () => {
		const { root } = await mount(src(HEROES, OGRES, ['malice:', '  value: -2']), { canPersist: false });
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 0');
		const writable = await mount(src(HEROES, OGRES, ['malice:', '  value: -2']));
		expect(writable.root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 0');
	});

	test('[R01] a hand-edited -2 with round_gain 3 writes 3 (the stored negative counts as 0), logging +3', async () => {
		const { root, flush, last } = await mount(src(HEROES, OGRES, ['malice:', '  value: -2', '  round_gain: 3']));
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(last().malice.value).toBe(3);
		expect(last().malice.log).toEqual([{ round: 2, amount: 3, label: 'Round gain' }]);
	});

	test('[M05] a hand-edited -2 with a quick-add of +3 writes 3, logging +3', async () => {
		const { root, flush, last } = await mount(src(HEROES, OGRES, ['malice:', '  value: -2']));
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.amount').value = '3';
		ctl<HTMLInputElement>(root, 'init.malice.quickadd.label').value = 'Gain';
		ctl(root, 'init.malice.quickadd.add').click();
		await flush();
		expect(last().malice.value).toBe(3);
		expect(last().malice.log).toEqual([{ round: 1, amount: 3, label: 'Gain' }]);
	});
});

// ------------------------------------------------------------------------------- Q. the quick-add draft across a rebuild (SC-589)

describe('[Q] a half-typed quick-add is a per-view draft: it survives every rebuild, and only a successful Add clears it (SC-589)', () => {
	const AMOUNT = 'init.malice.quickadd.amount';
	const LABEL = 'init.malice.quickadd.label';
	const CAPTAINED = src(HEROES, [
		'enemy_groups:', '  - name: "Patrol"', '    is_squad: true', '    creatures:',
		'      - { name: Goblin, max_stamina: 4, amount: 2, squad_role: minion }',
		'      - { name: Cap, max_stamina: 20, amount: 1, squad_role: captain }',
		'      - { name: Rider, max_stamina: 30, amount: 1, squad_role: attached }',
	]);
	const type = (root: Element, amount: string, label: string): void => {
		// Through the real `input` event, as typing does (the M10 case below sets .value alone, the way a script would).
		for (const [id, value] of [[AMOUNT, amount], [LABEL, label]] as const) {
			const el = ctl<HTMLInputElement>(root, id);
			el.value = value;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}
	};
	const draft = (root: Element): [string, string] => [ctl<HTMLInputElement>(root, AMOUNT).value, ctl<HTMLInputElement>(root, LABEL).value];

	test('[Q01] Advance round (the Malice pool changes too): both boxes still hold what was typed', async () => {
		const { root, flush } = await mount(TRACKER);
		const before = ctl(root, AMOUNT);
		type(root, '2', 'Feyt');
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(ctl(root, AMOUNT)).not.toBe(before); // the tracker really was rebuilt
		expect(draft(root)).toEqual(['2', 'Feyt']);
	});

	test('[Q02] Reset turns (a chrome item) keeps the draft', async () => {
		const { root, flush } = await mount(TRACKER);
		type(root, '-4', 'Spent');
		ctl(root, 'init.reset-turns').click();
		await flush();
		expect(draft(root)).toEqual(['-4', 'Spent']);
	});

	test.each([
		['Make captain', '2-1', 'init.captain.make'],
		['Relieve captain', '1-1', 'init.captain.relieve'],
	])('[Q03] %s keeps the draft', async (_name, key, control) => {
		const { root, flush } = await mount(CAPTAINED);
		(root.querySelector(`[data-instance-key="${key}"]`) as HTMLElement).click();
		type(root, '5', 'Captain');
		const before = ctl(root, AMOUNT);
		ctl(root, control).click();
		await flush();
		expect(ctl(root, AMOUNT)).not.toBe(before);
		expect(draft(root)).toEqual(['5', 'Captain']);
	});

	test('[Q04] Reset encounter -> Yes, Reset (the tracker is rebuilt from a re-parse of the written note) keeps the draft', async () => {
		const { root, flush } = await mount(TRACKER);
		type(root, '3', 'Pending');
		const before = ctl(root, AMOUNT);
		ctl(root, 'init.reset-encounter').click();
		ctl(document.body.lastElementChild as HTMLElement, 'init.reset-encounter.confirm').click();
		await flush();
		expect(ctl(root, AMOUNT)).not.toBe(before);
		expect(draft(root)).toEqual(['3', 'Pending']);
	});

	test('[Q05] Reset encounter -> Cancel changes nothing: the boxes are the very same nodes, still holding the draft', async () => {
		const { root, flush } = await mount(TRACKER);
		type(root, '3', 'Pending');
		const before = ctl(root, AMOUNT);
		ctl(root, 'init.reset-encounter').click();
		ctl(document.body.lastElementChild as HTMLElement, 'init.reset-encounter.cancel').click();
		await flush();
		expect(ctl(root, AMOUNT)).toBe(before);
		expect(draft(root)).toEqual(['3', 'Pending']);
	});

	test.each([
		['the - stepper', 'init.malice.dec'],
		['the + stepper', 'init.malice.inc'],
		['the Malice log disclosure (collapsed, then expanded)', 'init.malice.log'],
	])('[Q06] %s leaves the draft in the boxes (whether or not it rebuilds the tracker)', async (_name, control) => {
		const { root, flush } = await mount(TRACKER);
		type(root, '2', 'Feyt');
		ctl(root, control).click();
		ctl(root, control).click();
		await flush();
		expect(draft(root)).toEqual(['2', 'Feyt']);
	});

	test('[Q07] a rebuild from outside (update() called with another model, as the sidebar\'s refresh does) keeps the draft', async () => {
		const views: any[] = [];
		const { root } = await mount(TRACKER, { addChild: (c: unknown) => (views.push(c), c) } as Partial<BlockHost>);
		type(root, '7', 'Outside');
		const view = views.find((v) => typeof v.currentModel === 'function' && typeof v.chromeItems === 'function');
		const before = ctl(root, AMOUNT);
		await view.update({ ...view.currentModel(), round: 9 });
		expect(ctl(root, AMOUNT)).not.toBe(before);
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 9');
		expect(draft(root)).toEqual(['7', 'Outside']);
	});

	test('[Q08] two rebuilds in a row keep it (the restored boxes are captured again)', async () => {
		const { root, flush } = await mount(TRACKER);
		type(root, '2', 'Twice');
		ctl(root, 'init.round.advance').click();
		await flush();
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(draft(root)).toEqual(['2', 'Twice']);
	});

	test('[Q09] a rebuild that was not typed into leaves the boxes empty', async () => {
		const { root, flush } = await mount(TRACKER);
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(draft(root)).toEqual(['', '']);
	});

	test.each([
		['the Add button', (root: Element) => ctl(root, 'init.malice.quickadd.add').click()],
		['Enter in the amount box', (root: Element) => press(ctl(root, AMOUNT), 'Enter')],
		['Enter in the label box', (root: Element) => press(ctl(root, LABEL), 'Enter')],
	])('[Q10] a successful Add (%s) clears the draft, and it stays cleared across the next rebuild', async (_how, add) => {
		const { root, flush, last } = await mount(TRACKER);
		type(root, '2', 'Feyt');
		add(root);
		await flush();
		expect(last().malice.log).toEqual([{ round: 1, amount: 2, label: 'Feyt' }]);
		expect(draft(root)).toEqual(['', '']);
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(draft(root)).toEqual(['', '']);
	});

	test('[Q11] a rejected Add keeps the draft (nothing was committed), through the next rebuild too, and it is not written to the note', async () => {
		const { root, flush, writes } = await mount(TRACKER);
		type(root, '1.5', 'Feyt');
		ctl(root, 'init.malice.quickadd.add').click(); // "Whole numbers only"
		expect(root.querySelector('.dse-init__malice-quickadd-hint')!.textContent).toBe('Whole numbers only');
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(draft(root)).toEqual(['1.5', 'Feyt']);
		expect(writes().join('\n')).not.toContain('Feyt'); // a draft is view state, never note content
		// Everything derived from the boxes is what typing leaves: no stale flag, no reason text, the normal placeholders.
		const amount = ctl<HTMLInputElement>(root, AMOUNT);
		expect(amount.hasAttribute('aria-invalid')).toBe(false);
		expect(amount.getAttribute('placeholder')).toBe('Amount');
		expect(root.querySelector('.dse-init__malice-quickadd-hint')!.textContent).toBe('');
	});

	test('[Q12] the caret / selection of the focused box is restored with the focus', async () => {
		const { root, flush } = await mount(TRACKER);
		type(root, '2', 'Feytouched');
		const label = ctl<HTMLInputElement>(root, LABEL);
		label.focus();
		label.setSelectionRange(2, 5);
		ctl(root, 'init.round.advance').click();
		await flush();
		const after = ctl<HTMLInputElement>(root, LABEL);
		expect(after).not.toBe(label);
		expect(document.activeElement).toBe(after);
		expect([after.selectionStart, after.selectionEnd]).toEqual([2, 5]); // start and end only: Chromium does not restore the direction
	});

	/** The view and its tracker's model, for the outside path (`SidebarPanel` calls `previous.update(model)` on the same view). */
	const outside = async (src: string) => {
		const views: any[] = [];
		const m = await mount(src, { addChild: (c: unknown) => (views.push(c), c) } as Partial<BlockHost>);
		const view = views.find((v) => typeof v.currentModel === 'function' && typeof v.chromeItems === 'function');
		return { ...m, view, refresh: () => view.update({ ...view.currentModel(), round: 9 }) as Promise<void> };
	};

	test('[Q15] a rebuild from outside while the label box has focus: the rebuilt box holds focus, with the caret and the draft', async () => {
		const { root, refresh } = await outside(TRACKER);
		type(root, '7', 'Feytouched');
		const label = ctl<HTMLInputElement>(root, LABEL);
		label.focus();
		label.setSelectionRange(2, 5);
		await refresh();
		const after = ctl<HTMLInputElement>(root, LABEL);
		expect(after).not.toBe(label); // the tracker really was rebuilt
		expect(document.activeElement).toBe(after);
		expect([after.selectionStart, after.selectionEnd]).toEqual([2, 5]);
		expect(draft(root)).toEqual(['7', 'Feytouched']);
	});

	test('[Q15] a rebuild from outside while the Advance round button has focus hands focus to the rebuilt button', async () => {
		const { root, refresh } = await outside(TRACKER);
		ctl(root, 'init.round.advance').focus();
		await refresh();
		expect(document.activeElement).toBe(ctl(root, 'init.round.advance'));
	});

	test('[Q16] a rebuild from outside never takes focus: with focus elsewhere it stays there, and with none it stays on <body>', async () => {
		const { root, refresh } = await outside(TRACKER);
		type(root, '7', 'Feytouched');
		const other = document.createElement('input');
		document.body.appendChild(other);
		other.focus();
		await refresh();
		expect(document.activeElement).toBe(other);
		other.blur();
		await refresh();
		expect(document.activeElement).toBe(document.body);
		expect(draft(root)).toEqual(['7', 'Feytouched']);
	});

	test('[Q17] after a Reset encounter, an outside refresh still hands focus and caret back (the reset rebuild leaves no state behind)', async () => {
		const { root, flush, refresh } = await outside(TRACKER);
		ctl(root, 'init.reset-encounter').click();
		ctl(document.body.lastElementChild as HTMLElement, 'init.reset-encounter.confirm').click();
		await flush();
		type(root, '7', 'Feytouched');
		const label = ctl<HTMLInputElement>(root, LABEL);
		label.focus();
		label.setSelectionRange(2, 5);
		await refresh();
		const after = ctl<HTMLInputElement>(root, LABEL);
		expect(after).not.toBe(label); // the tracker really was rebuilt
		expect(document.activeElement).toBe(after);
		expect([after.selectionStart, after.selectionEnd]).toEqual([2, 5]);
		expect(draft(root)).toEqual(['7', 'Feytouched']);
	});

	test('[Q18] Reset encounter hands focus back itself: focus that landed on a quick-add box while it re-parses ends on the rebuilt Reset encounter item', async () => {
		const { root, flush } = await mount(TRACKER);
		const item = ctl(root, 'init.reset-encounter');
		item.focus();
		item.click();
		ctl(document.body.lastElementChild as HTMLElement, 'init.reset-encounter.confirm').click();
		ctl<HTMLInputElement>(root, LABEL).focus(); // the re-parse is still running (it is async); focus has moved into the old tracker
		await flush();
		expect(ctl(root, 'init.reset-encounter')).not.toBe(item);
		expect(document.activeElement).toBe(ctl(root, 'init.reset-encounter'));
	});

	test('[Q13] a draft in the amount box and an empty label box come back as typed (only the amount is restored)', async () => {
		const { root, flush } = await mount(TRACKER);
		type(root, '6', '');
		ctl(root, 'init.round.advance').click();
		await flush();
		expect(draft(root)).toEqual(['6', '']);
	});

	test('[Q14] a new view instance (a remount) starts with empty boxes: the draft is not saved anywhere', async () => {
		const first = await mount(TRACKER);
		type(first.root, '2', 'Feyt');
		ctl(first.root, 'init.round.advance').click();
		await first.flush();
		expect(first.writes().join('\n')).not.toContain('Feyt');
		document.body.innerHTML = '';
		jest.useRealTimers();
		const second = await mount(TRACKER);
		expect(draft(second.root)).toEqual(['', '']);
	});
});
