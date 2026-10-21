// SC-290 — the one place a block host parses and re-emits an OPENING fence line.
//
// Both SidebarBlockHost.replaceSource and ReadingModeBlockHost.replaceSource rewrite the
// whole fence block (`splice` over [lineStart, lineEnd]) and have to re-emit the opening
// line. They used to rebuild it as `${fence}${language}` from a first-token parse, which
// silently dropped everything past the language token on EVERY interactive write (an info
// string such as ```` ```ds-counter extra ````). `info` carries the whole remainder of the
// line past the fence characters — language token, inter-token spacing and extra tokens —
// so the re-emit is `${fence}${info}`.
//
// SC-455 — a block inside a blockquote / callout carries a PREFIX (`> `, `> > `, `>`) on every line.
// `parseOpenFenceLine` reads it off the opening line (blockPrefix.ts owns what a prefix is), and the
// splices below re-emit it on every line they write; for an un-nested block it is '' and nothing changes.
//
// SC-453 — `replaceFenceBlock` is the ONE splice both hosts use to rewrite a located block, and
// where a write picks up the note's own line ending (see lineEnding.ts for the policy).

import { addBlockPrefix, blankLinesAreTrimmed, fenceLanguage, matchFenceMarker, stripBlockPrefix } from './blockPrefix';
import { detectEol, joinWithEols, splitWithEols, stripCr } from './lineEnding';

export interface OpenFenceLine {
	/** SC-455: the blockquote/callout prefix in front of the fence run, exactly as written ('' when un-nested). */
	prefix: string;
	/** The fence run exactly as written (e.g. "```", "~~~", "````"). */
	fence: string;
	/** The first whitespace-delimited token of the TRIMMED info string (the block type; SC-457: whitespace between
	 *  the fence run and the language is skipped, as Obsidian does - `fenceLanguage`); may be ''. */
	language: string;
	/** Everything after the fence run, verbatim except trailing whitespace (incl. a CRLF
	 *  `\r`) is dropped — the same trailing-whitespace treatment the old `${fence}${language}`
	 *  re-emit gave a language-only fence, so those stay byte-identical. */
	info: string;
}

/** Parses `line` as a fence-open line; null when it is not one. */
export function parseOpenFenceLine(line: string | undefined): OpenFenceLine | null {
	if (line == null) return null;
	const match = matchFenceMarker(line);
	if (!match) return null;
	return {
		prefix: match.prefix,
		fence: match.marker,
		language: fenceLanguage(match.rest),
		info: match.rest.trimEnd(),
	};
}

/** The opening fence line to write back: the prefix + the fence run + the full original info string. */
export function emitOpenFenceLine(open: OpenFenceLine): string {
	return `${open.prefix}${open.fence}${open.info}`;
}

/**
 * SC-455: the body of the block at `[lineStart, lineEnd]` (fence lines inclusive) as the element sees
 * it — the lines strictly between the fences with the block's quote prefix taken off. `lines` is the
 * note split on `\r?\n` (`splitLines`). The identity on the lines for an un-nested block.
 */
export function blockBodyLines(lines: readonly string[], lineStart: number, lineEnd: number): string[] {
	const prefix = parseOpenFenceLine(lines[lineStart])?.prefix ?? '';
	return lines.slice(lineStart + 1, lineEnd).map((line) => stripBlockPrefix(line, prefix) ?? line);
}

/** The close fence of the block `open` as it stands on `line`: its run and prefix (the opener's own when `line` is no fence). */
function closeFenceOf(open: OpenFenceLine, line: string | undefined): { prefix: string; fence: string } {
	const close = line === undefined ? null : matchFenceMarker(line);
	// A block with no prefix is only ever closed by a prefix-free fence line, and vice versa.
	if (close && (close.prefix === '') === (open.prefix === '')) return { prefix: close.prefix, fence: close.marker };
	return { prefix: open.prefix, fence: open.fence };
}

