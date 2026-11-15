// SC-442 — the counter's combinatorial logic as tables (value x min / max present or absent x at a limit x writable / read-only x typed input
// shapes), driven through the REAL ElementPipeline + a real ReadingModeBlockHost over the FakeVault, so each case reads back the bytes the
// note holds (the block's YAML values, never the fence text: the plugin re-serializes key order) AND the DOM (the shown value and each
// button's real `disabled`). The e2e specs (e2e/specs/counter/) drive one plain scenario per manifest pair in real Obsidian; this file holds
// the permutations that do not need a real browser. Scenario groups follow e2e/manifest/counter.ts: S the buttons, T the typed value,
// E the min / max edges, R a read-only counter, V values a hand edit left out of range, X the note around the block.
//
// jsdom note: an <input type=number> sanitizes its value like a browser's does (`abc`, a space or a comma leave the box EMPTY), so the typed
// rows for those shapes pin the empty-box path; a real keyboard cannot type them at all.
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
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, makeFakeContext, parseYaml } from '../../mocks/obsidian';
import { counterElement } from '../../../src/elements/counter/definition';

const NOTE = 'Note.md';
const FENCE = '```ds-counter';

// ----------------------------------------------------------------------------------------------------------------- harness

function makeDeps(): ElementPipelineDeps {
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
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

/** Let the debounced persist land. */
async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
}

/** What a block holds: the keys of a counter, in the order a note declares them. `undefined` leaves the key out. */
interface Spec {
	value?: number | string;
	min?: number;
	max?: number;
	name?: string;
}
const body = (s: Spec): string =>
	[
		s.name === undefined ? 'name: Health' : s.name === '' ? '' : `name: ${s.name}`,
		s.value === undefined ? '' : `current_value: ${s.value}`,
		s.max === undefined ? '' : `max_value: ${s.max}`,
		s.min === undefined ? '' : `min_value: ${s.min}`,
	]
		.filter((l) => l !== '')
		.join('\n');

/** A note with ABOVE / BETWEEN / BELOW prose around the given block bodies. */
const noteOf = (bodies: string[]): string =>
	['# Session notes', '', 'ABOVE', '', bodies.map((b) => `${FENCE}\n${b}\n\`\`\``).join('\n\nBETWEEN\n\n'), '', 'BELOW'].join('\n');

/** The body of fence `index` of `note`, parsed. */
const valuesOf = (note: string, index = 0): Record<string, unknown> => parseYaml([...note.matchAll(/```ds-counter\n([\s\S]*?)\n```/g)].map((m) => m[1])[index]);
/** `note` with every fence body blanked: the text above, between and below the blocks. */
const outsideFences = (note: string): string => note.replace(/(```ds-counter\n)[\s\S]*?(\n```)/g, '$1$2');
const bodyOf = (note: string, index = 0): string => [...note.matchAll(/```ds-counter\n([\s\S]*?)\n```/g)].map((m) => m[1])[index];

interface Mounted {
	app: App;
	/** The CURRENT root. */
	root: () => HTMLElement;
	note: () => string;
	/** How many times the note was written. */
	writes: () => number;
}

/** Mount block `index` of a note holding `bodies` (the block's own body is `bodies[index]`). */
async function mount(bodies: string | string[], index = 0): Promise<Mounted> {
	const list = Array.isArray(bodies) ? bodies : [bodies];
	const app = new App();
	app.vault.setFile(NOTE, noteOf(list));
	const plugin = new Plugin(app);
	const ctx = makeFakeContext(app, NOTE, index);
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter');
	const running = new ElementPipeline(makeDeps()).run(counterElement, list[index], host);
	await settle();
	await running;
	document.body.appendChild(host.containerEl); // a blur is only a user's blur while the card is in the document
	expect(host.containerEl.querySelector('.dse-error-card')).toBeNull();
	return {
		app,
		root: () => host.containerEl.firstElementChild as HTMLElement,
		note: () => app.vault.getContent(NOTE)!,
		writes: () => app.vault.modifyCalls.length,
	};
}

