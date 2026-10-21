// SC-198 — PreviewScrollPin: keep reading mode's scroll position across Obsidian's own
// post-write preview rebuild.
//
// THE PROBLEM, AS FIRST MEASURED (SC-198, a real Obsidian 1.13.7 over CDP; full write-up in
// the SC-198 root-cause doc; history — the 1.14.4 re-measurement is the next section, and
// it narrows "any write" below to "a write that draws a DSE block fresh"). Any write to
// the open note makes Obsidian run `setViewData -> previewMode.set -> renderer.set ->
// queueRender`, which tears the rendered sections down and re-measures from scratch. This
// is NOT plugin-specific — a bare one-character `vault.process` with the plugin uninvolved
// reproduces it identically — so there is nothing to "stop doing" on our side. During that
// rebuild `.markdown-preview-sizer`'s inline `min-height` collapses (measured 4331px -> 246px), the
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
// RE-MEASURED ON OBSIDIAN 1.14.4 (SC-459; the pin is still needed, but as a backstop).
// In SC-459's measurements (a 260-line code fence, a 220-row table, 220 paragraphs, and
// head/EOF edits; async-rendered non-DSE content such as images, embeds, other plugins' code
// blocks, Mermaid or math was NOT measured) the collapse came only from a DSE block drawn
// FRESH: Obsidian keeps unchanged sections (edits elsewhere in the note never touch the
// sizer), re-renders a changed non-DSE section synchronously (those shapes never clamped,
// even when the tall element itself was edited), but a changed DSE block empties its
// section while the view mounts asynchronously, and that is when the sizer's inline
// `min-height` collapses. Bare one-character `vault.process` on a one-tracker note, tracker
// text changed: `scrollTop` 2416 -> 0 and 4831 -> 0, sizer inline `min-height` 5276px -> 93px.
// The writer's OWN write normally never reaches that path, because SC-340 view adoption
// (viewRegistry.ts) keeps the writer's tracker DOM, so nothing is redrawn and the sizer holds
// at full height. Hence the unpinned scrollTop held 8/8 on the default path. The pin is
// the backstop for every write adoption misses (claim miss, collision, `viewAdoption: false`):
// with adoption off, unpinned, the lifecycle G-S8 note went `scrollTop` 2779 -> 2001 (sizer
// 5501px -> 2446px; the 2486px step is where scrollTop settles); pinned, it held. G-S8
// asserts exactly that adoption-off case, so never inserting the rule fails it. (Since
// SC-470 the `modify` pin below also covers the writer, so disabling only the call in
// ReadingModeBlockHost no longer fails G-S8: measured 3/3 ok.)
//
// EVERY READING VIEW OF THE NOTE, ON EVERY WRITE (SC-470). Pinning only the writer's scroller
// left two clamps (SC-459 F1): a second reading view of the same note (writer-only adoption,
// G-S4, so that view is redrawn fresh: 3020 -> 0) and any write that is not ours (Sync, git,
// another device or plugin: 2416 -> 0). The plugin therefore also pins from the vault
// `modify` event (`pinReadingViewsOf`, registered in registerFrameworkElements). Measured on
// 1.14.4 for our own write, an external `vault.process`/`vault.modify`, `adapter.write`, and a
// write from outside the app picked up by the file watcher: `modify` fires while every view of
// the note still shows the OLD render (the DSE root still connected, the sizer's inline
// min-height still full), 0-3 frames before the first collapse, and a listener registered
// after the views opened sees the same. So the height captured there is never a collapsed one.
// The writer's view is pinned twice (its callback, then `modify` 1-2 ms later); the second
// pin restarts the TTL and never lowers the height (see RE-PINS). The writer-side call in
// ReadingModeBlockHost is KEPT as the writer's own backstop: it is redundant on 1.14.4 timing
// (disabling it leaves G-S8 and G-S15 ok), but it costs nothing and would still protect the
// writer if a future Obsidian deferred `modify` past the rebuild.
// Only Reading views that show a DSE block are pinned: a note without one never collapses
// (SC-459 M1), so it never gets phantom space. Live Preview / Source panes are not touched
// (SC-478: Live Preview clamps the same way); neither is a DSE block inside an embed (SC-479).
//
// RE-PINS. A re-pin of an already-pinned scroller restarts the TTL and takes
// max(the pinned height, the scroller's current content height), so autosave while typing (a
// `modify` every couple of seconds, each refreshing the TTL) cannot hold a stale height as the
// note grows, and a re-pin that lands while the sizer is collapsed (its scrollHeight at or
// below the pinned one) can never lower it. The content height read back while pinned is the
// scroller's scrollHeight MINUS its own vertical padding: with the sizer held at S px the
// scroller reads S + padding (64px on 1.14.4), and re-measuring the raw scrollHeight would
// ratchet the pin up by that padding on every re-pin (SC-198's "no ratchet" test).
//
// WHY `!important` VIA A STYLESHEET AND NOT AN INLINE STYLE. Obsidian owns
// `sizer.style.minHeight` and rewrites it during the rebuild; an inline pin is simply
// clobbered (measured — the inline variant still clamped to 0). The pin therefore lives in a
// stylesheet rule that outranks Obsidian's inline value for exactly as long as it exists:
//     `.markdown-preview-view[data-dse-scroll-pin="<id>"] .markdown-preview-sizer {
//          min-height: <px>px !important; }`
// The attribute goes on the SCROLLER, not on the sizer, so the pin survives Obsidian
// replacing the sizer node wholesale.
//
// WHY A PER-PIN `<style>` AND NOT A STATIC RULE + CUSTOM PROPERTY (SC-470). The SC-198
// original carried the height in a custom property on the scroller
// (`min-height: var(--dse-scroll-pin) !important`, rule in styles-source.css). A custom
// property is inherited, so setting and clearing it restyled the whole preview subtree:
// measured on 1.14.4 (a 2415-descendant Reading view) about 220-265 ms of style recalc to
// set the pin and about 235 ms to clear it, per pinned view. With the `modify` pin above that
// cost would be paid on every write to a note with a DSE block and by every other Reading
// view of it, and it also delays the rebuild itself (the external-write collapse moved from
// 13-31 ms to 310-400 ms after `modify`; the popout redraw towards the TTL, SC-472). So each
// pin injects its own `<style>` element into the scroller's OWN `ownerDocument.head` (a
// popout window has its own document) holding the one rule above, keyed on a unique id kept
// in the attribute's value, and no custom property is set: measured 2-4 ms to set, 2-32 ms
// to clear. One `<style>` per pinned scroller, not one shared per document: a pin lives
// 2.5 s, there are a handful at most, and an element owned by exactly one pin needs no
// reference counting to be removed (`release`, TTL and `releaseAll` all just remove it). The
// attribute value is the only key; a re-pin keeps its id.
//
// FAIL-SAFE BY CONSTRUCTION. Every early return below (no scroller, no window, document not
// scrolled, already at the top) leaves today's behaviour exactly as it is, and the TTL
// guarantees the pin is released even if the rebuild never comes. The worst case is a few
// hundred px of phantom scroll space at the bottom of the note for at most PIN_TTL_MS.

