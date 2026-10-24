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
// (SC-459 M1), so it never gets phantom space. Live Preview / Source panes are not touched here:
// Live Preview loses its position by a different mechanism and has its own fix
// (livePreviewScrollHold.ts, SC-478).
//
// EMBEDS: THE HOST NOTE'S SCROLLER (SC-479). A DSE block in note B embedded (`![[B]]`) in note A
// lives in the embed's OWN inner `.markdown-preview-view` (not scrollable: `.markdown-embed-content`
// caps it at 4000px), inside A's scroller. A write to B redraws only the embed (A's own renderer and
// its sizer are untouched), and the embed's inner sizer collapses for part of one task (measured,
// 1.15.0: inner min-height 3165px -> 110px, the embed 3190px -> 135px, back before the next frame).
// No frame ever shows it, yet a layout inside that task moves A's scrollTop and nothing moves it back:
// with A parked at its end, mostly one tall embed, scrollTop 2887 -> 0 on every write that redraws
// the embed (vault.process, a write on disk, another pane's DSE write, the embed's own write when
// adoption misses). Two browser mechanisms do it, measured separately: scroll anchoring (Chrome's
// `overflow-anchor: auto` picks an anchor inside the embed's collapsing content and drives scrollTop
// to 0; with anchoring off it ends at 2375) and the passive clamp (A's sizer min-height is Obsidian's
// estimate, 3332px, under the real 3844px content, so the collapsed scroller's max scrollTop is 2375).
// A tall host with the embed well above or inside the viewport held (anchoring adjusts down and back up
// by the same amount there), which is why only some geometries show it. The fix therefore pins A's
// scroller (`pinReadingViewsOf`: every Reading view that shows a DSE block embedded from the modified
// note; `pin`: the OUTERMOST Reading scroller, not the embed's inner one, which never scrolls) and,
// for those host pins only, takes the host's EMBEDS out of scroll anchoring's anchor candidates for the
// pin's lifetime (a second rule in the same `<style>`: `.internal-embed { overflow-anchor: none }`
// under the pinned scroller). The sizer pin alone did NOT hold (2887 -> 0, anchoring still moved it);
// both together held (2887 -> 2887, second pane 3574 -> 3574, the viewport fully inside the embed too).
// WHY THE EMBEDS AND NOT THE SCROLLER (SC-479 r3, measured). The first version switched anchoring off
// on A's scroller. That also held the end geometry, but with anchoring off a height change ABOVE the
// viewport moves the text on screen instead of being compensated: a write that adds or removes a
// tracker row while the reader is below the embed shifted the text by 110 px (16 -> -94 and 16 -> 126;
// stock: 0, Chrome adjusts scrollTop 6869 -> 6759), and so did any other content growing above the
// viewport during the pin (+200 px -> 216). Excluding only the embeds leaves anchoring on for
// everything else in the host: the anchor is picked outside the collapsing embed, and the embed's own
// height change is compensated as on stock (every shift case 0 px, every end/in case held). Anchoring
// stays on for a note's own pins too: there the collapse spans frames and anchoring is what keeps
// text below a redrawn block still.
// Measured with the fix (1.15.0, lifecycle G-S42): a host pin costs the same 3-14 ms to set and 3-17 ms to
// clear as a note's own pin; the embed scan that decides whether a Reading view is a host runs once per
// Reading view on every `modify` of any note: median 0.1 ms, max 0.9 ms. `modify` fires before the embed
// redraws, as for a note's own views, so the height captured there is never a collapsed one.
// NESTED EMBEDS: A embeds N embeds B. The inner embed's `src` is the link as written in N, so each embed's link
// is resolved from the path of the note that directly contains it (the DOM nests an embed's content inside its
// embed element, so the chain is read off the ancestors with one `closest` per level, memoised per scan); only a
// link that cannot be resolved falls back to the host's path. A relative link or an ambiguous basename in the
// middle note therefore names the file Obsidian shows.
// THE EMBED STOP IS GATED BY WHERE THE READER IS (SC-479 r5/r6, measured at pin time; `embedStopWanted`). Excluding
// the embeds is right when the reader would be anchored INSIDE the collapsing tracker, and wrong when the anchor
// that keeps the text still is a paragraph inside the embed but outside its tracker: a reader parked inside a tall
// embed BELOW its hero list (B = tracker + 25 paragraphs, 3602px, viewport 150 or 500 px under the tracker) saw
// the text move by +110 px (add a hero) / -109 px (remove one) with the stop on; stock moved it 0 px, Chrome
// adjusting scrollTop 4031 -> 4141 / 3922 instead. So the stop is applied when (i) a DSE root inside an embed
// intersects the viewport (the anchor could land in the tracker: the end geometry, the viewport inside the
// tracker), or (ii) no DSE-bearing embed intersects the viewport at all (the reader is outside the embeds, e.g.
// below them: 0 px there, where stock moves the text 110 px), and NOT when the viewport meets a DSE-bearing embed
// but none of its DSE roots (inside the embed's other content: anchoring compensates correctly, as on stock, 0 px).
// The host still gets the sizer pin in that case. The decision is taken once, when the pin is set, and held for its
// life; an existing pin is only ever upgraded to the stop, never downgraded.
// RISK, ACCEPTED (SC-479 ruling): the pin is taken on EVERY `modify` of a note embedded in a Reading view,
// including a write nothing redraws (an adopted own write), so such a host may carry phantom bottom space for
// up to PIN_TTL_MS (the same trade as SC-470, TTL-bounded, it never clamps). With a DSE root on screen and the
// viewport wholly inside a tall tracker the stop is on, so a row added ABOVE the viewport shifts the text by
// the row height instead of being compensated (the same as a note's own pin, SC-198/SC-470).
// NOT COVERED: a Live Preview host (`.cm-scroller`, `![[B]]` rendered by CodeMirror) is a different mechanism
// and still jumps (6800 -> 3745 measured with the embed near the end of the note): SC-522.
//
// THE PIN IS A FLOOR, NOT A CAP (SC-470 r4). The rule's `!important` min-height REPLACES
// Obsidian's own inline sizer min-height, and Obsidian's Reading view is virtualised, so the
// sizer's height IS that min-height: while the pin is held `scrollHeight` reads back as the
// pinned px plus the scroller's padding no matter how large the note becomes (measured, 1.14.4:
// Obsidian wanted 5901 / 7101px, the pin held 5565px for up to 12s while autosave kept
// re-pinning, so new text at the end was unreachable). Reading `scrollHeight` therefore cannot
// show growth. What can: Obsidian keeps WRITING its inline `min-height` (the style attribute
// still changes under the rule). A MutationObserver on the pinned scroller (subtree, `style`
// attribute + childList, so a replaced sizer is seen too; the scroller's own window's
// MutationObserver, popout-safe; disconnected at release / TTL / `releaseAll`) raises the rule
// to max(held px, that inline value) by rewriting the pin's `<style>` text. It never lowers: a
// collapsed inline value (46px, 2446px) is below the held px. The observer only watches the
// scroller's subtree; the `<style>` lives in `<head>` and the pin attribute is outside the
// `style` filter, so our own writes cannot re-enter it.
//
// RE-PINS. A re-pin of an already-pinned scroller restarts the TTL and applies the same max
// over (held px, the sizer's current inline min-height, scrollHeight MINUS the scroller's
// vertical padding). The last term only matters when the rule was not holding the sizer; it
// subtracts the padding because with the sizer held at S px the scroller reads S + padding
// (64px on 1.14.4), and the raw scrollHeight would ratchet the pin up by that on every
// re-pin. A re-pin that lands while the sizer is collapsed can never lower the height.
//
// POPOUTS CLOSED WHILE PINNED (SC-470 r4). A closed window's timers never fire, so its TTL would
// never release the pin and the `pins` Map would keep the detached Reading-view DOM until
// unload. Every pin call therefore sweeps entries whose scroller is disconnected or whose
// window is closed, and registerFrameworkElements also releases a window's pins on the
// workspace `window-close` event (`releaseWindow`).
//
// WHY `!important` VIA A STYLESHEET AND NOT AN INLINE STYLE. Obsidian owns
// `sizer.style.minHeight` and rewrites it during the rebuild; an inline pin is simply
// clobbered (measured — the inline variant still clamped to 0). The pin therefore lives in a
// stylesheet rule that outranks Obsidian's inline value for exactly as long as it exists:
//     `.markdown-preview-view[data-dse-scroll-pin="<id>"] > .markdown-preview-sizer {
//          min-height: <px>px !important; }`
// The attribute goes on the SCROLLER, not on the sizer, so the pin survives Obsidian
// replacing the sizer node wholesale. The CHILD combinator is load-bearing: an embed inside the
// note renders its own `.markdown-preview-view > .markdown-preview-sizer`, and a descendant
// selector grew it 535 -> 4024px for the whole pin (measured, SC-470 r3), moving the visible
// text by 3489px while scrollTop "held".
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
export const PIN_TTL_MS = 2500;

