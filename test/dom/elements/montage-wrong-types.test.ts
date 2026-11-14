// The montage drawn and written from a block whose values have the wrong TYPE (`title: 2024`, `rounds: "3"`), through the REAL
// ElementPipeline with real clicks, read back from the bytes the host is asked to write. The model-level rules are in
// test/unit/model/montage-wrong-types.test.ts; this file holds what only the drawn card shows: the title as text in the head and the
// folded summary, the board and tallies reading numbers, the bytes of a write that leaves a typed value alone, and the plain error
// card (no control, nothing written) for a map or list where the title belongs.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Notice, parseYaml } from '../../mocks/obsidian';
import { montageElement } from '../../../src/elements/montage/definition';
import { parse } from '../../../src/elements/montage/model';

function makeHost() {
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

async function mount(src: string) {
	jest.useFakeTimers();
	const host = makeHost();
	await new ElementPipeline(makeDeps()).run(montageElement, src, host);
	const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	const writes = (): string[] => host.replaceSource.mock.calls.map((c) => c[0] as string);
	const lastText = (): string => writes()[writes().length - 1];
	const last = (): Record<string, unknown> => parseYaml(lastText());
	const live = (): HTMLElement => host.containerEl.firstElementChild as HTMLElement;
	return { host, live, flush, writes, last, lastText };
}

const ctl = (root: Element, id: string, n = 0): HTMLElement => {
	const el = root.querySelectorAll<HTMLElement>(`[data-dse-control="${id}"]`)[n];
	if (!el) throw new Error(`no [data-dse-control="${id}"][${n}]`);
	return el;
};
const text = (root: Element, sel: string): string | undefined => root.querySelector(sel)?.textContent ?? undefined;

beforeEach(() => {
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
	document.body.innerHTML = '';
	Notice.notices.length = 0;
});

/** A full block around the line(s) under test. */
const block = (head: string, rest = 'rounds: 3\nsuccess_limit: 3\nfailure_limit: 2\nsuccesses: 0\nfailures: 0\ncurrent_round: 1'): string =>
	`${head}\n${rest}\nparticipants:\n  - name: Kira\n    skills_used: []\n  - name: Bram\n    skills_used: []`;

describe('a title that is a number or a boolean', () => {
	test.each([
		['2024', '2024'],
		['true', 'true'],
		['false', 'false'],
		['3.5', '3.5'],
	])('title: %s draws the montage with "%s" as its name, no error card', async (typed, shownText) => {
		const { live } = await mount(block(`title: ${typed}`));
		expect(live().querySelector('.dse-error-card')).toBeNull();
		expect(live().querySelector('.dse-mt')).not.toBeNull();
		expect(text(live(), '.dse-head__primary--left')).toBe(shownText);
		expect(text(live(), '.dse-head__eyebrow--left')).toBe('Montage Test');
	});

	test('the folded summary line names the montage by its title text', async () => {
		const summary = montageElement.chrome!.summary!;
		const model = parse(parseYaml('title: 2024\nrounds: 3'), '');
		expect(summary({ model } as any)).toMatchObject({ label: 'Montage', name: '2024' });
	});

	test.each([
		['Add a round', (root: HTMLElement) => ctl(root, 'montage.chrome.add-round').click()],
		['End round', (root: HTMLElement) => ctl(root, 'montage.bar.end-round').click()],
		['a quick log', (root: HTMLElement) => ctl(root, 'montage.quick.success', 0).click()],
		['Reset progress', (root: HTMLElement) => ctl(root, 'montage.chrome.reset-progress').click()],
	])('%s keeps `title: 2024` as the number the user typed', async (_name, act) => {
		const { live, flush, lastText, last } = await mount(block('title: 2024'));
		act(live());
		await flush();
		expect(lastText()).toMatch(/^title: 2024$/m);
		expect(lastText()).not.toMatch(/"2024"|'2024'/);
		expect(last().title).toBe(2024);
	});

	test('`title: true` and `title: 3.5` come back as a boolean and a float', async () => {
		const a = await mount(block('title: true'));
		ctl(a.live(), 'montage.chrome.add-round').click();
		await a.flush();
		expect(a.last().title).toBe(true);
		document.body.innerHTML = '';
		const b = await mount(block('title: 3.5'));
		ctl(b.live(), 'montage.chrome.add-round').click();
		await b.flush();
		expect(b.last().title).toBe(3.5);
	});

	test('a quoted title stays quoted text', async () => {
		const { live, flush, last } = await mount(block('title: "2024"'));
		ctl(live(), 'montage.chrome.add-round').click();
		await flush();
		expect(last().title).toBe('2024');
		expect(text(live(), '.dse-head__primary--left')).toBe('2024');
	});
});

describe('a map or list where the title belongs', () => {
	test.each([
		['a map', 'title:\n  a: 1'],
		['a list', 'title:\n  - a\n  - b'],
		['an empty list', 'title: []'],
	])('%s: a plain error card names the key, there is no control, nothing is written', async (_name, head) => {
		const { live, flush, writes } = await mount(block(head));
		const card = live().querySelector('.dse-error-card')!;
		expect(card).not.toBeNull();
		expect(card.querySelector('.dse-error-card-title')!.textContent).toBe('Montage Test tracker: failed to render (render)');
		expect(card.textContent).toContain("Invalid data: 'title' must be text.");
		expect(card.textContent).not.toMatch(/is not a function|Cannot read properties|_a\./);
		expect(live().getAttribute('data-dse-error-stage')).toBe('render');
		expect(live().querySelector('[data-dse-control]')).toBeNull();
		expect(live().querySelector('.dse-mt')).toBeNull();
		await flush();
		expect(writes()).toEqual([]);
		expect(Notice.notices).toEqual([]);
	});

	test('a null or empty title is not an error', async () => {
		for (const head of ['title:', "title: ''"]) {
			document.body.innerHTML = '';
			const { live } = await mount(block(head));
			expect(live().querySelector('.dse-error-card')).toBeNull();
			expect(text(live(), '.dse-head__primary--left')).toBe('Montage Test');
		}
	});
});

describe('a quoted number in a number key, drawn and written', () => {
	test('rounds: "3" draws three round columns and Add a round writes 4, not "31"', async () => {
		const { live, flush, lastText, last } = await mount(block('title: T', 'rounds: "3"\nsuccess_limit: 3\nfailure_limit: 2'));
		expect(live().querySelectorAll('.dse-mt__board-rhead')).toHaveLength(3);
		ctl(live(), 'montage.chrome.add-round').click();
		await flush();
		expect(last().rounds).toBe(4);
		expect(lastText()).not.toContain('31');
		expect(live().querySelectorAll('.dse-mt__board-rhead')).toHaveLength(4);
		expect(text(live(), '.dse-head__eyebrow--right')).toBe('Round 1 / 4');
	});

	test('current_round: "1" then End round writes 2, not "11", and the chip reads Round 2', async () => {
		const { live, flush, lastText, last } = await mount(block('title: T', 'rounds: 3\nsuccess_limit: 3\nfailure_limit: 2\ncurrent_round: "1"'));
		expect(text(live(), '.dse-head__eyebrow--right')).toBe('Round 1 / 3');
		ctl(live(), 'montage.bar.end-round').click();
		await flush();
		expect(last().current_round).toBe(2);
		expect(lastText()).not.toContain('11');
		expect(text(live(), '.dse-head__eyebrow--right')).toBe('Round 2 / 3');
	});

	test('successes: "2" with a success limit of 3: one quick success writes 3 (a number) and reaches Total Success', async () => {
		const { live, flush, last } = await mount(block('title: T', 'rounds: 3\nsuccess_limit: "3"\nfailure_limit: 2\nsuccesses: "2"\nfailures: "0"'));
		expect(text(live(), '.dse-mt__verdict-word')).toBe('Partial Success');
		ctl(live(), 'montage.quick.success', 0).click();
		await flush();
		expect(last()).toMatchObject({ successes: 3, failures: '0', success_limit: '3' });
		expect(text(live(), '.dse-mt__verdict-word')).toBe('Total Success');
	});

	test('failures: "1" and a quick failure write 2', async () => {
		const { live, flush, last } = await mount(block('title: T', 'rounds: 3\nsuccess_limit: 3\nfailure_limit: 5\nsuccesses: 0\nfailures: "1"'));
		ctl(live(), 'montage.quick.failure', 0).click();
		await flush();
		expect(last().failures).toBe(2);
	});

	test('Set limits pre-fills the number a quoted limit reads as and writes both limits as numbers', async () => {
		const { live, flush, last } = await mount(block('title: T', 'rounds: 3\nsuccess_limit: "4"\nfailure_limit: banana'));
		ctl(live(), 'montage.chrome.set-limits').click();
		const success = document.body.querySelector<HTMLInputElement>('input[aria-label="Success limit"]')!;
		const failure = document.body.querySelector<HTMLInputElement>('input[aria-label="Failure limit"]')!;
		expect([success.value, failure.value]).toEqual(['4', '0']);
		success.value = '5';
		success.dispatchEvent(new Event('input', { bubbles: true }));
		ctl(document.body, 'montage.limits.save').click();
		await flush();
		expect(last()).toMatchObject({ success_limit: 5, failure_limit: 0 });
	});

	test('a string tally that is not a number reads as 0: the board is "Not started", the track has no filled slots', async () => {
		const { live } = await mount(block('title: T', 'rounds: 3\nsuccess_limit: 3\nfailure_limit: 2\nsuccesses: banana\nfailures: true'));
		expect(text(live(), '.dse-mt__verdict-word')).toBe('Not started');
		expect(live().querySelectorAll('.dse-mt__track-slot[data-filled="on"]')).toHaveLength(0);
	});

	test('rounds: banana draws the default two columns', async () => {
		const { live } = await mount(block('title: T', 'rounds: banana\nsuccess_limit: 3\nfailure_limit: 2'));
		expect(live().querySelectorAll('.dse-mt__board-rhead')).toHaveLength(2);
	});
});

describe('an untouched typed value is written back as typed', () => {
	test.each([
		['current_round: "1"', 'current_round', '1'],
		['rounds: banana', 'rounds', 'banana'],
		['rounds: "3"', 'rounds', '3'],
		['successes: true', 'successes', true],
		['failures: " 2 "', 'failures', ' 2 '],
	])('%s survives Add a hero', async (typedLine, key, typedValue) => {
		const rest = ['rounds: 3', 'success_limit: 3', 'failure_limit: 2', 'successes: 0', 'failures: 0', 'current_round: 1'].filter((l) => !l.startsWith(`${key}:`));
		const { live, flush, last } = await mount(block('title: T', [typedLine, ...rest].join('\n')));
		ctl(live(), 'montage.chrome.add-hero').click();
		const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Hero\'s name"]')!;
		input.value = 'Ash';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		ctl(document.body, 'montage.add-hero.submit').click();
		await flush();
		expect(last()[key]).toBe(typedValue);
		expect(JSON.stringify(last().participants)).toContain('Ash');
	});

	test('a map and a list typed in number keys come back as maps and lists after a write that leaves them alone', async () => {
		const { live, flush, last } = await mount(block('title: T', 'rounds: 3\nsuccess_limit: [1, 2]\nfailure_limit:\n  a: 1\nsuccesses: 0'));
		ctl(live(), 'montage.chrome.add-round').click();
		await flush();
		expect(last()).toMatchObject({ rounds: 4, success_limit: [1, 2], failure_limit: { a: 1 } });
	});

	test('two typed values, one changed and one not, in one write', async () => {
		const { live, flush, last } = await mount(block('title: 2024', 'rounds: "3"\nsuccess_limit: "3"\nfailure_limit: 2\ncurrent_round: "1"'));
		ctl(live(), 'montage.chrome.add-round').click();
		await flush();
		expect(last()).toMatchObject({ title: 2024, rounds: 4, success_limit: '3', current_round: '1' });
	});
});

describe('the folded summary', () => {
	test('a block with quoted numbers reads them as numbers', () => {
		const summary = montageElement.chrome!.summary!;
		const model = parse(parseYaml('title: T\nrounds: "3"\ncurrent_round: "2"\nsuccesses: "1"\nsuccess_limit: "4"'), '');
		expect(summary({ model } as any)).toMatchObject({ detail: 'round 2 · 1/4' });
	});
});
