// SC-121 Batch 4 (batch-3 review L-5) — the markdown-table scroll wrapper.
//
// Batch 3's C-6 gave bare markdown pipe-tables (`table:not([class])`) a Steel baseline
// ported from the v2 site's `tables.css`, including `overflow: hidden` so the border
// radius clips. On the SITE that is safe because Material wraps every table in
// `.md-typeset__table { display: block; overflow-x: auto }` — a scroll container the
// plugin had no equivalent of. Measured in the harness at a 300px (Obsidian sidebar-leaf)
// width, the book's 5-column "Familiar Statblock" table lays out 467px wide inside a
// 254px card body and simply OVERFLOWS it: content past column 3 is unreachable, with no
// scroll affordance, and the spill escapes the card's own rounded border.
//
// The fix is the site's own shape: give each table a wrapper element that owns the frame
// (border + radius + overflow) and scrolls horizontally, leaving the table itself free to
// take its natural width. Doing it in the DOM rather than as CSS `display: block` on the
// `<table>` is deliberate on two counts:
//   1. `display: block` on a `<table>` drops its implicit ARIA table semantics in several
//      screen-reader/browser pairs — a real regression for the book's stat tables.
//   2. `width: 100%` on a display:block table no longer stretches, so short tables would
//      silently shrink to fit; inside a wrapper the table keeps its existing `width: 100%`
//      stretch AND overflows past it when its min-content is wider (the scroll case).
//
// Applied from the ONE central render seam (ElementView.renderMarkdown), the same place
// rewriteSccAnchors hooks — so every element that embeds markdown gets it, and nothing
// else has to know. Idempotent, and scoped to CLASSLESS tables so it can never touch a
// plugin-built table (`.dse-enc__table`) or an Obsidian/other-plugin one.

/** Class on the inserted scroll container. Styled Steel-only in styles-source.css §7. */
export const MD_TABLE_WRAP_CLASS = 'dse-md-table';

/**
 * Wrap every bare markdown table under `el` in a `.dse-md-table` scroll container.
 * Idempotent: a table already inside one is left alone, so a re-render (or a second
 * pass over the same subtree) never nests wrappers.
 */
export function wrapMarkdownTables(el: HTMLElement): void {
	for (const table of Array.from(el.querySelectorAll<HTMLTableElement>('table:not([class])'))) {
		const parent = table.parentElement;
		if (!parent) continue;
		if (parent.classList.contains(MD_TABLE_WRAP_CLASS)) continue;
		const wrap = el.ownerDocument.createElement('div');
		wrap.className = MD_TABLE_WRAP_CLASS;
		parent.insertBefore(wrap, table);
		wrap.appendChild(table);
	}
}
