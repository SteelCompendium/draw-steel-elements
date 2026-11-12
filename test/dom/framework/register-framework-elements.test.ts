// D1 Task 1 (Plan 03) — registerFrameworkElements: the framework -> Obsidian wiring loop
// F1 §2.3 describes as part of ElementRegistry.register() itself; Task 8 deliberately kept
// ElementRegistry Obsidian-decoupled (registry.ts's file header: "Wiring a registry's
// definitions into Obsidian's registerMarkdownCodeBlockProcessor is the pipeline's job
// (Task 9) / main.ts's job (Task 10)"). This file is that wiring, now that an element
// (Horizontal Rule) exists to register.
//
// Contract under test: for EVERY ElementDefinition in framework.registry.all(), and for
// EVERY alias of that def, plugin.registerMarkdownCodeBlockProcessor(alias, handler) is
// called, where invoking `handler(source, el, ctx)` calls framework.pipeline.run with
// exactly (that def, that source, a fresh ReadingModeBlockHost(plugin, el, ctx, alias)).
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import type { ElementDefinition, ElementRegistry } from '../../../src/framework/registry';
import type { ElementPipeline } from '../../../src/framework/pipeline';
import type { BlockHost } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import * as FocusCarry from '../../../src/framework/host/livePreviewFocusCarry';
import * as StateCarry from '../../../src/framework/host/livePreviewStateCarry';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';

/**
 * Typed jest.fn() for ElementPipeline.run — same convention as pipeline.test.ts's
 * `makeDeps()`/`makeHost()`: the mock Plugin/App from test/mocks/obsidian is a
 * structural subset of the REAL obsidian.Plugin (types-only package), so call sites
 * cast `plugin as any` when passing it where the real Plugin type is expected — the
 * mock's runtime behavior is what these tests exercise, not its static type.
 */
function fakePipelineRun(): jest.Mock<Promise<void>, [ElementDefinition, string, BlockHost]> {
	return jest.fn(async (_def: ElementDefinition, _source: string, _host: BlockHost) => {});
}

/** Fake def — never actually mounted; registerFrameworkElements never calls parse/createView. */
function fakeDef(overrides: Partial<ElementDefinition> = {}): ElementDefinition {
	return {
		id: 'fake-a',
		name: 'Fake A',
		aliases: ['ds-fake-a'],
		shape: 'static',
		parse: (data) => data,
		createView: () => ({}) as any,
		...overrides,
	};
}

/**
 * Fake registry backing only `all()` (the sole ElementRegistry method the wiring loop is
 * allowed to call per F1 §3.1's registry/pipeline split). `register()` throws so an
 * accidental call fails the test loudly instead of silently doing nothing.
 */
function fakeRegistry(defs: ElementDefinition[]): ElementRegistry {
	return {
		register: () => {
			throw new Error('registerFrameworkElements must not call registry.register()');
		},
		get: (idOrAlias) => defs.find((d) => d.id === idOrAlias || d.aliases.includes(idOrAlias)),
		all: () => defs,
	};
}

