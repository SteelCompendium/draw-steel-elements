// Plan 09 Task 8 (D2 §3.x / OD-8 / SD-2) — the ONE sanctioned write of the
// --dse-condition-color scoped custom property, shared by every condition-icon site
// (the two condition modals here; Initiative T9 and the minion-pool T3 site adopt it).
//
// User-supplied condition colors come straight out of note YAML, so they are treated
// as untrusted: applyConditionColor validates through CSS.supports('color', v) and
// only a VALID color reaches the element — as a custom property, never el.style.color
// (SC-5). Invalid/absent input CLEARS the property so the consuming CSS rule falls
// back to the muted token: `color: var(--dse-condition-color, var(--dse-fg-muted))`.
//
// applyConditionEffect is the companion for the `effect:` field — the effect-class
// block was duplicated verbatim across both condition modals (the legacy "TODO -
// this is duplicated code") and also passed unvalidated user text into classList.add
// (which THROWS on whitespace). The class only toggles for the known vocabulary.

/** The customize-dropdown effect vocabulary (the .condition-effect-* CSS classes). */
export const CONDITION_EFFECTS = ['blink', 'glow', 'glow-pulse', 'breathing', 'blur-pulse'] as const;

/**
 * Applies a user-picked condition color to `el` as the --dse-condition-color custom
 * property — validated via CSS.supports (OD-8/SD-2). Invalid or absent input clears
 * the property (setProperty with an empty value removes the declaration, per CSSOM),
 * so the icon falls back to var(--dse-fg-muted) through the CSS var() default.
 */
export function applyConditionColor(el: HTMLElement, color: string | undefined): void {
	const valid =
		!!color &&
		typeof CSS !== 'undefined' &&
		typeof CSS.supports === 'function' &&
		CSS.supports('color', color);
	el.style.setProperty('--dse-condition-color', valid && color ? color : '');
}

/**
 * Reflects a condition's `effect:` onto `el` as its .condition-effect-<effect> class,
 * clearing every other effect class first. 'static', unknown strings, and absent
 * input all resolve to NO effect class.
 */
export function applyConditionEffect(el: HTMLElement, effect: string | undefined): void {
	for (const known of CONDITION_EFFECTS) {
		el.classList.remove(`condition-effect-${known}`);
	}
	if (effect && (CONDITION_EFFECTS as readonly string[]).includes(effect)) {
		el.classList.add(`condition-effect-${effect}`);
	}
}
