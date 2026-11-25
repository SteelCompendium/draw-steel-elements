// SC-443: the insert commands (src/authoring/insert.ts), run the way a user runs them: Ctrl+P, the command's name, Enter, with the cursor in a
// real editor. Each element's command gets a round trip in Live Preview (AUTH-I01..I13); Source mode, a selection, the top and the end of a
// note, undo and a CRLF note are driven on top. Every round trip asserts the NOTE FILE (the example.yaml of the element spliced in at the
// cursor, every other byte as it was), the cursor after, and that the block draws as a DSE element and not an error card.
// With the experimental gate OFF (the shipped build): the eight deferred elements and ds-hero have no command (AUTH-I22).
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { existingBlocksIntactProblem } from '../../driver/authoringIntact';
import {
	clearNotices,
	closeList,
	drawn,
	editorState,
	expectNoList,
	insertCommandIds,
	isParagraphLine,
	isReadingParagraph,
	leaveBlock,
	noticeTexts,
	openEditor,
	palette,
	paletteRows,
	pressList,
	savedText,
	scaffoldOf,
	setCursor,
	spliced,
	toReading,
	typeKeys,
	underPrefix,
	waitList,
	waitNotice,
	type EditMode,
	type Pos,
} from '../../driver/authoring';
import { ev } from '../../driver/page';
import { advertised, commandTrip, CURSOR, NOTE_BEFORE } from '../../driver/authoringTrips';

describe('insert commands, Live Preview: every shipped element', () => {
	it('[AUTH-I01] Horizontal rule', () => commandTrip('horizontal-rule', 'live-preview'));
	it('[AUTH-I02] Skills', () => commandTrip('skills', 'live-preview'));
	it('[AUTH-I03] Stamina bar', () => commandTrip('stamina-bar', 'live-preview'));
	it('[AUTH-I04] Negotiation tracker', () => commandTrip('negotiation', 'live-preview'));
	it('[AUTH-I05] Initiative tracker', () => commandTrip('initiative', 'live-preview'));
	it('[AUTH-I06] Feature', () => commandTrip('feature', 'live-preview'));
	it('[AUTH-I07] Featureblock', () => commandTrip('featureblock', 'live-preview'));
	it('[AUTH-I08] Statblock', () => commandTrip('statblock', 'live-preview'));
	it('[AUTH-I09] Counter', () => commandTrip('counter', 'live-preview'));
	it('[AUTH-I10] Values row', () => commandTrip('values-row', 'live-preview'));
	it('[AUTH-I11] Characteristics', () => commandTrip('characteristics', 'live-preview'));
	it('[AUTH-I12] SCC reference (with the compendium entry its example code names present)', () => commandTrip('scc', 'live-preview'));
	it('[AUTH-I13] Montage Test tracker', () => commandTrip('montage', 'live-preview'));
});

