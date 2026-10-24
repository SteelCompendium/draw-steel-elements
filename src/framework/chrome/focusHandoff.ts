// SC-505 — keyboard focus hand-off for the standard element chrome (mountChrome.ts + the pipeline's
// Pin item). The panel sits INSIDE the element it belongs to, so three keyboard presses used to throw
// the focused button away and leave focus on <body> (a Tab user then starts again from the top of the page):
//   - Collapse hides the whole element, panel included;
//   - Expand hides the collapsed one-liner the button lives on;
//   - Pin to sidebar writes the note, and the block is then rebuilt from scratch (the write comes from the
//     sidebar binder, not from the view, so nothing adopts the old view: new root, new panel, new buttons).
//
// THE RULE (SC-495's, here too): only a KEYBOARD activation moves focus. A real pointer click has
// `MouseEvent.detail >= 1`; Enter / Space on a button (and assistive tech, and a scripted `.click()`)
// raise a click with `detail === 0`. `:focus-visible` is NOT the test: a note's click shield keeps a
// button's earlier keyboard focus, and its ring state, through a mouse click.
//
// Every move uses `{ preventScroll: true, focusVisible: true }` (the ring follows the key press that caused
// it) and only ever lands on a control of the same block, never on <body> and never outside it.
//
// The Pin case cannot hand focus over synchronously: the button it should return to does not exist yet. So
// the click ARMS a request keyed by the block (`host.blockKey()`, stable across the write: sourcePath +
// language + line), and the next chrome mount for that key claims it, waiting for its button to be in
// the document if the section is still being built. A copy that cannot take focus (Obsidian keeps the
// Live Preview widget of the same block, `display: none`, in the same leaf) just leaves the request armed
// for the copy that can. Requests expire (a pin that rewrites nothing must not steal focus later) and are
// dropped the moment anything else holds focus (never fight the user for it).

/** `focusVisible` is Chromium 124+; older engines ignore the key. */
export const HANDOFF_FOCUS = { preventScroll: true, focusVisible: true } as FocusOptions;

/** Was this click raised by the keyboard (or assistive tech)? A pointer click has `detail >= 1`. */
export function isKeyboardClick(evt: MouseEvent | undefined | null): boolean {
	return evt?.detail === 0;
}

/** Focus `el` for a keyboard user; true when it really holds focus afterwards (a node that is
 *  detached, `display: none` or inside a hidden copy quietly refuses). */
export function focusControl(el: HTMLElement | null | undefined): boolean {
	if (!el || !el.isConnected) return false;
	el.focus(HANDOFF_FOCUS);
	return el.ownerDocument.activeElement === el;
}

/** Focus is "free to take" when nothing holds it (body or null): a request never fights the user. */
function focusIsFree(doc: Document): boolean {
	return doc.activeElement === null || doc.activeElement === doc.body;
}

/** How long a Pin request waits for the block to be rebuilt before it gives up. */
const REQUEST_TTL_MS = 5000;
/** After focus landed, how long the request stays armed for the NEXT rebuild. One keyboard Pin was measured
 *  to rebuild its block three times within about 200 ms (the note's own re-render, then two more), each one
 *  discarding the focused button again, so a request that cleared on the first success lost focus on the last. */
const SETTLE_MS = 1500;

interface Request {
	item: string;
	expires: number;
	/** The button the keyboard user pressed (focus still on it, while it lives, is OURS, not "the user went elsewhere"). */
	pressed: HTMLElement | null;
	/** The document it was pressed in (a popout has its own). */
	doc: Document;
	/** The pane (`.workspace-leaf`) it was pressed in. The same note open in two panes renders the same block key
	 *  twice; only a copy in THIS pane may claim, or be taken as a sign the user left. Null: no pane known. */
	leaf: Element | null;
}
const requests = new Map<string, Request>();

const LEAF = '.workspace-leaf';

/** Ask the next chrome mount of the block `blockKey`, in the pane `pressed` sits in, to focus its `item` button
 *  (`data-dse-chrome-item`). */
export function armChromeFocus(blockKey: string, item: string, pressed: HTMLElement | null = null): void {
	const doc = pressed?.ownerDocument ?? document;
	requests.set(blockKey, { item, expires: Date.now() + REQUEST_TTL_MS, pressed, leaf: pressed?.closest(LEAF) ?? null, doc });
	guardFocus(doc);
}

/**
 * While a request waits, focus that lands anywhere but on the pressed button or this pane's own `item` button
 * means the user moved on (a Tab, a click): the request is cancelled AT ONCE. Left to the next rebuild to notice
 * (the check in `claimChromeFocus`), a user who Tabbed to another control of the same block would have focus pulled
 * to Pin by any rebuild inside the window (an outside edit, Sync, a second pane's write). Our own focus calls land on
 * the `item` button, so they pass. One capture-phase listener per document, removed once no request is live.
 */
