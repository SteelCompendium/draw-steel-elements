// SC-545 -- after the plugin is turned off and on, Live Preview keeps its callout and embed widgets (and the OLD instance's cards in
// them): no processor runs for them and their view is unloaded, so a click on the card did nothing. The unloading instance leaves
// each such card's context on its element (stash); the new instance draws a fresh card there once the layout is ready (remount), and
// rebuilds a note only if a block is still undrawn (fallback). Stand-ins here: a fake markdown leaf whose containerEl holds the
// Live Preview DOM Obsidian builds (`.markdown-source-view > .cm-embed-block.cm-callout > element`), and a fake MarkdownView.
import type { MarkdownPostProcessorContext } from 'obsidian';
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry } from '../../../src/framework/registry';
import { counterElement } from '../../../src/elements/counter/definition';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { ViewRegistry } from '../../../src/framework/host/viewRegistry';
import type { ViewRegistryEntry } from '../../../src/framework/host/viewRegistry';
import { REPLUG_ATTR, REPLUG_KEY, ReplugRemounter, readReplugStash, stashForReplug } from '../../../src/framework/host/replugRemount';
import type { ReplugDeps } from '../../../src/framework/host/replugRemount';
import { EditorView } from '@codemirror/view';
import { Plugin, makeFakeContext } from '../../mocks/obsidian';
import { makeEnv } from './_adoptionEnv';

const BODY = 'name: Health\ncurrent_value: 10\nmax_value: 20\nmin_value: 0';
const NOTE = `# N\n\n\`\`\`ds-counter\n${BODY}\n\`\`\`\n`;
const INC = 'button[aria-label^="Increase"]';

type Where = 'callout' | 'embed' | 'codeblock' | 'reading';

/** The DOM Obsidian builds around an element a processor draws into. Returns the element and the leaf-level container. */
function widgetDom(where: Where): { container: HTMLElement; el: HTMLElement } {
	const container = document.body.createDiv();
	const view = container.createDiv({ cls: where === 'reading' ? 'markdown-reading-view' : 'markdown-source-view' });
	const el = document.createElement('div');
	if (where === 'callout') view.createDiv({ cls: 'cm-embed-block cm-callout' }).appendChild(el);
	else if (where === 'embed') view.createDiv({ cls: 'cm-embed-block' }).createSpan({ cls: 'internal-embed' }).appendChild(el);
	else if (where === 'codeblock') view.createDiv({ cls: 'cm-embed-block' }).appendChild(el);
	else view.createDiv({ cls: 'callout' }).appendChild(el);
	return { container, el };
}

/** A registry entry as `stashForReplug` reads it. */
function fakeEntry(root: HTMLElement, el: HTMLElement, ctx: MarkdownPostProcessorContext, body: string | null = BODY, alias = 'ds-counter'): ViewRegistryEntry {
	return { root, host: { lastKnownBody: body, remountTarget: () => ({ el, ctx, alias }) } } as unknown as ViewRegistryEntry;
}

/** A card root inside `el`, as the pipeline leaves one. */
function cardIn(el: HTMLElement): HTMLElement {
	const root = el.createDiv();
	root.setAttribute('data-dse-element', 'counter');
	return root;
}

function fakeCtx(sourcePath = 'Note.md'): MarkdownPostProcessorContext {
	return { sourcePath, docId: 'd', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => null } as unknown as MarkdownPostProcessorContext;
}

/** A fake MarkdownView over `container`, with the calls the fallback makes. */
function fakeView(container: HTMLElement, opts: { scrollTop?: number; resetsScroll?: boolean } = {}) {
	const scrollDOM = document.createElement('div');
	scrollDOM.scrollTop = opts.scrollTop ?? 0;
	const view = {
		containerEl: container,
		file: { path: 'Note.md' },
		getViewType: () => 'markdown',
		getViewData: jest.fn(() => 'the note text'),
		getEphemeralState: jest.fn(() => ({ cursor: 3 })),
		setEphemeralState: jest.fn(),
		setViewData: jest.fn(() => {
			if (opts.resetsScroll) scrollDOM.scrollTop = 0;
		}),
		editor: { cm: { scrollDOM } },
	};
	return { view, scrollDOM, leaf: { view } };
}

function fakeApp(leaves: Array<{ view: unknown }>) {
	return { workspace: { getLeavesOfType: (type: string) => (type === 'markdown' ? leaves : []) } } as never;
}

