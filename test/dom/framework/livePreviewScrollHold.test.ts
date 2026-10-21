// SC-478 — LivePreviewScrollHold: a Live Preview pane keeps its reading position when a DSE block in it is
// redrawn by a write (another pane, Sync/git/another plugin, or the pane's own).
//
// jsdom has no CodeMirror layout, so the EditorView is a duck-typed fake carrying exactly what the module
// reads: scrollDOM.scrollTop, contentDOM's children, scrollSnapshot(), posAtDOM(), dispatch(), requestMeasure().
// The real behaviour (Obsidian's 50px widget estimate, the viewport jump, the restore) is the lifecycle gate's
// job (G-S18); these tests pin the guards: when it captures, when it engages, that it never engages on a user's
// own edit or after a user scroll, and that every hold is released (mount, TTL, destroy, unload).
import { HOLD_ATTR, LivePreviewScrollHold } from '../../../src/framework/host/livePreviewScrollHold';
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import type { ElementRegistry } from '../../../src/framework/registry';
import type { ElementPipeline } from '../../../src/framework/pipeline';
import { App, Plugin } from '../../mocks/obsidian';

/** Must match PIN_TTL_MS in previewScrollPin.ts. */
const TTL = 2500;

interface FakeEffect {
	tag: string;
	map: (changes: unknown) => FakeEffect;
}

/** A DSE code-block widget as Obsidian draws it: `.cm-embed-block` > root `[data-dse-element]` (mounted = has children). */
function widget(pos: number, px: number, mounted = true): HTMLElement {
	const w = document.createElement('div');
	w.className = 'cm-preview-code-block cm-embed-block cm-lang-ds-initiative';
	const root = document.createElement('div');
	root.setAttribute('data-dse-element', 'initiative');
	if (mounted) root.appendChild(document.createElement('div'));
	w.appendChild(root);
	(w as unknown as { __pos: number }).__pos = pos;
	w.getBoundingClientRect = () => ({ height: px }) as DOMRect;
	return w;
}

function fakeView(scrollTop: number, widgets: HTMLElement[]) {
	const contentDOM = document.createElement('div');
	contentDOM.className = 'cm-content';
	const line = document.createElement('div');
	line.className = 'cm-line';
	contentDOM.append(line, ...widgets);
	document.body.appendChild(contentDOM);
	const scrollDOM = { scrollTop, ownerDocument: document };
	const snapshot: FakeEffect = { tag: 'snap', map: () => ({ tag: 'snap-mapped', map: () => snapshot }) };
	return {
		scrollDOM,
		contentDOM,
		scrollSnapshot: jest.fn(() => snapshot),
		posAtDOM: (el: HTMLElement) => (el as HTMLElement & { __pos?: number }).__pos ?? 0,
		dispatch: jest.fn(),
		requestMeasure: jest.fn(),
	};
}

type View = ReturnType<typeof fakeView>;
const shift = (by: number) => ({ mapPos: (p: number) => (p > 5 ? p + by : p) });
/** A ViewUpdate: doc changed by Obsidian's setViewData (`userEvent: "set"`) unless `event` says otherwise. */
const update = (view: View, event = 'set', changes = shift(0)) =>
	({ view, docChanged: true, changes, transactions: [{ docChanged: true, isUserEvent: (e: string) => e === event }] }) as never;
const flush = () => Promise.resolve().then(() => undefined);
/** The MarkdownView that shows an editor: only its `file` is read. */
const note = (path = 'Note.md') => ({ file: { path } as { path: string } | null });

afterEach(() => {
	document.body.innerHTML = '';
	jest.useRealTimers();
});