const guarded = new Set<Document>();
function guardFocus(doc: Document): void {
	if (guarded.has(doc)) return;
	guarded.add(doc);
	doc.addEventListener('focusin', onFocusIn, true);
}
function unguardFocus(): void {
	for (const doc of guarded) doc.removeEventListener('focusin', onFocusIn, true);
	guarded.clear();
}
function onFocusIn(evt: FocusEvent): void {
	const target = evt.target as Element | null;
	for (const [key, req] of [...requests]) {
		if (!liveRequest(key)) continue;
		if (target === req.pressed) continue;
		const isItem = target?.matches?.(`[data-dse-chrome-item="${req.item}"]`) === true;
		if (isItem && (!req.leaf || target?.closest(LEAF) === req.leaf)) continue;
		requests.delete(key); // the user (or something else) took focus elsewhere
	}
	if (!anyLive()) unguardFocus();
}

export function disarmChromeFocus(blockKey: string): void {
	requests.delete(blockKey);
	if (requests.size === 0) unguardFocus();
}

/** The still-valid request for `blockKey`, if any. */
function liveRequest(blockKey: string): Request | undefined {
	const r = requests.get(blockKey);
	if (r && r.expires <= Date.now()) {
		requests.delete(blockKey);
		return undefined;
	}
	return r;
}

/** How long a Pin request stays armed after the pin call itself has returned. The rebuilds it waits for come
 *  after that (the note's re-render is queued by the write), so the request must outlive the call. */
const AFTER_RETURN_MS = 3000;

/**
 * The pin call has returned; `wrote` says whether it changed the note.
 *  - Nothing written (a second press, a `strictBody` element, any Notice path): no rebuild is coming, so the request
 *    is dropped at once. Nothing may move focus later. If the pressed button is still in the document and focus fell
 *    to <body>, put it back.
 *  - Written: the rebuilds come AFTER this (the old button is still in the document now), so the request stays
 *    armed for them, shortened to AFTER_RETURN_MS.
 */
export function settleChromeFocus(blockKey: string, pressed: HTMLElement | null | undefined, wrote: boolean): void {
	const req = liveRequest(blockKey);
	if (req) {
		if (wrote) req.expires = Math.min(req.expires, Date.now() + AFTER_RETURN_MS);
		else disarmChromeFocus(blockKey);
	}
	if (!wrote && pressed?.isConnected && focusIsFree(pressed.ownerDocument)) focusControl(pressed);
}

/** Is any request still valid? (Lapsed ones are dropped as a side effect.) */
function anyLive(): boolean {
	let live = false;
	for (const key of [...requests.keys()]) if (liveRequest(key)) live = true;
	return live;
}

/**
 * Called by `mountChrome` after it built a panel, and by `adoptView` after it moved an existing view into a new
 * section (an adopted view keeps its panel, so it never mounts again). If some block has a live request, watch
 * this element until its button for it is in the document (a fresh render builds it detached, and the block's
 * position is not known until then, so the key is asked for at that moment, not at mount) and focus it when
 * the block's key is the one that asked. The watch outlives the first success while the request does: one
 * keyboard Pin was measured to rebuild its block, or re-insert its section, three times in about 200 ms, each
 * time discarding the focused button again (and nothing of ours runs when Obsidian merely re-inserts an
 * existing section). Each success extends the request by SETTLE_MS, so it lapses on its own once the block
 * has stopped being redrawn; it is dropped at once if anything else holds focus.
 * A mount while no request is live (every ordinary render) costs one `Map.size` read.
 */
export function claimChromeFocus(blockKey: () => string, root: HTMLElement): void {
	if (requests.size === 0) return;
	const doc = root.ownerDocument;
	const win = doc.defaultView;
	const attempt = (): void => {
		const key = blockKey();
		const req = liveRequest(key);
		if (!req) return; // not this block's request (or none left)
		// This element's own button (a nested element's panel has the same attribute, but another chrome root).
		const btn = Array.from(root.querySelectorAll<HTMLElement>(`[data-dse-chrome-item="${req.item}"]`)).find(
			(b) => b.closest('[data-dse-chrome]') === root,
		);
		if (!btn?.isConnected || doc.activeElement === btn) return;
		// Another pane's copy of the same block (same key): not ours to claim, and its rebuild says nothing about the user.
		if (req.leaf && btn.closest(LEAF) !== req.leaf) return;
		if (!focusIsFree(doc)) {
			if (doc.activeElement !== req.pressed) disarmChromeFocus(key); // the user went elsewhere in the meantime
			return; // (focus still on the pressed button: the pressed pane has not been rebuilt yet)
		}
		// A hidden copy (Live Preview's widget) refuses focus: the request stays for the copy that can take it.
		if (focusControl(btn)) req.expires = Date.now() + SETTLE_MS;
	};
	attempt();
	if (!win || !anyLive()) return;
	const observer = new win.MutationObserver(() => {
		attempt();
		if (!anyLive()) done();
	});
	const done = (): void => {
		observer.disconnect();
		win.clearTimeout(timer);
	};
	const timer = win.setTimeout(done, 2 * REQUEST_TTL_MS);
	observer.observe(doc.body, { childList: true, subtree: true });
}
