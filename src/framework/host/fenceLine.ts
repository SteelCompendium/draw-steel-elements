// SC-290 — the one place a block host parses and re-emits an OPENING fence line.
//
// Both SidebarBlockHost.replaceSource and ReadingModeBlockHost.replaceSource rewrite the
// whole fence block (`splice` over [lineStart, lineEnd]) and have to re-emit the opening
// line. They used to rebuild it as `${fence}${language}` from a first-token parse, which
// silently dropped everything past the language token on EVERY interactive write (an info
// string such as ```` ```ds-counter extra ````). `info` carries the whole remainder of the
// line past the fence characters — language token, inter-token spacing and extra tokens —
// so the re-emit is `${fence}${info}`.

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
