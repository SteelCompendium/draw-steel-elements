// Plan 07 Task 4 (F1 §6 step 7) — Counter: a small persisted element migrated onto
// Framework v2, retiring the legacy CounterProcessor + Counter/CounterView. Mirrors
// stamina-bar.test.ts's convention exactly: drives the element through the REAL
// ElementPipeline with real framework services, drives the persisted write path through a
// REAL ReadingModeBlockHost + FakeVault ("exactly one replaceSource, fence/alias
// preserved"), and asserts BYTE-COMPAT of `serialize` against the legacy
// `stringifyYaml(Counter.parseYaml(...)).trim()` write path (CodeBlocks.updateCounter ->
// updateMarkdownCodeBlock does exactly `stringifyYaml(data).trim()` on the Counter class
// instance — F1 §6's "byte-compatible output is the compatibility bar").
//
// Replaces the deleted legacy test/dom/elements/counter-view.test.ts (T-10b), which
// tested the legacy CounterView directly.
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
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { Counter } from '@model/Counter';
import { App, Plugin, parseYaml, stringifyYaml, makeFakeContext } from '../../mocks/obsidian';
import { counterElement } from '../../../src/elements/counter/definition';
import { CounterElementView } from '../../../src/elements/counter/view';
import { serialize as frameworkSerialize } from '../../../src/elements/counter/model';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import counterYaml from '../../fixtures/counter/health.yaml';

const CT_ALIASES = ['ds-ct', 'ds-counter'] as const;

/** The health fixture's byte-exact serialized form (Counter constructor field order:
 *  max_value, current_value, min_value, name, value_height, name_height), at `current`. */
function healthSerialized(current: number): string {
	return [
		'max_value: 20',
		`current_value: ${current}`,
		'min_value: 0',
		'name: Health',
		'value_height: 3',
		'name_height: 1',
	].join('\n');
}

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-ct', lineStart: 0, lineEnd: 5 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-ct::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as stamina-bar.test.ts — minus the dependency
 *  schemas: counter deliberately has NO schema (the legacy element never had one), so the
 *  ValidationService is never consulted for it. */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
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
	};
}