function deps(over: Partial<ReplugDeps> = {}): ReplugDeps & { mount: jest.Mock } {
	return {
		hasAlias: (alias) => alias === 'ds-counter',
		mount: jest.fn(async () => {}),
		liveRoots: () => [],
		...over,
	} as ReplugDeps & { mount: jest.Mock };
}

afterEach(() => {
	document.body.replaceChildren();
	jest.restoreAllMocks();
});

describe('SC-545 stash: what the unloading instance leaves on the element', () => {
	test.each<Where>(['callout', 'embed'])('marks a connected card in a Live Preview %s with the widget context, fence label and body', (where) => {
		const { el } = widgetDom(where);
		const ctx = fakeCtx();
		expect(stashForReplug([fakeEntry(cardIn(el), el, ctx)])).toBe(1);
		expect(el.hasAttribute(REPLUG_ATTR)).toBe(true);
		expect(readReplugStash(el)).toEqual({ v: 1, ctx, alias: 'ds-counter', body: BODY });
		expect(readReplugStash(el)?.ctx).toBe(ctx); // Obsidian's own object, not a copy
	});

	test('holds only the version, the context, the label and the body - plain data and an Obsidian object, nothing of the old instance', () => {
		const { el } = widgetDom('callout');
		stashForReplug([fakeEntry(cardIn(el), el, fakeCtx())]);
		const stash = (el as unknown as Record<string, Record<string, unknown>>)[REPLUG_KEY];
		expect(Object.keys(stash).sort()).toEqual(['alias', 'body', 'ctx', 'v']);
		expect([typeof stash.v, typeof stash.alias, typeof stash.body]).toEqual(['number', 'string', 'string']);
		expect(REPLUG_KEY).toMatch(/V1$/); // the key carries the version (cross-version contract)
	});

	test.each<Where>(['callout', 'embed'])('marks a card in a %s widget CodeMirror has taken out of the page (detached: no .markdown-source-view above it)', (where) => {
		const { container, el } = widgetDom(where);
		const root = cardIn(el);
		const widget = (where === 'callout' ? el.closest('.cm-embed-block') : el.closest('.internal-embed')) as HTMLElement;
		widget.remove(); // what CodeMirror does to a block far from the visible part of the note; the widget keeps its DOM
		expect(root.isConnected).toBe(false);
		expect(root.closest('.markdown-source-view')).toBeNull();
		expect(container.contains(el)).toBe(false);
		const ctx = fakeCtx();
		expect(stashForReplug([fakeEntry(root, el, ctx)])).toBe(1);
		expect(readReplugStash(el)).toEqual({ v: 1, ctx, alias: 'ds-counter', body: BODY });
	});

	test('leaves alone a card in Reading view, in a Live Preview code-block widget (in the page or detached), a detached one outside any widget, and one with no known body', () => {
		const reading = widgetDom('reading').el;
		const codeblock = widgetDom('codeblock').el;
		const codeblockGone = widgetDom('codeblock').el;
		const bare = document.createElement('div');
		const readingGone = widgetDom('reading').el;
		const noBody = widgetDom('callout').el;
		const entries = [
			fakeEntry(cardIn(reading), reading, fakeCtx()),
			fakeEntry(cardIn(codeblock), codeblock, fakeCtx()),
			fakeEntry(cardIn(codeblockGone), codeblockGone, fakeCtx()),
			fakeEntry(cardIn(bare), bare, fakeCtx()),
			fakeEntry(cardIn(readingGone), readingGone, fakeCtx()),
			fakeEntry(cardIn(noBody), noBody, fakeCtx(), null),
		];
		(codeblockGone.closest('.cm-embed-block') as HTMLElement).remove();
		(readingGone.closest('.markdown-reading-view') as HTMLElement).remove();
		expect(stashForReplug(entries)).toBe(0);
		for (const el of [reading, codeblock, codeblockGone, bare, readingGone, noBody]) expect(el.hasAttribute(REPLUG_ATTR)).toBe(false);
	});

	test('a stash with the wrong version or shape is not read', () => {
		const ok = { v: 1, ctx: fakeCtx(), alias: 'ds-counter', body: BODY };
		const bad: Array<Record<string, unknown>> = [
			{ ...ok, v: 2 },
			{ ...ok, alias: '' },
			{ ...ok, body: 5 },
			{ ...ok, ctx: { sourcePath: 'Note.md' } },
			{ ...ok, ctx: null },
		];
		for (const stash of bad) {
			const el = document.createElement('div');
			(el as unknown as Record<string, unknown>)[REPLUG_KEY] = stash;
			expect(readReplugStash(el)).toBeNull();
		}
		const el = document.createElement('div');
		expect(readReplugStash(el)).toBeNull();
		(el as unknown as Record<string, unknown>)[REPLUG_KEY] = ok;
		expect(readReplugStash(el)).not.toBeNull();
	});
});

