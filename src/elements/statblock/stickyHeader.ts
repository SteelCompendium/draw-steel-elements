// src/elements/statblock/stickyHeader.ts — SC-160: the statblock STICKY MINI-HEADER.
//
// A port of the v2 site's `.sb__sticky` augmentation (steel-statblock.css "STICKY
// mini-header", markup from steel-etl `renderStatblockSticky`): while a statblock's own
// header has scrolled out of the top of its scroll container, a compact bar pins there
// carrying the creature's name, role, the five primary stats, the five characteristics
// and — behind the `sbStickyMeta` sub-toggle — a second row of secondary stats.
//
// ────────────────────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT A STRAIGHT COPY OF THE SITE (SC-123 deferred it for exactly this)
// ────────────────────────────────────────────────────────────────────────────────────
// The site reveals the bar with a pure-CSS SCROLL-DRIVEN ANIMATION
// (`animation-timeline: view()` on the head's own view-timeline). That cannot be the
// plugin's mechanism, for three independent reasons:
//
//  1. `[data-dse-reduce-motion='true'] * { animation: none !important }` is a shipped
//     preference (and the visual harness page sets the same kill-switch globally). A
//     reduce-motion reader would lose the FEATURE, not just its easing — a reveal that
//     only exists as an animation is not a reveal, it is an animation.
//  2. The plugin's support floor is Chromium 106 (see the SUPPORT FLOOR notes in
//     styles-source.css); scroll-driven animations landed in 115. The site's own
//     `@supports (animation-timeline: view())` guard degrades to "no mini-header at
//     all", which is fine for a website and not fine for a setting that ships ON.
//  3. Firefox has no scroll-driven animations at all. Irrelevant to Obsidian today, but
//     it is the reason the site's own comment calls the reveal best-effort.
//
// What DOES transplant, verbatim and for free, is the PARKING half: `position: sticky`
// resolves against the nearest scrolling ancestor automatically, so one CSS rule covers
// every render context the plugin has — the reading-view preview scroller, a sidebar
// leaf (its own scroller), a pop-out window (its own document), and a canvas node. No
// per-context measurement, no `--sticky-top` constant (the plugin has no fixed chrome
// inside the scroller to clear, unlike Material's header+tabs), no JS scroll listener.
//
// So the split is: **CSS parks it, one IntersectionObserver decides when it is visible.**
// The observer is the smallest possible piece of JS — it answers only the one question
// CSS cannot express before Chromium 115 ("is the real header scrolled out of the
// SCROLLER, not the window?") and writes a single class.
//
// ────────────────────────────────────────────────────────────────────────────────────
// THE ZERO-HEIGHT ANCHOR SPLIT IS MANDATORY (inherited from the site, same reasoning)
// ────────────────────────────────────────────────────────────────────────────────────
//   .dse-sb__sticky        — a ZERO-HEIGHT `position: sticky` ANCHOR. Reserves no flow.
//   .dse-sb__sticky-inner  — the visible bar, `position: absolute` INSIDE the anchor.
// The anchor is emitted BEFORE the card, so if the bar reserved flow space, revealing it
// would push the real header down — which moves the very geometry the observer measures,
// which re-fires the observer, which moves it again. The site hit exactly that bistable
// loop (its "summoner-minion jitter") and fixed it the same way. Absolute positioning
// takes the bar out of flow entirely, so the reveal can never touch the head's geometry.
//
// ────────────────────────────────────────────────────────────────────────────────────
// INERT CONTEXTS
// ────────────────────────────────────────────────────────────────────────────────────
// The bar is SCREEN-ONLY chrome. Its base rule is `display: none` and only a Steel,
// non-print, non-read-only, sticky-enabled root turns it on (styles-source.css), so
// print, PDF export and the on-screen print-preview twin never lay it out at all — the
// element generates no box, which is why adding this DOM cannot move a frozen
// `*--steel-print.png` byte. Canvas cards are `data-dse-readonly` (the pipeline stamps
// it from `host.canPersist`), and this module additionally declines to wire an observer
// there, so a canvas node is inert twice over.
import type { Component } from 'obsidian';

/** One primary-stat / secondary-stat pair, already stringified by the caller. */
export interface StickyPair {
	label: string;
	value: string;
}

