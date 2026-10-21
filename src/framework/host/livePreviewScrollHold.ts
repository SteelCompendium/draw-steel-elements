// SC-478 — LivePreviewScrollHold: keep a Live Preview pane's reading position when a DSE block in
// it is redrawn by a write from another pane, from outside the app (Sync, git, another plugin) or
// from the pane itself. The Reading-view pin (previewScrollPin.ts) does not apply: Live Preview
// scrolls a CodeMirror `.cm-scroller`, and the loss has a different mechanism.
//
// THE MECHANISM (measured, Obsidian 1.14.4, SC-478 r1). On every such write Obsidian calls
// `setViewData(data, false)`, which dispatches ONE transaction with a minimal diff (`userEvent:
// "set"`; a one-character edit is one 1-char change; a plain note never moves). The changed fence
// gets a NEW Obsidian code-block widget whose `eq()` is always false and whose `estimatedHeight`
// is a constant 50px, so inside that very update CodeMirror's height map shrinks the block from
// its measured height (3039-6438px in the measurements) to 50px and recomputes the viewport from
// the unchanged scrollTop over the shrunken map. The viewport therefore lands on content far
// BELOW the block (or past the end of the note) and the block itself is not drawn at all:
//   - viewport on a note that is mostly one tracker: scrollHeight falls to clientHeight, the
//     browser clamps scrollTop (2428 -> 0, 3032 -> 0), and when the block is drawn again and
//     regrows nothing scrolls back;
//   - viewport on a tracker with text below it, or below the tracker: scrollTop is unchanged or
//     clamped a little (3500 -> 3500, 5238 -> 4956), but the content under it is ~110-240 lines
//     further down the note, and the tracker stays at 50px until the user scrolls back up to it;
//   - viewport above the tracker: nothing visible moves (heights above it are unchanged).
// Nothing calls scrollIntoView, moves focus or the selection; CodeMirror's own scroll anchoring
// cannot help, because it re-anchors at the already-clamped position.
//
// THE FIX, IN TWO PARTS (both needed — each alone was measured to fail):
//  1. CAPTURE at the vault `modify` event (which fires 1-13 ms before the view's transaction on
//     every path: our own write, `vault.process`/`modify`, a disk write picked up by the file
//     watcher; SC-470 measured the same for Reading views): for every Live Preview view of the
//     note that shows a DSE widget and is scrolled, CodeMirror's own `scrollSnapshot()` (the
//     top visible line block + offset — content, not pixels) and each DSE widget's document
//     position and current height.
//  2. On that view's next doc-changing update, IF it is Obsidian's `set` transaction and the user
//     has not scrolled since the capture: (a) RESTORE — dispatch the snapshot (mapped through the
//     change) as an effects-only transaction, so CodeMirror puts the viewport back around the
//     line the user was reading and draws the replaced block; (b) HOLD — when the replacement
//     widget is drawn still empty (our view mounts asynchronously), give it an inline
//     `min-height` of the old block's height in `docViewUpdate` (after CodeMirror writes the DOM,
//     before it measures), so the height map records the real height and the restore lands
//     exactly. The hold drops as soon as our view has mounted (MutationObserver), or after
//     PIN_TTL_MS. If the block's real height changed (a row added), CodeMirror re-measures it
//     like any resized widget: above the viewport its anchoring keeps the visible line in place;
//     with the viewport inside the block the pixel offset into the block is kept.
//
// SAFETY. Only views that showed a DSE widget at capture time are touched. Never focus, never the
// selection: the restore is an effects-only `scrollIntoView` snapshot. Never against the user:
// a capture is dropped if scrollTop moved before the transaction, and it is consumed by the
// first doc change whatever it is, so a user's own edit (any userEvent other than "set") never
// triggers a restore. Popouts: the MutationObserver and timers come from the widget's own window.
// Unload: `releaseAll()` (plugin.register) and the ViewPlugin's `destroy` drop every hold.
//
// A CAPTURE BELONGS TO ONE NOTE. There is no TTL on a capture (the second Live Preview pane's
// transaction was measured 2.47 s after `modify` while the main thread was busy; SC-472), so its
// lifetime is bound by identity instead: it records the path it was taken for and is dropped if the
// view's file is no longer that path when a transaction arrives. Measured (Obsidian 1.14.4, SC-478
// r2; `openFile`, `setViewState`, `openLinkText`, history back, to a tracker note and to a plain
// one): a different file loaded into a Live Preview leaf is the SAME MarkdownView and the SAME
// EditorView — `onLoadFile` then `setViewData(data, clear=true)`, which ends in
// `EditorView.setState(newState)`: no doc-changing transaction at all, every ViewPlugin is destroyed
// and re-created (so `destroy` -> `forget` already drops the capture, pending restore and holds:
// capture present before the load, absent after, 5/5 navigations), `view.file` is the new path before
// the first update, and Obsidian resets scrollTop to 0. The explicit path check covers any
// navigation that would arrive as a `set` transaction on the same editor instead.
//
// DEPENDENCY, ACCEPTED. The restore engages only on a doc-changing transaction whose every
// userEvent is "set" — Obsidian's `setViewData` annotation (measured on every write path). That is
// Obsidian's behaviour, not API: if a future version drops or renames it, the hold silently stops
// engaging; lifecycle gate G-S18 fails when that happens.
// Not touched: a DSE block CodeMirror has not drawn (far above or below the viewport) has no widget
// in the DOM, so nothing is captured — and the pane was measured to hold anyway (stock and here).

