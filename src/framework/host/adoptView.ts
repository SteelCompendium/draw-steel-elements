// SC-340 §6.2 — adopt: re-point the writer's host at the new section and move the view's
// root into the new (still detached, B6) `el` SYNCHRONOUSLY, so Obsidian measures and
// inserts the section with its real content (the spike's wait-for-insert variant stalled at
// its backstop in 2/71 adoptions). Obsidian takes the section out of the document during
// its render (B7/B11), so a focused input blurs; focus and caret are restored once `el` is
// inserted. Popout-safe: window access for the restore goes through the FOCUSED element's
// own document (FocusState.doc, captured in captureFocus BEFORE the move — fix round 1,
// M-5), not `el`'s.
import type { MarkdownPostProcessorContext } from 'obsidian';
import type { ViewRegistry, ViewRegistryEntry } from './viewRegistry';

export interface FocusState {
	el: HTMLElement;
	start: number | null;
	end: number | null;
	/** Fix round 1 (M-5): the focused element's OWN document, captured BEFORE the section
	 *  moves — used (not `el`'s, resolved only once the move is already in flight) to decide
	 *  which document's body to observe and which document's activeElement to read. */
	doc: Document;
}

/** The focused element inside `root` (and its text selection), or null. */
export function captureFocus(root: HTMLElement): FocusState | null {
	const doc = root.ownerDocument;
	const active = doc.activeElement as HTMLElement | null;
	if (!active || !root.contains(active)) return null;
	let start: number | null = null;
	let end: number | null = null;
	try {
		start = (active as HTMLInputElement).selectionStart ?? null;
		end = (active as HTMLInputElement).selectionEnd ?? null;
	} catch {
		// number/checkbox inputs throw on selectionStart: focus only
	}
	return { el: active, start, end, doc };
}

/** Refocus `state.el` (and its caret) once `el` is in the document; give up after `timeoutMs`. */
export function restoreFocusWhenConnected(el: HTMLElement, state: FocusState, timeoutMs = 5000): void {
	const doc = state.doc;
	const win = doc.defaultView;
	const restore = (): void => {
		if (!state.el.isConnected || doc.activeElement === state.el) return;
		// Fix round 1 (M-5): a real move measures ~41 ms between blur and reinsertion — long
		// enough for the user to click into a DIFFERENT control in the meantime. Only take
		// focus back when nothing else has claimed it (activeElement is body, or null in some
		// embedding contexts); never fight the user for it.
		if (doc.activeElement !== doc.body && doc.activeElement !== null) return;
		state.el.focus({ preventScroll: true });
		if (state.start !== null) {
			try {
				(state.el as HTMLInputElement).setSelectionRange(state.start, state.end ?? state.start);
			} catch {
				// not a text control
			}
		}
	};
	if (el.isConnected || !win) {
		restore();
		return;
	}
	const observer = new win.MutationObserver(() => {
		if (!el.isConnected) return;
		observer.disconnect();
		win.clearTimeout(timer);
		restore();
	});
	observer.observe(doc.body, { childList: true, subtree: true });
	const timer = win.setTimeout(() => {
		observer.disconnect();
		// Fix round 1 (M-5): a last direct check before giving up — if `el` is connected but
		// the observer (watching state.doc's body) never fired, this is the only remaining
		// chance to restore focus.
		if (el.isConnected) restore();
	}, timeoutMs);
}

/** The marker `adoptView` stamps on `entry.root` for the duration of the DOM move (fix
 *  round 1, I-1). A stepper (or any other commit-on-blur control) uses `closest()` to
 *  find it — see stepper.ts's blur handler. */
export const MOVING_ATTR = 'data-dse-moving';

/**
 * Adopt `entry`'s live view into the new section `el`. Always ends the claim.
 *
 * Fix round 1 (I-1): a real-Chromium probe (headless 149) showed `blur`/`change`/
 * `focusout` fire SYNCHRONOUSLY during `appendChild` itself — while the moved node is
 * STILL CONNECTED, before it is actually detached and reinserted — not after, as jsdom's
 * behavior (and the original `!el.isConnected` guard) assumed. `el.isConnected` alone
 * therefore never catches the adoption blur in a real browser. `entry.root` is marked
 * `data-dse-moving` for the exact duration of the `appendChild` call (order-independent:
 * it covers the move whichever side of it a listener happens to fire on), so a listener
 * can tell "fired because of this move" apart from a genuine user blur regardless of
 * `isConnected`.
 */
export function adoptView(
	registry: ViewRegistry,
	entry: ViewRegistryEntry,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
): void {
	try {
		entry.host.rebind(el, ctx);
		const focus = captureFocus(entry.root);
		entry.root.setAttribute(MOVING_ATTR, '');
		try {
			el.appendChild(entry.root);
		} finally {
			entry.root.removeAttribute(MOVING_ATTR);
		}
		if (focus) restoreFocusWhenConnected(el, focus);
	} finally {
		registry.finishClaim(entry);
	}
}
