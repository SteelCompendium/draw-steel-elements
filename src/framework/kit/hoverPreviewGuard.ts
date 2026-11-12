// SC-595 / SC-601 — the click guard that keeps a hover preview alive while a pop-up the plugin opened from it is open. Shared by
// `DseModal` (managedModal.ts, SC-595) and `CompendiumSearchModal` (SC-601); only the anchor test differs (each caller decides
// whether its opener sits inside a `.hover-popover`). Obsidian types only: no `elements` import, so the kit boundary is untouched.
import type { Component } from 'obsidian';

/**
 * Obsidian's page-preview popover hides itself (and unloads the block the opener's view lives in, which closes any modal that view
 * opened and loses what the user typed) on ANY `click` that reaches its window in the BUBBLE phase and is neither default-prevented
 * nor inside the popover. A modal sits in `body`, so the first click inside it did exactly that. This guard is a click listener on
 * the modal's own document, BUBBLE phase, that stops a click that went through `containerEl` (the modal's whole container: box and
 * backdrop) from reaching the window.
 *
 * - Every document-level listener still sees the click (RecoveriesStrip's click-outside, ConditionsModal's and
 *   sccLinkClickHandler's capture listeners all run before or at the document); only window-level bubble listeners (the popover's,
 *   an Obsidian Menu's click-outside) never get it.
 * - NEVER `preventDefault` instead: that is the popover's own "belongs to me" convention, but it also cancels label and checkbox
 *   activation, so an Obsidian toggle (`label.checkbox-container > input`) would stop toggling.
 * - `composedPath()`, not `target` + `contains()`: a control the modal redraws inside its own click handler (ConditionsModal's
 *   "Add condition" and row controls, the pool's condition icons) is detached by the time the click reaches the document, so
 *   `contains()` says no; the path is fixed when the event is dispatched. (ConditionsModal's own click-outside listener has the
 *   same footgun and the same fix.)
 * - The guard outlives `owner`'s unload by one task. A click that CLOSES the modal (Cancel, Confirm, Apply, the backdrop, a nested
 *   confirmation's buttons) runs `close()` at target phase, before the click reaches the document; with the guard gone at once it
 *   reached the window, hid the preview and closed the parent modal (a free-heal Confirm lost the staged heal). Only the guard is
 *   kept; every other listener of the modal still dies synchronously with `owner`.
 *
 * `owner` is the modal's own Component (DseModal's `lifecycle`, CompendiumSearchModal's `prefsOwner`): loaded while the modal is
 * open, unloaded at close. Call it only for a modal opened from inside `.hover-popover`: nothing else needs it, and outside a
 * preview a click inside a modal must reach the window as it always did.
 */
export function guardHoverPreviewClicks(containerEl: HTMLElement, owner: Component): void {
	const doc = containerEl.ownerDocument;
	const win = doc.defaultView ?? window;
	const guard = (evt: MouseEvent): void => {
		if (evt.composedPath().includes(containerEl)) evt.stopPropagation();
	};
	doc.addEventListener('click', guard);
	owner.register(() => {
		win.setTimeout(() => doc.removeEventListener('click', guard), 0);
	});
}