import type { Workspace } from 'obsidian';
import { ViewPlugin } from '@codemirror/view';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension, StateEffect } from '@codemirror/state';
import { PIN_TTL_MS } from './previewScrollPin';

/** On a replacement widget while its height is held; the value is the held px (tests/probes read it). */
export const HOLD_ATTR = 'data-dse-lp-hold';

/** A DSE block's widget as CodeMirror drew it: a direct `.cm-content` child holding our root. */
interface WidgetAt {
	pos: number;
	px: number;
}

interface Capture {
	/** The note the capture was taken for, and the view whose `file` is checked against it when the transaction arrives. */
	path: string;
	owner: LivePreviewViewLike;
	scrollTop: number;
	snapshot: StateEffect<unknown>;
	widgets: WidgetAt[];
}

interface Pending {
	/** The restore not dispatched yet (mapped through every doc change until it is). */
	restore: StateEffect<unknown> | null;
	/** Positions (in the CURRENT document) and old heights of the blocks to hold when drawn empty. */
	widgets: WidgetAt[];
	/** Drops this entry after PIN_TTL_MS: a block drawn later than that is not held. */
	timer: number;
	win: Window;
}

/** The slice of MarkdownView this module reads (duck-typed: the jest mock has no MarkdownView). */
interface LivePreviewViewLike {
	file?: { path: string } | null;
	getMode?: () => string;
	editor?: { cm?: EditorView };
}

/** Every direct `.cm-content` child that is an embed widget (Obsidian's code-block widget is `.cm-embed-block`). */
function embedWidgets(view: EditorView): HTMLElement[] {
	return Array.from(view.contentDOM.children).filter((el): el is HTMLElement => el.classList.contains('cm-embed-block'));
}

/** True until our pipeline has mounted something into the block's root (or before the processor even ran). */
function unmounted(widget: HTMLElement): boolean {
	const root = widget.querySelector('[data-dse-element]');
	return !root || root.childElementCount === 0;
}

/**
 * Plugin-scoped; one instance per `registerFrameworkElements` call. Wire `captureViewsOf` to the
 * vault `modify` event and `extension()` to `plugin.registerEditorExtension`.
 */
export class LivePreviewScrollHold {
	private readonly captures = new WeakMap<EditorView, Capture>();
	private readonly pending = new WeakMap<EditorView, Pending>();
	/** Every live hold's release, so `releaseAll()` can drop them at unload. */
	private readonly holds = new Map<() => void, EditorView>();

	/** Vault `modify`: capture every Live Preview view of `path` that shows a DSE widget and is scrolled. */
	captureViewsOf(workspace: Workspace, path: string): void {
		for (const leaf of workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as unknown as LivePreviewViewLike;
			if (view.file?.path !== path || view.getMode?.() !== 'source') continue;
			const cm = view.editor?.cm;
			if (!cm) continue;
			try {
				this.capture(cm, view);
			} catch (err) {
				console.warn('[DSE] Live Preview scroll capture failed', err);
			}
		}
	}

	/**
	 * Capture one editor (exported for the tests); `owner` is the MarkdownView that shows it, whose `file` the capture is
	 * bound to. Raw Source mode draws no widgets, so it never captures.
	 */
	capture(view: EditorView, owner: LivePreviewViewLike): void {
		this.captures.delete(view);
		const path = owner.file?.path;
		if (!path) return;
		const scrollTop = view.scrollDOM.scrollTop;
		if (scrollTop <= 0) return; // nothing to lose
		const widgets = embedWidgets(view).filter((w) => w.querySelector('[data-dse-element]'));
		if (!widgets.length) return; // a note without a drawn DSE block never jumps (measured)
		this.captures.set(view, {
			path,
			owner,
			scrollTop,
			snapshot: view.scrollSnapshot(),
			widgets: widgets.map((w) => ({ pos: view.posAtDOM(w), px: w.getBoundingClientRect().height })),
		});
	}

