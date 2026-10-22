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
function widget(pos: number, px: number, mounted = true, lang = 'cm-lang-ds-initiative'): HTMLElement {
	const w = document.createElement('div');
	w.className = `cm-preview-code-block cm-embed-block ${lang}`.trim();
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
	// the snapshot is where the view is scrolled to when it is taken, so a re-capture after a scroll is visible
	const snapshotAt = (top: number): FakeEffect => {
		const mapped: FakeEffect = { tag: `snap-mapped@${top}`, map: () => mapped };
		return { tag: `snap@${top}`, map: () => mapped };
	};
	return {
		scrollDOM,
		contentDOM,
		scrollSnapshot: jest.fn(() => snapshotAt(scrollDOM.scrollTop)),
		posAtDOM: (el: HTMLElement) => (el as HTMLElement & { __pos?: number }).__pos ?? 0,
		dispatch: jest.fn(),
		requestMeasure: jest.fn(),
	};
}

type View = ReturnType<typeof fakeView>;
/**
 * ChangeSet.mapPos for ONE change that replaces [from, to] with `len` characters, with CodeMirror's assoc semantics:
 * a position at the start of the range stays before the new text for assoc <= 0, a position at the end of the range
 * goes after it for assoc >= 0, and a position strictly inside goes to the start (assoc < 0) or the end (assoc > 0).
 */
