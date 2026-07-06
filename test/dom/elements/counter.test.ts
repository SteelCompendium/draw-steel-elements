// Plan 09 Task 4 (D2 §3.9) — Counter redesigned onto the D2 kit `stepper`: the
// counterElement definition + CounterElementView driven through the REAL ElementPipeline
// (same harness as stamina-bar/values-row). The redesign replaces the legacy
// hand-rolled chevron <button>s + click-to-edit input swap with ONE kit stepper
// (`integer: true` — a typed "5.5" commits 5, never persists a float; `editable: true`
// — CB-10 single-commit typed input) whose value node IS the counter's big value
// (`.dse-counter__value`), over a muted `.dse-counter__name`.
//
// SC-5 eviction: value_height/name_height arrive as --dse-value-scale/--dse-label-scale
// custom properties (sanctioned --dse-* geometry via setProperty) — NEVER inline
// font-size; the legacy input's inline height:1em became a stylesheet rule.
//
// Persistence is UNTOUCHED (F1 §6 byte-compat bar): the write path still drives a REAL
// ReadingModeBlockHost + FakeVault ("exactly one replaceSource, fence/alias preserved"),
// and `serialize` stays byte-identical to the legacy
// `stringifyYaml(Counter.parseYaml(...)).trim()` (CodeBlocks.updateCounter ->
// updateMarkdownCodeBlock did exactly `stringifyYaml(data).trim()`).
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
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { Counter } from '@model/Counter';
import { App, Plugin, parseYaml, stringifyYaml, makeFakeContext } from '../../mocks/obsidian';
import { counterElement } from '../../../src/elements/counter/definition';
import { CounterElementView } from '../../../src/elements/counter/view';
import { serialize as frameworkSerialize } from '../../../src/elements/counter/model';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
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
	};
}

