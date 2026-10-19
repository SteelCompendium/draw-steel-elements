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
// SC-453 — `replaceFenceBlock` is the ONE splice both hosts use to rewrite a located block, and
// where a write picks up the note's own line ending (see lineEnding.ts for the policy).

import { detectEol, stripCr } from './lineEnding';

/** Matches a fence-open line, capturing the fence run and the language token. */
export const OPEN_FENCE = /^([`~]{3,})(\S*)/;

export interface OpenFenceLine {
	/** The fence run exactly as written (e.g. "```", "~~~", "````"). */
	fence: string;
	/** The first whitespace-delimited token after the fence run (the block type); may be ''. */
	language: string;
	/** Everything after the fence run, verbatim except trailing whitespace (incl. a CRLF
	 *  `\r`) is dropped — the same trailing-whitespace treatment the old `${fence}${language}`
	 *  re-emit gave a language-only fence, so those stay byte-identical. */
	info: string;
}

/** Parses `line` as a fence-open line; null when it is not one. */
export function parseOpenFenceLine(line: string | undefined): OpenFenceLine | null {
	if (line == null) return null;
	const match = line.match(OPEN_FENCE);
	if (!match) return null;
	return { fence: match[1], language: match[2], info: line.slice(match[1].length).trimEnd() };
}

/** The opening fence line to write back: the fence run + the full original info string. */
export function emitOpenFenceLine(open: OpenFenceLine): string {
	return `${open.fence}${open.info}`;
}

/** Matches a fence-close line, capturing the fence run. */
const CLOSE_FENCE = /^([`~]{3,})/;

/**
 * Replaces the fenced block at lines `[lineStart, lineEnd]` (fence lines inclusive; 0-based
 * indices into `content.split('\n')`) with `newSource` as its body, keeping the live opening
 * fence line's info string (SC-290) and the live closing fence's run (or the opener's, when
 * `lineEnd` is not a fence line — an unterminated fence running to EOF). Null when `lineStart`
 * is not a fence-open line.
 *
 * SC-453 — line endings. For an LF-dominant note this is the exact pre-SC-453 splice (byte for
 * byte, even if `newSource` itself carries CRLF). For a CRLF-dominant note the new block is
 * emitted with CRLF: `newSource`'s own CRLF is normalised first so it is never doubled, every new
 * line is terminated `\r\n`, and the LAST new line (the close fence) copies the ending of the
 * line it replaces — so a block that ends the note with no trailing newline does not grow a
 * stray `\r`. Lines outside `[lineStart, lineEnd]` are never touched.
 */
export function replaceFenceBlock(content: string, lineStart: number, lineEnd: number, newSource: string): string | null {
	const lines = content.split('\n');
	const openFence = parseOpenFenceLine(lines[lineStart]);
	if (!openFence) return null;
	const closeRun = lines[lineEnd]?.match(CLOSE_FENCE);
	const closeFence = closeRun ? closeRun[1] : openFence.fence;
	const count = lineEnd - lineStart + 1;

	if (detectEol(content) === '\n') {
		lines.splice(lineStart, count, emitOpenFenceLine(openFence), ...newSource.split('\n'), closeFence);
		return lines.join('\n');
	}

	const lastReplacedHadCr = lines[lineEnd]?.endsWith('\r') ?? false;
	const block = [emitOpenFenceLine(openFence), ...stripCr(newSource).split('\n'), closeFence];
	const last = block.length - 1;
	lines.splice(lineStart, count, ...block.map((line, i) => (i < last || lastReplacedHadCr ? `${line}\r` : line)));
	return lines.join('\n');
}