/**
 * Unique within one plugin load (a counter at module level, shared by every document). It
 * restarts at 1 when the plugin is disabled and enabled again; that is safe because
 * `releaseAll()` removes every rule at unload, so no rule from the previous load survives to
 * match a reused id.
 */
let nextPinId = 0;

/** Exported for the tests, which check the selector against nested sizers. */
export const pinRule = (id: string, px: number): string =>
	`.markdown-preview-view[${PIN_ATTR}="${id}"] > .markdown-preview-sizer { min-height: ${px}px !important; }`;

/**
 * SC-479: a host pin (the scroller of a note that EMBEDS the written note) also excludes the host's embeds from scroll
 * anchoring's anchor candidates, so Chrome cannot anchor inside the collapsing embed. The scroller itself keeps anchoring on
 * (switching it off moves on-screen text whenever content above the viewport changes height during the pin: r3 HIGH-1).
 */
export const anchorRule = (id: string): string => `.markdown-preview-view[${PIN_ATTR}="${id}"] .internal-embed { overflow-anchor: none !important; }`;

/** Resolves a link path from `sourcePath` to a vault path (`metadataCache.getFirstLinkpathDest(...)?.path`), or null. */
export type LinkResolver = (linkpath: string, sourcePath: string) => string | null;

/** The rule text a held pin needs: the sizer floor, plus the anchoring stop for a host pin. */
const ruleText = (held: { id: string; px: number; host: boolean }): string =>
	held.host ? `${pinRule(held.id, held.px)}\n${anchorRule(held.id)}` : pinRule(held.id, held.px);