/** A read-only counter (a canvas host): a stub host that can never persist, counting what it is asked to write. */
async function mountReadOnly(source: string) {
	const replaceSource = jest.fn(async (_s: string) => true);
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Canvas.md',
		containerEl,
		canPersist: false,
		addChild: (c: unknown) => c,
		getBlockInfo: () => ({ language: 'ds-counter', lineStart: 0, lineEnd: 5 }),
		replaceSource,
		blockKey: () => 'Canvas.md::ds-counter::0',
	} as unknown as BlockHost & { containerEl: HTMLElement };
	await new ElementPipeline(makeDeps()).run(counterElement, source, host);
	return { root: containerEl.firstElementChild as HTMLElement, replaceSource };
}

const ctl = <T extends HTMLElement = HTMLElement>(root: Element, id: string): T => {
	const el = root.querySelector<T>(`[data-dse-control="${id}"]`);
	if (!el) throw new Error(`no [data-dse-control="${id}"]`);
	return el;
};
const dec = (root: Element) => ctl<HTMLButtonElement>(root, 'counter.dec');
const inc = (root: Element) => ctl<HTMLButtonElement>(root, 'counter.inc');
const field = (root: Element) => ctl<HTMLInputElement>(root, 'counter.input');
/** What the card shows as the value (the field's value, or the read-only span's text). */
const shown = (root: Element): string => {
	const input = root.querySelector<HTMLInputElement>('[data-dse-control="counter.input"]');
	return input ? input.value : (ctl(root, 'counter.value').textContent ?? '');
};
/** `[minus disabled, plus disabled]`. */
const disabledPair = (root: Element): [boolean, boolean] => [dec(root).disabled, inc(root).disabled];
const press = (el: HTMLElement, key: string): KeyboardEvent => {
	const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	el.dispatchEvent(evt);
	return evt;
};
const leave = (el: HTMLElement): void => {
	el.dispatchEvent(new Event('blur'));
};
/** Type `text` into the field and commit it by `how`. */
function typeAndCommit(root: Element, text: string, how: 'Enter' | 'blur'): void {
	const input = field(root);
	input.value = text;
	if (how === 'Enter') press(input, 'Enter');
	else leave(input);
}

beforeEach(() => {
	jest.useFakeTimers();
});
afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
	document.body.innerHTML = '';
});

/** The block as the note holds it after the user's action must equal the block as written (every key it declared, in value) with only `current_value` changed. */
const expectWritten = (m: Mounted, spec: Spec, current: number, index = 0): void => {
	expect(valuesOf(m.note(), index)).toEqual({ ...valuesOf(noteOf([body(spec)])), current_value: current });
};

// ------------------------------------------------------------------------------------------- S / E. the buttons and the limits

