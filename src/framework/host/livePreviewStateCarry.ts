// SC-605 — hand a view's opt-in session state (`ElementView.carryState`) across its OWN save in Live Preview.
//
// FUNKY LOGIC, read before touching (and read `livePreviewFocusCarry.ts`'s header first: this is its sibling, same capture point).
// In Live Preview a view's own write is never adopted; Obsidian releases the old widget's render child inside its StateField
// (`ViewRegistry.beforeRelease`), while the old root is still in place, and the redraw builds a NEW view with a new root. SC-602 carries
// keyboard focus from there; this carries state the old view holds that is not note content (the initiative tracker's half-typed Malice
// quick-add, SC-589's draft), so the new view starts with it.
//
// WHY ARMED BY THE OWN-WRITE TICKET, NOT BY FOCUS: the press that saves is usually a MOUSE click, and the click shield has blurred the
// boxes (and focus is on the editor or <body>) by the time the save lands, so "focus is inside the root" (SC-602's test) is false for
// the main case. The ticket (`ReadingModeBlockHost.replaceSource` records one for the view's own write only) is what says "this redraw
// is the view's own save". It is also the outside-edit guard: an edit of the note from elsewhere (another editor, a sync, the user typing
// in the note) redraws the tracker with no ticket, so nothing is captured and the boxes start empty as they always did. Do not relax
// this to "any redraw of the block": that resurrects a draft the user has since abandoned.
//
// CAPTURE: `carryOwnSaveState(entry)`, from `beforeRelease` (and, for the identical-twin hand-off, from a CodeMirror update whose
// transaction is Obsidian's `setViewData` (userEvent "set"), while the writer's entry is still live; see SC-602's header). Only a
// root drawn in a CodeMirror editor (`.cm-content`), only with a fresh, unused own-write ticket, only for a view that implements
// `carryState`. The state is read AT THAT MOMENT (what the boxes hold when the old tracker is removed, so text typed after the press but
// before the save lands counts), keyed by the block the write LANDED in (`writtenBlockKey`), and scoped to the pane (or embed) the old
// root sat in.
//
// EMPTY CAPTURE DROPS AN OLDER CARRY: a capture with nothing to carry (`carryState()` undefined: empty boxes, e.g. right after Add, or
// boxes the user cleared) deletes any carry still armed for that block. Otherwise a carry armed by an earlier save, not yet claimed
// (its redraw has not mounted), would outlive the user's later emptying and bring the old draft back on the next redraw.
//
// CLAIM: `takeCarriedState`, called by the pipeline for the next mount, BEFORE `view.mount`, so the view builds with the state and
// nothing flashes. Why take-before-mount is safe: the redraw's root is already in the document (`isConnected`, inside `.cm-content`)
// by the time the pipeline gets there, because `prepareModel`'s awaits (the model read) run first and CodeMirror has attached the
// widget by then (measured in Obsidian 1.14.4, SC-605 r1: 16/16 first-frame samples of the redrawn tracker already held the draft,
// callouts included). If a future Obsidian mounts into a root that is not yet connected, `takeCarriedState` takes nothing and the
// tracker starts empty: the behaviour before SC-605, never a wrong draft (the e2e INIT-L09..L13/L15/L17 go red).
// One-shot (taken = deleted) and bounded by CARRY_TTL_MS, so a later redraw (an outside edit, a second pane) never gets it. Only a
// root in `.cm-content`, in the same pane / embed, with the same block key, may take it.
//
// A RELEASE INSIDE THE TICKET-TO-REDRAW WINDOW IS TREATED AS THE SAVE'S REDRAW: capture runs on any `beforeRelease` with a fresh ticket,
// whatever caused the release. If a leaf navigates away inside the save's ~10 ms vault `modify` window and back within CARRY_TTL_MS,
// the new mount takes the draft (measured, SC-605 r3 probe ZZR3-11; base shows empty). No person can time that; pressing then
// navigating inside the debounce, and close/reopen, both start empty.
//
// KNOWN RISK, not observed: Obsidian can keep a `display:none` copy of a widget in the same leaf (see `focusHandoff.ts`). If such a
// hidden copy of the WRITTEN block were mounted before the visible one it would take the one-shot carry and the visible tracker would
// start empty. It cannot be filtered here: the root is empty and its visibility unknowable before mount. Every measured redraw gave the
// visible root the draft; if this ever shows, claim after mount and test `offsetParent` instead.
import { ViewPlugin } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { writtenBlockKey } from './livePreviewFocusCarry';
import { CLAIM_WINDOW_MS } from './viewRegistry';
import type { ClaimTicket, ViewRegistry, ViewRegistryEntry } from './viewRegistry';