describe('SC-545 remount: the new instance draws the stashed cards', () => {
	function marked(where: Where = 'callout') {
		const { container, el } = widgetDom(where);
		const old = cardIn(el);
		const ctx = fakeCtx();
		stashForReplug([fakeEntry(old, el, ctx)]);
		return { container, el, old, ctx };
	}

	test('empties the element and mounts once per mark with the stashed context, label and body; the mark is gone', async () => {
		const { container, el, old, ctx } = marked();
		const d = deps();
		const { view } = fakeView(container);
		const result = await new ReplugRemounter(fakeApp([{ view }]), d).run();
		expect(d.mount).toHaveBeenCalledTimes(1);
		expect(d.mount).toHaveBeenCalledWith(el, ctx, 'ds-counter', BODY);
		expect(old.isConnected).toBe(false); // the old card, and with it the click shield's listeners on its root
		expect(el.children).toHaveLength(0);
		expect(el.hasAttribute(REPLUG_ATTR)).toBe(false);
		expect(readReplugStash(el)).toBeNull();
		expect(result.remounted).toBe(1);
	});

	test('a second run mounts nothing', async () => {
		const { container } = marked();
		const d = deps();
		const remounter = new ReplugRemounter(fakeApp([{ view: fakeView(container).view }]), d);
		await remounter.run();
		await remounter.run();
		expect(d.mount).toHaveBeenCalledTimes(1);
	});

	test('skips an element that left the document, and one whose label is no longer an element; the latter keeps its card', async () => {
		const gone = marked();
		const unknown = marked('embed');
		gone.container.remove(); // the leaf still holds the element, which is no longer in the document
		const d = deps({ hasAlias: () => false });
		const result = await new ReplugRemounter(fakeApp([{ view: fakeView(gone.container).view }, { view: fakeView(unknown.container).view }]), d).run();
		expect(d.mount).not.toHaveBeenCalled();
		expect(unknown.old.isConnected).toBe(true);
		expect(result.remounted).toBe(0);
	});

	test('a stash with the wrong shape is ignored: nothing is drawn, the card stays, and the note is left to the fallback', async () => {
		const { container, el, old } = marked();
		(el as unknown as Record<string, Record<string, unknown>>)[REPLUG_KEY].v = 2; // as if a newer build had written another shape
		const d = deps();
		const { view } = fakeView(container);
		const result = await new ReplugRemounter(fakeApp([{ view }]), d).run();
		expect(d.mount).not.toHaveBeenCalled();
		expect(old.isConnected).toBe(true);
		expect(el.hasAttribute(REPLUG_ATTR)).toBe(false);
		expect(view.setViewData).toHaveBeenCalledTimes(1); // the unowned card is rebuilt
		expect(result).toEqual({ remounted: 0, rebuilt: ['Note.md'] });
	});

	test('the normal path (every card stashed and redrawn into an owned root) does not rebuild the note', async () => {
		const { container, el } = marked();
		const owned: HTMLElement[] = [];
		const d = deps({
			mount: jest.fn(async (target: HTMLElement) => {
				owned.push(cardIn(target));
			}),
			liveRoots: () => owned,
		});
		const { view } = fakeView(container);
		const result = await new ReplugRemounter(fakeApp([{ view }]), d).run();
		expect(el.children).toHaveLength(1);
		expect(view.setViewData).not.toHaveBeenCalled();
		expect(result).toEqual({ remounted: 1, rebuilt: [] });
	});

	test('an instance disposed before the layout is ready does nothing and leaves the marks for the next one', async () => {
		const { container, el } = marked();
		const d = deps();
		const remounter = new ReplugRemounter(fakeApp([{ view: fakeView(container).view }]), d);
		remounter.dispose();
		expect(await remounter.run()).toEqual({ remounted: 0, rebuilt: [] });
		expect(d.mount).not.toHaveBeenCalled();
		expect(readReplugStash(el)).not.toBeNull();
	});

	test('off/on/off while a draw is running: the element is marked again for the next instance, and the fallback does not run', async () => {
		const { container, el, ctx } = marked();
		let finish!: () => void;
		const d = deps({ mount: jest.fn(() => new Promise<void>((r) => (finish = r))) });
		const { view } = fakeView(container);
		const remounter = new ReplugRemounter(fakeApp([{ view }]), d);
		const running = remounter.run();
		expect(readReplugStash(el)).toBeNull(); // taken by this instance
		remounter.dispose(); // the plugin is turned off again before the draw finished
		expect(readReplugStash(el)).toEqual({ v: 1, ctx, alias: 'ds-counter', body: BODY });
		finish();
		expect(await running).toEqual({ remounted: 1, rebuilt: [] });
		expect(view.setViewData).not.toHaveBeenCalled();
	});
});

