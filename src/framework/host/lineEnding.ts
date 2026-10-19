// SC-453 — one place that knows a note's line ending.
//
// A note can be CRLF (Windows editors, synced vaults). Every DSE write that rewrites or inserts
// text into an existing note has to (a) FIND its block despite the `\r` before each `\n`, and
// (b) write its text back in the note's own ending, or the note ends up mixed-ending (the
// SC-290 review's INFO-4). The policy, applied by every write site through this file:
//   - an all-CRLF note stays all-CRLF; an all-LF note is byte-identical to what it was before
//     this ticket (the LF path is never normalised);
//   - a mixed note follows its DOMINANT ending (a tie goes to the first line break), and only the
//     text being written is touched — every byte outside it is left exactly as found, so a mixed
//     note can never lose content here.
// Parsing normalises to LF (`splitLines` / `stripCr`); only a write re-applies the ending (`toEol`).

export type Eol = '\r\n' | '\n';

/** The dominant line ending of `text`: whichever of CRLF / bare LF has more occurrences, the
 *  FIRST line break's style on a tie, and LF when there is no line break at all. A lone `\r` is
 *  not a line break here (it never separates lines in Obsidian's `split('\n')` line numbering). */
export function detectEol(text: string): Eol {
	let crlf = 0;
	let lf = 0;
	let first: Eol | null = null;
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
		const kind: Eol = i > 0 && text.charCodeAt(i - 1) === 13 ? '\r\n' : '\n';
		if (kind === '\r\n') crlf++;
		else lf++;
		first ??= kind;
	}
	if (crlf === lf) return first ?? '\n';
	return crlf > lf ? '\r\n' : '\n';
}

/** `text` with each `\r` that immediately precedes a `\n` removed. A lone `\r` is kept. */
export function stripCr(text: string): string {
	return text.replace(/\r(?=\n)/g, '');
}

/** `text.split('\n')` with each line's trailing `\r` (a CRLF terminator) dropped. Same line
 *  COUNT and indices as `split('\n')` — callers that also split the raw content on `\n` (the
 *  hosts' `replaceSource`) stay line-aligned with this. */
export function splitLines(text: string): string[] {
	return text.split(/\r?\n/);
}

/** LF-normalised `text` re-terminated with `eol`. The identity for LF; for CRLF, any `\r\n`
 *  already present is not doubled. */
export function toEol(text: string, eol: Eol): string {
	return eol === '\n' ? text : text.replace(/\r?\n/g, '\r\n');
}

/** `lines` (no terminators) each given the CR half of an `eol` terminator, ready to be spliced
 *  into a `content.split('\n')` array and re-joined with '\n'. The identity for LF. */
export function terminateLines(lines: string[], eol: Eol): string[] {
	return eol === '\n' ? lines : lines.map((line) => `${line}\r`);
}