/** One characteristic: the boxed initial plus its formatted value. */
export interface StickyChar {
	initial: string;
	value: string;
}

/** Everything the mini-header renders. Derived by the view from the SAME strings the
 *  full card prints (`statblockHeaderParts` + `renderMeta`/`renderChars`), so the bar can
 *  never disagree with the header it stands in for. */
export interface StickyHeaderParts {
	name: string;
	/** The "Horde Controller" organization+role line — the card's own `rightPrimary`. */
	role: string;
	/** Size / Speed / Stamina / Stability / Free Strike. */
	defenses: readonly StickyPair[];
	/** Might / Agility / Reason / Intuition / Presence. */
	characteristics: readonly StickyChar[];
	/** Row 2: Movement, (With Captain), Immunity, Weakness — the site's sticky order,
	 *  which differs from the full card's meta grid on purpose (steel-etl
	 *  renderStatblockSticky's `metaPairs`). */
	secondary: readonly StickyPair[];
}

/** Class on the anchor while the real header is scrolled out — the ONE thing the
 *  observer writes. Exported so the DOM tests and the visual harness can name it. */
export const STICKY_STUCK_CLASS = 'dse-sb__sticky--stuck';

/**
 * Builds the mini-header DOM and returns the sticky ANCHOR element.
 *
 * `aria-hidden="true"` throughout, exactly as the site does: every word in here is a
 * duplicate of the real header a screen reader has already announced, so exposing it
 * would read the creature's stat line twice for no gain. It is also `pointer-events:
 * none` until revealed (CSS), so it can never swallow a click on the card beneath it.
 */
export function renderStickyHeader(parent: HTMLElement, parts: StickyHeaderParts): HTMLElement {
	const anchor = parent.createDiv({ cls: 'dse-sb__sticky' });
	anchor.setAttribute('aria-hidden', 'true');
	const inner = anchor.createDiv({ cls: 'dse-sb__sticky-inner' });

	const row1 = inner.createDiv({ cls: 'dse-sb__sticky-row1' });
	const id = row1.createSpan({ cls: 'dse-sb__sticky-id' });
	id.createSpan({ cls: 'dse-sb__sticky-name', text: parts.name });
	id.createSpan({ cls: 'dse-sb__sticky-role', text: parts.role });

	const stats = row1.createSpan({ cls: 'dse-sb__sticky-stats' });
	const defs = stats.createSpan({ cls: 'dse-sb__sticky-defs' });
	for (const pair of parts.defenses) {
		const cell = defs.createSpan({ cls: 'dse-sb__sticky-m' });
		cell.createEl('b', { text: pair.value });
		cell.appendText(pair.label);
	}
	const chars = stats.createSpan({ cls: 'dse-sb__sticky-chars' });
	for (const ch of parts.characteristics) {
		const cell = chars.createSpan({ cls: 'dse-sb__sticky-c' });
		cell.createEl('b', { text: ch.value });
		cell.createEl('i', { text: ch.initial });
	}

	// Row 2 is ALWAYS built, never conditional: `sbStickyMeta` is a pure CSS reflow
	// (`display: none` on this row), which is what keeps it overridable per block —
	// unlike the conditional-DOM statblock prefs, whose shape the view picks at build
	// time and which therefore have to be global-only (see catalog.ts).
	const row2 = inner.createDiv({ cls: 'dse-sb__sticky-row2' });
	for (const pair of parts.secondary) {
		const cell = row2.createSpan({ cls: 'dse-sb__sticky-sm' });
		cell.createEl('b', { text: pair.label });
		cell.appendText(pair.value);
	}
	return anchor;
}

/**
 * The nearest ancestor that actually scrolls — the element `position: sticky` on
 * `anchor` will resolve against, and therefore the only correct IntersectionObserver
 * root.
 *
 * `null` means "the viewport", which is both IntersectionObserver's own default root and
 * the right answer when nothing between the card and the document scrolls.
 *
 * Why not just use the viewport everywhere: in a sidebar leaf the leaf is its own
 * scroller and the viewport is the whole window, so the head would still be "visible"
 * to a viewport-rooted observer long after the leaf clipped it away — the bar would
 * simply never appear. In the reading view the two differ by the tab header's height,
 * which would reveal the bar a beat late. Resolving the real scroller is what makes ONE
 * implementation correct in every context.
 */