describe('SC-545 remount of a card that was off the page at the toggle', () => {
	/** A card in a callout widget that CodeMirror has taken out of the page, stashed by the old instance. */
	function offPage() {
		const { container, el } = widgetDom('callout');
		const old = cardIn(el);
		const widget = el.closest('.cm-embed-block') as HTMLElement;
		widget.remove();
		const ctx = fakeCtx();
		stashForReplug([fakeEntry(old, el, ctx)]);
		return { container, el, old, widget, ctx, editor: container.querySelector('.markdown-source-view') as HTMLElement };
	}

	test('the layout-ready run does not reach it; the editor update that puts the widget back draws it once, with the stashed context', async () => {
		const { container, el, widget, ctx, editor } = offPage();
		const d = deps();
		const remounter = new ReplugRemounter(fakeApp([{ view: fakeView(container).view }]), d);
		expect(await remounter.run()).toEqual({ remounted: 0, rebuilt: [] });
		expect(d.mount).not.toHaveBeenCalled();
		expect(readReplugStash(el)).not.toBeNull(); // still marked, waiting for its widget
		editor.appendChild(widget); // CodeMirror puts the cached widget DOM back
		remounter.remountReattached(editor);
		await Promise.resolve();
		expect(d.mount).toHaveBeenCalledTimes(1);
		expect(d.mount).toHaveBeenCalledWith(el, ctx, 'ds-counter', BODY);
		expect(readReplugStash(el)).toBeNull();
		remounter.remountReattached(editor);
		expect(d.mount).toHaveBeenCalledTimes(1);
	});

	test('with nothing marked an editor update costs one querySelector: no query of all marks, no draw', () => {
		const { container } = widgetDom('callout');
		const scope = container.firstElementChild as HTMLElement;
		const all = jest.spyOn(scope, 'querySelectorAll');
		const one = jest.spyOn(scope, 'querySelector');
		const d = deps();
		new ReplugRemounter(fakeApp([]), d).remountReattached(scope);
		expect(all).not.toHaveBeenCalled();
		expect(one).toHaveBeenCalledTimes(1);
		expect(d.mount).not.toHaveBeenCalled();
	});

	test('an instance that was unloaded ignores a widget that comes back; the mark stays for the next one', () => {
		const { container, el, widget, editor } = offPage();
		const d = deps();
		const remounter = new ReplugRemounter(fakeApp([{ view: fakeView(container).view }]), d);
		remounter.dispose();
		editor.appendChild(widget);
		remounter.remountReattached(editor);
		expect(d.mount).not.toHaveBeenCalled();
		expect(readReplugStash(el)).not.toBeNull();
	});
});

