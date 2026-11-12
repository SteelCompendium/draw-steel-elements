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
// WHEN IT APPLIES: only when the successor's content differs from what the closing view held. The same bytes mean the unload was not
// an outside edit (the view's own save in Live Preview, a mode switch, a re-render): nothing is said and nothing is moved, as before.
// And the successor must exist: a note that navigated away, a block the edit deleted, a leaf that closed has none, the watch lapses
// at its TTL, and nothing is shown or focused.
import { focusControl, focusIsFree } from './focusHandoff';
import { controlSuccessor } from '../kit/controlFocus';
import type { ControlFamilies, ControlFocus } from '../kit/controlFocus';
import { Notice } from 'obsidian';

/** What a mounted element publishes on its root so a closing predecessor can recognise it. Lazy: nothing is serialized until asked. */
export interface WindowRootRecord {
	sourcePath: () => string;
	content: () => string;
}

const mounted = new WeakMap<HTMLElement, WindowRootRecord>();

/** Called by a view each time it builds its root (idempotent: the record is the view's own, for its whole life). */
export function publishWindowRoot(root: HTMLElement, record: WindowRootRecord): void {
	mounted.set(root, record);
}

/** Where an element sits: stable across the redraw that replaces its root. */
export interface WindowSlot {
	elementId: string;
	scope: Element;
	index: number;
}

/** The pane or embed a root is drawn in. Reading view and Live Preview are separate scopes (a leaf keeps a hidden copy of the other). */
const SCOPE = '.internal-embed, .markdown-embed, .markdown-reading-view, .markdown-source-view, .workspace-leaf';
const scopeFor = (root: Element): Element => root.closest(SCOPE) ?? root.ownerDocument.body;

/** Connected roots of `elementId` in `scope`, in document order, leaving out the ones whose record is `except` (the closing view's own). */
function rootsIn(scope: Element, elementId: string, except: WindowRootRecord | null): HTMLElement[] {
	return Array.from(scope.querySelectorAll<HTMLElement>(`[data-dse-element="${elementId}"]`)).filter(
		(r) => r.isConnected && scopeFor(r) === scope && (except === null || mounted.get(r) !== except),
	);
}

/** The slot of `root` among the roots of `elementId` now in its pane; null when it is not in the document. */
export function slotOf(root: HTMLElement, elementId: string): WindowSlot | null {
	if (!root.isConnected) return null;
	const scope = scopeFor(root);
	return { elementId, scope, index: Math.max(0, rootsIn(scope, elementId, null).indexOf(root)) };
}

/** How long the watch for the successor lasts. Live Preview's arrives ~10-45 ms after the close; the rest is slack for a loaded host. */
export const HANDOFF_TTL_MS = 3000;

export interface OutsideCloseHandoff {
	slot: WindowSlot;
	/** The closing view's own record, and the content it held when it unloaded. */
	own: WindowRootRecord;
	ownContent: string;
	/** The root being replaced; focus on it still counts as free. */
	oldRoot: HTMLElement;
	/** What held focus when the window opened (null: focus was not inside the element; only the Notice is shown). */
	focus: ControlFocus | null;
	families: ControlFamilies;
	notice: string;
}

/** Call once the window has closed. Returns a cancel function (tests, teardown). */
export function handOffAfterOutsideClose(o: OutsideCloseHandoff): () => void {
	const doc = o.oldRoot.ownerDocument;
	const win = doc.defaultView;
	if (!win) return () => undefined;
	const sourcePath = o.own.sourcePath();
	let wantFocus = o.focus !== null;
	let focusing = false;
	let settling = false;
	let finished = false;
	let timer = 0;
	let settle = 0;
	let observer: MutationObserver | null = null;

	const finish = (): void => {
		finished = true;
		observer?.disconnect();
		win.clearTimeout(timer);
		win.clearTimeout(settle);
		doc.removeEventListener('focusin', onFocusIn, true);
	};
	/** The user (or another pane) took focus: the focus part is off, the Notice still follows the redraw. */
	const onFocusIn = (evt: FocusEvent): void => {
		const target = evt.target as Node | null;
		if (focusing || (target && o.oldRoot.contains(target))) return;
		wantFocus = false;
	};
	const find = (): HTMLElement | null => {
		const root = rootsIn(o.slot.scope, o.slot.elementId, o.own)[o.slot.index];
		const record = root ? mounted.get(root) : undefined;
		return root && record && record.sourcePath() === sourcePath ? root : null;
	};
	const act = (): void => {
		if (finished) return;
		const root = find();
		if (!root) {
			settling = false; // rebuilt again while settling: wait for the next one
			return;
		}
		finish();
		if (mounted.get(root)?.content() === o.ownContent) return; // not an outside edit: as before
		new Notice(o.notice);
		if (!wantFocus || !o.focus) return;
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
	const attempt = (): void => {
		if (finished || settling || !find()) return;
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
