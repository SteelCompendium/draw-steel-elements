// SC-692: an insert command run with SEVERAL cursors (Alt-click) lays the block out for each cursor's own line, in one change. Driven the way a user
// does it: the cursors are set in a real editor, then Ctrl+P, the command's name, Enter. Every drive asserts the NOTE FILE (the block spliced in at each
// cursor the way a single insert at that cursor would, the last cursor first), where the cursors are afterwards, and that the blocks draw as DSE
// elements and the text beside them stays text. The ruled rule and its jsdom table: test/dom/authoring/insertSeveralCursors.test.ts.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import {
	clearNotices,
	drawn,
	editorState,
	isParagraphLine,
	isReadingParagraph,
	leaveBlock,
	noticeTexts,
	openEditor,
	palette,
	savedText,
	scaffoldOf,
	spliced,
	toReading,
	underPrefix,
	waitNotice,
	type EditMode,
	type Pos,
} from '../../driver/authoring';
import { ev } from '../../driver/page';

const VIEW = 'app.workspace.getMostRecentLeaf().view';
const CT = scaffoldOf('counter', 'ds-ct');
const INSIDE_BLOCK = 'The cursor is inside another block, so nothing was inserted. Move it to a line outside the block and run the command again.';

/**
 * Open `before` with a cursor at each of `cursors` (note order); `main` is the index of the main one. Obsidian takes the FIRST range handed to
 * `setSelections` as the main selection (its second argument does not move it, measured in 1.14.4), so the main one goes first.
 */
async function severalCursors(rel: string, before: string, mode: EditMode, cursors: Pos[], main: number): Promise<void> {
	await openEditor(rel, before, mode, cursors[0]);
	const order = [cursors[main], ...cursors.filter((_, i) => i !== main)].map((p) => ({ anchor: p }));
	await ev(`(() => { ${VIEW}.editor.setSelections(${JSON.stringify(order)}); ${VIEW}.editor.focus(); return true; })()`);
	expect(await heads()).toEqual(cursors);
	expect((await editorState()).cursor).toEqual(cursors[main]);
}

/** Every cursor's position, in note order (Obsidian lists them sorted). */
const heads = (): Promise<Pos[]> => ev<Pos[]>(`${VIEW}.editor.listSelections().map((r) => r.head)`);

/**
 * The note `before` after single inserts of the counter at `cursors` (positions in `before`), run from the last to the first: on an empty line the block
 * goes right there, at the end of a line of text it starts on the next line under the line's prefix (the SC-675 layout, written out again here).
 */
function bottomUp(before: string, cursors: Array<{ at: Pos; prefix: string; textBefore: boolean }>): string {
	return [...cursors].reverse().reduce((note, c) => spliced(note, c.at, undefined, c.textBefore ? '\n' + c.prefix + underPrefix(CT, c.prefix) : CT), before);
}

/** Where each cursor should be: the first body character (`name: Health`) of the block it wrote, in the order of the blocks in `note`. */
function bodyCursors(note: string, prefixes: string[]): Pos[] {
	const found = note.split('\n').flatMap((l, line) => (l.endsWith('name: Health') ? [line] : []));
	expect(found).toHaveLength(prefixes.length);
	return found.map((line, i) => ({ line, ch: prefixes[i].length }));
}

const NOTE = 'Intro line above\n\nafter text\n';
const EMPTY: Pos = { line: 1, ch: 0 };
const END_OF_TEXT: Pos = { line: 2, ch: 10 };
const EXPECTED = 'Intro line above\n' + CT + '\nafter text\n' + CT + '\n';

