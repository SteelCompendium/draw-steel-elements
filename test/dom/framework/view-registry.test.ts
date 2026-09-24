// SC-340 (spec §6.1, §6.4): the ViewRegistry owns reading-mode views; the CURRENT render
// child's unload releases the view (flush, then unload).
import { ViewRegistry, CLAIM_WINDOW_MS } from '../../../src/framework/host/viewRegistry';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { counterElement } from '../../../src/elements/counter/definition';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { Component, makeFakeContext } from '../../mocks/obsidian';
import { makeEnv } from './_adoptionEnv';

const COUNTER_BODY = 'name: Health\ncurrent_value: 10\nmax_value: 20\nmin_value: 0';
const NOTE = `# N\n\n\`\`\`ds-counter\n${COUNTER_BODY}\n\`\`\`\n`;

async function mountCounter(enabled = false) {
	const { deps, app, plugin } = makeEnv();
	app.vault.setFile('Note.md', NOTE);
	const registry = new ViewRegistry({ enabled });
	registry.load();
	const ctx = makeFakeContext(app, 'Note.md');
	const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter', null, registry);
	host.setMountedBody(COUNTER_BODY);
	await new ElementPipeline(deps).run(counterElement, COUNTER_BODY, host);
	const renderChild = ctx.addedChildren[0];
	renderChild.load();
	const root = ctx.el.firstElementChild as HTMLElement;
	return { app, registry, host, ctx, renderChild, root };
}