describe('insert commands, Source mode and other cursors', () => {
	it('[AUTH-I14] Source mode: Counter lands at the cursor, the note is the original with the block spliced in, and Reading view draws a counter', () => commandTrip('counter', 'source'));
	it('[AUTH-I15] Source mode: Stamina bar', () => commandTrip('stamina-bar', 'source'));

	it('[AUTH-I16] a selection is replaced by the block and nothing else changes', async () => {
		const before = 'Intro line above\nSELECT THIS TEXT\nOutro line below\n';
		const rel = 'Authoring/selection.md';
		await openEditor(rel, before, 'live-preview', { line: 1, ch: 0 }, { line: 1, ch: 16 });
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		const inserted = scaffoldOf('counter', 'ds-ct');
		const expected = spliced(before, { line: 1, ch: 0 }, { line: 1, ch: 16 }, inserted);
		expect(expected).toBe('Intro line above\n' + inserted + '\nOutro line below\n');
		expect(await savedText(rel)).toBe(expected);
		expect((await editorState()).cursor).toEqual({ line: 2, ch: 0 });
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: ['counter'], errors: [] });
	});

	it('[AUTH-I17] the top of the note (Source mode): the block is the first thing in the file', async () => {
		const before = '\nOutro line below\n';
		const rel = 'Authoring/top.md';
		await openEditor(rel, before, 'source', { line: 0, ch: 0 });
		await palette('insert-skills', 'Insert Draw Steel: Skills');
		const inserted = scaffoldOf('skills', 'ds-skills');
		expect(await savedText(rel)).toBe(inserted + before);
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 0 });
	});

	it('[AUTH-I18] the end of the note: nothing follows the block, nothing before it moves', async () => {
		const before = 'Intro line above\n\n';
		const rel = 'Authoring/end.md';
		await openEditor(rel, before, 'live-preview', { line: 2, ch: 0 });
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		const inserted = scaffoldOf('counter', 'ds-ct');
		expect(await savedText(rel)).toBe(before + inserted);
		expect((await editorState()).cursor).toEqual({ line: 3, ch: 0 });
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: ['counter'], errors: [] });
	});

	it('[AUTH-I19] undo: one Ctrl+Z after the insert gives the note back exactly (editor and file)', async () => {
		const rel = 'Authoring/undo.md';
		await openEditor(rel, NOTE_BEFORE, 'live-preview', CURSOR);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect((await editorState()).value).not.toBe(NOTE_BEFORE);
		await browser.keys(['Control', 'z']);
		await dse.waitFor(`app.workspace.getMostRecentLeaf().view.editor.getValue() === ${JSON.stringify(NOTE_BEFORE)}`, 'one undo to restore the note');
		expect(await savedText(rel)).toBe(NOTE_BEFORE);
		expect((await editorState()).cursor).toEqual(CURSOR);
	});

	it('[AUTH-I20] a CRLF note: Obsidian\'s editor holds LF and saves LF on ANY edit, so the whole file leaves CRLF (not specific to the insert)', async () => {
		const crlf = 'Intro line above\r\n\r\n\r\nOutro line below\r\n';
		// control: a typed character does the same
		await openEditor('Authoring/crlf-typed.md', crlf, 'live-preview', CURSOR);
		await typeKeys('x');
		expect(await savedText('Authoring/crlf-typed.md')).toBe(NOTE_BEFORE.replace('\n\n\n', '\n\nx\n'));
		// the insert
		await openEditor('Authoring/crlf.md', crlf, 'live-preview', CURSOR);
		expect((await editorState()).value).toBe(NOTE_BEFORE);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		const saved = await savedText('Authoring/crlf.md');
		expect(saved).toBe(spliced(NOTE_BEFORE, CURSOR, undefined, scaffoldOf('counter', 'ds-ct')));
		expect(saved.includes('\r')).toBe(false);
	});

	it('[AUTH-I21] a command run at the end of a line of text: the block starts on the next line, the text stays above it, nothing else changes', async () => {
		const before = 'abc';
		const rel = 'Authoring/midline.md';
		await openEditor(rel, before, 'live-preview', { line: 0, ch: 3 });
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe('abc\n' + scaffoldOf('counter', 'ds-ct'));
		expect((await editorState()).cursor).toEqual({ line: 2, ch: 0 });
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: ['counter'], errors: [] });
	});

	/**
	 * The insert command with the cursor at the end of a line that sits in a container (a callout, a list item): every line of the block carries
	 * the cursor line's prefix, the line after the cursor line follows the block untouched, the cursor lands on the first body character, and
	 * the block draws as a DSE element (Live Preview once the cursor leaves it, Reading view for a Source-mode note). No write is driven on
	 * the block (an indented fence in a list item cannot save).
	 */
	async function containerTrip(rel: string, before: string, at: Pos, prefix: string, mode: EditMode): Promise<void> {
		await openEditor(rel, before, mode, at);
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		const block = underPrefix(scaffoldOf('counter', 'ds-ct'), prefix);
		const expected = spliced(before, at, undefined, '\n' + prefix + block);
		expect(await savedText(rel)).toBe(expected);
		const state = await editorState();
		expect(state.value).toBe(expected);
		expect(state.cursor).toEqual({ line: at.line + 2, ch: prefix.length });
		if (mode === 'live-preview') {
			await leaveBlock(1);
			expect(await drawn('live-preview')).toEqual({ roots: ['counter'], errors: [] });
		} else {
			await toReading(rel);
			expect(await drawn('reading')).toEqual({ roots: ['counter'], errors: [] });
		}
	}
	const CALLOUT = 'Intro line above\n\n> [!note] Callout title\n> first line\n> last line\n\nOutro line below\n';
	const IN_CALLOUT: Pos = { line: 3, ch: 12 };
	const LIST = 'Intro line above\n\n- first item\n- second item\n\nOutro line below\n';
	const IN_LIST: Pos = { line: 2, ch: 12 };

	it('[AUTH-I23] Live Preview, the cursor at the end of a callout line: every line of the block keeps the "> ", the callout lines around it are untouched', () =>
		containerTrip('Authoring/callout-lp.md', CALLOUT, IN_CALLOUT, '> ', 'live-preview'));
	it('[AUTH-I24] Source mode, the cursor at the end of a callout line: every line of the block keeps the "> ", Reading view draws the counter', () =>
		containerTrip('Authoring/callout-src.md', CALLOUT, IN_CALLOUT, '> ', 'source'));
	// SC-687: with the cursor inside an existing block the insert is refused (the note is left exactly as it was, one Notice says why).
	it('[AUTH-I27] a command run on an empty line inside a ds-stam block leaves that block intact (or the note unchanged)', async () => {
		const before = '```ds-stam\nmax_stamina: 20\n\ncurrent_stamina: 5\n```\n\nafter text\n';
		const rel = 'Authoring/inside-block.md';
		await openEditor(rel, before, 'live-preview', { line: 2, ch: 0 });
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(existingBlocksIntactProblem(before, await savedText(rel))).toBeNull();
	});

	it('[AUTH-I25] Live Preview, the cursor at the end of a list item: the block sits under the item (two spaces), the next item follows untouched', () =>
		containerTrip('Authoring/list-lp.md', LIST, IN_LIST, '  ', 'live-preview'));
	it('[AUTH-I26] Source mode, the cursor at the end of a list item: the block sits under the item (two spaces), Reading view draws the counter', () =>
		containerTrip('Authoring/list-src.md', LIST, IN_LIST, '  ', 'source'));
});

