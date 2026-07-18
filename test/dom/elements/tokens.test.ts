// D7 Task 6 (spec §4.5, OD-3) — ds-tokens through the REAL ElementPipeline: a labeled
// stepper (floor 0, no ceiling) with a ♦ glyph, label fallback, mutate + persist, and
// read-only inertness. Mirrors test/dom/elements/resource.test.ts's structure (closest
// sibling shape), minus the HeroPanel indirection (this element mounts a stepper
// directly, like counter/view.ts).
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
import { tokensElement } from '../../../src/elements/tokens/definition';
import { TokenPoolContainer } from '../../../src/elements/tokens/view';
import { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import tokensYaml from '../../../src/elements/tokens/example.yaml';

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-tokens', lineStart: 0, lineEnd: 2 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-tokens::0',
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

async function renderTokens(source: string = tokensYaml, hostOverrides: Partial<BlockHost> = {}) {
	const pipeline = new ElementPipeline(makeDeps());
	const host = makeHost(hostOverrides);
	await pipeline.run(tokensElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

// -- kit-DOM accessors --
const labelText = (root: HTMLElement) => root.querySelector('.dse-tokens__label-text')?.textContent ?? '';
const glyph = (root: HTMLElement) => root.querySelector('.dse-tokens__glyph')?.textContent ?? '';
const stepperValue = (root: HTMLElement) =>
	root.querySelector<HTMLInputElement>('.dse-tokens__stepper .dse-stepper__input')?.value ??
	root.querySelector('.dse-tokens__stepper .dse-stepper__value')?.textContent ??
	'';
const minusBtn = (root: HTMLElement) =>
	root.querySelector<HTMLButtonElement>('.dse-tokens__stepper .dse-stepper__btn[aria-label^="Decrease"]');
const plusBtn = (root: HTMLElement) =>
	root.querySelector<HTMLButtonElement>('.dse-tokens__stepper .dse-stepper__btn[aria-label^="Increase"]');

describe('D7 Task 6: tokens ElementDefinition (spec §4.5, OD-3)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize + schema', () => {
		expect(tokensElement.id).toBe('hero-tokens');
		expect(tokensElement.aliases).toEqual(['ds-tokens']);
		expect(tokensElement.shape).toBe('persisted');
		expect(tokensElement.schema).toBeDefined();
		expect(tokensElement.serialize).toBeDefined();
	});

	test('createView returns a TokenPoolContainer', () => {
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
		expect(tokensElement.createView(cx)).toBeInstanceOf(TokenPoolContainer);
	});

	test('registered by the framework registry; the canonical alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);
		expect(registry.get('hero-tokens')?.id).toBe('hero-tokens');
		expect(registry.get('ds-tokens')?.id).toBe('hero-tokens');
	});
});

describe('D7 Task 6: render — label, glyph, and the authored token count (example.yaml)', () => {
	test('root carries data-dse-element="hero-tokens"; label reflects the authored label; glyph is present', async () => {
		const { root } = await renderTokens();
		expect(root.getAttribute('data-dse-element')).toBe('hero-tokens');
		expect(labelText(root)).toBe('Session 12 party pool');
		expect(glyph(root)).toBe('♦');
	});

	test('the stepper shows the authored tokens value (3)', async () => {
		const { root } = await renderTokens();
		expect(stepperValue(root)).toBe('3');
	});

	test('no label authored: falls back to "Hero Tokens"', async () => {
		const { root } = await renderTokens('tokens: 1');
		expect(labelText(root)).toBe('Hero Tokens');
	});
});

describe('D7 Task 6: stepper floors at 0, no ceiling', () => {
	test('the decrement button disables at 0 (floor)', async () => {
		const { root } = await renderTokens('tokens: 0');
		expect(minusBtn(root)!.disabled).toBe(true);
	});

	test('there is no ceiling: the increment button never disables regardless of value', async () => {
		const { root } = await renderTokens('tokens: 999');
		expect(plusBtn(root)!.disabled).toBe(false);
	});

	test('incrementing persists the new token count', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderTokens();

		plusBtn(root)!.click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(stepperValue(rebuiltRoot)).toBe('4');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('tokens: 4');
		jest.useRealTimers();
	});

	test('decrementing spends a token and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderTokens();

		minusBtn(root)!.click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(stepperValue(rebuiltRoot)).toBe('2');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource.mock.calls[0][0]).toContain('tokens: 2');
		jest.useRealTimers();
	});
});

describe('D7 Task 6: canPersist=false — read-only renders WITHOUT write affordances (F1 §4.4)', () => {
	test('both stepper buttons are real-disabled; no writes occur', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderTokens(tokensYaml, { canPersist: false });

		expect(minusBtn(root)!.disabled).toBe(true);
		expect(plusBtn(root)!.disabled).toBe(true);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
		jest.useRealTimers();
	});
});

describe('D7 Task 6: source hygiene + CSS contract', () => {
	test('CSS contract: .dse-tokens scoped under [data-dse-element="hero-tokens"], tokens only', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\[data-dse-element="hero-tokens"\]\s+\.dse-tokens\s*\{[\s\S]*?\n\}\n\n/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-/);
	});

	test('source hygiene: view.ts passes the shared kit style guard (no inline color, no color literals)', () => {
		const viewSrc = fs.readFileSync(path.join(__dirname, '../../../src/elements/tokens/view.ts'), 'utf8');
		expect(styleGuardFindings(viewSrc)).toEqual([]);
	});
});