describe('SC-478: LivePreviewScrollHold capture', () => {
	test('captures a scrolled view that shows a DSE widget; a later "set" update restores the mapped snapshot', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(2428, [widget(7, 5230)]);
		hold.capture(view as never, note());
		expect(view.scrollSnapshot).toHaveBeenCalledTimes(1);
		hold.onUpdate(update(view));
		expect(view.dispatch).not.toHaveBeenCalled(); // never inside the update
		await flush();
		expect(view.dispatch).toHaveBeenCalledWith({ effects: expect.objectContaining({ tag: 'snap-mapped' }) });
	});

	test('does not capture at the top, or a view without a drawn DSE widget (a plain note never jumps)', async () => {
		const hold = new LivePreviewScrollHold();
		const atTop = fakeView(0, [widget(7, 5230)]);
		const plain = fakeView(3000, []);
		hold.capture(atTop as never, note());
		hold.capture(plain as never, note());
		hold.onUpdate(update(atTop));
		hold.onUpdate(update(plain));
		await flush();
		expect(atTop.dispatch).not.toHaveBeenCalled();
		expect(plain.dispatch).not.toHaveBeenCalled();
	});

	test("never engages on the user's own edit, and the edit consumes the capture", async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(2428, [widget(7, 5230)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view, 'input.type'));
		hold.onUpdate(update(view, 'set')); // a later set without a fresh capture
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
	});

	test('one update that carries a "set" AND a user transaction is not a pure set: no restore', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(2428, [widget(7, 5230)]);
		hold.capture(view as never, note());
		const tr = (event: string) => ({ docChanged: true, isUserEvent: (e: string) => e === event });
		hold.onUpdate({ view, docChanged: true, changes: shift(0), transactions: [tr('set'), tr('input.type')] } as never);
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
	});

	test('the user wins: a scroll between the capture and the transaction drops the restore', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(2428, [widget(7, 5230)]);
		hold.capture(view as never, note());
		view.scrollDOM.scrollTop = 1900;
		hold.onUpdate(update(view));
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
	});

	test('a capture belongs to one note: a transaction after another file was loaded into the leaf never gets its snapshot', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(2428, [widget(7, 5230)]);
		const owner = note('Tracker.md');
		hold.capture(view as never, owner);
		owner.file = { path: 'Other.md' }; // the leaf navigated; scrollTop happens to match, the transaction is a plain `set`
		hold.onUpdate(update(view));
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
		// ...and the capture is gone for good: coming back to the first note does not revive it
		owner.file = { path: 'Tracker.md' };
		hold.onUpdate(update(view));
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
	});

	test('a leaf that shows no file when the transaction arrives drops the capture; a view with no file is never captured', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(2428, [widget(7, 5230)]);
		const owner = note();
		hold.capture(view as never, owner);
		owner.file = null;
		hold.onUpdate(update(view));
		const orphan = fakeView(2428, [widget(7, 5230)]);
		hold.capture(orphan as never, { file: null });
		expect(orphan.scrollSnapshot).not.toHaveBeenCalled();
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
	});

	test('captureViewsOf captures only Live Preview/Source views of that path', async () => {
		const hold = new LivePreviewScrollHold();
		const mine = fakeView(2428, [widget(7, 5230)]);
		const other = fakeView(2428, [widget(7, 5230)]);
		const reading = fakeView(2428, [widget(7, 5230)]);
		const leaf = (path: string, mode: string, cm: View) => ({ view: { file: { path }, getMode: () => mode, editor: { cm } } });
		const workspace = { getLeavesOfType: () => [leaf('Note.md', 'source', mine), leaf('Other.md', 'source', other), leaf('Note.md', 'preview', reading)] };
		hold.captureViewsOf(workspace as never, 'Note.md');
		expect(mine.scrollSnapshot).toHaveBeenCalledTimes(1);
		expect(other.scrollSnapshot).not.toHaveBeenCalled();
		expect(reading.scrollSnapshot).not.toHaveBeenCalled();
	});
});

describe('SC-478: LivePreviewScrollHold hold', () => {
	test('a block drawn after PIN_TTL_MS is not held (the pending entry expired)', () => {
		jest.useFakeTimers();
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3500, [widget(637, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view));
		jest.advanceTimersByTime(TTL);
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const late = widget(637, 50, false);
		view.contentDOM.appendChild(late);
		hold.applyHolds(view as never);
		expect(late.hasAttribute(HOLD_ATTR)).toBe(false);
	});

	test('holds the replacement widget drawn empty at the old height (position mapped through the change), released on mount', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3500, [widget(637, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view, 'set', shift(0)));
		// CodeMirror writes the DOM: the old widget is replaced by an empty one at the same position.
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const fresh = widget(637, 50, false);
		view.contentDOM.appendChild(fresh);
		hold.applyHolds(view as never);
		expect(fresh.getAttribute(HOLD_ATTR)).toBe('3039');
		expect(fresh.style.minHeight).toBe('3039px');
		// our view mounts
		fresh.querySelector('[data-dse-element]')!.appendChild(document.createElement('div'));
		await flush();
		expect(fresh.hasAttribute(HOLD_ATTR)).toBe(false);
		expect(fresh.style.minHeight).toBe('');
		expect(view.requestMeasure).toHaveBeenCalled();
	});

	test('does not hold a mounted widget, a widget at another position, or anything without a pending capture', () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3500, [widget(637, 3039)]);
		// another embed (not ours) at 2000: never captured, so never held even though it has no mounted DSE root
		const elsewhere = document.createElement('div');
		elsewhere.className = 'cm-embed-block cm-lang-mermaid';
		(elsewhere as unknown as { __pos: number }).__pos = 2000;
		view.contentDOM.appendChild(elsewhere);
		hold.applyHolds(view as never); // nothing pending
		expect(elsewhere.hasAttribute(HOLD_ATTR)).toBe(false);
		hold.capture(view as never, note());
		hold.onUpdate(update(view));
		hold.applyHolds(view as never);
		expect(elsewhere.hasAttribute(HOLD_ATTR)).toBe(false); // 2000 was not a captured DSE block
		expect(view.contentDOM.querySelector('[data-dse-element]')!.closest('.cm-embed-block')!.hasAttribute(HOLD_ATTR)).toBe(false); // mounted
	});

	test('a hold that never sees a mount is released after PIN_TTL_MS; releaseAll() drops the rest', () => {
		jest.useFakeTimers();
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3500, [widget(637, 3039), widget(900, 800)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view));
		for (const w of Array.from(view.contentDOM.querySelectorAll('.cm-embed-block'))) w.remove();
		const a = widget(637, 50, false);
		const b = widget(900, 50, false);
		view.contentDOM.append(a, b);
		hold.applyHolds(view as never);
		expect(a.hasAttribute(HOLD_ATTR) && b.hasAttribute(HOLD_ATTR)).toBe(true);
		hold.releaseAll();
		expect(a.hasAttribute(HOLD_ATTR) || b.hasAttribute(HOLD_ATTR)).toBe(false);
		// TTL path
		hold.capture(fakeView(3500, [widget(637, 3039)]) as never, note()); // unrelated view, unaffected
		const view2 = fakeView(3500, [widget(637, 3039)]);
		hold.capture(view2 as never, note());
		hold.onUpdate(update(view2));
		view2.contentDOM.querySelector('.cm-embed-block')!.remove();
		const c = widget(637, 50, false);
		view2.contentDOM.appendChild(c);
		hold.applyHolds(view2 as never);
		expect(c.hasAttribute(HOLD_ATTR)).toBe(true);
		jest.advanceTimersByTime(TTL);
		expect(c.hasAttribute(HOLD_ATTR)).toBe(false);
	});
});