const INSIDE_BLOCK = 'The cursor is inside another block, so nothing was inserted. Move it to a line outside the block and run the command again.';
const INSIDE_PROPERTIES = "The cursor is inside the note's properties, so nothing was inserted. Move it below the properties and run the command again.";
const STAM_NOTE = '```ds-stam\nmax_stamina: 20\n\ncurrent_stamina: 5\n```\n\nafter text\n';
const IN_STAM: Pos = { line: 2, ch: 0 }; // the empty line inside the block: the ticket's repro
const AFTER_TEXT: Pos = { line: 6, ch: 0 };

/** The refused insert as the user meets it: exactly one Notice with the text, the Notice really on screen, and the note and the cursor as they were. */
async function expectRefused(rel: string, before: string, at: Pos, notice: string): Promise<void> {
	await waitNotice(notice);
	expect((await noticeTexts()).filter((t) => t.includes('nothing was inserted'))).toEqual([notice]);
	expect(await savedText(rel)).toBe(before);
	const state = await editorState();
	expect(state.value).toBe(before);
	expect(state.cursor).toEqual(at);
	expect(state.from).toEqual(at);
	expect(state.to).toEqual(at);
}

describe('insert commands refuse inside an existing block or the properties (SC-687)', () => {
	it('[AUTH-I28] Live Preview, the ticket\'s repro: the note is untouched, the Notice is on screen, the stamina bar still draws and "after text" is still a paragraph', async () => {
		const rel = 'Authoring/refuse-lp.md';
		await openEditor(rel, STAM_NOTE, 'live-preview', IN_STAM);
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused(rel, STAM_NOTE, IN_STAM, INSIDE_BLOCK);
		await leaveBlock(1, AFTER_TEXT);
		expect(await drawn('live-preview')).toEqual({ roots: ['stamina-bar'], errors: [] });
		expect(await isParagraphLine('after text')).toBe(true);
		expect(await savedText(rel)).toBe(STAM_NOTE);
	});

	it('[AUTH-I29] Source mode, the same note and cursor: the note is untouched, the Notice is on screen, Reading view draws the stamina bar and "after text" is a paragraph', async () => {
		const rel = 'Authoring/refuse-src.md';
		await openEditor(rel, STAM_NOTE, 'source', IN_STAM);
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused(rel, STAM_NOTE, IN_STAM, INSIDE_BLOCK);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['stamina-bar'], errors: [] });
		expect(await isReadingParagraph('after text')).toBe(true);
	});

	it('[AUTH-I30] the compendium reference command with the cursor inside a block: the Notice, no search window, the note unchanged', async () => {
		const rel = 'Authoring/refuse-ref.md';
		await openEditor(rel, STAM_NOTE, 'live-preview', IN_STAM);
		await clearNotices();
		await palette('insert-compendium-reference', 'Insert Draw Steel: compendium reference');
		await expectRefused(rel, STAM_NOTE, IN_STAM, INSIDE_BLOCK);
		await browser.pause(400); // a search window would be up by now
		expect(await ev<boolean>(`!!document.querySelector('.modal-container') || !!document.querySelector('[data-dse-control="authoring.search.input"]')`)).toBe(false);
	});

	it('[AUTH-I31] the compendium snapshot command with the cursor inside a block: the Notice, no search window, the note unchanged', async () => {
		const rel = 'Authoring/refuse-snap.md';
		await openEditor(rel, STAM_NOTE, 'live-preview', IN_STAM);
		await clearNotices();
		await palette('insert-compendium-block', 'Insert Draw Steel: compendium block (snapshot)');
		await expectRefused(rel, STAM_NOTE, IN_STAM, INSIDE_BLOCK);
		await browser.pause(400);
		expect(await ev<boolean>(`!!document.querySelector('.modal-container') || !!document.querySelector('[data-dse-control="authoring.search.input"]')`)).toBe(false);
	});

	it('[AUTH-I32] Source mode, the cursor in the note\'s properties: the properties Notice, the note unchanged', async () => {
		const before = '---\ntags: [a]\n\n---\nbody\n';
		const rel = 'Authoring/refuse-props.md';
		await openEditor(rel, before, 'source', { line: 2, ch: 0 });
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused(rel, before, { line: 2, ch: 0 }, INSIDE_PROPERTIES);
	});

	it('[AUTH-I33] a command run twice in a row under a list item: the second run is refused, the first block is intact and both Reading view and the file show only it', async () => {
		const before = 'Intro line above\n\n- first item\n- second item\n\nOutro line below\n';
		const rel = 'Authoring/refuse-twice.md';
		await openEditor(rel, before, 'source', { line: 2, ch: 12 });
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		const afterFirst = spliced(before, { line: 2, ch: 12 }, undefined, '\n  ' + underPrefix(scaffoldOf('counter', 'ds-ct'), '  '));
		expect(await savedText(rel)).toBe(afterFirst);
		const inBlock = (await editorState()).cursor; // the first body character of the new block
		expect(inBlock).toEqual({ line: 4, ch: 2 });
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused(rel, afterFirst, inBlock, INSIDE_BLOCK);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['counter'], errors: [] });
	});

	it('[AUTH-I34] a command run at the end of a closing fence line: the new block lands below it, both blocks draw in Reading view, the text after stays below both', async () => {
		const stam = scaffoldOf('stamina-bar', 'ds-stam');
		const before = stam + '\nafter text\n';
		const rel = 'Authoring/end-of-closer.md';
		const at: Pos = { line: stam.split('\n').length - 1, ch: 3 };
		await openEditor(rel, before, 'source', at);
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe(stam + '\n' + scaffoldOf('counter', 'ds-ct') + '\nafter text\n');
		expect(await noticeTexts()).toEqual([]);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['stamina-bar', 'counter'], errors: [] });
		expect(await isReadingParagraph('after text')).toBe(true);
	});

	it('[AUTH-I35] undo: a refused command adds no undo entry (Ctrl+Z after it changes nothing, and the one before it is still the typed character)', async () => {
		const rel = 'Authoring/refuse-undo.md';
		await openEditor(rel, STAM_NOTE, 'live-preview', IN_STAM);
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused(rel, STAM_NOTE, IN_STAM, INSIDE_BLOCK);
		await browser.keys(['Control', 'z']);
		await browser.pause(300);
		expect((await editorState()).value).toBe(STAM_NOTE); // nothing to undo: the refusal wrote nothing
		// now with an earlier edit in the history: type a character on the empty line, get refused, one Ctrl+Z takes the typed character back
		await typeKeys('x');
		await closeList(); // the key list may open on the new word
		const typed = STAM_NOTE.replace('\n\ncurrent', '\nx\ncurrent');
		expect((await editorState()).value).toBe(typed);
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await waitNotice(INSIDE_BLOCK);
		expect((await editorState()).value).toBe(typed);
		await browser.keys(['Control', 'z']);
		await dse.waitFor(`app.workspace.getMostRecentLeaf().view.editor.getValue() === ${JSON.stringify(STAM_NOTE)}`, 'one undo to take the typed character back');
	});
});

