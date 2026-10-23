// SC-456: the e2e driver's reading of a note's fenced blocks - pure (no wdio / page access), so
// jest can pin it (test/unit/e2eIntegrity.test.ts). Fence lines are recognised with the PRODUCT's own
// marker grammar (`matchFenceMarker`: ``` and ~~~ runs of 3+, optional blockquote / callout prefix,
// SC-455), imported rather than re-implemented; it is a dependency-free module, safe to load in the
// wdio worker. The closing-fence rule mirrors `isFenceClose` (src/framework/sidebar/anchor.ts, which
// imports `obsidian` and so cannot be loaded here) - the jest file checks the two agree.
//
// Notes are split on '\n' only, so a CRLF note's lines keep their '\r' and every comparison stays
// byte-exact (SC-453).
// blockPrefix.ts must stay dependency-free: an `obsidian` / DOM import there would stop this file loading in the wdio worker.
import { fenceLanguage, matchFenceMarker, stripBlockPrefix } from '../../src/framework/host/blockPrefix';

export interface Fence {
	/** The block TYPE: the first token of the info string after skipping leading spaces and tabs, so
	 *  ```` ``` ds-x ```` is `ds-x` (Obsidian semantics; SC-456 O2) but a no-break space / U+3000 / form feed /
	 *  vertical tab or zero-width character before it is part of the token (Obsidian does not render those as the block),
	 *  and the token ends at the first whitespace or zero-width character (Live Preview, SC-487). The same
	 *  value as the product's `language` (blockPrefix.ts `fenceLanguage`, SC-457). '' for a bare fence. */
	lang: string;
	/** The whole fence, opening line to closing line, byte for byte. */
	text: string;
	/** The opening fence line, byte for byte (prefix, fence run and whole info string). */
	openLine: string;
	/** The closing fence line, byte for byte; null when the fence never closed. */
	closeLine: string | null;
	/** The body lines between the fences, without the fence's blockquote prefix. */
	body: string[];
	/** 0-based index of the opening line in `note.split('\n')`. */
	start: number;
	/** 0-based index of the closing line (the last line of the note when unterminated). */
	end: number;
	/** False when the fence was opened and never closed. */
	closed: boolean;
}

interface OpenFence {
	prefix: string;
	char: string;
	len: number;
}

/** The type of an opening fence line's info string (see `Fence.lang`): the product's own rule, imported not copied (SC-487). */
const typeOf = (rest: string, fenceChar: string): string => fenceLanguage(rest, fenceChar);

/** True when `line` closes the fence `open`: same character, at least as long, nothing but whitespace
 *  after the run, and in the same quote as the opener (the product's `isFenceClose`). */
function closes(open: OpenFence, line: string): boolean {
	const inner = stripBlockPrefix(line, open.prefix);
	if (inner === null) return false;
	const m = matchFenceMarker(inner);
	return !!m && m.prefix === '' && m.rest.trim() === '' && m.marker[0] === open.char && m.marker.length >= open.len;
}

/** Every fenced block of a note, in order (a block inside a callout / blockquote included, SC-455). A
 *  fence-looking line inside an open fence is body, so a `ds-x` example inside a ```` ```md ```` fence
 *  is not a block. A fence opened and never closed runs to the end of the note - or, when quoted, to the end of its quote. */
export function scanFences(note: string): Fence[] {
	const out: Fence[] = [];
	const lines = note.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const m = matchFenceMarker(lines[i]);
		if (!m) continue;
		const open: OpenFence = { prefix: m.prefix, char: m.marker[0], len: m.marker.length };
		let j = i + 1;
		// A quoted fence ends where its blockquote ends (a line without the opener's prefix): it never closed
		// there, exactly as the product's scanner (`iterateFences`) and CommonMark treat it (SC-456 R1).
		while (j < lines.length && !closes(open, lines[j]) && stripBlockPrefix(lines[j], open.prefix) !== null) j++;
		const closed = j < lines.length && closes(open, lines[j]);
		const end = closed ? j : j - 1; // unterminated: the last line still inside the fence (the quote's last line, or the note's)
		out.push({
			lang: typeOf(m.rest, m.marker[0]),
			text: lines.slice(i, end + 1).join('\n'),
			openLine: lines[i],
			closeLine: closed ? lines[j] : null,
			body: lines.slice(i + 1, closed ? j : end + 1).map((l) => stripBlockPrefix(l, open.prefix) ?? l),
			start: i,
			end,
			closed,
		});
		i = end; // an unterminated fence resumes scanning at the line that left the quote
	}
	return out;
}

