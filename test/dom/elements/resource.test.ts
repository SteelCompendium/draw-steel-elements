// D7 Task 3 (spec §4.1) — ds-resource through the REAL ElementPipeline: class-aware
// label + gain hint, a signed stepper (floor = min, no ceiling), and read-only
// inertness.
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
import { resourceElement } from '../../../src/elements/resource/definition';
import { ResourcePanelContainer } from '../../../src/elements/resource/view';
import { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import resourceYaml from '../../../src/elements/resource/example.yaml';

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-resource', lineStart: 0, lineEnd: 2 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-resource::0',
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

async function renderResource(source: string = resourceYaml, hostOverrides: Partial<BlockHost> = {}) {
	const pipeline = new ElementPipeline(makeDeps());
	const host = makeHost(hostOverrides);
	await pipeline.run(resourceElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

// -- kit-DOM accessors --
const label = (root: HTMLElement) => root.querySelector('.dse-res__label')?.textContent ?? '';
const hint = (root: HTMLElement) => root.querySelector('.dse-res__hint')?.textContent ?? '';
const stepperValue = (root: HTMLElement) =>
	root.querySelector<HTMLInputElement>('.dse-res__stepper .dse-stepper__input')?.value ??
	root.querySelector('.dse-res__stepper .dse-stepper__value')?.textContent ??
	'';
const minusBtn = (root: HTMLElement) =>
	root.querySelector<HTMLButtonElement>('.dse-res__stepper .dse-stepper__btn[aria-label^="Decrease"]');
const plusBtn = (root: HTMLElement) =>
	root.querySelector<HTMLButtonElement>('.dse-res__stepper .dse-stepper__btn[aria-label^="Increase"]');

describe('D7 Task 3: resource ElementDefinition (spec §4.1)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize + schema', () => {
		expect(resourceElement.id).toBe('heroic-resource');
		expect(resourceElement.aliases).toEqual(['ds-resource']);
		expect(resourceElement.shape).toBe('persisted');
		expect(resourceElement.schema).toBeDefined();
		expect(resourceElement.serialize).toBeDefined();
	});

	test('createView returns a ResourcePanelContainer', () => {
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
		expect(resourceElement.createView(cx)).toBeInstanceOf(ResourcePanelContainer);
	});

	test('registered by the framework registry; the canonical alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);
		expect(registry.get('heroic-resource')?.id).toBe('heroic-resource');
		expect(registry.get('ds-resource')?.id).toBe('heroic-resource');
	});
});

describe('D7 Task 3: class: fury renders "Ferocity" + gain hint (example.yaml)', () => {
	test('root carries data-dse-element="heroic-resource"; label is Ferocity; hint is non-empty', async () => {
		const { root } = await renderResource();
		expect(root.getAttribute('data-dse-element')).toBe('heroic-resource');
		expect(label(root)).toBe('Ferocity');
		expect(hint(root)).toMatch(/turn/i);
	});

	test('the stepper shows the authored current value (4)', async () => {
		const { root } = await renderResource();
		expect(stepperValue(root)).toBe('4');
	});
});

describe('D7 Task 3: signed stepper — floor = min, no ceiling', () => {
	test('a Talent (Clarity) resource decrements below 0 (strained floor is negative)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderResource('class: talent\ncurrent: 0');

		expect(label(root)).toBe('Clarity');
		minusBtn(root)!.click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(stepperValue(rebuiltRoot)).toBe('-1');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource.mock.calls[0][0]).toContain('current: -1');
		jest.useRealTimers();
	});

	test('a Fury (Ferocity) resource clamps at min: 0 — the decrement button disables at the floor', async () => {
		const { root } = await renderResource('class: fury\ncurrent: 0');
		expect(minusBtn(root)!.disabled).toBe(true);
	});

	test('there is no ceiling: the increment button never disables regardless of value', async () => {
		const { root } = await renderResource('class: fury\ncurrent: 999');
		expect(plusBtn(root)!.disabled).toBe(false);
	});

	test('an unknown class renders the generic "Resource" label with an empty hint', async () => {
		const { root } = await renderResource('class: homebrew-class\ncurrent: 2');
		expect(label(root)).toBe('Resource');
		expect(hint(root)).toBe('');
	});

	test('incrementing persists the new current value', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderResource();

		plusBtn(root)!.click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(stepperValue(rebuiltRoot)).toBe('5');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('current: 5');
		jest.useRealTimers();
	});
});

describe('D7 Task 3: canPersist=false — read-only renders WITHOUT write affordances (F1 §4.4)', () => {
	test('both stepper buttons are real-disabled; no writes occur', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderResource(resourceYaml, { canPersist: false });

		expect(minusBtn(root)!.disabled).toBe(true);
		expect(plusBtn(root)!.disabled).toBe(true);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
		jest.useRealTimers();
	});
});

describe('D7 Task 3: source hygiene + CSS contract', () => {
	test('CSS contract: .dse-res scoped under [data-dse-element="heroic-resource"], tokens only', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\[data-dse-element="heroic-resource"\]\s+\.dse-res\s*\{[\s\S]*?\n\}\n\n/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-/);
	});

	test('source hygiene: panel.ts/view.ts pass the shared kit style guard (no inline color, no color literals)', () => {
		const panelSrc = fs.readFileSync(path.join(__dirname, '../../../src/elements/resource/panel.ts'), 'utf8');
		const viewSrc = fs.readFileSync(path.join(__dirname, '../../../src/elements/resource/view.ts'), 'utf8');
		expect(styleGuardFindings(panelSrc)).toEqual([]);
		expect(styleGuardFindings(viewSrc)).toEqual([]);
	});
});
