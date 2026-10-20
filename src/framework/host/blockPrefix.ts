// SC-455 — the ONE place that knows a fenced block can sit inside a blockquote or callout.
//
// A block inside `> [!note]` / `> quote` (nested to any depth) has the blockquote PREFIX in front of
// its fence lines and every body line:
//
//     > [!note] Title
//     > ```ds-counter  extra
//     > current_value: 1
//     >                      <- an empty body line: `>` or `> `
//     > ```
//
// Every site that locates or rewrites such a block (anchor.ts' scanner, ReadingModeBlockHost, the
// SidebarBlockHost splice, the sidebar anchor stamp, the live-editor fence scan) goes through the
// four functions below instead of testing for a column-0 fence: `matchFenceMarker` reads a fence
// line and its prefix, `stripBlockPrefix` gives a body line without that prefix (null when the line
// is no longer inside the quote), `addBlockPrefix` puts the prefix back on a line being written, and
// `blankLinesAreTrimmed` says which way the block spells an empty line (`>` vs `> `) so a write
// keeps it. An un-nested block has the empty prefix '' and every function is then the identity, so
// a note with no quote in it behaves byte-for-byte as before.
//
// What counts as a prefix (CommonMark): one or more `>` markers — each up to 3 spaces in from the
// left and followed by ONE optional space — then up to 3 more spaces of indentation (the fence of
// a list item inside a callout: `>   ```x`). Anything else in front of a fence run (a list
// item's indentation outside any quote, 4+ spaces) is NOT a prefix, so such a fence is not a block
// DSE can address — callers treat it as an unsupported shape.

/** A fence line: optional quote prefix, the fence run, the rest of the line. */
const FENCE_MARKER = /^((?:[ ]{0,3}>[ ]?)+[ ]{0,3})?([`~]{3,})([^\n]*)$/;

export interface FenceMarker {
	/** The quote prefix exactly as written ('' for an un-nested fence). */
	prefix: string;
	/** The fence run ("```", "~~~", "````"). */
	marker: string;
	/** Everything after the fence run (the info string for an opener; empty for a closer). */
	rest: string;
}

/** Parses `line` as a fence marker line (opener or closer), or null when it is not one. */
export function matchFenceMarker(line: string): FenceMarker | null {
	const m = FENCE_MARKER.exec(line);
	return m ? { prefix: m[1] ?? '', marker: m[2], rest: m[3] } : null;
}

/** How many quote markers `prefix` holds, and how many spaces of indentation follow the last one. */
function shapeOf(prefix: string): { depth: number; indent: number } {
	let depth = 0;
	for (const ch of prefix) if (ch === '>') depth++;
	const after = prefix.length - prefix.lastIndexOf('>') - 1; // spaces after the last `>`
	return { depth, indent: Math.max(0, after - 1) }; // the first one is the marker's own optional space
}

/**
 * `line` with a block's `prefix` taken off (the text the element sees). The identity when the block
 * has no prefix. Tolerant of how each line spells it, as Markdown is: `>` vs `> `, `>>` vs `> >`.
 * Null when `line` does not carry the prefix at all — the quote has ended, so a fence opened inside
 * it never closed there.
 */
export function stripBlockPrefix(line: string, prefix: string): string | null {
	if (prefix === '') return line;
	const { depth, indent } = shapeOf(prefix);
	let pos = 0;
	for (let i = 0; i < depth; i++) {
		let spaces = 0;
		while (spaces < 3 && line[pos] === ' ') {
			pos++;
			spaces++;
		}
		if (line[pos] !== '>') return null;
		pos++;
		if (line[pos] === ' ') pos++;
	}
	for (let i = 0; i < indent && line[pos] === ' '; i++) pos++;
	return line.slice(pos);
}

/**
 * A body/fence line to WRITE under `prefix`. An empty line is just the prefix — with its trailing
 * space dropped (`>`) unless `trimBlank` is false (the block spells empty lines `> `). The identity
 * for the empty prefix.
 */
export function addBlockPrefix(prefix: string, text: string, trimBlank = true): string {
	if (prefix === '') return text;
	if (text !== '') return prefix + text;
	return trimBlank ? prefix.trimEnd() : prefix;
}

/**
 * Whether a block's empty lines are spelled without the prefix's trailing space (`>`), judged from
 * its existing body lines (raw, prefix included): `false` only when it already has an empty line
 * spelled `> ` and none spelled `>` — so a write round-trips whichever style the author used, and a
 * block with no empty line yet gets the clean `>`.
 */
export function blankLinesAreTrimmed(prefix: string, rawBodyLines: readonly string[]): boolean {
	if (prefix === '' || prefix === prefix.trimEnd()) return true;
	const lines = rawBodyLines.map((l) => l.replace(/\r$/, ''));
	return !(lines.includes(prefix) && !lines.includes(prefix.trimEnd()));
}