describe('SC-478: LivePreviewScrollHold CodeMirror extension', () => {
	/** The ViewPlugin's value for a view, as CodeMirror creates it (ViewPlugin.define keeps its `create`). */
	const pluginFor = (hold: LivePreviewScrollHold, view: View) =>
		(hold.extension() as unknown as { create: (v: View) => { update: (u: never) => void; docViewUpdate: (v: View) => void; destroy: () => void } }).create(view);

	test('update -> restore after the update; docViewUpdate -> hold the empty replacement widget', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3500, [widget(637, 3039)]);
		const plugin = pluginFor(hold, view);
		hold.capture(view as never, note());
		plugin.update(update(view));
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const fresh = widget(637, 50, false);
		view.contentDOM.appendChild(fresh);
		plugin.docViewUpdate(view);
		expect(fresh.getAttribute(HOLD_ATTR)).toBe('3039');
		await flush();
		expect(view.dispatch).toHaveBeenCalledTimes(1);
	});

	test('destroy (CodeMirror destroys every ViewPlugin on setState, i.e. when a file is loaded into the leaf) drops the capture', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(2428, [widget(7, 5230)]);
		const plugin = pluginFor(hold, view);
		hold.capture(view as never, note());
		plugin.destroy();
		plugin.update(update(view));
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
	});

	test('destroy drops a pending restore and releases a live hold', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3500, [widget(637, 3039)]);
		const plugin = pluginFor(hold, view);
		hold.capture(view as never, note());
		plugin.update(update(view)); // restore queued in a microtask
		plugin.destroy();
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const fresh = widget(637, 50, false);
		view.contentDOM.appendChild(fresh);
		plugin.docViewUpdate(view); // nothing pending any more: no hold
		expect(fresh.hasAttribute(HOLD_ATTR)).toBe(false);
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
		// a hold that is already on
		hold.capture(view as never, note());
		hold.onUpdate(update(view));
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const held = widget(637, 50, false);
		view.contentDOM.appendChild(held);
		hold.applyHolds(view as never);
		expect(held.hasAttribute(HOLD_ATTR)).toBe(true);
		plugin.destroy();
		expect(held.hasAttribute(HOLD_ATTR)).toBe(false);
	});
});

describe('SC-478: wiring', () => {
	test('registerFrameworkElements captures on `modify` and registers the editor extension', () => {
		const app = new App();
		const plugin = new Plugin(app);
		plugin.load();
		const on = jest.spyOn(app.vault, 'on');
		const ext = jest.spyOn(plugin, 'registerEditorExtension');
		const spy = jest.spyOn(LivePreviewScrollHold.prototype, 'captureViewsOf').mockImplementation(() => {});
		try {
			const registry: ElementRegistry = { register: () => undefined as never, get: () => undefined, all: () => [] };
			registerFrameworkElements(plugin as any, { registry, pipeline: {} as ElementPipeline });
			expect(ext).toHaveBeenCalledTimes(1);
			const calls = on.mock.calls.filter(([name]) => name === 'modify');
			for (const call of calls) (call[1] as (file: { path: string }) => void)({ path: 'Note.md' });
			expect(spy).toHaveBeenCalledWith(app.workspace, 'Note.md');
		} finally {
			spy.mockRestore();
			ext.mockRestore();
			on.mockRestore();
		}
	});
});
