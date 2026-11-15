// SC-443: pure assertions about what an insert left in a note (no wdio / page access, so jest and the e2e specs share them).
import { scanFences } from './noteFences';

/**
 * The NEUTRAL outcome of an insert that is not at the start of an empty line (SC-675): either the note is exactly as it was (the insert was
 * refused), or it now holds ONE more closed fence of `lang`, every other byte survives (compared with the fences taken out and the
 * whitespace dropped, so a fix that splits the line onto its own lines passes as well as one that leaves the note alone), and, with
 * `indented`, every line of the new block carries the leading whitespace of its opening line (a list item's continuation indent). Returns
 * null when the outcome is acceptable, else a sentence saying what is wrong. Either fix flips a marker built on it.
 */
export function insertOutcomeProblem(before: string, after: string, lang: string, opts: { indented?: boolean } = {}): string | null {
	if (after === before) return null;
	const was = scanFences(before);
	const now = scanFences(after);
	if (now.length !== was.length + 1) return `expected ${was.length + 1} fence(s) after the insert, found ${now.length}`;
	const unclosed = now.find((f) => !f.closed);
	if (unclosed) return `a fence was left unclosed: ${JSON.stringify(unclosed.openLine)}`;
	if (!now.some((f) => f.lang === lang)) return `no closed \`${lang}\` fence in the note`;
	const strip = (note: string): string => {
		const fences = scanFences(note);
		const lines = note.split('\n');
		const out: string[] = [];
		let at = 0;
		for (const f of fences) {
			out.push(...lines.slice(at, f.start));
			at = f.end + 1;
		}
		out.push(...lines.slice(at));
		return out.join('\n').replace(/\s+/g, '');
	};
	if (strip(after) !== strip(before)) return 'text outside the inserted block did not survive';
	if (opts.indented) {
		const added = now.find((f) => !was.some((w) => w.text === f.text)) ?? now[now.length - 1];
		const lead = /^\s*/.exec(added.openLine)?.[0] ?? '';
		const bad = added.text.split('\n').find((l) => !l.startsWith(lead));
		if (bad !== undefined) return `a line of the block lost its indent ${JSON.stringify(lead)}: ${JSON.stringify(bad)}`;
	}
	return null;
}
