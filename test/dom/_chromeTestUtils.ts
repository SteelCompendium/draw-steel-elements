// SC-169 round 3 (the rollout) — one shared helper for the suites that assert an element
// mounts no interactive controls of its own.
//
// Those assertions predate element chrome. Once a family opts into the `chrome` slot its
// root also carries the framework's standard panel and collapsed bar, whose buttons are
// neither the element's controls nor write affordances: collapse/expand is view state that
// lives in the SessionStore and never touches the note, and the edit item is separately
// gated on `host.canPersist` + the default-OFF `authoringControls` preference.
//
// So the right update to "no buttons" is NOT to delete the assertion or to relax it to a
// count — it is to keep asserting emptiness over exactly the region the test was ever about:
// everything that is not framework chrome. A real control creeping into an element body
// still fails, loudly, with the offending node named.
//
// Deliberately a filter over the returned nodes rather than a `:not(.dse-chrome *)` selector:
// `:not()` with a complex (descendant) argument is Selectors Level 4 and its jsdom support
// has moved around, and a selector that silently stops matching would turn this guard vacuous
// — the exact failure mode it exists to prevent.
const INTERACTIVE = 'button, input, select, textarea, [tabindex]';

/** True when `el` is part of the framework's chrome (the panel or the collapsed bar). */
export function isChromeNode(el: Element): boolean {
	return el.closest('.dse-chrome, .dse-chrome-summary') !== null;
}

/**
 * Every interactive node under `root` that is NOT framework chrome, as an array of tag +
 * class strings — an array so a failure prints what it found instead of just a count.
 */
export function interactiveOutsideChrome(root: ParentNode): string[] {
	return Array.from(root.querySelectorAll(INTERACTIVE))
		.filter((el) => !isChromeNode(el))
		.map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
}

/** The same idea for a plain `button` sweep (the read-only "zero write affordances" tests). */
export function buttonsOutsideChrome(root: ParentNode): string[] {
	return Array.from(root.querySelectorAll('button'))
		.filter((el) => !isChromeNode(el))
		.map((el) => el.getAttribute('aria-label') ?? el.className);
}
