// SC-431 — the Escape-consumer registry: lets a containing Obsidian Modal ask "does the
// focused control have something to back out of first (a half-typed draft, an open
// dropdown), and if so back out of just that?" before it treats Escape as "close me".
//
// Why a registry and not a keydown listener on the control: Obsidian's Keymap listens for
// keydown on `window` in the CAPTURE phase and runs the active modal's Scope from there,
// i.e. before the event ever reaches the control. A control's own `stopPropagation()` is
// too late to stop the modal closing; the modal has to consult the control itself
// (managedModal.ts's `onEscapeKey`). A control keeps its own keydown handler for the
// contexts with no modal Scope (a stepper in a note).
import type { Component } from 'obsidian';

const consumers = new WeakMap<EventTarget, () => boolean>();

/**
 * Registers `consume` for `el`: back out of whatever the control is holding (revert a
 * half-typed draft, close an open dropdown), returning true if it did and false when there
 * was nothing to back out of (so the modal closes). Dropped when `owner` unloads, so a
 * closed modal's control never keeps a stale consumer.
 */
export function registerEscapeConsumer(el: EventTarget, consume: () => boolean, owner: Component): void {
	consumers.set(el, consume);
	owner.register(() => {
		if (consumers.get(el) === consume) consumers.delete(el);
	});
}

/** Lets `target` (a keydown's target) consume the Escape if it has something to back out of; true if it did. */
export function consumeEscapeAt(target: EventTarget | null): boolean {
	const consume = target ? consumers.get(target) : undefined;
	return consume ? consume() : false;
}