	/** The CodeMirror extension: a ViewPlugin whose `update` runs before the DOM update and `docViewUpdate` right after it. */
	extension(): Extension {
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- the plugin value forwards to this instance
		const hold = this;
		return ViewPlugin.define((view) => ({
			update: (u: ViewUpdate) => hold.onUpdate(u),
			docViewUpdate: (v: EditorView) => hold.applyHolds(v),
			destroy: () => hold.forget(view),
		}));
	}

	/** Before CodeMirror touches the DOM: decide whether this update is the redraw a capture was waiting for. */
	onUpdate(u: ViewUpdate): void {
		if (!u.docChanged) return;
		const view = u.view;
		const open = this.pending.get(view);
		if (open) {
			// a later doc change before the restore ran / while blocks are held: keep positions current
			open.restore = open.restore ? (open.restore.map(u.changes) ?? null) : null;
			open.widgets = open.widgets.map((w) => ({ pos: u.changes.mapPos(w.pos, -1), px: w.px }));
		}
		const cap = this.captures.get(view);
		if (!cap) return;
		this.captures.delete(view); // consumed by the first doc change, whatever it is
		if (cap.owner.file?.path !== cap.path) return; // another note was loaded into this leaf since: its snapshot is not ours
		if (!u.transactions.filter((tr) => tr.docChanged).every((tr) => tr.isUserEvent('set'))) return; // the user's own edit
		if (Math.abs(view.scrollDOM.scrollTop - cap.scrollTop) > 1) return; // the user scrolled since: the user wins
		const win = view.scrollDOM.ownerDocument.defaultView;
		if (!win) return;
		if (open) win.clearTimeout(open.timer);
		const entry: Pending = {
			restore: cap.snapshot.map(u.changes) ?? null,
			widgets: cap.widgets.map((w) => ({ pos: u.changes.mapPos(w.pos, -1), px: w.px })),
			timer: win.setTimeout(() => {
				if (this.pending.get(view) === entry) this.pending.delete(view);
			}, PIN_TTL_MS),
			win,
		};
		this.pending.set(view, entry);
		// Never dispatch inside an update; a microtask runs before the next frame's measure and paint.
		void Promise.resolve().then(() => {
			const restore = entry.restore;
			entry.restore = null;
			if (!restore || this.pending.get(view) !== entry) return;
			try {
				view.dispatch({ effects: restore });
			} catch (err) {
				console.warn('[DSE] Live Preview scroll restore failed', err);
			}
		});
	}

	/** Right after CodeMirror wrote the DOM, before it measures: hold each replaced DSE block drawn empty at its old height. */
	applyHolds(view: EditorView): void {
		const entry = this.pending.get(view);
		if (!entry) return;
		for (const w of embedWidgets(view)) {
			if (w.hasAttribute(HOLD_ATTR) || !unmounted(w)) continue;
			let pos: number;
			try {
				pos = view.posAtDOM(w);
			} catch {
				continue;
			}
			const at = entry.widgets.find((x) => x.pos === pos);
			if (at) this.hold(view, w, at.px);
		}
	}

	private hold(view: EditorView, widget: HTMLElement, px: number): void {
		const win = widget.ownerDocument.defaultView;
		if (!win) return;
		widget.style.setProperty('min-height', `${px}px`);
		widget.setAttribute(HOLD_ATTR, String(Math.round(px)));
		let observer: MutationObserver | null = null;
		const release = (): void => {
			if (!this.holds.delete(release)) return;
			observer?.disconnect();
			win.clearTimeout(timer);
			widget.style.removeProperty('min-height');
			widget.removeAttribute(HOLD_ATTR);
			view.requestMeasure(); // pick up the mounted block's real height
		};
		const timer = win.setTimeout(release, PIN_TTL_MS);
		this.holds.set(release, view);
		const MO = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
		if (MO) {
			observer = new MO(() => {
				if (!unmounted(widget)) release();
			});
			observer.observe(widget, { childList: true, subtree: true });
		}
	}

	private forget(view: EditorView): void {
		const entry = this.pending.get(view);
		if (entry) entry.win.clearTimeout(entry.timer);
		this.pending.delete(view);
		this.captures.delete(view);
		for (const [release, v] of [...this.holds]) if (v === view) release();
	}

	/** Drop every hold. Registered as plugin-unload cleanup. */
	releaseAll(): void {
		for (const release of [...this.holds.keys()]) release();
	}
}