async function renderCounter(source: string = counterYaml, hostOverrides: Partial<BlockHost> = {}) {
	const pipeline = new ElementPipeline(makeDeps());
	const host = makeHost(hostOverrides);
	await pipeline.run(counterElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

const valueEl = (root: HTMLElement) => root.querySelector('.ds-counter-value') as HTMLElement;
const inputEl = (root: HTMLElement) => root.querySelector('.ds-counter-input') as HTMLInputElement | null;
const buttons = (root: HTMLElement) => root.querySelectorAll<HTMLButtonElement>('.ds-counter-button');

describe('Plan 07 Task 4: counter ElementDefinition (F1 §6 step 7)', () => {
	test('id/aliases/shape/serialize match the preserved ds-ct contract (persisted, NO schema)', () => {
		expect(counterElement.id).toBe('counter');
		expect(counterElement.name).toBe('Counter');
		expect(counterElement.aliases).toEqual(['ds-ct', 'ds-counter']);
		expect(counterElement.shape).toBe('persisted');
		// Deliberately no schema: the legacy element never had one (CounterProcessor parsed
		// the YAML straight into Counter) — same convention as negotiation.
		expect(counterElement.schema).toBeUndefined();
		expect(counterElement.serialize).toBeDefined();
		expect(counterElement.autoResolveRefs).toBe(false);
	});

	test('createView returns a CounterElementView', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = {
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			mode: host.mode,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		};
		expect(counterElement.createView(cx as any)).toBeInstanceOf(CounterElementView);
	});
});

describe('Plan 07 Task 4: counter rendered through the REAL ElementPipeline', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('root carries data-dse-element="counter" and data-dse-theme (F1 §3.5 contract)', async () => {
		const { root } = await renderCounter();
		expect(root.getAttribute('data-dse-element')).toBe('counter');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('renders the legacy DOM: ele-container, container (flex), value/name displays with height-driven font sizes, chevron buttons', async () => {
		const { root } = await renderCounter();

		const ele = root.querySelector('.ds-counter-ele-container') as HTMLElement;
		expect(ele).not.toBeNull();
		const container = ele.querySelector('.ds-counter-container') as HTMLElement;
		expect(container).not.toBeNull();
		expect(container.classList.contains('ds-counter-flex')).toBe(true);

		const value = valueEl(root);
		expect(value.textContent).toBe('10');
		expect(value.style.fontSize).toBe('3em'); // value_height default 3

		const name = root.querySelector('.ds-counter-name') as HTMLElement;
		expect(name.textContent).toBe('Health');
		expect(name.style.fontSize).toBe('1em'); // name_height default 1

		const btns = buttons(root);
		expect(btns).toHaveLength(2);
		expect(btns[0].getAttribute('data-icon')).toBe('chevron-up');
		expect(btns[1].getAttribute('data-icon')).toBe('chevron-down');
		expect(btns[0].hasAttribute('disabled')).toBe(false); // 10 < max 20
		expect(btns[1].hasAttribute('disabled')).toBe(false); // 10 > min 0
	});

	test('increment: model mutates, display updates in place, and — after the debounce — persists EXACTLY ONCE with byte-compat YAML', async () => {
		jest.useFakeTimers();
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const addChild = jest.fn((child: unknown) => child);
		const host = makeHost({ addChild: addChild as unknown as BlockHost['addChild'] });
		await pipeline.run(counterElement, counterYaml, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const view = addChild.mock.calls[0][0] as CounterElementView;

		buttons(root)[0].click();

		expect(((view as any).model as Counter).current_value).toBe(11);
		expect(valueEl(root).textContent).toBe('11');
		expect(host.replaceSource).not.toHaveBeenCalled(); // still inside the debounce window

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(11));
	});

	test('rapid clicks coalesce into ONE debounced write serializing the model at flush time (F1 §4.2)', async () => {
		jest.useFakeTimers();
		const { host, root } = await renderCounter();

		buttons(root)[0].click();
		buttons(root)[0].click();
		buttons(root)[0].click();
		expect(valueEl(root).textContent).toBe('13');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(13));
	});

	test('decrement mirrors increment', async () => {
		jest.useFakeTimers();
		const { host, root } = await renderCounter();

		buttons(root)[1].click();
		expect(valueEl(root).textContent).toBe('9');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(9));
	});

	test('bounds: at max the increment button is disabled and clicking never writes; same for min/decrement', async () => {
		jest.useFakeTimers();
		const atMax = await renderCounter('name: Health\ncurrent_value: 20\nmax_value: 20');
		expect(buttons(atMax.root)[0].hasAttribute('disabled')).toBe(true);
		buttons(atMax.root)[0].click();
		expect(valueEl(atMax.root).textContent).toBe('20');

		const atMin = await renderCounter('name: Health\ncurrent_value: 0\nmin_value: 0');
		expect(buttons(atMin.root)[1].hasAttribute('disabled')).toBe(true);
		buttons(atMin.root)[1].click();
		expect(valueEl(atMin.root).textContent).toBe('0');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(atMax.host.replaceSource).not.toHaveBeenCalled();
		expect(atMin.host.replaceSource).not.toHaveBeenCalled();
	});

	test('ties CounterElementView to host.addChild (block lifecycle)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const addChild = jest.fn((child: unknown) => child);
		const host = makeHost({ addChild: addChild as unknown as BlockHost['addChild'] });

		await pipeline.run(counterElement, counterYaml, host);

		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(CounterElementView);
	});

	test('malformed YAML renders the framework error card, not the legacy try/catch div', async () => {
		const { root } = await renderCounter('name: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.ds-counter-container')).toBeNull();
	});

	describe('click-to-edit input', () => {
		test('clicking the value swaps in a number input (buttons disabled while editing); Enter commits, restores the display, and persists exactly once', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter();

			valueEl(root).click();
			const input = inputEl(root)!;
			expect(input).not.toBeNull();
			expect(input.type).toBe('number');
			expect(input.value).toBe('10');
			expect(input.style.fontSize).toBe('3em');
			expect(root.querySelector('.ds-counter-value')).toBeNull(); // display swapped out
			expect(buttons(root)[0].hasAttribute('disabled')).toBe(true);
			expect(buttons(root)[1].hasAttribute('disabled')).toBe(true);

			input.value = '15';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

			expect(inputEl(root)).toBeNull(); // input swapped back out
			expect(valueEl(root).textContent).toBe('15');
			expect(buttons(root)[0].hasAttribute('disabled')).toBe(false);
			expect(buttons(root)[1].hasAttribute('disabled')).toBe(false);

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(15));
		});

		test('Enter then a late blur does NOT double-commit (finishEditing is guarded)', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter();

			valueEl(root).click();
			const input = inputEl(root)!;
			input.value = '15';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);

			// The detached input's blur (browsers may fire it after replaceWith) must no-op.
			input.dispatchEvent(new Event('blur'));
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
		});

		test('blur commits the edit (legacy behavior)', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter();

			valueEl(root).click();
			const input = inputEl(root)!;
			input.value = '12';
			input.dispatchEvent(new Event('blur'));

			expect(valueEl(root).textContent).toBe('12');
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(12));
		});

		test('out-of-range input clamps to max/min; non-numeric input reverts (legacy finishEditing rules)', async () => {
			jest.useFakeTimers();
			const over = await renderCounter();
			valueEl(over.root).click();
			const overInput = inputEl(over.root)!;
			overInput.value = '999';
			overInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
			expect(valueEl(over.root).textContent).toBe('20'); // clamped to max_value
			expect(buttons(over.root)[0].hasAttribute('disabled')).toBe(true); // at max now

			const bad = await renderCounter();
			valueEl(bad.root).click();
			const badInput = inputEl(bad.root)!;
			badInput.value = '';
			badInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
			expect(valueEl(bad.root).textContent).toBe('10'); // reverted
		});

		test('Escape reverts to the current value and closes the editor', async () => {
			jest.useFakeTimers();
			const { root } = await renderCounter();
			valueEl(root).click();
			const input = inputEl(root)!;
			input.value = '17';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			expect(inputEl(root)).toBeNull();
			expect(valueEl(root).textContent).toBe('10');
		});
	});

	describe('canPersist: false (F1 §4.4 — visible but inert)', () => {
		test('read-only badge attribute, disabled buttons, no click-to-edit, ZERO writes', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter(counterYaml, { canPersist: false });

			// Framework-level read-only affordance (the CSS badge hangs off this attribute).
			expect(root.hasAttribute('data-dse-readonly')).toBe(true);

			const btns = buttons(root);
			expect(btns[0].hasAttribute('disabled')).toBe(true);
			expect(btns[1].hasAttribute('disabled')).toBe(true);
			const container = root.querySelector('.ds-counter-container') as HTMLElement;
			expect(container.getAttribute('data-tooltip')).toBe('Read-only in this context');

			btns[0].click();
			btns[1].click();
			valueEl(root).click();
			expect(inputEl(root)).toBeNull(); // no editor swapped in
			expect(valueEl(root).textContent).toBe('10');

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});
	});
});

