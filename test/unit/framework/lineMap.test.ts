// SC-552 -- mapLine: where a line of one version of a note is in a later version. The block edit form pins its block's fence line
// when it opens; its Save maps that line through whatever was written to the note since (a click's write, an outside edit, Sync).
import { LINE_MAP_MAX_EDITS, editDistance, mapLine, mapLineFromTail, mapLineStrict } from '@/framework/host/lineMap';

const twin = (v: number) => ['```ds-counter', 'name: Twin', `current_value: ${v}`, '```'];
const note = (vals: number[], extra: Record<number, string[]> = {}) =>
	['# t', '', 'TOP', '', ...vals.flatMap((v, i) => [...(extra[i] ?? []), ...twin(v), '', `M${i}`, '']), 'BOTTOM'].join('\n');
const fencesOf = (text: string): number[] =>
	text.split('\n').map((l, i) => (l === '```ds-counter' ? i : -1)).filter((i) => i >= 0);

describe('SC-552: mapLine', () => {
	it('is the identity for identical texts', () => {
		const a = note([5, 5, 5]);
		expect(mapLine(a, a, 12)).toBe(12);
	});

	it('a change in the upper twin keeps the middle and lower fence lines where they were', () => {
		const a = note([5, 5, 5]);
		const b = note([6, 5, 5]);
		const f = fencesOf(a);
		expect(f.map((line) => mapLine(a, b, line))).toEqual(f);
	});

	it('upper AND lower changed: the middle keeps its place, a changed line maps to null', () => {
		const a = note([5, 5, 5]);
		const b = note([6, 5, 7]);
		const f = fencesOf(a);
		expect(mapLine(a, b, f[1])).toBe(f[1]);
		expect(mapLine(a, b, f[1] + 2)).toBe(f[1] + 2);
		expect(mapLine(a, b, f[0] + 2)).toBeNull();
	});

	it('lines inserted above shift the block', () => {
		const a = note([5, 5, 5]);
		const b = note([5, 5, 5], { 0: ['NEW1', 'NEW2', ''] });
		expect(fencesOf(a).map((line) => mapLine(a, b, line))).toEqual(fencesOf(b));
	});

	it('a line added inside the upper block and a line removed after the lower shift the blocks below by one', () => {
		const a = note([5, 5, 5]);
		const lines = a.split('\n');
		const f = fencesOf(a);
		lines.splice(f[0] + 2, 0, 'max_value: 20');
		lines.splice(lines.length - 2, 1);
		const b = lines.join('\n');
		expect(mapLine(a, b, f[1])).toBe(f[1] + 1);
		expect(mapLine(a, b, f[2])).toBe(f[2] + 1);
	});

	it('a deleted line maps to null, the lines after it move up', () => {
		const a = ['x', 'y', 'z'].join('\n');
		expect(mapLine(a, ['x', 'z'].join('\n'), 1)).toBeNull();
		expect(mapLine(a, ['x', 'z'].join('\n'), 2)).toBe(1);
	});

	it('numbers lines the way Obsidian does: CRLF, CR and LF are one break each', () => {
		expect(mapLine('a\r\nb\r\nc', 'a\r\nB\r\nb\r\nc', 1)).toBe(2);
		expect(mapLine('a\rb\rc', 'a\rB\rb\rc', 1)).toBe(2);
	});

	it('a line outside the old text maps to null', () => {
		expect(mapLine('a\nb', 'a\nb\nc', 5)).toBeNull();
		expect(mapLine('a\nb', 'a\nb\nc', -1)).toBeNull();
	});

	it('gives up (null) when the notes differ by more than LINE_MAP_MAX_EDITS lines', () => {
		const n = LINE_MAP_MAX_EDITS + 50;
		const a = Array.from({ length: n }, (_, i) => `a${i}`).join('\n');
		const b = Array.from({ length: n }, (_, i) => `b${i}`).join('\n');
		expect(mapLine(a, b, Math.floor(n / 2))).toBeNull();
	});
});