import type { Workspace } from 'obsidian';

/** Present on `.markdown-preview-view` for as long as a pin is held; its value is the pin's id. */
const PIN_ATTR = 'data-dse-scroll-pin';
/** Marks the injected `<style>`; its value is the pin's id (the rule's key, and how tests/probes find it). */
const STYLE_ATTR = 'data-dse-scroll-pin-style';
/**
 * How long a pin is held. Must comfortably outlast Obsidian's rebuild — measured at
 * ~1.1-1.4s from write to the element being back at full height on a 4000px tracker, and
 * slower notes (many blocks, statblock refs) take longer. Also the backstop for the case
 * where the expected rebuild never arrives at all.
 */
const PIN_TTL_MS = 2500;

/** Unique across plugin instances and documents, so a stale rule can never match a newer pin. */
let nextPinId = 0;

const pinRule = (id: string, px: number): string =>
	`.markdown-preview-view[${PIN_ATTR}="${id}"] .markdown-preview-sizer { min-height: ${px}px !important; }`;

/** The scroller's own vertical padding (0 when unreadable): the part of scrollHeight the sizer's min-height does not hold. */
function verticalPadding(el: HTMLElement, win: Window): number {
	const cs = win.getComputedStyle(el);
	return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
}

/** The slice of MarkdownView `pinReadingViewsOf` reads (duck-typed: the jest mock has no MarkdownView). */
interface ReadingViewLike {
	file?: { path: string } | null;
	getMode?: () => string;
	previewMode?: { containerEl?: HTMLElement };
}