export function nearestScroller(anchor: HTMLElement): HTMLElement | null {
	const view = anchor.ownerDocument.defaultView;
	if (!view) return null;
	for (let node = anchor.parentElement; node; node = node.parentElement) {
		const style = view.getComputedStyle(node);
		// `overlay` is legacy-Chromium for `auto`; `clip`/`hidden`/`visible` do NOT make a
		// scrollport for sticky purposes (which is exactly why the site can put
		// `overflow: clip` on its card and still stick to the page).
		if (/(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflowX}`)) return node;
	}
	return null;
}

/**
 * Wires the reveal: adds `STICKY_STUCK_CLASS` to `anchor` while `headEl` is scrolled
 * fully off the TOP of the scroll container, removes it otherwise.
 *
 * Deliberately only the top edge. `!entry.isIntersecting` alone is also true when the
 * card is still far BELOW the fold (nothing of it on screen yet) — reveal on that and
 * every statblock in a long note would sit "stuck" while off-screen, painting the moment
 * its top edge appeared. The `bottom <= rootBounds.top` half is what makes it mean
 * "scrolled PAST", not merely "not visible".
 *
 * There is no matching "the card is gone" rule, and none is needed: the anchor lives
 * inside the element root, so ordinary sticky containment carries it off-screen with the
 * card — the same reason the site's CSS needs no such rule either.
 *
 * Returns true when an observer was actually installed (false = no-op environment:
 * jsdom, or a host with no IntersectionObserver). Callers may ignore it; the DOM tests
 * assert on it.
 */
export function wireStickyHeader(
	anchor: HTMLElement,
	headEl: HTMLElement,
	owner: Component,
): boolean {
	const view = anchor.ownerDocument.defaultView;
	// POPOUT SAFETY: the constructor must come from the element's OWN window. In a
	// pop-out, `globalThis.IntersectionObserver` belongs to the main window and observing
	// a node from another document with it silently never fires. (jsdom has no
	// IntersectionObserver at all, which is the other reason this is a lookup and not a
	// bare `new IntersectionObserver`.)
	if (!view || typeof view.IntersectionObserver !== 'function') return false;
	const Observer = view.IntersectionObserver;

	const onChange = (entries: IntersectionObserverEntry[]): void => {
		for (const entry of entries) {
			const top = entry.rootBounds?.top ?? 0;
			const stuck = !entry.isIntersecting && entry.boundingClientRect.bottom <= top;
			anchor.toggleClass(STICKY_STUCK_CLASS, stuck);
		}
	};

	let observer: IntersectionObserver | undefined;
	let root: HTMLElement | null = null;
	let disposed = false;
	const install = (): void => {
		if (disposed) return;
		const next = nearestScroller(anchor);
		if (observer && next === root) return;
		observer?.disconnect();
		root = next;
		// threshold 0 = fire on the full-visibility boundary in both directions, i.e. the
		// instant the head's last pixel leaves and the instant its first pixel returns.
		// That is the site's `animation-range: exit … 100%` endpoint, minus the fade-in
		// ramp the site spreads over the last quarter of the exit.
		observer = new Observer(onChange, { root, threshold: 0 });
		observer.observe(headEl);
	};

	install();
	// RE-RESOLVE ONCE, next frame. A reading-mode post-processor can run while its
	// section is still detached from the preview scroller (Obsidian builds sections
	// off-tree and attaches them after), in which case the walk above finds no
	// scrolling ancestor and silently falls back to the viewport — an observer that
	// would fire at the wrong moment in the sidebar and never at all in a pop-out. One
	// rAF later the node is attached, so re-resolving is enough; if the answer is the
	// same element (the overwhelmingly common case) `install()` is a no-op and the
	// original observer is kept, so nothing re-fires and nothing flickers.
	const frame = view.requestAnimationFrame(install);
	owner.register(() => {
		disposed = true;
		view.cancelAnimationFrame(frame);
		observer?.disconnect();
	});
	return true;
}
