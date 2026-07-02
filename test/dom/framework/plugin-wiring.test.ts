// T-10 (Plan 02, FINAL task of F1 core): wire the framework into main.ts alongside the
// UNTOUCHED legacy registration, + the F1 §8 OD-8 import-boundary lint rule.
//
// Proves (F1 §2.3 registry wiring, §5 dependency-schema registration, §8 OD-8):
//  - constructing + loading the plugin (fake App/Plugin) runs the new framework v2
//    wiring WITHOUT throwing;
//  - the new ElementRegistry exists on the plugin and is empty of migrated elements
//    (Plan 02 migrates no element in this task);
//  - the legacy `registerElements`/RegisterElements.ts path still runs UNCHANGED
//    alongside it (coexistence — e.g. the "ds-ft" alias is still registered);
//  - a malformed dependency schema does NOT crash the whole plugin `onload` — the
//    `ValidationService.addDependencySchema` call is wrapped in try/catch and degrades
//    gracefully (console.warn + Notice) instead of throwing (Task-1 review requirement);
//  - `onunload` drops the framework v2 services (SessionStore.clear(), per the
//    services-dispose convention);
//  - the eslint config carries the framework -> elements import-boundary rule (OD-8),
//    config-only since eslint is not yet a devDependency (F3 installs it).
import DrawSteelAdmonitionPlugin, {
	initializeElementFrameworkV2,
	FRAMEWORK_V2_DEPENDENCY_SCHEMAS,
} from 'main';
import { App, Notice } from '../../mocks/obsidian';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { ElementPipeline } from '@/framework/pipeline';
import * as fs from 'fs';
import * as path from 'path';

// A sample of legacy aliases from RegisterElements.ts, spanning several element
// families — proves registerElements(this) still runs unchanged alongside the new
// registry for every element NOT YET migrated onto Framework v2. "ds-hr" is
// deliberately excluded here (D1 Task 1 migrated Horizontal Rule off this path — see
// the dedicated "D1 Task 1" describe block below).
const LEGACY_ALIASES = ['ds-ft', 'ds-stam', 'ds-featureblock', 'ds-counter', 'ds-initiative-tracker', 'ds-skills'];

/**
 * `DrawSteelAdmonitionPlugin` extends the REAL `obsidian` `Plugin` (main.ts imports
 * from the real package, not the mock — same as every other production file), whose
 * declared constructor is `(app: App, manifest: PluginManifest)`. The fake `App` from
 * test/mocks/obsidian is intentionally a structural subset (same convention as
 * `pipeline.test.ts`'s `makeDeps()`, which casts `app as any` for the same reason) —
 * `as any` here is a type-checking bypass only; `Plugin`'s own constructor is a no-op
 * beyond field assignment (test/mocks/obsidian.ts), so this is safe at runtime.
 */
function makePlugin<T extends typeof DrawSteelAdmonitionPlugin>(Ctor: T, app: App): InstanceType<T> {
	return new Ctor(app as any, { id: 'draw-steel-elements', version: 'test' } as any) as InstanceType<T>;
}

