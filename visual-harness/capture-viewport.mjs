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
 * grown if it was going to be). Deliberately INDEPENDENT of the measurement that decided
 * the growth: it reads where `#mount` actually sits in the viewport (the same rect the
 * screenshot is cut from), so a wrong growth decision is caught, not repeated. Returns the
 * list of problems (empty = fine).
 * @param {{ viewportHeight: number, mountTop: number, mountBottom: number,
 *           fullPage?: boolean, hiddenOverflow?: string[],
 *           layoutBefore?: string, layoutAfter?: string }} s
 *   `mountTop`/`mountBottom`: `#mount`'s getBoundingClientRect() edges at shot time.
 *   `hiddenOverflow`: for a full-page shot, one description per scrolling ancestor of
 *   `#mount` that still has overflow it is hiding (a full-page shot cannot see past it).
 */
export function captureClipProblems({
	viewportHeight,
	mountTop,
	mountBottom,
	fullPage = false,
	hiddenOverflow = [],
	layoutBefore,
	layoutAfter,
}) {
	const EPS = 0.5; // sub-pixel layout slack, CSS px
	const problems = [];
	if (mountBottom > viewportHeight + EPS) {
		problems.push(
			`its element reaches ${Math.ceil(mountBottom)}px but the viewport is ${viewportHeight}px tall — ` +
				`under the screen-media cascade everything below the viewport paints blank`,
		);
	}
	if (mountTop < -EPS) {
		problems.push(
			`its element starts ${Math.ceil(-mountTop)}px above the top of the viewport (the page was scrolled) — ` +
				`that part of the element paints blank`,
		);
	}
	if (fullPage) {
		for (const h of hiddenOverflow) problems.push(`a full-page shot cannot see past a scroller hiding overflow: ${h}`);
	}
	if (layoutBefore !== undefined && layoutAfter !== undefined && layoutBefore !== layoutAfter) {
		problems.push(
			`growing the viewport changed the element's layout (${layoutBefore} → ${layoutAfter}) — ` +
				`the capture is no longer the one a normal-height viewport would show`,
		);
	}
	return problems;
}
