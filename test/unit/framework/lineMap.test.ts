// SC-552 -- mapLine: where a line of one version of a note is in a later version. The block edit form pins its block's fence line
// when it opens; its Save maps that line through whatever was written to the note since (a click's write, an outside edit, Sync).
import { LINE_MAP_MAX_EDITS, mapLine } from '@/framework/host/lineMap';

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