describe('insert commands with several cursors (SC-692)', () => {
	it('[AUTH-I43] the ticket\'s note, the main cursor on the empty line: both counters are written and draw, `after text` stays a paragraph, the two blocks do not share values', async () => {
		const rel = 'Authoring/several-main-first.md';
		await severalCursors(rel, NOTE, 'live-preview', [EMPTY, END_OF_TEXT], 0);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe(EXPECTED);
		expect(EXPECTED).toBe(bottomUp(NOTE, [{ at: EMPTY, prefix: '', textBefore: false}, { at: END_OF_TEXT, prefix: '', textBefore: true}]));
		// each cursor on the first body character of its own block; the main cursor is the first block's
		const [first, second] = bodyCursors(EXPECTED, ['', '']);
		expect(await heads()).toEqual([first, second]);
		expect((await editorState()).cursor).toEqual(first);
		await leaveBlock(2);
		expect(await drawn('live-preview')).toEqual({ roots: ['counter', 'counter'], errors: [] });
		expect(await isParagraphLine('after text')).toBe(true);
		// no cross-talk: change the first block's value in the note; only the first counter shows it, the note's second block is as written
		await ev(`(() => { const e = ${VIEW}.editor; e.replaceRange('current_value: 12', { line: 3, ch: 0 }, { line: 3, ch: 17 }); return true; })()`);
		const values = `Array.from(document.querySelectorAll('.workspace-leaf.mod-active .cm-content [data-dse-control="counter.input"]')).map((i) => i.value)`;
		await dse.waitFor(`JSON.stringify(${values}) === '["12","10"]'`, 'the first counter to show 12 and the second to keep 10');
		expect(await savedText(rel)).toBe(EXPECTED.replace('current_value: 10', 'current_value: 12'));
	});

	it('[AUTH-I44] the main cursor at the end of `after text`, the other on the empty line: the same note, the main cursor is the second block\'s', async () => {
		const rel = 'Authoring/several-main-second.md';
		await severalCursors(rel, NOTE, 'live-preview', [EMPTY, END_OF_TEXT], 1);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe(EXPECTED);
		const [first, second] = bodyCursors(EXPECTED, ['', '']);
		expect(await heads()).toEqual([first, second]);
		expect((await editorState()).cursor).toEqual(second);
		await leaveBlock(2);
		expect(await drawn('live-preview')).toEqual({ roots: ['counter', 'counter'], errors: [] });
		expect(await isParagraphLine('after text')).toBe(true);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['counter', 'counter'], errors: [] });
		expect(await isReadingParagraph('after text')).toBe(true);
	});

	it('[AUTH-I45] undo: one Ctrl+Z after the insert at two cursors gives the note back exactly (editor and file)', async () => {
		const rel = 'Authoring/several-undo.md';
		await severalCursors(rel, NOTE, 'live-preview', [EMPTY, END_OF_TEXT], 0);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect((await editorState()).value).toBe(EXPECTED);
		await browser.keys(['Control', 'z']);
		await dse.waitFor(`app.workspace.getMostRecentLeaf().view.editor.getValue() === ${JSON.stringify(NOTE)}`, 'one undo to restore the note');
		expect(await savedText(rel)).toBe(NOTE);
		// the cursors the insert started from come back with it (measured, not required by the note: the note is what the user keeps)
		expect(await heads()).toEqual([EMPTY, END_OF_TEXT]);
	});

	const MIXED = 'Intro line above\n\n> [!note] Callout title\n> last line\n\n- first item\n\nplain text\n';
	const IN_CALLOUT: Pos = { line: 3, ch: 11 };
	const IN_LIST: Pos = { line: 5, ch: 12 };
	const TOP_LEVEL: Pos = { line: 7, ch: 10 };
	const MIXED_AFTER = bottomUp(MIXED, [
		{ at: IN_CALLOUT, prefix: '> ', textBefore: true},
		{ at: IN_LIST, prefix: '  ', textBefore: true},
		{ at: TOP_LEVEL, prefix: '', textBefore: true},
	]);

	it('[AUTH-I46] a callout line, a list item and a top-level line: each block carries its own prefix (`> `, two spaces, none), all three draw in Live Preview', async () => {
		const rel = 'Authoring/several-containers-lp.md';
		await severalCursors(rel, MIXED, 'live-preview', [IN_CALLOUT, IN_LIST, TOP_LEVEL], 1);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe(MIXED_AFTER);
		expect(MIXED_AFTER).toContain('\n> ```ds-ct\n> name: Health\n');
		expect(MIXED_AFTER).toContain('\n  ```ds-ct\n  name: Health\n');
		expect(MIXED_AFTER.endsWith('plain text\n' + CT + '\n')).toBe(true);
		const expectedCursors = bodyCursors(MIXED_AFTER, ['> ', '  ', '']);
		expect(await heads()).toEqual(expectedCursors);
		expect((await editorState()).cursor).toEqual(expectedCursors[1]); // the list item's cursor was the main one
		await leaveBlock(3);
		expect(await drawn('live-preview')).toEqual({ roots: ['counter', 'counter', 'counter'], errors: [] });
		expect(await isParagraphLine('plain text')).toBe(true);
	});

	it('[AUTH-I47] the same note in Source mode: Reading view draws all three counters, the callout and the list item keep their text', async () => {
		const rel = 'Authoring/several-containers-src.md';
		await severalCursors(rel, MIXED, 'source', [IN_CALLOUT, IN_LIST, TOP_LEVEL], 2);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe(MIXED_AFTER);
		expect((await editorState()).cursor).toEqual(bodyCursors(MIXED_AFTER, ['> ', '  ', ''])[2]);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['counter', 'counter', 'counter'], errors: [] });
		expect(await isReadingParagraph('plain text')).toBe(true);
	});

	it('[AUTH-I48] two cursors on one line (`ab|cd|ef`): two blocks and the text between and after them, Reading view draws both', async () => {
		const rel = 'Authoring/several-same-line.md';
		await severalCursors(rel, 'abcdef\n', 'source', [{ line: 0, ch: 2 }, { line: 0, ch: 4 }], 0);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe('ab\n' + CT + '\ncd\n' + CT + '\nef\n');
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['counter', 'counter'], errors: [] });
		expect(await isReadingParagraph('cd')).toBe(true);
		expect(await isReadingParagraph('ef')).toBe(true);
	});

	it('[AUTH-I49] two cursors on adjacent empty lines: two blocks in a row, no line between them, Reading view draws both', async () => {
		const rel = 'Authoring/several-adjacent.md';
		await severalCursors(rel, 'top\n\n\nbottom\n', 'source', [{ line: 1, ch: 0 }, { line: 2, ch: 0 }], 1);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe('top\n' + CT + '\n' + CT + '\nbottom\n');
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['counter', 'counter'], errors: [] });
		expect(await isReadingParagraph('bottom')).toBe(true);
	});

	it('[AUTH-I50] one of two cursors inside a block: nothing is written at either (the SC-687 refusal), the note is as it was', async () => {
		const before = 'top\n\n```ds-stam\nmax_stamina: 20\n\ncurrent_stamina: 5\n```\n\nafter text\n';
		const rel = 'Authoring/several-refused.md';
		await severalCursors(rel, before, 'source', [{ line: 1, ch: 0 }, { line: 4, ch: 0 }], 0);
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await waitNotice(INSIDE_BLOCK);
		expect((await noticeTexts()).filter((t) => t.includes('nothing was inserted'))).toEqual([INSIDE_BLOCK]);
		expect(await savedText(rel)).toBe(before);
		expect(await heads()).toEqual([{ line: 1, ch: 0 }, { line: 4, ch: 0 }]);
	});
});