/**
 * Replaces the fenced block at lines `[lineStart, lineEnd]` (fence lines inclusive; 0-based line
 * numbers in OBSIDIAN's numbering — CR, CRLF and LF each end a line, SC-460) with `newSource` as its
 * body, keeping the live opening fence line's info string (SC-290) and the live closing fence's run (or
 * the opener's, when `lineEnd` is not a fence line — an unterminated fence running to EOF). Null when
 * `lineStart` is not a fence-open line.
 *
 * SC-453 — line endings. For an LF-dominant note this is the exact pre-SC-453 splice (byte for
 * byte, even if `newSource` itself carries CRLF). For a CRLF-dominant note the new block is
 * emitted with CRLF: `newSource`'s own CRLF is normalised first so it is never doubled, every new
 * line is terminated `\r\n`, and the LAST new line (the close fence) copies the ending of the
 * line it replaces — so a block that ends the note with no trailing newline does not grow a
 * stray `\r`. Lines outside `[lineStart, lineEnd]` are never touched.
 *
 * SC-460 — the note is held as lines plus each line's own terminator (`splitWithEols`), so the
 * terminator after the close fence, and every byte outside the block (a lone CR above or below it
 * included), is carried through exactly. The rewritten lines take the note's dominant ending; a lone CR
 * INSIDE the old body was a line break there and is replaced with the rest of the body, while a lone CR
 * inside `newSource` (the element's own text) is written as given.
 */
export function replaceFenceBlock(content: string, lineStart: number, lineEnd: number, newSource: string): string | null {
	const { lines, eols } = splitWithEols(content);
	const openFence = parseOpenFenceLine(lines[lineStart]);
	if (!openFence) return null;
	const close = closeFenceOf(openFence, lines[lineEnd]);
	const closeLine = `${close.prefix}${close.fence}`;
	// SC-455: the block's own prefix goes back on every line written, empty lines in the block's own style.
	const trimBlank = blankLinesAreTrimmed(openFence.prefix, lines.slice(lineStart + 1, lineEnd));
	const withPrefix = (line: string): string => addBlockPrefix(openFence.prefix, line, trimBlank);
	const count = lineEnd - lineStart + 1;
	const eol = detectEol(content);

	const body = (eol === '\n' ? newSource : stripCr(newSource)).split('\n').map(withPrefix);
	const block = [emitOpenFenceLine(openFence), ...body, closeLine];
	// The close fence keeps the terminator of the line it replaces (none at EOF) - except that an LF note
	// never keeps a CR in front of its LF (the pre-SC-453 splice dropped it, and a mixed LF-dominant note
	// is not made to keep one).
	const replacedEol = eols[lineEnd] ?? '';
	const closeEol = eol === '\n' && replacedEol === '\r\n' ? '\n' : replacedEol;
	lines.splice(lineStart, count, ...block);
	eols.splice(lineStart, count, ...block.map((_, i) => (i < block.length - 1 ? eol : closeEol)));
	return joinWithEols(lines, eols);
}

/**
 * SC-455: replaces only the BODY lines of the block at `[lineStart, lineEnd]` with `newBody`
 * (LF-joined, prefix-free), leaving both fence lines byte-for-byte — the anchor stamp's splice.
 * Each new line gets the block's prefix and the note's own line ending (SC-453). Line numbers are
 * Obsidian's (SC-460). Null when `lineStart` is not a fence-open line.
 */
export function replaceFenceBody(content: string, lineStart: number, lineEnd: number, newBody: string): string | null {
	const { lines, eols } = splitWithEols(content);
	const openFence = parseOpenFenceLine(lines[lineStart]);
	if (!openFence) return null;
	const trimBlank = blankLinesAreTrimmed(openFence.prefix, lines.slice(lineStart + 1, lineEnd));
	const body = stripCr(newBody)
		.split('\n')
		.map((line) => addBlockPrefix(openFence.prefix, line, trimBlank));
	const eol = detectEol(content);
	lines.splice(lineStart + 1, lineEnd - lineStart - 1, ...body);
	eols.splice(lineStart + 1, lineEnd - lineStart - 1, ...body.map(() => eol));
	return joinWithEols(lines, eols);
}
