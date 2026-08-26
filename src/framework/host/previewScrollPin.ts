// SC-198 — PreviewScrollPin: keep reading mode's scroll position across Obsidian's own
// post-write preview rebuild.
//
// THE PROBLEM (measured in a real Obsidian 1.13.7 over CDP; full write-up in the SC-198
// root-cause doc). Any write to the open note makes Obsidian run
// `setViewData -> previewMode.set -> renderer.set -> queueRender`, which tears the rendered
// sections down and re-measures from scratch. This is NOT plugin-specific — a bare
// one-character `vault.process` with the plugin uninvolved reproduces it identically — so
// there is nothing to "stop doing" on our side. During that rebuild
// `.markdown-preview-sizer`'s inline `min-height` collapses (measured 4331px -> 246px), the
// scroller's `scrollHeight` drops to `clientHeight`, and the browser **passively clamps**
// `scrollTop` to `scrollHeight - clientHeight` — i.e. to 0 for any note that is mostly one
// tall element. Nothing actively scrolls: the clamp is a layout consequence.
//
// THE FIX. Because the loss is a clamp and not a scroll, it is enough to stop the scroller
// from ever getting short. Immediately before our write we pin the sizer's `min-height` to
// the height the document has right now, hold it across the rebuild, and drop it on a
// timer. `scrollHeight` never falls below `scrollTop + clientHeight`, so the clamp never
// happens and `scrollTop` is never touched by anyone — no save/restore bookkeeping, no
// restore that could fight the user, and nothing that has to guess when the element
// re-mounts (which lazy rendering makes unreliable). Measured on the root-cause doc's
// scenario C note: `scrollTop` 2596 -> 0 unpinned, 2596 -> 2596 (min == max == 2596, never
// moved for a single frame) pinned.
//
// WHY `!important` VIA A STYLESHEET AND NOT AN INLINE STYLE. Obsidian owns
// `sizer.style.minHeight` and rewrites it during the rebuild; an inline pin is simply
// clobbered (measured — the inline variant still clamped to 0). The pin therefore lives in
// styles-source.css as
//     `.markdown-preview-view[data-dse-scroll-pin] .markdown-preview-sizer {
//          min-height: var(--dse-scroll-pin) !important; }`
// which outranks Obsidian's inline value for exactly as long as the attribute is present.
// The attribute and the custom property go on the SCROLLER, not on the sizer, so the pin
// survives Obsidian replacing the sizer node wholesale.
//
// FAIL-SAFE BY CONSTRUCTION. Every early return below (no scroller, no window, document not
// scrolled, already at the top) leaves today's behaviour exactly as it is, and the TTL
// guarantees the pin is released even if the rebuild never comes. The worst case is a few
// hundred px of phantom scroll space at the bottom of the note for at most PIN_TTL_MS.

/** Present on `.markdown-preview-view` for as long as a pin is held. */
const PIN_ATTR = 'data-dse-scroll-pin';
/** Carries the pinned height; read by the styles-source.css rule quoted above. */
const PIN_VAR = '--dse-scroll-pin';
/**
 * How long a pin is held. Must comfortably outlast Obsidian's rebuild — measured at
 * ~1.1-1.4s from write to the element being back at full height on a 4000px tracker, and
 * slower notes (many blocks, statblock refs) take longer. Also the backstop for the case
 * where the expected rebuild never arrives at all.
 */
const PIN_TTL_MS = 2500;

interface HeldPin {
	/** The window that owns `timer` — a popout preview has its own (cf. view.ts's use of
	 *  `ownerDocument.defaultView` for the same reason). */
	readonly win: Window;
	timer: number;
	/** The height being held. Never raised by a re-pin — see `pin()`. */
	readonly px: number;
}

/**
 * Plugin-scoped. One instance is created per `registerFrameworkElements` call and shared by
 * every ReadingModeBlockHost, so two blocks in the same note share (rather than fight over)
 * their common scroller's pin, and `releaseAll()` on plugin unload cannot leave a stray
 * `!important` min-height behind on a scroller the plugin no longer owns.
 */
export class PreviewScrollPin {
	private readonly pins = new Map<HTMLElement, HeldPin>();

	/**
	 * Hold the reading-view scroller containing `containerEl` at its current height for
	 * PIN_TTL_MS. Call synchronously immediately before a write that will make Obsidian
	 * rebuild the preview; a no-op (and safe) anywhere else.
	 */
	pin(containerEl: HTMLElement): void {
		const scroller = containerEl.closest<HTMLElement>('.markdown-preview-view');
		if (!scroller) return; // sidebar / embed / canvas / LP: not a reading-view scroller
		const win = scroller.ownerDocument.defaultView;
		if (!win) return;

		const existing = this.pins.get(scroller);
		if (!existing) {
			// Nothing can be clamped away if the document does not scroll, or if the user is
			// already at the top. Skipping those (much the commonest case) means the pin —
			// and its phantom scroll space — only ever exists when it is actually earning
			// its keep.
			if (scroller.scrollTop <= 0) return;
			if (scroller.scrollHeight <= scroller.clientHeight) return;
		}

		// A re-pin (rapid clicking) refreshes the TTL but deliberately KEEPS the original
		// height. While pinned, `scrollHeight` reads back as the pinned value plus the
		// scroller's own padding, so re-measuring here would ratchet the pin upward by that
		// padding on every write. The first pin's height already covers the scroll position
		// we are protecting, which has not moved.
		const px = existing?.px ?? scroller.scrollHeight;
		if (existing) win.clearTimeout(existing.timer);

		scroller.style.setProperty(PIN_VAR, `${px}px`);
		scroller.setAttribute(PIN_ATTR, '');
		const timer = win.setTimeout(() => this.release(scroller), PIN_TTL_MS);
		this.pins.set(scroller, { win, timer, px });
	}

	/** Drop the pin on one scroller (idempotent). */
	release(scroller: HTMLElement): void {
		const held = this.pins.get(scroller);
		if (!held) return;
		this.pins.delete(scroller);
		held.win.clearTimeout(held.timer);
		scroller.removeAttribute(PIN_ATTR);
		scroller.style.removeProperty(PIN_VAR);
	}

	/** Drop every outstanding pin. Registered as plugin-unload cleanup. */
	releaseAll(): void {
		for (const scroller of [...this.pins.keys()]) this.release(scroller);
	}
}
