// SC-478 — LivePreviewScrollHold: a Live Preview pane keeps its reading position when a DSE block in it is
// redrawn by a write (another pane, Sync/git/another plugin, or the pane's own).
//
// jsdom has no CodeMirror layout, so the EditorView is a duck-typed fake carrying exactly what the module
// reads: scrollDOM.scrollTop, contentDOM's children, scrollSnapshot(), posAtDOM(), dispatch(), requestMeasure().
// The real behaviour (Obsidian's 50px widget estimate, the viewport jump, the restore) is the lifecycle gate's
// job (G-S18); these tests pin the guards: when it captures, when it engages, that it never engages on a user's
// own edit or after a user scroll, and that every hold is released (mount, TTL, destroy, unload).
import { EMBED_HOLD_ATTR, HOLD_ATTR, LivePreviewScrollHold } from '../../../src/framework/host/livePreviewScrollHold';
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
 * ChangeSet (mapPos + iterChanges) for ONE change that replaces [from, to] with `len` characters, with CodeMirror's
 * assoc semantics: for a pure insertion (from === to) a position at it lands before the new text for assoc < 0 and
 * after it otherwise; for a replacement a position at its start stays at the start whatever the assoc, a position
 * strictly inside goes to the start (assoc < 0) or the end (assoc > 0), a position at its end goes after the new text.
 */
const change = (from: number, to: number, len: number) => ({
	mapPos(pos: number, assoc = -1): number {
		if (pos < from) return pos;
		if (to > from) {
			// a replacement/deletion: a position at its start stays at the start whatever the assoc
			if (pos < to) return pos === from || assoc < 0 ? from : from + len;
			return pos + len - (to - from);
		}
		// a pure insertion at `from`: assoc decides which side of the new text a position at `from` lands on
		if (pos === from) return assoc < 0 ? from : from + len;
		return pos + len;
	},
	iterChanges(cb: (fromA: number, toA: number, fromB: number, toB: number) => void): void {
		cb(from, to, from, from + len);
	},
});
/**
 * A ChangeSet of several changes, each given in ORIGINAL-document coordinates and sorted (as CodeMirror's are), e.g. a write
 * that rewrites the tracker and, far below it, edits something else. `iterChanges` reports each change's new range too.
 */
const changes = (...cs: Array<[number, number, number]>): ReturnType<typeof change> => ({
	mapPos(pos: number, assoc = -1): number {
		let off = 0;
		for (const [from, to, len] of cs) {
			if (pos > to) {
				off += len - (to - from);
				continue;
			}
			return off + change(from, to, len).mapPos(pos, assoc);
		}
		return pos + off;
	},
	iterChanges(cb: (fromA: number, toA: number, fromB: number, toB: number) => void): void {
		let off = 0;
		for (const [from, to, len] of cs) {
			cb(from, to, from + off, from + off + len);
			off += len - (to - from);
		}
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

	test('insert above the fence AND change the tracker in one write (one replacement from the old start; measured [478,1538] -> [478,1554], widget at 494)', () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(478, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view, 'set', change(478, 1538, 1076)));
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const fresh = widget(494, 50, false);
		view.contentDOM.appendChild(fresh);
		hold.applyHolds(view as never);
		expect(fresh.getAttribute(HOLD_ATTR)).toBe('3039');
	});

	test('a second change far after the block does not widen the interval: a same-language widget down there is not held', () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(600, 3039)]);
		hold.capture(view as never, note());
		// the write rewrites [600,700] -> 30 characters (the tracker) AND inserts 20 characters at 5000, far below it
		hold.onUpdate(update(view, 'set', changes([600, 700, 30], [5000, 5000, 20])));
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const redrawn = widget(615, 50, false);
		const farBelow = widget(1930, 50, false); // another tracker (same language), mapped start 2000 - 70, inside the WIDENED interval [600, 4950]
		view.contentDOM.append(redrawn, farBelow);
		hold.applyHolds(view as never);
		expect(redrawn.getAttribute(HOLD_ATTR)).toBe('3039');
		expect(farBelow.hasAttribute(HOLD_ATTR)).toBe(false);
	});

	test('a widget that is already held is not held a second time (one release, one requestMeasure)', async () => {
		const hold = new LivePreviewScrollHold();
		const view = fakeView(3020, [widget(637, 3039)]);
		hold.capture(view as never, note());
		hold.onUpdate(update(view));
		view.contentDOM.querySelector('.cm-embed-block')!.remove();
		const fresh = widget(637, 50, false);
		view.contentDOM.appendChild(fresh);
		hold.applyHolds(view as never);
		hold.applyHolds(view as never); // the next docViewUpdate before our view mounts
		fresh.querySelector('[data-dse-element]')!.appendChild(document.createElement('div'));
		await flush();
		expect(fresh.hasAttribute(HOLD_ATTR)).toBe(false);
		expect(view.requestMeasure).toHaveBeenCalledTimes(1);
	});

	test('a write that inserts text right at the fence start still holds the replacement (it starts after the insertion)', () => {
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
			expect(ext).toHaveBeenCalledTimes(2); // the scroll hold's, and SC-537's update listener (livePreviewReconcile.ts)
			const calls = on.mock.calls.filter(([name]) => name === 'modify');
			for (const call of calls) (call[1] as (file: { path: string }) => void)({ path: 'Note.md' });
			// SC-522: with the link resolver, so Live Preview hosts of the note's embeds are held too
			expect(spy).toHaveBeenCalledWith(app.workspace, 'Note.md', expect.any(Function));
		} finally {
			spy.mockRestore();
			ext.mockRestore();
			on.mockRestore();
		}
	});
});

