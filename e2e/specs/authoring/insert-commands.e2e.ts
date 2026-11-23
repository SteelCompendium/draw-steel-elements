// SC-443: the insert commands (src/authoring/insert.ts), run the way a user runs them: Ctrl+P, the command's name, Enter, with the cursor in a
// real editor. Each element's command gets a round trip in Live Preview (AUTH-I01..I13); Source mode, a selection, the top and the end of a
// note, undo and a CRLF note are driven on top. Every round trip asserts the NOTE FILE (the example.yaml of the element spliced in at the
// cursor, every other byte as it was), the cursor after, and that the block draws as a DSE element and not an error card.
// With the experimental gate OFF (the shipped build): the eight deferred elements and ds-hero have no command (AUTH-I22).
import { browser, expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { existingBlocksIntactProblem } from '../../driver/authoringIntact';
import { drawn, editorState, insertCommandIds, leaveBlock, openEditor, palette, paletteRows, savedText, scaffoldOf, spliced, toReading, typeKeys, underPrefix, type EditMode, type Pos } from '../../driver/authoring';
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
	// SC-687: the insert has no guard for a cursor inside an existing block. The marker asks only that the existing block is intact afterwards (or
	// the note unchanged), so a refusal and a move-below fix both flip it.
	knownBug('SC-687', '[AUTH-I27] a command run on an empty line inside a ds-stam block leaves that block intact (or the note unchanged)', async () => {
		const before = '```ds-stam\nmax_stamina: 20\n\ncurrent_stamina: 5\n```\n\nafter text\n';
		const rel = 'Authoring/inside-block.md';
		await openEditor(rel, before, 'live-preview', { line: 2, ch: 0 });
		await palette('insert-counter', 'Insert Draw Steel: Counter');
		expect(existingBlocksIntactProblem(before, await savedText(rel))).toBeNull();
	}, { failsWith: /toBeNull/ });

	it('[AUTH-I25] Live Preview, the cursor at the end of a list item: the block sits under the item (two spaces), the next item follows untouched', () =>
		containerTrip('Authoring/list-lp.md', LIST, IN_LIST, '  ', 'live-preview'));
	it('[AUTH-I26] Source mode, the cursor at the end of a list item: the block sits under the item (two spaces), Reading view draws the counter', () =>
		containerTrip('Authoring/list-src.md', LIST, IN_LIST, '  ', 'source'));
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
