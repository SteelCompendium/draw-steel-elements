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
/** SC-340 Task 4 review (carried fix): a two-block note, for rebinding to the SECOND block. */
const TWO_BLOCK_NOTE = `# N\n\n\`\`\`ds-counter\n${COUNTER_BODY}\n\`\`\`\n\nSome text.\n\n\`\`\`ds-counter\nname: Mana\ncurrent_value: 5\nmax_value: 10\nmin_value: 0\n\`\`\`\n`;

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
		const bodyBeforeRebind = host.lastKnownBody;
		const lineBeforeRebind = host.lastKnownLineStart;
		const ctx2 = makeFakeContext(app, 'Note.md');
		(ctx2 as any).docId = 'doc-2';
		host.rebind(ctx2.el, ctx2 as any);
		expect(host.containerEl).toBe(ctx2.el);
		expect(host.docId).toBe('doc-2');
		expect(ctx2.addedChildren).toHaveLength(1);
		// SC-340 Task 4 review (carried fix): rebind must never clear/change knownBody.
		expect(host.lastKnownBody).toBe(bodyBeforeRebind);

		renderChild.unload(); // superseded
		expect(registry.size).toBe(1);

		const renderChild2 = ctx2.addedChildren[0];
		renderChild2.load();

		// SC-340 Task 4 review (carried fix): rebind to the SECOND block of a two-block note
		// moves the durable position (lastKnownLineStart), same host, same registry entry.
		app.vault.setFile('Note.md', TWO_BLOCK_NOTE);
		const ctx3 = makeFakeContext(app, 'Note.md', 1);
		host.rebind(ctx3.el, ctx3 as any);
		expect(host.lastKnownLineStart).not.toBe(lineBeforeRebind);

		renderChild2.unload(); // superseded
		expect(registry.size).toBe(1);

		const renderChild3 = ctx3.addedChildren[0];
		renderChild3.load();
		renderChild3.unload(); // current
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

	// Fix round 1 (M-2): spec §6.2 says "the entry with the newest ticket wins". A coalesced
	// rebuild for writes A, B, A (three edits landing before any rebuild fires) must claim
	// against the NEWEST matching ticket (the second A) and consume it plus every OLDER
	// ticket — leaving nothing live, not the stale ['B','A'] a findIndex-picks-oldest bug
	// would leave behind.
	test('a coalesced A, B, A rebuild claims on the NEWEST matching ticket and leaves no live ticket', () => {
		const registry = new ViewRegistry({ enabled: true, now: () => 1_000 });
		registry.load();
		const { app, plugin } = makeEnv();
		app.vault.setFile('Note.md', NOTE);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter', null, registry);
		const entry = registry.own(new Component() as any, host, document.createElement('div'));
		registry.noteWrite(entry, 'a: 1'); // A
		registry.noteWrite(entry, 'b: 1'); // B
		registry.noteWrite(entry, 'a: 1'); // A again — the newest ticket
		const claimed = registry.claim(host.docId, 'Note.md', 'a: 1');
		expect(claimed).toBe(entry);
		expect(registry.stats.claims).toBe(1);
		expect(entry.tickets).toHaveLength(0);
	});
});

describe('SC-340 Task 4 review (carried fix): no claim ticket for a write that changed nothing', () => {
	test('a write whose spliced body equals what is already on disk leaves no live ticket', async () => {
		const { registry, host } = await mountCounter();
		const [entry] = registry.liveEntries();
		expect(entry.tickets).toHaveLength(0);
		await host.replaceSource(COUNTER_BODY); // identical to what mountCounter already wrote
		expect(entry.tickets).toHaveLength(0);
	});

	test('a real write (the body actually changes) leaves exactly one ticket', async () => {
		const { registry, host } = await mountCounter();
		const [entry] = registry.liveEntries();
		await host.replaceSource('name: Health\ncurrent_value: 11\nmax_value: 20\nmin_value: 0');
		expect(entry.tickets).toHaveLength(1);
	});

	// Fix round 1 (I-1): vault.process REJECTING (file deleted/renamed mid-write, I/O error,
	// a throw inside the callback) must not leave the ticket live for CLAIM_WINDOW_MS — same
	// hazard as a write that changed nothing, just via an exception instead of a normal
	// return.
	test('a write whose vault.process REJECTS leaves no live ticket (replaceSource still rejects)', async () => {
		const { app, registry, host } = await mountCounter();
		const [entry] = registry.liveEntries();
		app.vault.process = jest.fn(async () => {
			throw new Error('ENOENT: file deleted mid-write');
		}) as any;
		await expect(
			host.replaceSource('name: Health\ncurrent_value: 11\nmax_value: 20\nmin_value: 0'),
		).rejects.toThrow('ENOENT');
		expect(entry.tickets).toHaveLength(0);
	});
});
