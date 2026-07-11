// visual-harness/entry.ts — F4 harness page logic (Plan 11). Mounts DSE elements through
// the REAL ElementPipeline, mirroring the test/dom/elements/*.test.ts makeDeps/makeHost
// convention, driven by URL params. Bundled by visual-harness/esbuild.mjs with `obsidian`
// aliased to ./shim/obsidian.ts; under jest `obsidian` maps to the test mock instead, so
// test/dom/visual-harness/fixtures.test.ts imports this module directly (the browser boot
// below is inert there — jsdom has no #mount).
import '../test/setup/polyfills';
import '../test/setup/dom-setup';

import { ElementPipeline } from '../src/framework/pipeline';
import type { ElementPipelineDeps } from '../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../src/framework/host/BlockHost';
import { createElementRegistry } from '../src/framework/registry';
import type { ElementRegistry } from '../src/framework/registry';
import { createThemeService } from '../src/framework/seams/theme';
import type { ThemeServiceInternal, DseThemeId } from '../src/framework/seams/theme';
import { createPreferenceStore } from '../src/framework/seams/prefs';
import { createRollService } from '../src/framework/roll/service';
import type { PrefsStorage } from '../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../src/prefs/catalog';
import { createReferenceService } from '../src/framework/seams/refs';
import { createValidationService } from '../src/framework/validation';
import { createSessionStore } from '../src/framework/session';
import { DEFAULT_SETTINGS } from '../src/model/Settings';
import { registerFrameworkElementDefinitions, FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from '../main';
import { App, Plugin } from '../test/mocks/obsidian-core';

// Fixtures — esbuild `.md` text loader / jest rawTextTransformer.
import characteristicsDefault from './fixtures/characteristics/default.md';
import counterDefault from './fixtures/counter/default.md';
import featureDefault from './fixtures/feature/default.md';
import featureblockDefault from './fixtures/featureblock/default.md';
import horizontalRuleDefault from './fixtures/horizontal-rule/default.md';
import initiativeDefault from './fixtures/initiative/default.md';
import negotiationDefault from './fixtures/negotiation/default.md';
import rollDefault from './fixtures/roll/default.md';
import skillsDefault from './fixtures/skills/default.md';
import staminaBarDefault from './fixtures/stamina-bar/default.md';
import statblockDefault from './fixtures/statblock/default.md';
import valuesRowDefault from './fixtures/values-row/default.md';

export const FIXTURES: Record<string, Record<string, string>> = {
	characteristics: { default: characteristicsDefault },
	counter: { default: counterDefault },
	feature: { default: featureDefault },
	featureblock: { default: featureblockDefault },
	'horizontal-rule': { default: horizontalRuleDefault },
	initiative: { default: initiativeDefault },
	negotiation: { default: negotiationDefault },
	roll: { default: rollDefault },
	skills: { default: skillsDefault },
	'stamina-bar': { default: staminaBarDefault },
	statblock: { default: statblockDefault },
	'values-row': { default: valuesRowDefault },
};

export interface HarnessParams {
	element?: string;
	fixture: string;
	theme: DseThemeId;
	bg: 'dark' | 'light';
	print: boolean;
	readonly: boolean;
	gallery: boolean;
}

export function parseParams(search: string): HarnessParams {
	const q = new URLSearchParams(search);
	return {
		element: q.get('element') ?? undefined,
		fixture: q.get('fixture') ?? 'default',
		theme: (q.get('theme') === 'steel' ? 'steel' : 'legacy') as DseThemeId,
		bg: q.get('bg') === 'light' ? 'light' : 'dark',
		print: q.get('print') === '1',
		readonly: q.get('readonly') === '1',
		gallery: q.get('gallery') === '1',
	};
}

/** Real service instances — the same convention as the dom tests' makeDeps(). */
export function makeHarnessDeps(): { deps: ElementPipelineDeps; theme: ThemeServiceInternal } {
	const app = new App();
	// Seed the default token image so Images.resolveImageSourceOrDefault's fallback
	// resolves for fixtures with images (e.g. initiative) — avoids CB-14 unhandled
	// rejections during render (same seeding as test/dom/elements/initiative.test.ts's
	// makeEnv()).
	app.vault.setFile(DEFAULT_SETTINGS.defaultImagePath, '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	// Mirrors main.ts's initializeElementFrameworkV2: element schemas (e.g. Skills,
	// Stamina Bar) $ref the shared component-wrapper dependency schema, which is only
	// ever registered at real plugin onload — without it, validation fails with
	// "can't resolve reference ...component-wrapper-1.0.0".
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		validation.addDependencySchema(id, schema);
	}
	const session = createSessionStore();
	return {
		deps: {
			app: app as any,
			plugin: plugin as any,
			settings: DEFAULT_SETTINGS,
			theme,
			prefs,
			refs,
			validation,
			session,
			roll: createRollService(prefs),
		},
		theme,
	};
}

export function makeHarnessHost(
	containerEl: HTMLElement,
	opts: { readonly: boolean; language: string },
): BlockHost {
	return {
		mode: 'reading' as RenderMode,
		// sourcePath '' mirrors the canvas quarantine → the read-only affordance shows.
		sourcePath: opts.readonly ? '' : 'Harness.md',
		containerEl,
		canPersist: !opts.readonly,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: opts.language, lineStart: 0, lineEnd: 0 }),
		replaceSource: async () => true,
		blockKey: () => `Harness.md::${opts.language}::0`,
	} as BlockHost;
}