/** The scroller's own sizer (a direct child, the node the rule targets) and its inline min-height in px, or NaN. */
function sizerInlineMinHeight(scroller: HTMLElement): number {
	const sizer = scroller.querySelector<HTMLElement>(':scope > .markdown-preview-sizer');
	return sizer ? parseFloat(sizer.style.minHeight) : NaN;
}

/** The scroller's own vertical padding (0 when unreadable): the part of scrollHeight the sizer's min-height does not hold. */
function verticalPadding(el: HTMLElement, win: Window): number {
	const cs = win.getComputedStyle(el);
	return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
}

/**
 * SC-479: does `scroller` show a DSE block from an embed of `path`? Every `.internal-embed` in the rendered view is
 * checked, nested ones included (A embeds N embeds B: the inner embed's `src` names B). `src` is the link as written;
 * the subpath (`#heading`, `#^block`) is dropped, so `![[B#Section]]` counts as B. Each link is resolved from the path
 * of the note that WRITES it: the host's path for a top-level embed, and for a nested one the note its enclosing embed
 * resolved to (the DOM nests an embed's content inside the embed element, so the chain is read off the ancestors, one
 * `closest` per level). A link that cannot be resolved falls back to the host's path, which can only pin one view too
 * many (TTL-bounded), never miss one.
 * Only embeds that contain a DSE block count: nothing else of ours can collapse them.
 */