// A button press moves the value by 1, never past a limit; a button at its limit is REALLY disabled, so a click on it writes nothing.
// `start` / `after` are `[minus disabled, plus disabled]`; `to` is the persisted value (null: nothing is written).
type StepRow = [label: string, spec: Spec, press: 'inc' | 'dec', start: [boolean, boolean], to: number | null, shownAfter: string, after: [boolean, boolean]];
const STEPS: StepRow[] = [
	['no limits (the floor defaults to 0), "+" at 5', { value: 5 }, 'inc', [false, false], 6, '6', [false, false]],
	['no limits, "-" at 5', { value: 5 }, 'dec', [false, false], 4, '4', [false, false]],
	['no limits, "-" at 1 reaches the default floor', { value: 1 }, 'dec', [false, false], 0, '0', [true, false]],
	['no limits, at the default floor "-" is disabled and writes nothing', { value: 0 }, 'dec', [true, false], null, '0', [true, false]],
	['no limits, "+" at the floor', { value: 0 }, 'inc', [true, false], 1, '1', [false, false]],
	['no value key at all reads 0', { }, 'inc', [true, false], 1, '1', [false, false]],
	['a max only, "+" at 9 of 10 reaches it', { value: 9, max: 10 }, 'inc', [false, false], 10, '10', [false, true]],
	['a max only, at the max "+" is disabled and writes nothing', { value: 10, max: 10 }, 'inc', [false, true], null, '10', [false, true]],
	['a max only, "-" from the max', { value: 10, max: 10 }, 'dec', [false, true], 9, '9', [false, false]],
	['a min only (2), "-" at 3 reaches it', { value: 3, min: 2 }, 'dec', [false, false], 2, '2', [true, false]],
	['a min only (2), at the min "-" is disabled and writes nothing', { value: 2, min: 2 }, 'dec', [true, false], null, '2', [true, false]],
	['a min only (2), "+" from the min', { value: 2, min: 2 }, 'inc', [true, false], 3, '3', [false, false]],
	['0..10, "+" at 5', { value: 5, min: 0, max: 10 }, 'inc', [false, false], 6, '6', [false, false]],
	['0..10, "-" at 5', { value: 5, min: 0, max: 10 }, 'dec', [false, false], 4, '4', [false, false]],
	['0..10, at 0 "-" is disabled and writes nothing', { value: 0, min: 0, max: 10 }, 'dec', [true, false], null, '0', [true, false]],
	['0..1, "+" at 0 reaches the max', { value: 0, min: 0, max: 1 }, 'inc', [true, false], 1, '1', [false, true]],
	['-5..5, "-" at 0 goes negative', { value: 0, min: -5, max: 5 }, 'dec', [false, false], -1, '-1', [false, false]],
	['-5..5, "-" at -4 reaches the min', { value: -4, min: -5, max: 5 }, 'dec', [false, false], -5, '-5', [true, false]],
	['-5..5, at -5 "-" is disabled and writes nothing', { value: -5, min: -5, max: 5 }, 'dec', [true, false], null, '-5', [true, false]],
	['min equal to max (3..3): both buttons start disabled, "+" writes nothing', { value: 3, min: 3, max: 3 }, 'inc', [true, true], null, '3', [true, true]],
	['min equal to max (3..3): "-" writes nothing', { value: 3, min: 3, max: 3 }, 'dec', [true, true], null, '3', [true, true]],
];

describe('SC-442 [S][E] the buttons: one step per press, never past a limit, a button at its limit is disabled', () => {
	test.each(STEPS)('%s', async (_label, spec, which, start, to, shownAfter, after) => {
		const m = await mount(body(spec));
		expect(shown(m.root())).toBe(String(spec.value ?? 0));
		expect(disabledPair(m.root())).toEqual(start);
		(which === 'inc' ? inc(m.root()) : dec(m.root())).click();
		await settle();
		expect(shown(m.root())).toBe(shownAfter);
		expect(disabledPair(m.root())).toEqual(after);
		if (to === null) {
			expect(m.writes()).toBe(0); // the click on a disabled button, or a press that changed nothing: no write
			expect(m.note()).toBe(noteOf([body(spec)]));
		} else {
			expect(m.writes()).toBe(1);
			expectWritten(m, spec, to);
		}
	});

	test.each([
		['five presses of "+" from 5 under max 8 stop at the max: ONE write of 8', { value: 5, min: 0, max: 8 }, ['inc', 'inc', 'inc', 'inc', 'inc'], 8, '8', [false, true]],
		['three of "+" then two of "-" coalesce into ONE write of the end value', { value: 5, min: 0, max: 10 }, ['inc', 'inc', 'inc', 'dec', 'dec'], 6, '6', [false, false]],
		['"+" then "-" back to the start writes the start value once', { value: 5, min: 0, max: 10 }, ['inc', 'dec'], 5, '5', [false, false]],
		['presses past the min stop at the min: ONE write of 0', { value: 2, min: 0, max: 10 }, ['dec', 'dec', 'dec', 'dec'], 0, '0', [true, false]],
	] as Array<[string, Spec, Array<'inc' | 'dec'>, number, string, [boolean, boolean]]>)('%s', async (_label, spec, presses, to, shownAfter, after) => {
		const m = await mount(body(spec));
		for (const which of presses) (which === 'inc' ? inc(m.root()) : dec(m.root())).click();
		await settle();
		expect(shown(m.root())).toBe(shownAfter);
		expect(disabledPair(m.root())).toEqual(after);
		expect(m.writes()).toBe(1);
		expectWritten(m, spec, to);
	});

	test('Space and Enter on a button are native activation, which arrives as a click with detail 0: the step lands, and the button that disables hands focus to the field', async () => {
		const m = await mount(body({ value: 1, min: 0, max: 3 }));
		const minus = dec(m.root());
		minus.focus();
		expect(document.activeElement).toBe(minus);
		minus.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); // what Enter / Space on a focused button does
		await settle();
		expect(shown(m.root())).toBe('0');
		expect(minus.disabled).toBe(true);
		expect(document.activeElement).toBe(field(m.root())); // SC-495: a keyboard step that disables the button keeps focus in the stepper
		expect(m.writes()).toBe(1);
		expectWritten(m, { value: 1, min: 0, max: 3 }, 0);
	});

	test('a mouse press (detail 1) that disables the button moves focus nowhere', async () => {
		const m = await mount(body({ value: 1, min: 0, max: 3 }));
		const minus = dec(m.root());
		minus.focus();
		minus.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await settle();
		expect(minus.disabled).toBe(true);
		expect(document.activeElement).not.toBe(field(m.root()));
	});
});