describe('insert commands: the r3 fixes of SC-687', () => {
	const VIEW = 'app.workspace.getMostRecentLeaf().view';

	it('[AUTH-I36] the plugin\'s own insert under a list item does not make the next insert refuse: insert on the empty line under `- item`, then at `tail`: both are written and both draw', async () => {
		const before = '- item\n\ntail\n';
		const rel = 'Authoring/chain.md';
		await openEditor(rel, before, 'live-preview', { line: 1, ch: 0 });
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		const ct = scaffoldOf('counter', 'ds-ct');
		const afterFirst = '- item\n' + ct + '\ntail\n';
		expect(await savedText(rel)).toBe(afterFirst);
		await setCursor({ line: afterFirst.split('\n').indexOf('tail'), ch: 4 });
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe(afterFirst + ct + '\n');
		expect(await noticeTexts()).toEqual([]);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['counter', 'counter'], errors: [] });
		expect(await isReadingParagraph('tail')).toBe(true);
	});

	it('[AUTH-I37] a real block under a later list item, after a fence under an earlier one: refused, the note unchanged (it used to be written into the block)', async () => {
		const before = '- item\n```js\nx\n```\n- other\n  ```\n  a: 1\n  ```\ntail\n';
		const rel = 'Authoring/chain-bare.md';
		await openEditor(rel, before, 'source', { line: 6, ch: 6 });
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused(rel, before, { line: 6, ch: 6 }, INSIDE_BLOCK);
	});

	it('[AUTH-I38] a line without the `>` prefix inside a quoted fence is still in the block: refused in a plain quote (Source mode) and in a callout (Live Preview), the note unchanged', async () => {
		const plain = '> ```js\n> a\nb\n> ```\nafter\n';
		await openEditor('Authoring/lazy-quote.md', plain, 'source', { line: 2, ch: 1 });
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused('Authoring/lazy-quote.md', plain, { line: 2, ch: 1 }, INSIDE_BLOCK);
		const callout = '> [!note] T\n> ```js\n> a\nb\n> ```\n\nafter\n';
		await openEditor('Authoring/lazy-callout.md', callout, 'live-preview', { line: 3, ch: 1 });
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused('Authoring/lazy-callout.md', callout, { line: 3, ch: 1 }, INSIDE_BLOCK);
	});

	it('[AUTH-I39] two cursors, one inside a block (the main one inside, and the main one outside): refused, one Notice, the note unchanged at both', async () => {
		const note = 'before\n\n' + STAM_NOTE;
		const IN = '{ anchor: { line: 4, ch: 0 }, head: { line: 4, ch: 0 } }';
		const OUT = '{ anchor: { line: 8, ch: 10 }, head: { line: 8, ch: 10 } }';
		// Obsidian's main selection is the range at index 0 of the array it is given (the main index argument does not move it), and
		// `getCursor()` answers for it: so the order says which cursor is the main one.
		for (const [name, ranges, mainLine] of [['main-inside', `[${IN}, ${OUT}]`, 4], ['main-outside', `[${OUT}, ${IN}]`, 8]] as const) {
			const rel = `Authoring/multi-${name}.md`;
			await openEditor(rel, note, 'source', { line: 0, ch: 0 });
			await ev(`(() => { ${VIEW}.editor.setSelections(${ranges}, 0); ${VIEW}.editor.focus(); return true; })()`);
			expect(await ev<number>(`${VIEW}.editor.listSelections().length`)).toBe(2);
			expect((await editorState()).cursor.line).toBe(mainLine);
			await clearNotices();
			await palette('insert-counter', 'Insert Draw Steel: Counter');
			await waitNotice(INSIDE_BLOCK);
			expect((await noticeTexts()).filter((t) => t.includes('nothing was inserted'))).toEqual([INSIDE_BLOCK]);
			expect(await savedText(rel)).toBe(note);
			expect(await ev<number>(`${VIEW}.editor.listSelections().length`)).toBe(2);
		}
	});

	it('[AUTH-I40] a `/ds` pick refused in the properties closes the list: one Notice, no row left on screen, the typed token stays', async () => {
		const before = '---\ntags: a\n\n---\nbody\n';
		const rel = 'Authoring/ds-refused.md';
		await openEditor(rel, before, 'source', { line: 2, ch: 0 });
		await clearNotices();
		await typeKeys('/dscounter', 'authoring.ds.trigger');
		await waitList(1);
		await pressList('Enter');
		await waitNotice(INSIDE_PROPERTIES);
		await expectNoList();
		expect((await noticeTexts()).filter((t) => t.includes('nothing was inserted'))).toEqual([INSIDE_PROPERTIES]);
		expect(await savedText(rel)).toBe('---\ntags: a\n/dscounter\n---\nbody\n');
	});

	it('[AUTH-I41] a line-0 `---` that is never closed is not properties: the insert below it is written and Reading view draws the block', async () => {
		const before = '---\na: 1\n\nafter\n';
		const rel = 'Authoring/unclosed.md';
		await openEditor(rel, before, 'source', { line: 2, ch: 0 });
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(await savedText(rel)).toBe(spliced(before, { line: 2, ch: 0 }, undefined, scaffoldOf('counter', 'ds-ct')));
		expect(await noticeTexts()).toEqual([]);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['counter'], errors: [] });
	});

	it('[AUTH-I42] a tab-indented block under a nested list item (Obsidian\'s default list indentation): refused, the note unchanged, Reading view still draws the counter', async () => {
		const before = '- a\n\t- b\n\t\t```ds-ct\n\t\tname: x\n\t\tcurrent_value: 1\n\t\t```\ntail\n';
		const rel = 'Authoring/tab-nested.md';
		await openEditor(rel, before, 'source', { line: 3, ch: 9 });
		await clearNotices();
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		await expectRefused(rel, before, { line: 3, ch: 9 }, INSIDE_BLOCK);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['counter'], errors: [] });
	});
});