describe('Plan 07 Task 4: persisted write path through a REAL ReadingModeBlockHost + FakeVault (F1 §3.4/§4.2)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('increment -> exactly one Vault write; ~~~ds-ct fence style + alias preserved (CB-5); surrounding note intact', async () => {
		jest.useFakeTimers();
		const app = new App();
		const note = [
			'# Session notes',
			'',
			'Before text.',
			'',
			'~~~ds-ct',
			'name: Health',
			'current_value: 10',
			'max_value: 20',
			'min_value: 0',
			'~~~',
			'',
			'After text.',
		].join('\n');
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-ct');
		const pipeline = new ElementPipeline(makeDeps());

		await pipeline.run(counterElement, 'name: Health\ncurrent_value: 10\nmax_value: 20\nmin_value: 0', host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		buttons(root)[0].click();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Note.md')!;
		expect(updated.startsWith('# Session notes\n\nBefore text.\n\n~~~ds-ct\n')).toBe(true);
		expect(updated.endsWith('\n~~~\n\nAfter text.')).toBe(true);
		const body = updated.match(/~~~ds-ct\n([\s\S]*?)\n~~~/)?.[1];
		expect(body).toBe(healthSerialized(11));
	});
});

describe('Plan 07 Task 4: registered EXACTLY ONCE — framework registry owns ds-ct/ds-counter, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers counter; every alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('counter')?.id).toBe('counter');
		for (const alias of CT_ALIASES) {
			expect(registry.get(alias)?.id).toBe('counter');
		}
	});

	test('through the REAL onload(): each alias gets exactly one registerMarkdownCodeBlockProcessor call (no legacy double-registration)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		for (const alias of CT_ALIASES) {
			const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === alias);
			expect(calls).toHaveLength(1);
		}
		expect(plugin.frameworkV2!.registry.get('ds-ct')?.id).toBe('counter');

		registerSpy.mockRestore();
	});

	test('rendering a ds-ct block through the wired processor produces the counter DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-ct\n' + counterYaml.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-ct');

		await handler(counterYaml, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('counter');
		expect(root.querySelector('.ds-counter-value')!.textContent).toBe('10');
	});
});

describe('Plan 07 Task 4: byte-compat — serialize(parse(data)) === legacy stringifyYaml(Counter.parseYaml(yaml)).trim() (F1 §6)', () => {
	test('the health fixture', () => {
		const legacy = stringifyYaml(Counter.parseYaml(counterYaml)).trim();
		const model = counterElement.parse(parseYaml(counterYaml), counterYaml);
		expect(frameworkSerialize(model)).toBe(legacy);
		expect(legacy).toBe(healthSerialized(10));
	});

	test('minimal block: defaults materialize; undefined max_value is OMITTED, not null', () => {
		const yaml = 'name: Deaths';
		const legacy = stringifyYaml(Counter.parseYaml(yaml)).trim();
		const model = counterElement.parse(parseYaml(yaml), yaml);
		expect(frameworkSerialize(model)).toBe(legacy);
		expect(legacy).toBe(
			['current_value: 0', 'min_value: 0', 'name: Deaths', 'value_height: 3', 'name_height: 1'].join('\n'),
		);
	});

	test('after an in-place edit (mutating current_value does not change key insertion order)', () => {
		const model = counterElement.parse(parseYaml(counterYaml), counterYaml);
		model.current_value = 11;

		const legacyEquivalent = new Counter(20, 11, 0, 'Health', 3, 1);
		expect(frameworkSerialize(model)).toBe(stringifyYaml(legacyEquivalent).trim());
	});
});
