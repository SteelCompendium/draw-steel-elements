// SC-608 — an outside edit that redraws an element while one of its windows (a modal it opened) is open.
//
// WHAT HAPPENS: Obsidian throws the old section away and draws a new one, so the old view unloads and its window closes with it.
// Everything typed or staged in the window is dropped, which is the point: its callbacks hold the OLD model's objects, and an
// Apply from it could only overwrite the outside change. What was missing was telling the user, and focus: the control that opened
// the window is gone, so focus fell to <body> (a keyboard user had to Tab in again from the top of the note).
//
// THE HAND-OFF is made by whoever unloads, once its window has closed (`handOffAfterOutsideClose`), and it needs the NEW view's
// root, which can already be in the document (Reading view draws the new section first) or not yet (Live Preview closes first and
// the new widget arrives ~10 ms later), so it looks at once and then watches the document until its TTL. What it finds there is the
// root at the same SLOT: the same note (`sourcePath`), the same pane or embed, the same position among that pane's roots of the
// element. Not the block key: it carries the fence line, which an edit above the block moves. The focus itself is SC-588 / SC-602's
// (`controlFocus.ts`: a token taken when the window opened, its successor looked up by control id + position, else the root, never
// <body>), and the rules are the same: only while focus is free in the root's OWN document (a popout window's focus is not ours to
// take), the dying view's own control counts as free (Live Preview: Obsidian's focus return lands on it a few ms before the redraw),
// a focus the user moves elsewhere cancels the focus part, and no token (the window was opened with the mouse, focus was not in the
// tracker) means nothing is focused.
//
// WHEN WHAT HAPPENS: the Notice only when the successor's content differs from what the closing view had loaded or written (`content()`:
// the note's own text of the block when the host knows it, so even a YAML comment counts as an outside edit); the same content is the
// view's own save or a re-render, which says nothing. Focus does not depend on that check. It is not moved when the number of the pane's
// trackers changed since the window opened (an edit inserted or removed one, so the position no longer says which is ours), and it follows a
// burst of redraws (Sync): the watch stays armed HANDOFF_SETTLE_MS after each success and re-claims only while focus is on <body>.
// The successor must exist: a note that navigated away, a block the edit deleted, a leaf that closed has none, the watch lapses at its
// TTL, and nothing is shown or focused. The watch belongs to the plugin (`owner`): unloading it cancels the watch.
import { focusControl, focusIsFree } from './focusHandoff';
import { controlSuccessor } from '../kit/controlFocus';
import type { ControlFamilies, ControlFocus } from '../kit/controlFocus';
import { Component, Notice } from 'obsidian';

/** What a mounted element publishes on its root so a closing predecessor can recognise it. Lazy: nothing is computed until asked. */
export interface WindowRootRecord {
	sourcePath: () => string;
	/** The view's idea of the block as it is on disk (see `InitiativeView.diskContent`): equal to a predecessor's = nobody edited it. */
	content: () => string;
	/** False once the view is unloading: its root may still sit in the document for a moment but is not a successor and not a sibling. */
	live: () => boolean;
}

const mounted = new WeakMap<HTMLElement, WindowRootRecord>();

/** Called by a view each time it builds its root (idempotent: the record is the view's own, for its whole life). */
export function publishWindowRoot(root: HTMLElement, record: WindowRootRecord): void {
	mounted.set(root, record);
}

/** Where an element sat when its window opened: stable across the redraw that replaces its root. `count` is how many roots of the
 *  element the pane held then; a different count at hand-off time means a tracker was inserted or removed, and the position no longer
 *  says which tracker is ours (the Notice still shows, focus is not moved). */
export interface WindowSlot {
	elementId: string;
	scope: Element;
	index: number;
	count: number;
}

/** The pane or embed a root is drawn in. Reading view and Live Preview are separate scopes (a leaf keeps a hidden copy of the other). */
const SCOPE = '.internal-embed, .markdown-embed, .markdown-reading-view, .markdown-source-view, .workspace-leaf';
const scopeFor = (root: Element): Element => root.closest(SCOPE) ?? root.ownerDocument.body;

/** Connected roots of `elementId` in `scope`, in document order, leaving out the ones of views that are unloading. */
function rootsIn(scope: Element, elementId: string): HTMLElement[] {
	return Array.from(scope.querySelectorAll<HTMLElement>(`[data-dse-element="${elementId}"]`)).filter(
		(r) => r.isConnected && scopeFor(r) === scope && mounted.get(r)?.live() !== false,
	);
}

/** The slot of `root` among the roots of `elementId` now in its pane; null when it is not in the document. */
export function slotOf(root: HTMLElement, elementId: string): WindowSlot | null {
	if (!root.isConnected) return null;
	const scope = scopeFor(root);
	const roots = rootsIn(scope, elementId);
	return { elementId, scope, index: Math.max(0, roots.indexOf(root)), count: roots.length };
}