describe('insert commands, experimental gate OFF (the shipped build)', () => {
	it('[AUTH-I22] exactly the thirteen shipped element commands and the two compendium commands exist: no deferred element, no ds-hero', async () => {
		await openEditor('Authoring/palette.md', 'x\n', 'live-preview');
		const expected = [...advertised(false).map((e) => `insert-${e.id}`), 'insert-compendium-block', 'insert-compendium-reference'].sort();
		expect(expected).toHaveLength(15);
		expect(await insertCommandIds()).toEqual(expected);
		// the palette shows the same: fifteen "Insert Draw Steel" rows, none for Roll, Encounter, Hero sheet...
		const rows = (await paletteRows('Insert Draw Steel:')).filter((r) => r.includes('Insert Draw Steel')).map((r) => r.replace('Draw Steel Elements', ''));
		expect(rows.sort()).toEqual(
			[...advertised(false).map((e) => `Insert Draw Steel: ${e.name}`), 'Insert Draw Steel: compendium block (snapshot)', 'Insert Draw Steel: compendium reference'].sort(),
		);
		for (const name of ['Roll', 'Hero sheet', 'Encounter builder', 'Surges']) {
			expect((await paletteRows(`Insert Draw Steel: ${name}`)).some((r) => r.endsWith(`: ${name}`))).toBe(false);
		}
	});
});
