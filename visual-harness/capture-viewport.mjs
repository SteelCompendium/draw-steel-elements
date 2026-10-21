// SC-349 — pure decision logic for "no browser-camera capture may come out clipped".
//
// WHY THIS EXISTS. The sweep's browser context is 900×1200 CSS px (shoot.mjs). Every
// SCREEN-media capture runs under Obsidian's real pinned app.css, whose
// `html, body { height: 100% }` + `body { overflow: clip }` make the document exactly one
// viewport tall and clip everything below it; `#mount` is taller than that for ~100
// captures, and Chromium paints the part below the viewport's bottom edge as blank
// white (the PNG still comes out the element's full height). Print-MEDIA captures
// (`--steel-realprint`) are immune: the sheet's `@media print` block frees body
// (`overflow: auto`, `height: auto`).
//
// THE FIX, in shoot.mjs `snap()`: when a capture's bottom edge is below the viewport's
// bottom edge, grow the viewport to cover it for the shot and restore it after. A
// capture that already fits is shot at the original size, byte for byte as before.
// This module holds the arithmetic so it can be tested without a browser.

/**
 * The viewport height (CSS px) a capture needs, or `null` when it already fits.
 * @param {number} viewportHeight current viewport height, CSS px
 * @param {number[]} bottoms bottom edge of every thing the shot must contain, in
 *   document coordinates (rect.bottom + scrollY), CSS px
 * @returns {number | null}
 */
export function enlargedViewportHeight(viewportHeight, bottoms) {
	const finite = bottoms.filter((b) => Number.isFinite(b));
	if (!finite.length) return null;
	// Ceil: a fractional bottom (e.g. 2077.98 + 32 top) still has to fit, and a viewport
	// is a whole number of CSS px.
	const needed = Math.ceil(Math.max(...finite));
	return needed > viewportHeight ? needed : null;
}

/**
 * The in-run gate's verdict for ONE capture, evaluated at capture time (viewport already
 * grown if it was going to be). Returns the list of problems (empty = fine).
 * @param {{ viewportHeight: number, bottoms: number[],
 *           layoutBefore?: string, layoutAfter?: string }} s
 */
export function captureClipProblems({ viewportHeight, bottoms, layoutBefore, layoutAfter }) {
	const problems = [];
	const finite = bottoms.filter((b) => Number.isFinite(b));
	const needed = finite.length ? Math.ceil(Math.max(...finite)) : 0;
	if (needed > viewportHeight) {
		problems.push(
			`captured element reaches ${needed}px but the viewport is ${viewportHeight}px tall — ` +
				`everything below ${viewportHeight}px paints blank`,
		);
	}
	if (layoutBefore !== undefined && layoutAfter !== undefined && layoutBefore !== layoutAfter) {
		problems.push(
			`growing the viewport changed the element's layout (${layoutBefore} → ${layoutAfter}) — ` +
				`the capture is no longer the one a normal-height viewport would show`,
		);
	}
	return problems;
}
