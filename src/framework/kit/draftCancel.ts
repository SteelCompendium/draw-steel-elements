// SC-431 — the draft-cancel registry: lets a containing Obsidian Modal ask "does the
// focused control hold a half-typed draft, and if so revert just that?" before it treats
// Escape as "close me".
//
// Why a registry and not a keydown listener on the control: Obsidian's Keymap listens for
// keydown on `window` in the CAPTURE phase and runs the active modal's Scope from there,
// i.e. before the event ever reaches the input. A control's own `stopPropagation()` is
// too late to stop the modal closing; the modal has to consult the control itself
// (managedModal.ts's `onEscapeKey`). The control still keeps its own keydown handler for
// the contexts with no modal Scope (a stepper in a note).
import type { Component } from 'obsidian';

const cancelers = new WeakMap<EventTarget, () => boolean>();

/**
 * Registers `cancel` for `el`: revert a half-typed draft, returning true if it did (the
 * draft was dirty) and false when there was nothing to revert. Dropped when `owner`
 * unloads, so a closed modal's field never keeps a stale canceler.
 */
export function registerDraftCancel(el: EventTarget, cancel: () => boolean, owner: Component): void {
	cancelers.set(el, cancel);
	owner.register(() => {
		if (cancelers.get(el) === cancel) cancelers.delete(el);
	});
}

/** Reverts the draft of `target` (a keydown's target) if it holds a dirty one; true if it did. */
export function cancelDraftAt(target: EventTarget | null): boolean {
	const cancel = target ? cancelers.get(target) : undefined;
	return cancel ? cancel() : false;
}