export interface Skeleton {
	/** The note with every fenced block replaced by a placeholder line. */
	text: string;
	fences: number;
	/** True when a fence was opened and never closed. */
	unterminated: boolean;
}

/** Everything outside the fences, exactly; each fence reduced to one placeholder (the lifecycle's
 *  scanOutside, tightened from "set of outside lines" to the byte-exact outside text). A fence inside a
 *  callout / blockquote counts as a fence: its `> ` lines are inside it, the header and the other quoted
 *  lines stay in the outside text (SC-455).
 *
 *  `exact` (default) puts the fence's FULL opening line and FULL closing line in the placeholder,
 *  byte for byte, so a write that rewrites either - of ANY fence, the block under test included - is a
 *  difference (SC-456 O3); only the BODY is left out. `exact = false` records just the quote prefix and
 *  the type, for a note the test itself edited (`dse.externalEdit`). */
export function skeletonOf(note: string, exact = true): Skeleton {
	const lines = note.split('\n');
	const fences = scanFences(note);
	const out: string[] = [];
	let at = 0;
	for (const f of fences) {
		out.push(...lines.slice(at, f.start));
		out.push(
			exact
				? `<<fence open=${JSON.stringify(f.openLine)} close=${JSON.stringify(f.closeLine)}>>`
				: `<<fence ${matchFenceMarker(f.openLine)!.prefix}${f.lang}>>`,
		);
		at = f.end + 1;
	}
	out.push(...lines.slice(at));
	return { text: out.join('\n'), fences: fences.length, unterminated: fences.some((f) => !f.closed) };
}

/** Every fenced block of a note, in order (see `scanFences`). */
export const fencesOf = (note: string): Fence[] => scanFences(note);

/**
 * Compare a note against its fixture. Outside the fences: byte-identical, and so is every fence's
 * opening and closing LINE - the block under test included (only its body may change). Fences: the same
 * count, and every fence that is NOT in `targets` byte-identical in full, so a write that lands in a
 * sibling block of the same note is caught (the pilot's own twin-block rule). `exempt` (the test edited
 * the note itself) relaxes the fences to "same count" and compares only each fence's prefix + type.
 * Returns problems.
 */
export function integrityProblems(rel: string, now: string, fixture: string, targets: ReadonlySet<number> = new Set(), exempt = false): string[] {
	const a = skeletonOf(now, !exempt);
	const b = skeletonOf(fixture, !exempt);
	const problems: string[] = [];
	if (a.unterminated) problems.push(`${rel}: a fence was left unterminated`);
	if (a.fences !== b.fences) problems.push(`${rel}: fence count ${b.fences} -> ${a.fences}`);
	if (a.text !== b.text) problems.push(`${rel}: content outside the block bodies changed (text between the blocks, or a fence's opening / closing line)`);
	if (!exempt && a.fences === b.fences) {
		const na = fencesOf(now);
		const nb = fencesOf(fixture);
		na.forEach((f, i) => {
			if (!targets.has(i)) {
				if (f.text !== nb[i]?.text) {
					problems.push(`${rel}: fence #${i} (${f.lang}) changed but is not a block this test declared it was editing (declared: ${[...targets].join(', ') || 'none'})`);
				}
			} else {
				// A target's body may change; its fence lines may not.
				if (f.openLine !== nb[i].openLine) problems.push(`${rel}: fence #${i} (${nb[i].lang}) opening line changed: ${JSON.stringify(nb[i].openLine)} -> ${JSON.stringify(f.openLine)}`);
				if (f.closeLine !== nb[i].closeLine) problems.push(`${rel}: fence #${i} (${nb[i].lang}) closing line changed: ${JSON.stringify(nb[i].closeLine)} -> ${JSON.stringify(f.closeLine)}`);
			}
		});
	}
	return problems;
}