function embedsBlockOf(scroller: HTMLElement, path: string, hostPath: string, resolveLink: LinkResolver): boolean {
	const target = new Map<Element, string | null>();
	const resolved = (embed: Element): string | null => {
		if (target.has(embed)) return target.get(embed) ?? null;
		const parent = embed.parentElement?.closest('.internal-embed[src]');
		const linkpath = (embed.getAttribute('src') ?? '').split('#')[0];
		const resolvedPath = linkpath ? resolveLink(linkpath, (parent && resolved(parent)) || hostPath) : null;
		target.set(embed, resolvedPath);
		return resolvedPath;
	};
	for (const embed of Array.from(scroller.querySelectorAll<HTMLElement>('.internal-embed[src]'))) {
		if (embed.querySelector('[data-dse-element]') && resolved(embed) === path) return true;
	}
	return false;
}

/**
 * SC-479 r6: should this HOST pin also exclude the host's embeds from scroll anchoring? Decided at pin time from the
 * viewport: yes when a DSE root inside an embed intersects it, or when no DSE-bearing embed does; no when it meets a
 * DSE-bearing embed but none of that embed's DSE roots (see the header: THE EMBED STOP IS GATED BY WHERE THE READER IS).
 */
function embedStopWanted(scroller: HTMLElement): boolean {
	const view = scroller.getBoundingClientRect();
	const onScreen = (el: Element): boolean => {
		const r = el.getBoundingClientRect();
		return r.bottom > view.top && r.top < view.bottom;
	};
	if (Array.from(scroller.querySelectorAll('.internal-embed [data-dse-element]')).some(onScreen)) return true; // (i)
	return !Array.from(scroller.querySelectorAll('.internal-embed')).some((embed) => embed.querySelector('[data-dse-element]') && onScreen(embed)); // (ii) / (iii)
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
	/** The height being held (the rule's px). Only ever raised: by a re-pin or by `observer`. */
	px: number;
	/** The attribute value keying this pin's rule. */
	readonly id: string;
	/** The rule's `<style>`, in the scroller's own document head. */
	readonly style: HTMLStyleElement;
	/** Keeps `px` at or above Obsidian's latest inline sizer min-height; null where the window has no MutationObserver. */
	observer: MutationObserver | null;
	/** SC-479: pinned as the host of an embed of the written note AND the viewport gate wanted the stop (`embedStopWanted`): its rule also stops the host's embeds being scroll anchors. Only ever set. */
	host: boolean;
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
		const inner = containerEl.closest<HTMLElement>('.markdown-preview-view');
		if (!inner) return; // sidebar / canvas / LP: not a reading-view scroller
		// SC-479: inside an embed the nearest `.markdown-preview-view` is the embed's own (it never
		// scrolls); the scroller that can lose its position is the OUTERMOST one, the host note's.
		let scroller = inner;
		for (let up = inner.parentElement?.closest<HTMLElement>('.markdown-preview-view'); up; up = up.parentElement?.closest<HTMLElement>('.markdown-preview-view')) scroller = up;
		this.pinScroller(scroller, scroller !== inner);
	}

	/**
	 * SC-470: hold every open Reading view of `path` that shows a DSE block. Called from the
	 * vault `modify` event, which fires before any view of the note starts its rebuild (see the
	 * header), for our own writes and for everyone else's. A view already pinned by the
	 * writer is re-pinned, never lowered (see `pinScroller`); the TTL restarts a few ms later.
	 */
	pinReadingViewsOf(workspace: Workspace, path: string, resolveLink?: LinkResolver): void {
		for (const leaf of workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as unknown as ReadingViewLike;
			if (!view.file || view.getMode?.() !== 'preview') continue;
			const own = view.file.path === path;
			// SC-479: a view of ANOTHER note is pinned when it shows a DSE block embedded from `path`.
			if (!own && !resolveLink) continue;
			// `previewMode.containerEl` is `.markdown-reading-view`; its scroller is the child (measured, 1.14.4).
			const scroller = view.previewMode?.containerEl?.querySelector<HTMLElement>(':scope > .markdown-preview-view');
			if (!scroller) continue;
			if (own ? !scroller.querySelector('[data-dse-element]') : !embedsBlockOf(scroller, path, view.file.path, resolveLink!)) continue; // nothing of ours can collapse it
			try {
				this.pinScroller(scroller, !own);
			} catch (err) {
				console.warn('[DSE] scroll pin failed for a reading view', err);
			}
		}
	}

	private pinScroller(scroller: HTMLElement, host = false): void {
		const doc = scroller.ownerDocument;
		const win = doc.defaultView;
		if (!win || !doc.head) return;
		this.sweep();

		const existing = this.pins.get(scroller);
		if (existing) {
			// A re-pin (rapid clicking, autosave) restarts the TTL and never lowers the height; it
			// raises it to the sizer's current inline min-height or the content height when either
			// is larger (see the header: RE-PINS).
			win.clearTimeout(existing.timer);
			if (host && !existing.host && embedStopWanted(scroller)) {
				existing.host = true; // a note's own pin that is now also a host pin: add the embed anchoring stop
				existing.style.textContent = ruleText(existing);
			}
			this.raise(existing, Math.max(sizerInlineMinHeight(scroller), scroller.scrollHeight - verticalPadding(scroller, win)));
			existing.timer = win.setTimeout(() => this.release(scroller), PIN_TTL_MS);
			return;
		}

		// Nothing can be clamped away if the document does not scroll, or if the user is
		// already at the top. Skipping those (much the commonest case) means the pin —
		// and its phantom scroll space — only ever exists when it is actually earning
		// its keep.
		if (scroller.scrollTop <= 0) return;
		if (scroller.scrollHeight <= scroller.clientHeight) return;

		host = host && embedStopWanted(scroller); // the embed anchoring stop only where it does not cost the reader (header)
		const px = scroller.scrollHeight;
		const id = String(++nextPinId);
		const style = doc.createElement('style');
		style.setAttribute(STYLE_ATTR, id);
		style.textContent = ruleText({ id, px, host });
		doc.head.appendChild(style); // the rule first, then the attribute that selects it
		scroller.setAttribute(PIN_ATTR, id);
		const timer = win.setTimeout(() => this.release(scroller), PIN_TTL_MS);
		const held: HeldPin = { win, timer, px, id, style, observer: null, host };
		const MO = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
		if (MO) {
			held.observer = new MO(() => {
				try {
					this.raise(held, sizerInlineMinHeight(scroller));
				} catch (err) {
					console.warn('[DSE] scroll pin floor update failed', err);
				}
			});
			held.observer.observe(scroller, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
		}
		this.pins.set(scroller, held);
	}

	/** Raise the held height (never lower it) and rewrite the pin's rule. */
	private raise(held: HeldPin, px: number): void {
		if (!Number.isFinite(px) || px <= held.px) return;
		held.px = px;
		held.style.textContent = ruleText(held);
	}

	/** Drop pins whose scroller left the document or whose window was closed (a closed window's TTL never fires). */
	private sweep(): void {
		for (const [scroller, held] of [...this.pins]) {
			if (!scroller.isConnected || held.win.closed) this.release(scroller);
		}
	}

	/** Release every pin held in `win` (the workspace `window-close` handler). */
	releaseWindow(win: Window): void {
		for (const [scroller, held] of [...this.pins]) {
			if (held.win === win) this.release(scroller);
		}
	}

	/** Drop the pin on one scroller (idempotent). */
	release(scroller: HTMLElement): void {
		const held = this.pins.get(scroller);
		if (!held) return;
		this.pins.delete(scroller);
		held.win.clearTimeout(held.timer);
		held.observer?.disconnect();
		scroller.removeAttribute(PIN_ATTR);
		held.style.remove();
	}

	/** Drop every outstanding pin. Registered as plugin-unload cleanup. */
	releaseAll(): void {
		for (const scroller of [...this.pins.keys()]) this.release(scroller);
	}
}