describe('SC-545 robustness: one bad stash does not stop the others; an unloaded instance never rebuilds a note', () => {
	test('a stash whose reader throws is logged and dropped; the other card is still drawn and the run resolves (LOW-1)', async () => {
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		const bad = widgetDom('callout');
		const good = widgetDom('embed');
		cardIn(bad.el);
		cardIn(good.el);
		stashForReplug([fakeEntry(bad.el.firstElementChild as HTMLElement, bad.el, fakeCtx()), fakeEntry(good.el.firstElementChild as HTMLElement, good.el, fakeCtx())]);
		(bad.el as unknown as Record<string, unknown>)[REPLUG_KEY] = new Proxy({}, { get: () => { throw new Error('forged'); } });
		const d = deps();
		const result = await new ReplugRemounter(fakeApp([{ view: fakeView(bad.container).view }, { view: fakeView(good.container).view }]), d).run();
		expect(d.mount).toHaveBeenCalledTimes(1);
		expect(d.mount.mock.calls[0][0]).toBe(good.el);
		expect(bad.el.hasAttribute(REPLUG_ATTR)).toBe(false);
		expect(result.remounted).toBe(1);
		expect(log).toHaveBeenCalled();
	});

	test('a draw that throws synchronously is logged and does not stop the run', async () => {
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		const a = widgetDom('callout');
		stashForReplug([fakeEntry(cardIn(a.el), a.el, fakeCtx())]);
		const d = deps({ mount: jest.fn(() => { throw new Error('boom'); }) });
		await expect(new ReplugRemounter(fakeApp([{ view: fakeView(a.container).view }]), d).run()).resolves.toEqual({ remounted: 0, rebuilt: [] });
		expect(log).toHaveBeenCalled();
	});

	test('dispose() that lands during a slow remount, with a raw DSE fence in a callout: no setViewData after the unload (LOW-2)', async () => {
		const marked = widgetDom('callout');
		stashForReplug([fakeEntry(cardIn(marked.el), marked.el, fakeCtx())]);
		const raw = widgetDom('embed');
		raw.el.createEl('pre').createEl('code', { cls: 'language-ds-counter' });
		let finish!: () => void;
		const d = deps({ mount: jest.fn(() => new Promise<void>((r) => (finish = r))) });
		const rawView = fakeView(raw.container).view;
		const remounter = new ReplugRemounter(fakeApp([{ view: fakeView(marked.container).view }, { view: rawView }]), d);
		const running = remounter.run();
		remounter.dispose(); // the plugin is turned off again while the draw is still running
		finish();
		expect(await running).toEqual({ remounted: 1, rebuilt: [] });
		expect(rawView.setViewData).not.toHaveBeenCalled();
	});
});

describe('SC-545 fallback: rebuild a note only for a block that is still undrawn', () => {
	const rawFence = (parent: HTMLElement, lang = 'ds-counter'): void => {
		parent.createEl('pre').createEl('code', { cls: `language-${lang}` });
	};

	test.each<Where>(['callout', 'embed'])('a raw DSE fence in a Live Preview %s: the note is set from its own text once, with its ephemeral state put back', async (where) => {
		const { container, el } = widgetDom(where);
		rawFence(el);
		const { view } = fakeView(container);
		const result = await new ReplugRemounter(fakeApp([{ view }]), deps()).run();
		expect(view.setViewData).toHaveBeenCalledTimes(1);
		expect(view.setViewData).toHaveBeenCalledWith('the note text', true);
		expect(view.setEphemeralState).toHaveBeenCalledWith({ cursor: 3 });
		expect(result.rebuilt).toEqual(['Note.md']);
	});

	test('an unowned DSE card in a callout triggers it; an owned card, a nested card and the inert deferred card do not', async () => {
		const unowned = widgetDom('callout');
		const stray = cardIn(unowned.el);
		const mk = (deferred: boolean, nested: boolean) => {
			const w = widgetDom('callout');
			const root = cardIn(w.el);
			if (deferred) root.setAttribute('data-dse-element', 'deferred');
			if (nested) cardIn(root);
			return { w, root };
		};
		const owned = mk(false, false);
		const deferred = mk(true, false);
		const nested = mk(false, true);
		const live = [owned.root, nested.root];
		const views = [unowned, owned.w, deferred.w, nested.w].map((w) => fakeView(w.container).view);
		const result = await new ReplugRemounter(fakeApp(views.map((view) => ({ view }))), deps({ liveRoots: () => live })).run();
		expect(views.map((v) => v.setViewData.mock.calls.length)).toEqual([1, 0, 0, 0]);
		expect(stray.isConnected).toBe(true);
		expect(result.rebuilt).toEqual(['Note.md']);
	});

	test('ignores code that is not a DSE fence, a raw fence outside a callout/embed widget, and Reading view', async () => {
		const other = widgetDom('callout');
		rawFence(other.el, 'js');
		const unknownLabel = widgetDom('callout');
		rawFence(unknownLabel.el, 'ds-nothing');
		const plainWidget = widgetDom('codeblock');
		rawFence(plainWidget.el);
		cardIn(plainWidget.el); // a card nobody owns, but in a code-block widget Obsidian redraws itself
		const reading = widgetDom('reading');
		rawFence(reading.el);
		const views = [other, unknownLabel, plainWidget, reading].map((w) => fakeView(w.container).view);
		const result = await new ReplugRemounter(fakeApp(views.map((view) => ({ view }))), deps()).run();
		for (const v of views) expect(v.setViewData).not.toHaveBeenCalled();
		expect(result.rebuilt).toEqual([]);
	});

	test('puts the pixel scroll position back after the rebuild (Obsidian restores a line, and heights are measured again)', async () => {
		const { container, el } = widgetDom('callout');
		rawFence(el);
		const { view, scrollDOM } = fakeView(container, { scrollTop: 2559, resetsScroll: true });
		await new ReplugRemounter(fakeApp([{ view }]), deps()).run();
		expect(scrollDOM.scrollTop).toBe(2559);
		scrollDOM.scrollTop = 40; // the editor drifts again before the next frame
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
		expect(scrollDOM.scrollTop).toBe(2559);
	});
});