describe('T-10: main.ts framework v2 wiring (F1 §2.3 / §5)', () => {
	afterEach(() => {
		Notice.notices.length = 0;
	});

	test('constructing + onload() runs the new wiring without throwing', async () => {
		const app = new App();
		const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);

		await expect(plugin.onload()).resolves.not.toThrow();
	});

	test('the new ElementRegistry exists on the plugin and holds the migrated elements (D1 Task 1: horizontal-rule)', async () => {
		const app = new App();
		const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);

		await plugin.onload();

		expect(plugin.frameworkV2).toBeDefined();
		expect(plugin.frameworkV2!.registry.all().map((def) => def.id)).toEqual(['horizontal-rule']);
		expect(plugin.frameworkV2!.pipeline).toBeInstanceOf(ElementPipeline);
		expect(plugin.frameworkV2!.services.validation).toBeDefined();
		expect(plugin.frameworkV2!.services.session).toBeDefined();
		expect(plugin.frameworkV2!.services.theme).toBeDefined();
		expect(plugin.frameworkV2!.services.prefs).toBeDefined();
		expect(plugin.frameworkV2!.services.refs).toBeDefined();
	});

	test('coexistence: the legacy RegisterElements path still runs (legacy aliases registered)', async () => {
		const app = new App();
		const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);

		await plugin.onload();

		for (const alias of LEGACY_ALIASES) {
			expect((plugin as any).registeredProcessors.has(alias)).toBe(true);
		}
		// Not-yet-migrated elements are absent from the new registry — today's markdown
		// code-block processors for them are entirely legacy-owned.
		expect(plugin.frameworkV2!.registry.get('ds-ft')).toBeUndefined();
	});

	test('onunload clears the SessionStore and drops the framework v2 bundle', async () => {
		const app = new App();
		const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);
		await plugin.onload();
		const session = plugin.frameworkV2!.services.session;
		session.set('block-a', 'tab', 'argument');
		expect(session.get('block-a', 'tab')).toBe('argument');

		plugin.onunload();

		expect(session.get('block-a', 'tab')).toBeUndefined();
		expect(plugin.frameworkV2).toBeUndefined();
	});

	describe('addDependencySchema resilience (Task-1 review requirement)', () => {
		const MALFORMED_SCHEMA_YAML = 'not: valid: yaml: [';

		test('initializeElementFrameworkV2 does not throw when a dependency schema is malformed', () => {
			const app = new App();
			const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);

			expect(() =>
				initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS, [
					{ id: 'bad-schema', schema: MALFORMED_SCHEMA_YAML },
				]),
			).not.toThrow();
		});

		test('degrades gracefully: warns to console and shows a Notice, bundle stays usable', () => {
			const app = new App();
			const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

			const bundle = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS, [
				{ id: 'bad-schema', schema: MALFORMED_SCHEMA_YAML },
			]);

			expect(warnSpy).toHaveBeenCalled();
			expect(Notice.notices.length).toBeGreaterThan(0);
			// Resilience means "degrade", not "abort" — the rest of the bundle still works.
			expect(bundle.registry.all()).toEqual([]);
			expect(bundle.pipeline).toBeInstanceOf(ElementPipeline);

			warnSpy.mockRestore();
		});

		// This is the literal Task-10 requirement: drive it through the REAL onload()
		// lifecycle (not just the standalone factory), via a subclass that overrides the
		// protected dependency-schema hook — production always uses
		// FRAMEWORK_V2_DEPENDENCY_SCHEMAS; only this test substitutes a broken one.
		class BadSchemaPlugin extends DrawSteelAdmonitionPlugin {
			protected frameworkV2DependencySchemas() {
				return [{ id: 'bad-schema', schema: MALFORMED_SCHEMA_YAML }];
			}
		}

		test('a bad dependency schema does not throw out of onload()', async () => {
			const app = new App();
			const plugin = makePlugin(BadSchemaPlugin, app);
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

			await expect(plugin.onload()).resolves.not.toThrow();

			expect(warnSpy).toHaveBeenCalled();
			expect(Notice.notices.length).toBeGreaterThan(0);
			expect(plugin.frameworkV2).toBeDefined();
			// Migrated-element registration is independent of dependency-schema success —
			// a bad schema degrades validation detail, it doesn't block registerFrameworkElementDefinitions.
			expect(plugin.frameworkV2!.registry.all().map((def) => def.id)).toEqual(['horizontal-rule']);
			// Legacy path is unaffected by the framework v2 schema failure.
			expect((plugin as any).registeredProcessors.has('ds-ft')).toBe(true);

			warnSpy.mockRestore();
		});

		test('the real default FRAMEWORK_V2_DEPENDENCY_SCHEMAS registers cleanly (no false-positive warnings)', async () => {
			const app = new App();
			const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

			await plugin.onload();

			expect(warnSpy).not.toHaveBeenCalled();
			expect(Notice.notices).toEqual([]);
			expect(FRAMEWORK_V2_DEPENDENCY_SCHEMAS.length).toBeGreaterThan(0);
			expect(FRAMEWORK_V2_DEPENDENCY_SCHEMAS[0].id).toBe(
				'https://steelcompendium.io/schemas/component-wrapper-1.0.0',
			);

			warnSpy.mockRestore();
		});
	});
});

describe('D1 Task 1: Horizontal Rule wiring through onload() (F1 §2.3 / §6 step 1)', () => {
	test('ds-hr and ds-horizontal-rule are registered, and route to the framework registry\'s def (not RegisterElements.ts)', async () => {
		const app = new App();
		const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);

		await plugin.onload();

		expect((plugin as any).registeredProcessors.has('ds-hr')).toBe(true);
		expect((plugin as any).registeredProcessors.has('ds-horizontal-rule')).toBe(true);
		expect(plugin.frameworkV2!.registry.get('ds-hr')?.id).toBe('horizontal-rule');
		expect(plugin.frameworkV2!.registry.get('ds-horizontal-rule')?.id).toBe('horizontal-rule');
	});

	test('ds-hr is registered EXACTLY ONCE — no double-registration between the legacy and framework paths', async () => {
		const app = new App();
		const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		const hrCalls = registerSpy.mock.calls.filter(([language]) => language === 'ds-hr');
		const hrLongCalls = registerSpy.mock.calls.filter(([language]) => language === 'ds-horizontal-rule');
		expect(hrCalls).toHaveLength(1);
		expect(hrLongCalls).toHaveLength(1);

		registerSpy.mockRestore();
	});

	test('rendering a ds-hr block through the wired processor produces the horizontal-rule DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = makePlugin(DrawSteelAdmonitionPlugin, app);
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-hr\n```\n');
		const { makeFakeContext } = await import('../../mocks/obsidian');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-hr');

		await handler('', ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('horizontal-rule');
		expect(root.querySelector('.ds-hr-container')).not.toBeNull();
	});
});

describe('T-10: OD-8 import-boundary ESLint rule (config-only; eslint not yet a devDependency)', () => {
	const eslintrcPath = path.join(__dirname, '../../../.eslintrc');
	const contents = fs.readFileSync(eslintrcPath, 'utf-8');

	test('.eslintrc declares import/no-restricted-paths forbidding src/framework -> src/elements', () => {
		expect(contents).toContain('import/no-restricted-paths');
		expect(contents).toContain('src/framework');
		expect(contents).toContain('src/elements');
	});

	test('.eslintrc carries a doc/comment note that the rule needs eslint + eslint-plugin-import (not yet deps)', () => {
		expect(contents).toMatch(/not yet a devDependency|NOT YET a devDependency/i);
	});

	test('package.json does not gain eslint or an import-boundary plugin as a new dependency (do NOT install)', () => {
		const pkgPath = path.join(__dirname, '../../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
		expect(allDeps.eslint).toBeUndefined();
		expect(allDeps['eslint-plugin-import']).toBeUndefined();
		expect(allDeps['eslint-plugin-boundaries']).toBeUndefined();
	});
});
