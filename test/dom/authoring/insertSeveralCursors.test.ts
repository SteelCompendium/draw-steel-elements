// SC-692 — an insert run with several cursors (Alt-click) lays the block out for EACH cursor's own line. The rule (the ledger's O2): the note
// ends up exactly as if single-cursor inserts had been run one at a time from the last range in the note to the first. The ORACLE below does
// exactly that, with the real single-cursor path on a real CodeMirror state (`_cmEditor.ts`), and every case is compared with it (text and
// cursors); the expected notes are also written out by hand so the oracle cannot be wrong the same way as the code.
// In a spec `|` is a cursor and «…» a selection; they are numbered in note order.
import { insertScaffold } from '../../../src/authoring/insert';
import { insertFullBlock, insertReferenceBlock } from '../../../src/authoring/compendiumInsert';
import { planBlockInsert, planBlockInserts } from '../../../src/authoring/blockInsert';
import { advancePosition } from '../../../src/authoring/scaffold';
import { listFences } from '../../../src/framework/sidebar/anchor';
import { matchFenceMarker } from '../../../src/framework/host/blockPrefix';
import { splitLines } from '../../../src/framework/host/lineEnding';
import type { ElementDefinition } from '../../../src/framework/registry';
import { existingBlocksIntactProblem } from '../../../e2e/driver/authoringIntact';
import { CmEditor } from './_cmEditor';

const BODY = 'a: 1\nb:\n  c: 2';
const CT = { id: 'ct', name: 'Counter', aliases: ['ds-ct'], authoring: { example: BODY } } as unknown as ElementDefinition;
/** The Counter block as `insertScaffold` writes it, one line each. */
const B = ['```ds-ct', 'a: 1', 'b:', '  c: 2', '```'];
const under = (prefix: string, lines = B) => lines.map((l) => prefix + l).join('\n');
const SCC = 'mcdm.heroes.v1/kit/panther';
const REF = ['```ds-scc', SCC, '```'];

type Pos = { line: number; ch: number };
interface Spec {
	note: string;
	ranges: Array<{ from: Pos; to: Pos }>;
}

/** `|` cursors and «selections» in note order → the note and its ranges. */
function parse(spec: string): Spec {
	let note = '';
	const ranges: Spec['ranges'] = [];
	const at = (offset: number): Pos => {
		const lines = note.slice(0, offset).split('\n');
		return { line: lines.length - 1, ch: lines[lines.length - 1].length };
	};
	for (let i = 0; i < spec.length; i++) {
		if (spec[i] === '|') ranges.push({ from: at(note.length), to: at(note.length) });
		else if (spec[i] === '«') {
			const close = spec.indexOf('»', i);
			const text = spec.slice(i + 1, close);
			const from = at(note.length);
			note += text;
			ranges.push({ from, to: at(note.length) });
			i = close;
		} else note += spec[i];
	}
	return { note, ranges };
}

/** An editor with every range selected; `main` is the index (in note order) of the main one. */
function editorFor(s: Spec, main = s.ranges.length - 1): CmEditor {
	const ed = new CmEditor(s.note);
	ed.setSelections(
		s.ranges.map((r) => ({ anchor: r.from, head: r.to })),
		main,
	);
	return ed;
}

/** The note with every cursor shown as `|` (a selection is always a cursor after the write). */
function shown(ed: CmEditor): string {
	const cursors = ed.listSelections().map((r) => ed.offsetOf(r.head));
	const v = ed.getValue();
	return cursors.reduceRight((t, o) => t.slice(0, o) + '|' + t.slice(o), v);
}

type Run = (ed: CmEditor) => void | boolean | Promise<boolean>;
const runCounter: Run = (ed) => insertScaffold(ed as never, CT);
const runReference: Run = (ed) => insertReferenceBlock(ed as never, { scc: SCC, type: 'kit', name: 'Panther', source: 'mcdm.heroes.v1', file: {} as never });
const runSnapshot: Run = (ed) => insertFullBlock(ed as never, { type: 'monster.goblin.statblock', name: 'Goblin', model: async () => undefined, body: async () => SCC } as never);

/**
 * The oracle: single-cursor inserts one at a time, last range first, each on a fresh editor holding the note the later ones left. Returns the final note and
 * every cursor as an offset in it (a cursor recorded earlier sits below the ones written later, so each later write shifts it by what it added).
 */