// ----------------------------------------------------------------------------------------------------------------- T / E. the typed value

// What a commit of the typed text lands: Math.trunc (toward zero) first, then clamped into [min, max]; an empty or unreadable box reverts
// (nothing written); a commit that lands the value already held writes nothing. Enter and blur are the same ONE commit path, so every row
// runs through both. `to` null: nothing is written. `after` is `[minus disabled, plus disabled]`.
type TypedRow = [label: string, spec: Spec, typed: string, shownAfter: string, to: number | null, after: [boolean, boolean]];
const BOUNDED: Spec = { value: 5, min: 0, max: 10 };
const UNBOUNDED: Spec = { value: 5 };
const SIGNED: Spec = { value: 0, min: -5, max: 5 };
const MAX_ONLY: Spec = { value: 5, max: 10 };
const TYPED: TypedRow[] = [
	// -- an integer in range
	['an integer in range', BOUNDED, '7', '7', 7, [false, false]],
	['zero reaches the min and disables "-"', BOUNDED, '0', '0', 0, [true, false]],
	['the max reaches it and disables "+"', BOUNDED, '10', '10', 10, [false, true]],
	['the value already held writes nothing', BOUNDED, '5', '5', null, [false, false]],
	['leading zeros are the number', BOUNDED, '007', '7', 7, [false, false]],
	// -- past a limit: clamped to it, and the button disables
	['past the max is clamped to the max', BOUNDED, '11', '10', 10, [false, true]],
	['far past the max is clamped to the max', BOUNDED, '999', '10', 10, [false, true]],
	['under the min is clamped to the min', BOUNDED, '-1', '0', 0, [true, false]],
	['a negative with no min_value is clamped to the default floor 0', UNBOUNDED, '-3', '0', 0, [true, false]],
	['a negative under a negative min is allowed', SIGNED, '-3', '-3', -3, [false, false]],
	['a negative past a negative min is clamped to it', SIGNED, '-9', '-5', -5, [true, false]],
	['a max-only counter clamps to the max', MAX_ONLY, '50', '10', 10, [false, true]],
	['an unbounded counter takes a large number', UNBOUNDED, '1000', '1000', 1000, [false, false]],
	// -- a decimal is cut toward zero (never persisted as a float), then clamped
	['a decimal is cut: 2.7 lands 2', BOUNDED, '2.7', '2', 2, [false, false]],
	['a decimal below one lands 0 (and the floor)', BOUNDED, '0.5', '0', 0, [true, false]],
	['a decimal that cuts to the held value writes nothing', BOUNDED, '5.5', '5', null, [false, false]],
	['a decimal past the max is cut then clamped', BOUNDED, '10.9', '10', 10, [false, true]],
	['a negative decimal is cut toward zero: -3.9 lands -3', SIGNED, '-3.9', '-3', -3, [false, false]],
	['a bare fraction (.5) is 0', BOUNDED, '.5', '0', 0, [true, false]],
	// -- an exponent
	['an exponent in range: 1e1 is 10', BOUNDED, '1e1', '10', 10, [false, true]],
	['an exponent past the max is clamped', BOUNDED, '1e3', '10', 10, [false, true]],
	['an exponent on an unbounded counter is the big number', UNBOUNDED, '1e3', '1000', 1000, [false, false]],
	['a negative exponent is a decimal: 1e-1 is cut to 0', BOUNDED, '1e-1', '0', 0, [true, false]],
	// -- a box that holds nothing readable reverts (jsdom, like a browser, empties the box for text a number field cannot hold)
	['an empty box reverts', BOUNDED, '', '5', null, [false, false]],
	['letters leave the box empty: it reverts', BOUNDED, 'abc', '5', null, [false, false]],
	['whitespace leaves the box empty: it reverts', BOUNDED, '  7 ', '5', null, [false, false]],
	['a comma leaves the box empty: it reverts', BOUNDED, '1,5', '5', null, [false, false]],
	['a hex number leaves the box empty: it reverts', BOUNDED, '0x10', '5', null, [false, false]],
];