describe('SC-340 Task 2: ViewRegistry ownership and release', () => {
	test('the pipeline hands a reading-mode view to the registry, never to host.addChild', async () => {
		const spy = jest.spyOn(ReadingModeBlockHost.prototype, 'addChild');
		const { registry, renderChild } = await mountCounter();
		expect(registry.size).toBe(1);
		expect(spy).not.toHaveBeenCalled();
		expect(renderChild._children).toHaveLength(0); // the view is not a render-child child
		const [entry] = registry.liveEntries();
		expect((entry.view as any)._loaded).toBe(true);
		spy.mockRestore();
	});

	test('the CURRENT render child unloading releases (unloads) the view', async () => {
		const { registry, renderChild } = await mountCounter();
		const [entry] = registry.liveEntries();
		renderChild.unload();
		expect(registry.size).toBe(0);
		expect(entry.released).toBe(true);
		expect(entry.releasedBy).toBe('render-child-unload');
		expect((entry.view as any)._loaded).toBe(false);
	});

	test('a render child that unloads WHILE pipeline.run is still pending is released, not leaked (fix round 1, Important-1)', async () => {
		const { deps, app, plugin } = makeEnv();
		app.vault.setFile('Note.md', NOTE);
		const registry = new ViewRegistry({ enabled: false });
		registry.load();
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter', null, registry);
		host.setMountedBody(COUNTER_BODY);
		const renderChild = ctx.addedChildren[0];
		renderChild.load();
		const pending = new ElementPipeline(deps).run(counterElement, COUNTER_BODY, host);
		renderChild.unload(); // section torn down while prepareModel (async) is still pending
		await pending;
		expect(registry.size).toBe(0);
		expect(registry.stats.releases).toBe(1);
		expect(registry.liveEntries()).toHaveLength(0);
	});

	test('release flushes the pending write: a click then an unload within the debounce still writes', async () => {
		jest.useFakeTimers();
		const { app, renderChild, root } = await mountCounter();
		(root.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		renderChild.unload(); // before PERSIST_DEBOUNCE_MS
		await jest.advanceTimersByTimeAsync(0);
		expect(app.vault.getContent('Note.md')).toContain('current_value: 11');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(app.vault.modifyCalls).toHaveLength(1);
		jest.useRealTimers();
	});

	test('registered callbacks run LIFO on release: a modal close registered after the flush runs before it', async () => {
		const registry = new ViewRegistry({ enabled: false });
		registry.load();
		const { app, plugin } = makeEnv();
		app.vault.setFile('Note.md', NOTE);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter', null, registry);
		const order: string[] = [];
		const view = new Component();
		view.register(() => order.push('flush')); // ElementView registers its flush first
		view.register(() => order.push('close-modal')); // then a view registers its modal close
		// Mock Component instance vs. the real `obsidian` Component type ViewRegistry.own's
		// param resolves to at compile time (jest maps 'obsidian' to this same mock module at
		// runtime — see reading-mode-host.test.ts's identical `owned as any` convention).
		const entry = registry.own(view as any, host, document.createElement('div'));
		registry.release(entry, 'test');
		expect(order).toEqual(['close-modal', 'flush']);
	});

	test('release is idempotent; a released entry is never released twice', () => {
		const registry = new ViewRegistry({ enabled: false });
		registry.load();
		const { app, plugin } = makeEnv();
		app.vault.setFile('Note.md', NOTE);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter', null, registry);
		const entry = registry.own(new Component() as any, host, document.createElement('div'));
		registry.release(entry, 'first');
		registry.release(entry, 'second');
		expect(registry.stats.releases).toBe(1);
		expect(entry.releasedBy).toBe('first');
	});

	test('plugin unload (the registry unloads) unloads every owned view', async () => {
		const { registry } = await mountCounter();
		const [entry] = registry.liveEntries();
		registry.unload();
		expect((entry.view as any)._loaded).toBe(false);
		expect(registry.size).toBe(0);
	});

	test('with adoption off, claim() always misses', async () => {
		const { registry } = await mountCounter(false);
		expect(registry.claim('fake-doc-Note.md', 'Note.md', COUNTER_BODY)).toBeNull();
	});
});

describe('SC-340 Task 3: rebind and claim tickets', () => {
	test('rebind re-points containerEl, docId and position; the OLD render child unload is then a no-op', async () => {
		const { app, registry, host, renderChild } = await mountCounter();
		const ctx2 = makeFakeContext(app, 'Note.md');
		(ctx2 as any).docId = 'doc-2';
		host.rebind(ctx2.el, ctx2 as any);
		expect(host.containerEl).toBe(ctx2.el);
		expect(host.docId).toBe('doc-2');
		expect(ctx2.addedChildren).toHaveLength(1);

		renderChild.unload(); // superseded
		expect(registry.size).toBe(1);

		const renderChild2 = ctx2.addedChildren[0];
		renderChild2.load();
		renderChild2.unload(); // current
		expect(registry.size).toBe(0);
	});

	test('replaceSource records a claim ticket BEFORE Vault.process runs', async () => {
		const { app, registry, host } = await mountCounter();
		const [entry] = registry.liveEntries();
		let ticketsSeenInsideProcess = -1;
		const original = app.vault.process.bind(app.vault);
		app.vault.process = (async (file: any, fn: any) => {
			ticketsSeenInsideProcess = entry.tickets.length;
			return original(file, fn);
		}) as any;
		await host.replaceSource('name: Health\ncurrent_value: 11\nmax_value: 20\nmin_value: 0');
		expect(ticketsSeenInsideProcess).toBe(1);
		expect(entry.tickets[0].body).toBe('name: Health\ncurrent_value: 11\nmax_value: 20\nmin_value: 0');
	});

	test('tickets older than CLAIM_WINDOW_MS are dropped on the next write', () => {
		let now = 1_000;
		const registry = new ViewRegistry({ enabled: true, now: () => now });
		registry.load();
		const { app, plugin } = makeEnv();
		app.vault.setFile('Note.md', NOTE);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter', null, registry);
		const entry = registry.own(new Component() as any, host, document.createElement('div'));
		registry.noteWrite(entry, 'a: 1');
		now += CLAIM_WINDOW_MS;
		registry.noteWrite(entry, 'a: 2');
		expect(entry.tickets.map((t) => t.body)).toEqual(['a: 2']);
	});
});