async function bottomUp(s: Spec, run: Run): Promise<{ text: string; cursors: number[] }> {
	let text = s.note;
	let cursors: number[] = [];
	for (let i = s.ranges.length - 1; i >= 0; i--) {
		const { from, to } = s.ranges[i];
		const ed = new CmEditor(text, from, to.line === from.line && to.ch === from.ch ? undefined : to);
		expect(await run(ed)).toBe(true);
		const grew = ed.getValue().length - text.length;
		cursors = [ed.offsetOf(ed.getCursor('head')), ...cursors.map((c) => c + grew)];
		text = ed.getValue();
	}
	return { text, cursors };
}

/** Runs the several-cursor insert and checks it against the oracle: the same note, every cursor at the oracle's offset, the main one kept. */
async function insertAll(spec: string, run: Run = runCounter, main?: number): Promise<{ ed: CmEditor; s: Spec }> {
	const s = parse(spec);
	const ed = editorFor(s, main);
	const mainBefore = main ?? s.ranges.length - 1;
	expect(await run(ed)).toBe(true);
	const expected = await bottomUp(s, run);
	expect(ed.getValue()).toBe(expected.text);
	expect(ed.listSelections().map((r) => ed.offsetOf(r.head))).toEqual(expected.cursors);
	expect(ed.listSelections().every((r) => r.anchor.line === r.head.line && r.anchor.ch === r.head.ch)).toBe(true);
	expect(ed.offsetOf(ed.getCursor('head'))).toBe(expected.cursors[mainBefore]);
	expect(ed.writes).toHaveLength(1); // ONE change: one undo
	return { ed, s };
}

describe('SC-692: every cursor gets a block laid out for its own line', () => {
	test('the ticket case: the main cursor on an empty line, a second at the end of `after text`', async () => {
		const { ed } = await insertAll('intro\n|\nafter text|', runCounter, 0);
		expect(ed.getValue()).toBe(`intro\n${B.join('\n')}\nafter text\n${B.join('\n')}`);
		// no copy glued to the text, and no fence line behind text
		expect(ed.getValue()).not.toMatch(/\S```ds-ct/);
		expect(shown(ed)).toBe(`intro\n\`\`\`ds-ct\n|a: 1\nb:\n  c: 2\n\`\`\`\nafter text\n\`\`\`ds-ct\n|a: 1\nb:\n  c: 2\n\`\`\``);
		expect(ed.getCursor('head')).toEqual({ line: 2, ch: 0 }); // the main cursor is the first block's
	});

	test('the same note with the main cursor at the end of `after text` (the main one stays the main one)', async () => {
		const { ed } = await insertAll('intro\n|\nafter text|', runCounter, 1);
		expect(ed.getValue()).toBe(`intro\n${B.join('\n')}\nafter text\n${B.join('\n')}`);
		expect(ed.getCursor('head')).toEqual({ line: 8, ch: 0 }); // the second block's first body line
		expect(ed.listSelections()).toHaveLength(2);
	});

	test('three cursors: an empty line, the end of a text line, the middle of a text line (its tail moves below the block)', async () => {
		const { ed } = await insertAll('|\nend of line|\nmid|dle');
		expect(ed.getValue()).toBe([...B, 'end of line', ...B, 'mid', ...B, 'dle'].join('\n'));
	});

	test('a callout line, a list item and a top-level line: each block carries its own prefix', async () => {
		const { ed } = await insertAll('> [!note] T\n> body|\n\n- item|\n\nplain|');
		expect(ed.getValue()).toBe(['> [!note] T', '> body', under('> '), '', '- item', under('  '), '', 'plain', ...B].join('\n'));
		// the write path (which reads quote prefixes, not list indentation) finds the callout's block and the top-level one, each with its own prefix
		const lines = splitLines(ed.getValue());
		const found = listFences(ed.getValue(), 'ds-ct');
		expect(found.map((f) => matchFenceMarker(lines[f.lineStart])?.prefix)).toEqual(['> ', '']);
	});

	test('two cursors on the SAME line, whitespace between them: two blocks, no blank or whitespace-only line between them', async () => {
		const { ed } = await insertAll('ab|  |cd');
		expect(ed.getValue()).toBe(['ab', ...B.slice(0, 4), '```  ', ...B, 'cd'].join('\n'));
		expect(splitLines(ed.getValue()).filter((l) => l.trim() === '')).toEqual([]);
	});

	test('two cursors on the same line, text between them: the middle text goes between the blocks', async () => {
		const { ed } = await insertAll('ab|cd|ef');
		expect(ed.getValue()).toBe(['ab', ...B, 'cd', ...B, 'ef'].join('\n'));
	});

	test('two cursors at the start of one line with text, and two cursors in one list item', async () => {
		expect((await insertAll('|ab|cd')).ed.getValue()).toBe([...B, 'ab', ...B, 'cd'].join('\n'));
		expect((await insertAll('- a|b|c')).ed.getValue()).toBe(['- a', under('  '), '  b', under('  '), '  c'].join('\n'));
	});

	test('cursors on two adjacent empty lines: two blocks in a row, nothing between', async () => {
		const { ed } = await insertAll('top\n|\n|\nbottom');
		expect(ed.getValue()).toBe(['top', ...B, ...B, 'bottom'].join('\n'));
		const found = listFences(ed.getValue(), 'ds-ct');
		expect(found).toHaveLength(2);
	});

	test('cursors on adjacent text lines', async () => {
		const { ed } = await insertAll('one|\ntwo|\nthree');
		expect(ed.getValue()).toBe(['one', ...B, 'two', ...B, 'three'].join('\n'));
	});

	test('a selection and a cursor: the selected text is replaced, the cursor gets its own block', async () => {
		const { ed } = await insertAll('ab«XY»cd\nend|');
		expect(ed.getValue()).toBe(['ab', ...B, 'cd', 'end', ...B].join('\n'));
		expect(ed.getValue()).not.toContain('XY');
		// a selection across lines
		const across = await insertAll('top\nab«XY\nZ»cd\n|');
		expect(across.ed.getValue()).toBe(['top', 'ab', ...B, 'cd', ...B].join('\n'));
	});

	test('two selections, the second inside a list item', async () => {
		const { ed } = await insertAll('«one» two\n- «three» four');
		expect(ed.getValue()).toBe([...B, ' two', '- ', under('  '), '   four'].join('\n'));
	});
});

