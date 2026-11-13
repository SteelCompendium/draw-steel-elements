// SC-552 -- mapLine: where a line of one version of a note is in a later version. The block edit form pins its block's fence line
// when it opens; its Save maps that line through whatever was written to the note since (a click's write, an outside edit, Sync).
import { LINE_MAP_MAX_EDITS, mapLine, mapLineFromTail, mapLineGreedy, mapLineStrict } from '@/framework/host/lineMap';

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

// SC-612 -- mapLineGreedy: one side trimmed only. `mapLine` and `mapLineFromTail` trim BOTH ends, so an unrelated edit next to a run of identical blocks stops
// one trim for both and they agree on a guess; the greedy maps keep the tie visible.
describe('SC-612: mapLineGreedy', () => {
	// `# t / TOP / twin / '' / twin / BOTTOM`: two identical counters separated only by a blank line
	const pair = (top = 'TOP', bottom = 'BOTTOM', twins = 2) =>
		['# t', '', top, '', ...Array.from({ length: twins }, () => twin(5)).flatMap((t, i) => (i === 0 ? t : ['', ...t])), '', bottom].join('\n');
	const [UPPER, LOWER] = fencesOf(pair());

	it('the identity for identical texts', () => {
		const a = pair();
		expect(mapLineGreedy(a, a, LOWER, 'head')).toBe(LOWER);
		expect(mapLineGreedy(a, a, LOWER, 'tail')).toBe(LOWER);
	});

	it('a line outside the old text maps to null, in both directions', () => {
		const a = pair();
		const b = pair('TOP edited');
		expect(mapLineGreedy(a, b, 500, 'head')).toBeNull();
		expect(mapLineGreedy(a, b, -1, 'head')).toBeNull();
		expect(mapLineGreedy(a, b, 500, 'tail')).toBeNull();
		expect(mapLineGreedy(a, b, -1, 'tail')).toBeNull();
	});

	it('the pure tie (one of two blocks deleted): head pairs the upper twin with the survivor, tail pairs the lower one', () => {
		const a = pair();
		const b = pair('TOP', 'BOTTOM', 1);
		expect(mapLineGreedy(a, b, UPPER, 'head')).toBe(UPPER);
		expect(mapLineGreedy(a, b, LOWER, 'head')).toBeNull();
		expect(mapLineGreedy(a, b, UPPER, 'tail')).toBeNull();
		expect(mapLineGreedy(a, b, LOWER, 'tail')).toBe(UPPER);
	});

	it('the lower twin deleted and TOP edited: mapLine and mapLineFromTail agree on the survivor, the greedy maps do not', () => {
		const a = pair();
		const b = pair('TOP edited', 'BOTTOM', 1);
		expect(mapLine(a, b, LOWER)).toBe(UPPER);
		expect(mapLineFromTail(a, b, LOWER)).toBe(UPPER);
		expect(mapLineGreedy(a, b, LOWER, 'head')).toBeNull();
		expect(mapLineGreedy(a, b, LOWER, 'tail')).toBe(UPPER);
	});

	it('the same with BOTTOM edited and the upper twin pinned: now the tail map is the one that says deleted', () => {
		const a = pair();
		const b = pair('TOP', 'BOTTOM edited', 1);
		expect(mapLine(a, b, UPPER)).toBe(UPPER);
		expect(mapLineFromTail(a, b, UPPER)).toBe(UPPER);
		expect(mapLineGreedy(a, b, UPPER, 'head')).toBe(UPPER);
		expect(mapLineGreedy(a, b, UPPER, 'tail')).toBeNull();
	});

	it('a line the edit did not touch is placed the same by every map', () => {
		const a = pair('TOP edited');
		const b = pair('TOP edited', 'BOTTOM', 1);
		const lines = a.split('\n');
		const bottom = lines.length - 1;
		for (const from of ['head', 'tail'] as const) {
			expect(mapLineGreedy(a, b, 0, from)).toBe(0);
			expect(mapLineGreedy(a, b, bottom, from)).toBe(b.split('\n').length - 1);
		}
	});

	it('a one-sided insertion of more than LINE_MAP_MAX_EDITS lines: greedy head says "gave up" where mapLine still maps it', () => {
		const n = LINE_MAP_MAX_EDITS + 50;
		const a = pair();
		const b = ['# t', '', ...Array.from({ length: n }, (_, i) => `new${i}`), '', ...pair().split('\n').slice(2)].join('\n');
		expect(mapLine(a, b, UPPER)).toBe(UPPER + n + 1);
		expect(mapLineGreedy(a, b, UPPER, 'head')).toBe('gave up');
		// the tail side trims the shared end, so the greedy tail map finds it at once
		expect(mapLineGreedy(a, b, UPPER, 'tail')).toBe(UPPER + n + 1);
	});

	it('mapLine, mapLineFromTail and mapLineStrict give the same answers they did (the greedy trim flag is the greedy maps\' own)', () => {
		const a = pair();
		const b = pair('TOP', 'BOTTOM', 1);
		expect(mapLine(a, b, UPPER)).toBe(UPPER);
		expect(mapLine(a, b, LOWER)).toBeNull();
		expect(mapLineFromTail(a, b, UPPER)).toBeNull();
		expect(mapLineFromTail(a, b, LOWER)).toBe(UPPER);
		expect(mapLineStrict(a, b, UPPER)).toBe('disagree');
		expect(mapLineStrict(a, b, LOWER)).toBe('disagree');
	});
});