async function mountOne(
	pipeline: ElementPipeline,
	registry: ElementRegistry,
	mount: HTMLElement,
	id: string,
	fixtureName: string,
	params: HarnessParams,
	errors: string[],
): Promise<void> {
	const def = registry.get(id);
	// Elements with a single fixture fall back to it in gallery sweeps.
	const fixtures = FIXTURES[id] ?? {};
	const source = fixtures[fixtureName] ?? fixtures['default'];
	if (!def || source === undefined) {
		errors.push(`unknown element/fixture: ${id}/${fixtureName}`);
		return;
	}
	const section = mount.createDiv({ cls: 'dse-harness-section' });
	if (params.gallery) section.createEl('h2', { text: `${id} (${def.aliases[0]})` });
	const container = section.createDiv();
	const host = makeHarnessHost(container, { readonly: params.readonly, language: def.aliases[0] });
	try {
		await pipeline.run(def, source, host);
	} catch (e) {
		errors.push(`${id}/${fixtureName}: ${String(e)}`);
	}
	if (params.print) {
		for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-dse-element]'))) {
			el.setAttribute('data-dse-print', 'on');
		}
	}
}

export async function mountFromParams(
	doc: Document,
	params: HarnessParams,
): Promise<{ errors: string[] }> {
	doc.body.classList.remove('theme-dark', 'theme-light');
	doc.body.classList.add(params.bg === 'light' ? 'theme-light' : 'theme-dark');
	const registry = createElementRegistry();
	registerFrameworkElementDefinitions(registry);
	const { deps, theme } = makeHarnessDeps();
	theme.setActive(params.theme);
	const pipeline = new ElementPipeline(deps);
	const mount = doc.getElementById('mount');
	const errors: string[] = [];
	if (!mount) return { errors: ['no #mount element'] };
	mount.empty();
	const ids = params.gallery ? Object.keys(FIXTURES) : [params.element ?? 'feature'];
	for (const id of ids) {
		await mountOne(pipeline, registry, mount, id, params.fixture, params, errors);
	}
	// Error cards the pipeline rendered (parse/schema/render failures) count as failures.
	for (const card of Array.from(mount.querySelectorAll('.dse-error-card'))) {
		errors.push(`error card: ${(card.textContent ?? '').slice(0, 160)}`);
	}
	return { errors };
}

declare global {
	interface Window {
		__dseHarnessManifest?: { elements: { id: string; fixtures: string[] }[] };
		__dseHarnessDone?: { errors: string[] };
	}
}

// Browser boot — inert under jest (jsdom's default document has no #mount).
if (typeof window !== 'undefined') {
	window.__dseHarnessManifest = {
		elements: Object.keys(FIXTURES).map((id) => ({ id, fixtures: Object.keys(FIXTURES[id]) })),
	};
	if (document.getElementById('mount')) {
		void mountFromParams(document, parseParams(window.location.search)).then(async (r) => {
			// Two rAF ticks so late theme re-stamps/layout settle before the camera fires.
			await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
			window.__dseHarnessDone = r;
		});
	}
}