describe('SC-545 wiring: an off/on of the plugin with a card in a Live Preview callout', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	/** One plugin instance of the framework over the shared `app` (the pipeline deps are reused: only their registry matters here). */
	function boot(env: ReturnType<typeof makeEnv>, layoutReady = true, extensions: unknown[] = []) {
		const plugin = new Plugin(env.app);
		jest.spyOn(plugin, 'registerEditorExtension').mockImplementation((ext: unknown) => void extensions.push(ext));
		plugin.load();
		env.app.workspace.layoutReady = layoutReady;
		const elements = createElementRegistry();
		elements.register(counterElement);
		const registry = registerFrameworkElements(plugin as never, { registry: elements, pipeline: new ElementPipeline(env.deps) }, { viewAdoption: true });
		return { plugin, registry };
	}
	/** Obsidian draws the callout widget once: the processor is called and the context's children load with the widget. */
	async function drawCallout(env: ReturnType<typeof makeEnv>, plugin: Plugin) {
		const { container, el } = widgetDom('callout');
		const ctx = makeFakeContext(env.app, 'Note.md');
		const addChild = ctx.addChild.bind(ctx);
		ctx.addChild = (child) => (addChild(child), child.load());
		Object.defineProperty(ctx, 'el', { value: el });
		await plugin.registeredProcessors.get('ds-counter')!(BODY, el, ctx as never);
		return { container, el, ctx };
	}
	const value = (el: HTMLElement) => (el.querySelector('.dse-counter__value') as HTMLInputElement).value;

	test('the unload leaves the card for the next instance; the next one redraws it at layout-ready: a fresh, owned root, no rebuild, and its + writes', async () => {
		const env = makeEnv();
		env.app.vault.setFile('Note.md', NOTE);
		const first = boot(env);
		const { container, el } = await drawCallout(env, first.plugin);
		const oldRoot = el.firstElementChild as HTMLElement;
		expect(oldRoot.hasAttribute('data-dse-element')).toBe(true);

		first.plugin.unload(); // off: the registry unloads its views, then stashes
		expect(first.registry.size).toBe(0);
		expect(readReplugStash(el)?.body).toBe(BODY);
		expect(el.firstElementChild).toBe(oldRoot); // Obsidian keeps the widget's DOM: still the old card, nobody owns it

		const { view: v } = fakeView(container);
		env.app.workspace._leaves.push({ getViewState: () => ({ type: 'markdown' }), view: v } as never);
		const second = boot(env, false);
		await jest.advanceTimersByTimeAsync(50);
		expect(el.firstElementChild).toBe(oldRoot); // layout not ready yet: nothing drawn
		env.app.workspace.__fireLayoutReady();
		await jest.advanceTimersByTimeAsync(50);

		const newRoot = el.firstElementChild as HTMLElement;
		expect(el.children).toHaveLength(1);
		expect(newRoot).not.toBe(oldRoot);
		expect(oldRoot.isConnected).toBe(false);
		expect(second.registry.liveEntries().map((e) => e.root)).toEqual([newRoot]);
		expect(v.setViewData).not.toHaveBeenCalled(); // the normal path never rebuilds the note

		(newRoot.querySelector(INC) as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(env.app.vault.getContent('Note.md')).toContain('current_value: 11');
		expect(value(el)).toBe('11');
	});

	test('off, on, off, on: the card is redrawn again, and a draw of the second instance never leaves a card behind unmarked', async () => {
		const env = makeEnv();
		env.app.vault.setFile('Note.md', NOTE);
		const first = boot(env);
		const { container, el } = await drawCallout(env, first.plugin);
		const { view: v } = fakeView(container);
		env.app.workspace._leaves.push({ getViewState: () => ({ type: 'markdown' }), view: v } as never);

		first.plugin.unload();
		const second = boot(env); // layout ready: remounts at once
		second.plugin.unload(); // off again before the draw finished
		await jest.advanceTimersByTimeAsync(50);
		expect(readReplugStash(el)).not.toBeNull(); // whatever the second instance managed to draw, the third one draws again

		const third = boot(env);
		await jest.advanceTimersByTimeAsync(50);
		const root = el.firstElementChild as HTMLElement;
		expect(el.children).toHaveLength(1);
		expect(third.registry.liveEntries().map((e) => e.root)).toEqual([root]);
		expect(v.setViewData).not.toHaveBeenCalled();
	});

	test('a card CodeMirror had taken off the page at the toggle: stashed at unload, not drawn at layout-ready, drawn by the editor update that puts its widget back; owned, + writes, no rebuild', async () => {
		const env = makeEnv();
		env.app.vault.setFile('Note.md', NOTE);
		const first = boot(env);
		const { container, el } = await drawCallout(env, first.plugin);
		const oldRoot = el.firstElementChild as HTMLElement;
		const editor = container.querySelector('.markdown-source-view') as HTMLElement;
		const widget = el.closest('.cm-embed-block') as HTMLElement;
		widget.remove(); // scrolled far away: the widget keeps its DOM and its live view
		first.plugin.unload();
		expect(readReplugStash(el)?.body).toBe(BODY);

		const { view: v } = fakeView(container);
		env.app.workspace._leaves.push({ getViewState: () => ({ type: 'markdown' }), view: v } as never);
		const extensions: unknown[] = [];
		const second = boot(env, true, extensions);
		await jest.advanceTimersByTimeAsync(50);
		expect(el.firstElementChild).toBe(oldRoot); // nothing in the page to draw into
		expect(readReplugStash(el)).not.toBeNull();

		editor.appendChild(widget); // scrolled back
		const listener = extensions.find((e) => (e as { facet?: unknown }).facet === EditorView.updateListener) as { value: (u: unknown) => void };
		listener.value({ docChanged: false, viewportChanged: true, selectionSet: false, view: { dom: editor }, state: { field: () => undefined } });
		await jest.advanceTimersByTimeAsync(50);

		const newRoot = el.firstElementChild as HTMLElement;
		expect(el.children).toHaveLength(1);
		expect(newRoot).not.toBe(oldRoot);
		expect(oldRoot.isConnected).toBe(false);
		expect(second.registry.liveEntries().map((e) => e.root)).toEqual([newRoot]);
		expect(v.setViewData).not.toHaveBeenCalled();
		(newRoot.querySelector(INC) as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(env.app.vault.getContent('Note.md')).toContain('current_value: 11');
	});

	test('a layout-ready run that rejects is logged, not left as an unhandled rejection (LOW-1)', async () => {
		const log = jest.spyOn(console, 'error').mockImplementation(() => {});
		jest.spyOn(ReplugRemounter.prototype, 'run').mockRejectedValue(new Error('boom'));
		const env = makeEnv();
		boot(env);
		await jest.advanceTimersByTimeAsync(0);
		expect(log).toHaveBeenCalledWith(expect.stringContaining('redrawing the cards after the plugin was turned on failed'), expect.any(Error));
	});

	test('ViewRegistry.onunload stashes the entries it is about to clear', async () => {
		const registry = new ViewRegistry({ enabled: false });
		registry.load();
		const { el } = widgetDom('callout');
		const root = cardIn(el);
		const entry = fakeEntry(root, el, fakeCtx());
		(registry as unknown as { entries: Set<ViewRegistryEntry> }).entries.add(entry);
		registry.unload();
		expect(readReplugStash(el)?.alias).toBe('ds-counter');
		expect(registry.size).toBe(0);
	});
});