describe.each(['Enter', 'blur'] as const)('SC-442 [T][E] the typed value, committed by %s', (how) => {
	test.each(TYPED)('%s', async (_label, spec, typed, shownAfter, to, after) => {
		const m = await mount(body(spec));
		typeAndCommit(m.root(), typed, how);
		await settle();
		expect(shown(m.root())).toBe(shownAfter);
		expect(disabledPair(m.root())).toEqual(after);
		if (to === null) {
			expect(m.writes()).toBe(0);
			expect(m.note()).toBe(noteOf([body(spec)]));
		} else {
			expect(m.writes()).toBe(1);
			expectWritten(m, spec, to);
		}
	});

	test('an untouched field in range commits nothing', async () => {
		const m = await mount(body(BOUNDED));
		if (how === 'Enter') press(field(m.root()), 'Enter');
		else leave(field(m.root()));
		await settle();
		expect(m.writes()).toBe(0);
		expect(shown(m.root())).toBe('5');
	});
});

describe('SC-442 [T] the typed value: one commit path, Escape', () => {
	test('Enter and then the blur that follows it write ONCE', async () => {
		const m = await mount(body(BOUNDED));
		typeAndCommit(m.root(), '8', 'Enter');
		leave(field(m.root()));
		await settle();
		expect(m.writes()).toBe(1);
		expectWritten(m, BOUNDED, 8);
	});

	test('a typed value then "+" starts from the committed value, not the draft: 7 typed, Enter, "+" is 8 (two commits, one coalesced write)', async () => {
		const m = await mount(body(BOUNDED));
		typeAndCommit(m.root(), '7', 'Enter');
		inc(m.root()).click();
		await settle();
		expect(shown(m.root())).toBe('8');
		expect(m.writes()).toBe(1);
		expectWritten(m, BOUNDED, 8);
	});

	test('Escape on a dirty draft puts the held value back, is swallowed, and the blur after it writes nothing', async () => {
		const m = await mount(body(BOUNDED));
		const input = field(m.root());
		input.value = '9';
		const evt = press(input, 'Escape');
		expect(evt.defaultPrevented).toBe(true);
		expect(input.value).toBe('5');
		leave(input);
		await settle();
		expect(m.writes()).toBe(0);
		expect(shown(m.root())).toBe('5');
	});

	test('Escape on a clean field is not swallowed (it bubbles to whatever owns Escape) and writes nothing', async () => {
		const m = await mount(body(BOUNDED));
		const evt = press(field(m.root()), 'Escape');
		expect(evt.defaultPrevented).toBe(false);
		await settle();
		expect(m.writes()).toBe(0);
	});

	test.each(['ArrowUp', 'ArrowDown', 'a', 'Tab', ' '])('%s in the field is not a commit: nothing is written until Enter or blur', async (key) => {
		const m = await mount(body(BOUNDED));
		const input = field(m.root());
		input.value = '9'; // what the browser's own number stepping does to the draft
		press(input, key);
		await settle();
		expect(m.writes()).toBe(0);
		press(input, 'Enter');
		await settle();
		expect(m.writes()).toBe(1);
		expectWritten(m, BOUNDED, 9);
	});

	test('the field carries the limits and the step for the browser\'s own ArrowUp / ArrowDown, and none when the counter has no max', async () => {
		const bounded = await mount(body(BOUNDED));
		expect(['min', 'max', 'step', 'type'].map((a) => field(bounded.root()).getAttribute(a))).toEqual(['0', '10', '1', 'number']);
		const open = await mount(body(UNBOUNDED));
		expect(field(open.root()).getAttribute('max')).toBeNull();
		expect(field(open.root()).getAttribute('min')).toBe('0');
	});
});

