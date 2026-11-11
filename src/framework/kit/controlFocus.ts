// SC-588 — keep keyboard focus across a whole-element rebuild. A view that rebuilds by emptying its root and mounting again
// (`ElementView.update()`'s default path) throws away the node that held focus, and focus falls to <body>: a keyboard user who
// pressed Advance round (or Enter in a quick-add box) has to Tab in again from the top of the note. The fix is SC-518's shape,
// done once at the rebuild site: `captureControlFocus` BEFORE the rebuild, `restoreControlFocus` after it.
//
// WHAT IS REMEMBERED is the focused control's `data-dse-control` id (controlId.ts) and its position among the root's controls of
// that id (`nth`: a roster of identical buttons keeps its place), never the node. A control that changes identity when pressed (Make
// captain becomes Relieve captain) is named by a FAMILY: `families` maps an id to the shared name, and the successor is the nth
// control of the family.
//
// WHAT IS NOT: nothing is captured unless focus was INSIDE the root. A rebuild raised from elsewhere (another pane, a modal, a
// file-change re-render) never moves focus, and `restoreControlFocus` leaves it alone when something already holds it.
//
// WHERE IT LANDS: the successor control; else the last control of the family (the list shrank); else the root itself (made
// focusable by script with `tabindex="-1"`, not a new Tab stop) — never <body>. The keyboard ring follows what the old node showed
// (`:focus-visible` read before the rebuild), so a mouse press gets plain focus and a key press keeps its ring.
import { CONTROL_ATTR } from './controlId';
import { focusControl, focusIsFree } from '../chrome/focusHandoff';

/** An id -> family-name map for controls that change id when they are used (e.g. `init.captain.make` -> `init.captain`). */
export type ControlFamilies = Readonly<Record<string, string>>;

/** What `captureControlFocus` remembers about the focused control. `family` is null when the focused node carried no control id. */
export interface ControlFocus {
	family: string | null;
	nth: number;
	ring: boolean;
}

const familyOf = (id: string, families: ControlFamilies): string => families[id] ?? id;

/** Every control of `family` inside `root`, in document order. */
function controlsOf(root: HTMLElement, family: string, families: ControlFamilies): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(`[${CONTROL_ATTR}]`)).filter(
		(el) => familyOf(el.getAttribute(CONTROL_ATTR) ?? '', families) === family,
	);
}

/** Did `el` draw the keyboard ring? An engine without `:focus-visible` throws on the selector: assume it did. */
function showedRing(el: Element): boolean {
	try {
		return el.matches(':focus-visible');
	} catch {
		return true;
	}
}

/** Remember the focused control of `root`, or null when focus is not inside it (nothing to hand back). */
export function captureControlFocus(root: HTMLElement, families: ControlFamilies = {}): ControlFocus | null {
	const active = root.ownerDocument.activeElement;
	if (!active || active === root.ownerDocument.body || !root.contains(active)) return null;
	const ring = showedRing(active);
	const control = active.closest<HTMLElement>(`[${CONTROL_ATTR}]`);
	if (!control || !root.contains(control)) return { family: null, nth: 0, ring };
	const family = familyOf(control.getAttribute(CONTROL_ATTR) ?? '', families);
	return { family, nth: Math.max(0, controlsOf(root, family, families).indexOf(control)), ring };
}

/** Hand focus to the rebuilt successor of what `captureControlFocus` saw; true when something now holds focus. A no-op for a null
 *  token, and when focus is already somewhere (the user, or a modal, put it there). Call it once the root is no longer `inert`. */
export function restoreControlFocus(root: HTMLElement, focus: ControlFocus | null, families: ControlFamilies = {}): boolean {
	if (!focus || !focusIsFree(root.ownerDocument)) return false;
	const successors = focus.family === null ? [] : controlsOf(root, focus.family, families);
	const target = successors[Math.min(focus.nth, successors.length - 1)] ?? root;
	if (target === root && !root.hasAttribute('tabindex')) root.tabIndex = -1;
	return focusControl(target, focus.ring);
}
