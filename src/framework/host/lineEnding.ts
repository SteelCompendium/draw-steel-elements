// SC-453 — one place that knows a note's line ending.
//
// A note can be CRLF (Windows editors, synced vaults). Every DSE write that rewrites or inserts
// text into an existing note has to (a) FIND its block despite the `\r` before each `\n`, and
// (b) write its text back in the note's own ending, or the note ends up mixed-ending (the
// SC-290 review's INFO-4). The policy, applied by every write site through this file:
//   - an all-CRLF note stays all-CRLF, and (SC-460) a CR-only note, whose only breaks are lone CRs, stays CR-only; an all-LF note is byte-identical to what it was before
//     this ticket (the LF path is never normalised);
//   - a mixed note follows its DOMINANT ending (a tie goes to the first line break), and only the
//     text being written is touched — every byte outside it is left exactly as found, so a mixed
//     note can never lose content here.
// Parsing normalises to LF (`splitLines` / `stripCr`); only a write re-applies the ending (`toEol`).
//
// SC-460 — what counts as a line BREAK is a different question from which ending a note USES.
// Obsidian numbers lines with CR, CRLF and LF each as ONE break (measured on 1.14.4: getSectionInfo's
// lineStart/lineEnd, the metadata cache's sections and the CodeMirror editor all agree; U+2028, U+2029,
// NEL, VT and FF are NOT breaks), so `splitLines` / `splitWithEols` below split on exactly that. Every index
// into a note that comes from Obsidian (a section's lineStart/lineEnd, the editor's cursor line) or is
// compared with one (anchor.ts's fence positions) is in that numbering; indexing the note with
// `split('\n')` instead puts every line below a lone CR one off.

export type Eol = '\r\n' | '\n' | '\r';

/** The dominant line ending of `text`: whichever of CRLF / bare LF has more occurrences, the
 *  FIRST CRLF/LF break's style on a tie. A lone `\r` IS a line break (see the header) but casts no vote
 *  while the note has any CRLF or LF: there it is a stray, and a write that followed it would turn an
 *  LF/CRLF note into a mixed one. A note whose ONLY breaks are lone CRs is a CR-only note and stays one
 *  (`'\r'`, as an all-CRLF note stays all-CRLF); a note with no break at all is `'\n'`. */
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
	if (crlf === 0 && lf === 0) return text.includes('\r') ? '\r' : '\n';
	if (crlf === lf) return first ?? '\n';
	return crlf > lf ? '\r\n' : '\n';
}

/** `text` with each `\r` that immediately precedes a `\n` removed. A lone `\r` is kept. */
export function stripCr(text: string): string {
	return text.replace(/\r(?=\n)/g, '');
}

/** Obsidian's line break: CRLF, a lone CR, or LF (one break each). SC-460, measured on 1.14.4. */
const LINE_BREAK = /\r\n|\r|\n/g;

/** `text` split into lines by Obsidian's rule, terminators dropped. Line N here is line N in
 *  `getSectionInfo`, the metadata cache and the editor. */
export function splitLines(text: string): string[] {
	return text.split(LINE_BREAK);
}

/** `text` split the same way, KEEPING each line's own terminator: `eols[i]` is what followed `lines[i]`
 *  ('\r\n', '\r' or '\n'; '' for the last line). `joinWithEols(lines, eols)` is byte-exact, so a
 *  splice that only replaces some lines (and their terminators) leaves every other byte alone — a lone
 *  CR above the block included. */
export function splitWithEols(text: string): { lines: string[]; eols: string[] } {
	const lines: string[] = [];
	const eols: string[] = [];
	let from = 0;
	for (const m of text.matchAll(LINE_BREAK)) {
		lines.push(text.slice(from, m.index));
		eols.push(m[0]);
		from = m.index + m[0].length;
	}
	lines.push(text.slice(from));
	eols.push('');
	return { lines, eols };
}

/** The inverse of `splitWithEols`. */
export function joinWithEols(lines: readonly string[], eols: readonly string[]): string {
	let out = '';
	for (let i = 0; i < lines.length; i++) out += lines[i] + (eols[i] ?? '');
	return out;
}

/** LF-normalised `text` re-terminated with `eol`. The identity for LF; for CRLF (or a lone CR), any
 *  `\r\n` already present is not doubled. */
export function toEol(text: string, eol: Eol): string {
	return eol === '\n' ? text : text.replace(/\r?\n/g, eol);
}