describe('D1 Task 1: registerFrameworkElements (F1 §2.3 "incremental migration switch")', () => {
	test('registers a markdown code-block processor for EVERY alias of EVERY registered def', () => {
		const defA = fakeDef({ id: 'a', aliases: ['ds-a', 'ds-alpha'] });
		const defB = fakeDef({ id: 'b', aliases: ['ds-b'] });
		const registry = fakeRegistry([defA, defB]);
		const pipeline = { run: jest.fn() } as unknown as ElementPipeline;
		const app = new App();
		const plugin = new Plugin(app);

		registerFrameworkElements(plugin as any, { registry, pipeline });

		expect(plugin.registeredProcessors.has('ds-a')).toBe(true);
		expect(plugin.registeredProcessors.has('ds-alpha')).toBe(true);
		expect(plugin.registeredProcessors.has('ds-b')).toBe(true);
	});

	test('an empty registry registers zero processors (no-op, additive-safe)', () => {
		const registry = fakeRegistry([]);
		const pipeline = { run: jest.fn() } as unknown as ElementPipeline;
		const app = new App();
		const plugin = new Plugin(app);

		expect(() => registerFrameworkElements(plugin as any, { registry, pipeline })).not.toThrow();
		expect(plugin.registeredProcessors.size).toBe(0);
	});

	test('invoking the registered handler for an alias calls pipeline.run(def, source, ReadingModeBlockHost) for THAT alias\'s def', async () => {
		const defA = fakeDef({ id: 'a', aliases: ['ds-a'] });
		const defB = fakeDef({ id: 'b', aliases: ['ds-b', 'ds-bravo'] });
		const registry = fakeRegistry([defA, defB]);
		const run = fakePipelineRun();
		const pipeline = { run } as unknown as ElementPipeline;
		const app = new App();
		const plugin = new Plugin(app);
		app.vault.setFile('Note.md', '```ds-bravo\nfoo: 1\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');

		registerFrameworkElements(plugin as any, { registry, pipeline });
		const handler = plugin.registeredProcessors.get('ds-bravo')!;
		await handler('foo: 1', ctx.el, ctx as any);

		expect(run).toHaveBeenCalledTimes(1);
		const [calledDef, calledSource, calledHost] = run.mock.calls[0];
		expect(calledDef).toBe(defB); // routed to the def that OWNS ds-bravo, not defA
		expect(calledSource).toBe('foo: 1');
		expect(calledHost).toBeInstanceOf(ReadingModeBlockHost);
		expect((calledHost as ReadingModeBlockHost).sourcePath).toBe('Note.md');
	});

	test('two aliases of the SAME def each get their own handler, both routing to that one def', async () => {
		const defA = fakeDef({ id: 'a', aliases: ['ds-a', 'ds-alpha'] });
		const registry = fakeRegistry([defA]);
		const run = fakePipelineRun();
		const pipeline = { run } as unknown as ElementPipeline;
		const app = new App();
		const plugin = new Plugin(app);
		app.vault.setFile('Note.md', '```ds-a\nx: 1\n```\n');
		const ctx1 = makeFakeContext(app, 'Note.md');
		app.vault.setFile('Other.md', '```ds-alpha\nx: 1\n```\n');
		const ctx2 = makeFakeContext(app, 'Other.md');

		registerFrameworkElements(plugin as any, { registry, pipeline });
		await plugin.registeredProcessors.get('ds-a')!('x: 1', ctx1.el, ctx1 as any);
		await plugin.registeredProcessors.get('ds-alpha')!('x: 1', ctx2.el, ctx2 as any);

		expect(run).toHaveBeenCalledTimes(2);
		expect(run.mock.calls[0][0]).toBe(defA);
		expect(run.mock.calls[1][0]).toBe(defA);
	});

	test('does not mutate the registry and does not require pipeline to have run yet', () => {
		const registry = fakeRegistry([fakeDef({ id: 'a', aliases: ['ds-a'] })]);
		const pipeline = { run: jest.fn() } as unknown as ElementPipeline;
		const app = new App();
		const plugin = new Plugin(app);

		expect(() => registerFrameworkElements(plugin as any, { registry, pipeline })).not.toThrow();
		expect(registry.all()).toHaveLength(1);
	});

	test('SC-343: the host handed to pipeline.run already knows the mount body', async () => {
		const def = fakeDef({ id: 'c', aliases: ['ds-c'] });
		const run = fakePipelineRun();
		const pipeline = { run } as unknown as ElementPipeline;
		const app = new App();
		app.vault.setFile('Note.md', '```ds-c\nname: A\n```');
		const plugin = new Plugin(app);
		registerFrameworkElements(plugin as any, { registry: fakeRegistry([def]), pipeline });

		const ctx = makeFakeContext(app, 'Note.md');
		await plugin.registeredProcessors.get('ds-c')!('name: A', ctx.el, ctx as any);

		const host = run.mock.calls[0][2] as ReadingModeBlockHost;
		expect(host).toBeInstanceOf(ReadingModeBlockHost);
		expect(host.lastKnownBody).toBe('name: A');
	});
});

