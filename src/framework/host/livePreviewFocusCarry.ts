// SC-602 — keep keyboard focus across an element's OWN save in Live Preview.
//
// FUNKY LOGIC, read before touching: Obsidian releases the old widget's render child INSIDE its Live Preview StateField, while the new
// editor state is computed, i.e. BEFORE CodeMirror updates the DOM (and before any ViewPlugin runs). That is the only moment the old
// root is still in place with focus on its control, so the capture hangs on `ViewRegistry.release` (`beforeRelease`), not on a DOM
// event or a plugin update. The claim side is not new: it is the SC-518 request machinery in `../chrome/focusHandoff.ts` (a request
// keyed by block, scoped to the pane, claimed by the next mount via `claimChromeFocus`), asked for a control's successor instead of a
// named chrome item (`armSuccessorFocus`). If a future Obsidian unloads after the DOM removal, nothing is armed (focus is already on
// <body>) and behaviour degrades to what it was before SC-602; the e2e INIT-L / CTR-L tests go red.
//
// In Reading view a view's own write is ADOPTED (viewRegistry.claim + adoptView): the same root moves into the new section and
// adoptView puts focus back. Live Preview never adopts: every CodeMirror code-block widget gets its own random docId, so
// `claim(ctx.docId, …)` misses and the write's redraw builds a NEW widget, a new root and a new view (registerFrameworkElements.ts).
// The old root, with the focused control in it, is removed by CodeMirror's DOM update and focus falls to <body>.
//
// WHEN TO CAPTURE (measured, Obsidian 1.14.4, SC-602 r1): Obsidian's `setViewData` transaction unloads the old widget's render child
// inside its Live Preview StateField update (`computeSlot` -> removeChild -> our host's onRenderChildUnload -> registry.release),
// i.e. while the NEW STATE is computed, before any ViewPlugin update and before CodeMirror touches the DOM. Focus is still on the
// control then. So the capture runs at that release (`ViewRegistry.beforeRelease`). An identical twin's case is different: the writer's
// widget is handed to the twin below (SC-481/SC-537) and its render child is NOT unloaded; that one is caught by a ViewPlugin
// `update` (before the DOM update), while the writer's entry is still live.
//
// WHAT: if focus sits inside a DSE root drawn in a CodeMirror editor (`.cm-content`) AND that root's view wrote the note within the
// claim window (an unconsumed claim ticket: `ReadingModeBlockHost.replaceSource` records one for the view's own write only), the
// focused control is remembered by its control id + position (`captureControlFocus`) and the block's next mount is asked for its
// successor (`armSuccessorFocus`, the SC-505/SC-518 request machinery, scoped to the pane). The key is the block the write LANDED in
// (`lastWriteLineStart`): a live read of the old widget can already report the twin's line.
//
// Not armed: focus outside the root at that moment (a mouse press never focused it, the user moved on, a modal holds it); an
// external edit (no ticket); Reading view (not in `.cm-content`). The request never fights the user: any focusin elsewhere cancels
// it, it claims only while focus is on <body>, and it lapses on its own.
import { ViewPlugin } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { captureControlFocus, controlSuccessor } from '../kit/controlFocus';
import { armSuccessorFocus } from '../chrome/focusHandoff';
import { CLAIM_WINDOW_MS } from './viewRegistry';
import type { ClaimTicket, ViewRegistry, ViewRegistryEntry } from './viewRegistry';

/** Tickets that already armed a carry: one own write arms one carry (a later outside edit inside the window must not). */
const used = new WeakSet<ClaimTicket>();

/** The block key of the block `entry`'s last write landed in (its live key otherwise). */
function writtenBlockKey(entry: ViewRegistryEntry): string {
	const key = entry.host.blockKey();
	const line = entry.host.lastWriteLineStart;
	return line === null ? key : key.replace(/::\d+$/, `::${line}`);
}

/** Arm a carry for `entry` if focus is inside its Live Preview root and its own save is what is being redrawn. Exported for jest. */
export function carryOwnSaveFocus(entry: ViewRegistryEntry, now = Date.now()): boolean {
	const root = entry.root;
	if (!root.isConnected || !root.closest('.cm-content')) return false;
	const doc = root.ownerDocument;
	const active = doc.activeElement as HTMLElement | null;
	if (!active || active === doc.body || !root.contains(active)) return false;
	const fresh = entry.tickets.filter((t) => now - t.at < CLAIM_WINDOW_MS && !used.has(t));
	if (fresh.length === 0) return false;
	for (const t of entry.tickets) used.add(t);
	const token = captureControlFocus(root);
	if (!token) return false;
	const key = writtenBlockKey(entry);
	armSuccessorFocus(key, (r) => controlSuccessor(r, token), token.ring, active);
	return true;
}

/** The twin hand-off case (see the header): called from the editor's update. Exported for jest. */
export function onEditorUpdate(u: Pick<ViewUpdate, 'docChanged' | 'view'>, registry: ViewRegistry): void {
	if (!u.docChanged) return;
	const active = u.view.dom.ownerDocument.activeElement;
	if (!active || !u.view.dom.contains(active)) return;
	try {
		for (const entry of registry.liveEntries()) if (!entry.released && entry.root.contains(active)) carryOwnSaveFocus(entry);
	} catch (err) {
		console.warn('[DSE] Live Preview focus carry failed', err);
	}
}

/** The CodeMirror extension. Pass to `plugin.registerEditorExtension`. */
export function livePreviewFocusCarryExtension(registry: ViewRegistry): Extension {
	return ViewPlugin.define(() => ({ update: (u: ViewUpdate) => onEditorUpdate(u, registry) }));
}