/** How long the watch for the successor lasts. Live Preview's arrives ~10-45 ms after the close; the rest is slack for a loaded host. */
export const HANDOFF_TTL_MS = 3000;
/** After the successor was found, how long the hand-off stays armed for the NEXT redraw (a Sync burst redraws the block several times in
 *  a row, each discarding the control that was focused). Each success extends it. SC-505's `SETTLE_MS`, for the same reason. */
export const HANDOFF_SETTLE_MS = 1500;

export interface OutsideCloseHandoff {
	slot: WindowSlot;
	/** The closing view's own record, and what it held on disk when it unloaded. */
	own: WindowRootRecord;
	ownContent: string;
	/** The root being replaced; focus on it still counts as free. */
	oldRoot: HTMLElement;
	/** What held focus when the window opened (null: focus was not inside the element; only the Notice is shown). */
	focus: ControlFocus | null;
	families: ControlFamilies;
	notice: string;
	/** A long-lived Component (the plugin): unloading it cancels the watch. A hand-off for an owner that is not loaded is not started. */
	owner: Component;
}

/** Call once the window has closed. Returns a cancel function. */
export function handOffAfterOutsideClose(o: OutsideCloseHandoff): () => void {
	const doc = o.oldRoot.ownerDocument;
	const win = doc.defaultView;
	if (!win || !(o.owner as unknown as { _loaded: boolean })._loaded) return () => undefined;
	const sourcePath = o.own.sourcePath();
	const holder = o.owner.addChild(new Component());
	holder.register(() => finish());
	let wantFocus = o.focus !== null;
	let focusing = false;
	let settling = false;
	let finished = false;
	let claimed: HTMLElement | null = null; // the successor the Notice and focus were given for
	let timer = 0;
	let settle = 0;
	let observer: MutationObserver | null = null;

	const finish = (): void => {
		if (finished) return;
		finished = true;
		observer?.disconnect();
		win.clearTimeout(timer);
		win.clearTimeout(settle);
		doc.removeEventListener('focusin', onFocusIn, true);
		o.owner.removeChild(holder);
	};
	/** The user (or another pane) took focus: the focus part is off, the Notice still follows the redraw. */
	const onFocusIn = (evt: FocusEvent): void => {
		const target = evt.target as Node | null;
		if (focusing || (target && o.oldRoot.contains(target))) return;
		wantFocus = false;
	};
	/** The root at the slot, or null while it is not built yet. An error card (no record) at a slot whose count changed counts as found. */
	const find = (): HTMLElement | null => {
		const roots = rootsIn(o.slot.scope, o.slot.elementId);
		const root = roots[o.slot.index];
		const record = root ? mounted.get(root) : undefined;
		if (root && !record && roots.length !== o.slot.count && root.hasAttribute('data-dse-error-stage')) return root;
		return root && record && record.sourcePath() === sourcePath ? root : null;
	};
	const focusSuccessor = (root: HTMLElement): void => {
		if (!wantFocus || !o.focus || !root.isConnected) return;
		if (!focusIsFree(doc) && !o.oldRoot.contains(doc.activeElement)) return;
		const target = controlSuccessor(root, o.focus, o.families);
		if (target === root && !root.hasAttribute('tabindex')) root.tabIndex = -1; // focusable by script, not a new Tab stop
		focusing = true;
		try {
			focusControl(target, o.focus.ring);
		} finally {
			focusing = false;
		}
	};
	const act = (): void => {
		settling = false;
		const root = find();
		if (finished || !root || root === claimed) return;
		if (claimed === null) {
			// First successor. Same disk content = the view's own save or a re-render: no Notice. Focus follows either way.
			if (mounted.get(root)?.content() !== o.ownContent) new Notice(o.notice);
			if (o.slot.count !== rootsIn(o.slot.scope, o.slot.elementId).length) wantFocus = false; // a tracker came or went: not ours to pick
		}
		claimed = root;
		focusSuccessor(root); // (a later redraw of a burst: only while focus is free, i.e. on <body>)
		win.clearTimeout(timer);
		timer = win.setTimeout(finish, HANDOFF_SETTLE_MS);
	};
	const attempt = (): void => {
		if (finished || settling) return;
		const root = find();
		if (!root || root === claimed) return;
		// The root is built, but the pipeline adds its chrome panel right after (the Reset encounter item lives there): act one task later.
		settling = true;
		settle = win.setTimeout(act, 0);
	};

	doc.addEventListener('focusin', onFocusIn, true);
	timer = win.setTimeout(finish, HANDOFF_TTL_MS);
	observer = new win.MutationObserver(attempt);
	observer.observe(doc.body, { childList: true, subtree: true });
	attempt();
	return finish;
}

/** The one Notice text (the ledger's ruling). */
export const OUTSIDE_CLOSE_NOTICE = 'The note changed outside, so this window closed without saving';