describe('SC-692: the compendium reference and snapshot inserts with several cursors', () => {
	test.each([
		['reference', runReference, '```ds-scc'],
		['snapshot', runSnapshot, '```ds-sb'],
	])('%s: each cursor gets its own block and ends its line (endLine), the cursor after each', async (_name, run, open) => {
		const block = [open, SCC, '```'];
		const { ed } = await insertAll('abc|\n- item|\n\n|', run);
		expect(ed.getValue()).toBe(['abc', ...block, '', '- item', under('  ', block), '  ', '', ...block, ''].join('\n'));
		// every cursor is on the line after its block (behind that block's own prefix)
		expect(ed.listSelections().map((r) => r.head)).toEqual([
			{ line: 4, ch: 0 },
			{ line: 9, ch: 2 },
			{ line: 14, ch: 0 },
		]);
	});

	test('reference: two cursors on one line', async () => {
		const { ed } = await insertAll('ab|cd|ef', runReference);
		expect(ed.getValue()).toBe(['ab', ...REF, 'cd', ...REF, 'ef'].join('\n'));
	});
});

describe('SC-692: cursors after the write', () => {
	test('each cursor is where a single insert leaves it: the first body character of its block', async () => {
		const { ed } = await insertAll('> a|\n\n- b|\n|');
		expect(ed.listSelections().map((r) => r.head)).toEqual([
			{ line: 2, ch: 2 }, // `> a⏎> ```ds-ct⏎> |a: 1`
			{ line: 9, ch: 2 }, // under `- b`
			{ line: 14, ch: 0 }, // on the empty last line, no prefix
		]);
		expect(ed.getValue().split('\n')[2]).toBe('> a: 1');
		expect(ed.getValue().split('\n')[9]).toBe('  a: 1');
	});

	test('an earlier block on the same line moves the cursor of a later one (columns and lines)', async () => {
		const { ed } = await insertAll('ab|cd|ef');
		const lines = ed.getValue().split('\n');
		expect(ed.listSelections().map((r) => r.head)).toEqual([
			{ line: 2, ch: 0 },
			{ line: 8, ch: 0 },
		]);
		expect(lines[2]).toBe('a: 1');
		expect(lines[8]).toBe('a: 1');
	});

	test('the main cursor is the same range before and after, whichever it was', async () => {
		for (const main of [0, 1, 2]) {
			const { ed } = await insertAll('|\nx|\ny|z', runCounter, main);
			const heads = ed.listSelections().map((r) => r.head);
			expect(ed.getCursor('head')).toEqual(heads[main]);
		}
	});
});