describe('SC-602: the Live Preview focus carry is wired', () => {
	test('its editor extension is registered with the plugin, built on the registry the wiring returns, and the registry has the release hook', () => {
		const ext = [{ sc602: 'extension' }] as any;
		const build = jest.spyOn(FocusCarry, 'livePreviewFocusCarryExtension').mockReturnValue(ext);
		try {
			const plugin = new Plugin(new App());
			const registered = jest.spyOn(plugin, 'registerEditorExtension');

			const registry = registerFrameworkElements(plugin as any, { registry: fakeRegistry([]), pipeline: { run: jest.fn() } as unknown as ElementPipeline });

			expect(build).toHaveBeenCalledWith(registry);
			expect(registered).toHaveBeenCalledWith(ext);
			expect(typeof registry.beforeRelease).toBe('function');
		} finally {
			build.mockRestore();
		}
	});
});

describe('SC-605: the release hook keeps the two carries independent, and unload clears the state carry', () => {
	test('a focus carry that throws does not skip the state carry, and a throwing state carry does not skip the focus carry', () => {
		const focus = jest.spyOn(FocusCarry, 'carryOwnSaveFocus').mockImplementation(() => {
			throw new Error('focus boom');
		});
		const state = jest.spyOn(StateCarry, 'carryOwnSaveState').mockReturnValue(false);
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const registry = registerFrameworkElements(new Plugin(new App()) as any, { registry: fakeRegistry([]), pipeline: { run: jest.fn() } as unknown as ElementPipeline });
			const entry = { sc605: 'entry' } as any;
			registry.beforeRelease!(entry, 'render-child-unload');
			expect(state).toHaveBeenCalledWith(entry);

			focus.mockReturnValue(false).mockImplementation(() => false);
			state.mockImplementation(() => {
				throw new Error('state boom');
			});
			registry.beforeRelease!(entry, 'render-child-unload');
			expect(focus).toHaveBeenCalledTimes(2);
			expect(warn).toHaveBeenCalledTimes(2);
		} finally {
			focus.mockRestore();
			state.mockRestore();
			warn.mockRestore();
		}
	});

	test('plugin unload forgets every armed carry', () => {
		const plugin = new Plugin(new App());
		const unload = jest.spyOn(plugin, 'register');
		const clear = jest.spyOn(StateCarry, 'clearCarriedState');
		try {
			registerFrameworkElements(plugin as any, { registry: fakeRegistry([]), pipeline: { run: jest.fn() } as unknown as ElementPipeline });
			for (const [cb] of unload.mock.calls) (cb as () => void)();
			expect(clear).toHaveBeenCalled();
		} finally {
			clear.mockRestore();
		}
	});
});

describe('SC-605: the Live Preview state carry is wired', () => {
	test('its editor extension is registered on the registry the wiring returns, and the release hook runs both carries for the released entry', () => {
		const ext = [{ sc605: 'extension' }] as any;
		const build = jest.spyOn(StateCarry, 'livePreviewStateCarryExtension').mockReturnValue(ext);
		const focus = jest.spyOn(FocusCarry, 'carryOwnSaveFocus').mockReturnValue(false);
		const state = jest.spyOn(StateCarry, 'carryOwnSaveState').mockReturnValue(false);
		try {
			const plugin = new Plugin(new App());
			const registered = jest.spyOn(plugin, 'registerEditorExtension');

			const registry = registerFrameworkElements(plugin as any, { registry: fakeRegistry([]), pipeline: { run: jest.fn() } as unknown as ElementPipeline });
			const entry = { sc605: 'entry' } as any;
			registry.beforeRelease!(entry, 'render-child-unload');

			expect(build).toHaveBeenCalledWith(registry);
			expect(registered).toHaveBeenCalledWith(ext);
			expect(focus).toHaveBeenCalledWith(entry);
			expect(state).toHaveBeenCalledWith(entry);
		} finally {
			build.mockRestore();
			focus.mockRestore();
			state.mockRestore();
		}
	});
});