/** How long an armed carry waits for its block's next mount. The redraw's mount follows the release within the same transaction
 *  (plus the pipeline's own awaits), so a real redraw claims it almost at once; this only bounds a carry whose redraw never mounts
 *  (an error card, a widget that was never drawn) so an unrelated redraw of the block later (an outside edit) cannot claim it. 1.5 s
 *  leaves a loaded host room and is still short of a user-caused second redraw. */
export const CARRY_TTL_MS = 1500;

/** The slice of ElementView this module reads (the optional SC-605 seam, framework/view.ts). */
interface CarryingView {
	carryState?(): unknown;
}

interface Carry {
	state: unknown;
	/** The pane (or embed) the old root sat in: only a mount in the same one may take it (the same note in two panes). */
	scope: Element | null;
	expires: number;
}
const carries = new Map<string, Carry>();

/** Tickets that already captured: one own write captures once (the twin's editor update, then its later release). */
const used = new WeakSet<ClaimTicket>();

const LEAF = '.workspace-leaf';
const EMBED = '.internal-embed, .markdown-embed';
/** The copy a root belongs to: the innermost embed around it, else its pane (same rule as focusHandoff.ts). */
const scopeOf = (el: Element): Element | null => el.closest(EMBED) ?? el.closest(LEAF);

/** Capture `entry`'s carry if its own save is what is being redrawn in Live Preview. Exported for jest. */
export function carryOwnSaveState(entry: ViewRegistryEntry, now = Date.now()): boolean {
	const view = entry.view as unknown as CarryingView;
	if (typeof view.carryState !== 'function') return false;
	const root = entry.root;
	if (!root.isConnected || !root.closest('.cm-content')) return false;
	const fresh = entry.tickets.filter((t) => now - t.at < CLAIM_WINDOW_MS && !used.has(t));
	if (fresh.length === 0) return false;
	for (const t of entry.tickets) used.add(t);
	for (const [k, c] of carries) if (c.expires <= now) carries.delete(k); // sweep: a carry whose redraw never mounted must not pin its pane element
	const key = writtenBlockKey(entry);
	const state = view.carryState();
	if (state === undefined) {
		carries.delete(key); // nothing to carry now: an older, unclaimed carry for this block must not come back (see the header)
		return false;
	}
	carries.set(key, { state, scope: scopeOf(root), expires: now + CARRY_TTL_MS });
	return true;
}

/** The identical-twin hand-off (see the header): called from the editor's update. Exported for jest. */
export function onEditorUpdateState(u: Pick<ViewUpdate, 'docChanged' | 'view' | 'transactions'>, registry: ViewRegistry): void {
	if (!u.docChanged) return;
	if (!u.transactions.filter((tr) => tr.docChanged).every((tr) => tr.isUserEvent('set'))) return; // only Obsidian's setViewData
	try {
		for (const entry of registry.liveEntries()) if (!entry.released && u.view.dom.contains(entry.root)) carryOwnSaveState(entry);
	} catch (err) {
		console.warn('[DSE] Live Preview state carry failed', err);
	}
}

/** The CodeMirror extension. Pass to `plugin.registerEditorExtension`. */
export function livePreviewStateCarryExtension(registry: ViewRegistry): Extension {
	return ViewPlugin.define(() => ({ update: (u: ViewUpdate) => onEditorUpdateState(u, registry) }));
}

function live(key: string, now: number): Carry | undefined {
	const c = carries.get(key);
	if (c && c.expires <= now) {
		carries.delete(key);
		return undefined;
	}
	return c;
}

/**
 * The pipeline's claim, for a view that implements `receiveCarriedState`: call it BEFORE `view.mount`. Returns the carried state
 * when `root` is the one (in the document, in a CodeMirror editor, the same block, the same pane / embed) and takes it (one-shot);
 * `undefined` otherwise. A root that is not in the document yet takes nothing (measured: an own-save redraw's root always is, by
 * the time the pipeline mounts, after `prepareModel`'s awaits); that degrades to the behaviour before SC-605 (empty boxes), never to
 * another block's draft. A hidden `display:none` copy of the block could in principle take it first (see the header).
 */
export function takeCarriedState(blockKey: () => string, root: HTMLElement, now = Date.now()): unknown {
	if (carries.size === 0 || !root.isConnected || !root.closest('.cm-content')) return undefined;
	const key = blockKey();
	const c = live(key, now);
	if (!c) return undefined;
	if (c.scope && scopeOf(root) !== c.scope) return undefined;
	carries.delete(key);
	return c.state;
}

/** Forget every carry: plugin unload (registerFrameworkElements) and jest. */
export function clearCarriedState(): void {
	carries.clear();
}
