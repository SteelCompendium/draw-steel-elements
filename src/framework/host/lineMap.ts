// SC-552 -- where a line of one version of a note is in a later version. A block edit form pins its block's fence line when it
// opens; between then and Save the note can be written by anyone (a card click, Sync, a hand edit), and Save places the block again
// by mapping the pinned line through whatever changed. A position, not a search for the block's body: identical twins cannot be told
// apart by their text (SC-480), but a line that was not touched keeps its place in a line diff.
import { splitLines } from './lineEnding';

/**
 * Edit distance above which the map gives up (null): a rewrite of most of the note is not something to place a block through.
 * It only matters when the note changed on BOTH sides of the pinned line: the common head and tail lines are trimmed first, so a block
 * with every change on one side of it (above or below) is found at once, however many lines changed there. Known limit: a block edit
 * form's Save (every form's, strict since SC-556: its pin or no write) after an outside edit that changed more than this many lines
 * in the stretch around its block can never be saved - the pin is refused and the Notice says "the block changed on disk first"
 * although it did not. No data is at risk (nothing is written, the form stays open and the typed text can be copied out); before
 * SC-556 only a form kept open past its view had this limit, any other form fell back to the element's section or a search by body.
 * Only real changes count: a block in a heading embed is given just its section's text, and its pin is rebased onto the whole note
 * before it is mapped (ReadingModeBlockHost.rebaseCardPin), so the lines outside the section are not read as edits.
 */
export const LINE_MAP_MAX_EDITS = 400;

/** SC-607: the answer of the line diff when it met more than LINE_MAP_MAX_EDITS edits (it has none; `mapLine` and `mapLineFromTail` return null for it as before). */
const GAVE_UP = 'gave up';

/**
 * The line of `after` that is line `line` of `before`, by a minimal line diff (the common head and tail lines first, a Myers diff
 * over what is left between them). Lines are numbered the way Obsidian numbers them (`splitLines`). Null when that line was changed
 * or removed, when `line` is not a line of `before`, or when the notes differ by more than LINE_MAP_MAX_EDITS lines. Known limit (SC-556):
 * of two identical blocks with identical surroundings, deleting one cannot be told from deleting the other (the note that is left is
 * the same). The common head is trimmed first, so the diff always reads the LOWER one as deleted: a pin on the upper block then maps
 * to the surviving block, and a pin on the lower block maps to null (a false "changed on disk first" refusal; nothing is written).
 */
export function mapLine(before: string, after: string, line: number): number | null {
	if (before === after) return line;
	const r = mapLineOf(splitLines(before), splitLines(after), line);
	return r === GAVE_UP ? null : r;
}

/**
 * SC-607: `mapLine` with the opposite alignment - the common TAIL is trimmed first and the diff runs over the reversed lines, so every tie the
 * head-first map breaks one way (two identical blocks with identical surroundings, one deleted: head-first reads the LOWER as deleted) this
 * breaks the other way. Where the two maps agree on a line, no such tie decided it.
 */
export function mapLineFromTail(before: string, after: string, line: number): number | null {
	if (before === after) return line;
	const r = fromTail(splitLines(before), splitLines(after), line);
	return r === GAVE_UP ? null : r;
}

/** What `mapLineStrict` says: the line (both alignments agree), or why there is none. */
export type StrictLine = { line: number } | 'deleted' | 'disagree' | 'gave up';

/**
 * SC-607: the line of `after` that is line `line` of `before`, only when the head-first and the tail-first map (`mapLine`, `mapLineFromTail`) agree on
 * it; otherwise why not: 'deleted' (both say the line was changed or removed, or it is not a line of `before`), 'disagree' (one says deleted or they say
 * different lines: a tie between identical blocks decided it), or 'gave up' (either map met more than LINE_MAP_MAX_EDITS edits and has no answer; this
 * says nothing about the block, unlike the other two).
 */
export function mapLineStrict(before: string, after: string, line: number): StrictLine {
	if (before === after) return { line };
	const a = splitLines(before);
	const b = splitLines(after);
	if (line < 0 || line >= a.length) return 'deleted';
	const head = mapLineOf(a, b, line);
	const tail = fromTail(a, b, line);
	if (head === GAVE_UP || tail === GAVE_UP) return 'gave up';
	if (head === null && tail === null) return 'deleted';
	return head !== null && head === tail ? { line: head } : 'disagree';
}

function fromTail(a: readonly string[], b: readonly string[], line: number): number | null | typeof GAVE_UP {
	if (line < 0 || line >= a.length) return null;
	const r = mapLineOf(a.slice().reverse(), b.slice().reverse(), a.length - 1 - line);
	return r === null || r === GAVE_UP ? r : b.length - 1 - r;
}

function mapLineOf(a: readonly string[], b: readonly string[], line: number): number | null | typeof GAVE_UP {
	if (line < 0 || line >= a.length) return null;
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) head++;
	if (line < head) return line;
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
	if (line >= a.length - tail) return line + (b.length - a.length);
	// Myers over the changed middle a[head, a.length - tail) / b[head, b.length - tail).
	const A = a.slice(head, a.length - tail);
	const B = b.slice(head, b.length - tail);
	const n = A.length;
	const m = B.length;
	const max = Math.min(n + m, LINE_MAP_MAX_EDITS);
	const off = max + 1;
	const v = new Int32Array(2 * max + 3);
	const trace: Int32Array[] = [];
	let found = -1;
	for (let d = 0; d <= max && found < 0; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && A[x] === B[y]) {
				x++;
				y++;
			}
			v[off + k] = x;
			if (x >= n && y >= m) {
				found = d;
				break;
			}
		}
	}
	if (found < 0) return GAVE_UP;
	// Walk back from the end: every diagonal run is a run of kept lines, A[x] -> B[x - k].
	const target = line - head;
	let x = n;
	let y = m;
	for (let d = found; d >= 0; d--) {
		const vd = trace[d];
		const k = x - y;
		let prevK: number;
		if (d === 0) prevK = k;
		else prevK = k === -d || (k !== d && vd[off + k - 1] < vd[off + k + 1]) ? k + 1 : k - 1;
		const prevX = d === 0 ? 0 : vd[off + prevK];
		const prevY = prevX - prevK;
		const startX = d === 0 ? 0 : prevK === k + 1 ? prevX : prevX + 1;
		if (target >= startX && target < x) return head + target - (x - y);
		if (d === 0) break;
		x = prevX;
		y = prevY;
		if (target === x && prevK === k - 1) return null; // that line was deleted at this step
	}
	return null;
}