// ----------------------------------------------------------------------------------------------------------------- R. read-only

describe('SC-442 [R] a read-only counter (a host that cannot persist)', () => {
	const ROWS: Array<[string, Spec]> = [
		['no limits', { value: 5 }],
		['a value mid-range', { value: 5, min: 0, max: 10 }],
		['at the max', { value: 10, min: 0, max: 10 }],
		['at the min', { value: 0, min: 0, max: 10 }],
		['a negative range', { value: -2, min: -5, max: 5 }],
		['a value a hand edit left past the max', { value: 25, min: 0, max: 20 }],
	];

	test.each(ROWS)('%s: the value is a span, both buttons are disabled, and clicking them writes nothing', async (_label, spec) => {
		const { root, replaceSource } = await mountReadOnly(body(spec));
		expect(root.getAttribute('data-dse-readonly')).toBe('true');
		expect(root.querySelector('input')).toBeNull();
		expect(ctl(root, 'counter.value').tagName).toBe('SPAN');
		expect(shown(root)).toBe(String(spec.value));
		expect(disabledPair(root)).toEqual([true, true]);
		dec(root).click();
		inc(root).click();
		await settle();
		expect(shown(root)).toBe(String(spec.value));
		expect(replaceSource).not.toHaveBeenCalled();
	});

	test('the value span is a focus target only by script (tabindex -1), takes no key and nothing is written by one', async () => {
		const { root, replaceSource } = await mountReadOnly(body({ value: 5, min: 0, max: 10 }));
		const value = ctl(root, 'counter.value');
		expect(value.getAttribute('tabindex')).toBe('-1');
		for (const key of ['Enter', 'ArrowUp', 'Escape', ' ']) press(value, key);
		await settle();
		expect(replaceSource).not.toHaveBeenCalled();
		expect(shown(root)).toBe('5');
	});

	test('a writable counter has the same buttons and an input where the read-only one has the span', async () => {
		const m = await mount(body({ value: 5, min: 0, max: 10 }));
		expect(m.root().querySelector('[data-dse-control="counter.value"]')).toBeNull();
		expect(m.root().getAttribute('data-dse-readonly')).toBeNull();
		expect(disabledPair(m.root())).toEqual([false, false]);
	});
});

// ----------------------------------------------------------------------------------------------------------------- V. values a hand edit left out of range

