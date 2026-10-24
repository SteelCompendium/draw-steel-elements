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
//
// SC-518 reuses all of it for the block edit form. Save writes the note and the card is rebuilt, so the pencil that
// opened the form is detached when the form closes and the focus Obsidian returns to it is lost (focus fell to
// <body>). `armFormFocus` (called by the form's Save) asks the rebuilt card for the control that opened the form
// (matched by its accessible name), else the card's Edit pencil, else the card. The ring follows how the form was
// opened: a keyboard open gets the keyboard ring back, a mouse open gets plain focus (no ring forced).

/** `focusVisible` is Chromium 124+; older engines ignore the key. */
export const HANDOFF_FOCUS = { preventScroll: true, focusVisible: true } as FocusOptions;

/** Was this click raised by the keyboard (or assistive tech)? A pointer click has `detail >= 1`. */
export function isKeyboardClick(evt: MouseEvent | undefined | null): boolean {
	return evt?.detail === 0;
}

/** Focus `el` for a keyboard user; true when it really holds focus afterwards (a node that is
 *  detached, `display: none` or inside a hidden copy quietly refuses). */
export function focusControl(el: HTMLElement | null | undefined, ring = true): boolean {
	if (!el || !el.isConnected) return false;
	// SC-518: `ring: false` (a form opened with the mouse) keeps the engine's own rule, which draws no ring after a pointer.
	el.focus(ring ? HANDOFF_FOCUS : { preventScroll: true });
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
	/** SC-518: the accessible name (`aria-label`) of the control that opened the edit form; looked for first, then `item`. Null for a Pin request. */
	label: string | null;
	/** SC-518: show the keyboard ring on the control that takes focus (false: the form was opened with the mouse). */
	ring: boolean;
	expires: number;
	/** Which copy of the block was pressed: its embed (`![[Note]]`) if it sits in one, else its pane (`.workspace-leaf`).
	 *  The same note open in two panes, or embedded twice in one note, renders the same block key several times; only a
	 *  copy in THIS scope may claim, or be taken as a sign the user left. Null: no scope known. */
	scope: Element | null;
	/** The buttons focus may sit on without the request being cancelled: the pressed button plus every button the claim
	 *  focused. Not "any Pin in the pane": a direct jump to ANOTHER block's Pin is the user leaving. */
	ours: WeakSet<Element>;
}
const requests = new Map<string, Request>();

const LEAF = '.workspace-leaf';
const EMBED = '.internal-embed, .markdown-embed';
/** The copy a button belongs to: the innermost embed around it, else its pane. */
const scopeOf = (el: Element): Element | null => el.closest(EMBED) ?? el.closest(LEAF);

/** Ask the next chrome mount of the block `blockKey`, in the copy `pressed` sits in, to focus its `item` button
 *  (`data-dse-chrome-item`). */
export function armChromeFocus(blockKey: string, item: string, pressed: HTMLElement | null = null): void {
	const ours = new WeakSet<Element>();
	if (pressed) ours.add(pressed);
	requests.set(blockKey, { item, label: null, ring: true, expires: Date.now() + REQUEST_TTL_MS, scope: pressed ? scopeOf(pressed) : null, ours });
	guardFocus(pressed?.ownerDocument ?? activeDocument);
}

/** What opened a block edit form: the pressed control and whether the press came from the keyboard. */
export interface FormOpener {
	pressed: HTMLElement;
	keyboard: boolean;
}

/** The opener behind a click event, read synchronously inside its handler (`currentTarget` is gone afterwards).
 *  Null when there is no control to hand focus back to (a form opened without a click). */
export function formOpenerOf(evt: MouseEvent | undefined | null): FormOpener | null {
	const pressed = evt?.currentTarget as HTMLElement | null | undefined;
	return pressed?.nodeType === 1 ? { pressed, keyboard: isKeyboardClick(evt) } : null;
}

/**
 * SC-518 -- the edit form's Save is about to write the block: ask the card that is rebuilt for it to take focus back
 * (see the file header). Armed BEFORE the write because the rebuild can land before the write call returns; the
 * caller settles it with `settleChromeFocus` once the write has an answer. The focus guard cancels it the moment
 * the user moves focus anywhere else, and it lapses on its own, so a write that causes no rebuild leaves nothing behind.
 */
export function armFormFocus(blockKey: string, opener: FormOpener): void {
	const ours = new WeakSet<Element>([opener.pressed]);
	requests.set(blockKey, {
		item: 'edit',
		label: opener.pressed.getAttribute('aria-label'),
		ring: opener.keyboard,
		expires: Date.now() + REQUEST_TTL_MS,
		scope: scopeOf(opener.pressed),
		ours,
	});
	guardFocus(opener.pressed.ownerDocument);
}

/**
 * While a request waits, focus that lands anywhere but on this copy's own `item` button means the user moved on (a
 * Tab, a click): the request is cancelled AT ONCE. Left to the next rebuild to notice, a user who Tabbed to another
 * control of the same block would have focus pulled to Pin by any rebuild inside the window (an outside edit, Sync,
 * a second pane's write). The pressed button and every button our own focus calls land on are in the request's
 * `ours` set, so they pass. One capture-phase listener per document, removed once no request is live.
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
		if (target && req.ours.has(target)) continue;
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
 * Called by `mountChrome` after it built a panel (and by the pipeline for an element without one, SC-518). (Not by `adoptView`: only the view's OWN write is adopted, through
 * a claim ticket `host.replaceSource` records, and the pin's write comes from the sidebar binder, so a pin never
 * adopts; an adopted view keeps its panel and would not mount again, but no rebuild this request waits for is one.)
 * If some block has a live request, watch
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
		let btn = Array.from(root.querySelectorAll<HTMLElement>(`[data-dse-chrome-item="${req.item}"]`)).find(
			(b) => b.closest('[data-dse-chrome]') === root,
		);
		if (req.label !== null) {
			// SC-518: the edit form's opener comes back by name first (the pencil, or the hero's "Edit definition", which
			// is no chrome item), then the card's Edit pencil (`item`), then the card itself. Only this element's own
			// controls count; a nested element's same-named button has another `[data-dse-element]` root.
			const opener = Array.from(root.querySelectorAll<HTMLElement>('button')).find(
				(b) => b.getAttribute('aria-label') === req.label && b.closest('[data-dse-element]') === root,
			);
			// (A card that is still being inserted has no controls in the document yet; `root.isConnected` keeps the card
			// fallback for a card that is built and has none.)
			btn = opener ?? btn ?? (root.isConnected ? root : undefined);
		}
		if (!btn || doc.activeElement === btn) return; // (`focusControl` below refuses a node that is not in the document)
		// Another pane's (or another embed's) copy of the same block, same key: not ours to claim, and its rebuild says
		// nothing about the user.
		if (req.scope && scopeOf(btn) !== req.scope) return;
		// Something holds focus. The focusin guard has already cancelled the request if the user put it there, so it is
		// the pressed button (this copy has not been torn down yet) or a Pin already claimed: leave it.
		if (!focusIsFree(doc)) return;
		// A hidden copy (Live Preview's widget) refuses focus: the request stays for the copy that can take it.
		req.ours.add(btn); // before the focus call: its focusin goes through the guard
		if (btn === root && !root.hasAttribute('tabindex')) root.tabIndex = -1; // SC-518: focusable by script, not a new tab stop
		if (focusControl(btn, req.ring)) req.expires = Date.now() + SETTLE_MS;
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