describe('SC-692: the pure plan', () => {
	const lines = ['abc', '', '> q'];
	const getLine = (n: number) => lines[n] ?? '';
	const block = { text: B.join('\n'), cursorOffset: '```ds-ct\n'.length };

	test('one range is the single-cursor plan: same text, same cursor', () => {
		const range = { from: { line: 0, ch: 3 }, to: { line: 0, ch: 3 } };
		const single = planBlockInsert('abc', '', block);
		const plan = planBlockInserts(getLine, [range], block);
		expect(plan.changes).toEqual([{ ...range, text: single.text }]);
		expect(plan.cursors).toEqual([advancePosition(range.from, single.text, single.cursor!)]);
	});

	test('changes keep the note\'s own coordinates, in note order; cursors are in the note after every change', () => {
		const r1 = { from: { line: 0, ch: 3 }, to: { line: 0, ch: 3 } };
		const r2 = { from: { line: 2, ch: 3 }, to: { line: 2, ch: 3 } };
		const plan = planBlockInserts(getLine, [r1, r2], block);
		expect(plan.changes.map((c) => [c.from, c.to])).toEqual([
			[r1.from, r1.to],
			[r2.from, r2.to],
		]);
		expect(plan.changes[1].text).toBe('\n> ' + B.join('\n> '));
		// the second cursor is on the second block's first body line, five lines further down (the first change adds a line break and a five-line block)
		expect(plan.cursors).toEqual([
			{ line: 2, ch: 0 },
			{ line: 2 + 5 + 2, ch: 2 },
		]);
	});
});

describe('SC-692: integrity', () => {
	const STAM = '```ds-stam\nmax_stamina: 20\n\ncurrent_stamina: 5\n```';

	test('text above, between and below the cursors is untouched, and an existing block between two cursors is intact', async () => {
		const spec = `top line\nmore text|\n\n${STAM}\n\nbetween\n|\nlast|tail\nbottom`;
		const s = parse(spec);
		const { ed } = await insertAll(spec);
		const after = ed.getValue();
		expect(existingBlocksIntactProblem(s.note, after)).toBeNull();
		expect(after.startsWith('top line\nmore text\n```ds-ct\n')).toBe(true);
		expect(after).toContain(`\n\n${STAM}\n\nbetween\n`);
		expect(after).toBe(['top line', 'more text', ...B, '', STAM, '', 'between', ...B, 'last', ...B, 'tail', 'bottom'].join('\n'));
	});

	test('two same-kind blocks written at once are two separate blocks the write path tells apart', async () => {
		const { ed } = await insertAll('|\nx|');
		const found = listFences(ed.getValue(), 'ds-ct');
		expect(found).toHaveLength(2);
		expect(found[0].lineEnd).toBeLessThan(found[1].lineStart);
	});

	test('a cursor inside an existing block refuses the whole insert: nothing written at any cursor', () => {
		const s = parse(`${STAM}\n\nafter|`);
		const ed = editorFor({ ...s, ranges: [{ from: { line: 2, ch: 0 }, to: { line: 2, ch: 0 } }, ...s.ranges] }, 1);
		const before = ed.getValue();
		expect(insertScaffold(ed as never, CT)).toBe(false);
		expect(ed.getValue()).toBe(before);
		expect(ed.writes).toHaveLength(0);
		expect(ed.listSelections()).toHaveLength(2);
	});
});

describe('SC-692: one cursor is exactly what it was', () => {
	test('a single cursor still goes through the one replaceSelection', async () => {
		const ed = new CmEditor('abc', { line: 0, ch: 3 });
		expect(insertScaffold(ed as never, CT)).toBe(true);
		expect(ed.writes).toHaveLength(1);
		expect(ed.writes[0].via).toBe('replaceSelection');
		expect(ed.getValue()).toBe('abc\n' + B.join('\n'));
	});
});