const change = (from: number, to: number, len: number) => ({
	mapPos(pos: number, assoc = -1): number {
		if (pos < from) return pos;
		if (pos > to) return pos + len - (to - from);
		if (pos === from && assoc <= 0) return from;
		if (pos === to && assoc >= 0) return from + len;
		return assoc < 0 ? from : from + len;
	},
});
/** An insertion of `by` characters at position 5 (the tests' blocks sit past it). */
const shift = (by: number) => change(5, 5, by);
/** A ViewUpdate: doc changed by Obsidian's setViewData (`userEvent: "set"`) unless `event` says otherwise. */
const update = (view: View, event = 'set', changes: ReturnType<typeof change> = shift(0)) =>
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
		expect(view.dispatch).toHaveBeenCalledWith({ effects: expect.objectContaining({ tag: 'snap-mapped@2428' }) });
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

	test('a scroll event moves the capture along: the late `set` transaction restores to where the user scrolled to', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(7, 3039)]);
		hold.capture(view as never, note());
		view.scrollDOM.scrollTop = 2620; // the user wheels up in the gap before the (late) transaction
		hold.refresh(view as never);
		expect(view.scrollSnapshot).toHaveBeenCalledTimes(2);
		hold.onUpdate(update(view));
		await flush();
		expect(view.dispatch).toHaveBeenCalledWith({ effects: expect.objectContaining({ tag: 'snap-mapped@2620' }) });
	});

	test('a scroll to the very top, or away from every DSE block, drops the capture instead of refreshing it', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(7, 3039)]);
		hold.capture(view as never, note());
		view.scrollDOM.scrollTop = 0;
		hold.refresh(view as never);
		hold.onUpdate(update(view));
		const away = fakeView(3020, [widget(7, 3039)]);
		hold.capture(away as never, note());
		away.contentDOM.querySelector('.cm-embed-block')!.remove(); // CodeMirror no longer draws the block
		away.scrollDOM.scrollTop = 9000;
		hold.refresh(away as never);
		hold.onUpdate(update(away));
		await flush();
		expect(view.dispatch).not.toHaveBeenCalled();
		expect(away.dispatch).not.toHaveBeenCalled();
	});

	test('nothing is refreshed once the transaction consumed the capture (the restore\'s and the clamp\'s scroll events)', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(7, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view)); // consumed: restore pending
		view.scrollDOM.scrollTop = 2556; // Obsidian's clamp
		hold.refresh(view as never);
		hold.onUpdate(update(view)); // a later set must not find a fresh capture
		await flush();
		expect(view.scrollSnapshot).toHaveBeenCalledTimes(1);
		expect(view.dispatch).toHaveBeenCalledTimes(1);
		expect(view.dispatch).toHaveBeenCalledWith({ effects: expect.objectContaining({ tag: 'snap-mapped@3020' }) });
		const none = fakeView(3020, [widget(7, 3039)]);
		hold.refresh(none as never); // a view that was never captured
		expect(none.scrollSnapshot).not.toHaveBeenCalled();
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

	test('a write that inserts text right at the fence start and changes the tracker still holds the replacement (it starts after the insertion)', () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(637, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view, 'set', change(637, 637, 16))); // "INSERTED LINE.\n\n" at the old start
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const fresh = widget(653, 50, false);
		view.contentDOM.appendChild(fresh);
		hold.applyHolds(view as never);
		expect(fresh.getAttribute(HOLD_ATTR)).toBe('3039');
	});

	test('a replacement that starts inside the range the write rewrote is held; one past the rewritten range is not', () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(637, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view, 'set', change(600, 700, 30))); // [600,700] becomes 30 characters: the old start is inside it
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const inside = widget(615, 50, false);
		const beyond = widget(900, 50, false);
		view.contentDOM.append(inside, beyond);
		hold.applyHolds(view as never);
		expect(inside.getAttribute(HOLD_ATTR)).toBe('3039');
		expect(beyond.hasAttribute(HOLD_ATTR)).toBe(false);
	});

	test('a later doc change before the replacement is drawn moves the positions to hold along with it', () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(637, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view));
		hold.onUpdate(update(view, 'input.type', change(0, 0, 10))); // ten characters typed above the block
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const fresh = widget(647, 50, false);
		view.contentDOM.appendChild(fresh);
		hold.applyHolds(view as never);
		expect(fresh.getAttribute(HOLD_ATTR)).toBe('3039');
	});

	test('only a replacement of the same language is held: a callout or another embed that slid into the slot never is', () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(637, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view)); // the tracker's fence was deleted by the write
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const callout = widget(637, 90, false, ''); // an empty embed (no DSE root mounted) with no cm-lang-ds class
		callout.className = 'cm-embed-block cm-callout';
		const other = widget(637, 90, false, 'cm-lang-mermaid');
		view.contentDOM.append(callout, other);
		hold.applyHolds(view as never);
		expect(callout.hasAttribute(HOLD_ATTR) || other.hasAttribute(HOLD_ATTR)).toBe(false);
		const tracker = widget(637, 50, false);
		view.contentDOM.appendChild(tracker);
		hold.applyHolds(view as never);
		expect(tracker.getAttribute(HOLD_ATTR)).toBe('3039');
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

	test('a `scroll` event observer on the plugin refreshes the capture (the user scrolled in the gap)', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(637, 3039)]);
		const observers = (hold.extension() as unknown as { domEventObservers?: Record<string, (e: Event, v: View) => void> }).domEventObservers;
		expect(typeof observers?.scroll).toBe('function');
		hold.capture(view as never, note());
		view.scrollDOM.scrollTop = 2620;
		observers!.scroll(new Event('scroll'), view);
		hold.onUpdate(update(view));
		await flush();
		expect(view.dispatch).toHaveBeenCalledWith({ effects: expect.objectContaining({ tag: 'snap-mapped@2620' }) });
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
	test('registerFrameworkElements releases every hold when the plugin unloads', () => {
		const app = new App();
		const plugin = new Plugin(app);
		plugin.load();
		const release = jest.spyOn(LivePreviewScrollHold.prototype, 'releaseAll');
		try {
			const registry: ElementRegistry = { register: () => undefined as never, get: () => undefined, all: () => [] };
			registerFrameworkElements(plugin as any, { registry, pipeline: {} as ElementPipeline });
			expect(release).not.toHaveBeenCalled();
			plugin.unload();
			expect(release).toHaveBeenCalledTimes(1);
		} finally {
			release.mockRestore();
		}
	});

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
