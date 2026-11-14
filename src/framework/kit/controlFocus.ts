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
//
// SC-626 adds two opt-in refinements, both inert for a view that does not use them (initiative, conditions):
//   - `at` (the `data-dse-focus-at` attribute, on the control or an ancestor inside the root): WHICH one, when position is not a stable
//     name for it (the montage's cells: the set of cells that are controls changes when the montage completes). With it, the successor is
//     the control of the family that carries the same value, never a neighbour by position.
//   - `fallbacks`: family -> the families to try, in order, when the control's own family has no USABLE control after the rebuild
//     (none at all, or every one disabled: End round gone because the montage ended, Log an action disabled because every hero has
//     acted). A family with an entry also skips a disabled control for the nearest enabled one of the same family. Without an entry
//     the old rule stands, so no existing caller changes.
import { CONTROL_ATTR } from './controlId';
import { focusControl, focusIsFree } from '../chrome/focusHandoff';

/** An id -> family-name map for controls that change id when they are used (e.g. `init.captain.make` -> `init.captain`). */
export type ControlFamilies = Readonly<Record<string, string>>;

/** SC-626: names WHICH control of a family a node is, where position is not stable (see the header). Read from the control or its nearest ancestor in the root. */
export const FOCUS_AT_ATTR = 'data-dse-focus-at';

/** SC-626: family -> the families to hand focus to, in order, when its own family has no usable control after a rebuild. */
export type ControlFallbacks = Readonly<Record<string, readonly string[]>>;

/** SC-626: a view's focus rules in one value (what `ElementView.controlFocusRules` returns, and what the Live Preview carry reads). */
export interface ControlFocusRules {
	families?: ControlFamilies;
	fallbacks?: ControlFallbacks;
}

/** What `captureControlFocus` remembers about the focused control. `family` is null when the focused node carried no control id. */
export interface ControlFocus {
	family: string | null;
	nth: number;
	ring: boolean;
	/** SC-626: the `data-dse-focus-at` value of the focused control, when it had one. */
	at?: string;
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
	const at = atOf(root, control);
	return { family, nth: Math.max(0, controlsOf(root, family, families).indexOf(control)), ring, ...(at === null ? {} : { at }) };
}

/** The `data-dse-focus-at` value that applies to `el` (its own, else its nearest ancestor's), only when the carrier is inside `root`. */
function atOf(root: HTMLElement, el: HTMLElement): string | null {
	const carrier = el.closest<HTMLElement>(`[${FOCUS_AT_ATTR}]`);
	return carrier && root.contains(carrier) ? carrier.getAttribute(FOCUS_AT_ATTR) : null;
}

/** Can `el` take focus? (A disabled button refuses it quietly.) */
const usable = (el: HTMLElement): boolean => !el.matches(':disabled, [aria-disabled="true"]');

/** Hand focus to the rebuilt successor of what `captureControlFocus` saw; true when something now holds focus. A no-op for a null
 *  token, and when focus is already somewhere (the user, or a modal, put it there). Call it once the root is no longer `inert`. */
export function restoreControlFocus(root: HTMLElement, focus: ControlFocus | null, families: ControlFamilies = {}, fallbacks: ControlFallbacks = {}): boolean {
	if (!focus || !focusIsFree(root.ownerDocument)) return false;
	const target = controlSuccessor(root, focus, families, fallbacks);
	if (target === root && !root.hasAttribute('tabindex')) root.tabIndex = -1;
	return focusControl(target, focus.ring);
}

/** SC-602: the node in `root` that stands for what `captureControlFocus` saw (the nth control of the family, else the family's last,
 *  else `root` itself). Pure lookup: never focuses, never sets `tabindex`.
 *  SC-626: a token with `at` takes the family's control carrying the same value (never a positional neighbour); a family that has an
 *  entry in `fallbacks` takes its nearest USABLE control (forward first, then back), else the first usable control of each fallback
 *  family in turn, else `root`. */
export function controlSuccessor(root: HTMLElement, focus: ControlFocus, families: ControlFamilies = {}, fallbacks: ControlFallbacks = {}): HTMLElement {
	if (focus.family === null) return root;
	const own = controlsOf(root, focus.family, families);
	const pool = focus.at === undefined ? own : own.filter((el) => atOf(root, el) === focus.at);
	const chain = fallbacks[focus.family];
	if (!chain) return (focus.at === undefined ? pool[Math.min(focus.nth, pool.length - 1)] : pool[0]) ?? root;
	const start = focus.at === undefined ? Math.min(focus.nth, pool.length - 1) : 0;
	for (let d = 0; d < pool.length; d++) {
		for (const el of [pool[start + d], pool[start - d]]) if (el && usable(el)) return el;
	}
	for (const id of chain) {
		const hit = controlsOf(root, familyOf(id, families), families).find(usable);
		if (hit) return hit;
	}
	return root;
}
