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
//  2. On that view's next doc-changing update, IF it is Obsidian's `set` transaction: (a) RESTORE — dispatch the snapshot (mapped through the
//     change) as an effects-only transaction, so CodeMirror puts the viewport back around the
//     line the user was reading and draws the replaced block; (b) HOLD — when the replacement
//     widget is drawn still empty (our view mounts asynchronously), give it an inline
//     `min-height` of the old block's height in `docViewUpdate` (after CodeMirror writes the DOM,
//     before it measures), so the height map records the real height and the restore lands
//     exactly. The replacement is found by its start position, which may sit anywhere from the old
//     start mapped before an insertion to the old start mapped after it (a write that inserts text
//     right at the fence and changes the tracker moves the start past the insertion), and only a
//     widget of the same `cm-lang-*` language is held (a callout that slid into a deleted tracker's
//     slot is not). The hold drops as soon as our view appends its first child to the block's root
//     (MutationObserver; measured 3-224 ms, 0 painted frames — not necessarily the full mount),
//     or by the backstop (THE BACKSTOP, SC-472). If the block's real height changed (a row added), CodeMirror re-measures it
//     like any resized widget: above the viewport its anchoring keeps the visible line in place;
//     with the viewport inside the block the pixel offset into the block is kept.
//
// SAFETY. Only views that showed a DSE widget at capture time are touched. Never focus, never the
// selection: the restore is an effects-only `scrollIntoView` snapshot. Never against the user:
// a capture is consumed by the first doc change whatever it is, so a user's own edit (any
// userEvent other than "set") never triggers a restore, and a user scroll moves the capture along
// instead of cancelling it: every `scroll` event on a view with an un-consumed capture takes the
// capture again (`refresh`), so a second pane whose `set` transaction arrives 1-2 s after `modify`
// (SC-472) is restored to where the user scrolled to, not to where the pane was at `modify`
// (without this the 1 px check below dropped the restore, and Obsidian's jump came back). A scroll
// to the very top, or out of reach of every DSE block, drops the capture (nothing to protect). The
// `scrollTop` check at the transaction stays as the fallback for a scroll whose event has not fired
// yet. After the transaction there is nothing to refresh, so the restore's own and the clamp's scroll
// events never re-capture. Popouts: the MutationObserver and timers come from the widget's own window.
// Unload: `releaseAll()` (plugin.register) and the ViewPlugin's `destroy` drop every hold.
//
// A CAPTURE BELONGS TO ONE NOTE. There is no TTL on a capture (the second Live Preview pane's
// transaction was measured 2.47 s after `modify` while the main thread was busy; SC-472), so its
// lifetime is bound by identity instead: it records the path it was taken for and is dropped if the
// view's file is no longer that path when a transaction arrives. Both are reachable today (the path
// check was measured to fire, not only to be defensive: a `modify` listener that opens another note
// makes Obsidian apply the first note's `set` transaction to a view whose `file` is already the
// second — without the check that gets a restore and a hold, 2/2; with it 0/2). Measured (Obsidian 1.14.4, SC-478
// r2; `openFile`, `setViewState`, `openLinkText`, history back, to a tracker note and to a plain
// one): a different file loaded into a Live Preview leaf is the SAME MarkdownView and the SAME
// EditorView — `onLoadFile` then `setViewData(data, clear=true)`, which ends in
// `EditorView.setState(newState)`: no doc-changing transaction at all, every ViewPlugin is destroyed
// and re-created (so `destroy` -> `forget` already drops the capture, pending restore and holds:
// capture present before the load, absent after, 5/5 navigations), `view.file` is the new path before
// the first update, and Obsidian resets scrollTop to 0. The explicit path check covers a navigation
// that arrives as a `set` transaction on the same editor instead.
//
// DEPENDENCY, ACCEPTED. The restore engages only on a doc-changing transaction whose every
// userEvent is "set" — Obsidian's `setViewData` annotation (measured on every write path). That is
// Obsidian's behaviour, not API: if a future version drops or renames it, the hold silently stops
// engaging; lifecycle gate G-S18 fails when that happens. The annotation is also what Obsidian puts on
// the copy of a second pane's typing (`doc:set` on the other pane): such an update after a `modify` (each
// autosave) restores the unchanged snapshot — a no-op measured at 0.4-0.5 ms, scrollTop unchanged, no
// hold — which is harmless and not worth telling apart.
// Not touched: a DSE block CodeMirror has not drawn (far above or below the viewport) has no widget
// in the DOM, so nothing is captured — and the pane was measured to hold anyway (stock and here).
//
// EMBEDS: A LIVE PREVIEW HOST NOTE (SC-522). Note A open in Live Preview embeds note B (`![[B]]`) that has a DSE
// block. A write to B does not touch A's document, so nothing above engages (no transaction on A). Measured
// (Obsidian 1.15.0, SC-522 r1): in Live Preview the `.internal-embed` IS CodeMirror's block widget (a direct
// `.cm-content` child), and on every write that redraws B's block Obsidian re-renders the embed's content: for part
// of one task, 26-108 ms after `modify`, the embed is empty (its inner sizer 3166 -> 111px, the widget 3190 -> 135px),
// so the scroller's scrollHeight drops by the same 3055px and the browser PASSIVELY CLAMPS scrollTop to the new max
// (6800 -> 3745 with the embed near the end of the note and the note parked at its end; 7510 -> 7441, the text under
// the embed moving 69px, parked below the embed; 2912 -> 26 for a note that is mostly the embed). Our view mounts
// ~40-60ms later and the widget is back at full height before any frame; nothing scrolls back. CodeMirror never sees
// it: its height map keeps 3190px, no transaction or measure moves scrollTop, nothing in script sets it, and
// `.cm-scroller` has `overflow-anchor: none`, so Chrome's anchoring cannot help or hurt. Hosts parked above the embed,
// in it, or with the embed's top on screen hold on stock (the clamp only bites when scrollTop is above the shrunken max).
// The fix (`holdEmbedsOf`, from the same `modify` event): for every Live Preview view of ANOTHER note that is scrolled,
// each drawn embed widget that shows a DSE block of the written note (`embedsBlockOf`, SC-479's resolver: nested
// embeds and `#heading` / `#^block` subpaths too) gets an inline `min-height` of its current height. It is released
// when our view is back in it — a DSE root that was not there at hold time (a fresh mount), or one of the held roots
// put back (an adopted write), and every root in the embed mounted (MutationObserver on the widget) — so a write that
// changes the embed's real height shows that height in the same task, and CodeMirror re-measures it like any resized
// widget (a growth above the viewport keeps the visible line, as on stock). It is ALSO released when Obsidian redraws the
// embed without bringing a fresh view of ours - a block deleted from B, a paragraph of B removed (measured: one batch
// that removes a section and adds nothing, the other roots untouched and mounted): something outside our roots was
// removed and every root now in the embed is mounted, so nothing is collapsing; that release runs one task later and is
// re-checked then (a root added empty in the meantime keeps the hold). A redraw that REPLACES a root - also one of two roots, the other
// staying in place - adds the new root empty in the same batch as the removal, so it is not released until our view is
// in it. The backstop (THE BACKSTOP, SC-472) covers a write Obsidian never redraws in the embed (an edit outside an embedded heading): it
// only leaves the floor at the height the embed already has. Measured cost (1.15.0, SC-522 r1): the embed scan per Live Preview view per `modify` of any note,
// 0.1 ms median (0.5 max) when nothing is held; a hold 1.3-3.4 ms to set (one layout read at `modify`, the DOM still
// clean); the release reads no layout (CodeMirror measures at its next frame, as it would for any resized widget).
// Measured result of the hold (1.15.0, process / watcher / second pane / popout / add or remove a hero / `#heading`):
// 6800 held, 7486 held, text under the embed 0px (stock: 3745, +69 / +755px, 2912 -> 26 for a note that is mostly the embed).
//
// CLICKS IN THE EMBEDDED CARD (SC-522, Part 2; a BEHAVIOUR CHANGE, ruled acceptable): the same note also jumps when the
// reader CLICKS a control in the embedded card. Obsidian's click handler on the embed widget (`hookClickHandler`) runs
// `selectElement`, which dispatches the selection with `scrollIntoView: true`, and CodeMirror scrolls the HOST to the
// embed's top - on every click in the card, written or not (parked in the tracker 5420 -> 3916, text +1528px; a note that
// is mostly the embed 2912 -> 150 / 0). That handler skips a click whose target sits in an `.interactive-child`
// (Obsidian's own marker), so `pipeline.ts` (`armClickShield`) puts that class on the DSE root, only when the root sits in
// a Live Preview embed (`.cm-content .internal-embed`) - and, since SC-540, in a Live Preview callout widget (the same handler
// selected the whole callout and turned it into source; see the comment there). SC-540 r3 closed a gap in the embed case too: a
// control that rebuilds the card on click (ds-initiative Advance round) detached the click target, so the walk missed the mark. USER-VISIBLE: a click inside a DSE card in a Live Preview embed no
// longer selects the embed - the editor cursor does not move onto it and the selected-embed outline does not draw.
// A click elsewhere in the embed (outside the card) still selects it as before; Reading view and the DSE code-block
// widgets in Live Preview are untouched. Obsidian also tests `interactive-child` for double-click and Mod+A inside the
// embed; r3 probed them (SC-522 r3): a double-click, Mod+A in a card, a click on the embed's text outside the card and the
// open-link icon behave as on stock, except that stock jumps (or takes focus from an opened edit form) and this does not.
//
// KNOWN LIMITS. (1) One frame of CodeMirror measure lag: when the embed's height CHANGES above the viewport (a hero added
// or removed, host parked below it), the settled position is held (text 0px) but a sample taken after paint and before
// CodeMirror's next measure reads +110 / -110px for one PAINTED frame (rAF and post-paint samplers and trace
// screenshots see it; settled 0; stock settles +69 with transients +178 / -41..+69). That is CodeMirror's own measure
// cycle, present on stock too; no cheap fix without internal API, so it is accepted. (2) Dependence on Obsidian internals: the hold needs the `.internal-embed` to stay the
// CodeMirror widget, a direct `.cm-content` child; the click mark needs `hookClickHandler` to keep its `.interactive-child`
// test. If either changes, lifecycle G-S52 (a)-(f) fails. (3) Backstop-bounded floor: a write to B that Obsidian does not
// redraw in the embed leaves the floor in place for the backstop (PIN_TTL_MS, 2.5 s, plus 30 painted frames: about 3 s unloaded); the floor is the height the embed
// already has, so it is invisible unless the embed would shrink within that window. A shrink that Obsidian does redraw
// (a block deleted from B, a paragraph removed) is released by the rule above one task after the redraw, so the host ends
// where stock's clamp ends without a blank band. If Obsidian ever redraws an embed in two separate tasks (the removal
// first, the replacement later) that release fires early and the host behaves as on stock for that write (the clamp),
// never worse. A re-hold while the previous redraw is under way (a held root removed) keeps the larger floor.
// The release rule also fires on ANY removal outside our roots that lands in the ~20-30 ms between the write and Obsidian's
// redraw (something else in the embed changing): that write then behaves as on stock (the clamp), never worse.
//
// THE BACKSTOP (SC-472). Every hold falls back on `Backstop` (redrawBackstop.ts) instead of a plain `setTimeout(PIN_TTL_MS)`. The
// SC-478 pending entry (a block drawn later than the backstop is not held), the SC-478 widget hold and the SC-522 embed hold keep their
// release rules (restore on the transaction, release on mount, release on the embed redraw) and differ only in the fallback. A plain 2.5 s
// timer ran out BEFORE the redraw when another pane held the main thread: the second Live Preview pane's transaction was measured 2.47 s
// after `modify` (SC-478), and under an 8x CPU throttle the SC-522 embed hold was dropped at +4.9-5.4 s, right after the other pane's redraw
// and 0.5-1 s before the embed's own, so the embed collapsed unprotected (7486 -> 3745, 2 of 3 redrawn writes; release on the redraw with a
// plain 2.5 s timer: 3 of 4; the backstop: 0 of 4 and G-S59 (b) 3 of 3 in every run). The backstop fires after PIN_TTL_MS of wall clock AND 30 painted
// frames, 2 of them quiet; its busy rules are "a root of ours in the embed is empty" (embed hold) and "the widget is still in the
// document and unmounted" (widget hold), so a view that is still mounting is never cut short; PIN_HARD_CAP_MS (20 s) ends everything.
// A hidden window paints no frames, so only the cap runs there (20 s, invisible). KNOWN LIMIT: the SC-478 widget hold that CodeMirror
// has replaced (it will never mount) is released by the backstop, not on mount: measured on stock in the sibling-pane runs
// (hold set at +384 ms, released at +4441 ms); the new backstop does not
// make it longer or blank longer (measured, SC-472 r3, pane B of the sibling-pane case at 8x CPU throttle: hold 3127 / 4134 / 3265 ms vs 4047 / 3764 / 3283 ms on
// stock, 0 painted blank frames either way, scrollTop 3020 held).