// SC-607 -- mapLineStrict: the line only when the head-first and the tail-first map agree, and WHY NOT otherwise (a deleted block and a tie between
// identical blocks say something about the block; a give-up at LINE_MAP_MAX_EDITS says nothing).
describe('SC-607: mapLineStrict', () => {
	const adjacent = (vals: number[]) => ['# t', '', 'TOP', '', ...vals.flatMap((v) => [...twin(v), '']), 'BOTTOM'].join('\n');

	it('the identity for identical texts, and the line where both alignments put it', () => {
		const a = note([5, 5, 5]);
		expect(mapLineStrict(a, a, 12)).toEqual({ line: 12 });
		const f = fencesOf(a);
		expect(mapLineStrict(a, note([6, 5, 5]), f[1])).toEqual({ line: f[1] });
		expect(mapLineStrict(a, ['added', ...a.split('\n')].join('\n'), f[1])).toEqual({ line: f[1] + 1 });
	});

	it('a changed line is deleted (both alignments), and so is a line that is not in the old text', () => {
		const a = note([5, 6, 7]);
		const f = fencesOf(a);
		expect(mapLineStrict(a, note([5, 8, 7]), f[1] + 2)).toBe('deleted');
		expect(mapLineStrict('a\nb', 'a\nb\nc', 5)).toBe('deleted');
		expect(mapLineStrict('a\nb', 'a\nb\nc', -1)).toBe('deleted');
	});

	it('two adjacent identical blocks, one deleted: the lower is deleted head-first and kept tail-first, so it is a tie ("disagree"), and the upper maps to the survivor head-first only', () => {
		const a = adjacent([5, 5]);
		const b = adjacent([5]);
		const [upper, lower] = fencesOf(a);
		expect(mapLine(a, b, upper)).toBe(upper);
		expect(mapLineFromTail(a, b, upper)).toBeNull();
		expect(mapLineStrict(a, b, upper)).toBe('disagree');
		expect(mapLine(a, b, lower)).toBeNull();
		expect(mapLineFromTail(a, b, lower)).toBe(upper);
		expect(mapLineStrict(a, b, lower)).toBe('disagree');
	});

	it('the same deletion with something between the blocks is no tie: the lower maps to the survivor, the upper is deleted', () => {
		const withMid = (twins: number) => ['# t', '', 'TOP', '', ...(twins > 1 ? [...twin(5), '', 'mid', ''] : ['mid', '']), ...twin(5), '', 'BOTTOM'].join('\n');
		const a = withMid(2);
		const b = withMid(1); // the upper block deleted
		const [upper, lower] = fencesOf(a);
		expect(mapLineStrict(a, b, lower)).toEqual({ line: fencesOf(b)[0] });
		expect(mapLineStrict(a, b, upper)).toBe('deleted');
	});

	it('"gave up" when more than LINE_MAP_MAX_EDITS lines changed around the line; mapLine and mapLineFromTail still say null for it', () => {
		const n = LINE_MAP_MAX_EDITS + 50;
		const a = Array.from({ length: n }, (_, i) => `a${i}`).join('\n');
		const b = Array.from({ length: n }, (_, i) => `b${i}`).join('\n');
		expect(mapLineStrict(a, b, Math.floor(n / 2))).toBe('gave up');
		expect(mapLine(a, b, Math.floor(n / 2))).toBeNull();
		expect(mapLineFromTail(a, b, Math.floor(n / 2))).toBeNull();
	});

	it('a line in the common head or tail is placed however much changed in between (no give-up)', () => {
		const n = LINE_MAP_MAX_EDITS + 50;
		const mid = (tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`);
		const a = ['top', ...mid('a'), 'bottom'].join('\n');
		const b = ['top', ...mid('b'), 'bottom'].join('\n');
		expect(mapLineStrict(a, b, 0)).toEqual({ line: 0 });
		expect(mapLineStrict(a, b, n + 1)).toEqual({ line: n + 1 });
	});
});

// SC-612 -- editDistance: the line-edit cost (lines deleted + inserted) of turning one version into another, null past a cap. It prices the placements of a block
// that has an identical twin (ReadingModeBlockHost.placedUniquely).
describe('SC-612: editDistance', () => {
	const L = (s: string) => (s === '' ? [] : s.split(' '));

	it('is 0 for equal lines and the number of lines for an insertion or a deletion', () => {
		expect(editDistance(L('a b c'), L('a b c'))).toBe(0);
		expect(editDistance([], [])).toBe(0);
		expect(editDistance(L('a b c'), L('a x b c'))).toBe(1);
		expect(editDistance(L('a x y b'), L('a b'))).toBe(2);
		expect(editDistance([], L('a b c'))).toBe(3);
		expect(editDistance(L('a b c'), [])).toBe(3);
	});

	it('a changed line costs a deletion and an insertion', () => {
		expect(editDistance(L('a b c'), L('a X c'))).toBe(2);
	});

	it('is symmetric and counts the minimal diff, not the first one found (a repeated line)', () => {
		expect(editDistance(L('a a a b'), L('a b'))).toBe(2);
		expect(editDistance(L('a b'), L('a a a b'))).toBe(2);
		expect(editDistance(L('x a b a y'), L('x b a b y'))).toBe(2);
	});

	it('null when the distance is more than the cap, the value when it is exactly the cap', () => {
		expect(editDistance(L('a b c'), L('a X c'), 2)).toBe(2);
		expect(editDistance(L('a b c'), L('a X c'), 1)).toBeNull();
		expect(editDistance(L('a b c'), L('a x y z b c'), 2)).toBeNull();
		expect(editDistance(L('a b c d'), L('p q r s'), 0)).toBeNull();
		expect(editDistance(L('a b'), L('a b'), 0)).toBe(0);
	});

	it('defaults to LINE_MAP_MAX_EDITS: a rewrite of more lines than that has no distance, an insertion of a few hundred lines has', () => {
		const n = LINE_MAP_MAX_EDITS + 50;
		const a = Array.from({ length: n }, (_, i) => `a${i}`);
		const b = Array.from({ length: n }, (_, i) => `b${i}`);
		expect(editDistance(a, b)).toBeNull();
		expect(editDistance(['top', ...a, 'bottom'], ['top', ...a.slice(0, 5), ...Array.from({ length: LINE_MAP_MAX_EDITS - 10 }, (_, i) => `n${i}`), ...a.slice(5), 'bottom'])).toBe(LINE_MAP_MAX_EDITS - 10);
	});

	it('mapLine, mapLineFromTail and mapLineStrict keep their answers for the pure tie (the diff they share was factored out)', () => {
		const pair = (twins: number) =>
			['# t', '', 'TOP', '', ...Array.from({ length: twins }, () => twin(5)).flatMap((t, i) => (i === 0 ? t : ['', ...t])), '', 'BOTTOM'].join('\n');
		const a = pair(2);
		const b = pair(1);
		const [upper, lower] = fencesOf(a);
		expect(mapLine(a, b, upper)).toBe(upper);
		expect(mapLine(a, b, lower)).toBeNull();
		expect(mapLineFromTail(a, b, upper)).toBeNull();
		expect(mapLineFromTail(a, b, lower)).toBe(upper);
		expect(mapLineStrict(a, b, upper)).toBe('disagree');
	});
});