describe('SC-522: a Live Preview host holds its embed of the written note', () => {
	/** A Live Preview embed widget of `src`, as Obsidian draws it: `.internal-embed[src]`, a direct `.cm-content` child, holding a DSE root (or not). */
	function embedWidget(src: string, px: number, opts: { dse?: boolean; nested?: string } = {}): HTMLElement {
		const e = document.createElement('div');
		e.className = 'internal-embed markdown-embed inline-embed';
		e.setAttribute('src', src);
		let at: HTMLElement = e.appendChild(document.createElement('div'));
		at.className = 'markdown-embed-content';
		if (opts.nested) {
			const n = at.appendChild(document.createElement('span'));
			n.className = 'internal-embed markdown-embed';
			n.setAttribute('src', opts.nested);
			at = n;
		}
		if (opts.dse !== false) {
			const root = at.appendChild(document.createElement('div'));
			root.setAttribute('data-dse-element', 'initiative');
			root.appendChild(document.createElement('div'));
		}
		e.getBoundingClientRect = () => ({ height: px }) as DOMRect;
		return e;
	}
	/** Resolves `link` from `from` by an exact "from|link" entry, else by `link` alone. */
	const resolver = (map: Record<string, string>) => jest.fn((link: string, from: string) => map[`${from}|${link}`] ?? map[link] ?? null);
	const lpLeaf = (path: string, cm: unknown, mode = 'source') => ({ view: { file: { path }, getMode: () => mode, editor: { cm } } });
	const held = (e: HTMLElement) => e.getAttribute(EMBED_HOLD_ATTR);

	test('only the drawn embed widgets that show a DSE block of the written note are held, at their height', () => {
		const hold = new LivePreviewScrollHold();
		const ofB = embedWidget('B', 3190);
		const ofC = embedWidget('C', 800);
		const plainB = embedWidget('B', 400, { dse: false });
		const host = fakeView(6800, [ofB, ofC, plainB]);
		const own = fakeView(2428, [widget(7, 5230)]);
		const workspace = { getLeavesOfType: () => [lpLeaf('A.md', host), lpLeaf('B.md', own)] };
		hold.captureViewsOf(workspace as never, 'B.md', resolver({ B: 'B.md', C: 'C.md' }));
		expect(held(ofB)).toBe('3190');
		expect(ofB.style.minHeight).toBe('3190px');
		expect(held(ofC)).toBeNull();
		expect(held(plainB)).toBeNull();
		expect(ofC.style.minHeight).toBe('');
		expect(own.scrollSnapshot).toHaveBeenCalledTimes(1); // the note's own Live Preview view: SC-478's capture, unchanged
	});

	test('the floor is the embed\'s content box: padding and border come off, unless the theme sets border-box', () => {
		const hold = new LivePreviewScrollHold();
		const content = embedWidget('B', 3190);
		content.style.padding = '10px 0';
		content.style.border = '2px solid';
		const border = embedWidget('B', 3190);
		border.style.padding = '10px 0';
		border.style.border = '2px solid';
		border.style.boxSizing = 'border-box';
		hold.captureViewsOf({ getLeavesOfType: () => [lpLeaf('A.md', fakeView(6800, [content, border]))] } as never, 'B.md', resolver({ B: 'B.md' }));
		expect(content.style.minHeight).toBe('3166px'); // 3190 - 2 * (10 + 2)
		expect(border.style.minHeight).toBe('3190px');
	});

	test('nothing is held without a resolver, at the top of the host, or in a Reading view', () => {
		const hold = new LivePreviewScrollHold();
		const a = embedWidget('B', 3190);
		const b = embedWidget('B', 3190);
		const c = embedWidget('B', 3190);
		hold.captureViewsOf({ getLeavesOfType: () => [lpLeaf('A.md', fakeView(6800, [a]))] } as never, 'B.md');
		hold.captureViewsOf({ getLeavesOfType: () => [lpLeaf('A.md', fakeView(0, [b]))] } as never, 'B.md', resolver({ B: 'B.md' }));
		hold.captureViewsOf({ getLeavesOfType: () => [lpLeaf('A.md', fakeView(6800, [c]), 'preview')] } as never, 'B.md', resolver({ B: 'B.md' }));
		expect([held(a), held(b), held(c)]).toEqual([null, null, null]);
	});

	test('a nested embed (A -> N -> B, resolved from N) and a #heading embed count', () => {
		const hold = new LivePreviewScrollHold();
		const nested = embedWidget('N', 3341, { nested: 'B' });
		const heading = embedWidget('B#Section', 3166);
		const resolve = resolver({ 'A.md|N': 'N.md', 'N.md|B': 'B.md', 'A.md|B': 'B.md' });
		hold.captureViewsOf({ getLeavesOfType: () => [lpLeaf('A.md', fakeView(6800, [nested, heading]))] } as never, 'B.md', resolve);
		expect(held(nested)).toBe('3341');
		expect(held(heading)).toBe('3166');
		expect(resolve).toHaveBeenCalledWith('B', 'N.md'); // the inner link is resolved from the note that writes it
	});

	test('released as soon as a fresh view has mounted in the embed, not while it is still empty', async () => {
		const hold = new LivePreviewScrollHold();
		const e = embedWidget('B', 3190);
		const host = fakeView(6800, [e]);
		hold.holdEmbedsOf(host as never, 'B.md', 'A.md', resolver({ B: 'B.md' }));
		expect(held(e)).toBe('3190');
		const content = e.querySelector('.markdown-embed-content')!;
		content.querySelector('[data-dse-element]')!.remove(); // Obsidian empties the embed
		const fresh = content.appendChild(document.createElement('div'));
		fresh.setAttribute('data-dse-element', 'initiative');
		await flush();
		await flush();
		expect(held(e)).toBe('3190'); // our root is there but empty: still held
		expect(host.requestMeasure).not.toHaveBeenCalled();
		fresh.appendChild(document.createElement('div'));
		await flush();
		await flush();
		expect(held(e)).toBeNull();
		expect(e.style.minHeight).toBe('');
		expect(host.requestMeasure).toHaveBeenCalledTimes(1); // CodeMirror re-measures the real height
	});

	test('released when the held view is put back (an adopted write)', async () => {
		const hold = new LivePreviewScrollHold();
		const e = embedWidget('B', 3190);
		hold.holdEmbedsOf(fakeView(6800, [e]) as never, 'B.md', 'A.md', resolver({ B: 'B.md' }));
		const root = e.querySelector('[data-dse-element]')!;
		const section = e.querySelector('.markdown-embed-content')!.appendChild(document.createElement('div'));
		section.appendChild(root); // moved into the new section, same element
		await flush();
		await flush();
		expect(held(e)).toBeNull();
	});

	test('PIN_TTL_MS backstop, a re-hold never lowers the floor, an inline min-height is restored, unload drops every hold', () => {
		jest.useFakeTimers();
		const hold = new LivePreviewScrollHold();
		const e = embedWidget('B', 3190);
		e.style.minHeight = '20px';
		const host = fakeView(6800, [e]);
		hold.holdEmbedsOf(host as never, 'B.md', 'A.md', resolver({ B: 'B.md' }));
		// the first write's redraw has replaced the root with a new, still empty one: the embed is collapsed
		const old = e.querySelector('[data-dse-element]')!;
		const empty = document.createElement('div');
		empty.setAttribute('data-dse-element', 'initiative');
		old.replaceWith(empty);
		e.getBoundingClientRect = () => ({ height: 135 }) as DOMRect; // a second write lands now
		hold.holdEmbedsOf(host as never, 'B.md', 'A.md', resolver({ B: 'B.md' }));
		expect(held(e)).toBe('3190');
		jest.advanceTimersByTime(TTL - 1);
		expect(held(e)).toBe('3190');
		jest.advanceTimersByTime(1);
		expect(held(e)).toBeNull();
		expect(e.style.minHeight).toBe('20px');
		const f = embedWidget('B', 900);
		hold.holdEmbedsOf(fakeView(6800, [f]) as never, 'B.md', 'A.md', resolver({ B: 'B.md' }));
		expect(held(f)).toBe('900');
		hold.releaseAll();
		expect(held(f)).toBeNull();
		expect(f.style.minHeight).toBe('');
	});
	// SC-522 r4 (LOW-1): a redraw that brings no fresh view of ours must not leave the floor up for the TTL, and a redraw that
	// replaces ONE of two roots must not release it early. Shapes measured in Obsidian 1.15.0 (R4-MUT): a rewritten block is
	// `el-pre` removed + `el-pre` with an EMPTY root added in one batch; a deleted block is one batch with a removal only.
	describe('release without a fresh view', () => {
		const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
		/** An embed of B with `n` sections, each an `.el-pre` holding one mounted root; sections[i] / roots[i]. */
		function twoBlocks(n = 2) {
			const e = embedWidget('B', 3437, { dse: false });
			const content = e.querySelector('.markdown-embed-content')!;
			const section = (): { el: HTMLElement; root: HTMLElement } => {
				const el = document.createElement('div');
				el.className = 'el-pre';
				const root = el.appendChild(document.createElement('div'));
				root.setAttribute('data-dse-element', 'initiative');
				root.appendChild(document.createElement('div'));
				return { el, root };
			};
			const parts = Array.from({ length: n }, () => section());
			for (const p of parts) content.appendChild(p.el);
			return { e, content, parts, section };
		}
		const holdIt = (e: HTMLElement) => {
			const hold = new LivePreviewScrollHold();
			const host = fakeView(7047, [e]);
			hold.holdEmbedsOf(host as never, 'B.md', 'A.md', resolver({ B: 'B.md' }));
			return { hold, host };
		};

		test('a block deleted from B (one of two sections removed, nothing added) releases one task after the redraw', async () => {
			const { e, content, parts } = twoBlocks();
			const { host } = holdIt(e);
			expect(held(e)).toBe('3437');
			content.removeChild(parts[1].el);
			await sleep(0);
			await flush();
			await sleep(5);
			expect(held(e)).toBeNull();
			expect(e.style.minHeight).toBe('');
			expect(host.requestMeasure).toHaveBeenCalledTimes(1);
		});

		test('a paragraph removed from B (nothing of ours touched) releases the same way', async () => {
			const { e, content, parts } = twoBlocks(1);
			const para = content.insertBefore(document.createElement('div'), parts[0].el);
			para.className = 'el-p';
			const { host } = holdIt(e);
			content.removeChild(para);
			await flush();
			await sleep(5);
			expect(held(e)).toBeNull();
			expect(host.requestMeasure).toHaveBeenCalledTimes(1);
		});

		test('a write to ONE of two blocks is not released early: the new root is empty in the same batch as the removal', async () => {
			const { e, content, parts, section } = twoBlocks();
			const { host } = holdIt(e);
			const fresh = section();
			fresh.root.replaceChildren(); // Obsidian adds the section with our root empty; our view mounts ~40 ms later
			content.replaceChild(fresh.el, parts[0].el);
			await flush();
			await sleep(5);
			expect(held(e)).toBe('3437'); // the other root is connected and mounted, the written one is not
			expect(host.requestMeasure).not.toHaveBeenCalled();
			fresh.root.appendChild(document.createElement('div')); // our view is in
			await flush();
			await flush();
			expect(held(e)).toBeNull();
		});

		test('a removal that is only the first half of a replacement in the same task does not release', async () => {
			const { e, content, parts, section } = twoBlocks();
			holdIt(e);
			content.removeChild(parts[0].el);
			await flush(); // the removal batch is delivered: the other root is mounted, the release is scheduled for the next task
			const fresh = section();
			fresh.root.replaceChildren();
			content.insertBefore(fresh.el, parts[1].el); // the replacement follows in the same task
			await flush();
			await sleep(5);
			expect(held(e)).toBe('3437');
		});

		test('mutations inside our own roots are not a redraw of the embed', async () => {
			const { e, parts } = twoBlocks();
			holdIt(e);
			const inner = parts[0].root.firstElementChild as HTMLElement;
			parts[0].root.removeChild(inner); // our own view re-rendering itself
			parts[0].root.appendChild(document.createElement('div'));
			await flush();
			await sleep(5);
			expect(held(e)).toBe('3437');
		});

		test('a re-hold lowers the floor to the true height while every held root is still in place', () => {
			const { e } = twoBlocks();
			const hold = new LivePreviewScrollHold();
			const host = fakeView(7047, [e]);
			hold.holdEmbedsOf(host as never, 'B.md', 'A.md', resolver({ B: 'B.md' }));
			e.getBoundingClientRect = () => ({ height: 1806 }) as DOMRect; // the embed has shrunk for another reason, no root removed
			hold.holdEmbedsOf(host as never, 'B.md', 'A.md', resolver({ B: 'B.md' }));
			expect(held(e)).toBe('1806');
			hold.releaseAll();
		});
	});
});