import type { Workspace } from 'obsidian';
import { ViewPlugin } from '@codemirror/view';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension, StateEffect } from '@codemirror/state';
import { embedsBlockOf } from './previewScrollPin';
import { Backstop } from './redrawBackstop';
import type { LinkResolver } from './previewScrollPin';

/** On a replacement widget while its height is held; the value is the held px (tests/probes read it). */
export const HOLD_ATTR = 'data-dse-lp-hold';
/** SC-522: on a Live Preview host's embed widget while its height is held across a write to the embedded note; the value is the held px. */
export const EMBED_HOLD_ATTR = 'data-dse-lp-embed-hold';

/**
 * A DSE block's widget as CodeMirror drew it: a direct `.cm-content` child holding our root. At capture `from === to`
 * (its start position); every document change carries it along (`mapWidget`), widening `to` to the end of the changed
 * range that touches the old start, so the replacement widget's start is found whether an edit inserted text right at
 * the old start (it lands after it: inside the interval) or replaced a range that began at or contained it.
 */
interface WidgetAt {
	from: number;
	to: number;
	px: number;
	/** The widget's `cm-lang-*` classes: only a replacement of the same language is held (a callout is not a tracker). */
	lang: string;
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
	/** Drops this entry (SC-472 backstop: PIN_TTL_MS plus painted frames): a block drawn later than that is not held. */
	backstop: Backstop;
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

/** The `cm-lang-*` classes of an embed widget ("cm-lang-ds-initiative"), sorted and joined; '' if it has none. */
function langOf(widget: HTMLElement): string {
	return Array.from(widget.classList)
		.filter((c) => c.startsWith('cm-lang-'))
		.sort()
		.join(' ');
}

/** True until our pipeline has mounted something into the block's root (or before the processor even ran). */
function unmounted(widget: HTMLElement): boolean {
	const root = widget.querySelector('[data-dse-element]');
	return !root || root.childElementCount === 0;
}

/**
 * Carry a widget's interval through a document change. `from` is the old start mapped before any insertion at it; `to`
 * is the old start mapped the same way, widened to the end of every changed range that touches the old start. Plain
 * `mapPos` cannot give that end: a position at the start of a replaced range maps to the start of the new text whatever
 * its assoc, and the diff Obsidian dispatches for "paragraph inserted above the fence + tracker changed" is ONE
 * replacement starting at the old fence start (measured: [478,1538] -> [478,1554]), with the new widget at 494.
 */
function mapWidget(w: WidgetAt, changes: ViewUpdate['changes']): WidgetAt {
	let to = changes.mapPos(w.to, -1);
	changes.iterChanges((fromA, toA, _fromB, toB) => {
		if (fromA <= w.to && w.to <= toA) to = Math.max(to, toB);
	});
	return { ...w, from: changes.mapPos(w.from, -1), to };
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
	/** SC-522: every held embed widget and its release (a re-hold replaces it). */
	private readonly embedHolds = new Map<HTMLElement, { px: number; roots0: Set<Element>; release: () => void }>();

	/**
	 * Vault `modify`: capture every Live Preview view of `path` that shows a DSE widget and is scrolled; SC-522: and,
	 * with `resolveLink`, hold the embeds of `path`'s DSE blocks in every Live Preview view of another note.
	 */
	captureViewsOf(workspace: Workspace, path: string, resolveLink?: LinkResolver): void {
		for (const leaf of workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as unknown as LivePreviewViewLike;
			if (!view.file || view.getMode?.() !== 'source') continue;
			const own = view.file.path === path;
			if (!own && !resolveLink) continue;
			const cm = view.editor?.cm;
			if (!cm) continue;
			try {
				if (own) this.capture(cm, view);
				else this.holdEmbedsOf(cm, path, view.file.path, resolveLink!);
			} catch (err) {
				console.warn('[DSE] Live Preview scroll capture failed', err);
			}
		}
	}

	/**
	 * SC-522: hold every drawn embed widget of `view` (a Live Preview view of `hostPath`) that shows a DSE block of
	 * `path` at its current height until our view is back in it (header: EMBEDS). Nothing to protect at the top.
	 */
	holdEmbedsOf(view: EditorView, path: string, hostPath: string, resolveLink: LinkResolver): void {
		if (view.scrollDOM.scrollTop <= 0) return;
		for (const el of Array.from(view.contentDOM.children) as HTMLElement[]) {
			if (!el.classList.contains('internal-embed') || !el.querySelector('[data-dse-element]')) continue;
			if (embedsBlockOf(el, path, hostPath, resolveLink)) this.holdEmbed(view, el);
		}
	}

	private holdEmbed(view: EditorView, embed: HTMLElement): void {
		const win = embed.ownerDocument.defaultView;
		if (!win) return;
		// min-height sizes the content box unless the theme sets border-box: hold exactly the box the embed has now
		const cs = win.getComputedStyle(embed);
		const edges = cs.boxSizing === 'border-box' ? 0 : ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((n, k) => n + (parseFloat(cs[k as 'paddingTop']) || 0), 0);
		let px = embed.getBoundingClientRect().height - edges;
		const prev = this.embedHolds.get(embed);
		if (prev) {
			// A re-hold (rapid writes): the height read above is taken with the previous hold's min-height still applied, so it
			// already includes the previous floor and a re-hold does not lower it before the redraw; this keeps the larger floor
			// explicitly when a held root was removed (the embed may be collapsed right now). A shrink is not handled here: the
			// redraw-time release (below) ends the hold, and the host ends where stock's clamp ends.
			if (Array.from(prev.roots0).some((root) => !root.isConnected)) px = Math.max(px, prev.px);
			prev.release();
		}
		if (!(px > 0)) return;
		const roots0 = new Set(Array.from(embed.querySelectorAll('[data-dse-element]')));
		const inline = embed.style.getPropertyValue('min-height');
		embed.style.setProperty('min-height', `${px}px`);
		embed.setAttribute(EMBED_HOLD_ATTR, String(Math.round(px)));
		let observer: MutationObserver | null = null;
		let settle: number | null = null;
		const release = (): void => {
			if (this.embedHolds.get(embed)?.release !== release) return;
			this.embedHolds.delete(embed);
			this.holds.delete(release);
			observer?.disconnect();
			backstop.cancel();
			if (settle !== null) win.clearTimeout(settle);
			if (inline) embed.style.setProperty('min-height', inline);
			else embed.style.removeProperty('min-height');
			embed.removeAttribute(EMBED_HOLD_ATTR);
			view.requestMeasure();
		};
		// SC-472: the backstop waits while a root of ours in the embed is still mounting and counts painted frames (redrawBackstop.ts)
		const backstop = new Backstop(win, release, () => Array.from(embed.querySelectorAll('[data-dse-element]')).some((r) => r.childElementCount === 0));
		backstop.arm();
		this.embedHolds.set(embed, { px, roots0, release });
		this.holds.set(release, view);
		const MO = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
		if (!MO) return;
		let back = false;
		let redrawn = false;
		const mounted = (roots: Element[]): boolean => roots.every((root) => root.childElementCount > 0);
		observer = new MO((records) => {
			backstop.noteActivity();
			if (!back) {
				for (const r of records) {
					for (const n of Array.from(r.addedNodes)) {
						if (n.nodeType === 1 && Array.from(roots0).some((root) => n === root || n.contains(root))) back = true; // an adopted view put back
					}
				}
			}
			const roots = Array.from(embed.querySelectorAll('[data-dse-element]'));
			if (!back && roots.some((root) => !roots0.has(root))) back = true; // a fresh mount
			if (back && roots.length >= roots0.size && mounted(roots)) return release();
			// Obsidian redrew the embed WITHOUT bringing a fresh view of ours (a block deleted from B, a paragraph removed:
			// nothing of ours is coming): once something outside our roots was removed and every root now in the embed is
			// mounted, nothing is collapsing, so release - after the current task and re-checked then, so a removal that is only
			// the first half of a replacement (the new, still empty root follows in the same task) keeps the hold. A redraw that replaces a root
			// (including one of two) shows the new root empty at once, so `mounted` is false until our view is in it.
			if (!redrawn) redrawn = records.some((r) => r.removedNodes.length > 0 && !(r.target as Element).closest?.('[data-dse-element]'));
			if (redrawn && settle === null && mounted(roots)) {
				settle = win.setTimeout(() => {
					settle = null;
					if (mounted(Array.from(embed.querySelectorAll('[data-dse-element]')))) release();
				}, 0);
			}
		});
		observer.observe(embed, { childList: true, subtree: true });
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
			widgets: widgets.map((w) => {
				const pos = view.posAtDOM(w);
				return { from: pos, to: pos, px: w.getBoundingClientRect().height, lang: langOf(w) };
			}),
		});
	}

	/** The CodeMirror extension: a ViewPlugin whose `update` runs before the DOM update and `docViewUpdate` right after it. */
	extension(): Extension {
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- the plugin value forwards to this instance
		const hold = this;
		return ViewPlugin.define(
			(view) => ({
				update: (u: ViewUpdate) => hold.onUpdate(u),
				docViewUpdate: (v: EditorView) => hold.applyHolds(v),
				destroy: () => hold.forget(view),
			}),
			// SC-478 r3: a scroll the user makes between `modify` and a late `set` transaction moves the capture along.
			{ eventObservers: { scroll: (_e, v) => hold.refresh(v) } },
		);
	}

	/**
	 * A scroll event on a view that still holds an un-consumed capture: take the capture again at the new position, so the
	 * restore lands where the user scrolled to instead of being dropped (which would hand the view to Obsidian's jump).
	 * `capture` drops it by itself if the user scrolled to the very top or out of reach of every DSE block. Nothing to
	 * refresh once the `set` transaction consumed the capture, so the restore's own and the clamp's scroll events (which
	 * come after it) never re-capture, and neither does a pending or released entry.
	 */
	refresh(view: EditorView): void {
		const cap = this.captures.get(view);
		if (!cap) return;
		try {
			this.capture(view, cap.owner);
		} catch (err) {
			console.warn('[DSE] Live Preview scroll re-capture failed', err);
		}
	}

	/** Before CodeMirror touches the DOM: decide whether this update is the redraw a capture was waiting for. */
	onUpdate(u: ViewUpdate): void {
		if (!u.docChanged) return;
		const view = u.view;
		const open = this.pending.get(view);
		if (open) {
			// a later doc change before the restore ran / while blocks are held: keep positions current
			open.restore = open.restore ? (open.restore.map(u.changes) ?? null) : null;
			open.widgets = open.widgets.map((w) => mapWidget(w, u.changes));
		}
		const cap = this.captures.get(view);
		if (!cap) return;
		this.captures.delete(view); // consumed by the first doc change, whatever it is
		if (cap.owner.file?.path !== cap.path) return; // another note was loaded into this leaf since: its snapshot is not ours
		if (!u.transactions.filter((tr) => tr.docChanged).every((tr) => tr.isUserEvent('set'))) return; // the user's own edit
		if (Math.abs(view.scrollDOM.scrollTop - cap.scrollTop) > 1) return; // the user scrolled since: the user wins
		const win = view.scrollDOM.ownerDocument.defaultView;
		if (!win) return;
		if (open) open.backstop.cancel();
		const entry: Pending = {
			restore: cap.snapshot.map(u.changes) ?? null,
			widgets: cap.widgets.map((w) => mapWidget(w, u.changes)),
			backstop: new Backstop(win, () => {
				if (this.pending.get(view) === entry) this.pending.delete(view);
			}),
			win,
		};
		entry.backstop.arm();
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
			const lang = langOf(w);
			const at = entry.widgets.find((x) => pos >= x.from && pos <= x.to && x.lang === lang);
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
			backstop.cancel();
			widget.style.removeProperty('min-height');
			widget.removeAttribute(HOLD_ATTR);
			view.requestMeasure(); // pick up the mounted block's real height
		};
		// SC-472: the backstop waits while the (still connected) widget's view is mounting and counts painted frames
		const backstop = new Backstop(win, release, () => widget.isConnected && unmounted(widget));
		backstop.arm();
		this.holds.set(release, view);
		const MO = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
		if (MO) {
			observer = new MO(() => {
				backstop.noteActivity();
				if (!unmounted(widget)) release();
			});
			observer.observe(widget, { childList: true, subtree: true });
		}
	}

	private forget(view: EditorView): void {
		const entry = this.pending.get(view);
		if (entry) entry.backstop.cancel();
		this.pending.delete(view);
		this.captures.delete(view);
		for (const [release, v] of [...this.holds]) if (v === view) release();
	}

	/** Drop every hold. Registered as plugin-unload cleanup. */
	releaseAll(): void {
		for (const release of [...this.holds.keys()]) release();
	}
}