// A persisted value may sit outside [min, max] (a hand edit, or a later-lowered max). It is SHOWN as stored; a button steps it back toward the
// range one press at a time and never further out; a typed commit lands inside the range.
describe('SC-442 [V] a hand-edited value outside [min, max]', () => {
	test.each([
		['past the max (25 of 20)', { value: 25, min: 0, max: 20 }, '25', [false, true]],
		['under the min (-5 of 0)', { value: -5, min: 0, max: 20 }, '-5', [true, false]],
		['past a max-only limit', { value: 12, max: 10 }, '12', [false, true]],
		['min above max (4 with min 5, max 3): both buttons are disabled', { value: 4, min: 5, max: 3 }, '4', [true, true]],
	] as Array<[string, Spec, string, [boolean, boolean]]>)('%s is shown as stored and nothing is written by drawing it', async (_label, spec, shownValue, start) => {
		const m = await mount(body(spec));
		expect(shown(m.root())).toBe(shownValue);
		expect(disabledPair(m.root())).toEqual(start);
		await settle();
		expect(m.writes()).toBe(0);
		expect(m.note()).toBe(noteOf([body(spec)]));
	});

	test('"-" from 25 over max 20 steps to 24 (one step toward the range, no snap to 20), and the next press to 23', async () => {
		const spec: Spec = { value: 25, min: 0, max: 20 };
		const m = await mount(body(spec));
		dec(m.root()).click();
		expect(shown(m.root())).toBe('24');
		dec(m.root()).click();
		await settle();
		expect(shown(m.root())).toBe('23');
		expect(m.writes()).toBe(1);
		expectWritten(m, spec, 23);
	});

	test('"+" from -5 under min 0 steps to -4 (toward the range), and a typed value then lands inside the range', async () => {
		const spec: Spec = { value: -5, min: 0, max: 20 };
		const m = await mount(body(spec));
		inc(m.root()).click();
		await settle();
		expect(shown(m.root())).toBe('-4');
		expectWritten(m, spec, -4);
		typeAndCommit(m.root(), '-9', 'Enter');
		await settle();
		expect(shown(m.root())).toBe('0');
		expectWritten(m, spec, 0);
	});

	test('a typed value over a stored out-of-range one clamps into the range: 99 over a stored 25 of 20 lands 20', async () => {
		const spec: Spec = { value: 25, min: 0, max: 20 };
		const m = await mount(body(spec));
		typeAndCommit(m.root(), '99', 'Enter');
		await settle();
		expect(shown(m.root())).toBe('20');
		expectWritten(m, spec, 20);
	});

	test('the disabled button at an out-of-range value writes nothing (the outward direction is closed)', async () => {
		const spec: Spec = { value: 25, min: 0, max: 20 };
		const m = await mount(body(spec));
		inc(m.root()).click();
		await settle();
		expect(shown(m.root())).toBe('25');
		expect(m.writes()).toBe(0);
	});
});

// ----------------------------------------------------------------------------------------------------------------- X. the note around the block

