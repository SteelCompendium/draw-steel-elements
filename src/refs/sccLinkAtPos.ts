// src/refs/sccLinkAtPos.ts — SC-135 phase 1b: pure, CM6-free logic for the editor click
// extension (src/refs/sccLinkCm6.ts). Split out so it's testable with plain strings and
// numbers, no EditorView required (per Scott's ask).
//
// WHY this exists at all (see the SC-135 phase 1 report's "Concerns" section for the full
// evidence chain, confirmed against Scott's own real vault): CM6 never renders a markdown
// link — internal OR external, scc or not — as a real `<a href>` DOM node in the editor
// (Live Preview's folded widget or Source mode's raw-syntax state). Obsidian's own click
// routing for editor links works by mapping click position -> document offset -> the
// underlying raw text, not by delegating to anchor hrefs. Phase 1's `closest('a')`
// listener (src/refs/sccLinkClickHandler.ts) is structurally unable to see these clicks;
// this module is the position-based mechanism that can.

const SCC_PREFIX = /^scc(\.v\d+)?:/;

/** One `[text](url)` match against a line's raw text — offsets are ABSOLUTE document
 *  positions (lineStart + the in-line match offset), so a caller with `pos` in the same
 *  coordinate space (e.g. `EditorView.posAtCoords`) can compare directly. */
export interface SccLinkMatch {
	href: string;
	/** absolute doc offset of the opening `[` */
	from: number;
	/** absolute doc offset just past the closing `)` */
	to: number;
}

// Deliberately simple, matching rewriteSccAnchors.ts's own scope: steel-etl's compendium
// markdown emits every scc link as plain `[text](scc.v1:code)` (SC-135 diagnosis §3 — all
// 37,771 occurrences measured are this exact form, zero bare/other), and this is also
// exactly what a hand-typed link looks like. No nested-bracket or escaped-paren handling —
// same scope as the existing DOM rewrite, not a general markdown-link parser.
//
// KNOWN, DEFERRED (SC-135 review findings L-1/L-2, measured against all 37,771 scc links in
// the shipped compendium: ZERO occurrences of any of it, so this only ever affects
// hand-written notes). Two classes, both diverging from what Reading view does, because
// this is a regex over raw text with no markdown syntax tree behind it:
//   - Silent no-ops where Reading view works: nested brackets in the link text
//     (`[a [b] c](scc.v1:…)`), an image inside the text (`[![x](y.png)](scc.v1:…)`).
//   - False positives where Reading view correctly does nothing: a link inside an inline
//     code span or a fenced code block, and an escaped `\[t\](scc.v1:…)`.
// The fix, if it is ever wanted, is `syntaxTree(view.state).resolveInner(pos, 1)` in the
// CM6 caller — bail on `inline-code`/`HyperMD-codeblock`. `@codemirror/language` is already
// a devDependency and an esbuild external, so it costs no new bundle surface.
//
// A SOURCE string, not a shared `RegExp` object, on purpose (SC-135 fix round 1, review
// finding M-2): a module-level `/g` regex carries mutable `lastIndex` state across every
// call in the process. `findSccLinkAtPos` reset it on entry, so it was never actually
// wrong — but a shared mutable global is a standing trap for the next caller who adds an
// early return or a nested scan, and it made the module's own "no shared mutable state"
// test untrue. Building the regex per call removes the state entirely; this runs once per
// mousedown, so the allocation is free at this frequency.
const MD_LINK_SOURCE = '\\[([^\\]\\n]*)\\]\\(([^)\\n]+)\\)';

/**
 * Scans `lineText` (one line's raw text, no line terminator) for an `scc(.vN)?:` markdown
 * link whose span contains the absolute document offset `pos`. `lineStart` is that line's
 * absolute starting offset (so returned offsets, and the `pos` comparison, are in the same
 * coordinate space as CM6 document positions).
 *
 * Returns `null` when `pos` isn't inside any link on the line, OR is inside a link that
 * isn't an `scc` target (deliberately does not keep scanning past a non-matching covering
 * link — markdown-link matches on one line never overlap, so at most one candidate can ever
 * contain a given `pos`).
 */
export function findSccLinkAtPos(lineText: string, lineStart: number, pos: number): SccLinkMatch | null {
	const re = new RegExp(MD_LINK_SOURCE, 'g');
	let match: RegExpExecArray | null;
	while ((match = re.exec(lineText)) !== null) {
		const from = lineStart + match.index;
		const to = from + match[0].length;
		if (pos < from) return null; // matches are in left-to-right order; nothing further can cover pos
		if (pos <= to) {
			const href = match[2].trim();
			return SCC_PREFIX.test(href) ? { href, from, to } : null;
		}
	}
	return null;
}

/**
 * Obsidian's own Live Preview convention for a rendered link (F2 phase 1b): a link whose
 * line is NOT currently revealing raw syntax (the editor selection doesn't intersect the
 * line) is shown as a folded, directly-clickable widget — a plain click follows it, same as
 * Reading view. A link whose raw `[text](url)` syntax IS showing (cursor/selection on that
 * line, or Source mode, which never folds anything) is still an editable text region first —
 * a plain click there places the cursor, same as it would for any other text; only a
 * modifier-or-middle click (`Keymap.isModEvent` truthy) follows it. This mirrors how
 * Obsidian treats its own internal wikilinks in Live Preview.
 */
export function shouldFollowOnClick(params: { livePreview: boolean; lineRevealed: boolean; isModOrAux: boolean }): boolean {
	const { livePreview, lineRevealed, isModOrAux } = params;
	const rawSyntaxShowing = !livePreview || lineRevealed;
	return isModOrAux || !rawSyntaxShowing;
}