async function renderCounter(source: string = counterYaml, hostOverrides: Partial<BlockHost> = {}) {
	const pipeline = new ElementPipeline(makeDeps());
	const host = makeHost(hostOverrides);
	await pipeline.run(counterElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

// -- kit-DOM accessors (D2 §3.9 grammar) --
const counterEl = (root: HTMLElement) => root.querySelector('.dse-counter') as HTMLElement;
const stepperEl = (root: HTMLElement) => root.querySelector('.dse-stepper') as HTMLElement;
/** The editable stepper input, which carries the element's value class. */
const inputEl = (root: HTMLElement) =>
	root.querySelector('input.dse-counter__value') as HTMLInputElement | null;
const minusBtn = (root: HTMLElement) =>
	root.querySelector('.dse-stepper__btn[aria-label^="Decrease"]') as HTMLButtonElement;
const plusBtn = (root: HTMLElement) =>
	root.querySelector('.dse-stepper__btn[aria-label^="Increase"]') as HTMLButtonElement;
const nameEl = (root: HTMLElement) => root.querySelector('.dse-counter__name') as HTMLElement;

function pressKey(el: HTMLElement, key: string): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

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

describe('Plan 09 Task 4: counter rendered through the REAL ElementPipeline (D2 §3.9 kit stepper)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('root carries data-dse-element="counter" and data-dse-theme (F1 §3.5 contract)', async () => {
		const { root } = await renderCounter();
		expect(root.getAttribute('data-dse-element')).toBe('counter');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
	});

	test('kit DOM: ONE .dse-counter with a kit stepper (two REAL buttons + editable number input as the value) over a .dse-counter__name; NO legacy .ds-counter-* DOM survives', async () => {
		const { root } = await renderCounter();

		const el = counterEl(root);
		expect(el).not.toBeNull();
		expect(root.querySelectorAll('.dse-counter')).toHaveLength(1);
		expect(root.querySelector('[class*="ds-counter"]')).toBeNull();

		// The kit stepper: role=group named after the counter, minus/plus REAL <button>s.
		const triad = stepperEl(root);
		expect(triad).not.toBeNull();
		expect(triad.getAttribute('role')).toBe('group');
		expect(triad.getAttribute('aria-label')).toBe('Health');
		expect(minusBtn(root).tagName).toBe('BUTTON');
		expect(plusBtn(root).tagName).toBe('BUTTON');
		expect(minusBtn(root).getAttribute('aria-label')).toBe('Decrease Health');
		expect(plusBtn(root).getAttribute('aria-label')).toBe('Increase Health');
		expect(minusBtn(root).querySelector('.dse-btn__icon')!.getAttribute('data-icon')).toBe('minus');
		expect(plusBtn(root).querySelector('.dse-btn__icon')!.getAttribute('data-icon')).toBe('plus');
		expect(minusBtn(root).disabled).toBe(false); // 10 > min 0
		expect(plusBtn(root).disabled).toBe(false); // 10 < max 20

		// CB-10: the value IS the stepper's editable input (single-commit path), tagged
		// with the element's value class; min/max/step forwarded as native attrs.
		const input = inputEl(root)!;
		expect(input).not.toBeNull();
		expect(input.type).toBe('number');
		expect(input.value).toBe('10');
		expect(input.classList.contains('dse-stepper__input')).toBe(true);
		expect(input.getAttribute('min')).toBe('0');
		expect(input.getAttribute('max')).toBe('20');
		expect(input.getAttribute('step')).toBe('1');

		expect(nameEl(root).textContent).toBe('Health');
	});

	test('SC-5 eviction: value_height/name_height arrive as --dse-value-scale/--dse-label-scale via setProperty — NO inline font-size/height/color anywhere', async () => {
		const { root } = await renderCounter();

		// Fixture omits the heights -> model defaults (3 / 1) materialize as the props.
		const el = counterEl(root);
		expect(el.style.getPropertyValue('--dse-value-scale')).toBe('3');
		expect(el.style.getPropertyValue('--dse-label-scale')).toBe('1');

		const custom = await renderCounter('name: Piety\ncurrent_value: 3\nvalue_height: 2\nname_height: 1.5');
		const customEl = counterEl(custom.root);
		expect(customEl.style.getPropertyValue('--dse-value-scale')).toBe('2');
		expect(customEl.style.getPropertyValue('--dse-label-scale')).toBe('1.5');

		// The old CounterView inline sites (fontSize on value/name/input, height on the
		// input) are gone: no inline font-size/height, no inline color, and every inline
		// declaration that DOES exist is a --dse-* custom property.
		for (const node of Array.from(root.querySelectorAll<HTMLElement>('*')).concat(root)) {
			expect(node.style.fontSize).toBe('');
			expect(node.style.height).toBe('');
			expect(node.style.color).toBe('');
			const inline = node.getAttribute('style');
			if (inline !== null) {
				for (const decl of inline.split(';')) {
					if (decl.trim() === '') continue;
					expect(decl.trim().startsWith('--dse-')).toBe(true);
				}
			}
		}
	});

	test('view source hygiene: the ONLY .style access is setProperty("--dse-*", …) (shared kit style guard)', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/counter/view.ts'),
			'utf8',
		);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('increment: model mutates, the stepper refreshes in place, and — after the debounce — persists EXACTLY ONCE with byte-compat YAML', async () => {
		jest.useFakeTimers();
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const addChild = jest.fn((child: unknown) => child);
		const host = makeHost({ addChild: addChild as unknown as BlockHost['addChild'] });
		await pipeline.run(counterElement, counterYaml, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const view = addChild.mock.calls[0][0] as CounterElementView;

		plusBtn(root).click();

		expect(((view as any).model as Counter).current_value).toBe(11);
		expect(inputEl(root)!.value).toBe('11');
		expect(host.replaceSource).not.toHaveBeenCalled(); // still inside the debounce window

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(11));
	});

	test('rapid clicks coalesce into ONE debounced write serializing the model at flush time (F1 §4.2)', async () => {
		jest.useFakeTimers();
		const { host, root } = await renderCounter();

		plusBtn(root).click();
		plusBtn(root).click();
		plusBtn(root).click();
		expect(inputEl(root)!.value).toBe('13');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(13));
	});

	test('decrement mirrors increment', async () => {
		jest.useFakeTimers();
		const { host, root } = await renderCounter();

		minusBtn(root).click();
		expect(inputEl(root)!.value).toBe('9');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(9));
	});

	test('CB-8 bounds: at max the plus is REAL-disabled and even a synthetic click never writes; same for min/minus; an unbounded counter never disables plus', async () => {
		jest.useFakeTimers();
		const atMax = await renderCounter('name: Health\ncurrent_value: 20\nmax_value: 20');
		expect(plusBtn(atMax.root).disabled).toBe(true); // the REAL property, not a class
		expect(minusBtn(atMax.root).disabled).toBe(false);
		plusBtn(atMax.root).click(); // synthetic dispatch — the kit guard swallows it (CB-8)
		expect(inputEl(atMax.root)!.value).toBe('20');

		const atMin = await renderCounter('name: Health\ncurrent_value: 0\nmin_value: 0');
		expect(minusBtn(atMin.root).disabled).toBe(true);
		minusBtn(atMin.root).click();
		expect(inputEl(atMin.root)!.value).toBe('0');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(atMax.host.replaceSource).not.toHaveBeenCalled(); // clamped click skips the write
		expect(atMin.host.replaceSource).not.toHaveBeenCalled();

		// No max_value in the YAML -> unbounded: plus stays enabled arbitrarily high.
		const unbounded = await renderCounter('name: Deaths\ncurrent_value: 9999');
		expect(plusBtn(unbounded.root).disabled).toBe(false);
		expect(inputEl(unbounded.root)!.hasAttribute('max')).toBe(false);
	});

	describe('out-of-range persisted value (P09 T4 review — clampInitial:false, legacy CounterView parity)', () => {
		// A hand-edited current_value: 25 with max_value: 20 must DISPLAY as 25 (the
		// legacy CounterView rendered current_value.toString(), never clamped) and step
		// back toward the range one press at a time (legacy decrement guarded only by
		// min: 25 → 24, NOT a jump to 20).
		const OVER_MAX_YAML = 'name: Health\ncurrent_value: 25\nmax_value: 20\nmin_value: 0';

		test('a stored current_value ABOVE max renders AS-STORED (25, not clamped 20); plus disabled, minus enabled', async () => {
			const { root } = await renderCounter(OVER_MAX_YAML);
			expect(inputEl(root)!.value).toBe('25');
			expect(plusBtn(root).disabled).toBe(true); // can't go FURTHER above max
			expect(minusBtn(root).disabled).toBe(false); // stepping back in is allowed
		});

		test('a stored current_value BELOW min renders AS-STORED (-5); minus disabled, plus enabled', async () => {
			const { root } = await renderCounter('name: Health\ncurrent_value: -5\nmax_value: 20\nmin_value: 0');
			expect(inputEl(root)!.value).toBe('-5');
			expect(minusBtn(root).disabled).toBe(true);
			expect(plusBtn(root).disabled).toBe(false);
		});

		test('the first minus from 25 mutates the model to 24 (NOT 20) and persists EXACTLY ONCE, byte-compat', async () => {
			jest.useFakeTimers();
			const deps = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const addChild = jest.fn((child: unknown) => child);
			const host = makeHost({ addChild: addChild as unknown as BlockHost['addChild'] });
			await pipeline.run(counterElement, OVER_MAX_YAML, host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			const view = addChild.mock.calls[0][0] as CounterElementView;

			minusBtn(root).click();

			expect(((view as any).model as Counter).current_value).toBe(24);
			expect(inputEl(root)!.value).toBe('24');

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(24));
		});

		test('typed edits STILL clamp (legacy finishEditing parity): a draft "99" over a stored 25 commits 20', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter(OVER_MAX_YAML);
			const input = inputEl(root)!;
			input.value = '99';
			pressKey(input, 'Enter');
			expect(input.value).toBe('20');
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(20));
		});
	});

	describe('editable value (kit stepper input — CB-10 single-commit)', () => {
		test('typing a value and pressing Enter commits once and persists exactly once, byte-compat', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter();

			const input = inputEl(root)!;
			input.value = '15';
			pressKey(input, 'Enter');

			expect(input.value).toBe('15');
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(15));
		});

		test('CB-10: Enter then the trailing blur does NOT double-commit (one commit path, no-op unless changed)', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter();

			const input = inputEl(root)!;
			input.value = '15';
			pressKey(input, 'Enter');
			input.dispatchEvent(new Event('blur'));

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(15));
		});

		test('blur alone commits the edit (legacy behavior preserved)', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter();

			const input = inputEl(root)!;
			input.value = '12';
			input.dispatchEvent(new Event('blur'));

			expect(input.value).toBe('12');
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(12));
		});

		test('integer: a typed "5.5" commits 5 (Math.trunc, parseInt semantics) — the counter NEVER persists a float', async () => {
			jest.useFakeTimers();
			const deps = makeDeps();
			const pipeline = new ElementPipeline(deps);
			const addChild = jest.fn((child: unknown) => child);
			const host = makeHost({ addChild: addChild as unknown as BlockHost['addChild'] });
			await pipeline.run(counterElement, counterYaml, host);
			const root = host.containerEl.firstElementChild as HTMLElement;
			const view = addChild.mock.calls[0][0] as CounterElementView;

			const input = inputEl(root)!;
			input.value = '5.5';
			pressKey(input, 'Enter');

			const model = (view as any).model as Counter;
			expect(model.current_value).toBe(5);
			expect(Number.isInteger(model.current_value)).toBe(true);
			expect(input.value).toBe('5'); // display normalized, not "5.5"

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).toHaveBeenCalledTimes(1);
			expect(host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(5));
		});

		test('out-of-range input clamps to max (and REAL-disables plus at the new bound); empty/invalid input reverts with NO write', async () => {
			jest.useFakeTimers();
			const over = await renderCounter();
			const overInput = inputEl(over.root)!;
			overInput.value = '999';
			pressKey(overInput, 'Enter');
			expect(overInput.value).toBe('20'); // clamped to max_value
			expect(plusBtn(over.root).disabled).toBe(true); // at max now (CB-8)
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(over.host.replaceSource).toHaveBeenCalledTimes(1);
			expect(over.host.replaceSource.mock.calls[0][0]).toBe(healthSerialized(20));

			const bad = await renderCounter();
			const badInput = inputEl(bad.root)!;
			badInput.value = '';
			pressKey(badInput, 'Enter');
			expect(badInput.value).toBe('10'); // reverted
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(bad.host.replaceSource).not.toHaveBeenCalled(); // nothing changed, nothing written
		});

		test('Escape reverts a dirty draft in place (CB-10); the following blur is a no-op — NO write', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter();

			const input = inputEl(root)!;
			input.value = '17';
			pressKey(input, 'Escape');
			expect(input.value).toBe('10'); // reverted, editor stays in place

			input.dispatchEvent(new Event('blur'));
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});
	});

	describe('canPersist: false (F1 §4.4 — visible but inert)', () => {
		test('read-only badge attribute, REAL-disabled stepper buttons, a static (non-input) value, tooltip, ZERO writes', async () => {
			jest.useFakeTimers();
			const { host, root } = await renderCounter(counterYaml, { canPersist: false });

			// Framework-level read-only affordance (the CSS badge hangs off this attribute).
			expect(root.hasAttribute('data-dse-readonly')).toBe(true);

			expect(minusBtn(root).disabled).toBe(true);
			expect(plusBtn(root).disabled).toBe(true);
			expect(counterEl(root).getAttribute('data-tooltip')).toBe('Read-only in this context');

			// No editable input at all: the value renders as the stepper's static span,
			// still carrying the element's value class.
			expect(inputEl(root)).toBeNull();
			const value = root.querySelector('.dse-stepper__value.dse-counter__value') as HTMLElement;
			expect(value).not.toBeNull();
			expect(value.textContent).toBe('10');

			plusBtn(root).click();
			minusBtn(root).click();
			expect(value.textContent).toBe('10');

			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(host.replaceSource).not.toHaveBeenCalled();
		});
	});

	test('malformed YAML renders the framework error card, not the legacy try/catch div', async () => {
		const { root } = await renderCounter('name: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-counter')).toBeNull();
	});

	test('ties CounterElementView to host.addChild (block lifecycle)', async () => {
		const pipeline = new ElementPipeline(makeDeps());
		const addChild = jest.fn((child: unknown) => child);
		const host = makeHost({ addChild: addChild as unknown as BlockHost['addChild'] });

		await pipeline.run(counterElement, counterYaml, host);

		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(CounterElementView);
	});

	test('CSS contract: .dse-counter is scoped under [data-dse-element="counter"], consumes --dse-fg/--dse-fg-muted + the scale properties, carries the evicted input height — and the old .ds-counter-* block is GONE', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		const block = sheet.match(/\[data-dse-element="counter"\]\s+\.dse-counter\s*\{[\s\S]*?\n\}/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-fg\)/);
		expect(block![0]).toMatch(/var\(--dse-fg-muted\)/);
		expect(block![0]).toMatch(/calc\(var\(--dse-value-scale/);
		expect(block![0]).toMatch(/calc\(var\(--dse-label-scale/);
		// The legacy inline `inputField.style.height = '1em'` lives here as a class rule now.
		expect(block![0]).toMatch(/height:\s*1em/);

		// The whole legacy class block is evicted.
		expect(sheet).not.toMatch(/\.ds-counter-/);
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
		plusBtn(root).click();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Note.md')!;
		expect(updated.startsWith('# Session notes\n\nBefore text.\n\n~~~ds-ct\n')).toBe(true);
		expect(updated.endsWith('\n~~~\n\nAfter text.')).toBe(true);
		const body = updated.match(/~~~ds-ct\n([\s\S]*?)\n~~~/)?.[1];
		expect(body).toBe(healthSerialized(11));
	});

	test('out-of-range stored 25/max 20 (T4 review): renders 25, first minus persists 24 — exactly one Vault write, byte-identical', async () => {
		jest.useFakeTimers();
		const app = new App();
		const source = 'name: Health\ncurrent_value: 25\nmax_value: 20\nmin_value: 0';
		const note = ['Before text.', '', '~~~ds-ct', ...source.split('\n'), '~~~', '', 'After text.'].join('\n');
		app.vault.setFile('Note.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-ct');
		const pipeline = new ElementPipeline(makeDeps());

		await pipeline.run(counterElement, source, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(inputEl(root)!.value).toBe('25'); // shown as stored, never silently 20

		minusBtn(root).click();
		expect(inputEl(root)!.value).toBe('24'); // one step toward the range — legacy arithmetic

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const body = app.vault.getContent('Note.md')!.match(/~~~ds-ct\n([\s\S]*?)\n~~~/)?.[1];
		expect(body).toBe(healthSerialized(24));
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

	test('rendering a ds-ct block through the wired processor produces the counter stepper DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-ct\n' + counterYaml.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-ct');

		await handler(counterYaml, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('counter');
		expect(inputEl(root)!.value).toBe('10');
		expect(nameEl(root).textContent).toBe('Health');
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
