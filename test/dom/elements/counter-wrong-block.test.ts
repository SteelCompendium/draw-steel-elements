// A `ds-counter` block that is not a map of keys, drawn through the REAL ElementPipeline and read back from the bytes the host is asked to
// write. The model-level rules are in test/unit/model/counter-wrong-block.test.ts; this file holds what only the drawn card shows:
//  - text, a number, a boolean or a list is a plain error card (the message, no counter, no control, nothing written, no raw JavaScript);
//  - an empty block (nothing, blank lines, only comments, `null`, `~`) draws exactly the counter a `{}` block draws, and its first + writes
//    `current_value: 1`.
// The writes into a note with text around the block, and two empty blocks in one note, are in wrapperDefaultKeys.test.ts.
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
import { createRollService } from '../../../src/framework/roll/service';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, Notice } from '../../mocks/obsidian';
import { counterElement } from '../../../src/elements/counter/definition';

function makeHost() {
	const replaceSource = jest.fn(async (_s: string) => true);
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Counter.md',
		containerEl,
		canPersist: true,
		addChild: (c: unknown) => c,
		getBlockInfo: () => ({ language: 'ds-counter', lineStart: 0, lineEnd: 5 }),
		replaceSource,
		blockKey: () => 'Counter.md::ds-counter::0',
	};
	return host as unknown as BlockHost & { containerEl: HTMLElement; replaceSource: jest.Mock };
}

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

async function mount(src: string) {
	jest.useFakeTimers();
	const host = makeHost();
	await new ElementPipeline(makeDeps()).run(counterElement, src, host);
	const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	const writes = (): string[] => host.replaceSource.mock.calls.map((c) => c[0] as string);
	const live = (): HTMLElement => host.containerEl.firstElementChild as HTMLElement;
	return { host, live, flush, writes };
}

const plus = (root: Element): HTMLButtonElement => root.querySelector('.dse-stepper__btn[aria-label^="Increase"]') as HTMLButtonElement;
const minus = (root: Element): HTMLButtonElement => root.querySelector('.dse-stepper__btn[aria-label^="Decrease"]') as HTMLButtonElement;
const input = (root: Element): HTMLInputElement => root.querySelector('input.dse-counter__value') as HTMLInputElement;

beforeEach(() => {
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
	document.body.innerHTML = '';
	Notice.notices.length = 0;
});

describe('a counter block that is not a map of keys', () => {
	test.each([
		['text', 'hello'],
		['a quoted text', '"hello"'],
		['a number', '5'],
		['zero', '0'],
		['a boolean', 'true'],
		['false', 'false'],
		['a list', '- a\n- b'],
		['a flow list', '[1, 2]'],
		['a nested list', '- - a\n  - b'],
	])('%s: a plain error card, there is no counter or control, nothing is written', async (_name, source) => {
		const { host, live, flush, writes } = await mount(source);
		const card = live().querySelector('.dse-error-card')!;
		expect(card).not.toBeNull();
		expect(card.querySelector('.dse-error-card-title')!.textContent).toBe('Counter: failed to render (render)');
		expect(card.querySelector('.dse-error-card-message')!.textContent).toBe('Invalid data: the block must be a map of keys.');
		expect(card.textContent).not.toMatch(/is not a function|Cannot read properties|TypeError|undefined/);
		expect(live().getAttribute('data-dse-error-stage')).toBe('render');
		expect(live().querySelector('[data-dse-control]')).toBeNull();
		expect(live().querySelector('.dse-counter')).toBeNull();
		expect(live().querySelector('button, input')).toBeNull();
		await flush();
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(writes()).toEqual([]);
		expect(Notice.notices).toEqual([]);
	});

	test('a click on the error card writes nothing either', async () => {
		const { live, flush, writes } = await mount('hello');
		live().click();
		live().querySelector<HTMLElement>('.dse-error-card')!.click();
		await flush();
		expect(writes()).toEqual([]);
	});

	test('a YAML text that does not parse is still its own error card (not the map message), and nothing is written', async () => {
		const { live, flush, writes } = await mount('a: [1');
		expect(live().querySelector('.dse-error-card')).not.toBeNull();
		expect(live().querySelector('.dse-error-card-message')!.textContent).not.toContain('must be a map of keys');
		await flush();
		expect(writes()).toEqual([]);
	});
});

describe('an empty counter block is a fresh counter at 0', () => {
	test.each([
		['nothing', ''],
		['blank lines', '\n   \n\n'],
		['only comments', '# a note to self\n# and another'],
		['a bare null', 'null'],
		['a bare tilde', '~'],
	])('%s: no error, the very counter a `{}` block draws', async (_name, source) => {
		const empty = await mount(source);
		expect(empty.live().querySelector('.dse-error-card')).toBeNull();
		expect(empty.live().getAttribute('data-dse-error-stage')).toBeNull();
		expect(input(empty.live()).value).toBe('0');
		expect(empty.live().querySelector('.dse-counter__name')!.textContent).toBe('');
		expect(input(empty.live()).getAttribute('min')).toBe('0');
		expect(input(empty.live()).hasAttribute('max')).toBe(false);
		expect(minus(empty.live()).disabled).toBe(true); // 0 is the min
		expect(plus(empty.live()).disabled).toBe(false);

		const braces = await mount('{}');
		expect(empty.live().innerHTML).toBe(braces.live().innerHTML);
		await empty.flush();
		expect(empty.writes()).toEqual([]); // drawing writes nothing
	});

	test('the first + writes `current_value: 1` and nothing else', async () => {
		const { live, flush, writes } = await mount('');
		plus(live()).click();
		expect(input(live()).value).toBe('1');
		await flush();
		expect(writes()).toEqual(['current_value: 1']);
	});

	test('a comment-only block: the first + writes `current_value: 1` (the comment goes, as it does for every block)', async () => {
		const { live, flush, writes } = await mount('# a note to self');
		plus(live()).click();
		await flush();
		expect(writes()).toEqual(['current_value: 1']);
	});

	test('a number typed into an empty block writes that number', async () => {
		const { live, flush, writes } = await mount('');
		const box = input(live());
		box.value = '7';
		box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		await flush();
		expect(writes()).toEqual(['current_value: 7']);
	});
});
