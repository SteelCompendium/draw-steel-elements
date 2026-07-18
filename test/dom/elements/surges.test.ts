// D7 Task 5 (spec §4.3) — ds-surges through the REAL ElementPipeline: a labeled stepper
// (floor 0, no ceiling) plus a "each = +N damage" hint when highest_characteristic is
// authored, and read-only inertness. Mirrors test/dom/elements/resource.test.ts's
// structure (the closest sibling: a flat HeroPanel-backed persisted element).
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { createRenderContext } from '../../../src/framework/context';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { createRollService } from '../../../src/framework/roll/service';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { surgesElement } from '../../../src/elements/surges/definition';
import { SurgePanelContainer } from '../../../src/elements/surges/view';
import { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import surgesYaml from '../../../src/elements/surges/example.yaml';

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-surges', lineStart: 0, lineEnd: 2 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-surges::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

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
		roll: createRollService(prefs),
	};
}

async function renderSurges(source: string = surgesYaml, hostOverrides: Partial<BlockHost> = {}) {
	const pipeline = new ElementPipeline(makeDeps());
	const host = makeHost(hostOverrides);
	await pipeline.run(surgesElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

// -- kit-DOM accessors --
const label = (root: HTMLElement) => root.querySelector('.dse-surge__label')?.textContent ?? '';
const hint = (root: HTMLElement) => root.querySelector('.dse-surge__hint')?.textContent ?? '';
const stepperValue = (root: HTMLElement) =>
	root.querySelector<HTMLInputElement>('.dse-surge__stepper .dse-stepper__input')?.value ??
	root.querySelector('.dse-surge__stepper .dse-stepper__value')?.textContent ??
	'';
const minusBtn = (root: HTMLElement) =>
	root.querySelector<HTMLButtonElement>('.dse-surge__stepper .dse-stepper__btn[aria-label^="Decrease"]');
const plusBtn = (root: HTMLElement) =>
	root.querySelector<HTMLButtonElement>('.dse-surge__stepper .dse-stepper__btn[aria-label^="Increase"]');

describe('D7 Task 5: surges ElementDefinition (spec §4.3)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize + schema', () => {
		expect(surgesElement.id).toBe('surges');
		expect(surgesElement.aliases).toEqual(['ds-surges']);
		expect(surgesElement.shape).toBe('persisted');
		expect(surgesElement.schema).toBeDefined();
		expect(surgesElement.serialize).toBeDefined();
	});

	test('createView returns a SurgePanelContainer', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = createRenderContext({
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		});
		expect(surgesElement.createView(cx)).toBeInstanceOf(SurgePanelContainer);
	});

	test('registered by the framework registry; the canonical alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);
		expect(registry.get('surges')?.id).toBe('surges');
		expect(registry.get('ds-surges')?.id).toBe('surges');
	});
});

describe('D7 Task 5: render — label, hint, and the authored surge count (example.yaml)', () => {
	test('root carries data-dse-element="surges"; label is Surges; hint reflects N', async () => {
		const { root } = await renderSurges();
		expect(root.getAttribute('data-dse-element')).toBe('surges');
		expect(label(root)).toBe('Surges');
		expect(hint(root)).toBe('each = +3 damage');
	});

	test('the stepper shows the authored surges value (2)', async () => {
		const { root } = await renderSurges();
		expect(stepperValue(root)).toBe('2');
	});

	test('no highest_characteristic authored: no hint text', async () => {
		const { root } = await renderSurges('surges: 1');
		expect(hint(root)).toBe('');
	});
});

describe('D7 Task 5: stepper floors at 0, no ceiling', () => {
	test('the decrement button disables at 0 (floor)', async () => {
		const { root } = await renderSurges('surges: 0');
		expect(minusBtn(root)!.disabled).toBe(true);
	});

	test('there is no ceiling: the increment button never disables regardless of value', async () => {
		const { root } = await renderSurges('surges: 999');
		expect(plusBtn(root)!.disabled).toBe(false);
	});

	test('incrementing persists the new surge count', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderSurges();

		plusBtn(root)!.click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(stepperValue(rebuiltRoot)).toBe('3');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('surges: 3');
		jest.useRealTimers();
	});

	test('decrementing to 0 persists and then the minus button re-disables', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderSurges('surges: 1');

		minusBtn(root)!.click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(stepperValue(rebuiltRoot)).toBe('0');
		expect(minusBtn(rebuiltRoot)!.disabled).toBe(true);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource.mock.calls[0][0]).toContain('surges: 0');
		jest.useRealTimers();
	});
});

describe('D7 Task 5: canPersist=false — read-only renders WITHOUT write affordances (F1 §4.4)', () => {
	test('both stepper buttons are real-disabled; no writes occur', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderSurges(surgesYaml, { canPersist: false });

		expect(minusBtn(root)!.disabled).toBe(true);
		expect(plusBtn(root)!.disabled).toBe(true);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
		jest.useRealTimers();
	});
});

describe('D7 Task 5: source hygiene + CSS contract', () => {
	test('CSS contract: .dse-surge scoped under [data-dse-element="surges"], tokens only', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\[data-dse-element="surges"\]\s+\.dse-surge\s*\{[\s\S]*?\n\}\n\n/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-/);
	});

	test('source hygiene: panel.ts/view.ts pass the shared kit style guard (no inline color, no color literals)', () => {
		const panelSrc = fs.readFileSync(path.join(__dirname, '../../../src/elements/surges/panel.ts'), 'utf8');
		const viewSrc = fs.readFileSync(path.join(__dirname, '../../../src/elements/surges/view.ts'), 'utf8');
		expect(styleGuardFindings(panelSrc)).toEqual([]);
		expect(styleGuardFindings(viewSrc)).toEqual([]);
	});
});