describe('SC-442 [X] the user\'s note around the block', () => {
	const SPEC: Spec = { value: 5, min: 0, max: 10 };
	const WRITES: Array<[string, (root: HTMLElement) => void, number]> = [
		['a "+" press', (root) => inc(root).click(), 6],
		['a "-" press', (root) => dec(root).click(), 4],
		['a typed value committed by Enter', (root) => typeAndCommit(root, '8', 'Enter'), 8],
		['a typed value committed by blur', (root) => typeAndCommit(root, '8', 'blur'), 8],
		['a typed value clamped to the max', (root) => typeAndCommit(root, '99', 'Enter'), 10],
	];

	test.each(WRITES)('%s: the text above and below the block, and the fence lines, are untouched', async (_label, act, to) => {
		const m = await mount(body(SPEC));
		const before = m.note();
		act(m.root());
		await settle();
		expect(m.note()).not.toBe(before);
		expect(outsideFences(m.note())).toBe(outsideFences(before));
		expect(m.note().split('\n').filter((l) => l === FENCE || l === '```')).toEqual(before.split('\n').filter((l) => l === FENCE || l === '```'));
		expectWritten(m, SPEC, to);
	});

	test('a hand-written note body of many shapes survives a write: headings, lists, tables, another fence kind', async () => {
		const app = new App();
		const text = ['# Title', '', '- a', '- b', '', '| x | y |', '| - | - |', '| 1 | 2 |', '', '```js', 'const a = 1;', '```', '', FENCE, body(SPEC), '```', '', '> quote', '', 'tail with trailing spaces   '].join('\n');
		app.vault.setFile(NOTE, text);
		const ctx = makeFakeContext(app, NOTE, 0);
		const host = new ReadingModeBlockHost(new Plugin(app) as any, ctx.el, ctx as any, 'ds-counter');
		const running = new ElementPipeline(makeDeps()).run(counterElement, body(SPEC), host);
		await settle();
		await running;
		inc(host.containerEl.firstElementChild as HTMLElement).click();
		await settle();
		const after = app.vault.getContent(NOTE)!;
		expect(after.replace(/```ds-counter\n[\s\S]*?\n```/, '')).toBe(text.replace(/```ds-counter\n[\s\S]*?\n```/, ''));
		expect(valuesOf(after).current_value).toBe(6);
	});

	test('two counters in one note do not cross-talk: each press changes only its own block, in either order, and twice', async () => {
		const first: Spec = { name: 'Health', value: 5, min: 0, max: 10 };
		const second: Spec = { name: 'Mana', value: 2, max: 9 };
		const app = new App();
		app.vault.setFile(NOTE, noteOf([body(first), body(second)]));
		const make = async (index: number, spec: Spec): Promise<HTMLElement> => {
			const ctx = makeFakeContext(app, NOTE, index);
			const host = new ReadingModeBlockHost(new Plugin(app) as any, ctx.el, ctx as any, 'ds-counter');
			const running = new ElementPipeline(makeDeps()).run(counterElement, body(spec), host);
			await settle();
			await running;
			document.body.appendChild(host.containerEl);
			return host.containerEl.firstElementChild as HTMLElement;
		};
		const a = await make(0, first);
		const b = await make(1, second);
		const bBefore = bodyOf(app.vault.getContent(NOTE)!, 1);
		inc(a).click();
		await settle();
		expect(valuesOf(app.vault.getContent(NOTE)!, 0)).toEqual({ name: 'Health', current_value: 6, min_value: 0, max_value: 10 });
		expect(bodyOf(app.vault.getContent(NOTE)!, 1)).toBe(bBefore); // the other block is byte-identical
		typeAndCommit(b, '7', 'Enter');
		await settle();
		expect(valuesOf(app.vault.getContent(NOTE)!, 1)).toEqual({ name: 'Mana', current_value: 7, max_value: 9 });
		expect(valuesOf(app.vault.getContent(NOTE)!, 0).current_value).toBe(6);
		dec(a).click();
		await settle();
		expect(valuesOf(app.vault.getContent(NOTE)!, 0).current_value).toBe(5);
		expect(valuesOf(app.vault.getContent(NOTE)!, 1).current_value).toBe(7);
		expect(outsideFences(app.vault.getContent(NOTE)!)).toBe(outsideFences(noteOf([body(first), body(second)])));
	});

	test('two IDENTICAL counters: a press on the second changes only the second block, and the first stays byte-identical', async () => {
		const spec: Spec = { value: 1, min: 0, max: 3 };
		const m = await mount([body(spec), body(spec)], 1);
		const firstBefore = bodyOf(m.note(), 0);
		inc(m.root()).click();
		await settle();
		expect(bodyOf(m.note(), 0)).toBe(firstBefore);
		expect(valuesOf(m.note(), 1).current_value).toBe(2);
	});

	test('keys a write must keep: a scalar `prefs:` and a non-boolean `collapsed:` (SC-652) survive a press and a typed commit, once each', async () => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined); // the framework warns about both on purpose
		for (const act of [(root: HTMLElement) => inc(root).click(), (root: HTMLElement) => typeAndCommit(root, '8', 'Enter')]) {
			const withKeys = `prefs: compact\ncollapsed: yes\n${body(SPEC)}`;
			const m = await mount(withKeys);
			act(m.root());
			await settle();
			const written = bodyOf(m.note());
			expect(valuesOf(m.note())).toMatchObject({ prefs: 'compact', collapsed: 'yes' });
			expect(written.split('\n').filter((l) => /^prefs\s*:/.test(l))).toHaveLength(1);
			expect(written.split('\n').filter((l) => /^collapsed\s*:/.test(l))).toHaveLength(1);
			expect(m.writes()).toBe(1);
		}
	});

	test('keys the block declared stay, and keys it did not declare are not added (SC-482): the heights are kept, no default is written', async () => {
		const declared = await mount('name: Torches\ncurrent_value: 5\nvalue_height: 6\nname_height: 2');
		inc(declared.root()).click();
		await settle();
		expect(valuesOf(declared.note())).toEqual({ name: 'Torches', current_value: 6, value_height: 6, name_height: 2 });
		const minimal = await mount('name: Torches\ncurrent_value: 5');
		inc(minimal.root()).click();
		await settle();
		expect(valuesOf(minimal.note())).toEqual({ name: 'Torches', current_value: 6 }); // no min_value, value_height or name_height appears
	});

	test('a block with only a name takes its first press as 1, and the name stays', async () => {
		const m = await mount('name: Torches');
		expect(shown(m.root())).toBe('0');
		inc(m.root()).click();
		await settle();
		expect(valuesOf(m.note())).toEqual({ name: 'Torches', current_value: 1 });
	});
});