interface HeldPin {
	/** The window that owns `timer` — a popout preview has its own (cf. view.ts's use of
	 *  `ownerDocument.defaultView` for the same reason). */
	readonly win: Window;
	timer: number;
	/** The height being held. Only ever raised by a re-pin — see `pinScroller()`. */
	px: number;
	/** The attribute value keying this pin's rule. */
	readonly id: string;
	/** The rule's `<style>`, in the scroller's own document head. */
	readonly style: HTMLStyleElement;
}

/**
 * Plugin-scoped. One instance is created per `registerFrameworkElements` call and shared by
 * every ReadingModeBlockHost, so two blocks in the same note share (rather than fight over)
 * their common scroller's pin, and `releaseAll()` on plugin unload cannot leave a stray
 * `!important` rule (and its `<style>`, in whichever window it went) behind for a scroller the plugin no longer owns.
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
		this.pinScroller(scroller);
	}

	/**
	 * SC-470: hold every open Reading view of `path` that shows a DSE block. Called from the
	 * vault `modify` event, which fires before any view of the note starts its rebuild (see the
	 * header), for our own writes and for everyone else's. A view already pinned by the
	 * writer is re-pinned, never lowered (see `pinScroller`); the TTL restarts a few ms later.
	 */
	pinReadingViewsOf(workspace: Workspace, path: string): void {
		for (const leaf of workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as unknown as ReadingViewLike;
			if (view.file?.path !== path || view.getMode?.() !== 'preview') continue;
			// `previewMode.containerEl` is `.markdown-reading-view`; its scroller is the child (measured, 1.14.4).
			const scroller = view.previewMode?.containerEl?.querySelector<HTMLElement>(':scope > .markdown-preview-view');
			if (!scroller) continue;
			if (!scroller.querySelector('[data-dse-element]')) continue; // nothing of ours can collapse it
			try {
				this.pinScroller(scroller);
			} catch (err) {
				console.warn('[DSE] scroll pin failed for a reading view', err);
			}
		}
	}

	private pinScroller(scroller: HTMLElement): void {
		const doc = scroller.ownerDocument;
		const win = doc.defaultView;
		if (!win || !doc.head) return;

		const existing = this.pins.get(scroller);
		if (existing) {
			// A re-pin (rapid clicking, autosave) restarts the TTL and never lowers the height; it
			// raises it when the note has grown past it. While pinned, `scrollHeight` reads back as
			// the pinned value plus the scroller's own padding, so the padding is subtracted before
			// comparing — re-measuring the raw value would ratchet the pin up by it on every write.
			win.clearTimeout(existing.timer);
			const content = scroller.scrollHeight - verticalPadding(scroller, win);
			if (Number.isFinite(content) && content > existing.px) {
				existing.px = content;
				existing.style.textContent = pinRule(existing.id, content);
			}
			existing.timer = win.setTimeout(() => this.release(scroller), PIN_TTL_MS);
			return;
		}

		// Nothing can be clamped away if the document does not scroll, or if the user is
		// already at the top. Skipping those (much the commonest case) means the pin —
		// and its phantom scroll space — only ever exists when it is actually earning
		// its keep.
		if (scroller.scrollTop <= 0) return;
		if (scroller.scrollHeight <= scroller.clientHeight) return;

		const px = scroller.scrollHeight;
		const id = String(++nextPinId);
		const style = doc.createElement('style');
		style.setAttribute(STYLE_ATTR, id);
		style.textContent = pinRule(id, px);
		doc.head.appendChild(style); // the rule first, then the attribute that selects it
		scroller.setAttribute(PIN_ATTR, id);
		const timer = win.setTimeout(() => this.release(scroller), PIN_TTL_MS);
		this.pins.set(scroller, { win, timer, px, id, style });
	}

	/** Drop the pin on one scroller (idempotent). */
	release(scroller: HTMLElement): void {
		const held = this.pins.get(scroller);
		if (!held) return;
		this.pins.delete(scroller);
		held.win.clearTimeout(held.timer);
		scroller.removeAttribute(PIN_ATTR);
		held.style.remove();
	}

	/** Drop every outstanding pin. Registered as plugin-unload cleanup. */
	releaseAll(): void {
		for (const scroller of [...this.pins.keys()]) this.release(scroller);
	}
}
