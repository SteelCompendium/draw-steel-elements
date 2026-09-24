// SC-340 §6.2 — adopt: re-point the writer's host at the new section and move the view's
// root into the new (still detached, B6) `el` SYNCHRONOUSLY, so Obsidian measures and
// inserts the section with its real content (the spike's wait-for-insert variant stalled at
// its backstop in 2/71 adoptions). Obsidian takes the section out of the document during
// its render (B7/B11), so a focused input blurs; focus and caret are restored once `el` is
// inserted. Popout-safe: every window access goes through el.ownerDocument.
import type { MarkdownPostProcessorContext } from 'obsidian';
import type { ViewRegistry, ViewRegistryEntry } from './viewRegistry';

export interface FocusState {
	el: HTMLElement;
	start: number | null;
	end: number | null;
}

/** The focused element inside `root` (and its text selection), or null. */
export function captureFocus(root: HTMLElement): FocusState | null {
	const active = root.ownerDocument.activeElement as HTMLElement | null;
	if (!active || !root.contains(active)) return null;
	let start: number | null = null;
	let end: number | null = null;
	try {
		start = (active as HTMLInputElement).selectionStart ?? null;
		end = (active as HTMLInputElement).selectionEnd ?? null;
	} catch {
		// number/checkbox inputs throw on selectionStart: focus only
	}
	return { el: active, start, end };
}

/** Refocus `state.el` (and its caret) once `el` is in the document; give up after `timeoutMs`. */
export function restoreFocusWhenConnected(el: HTMLElement, state: FocusState, timeoutMs = 5000): void {
	const doc = el.ownerDocument;
	const win = doc.defaultView;
	const restore = (): void => {
		if (!state.el.isConnected || doc.activeElement === state.el) return;
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
	const timer = win.setTimeout(() => observer.disconnect(), timeoutMs);
}

/** Adopt `entry`'s live view into the new section `el`. Always ends the claim. */
export function adoptView(
	registry: ViewRegistry,
	entry: ViewRegistryEntry,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
): void {
	try {
		entry.host.rebind(el, ctx);
		const focus = captureFocus(entry.root);
		el.appendChild(entry.root);
		if (focus) restoreFocusWhenConnected(el, focus);
	} finally {
		registry.finishClaim(entry);
	}
}
