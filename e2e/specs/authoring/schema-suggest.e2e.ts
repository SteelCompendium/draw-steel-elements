// SC-443: the in-fence key autocomplete (src/authoring/schemaSuggest.ts), typed for real inside a ds-* block. A key name at the start of a body
// line offers the schema's keys; the rows are `authoring.schema.key`. Accept by Enter / click, move with ArrowDown, dismiss with Escape; each
// accept asserts the NOTE FILE (the typed prefix became the key, every other byte as it was). The block's language decides the keys: a second
// block uses the second's. Silent outside the block, on a fence line, on an indented line that has no object above it to be a key of, and for
// the deferred elements while the gate is OFF. SC-707: the keys of the initiative tracker (it has no schema; a suggestions-only one), and the keys inside
// a nested object or a list entry (a hero's `max_stamina`, a creature two lists deep, a ds-skills `custom_skills` entry).
// (The enum value list exists only with the gate ON: AUTH-G10.)
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { clickRow, closeList, drawn, editorState, leaveBlock, listRows, openEditor, pressList, savedText, selectedListRow, setCursor, spliced, toReading, typeKeys, waitList, waitNoList } from '../../driver/authoring';

const TRIGGER = 'authoring.schema.trigger';
const KEY = 'authoring.schema.key';
const STAM = '```ds-stam\n\n```\nafter\n';
const AT = { line: 1, ch: 0 };

describe('in-fence key autocomplete', () => {
	it('[AUTH-K01] Live Preview: `cur` in a ds-stam block offers current_stamina; Enter writes the key over what was typed, nothing else changes, the cursor is after it; once the line is finished the block draws', async () => {
		const rel = 'Authoring/key-enter.md';
		// the block already has its required `max_stamina`, so finishing the new line makes a block that renders
		const note = '```ds-stam\nmax_stamina: 20\n\n```\nafter\n';
		const at = { line: 2, ch: 0 };
		await openEditor(rel, note, 'live-preview', at);
		await typeKeys('cur', TRIGGER);
		const rows = await waitList(1);
		expect(rows).toEqual([{ id: KEY, text: 'current_stamina', selected: true }]);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe(spliced(note, at, undefined, 'current_stamina'));
		expect((await editorState()).cursor).toEqual({ line: 2, ch: 15 });
		// The accept adds no `: ` (a rough edge noted on SC-678), so the block is an error card until the line is finished: type the value, then the
		// block draws as a stamina bar once the cursor is outside it (the `after` line).
		await typeKeys(': 5');
		expect(await savedText(rel)).toBe('```ds-stam\nmax_stamina: 20\ncurrent_stamina: 5\n```\nafter\n');
		await leaveBlock(1, { line: 4, ch: 0 });
		expect(await drawn('live-preview')).toEqual({ roots: ['stamina-bar'], errors: [] });
	});

	it('[AUTH-K02] Source mode: `max` offers max_stamina; a click on the row writes it; once the line is finished Reading view draws the block', async () => {
		const rel = 'Authoring/key-click.md';
		await openEditor(rel, STAM, 'source', AT);
		await typeKeys('max', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['max_stamina']);
		await clickRow(KEY, 0);
		await closeList();
		expect(await savedText(rel)).toBe(spliced(STAM, AT, undefined, 'max_stamina'));
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 11 });
		await typeKeys(': 30'); // the accept adds no `: ` (see AUTH-K01); finish the line, then Reading view draws the bar
		expect(await savedText(rel)).toBe('```ds-stam\nmax_stamina: 30\n```\nafter\n');
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['stamina-bar'], errors: [] });
	});

	it('[AUTH-K03] `re` offers recoveries then recoveries_max; ArrowDown selects the second, Enter writes it', async () => {
		const rel = 'Authoring/key-arrow.md';
		await openEditor(rel, STAM, 'live-preview', AT);
		await typeKeys('re', TRIGGER);
		expect((await waitList(2)).map((r) => r.text)).toEqual(['recoveries', 'recoveries_max']);
		await pressList('ArrowDown');
		expect(await selectedListRow()).toBe(1);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe(spliced(STAM, AT, undefined, 'recoveries_max'));
	});

	it('[AUTH-K04] Escape closes the list and keeps what was typed; nothing is written but the typed letters', async () => {
		const rel = 'Authoring/key-escape.md';
		await openEditor(rel, STAM, 'source', AT);
		await typeKeys('cur', TRIGGER);
		await waitList(1);
		await pressList('Escape');
		await waitNoList();
		expect(await savedText(rel)).toBe(spliced(STAM, AT, undefined, 'cur'));
	});

	it('[AUTH-K05] two blocks in one note (Source mode): `ski` in the ds-stam block offers nothing, in the ds-skills block it offers skills', async () => {
		const rel = 'Authoring/key-two-blocks.md';
		await openEditor(rel, '```ds-stam\n\n```\n\n```ds-skills\n\n```\n', 'source', { line: 1, ch: 0 });
		await typeKeys('ski', TRIGGER);
		await waitNoList();
		await setCursor({ line: 5, ch: 0 });
		await typeKeys('ski', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['skills']);
	});

	it('[AUTH-K06] a block opened with extra words on its fence line (`ds-stam  extra words`) still gets its keys', async () => {
		const rel = 'Authoring/key-words.md';
		await openEditor(rel, '```ds-stam  extra words\n\n```\n', 'live-preview', AT);
		await typeKeys('cur', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['current_stamina']);
	});

	it('[AUTH-K07] silent after the block closed, on a fence line, on an indented line and in a block of another language; the block itself still offers keys', async () => {
		const rel = 'Authoring/key-silent.md';
		await openEditor(rel, '```ds-stam\nmax_stamina: 20\n```\nafter\n```js\nx\n```\n', 'source', { line: 3, ch: 5 });
		await typeKeys(' cur', TRIGGER); // after the closing fence
		await waitNoList();
		await setCursor({ line: 4, ch: 5 });
		await typeKeys('cur', TRIGGER); // on the opening fence line of the js block
		await waitNoList();
		await setCursor({ line: 5, ch: 1 });
		await typeKeys(' cur', TRIGGER); // inside the js block
		await waitNoList();
		await setCursor({ line: 1, ch: 13 });
		await typeKeys('\n  cur', TRIGGER); // an indented key under `max_stamina: 20`, a key with a value: no object to be a key of
		await waitNoList();
		await setCursor({ line: 1, ch: 13 });
		await typeKeys('\ncur', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['current_stamina']);
		await browser.keys('Escape');
	});

	it('[AUTH-K08] gate OFF: a ds-roll block (deferred) offers no keys, a ds-hero block neither; a ds-stam block in the same note does', async () => {
		const rel = 'Authoring/key-deferred.md';
		await openEditor(rel, '```ds-roll\n\n```\n\n```ds-hero\n\n```\n\n```ds-stam\n\n```\n', 'source', { line: 1, ch: 0 });
		await typeKeys('mo', TRIGGER);
		await waitNoList();
		await setCursor({ line: 5, ch: 0 });
		await typeKeys('na', TRIGGER);
		await waitNoList();
		await setCursor({ line: 9, ch: 0 });
		await typeKeys('cur', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['current_stamina']);
	});

	// SC-679, shipped build: the key list opened on an empty line with nothing typed (type a letter, delete it) and a pick used to leave the cursor
	// in front of the key and the old list on screen; the next Enter wrote a second key (`collapsiblecollapsible`).
	const emptyLinePick = async (rel: string, text: string, at: { line: number; ch: number }, nth: number): Promise<void> => {
		await openEditor(rel, text, 'live-preview', at);
		await typeKeys('c', TRIGGER);
		await waitList();
		await browser.keys('Backspace');
		await waitList(9);
		await clickRow(KEY, nth);
	};
	it('[AUTH-K09] picking a key with nothing typed leaves the cursor after the key and no list on screen', async () => {
		const rel = 'Authoring/key-empty-query.md';
		await emptyLinePick(rel, STAM, AT, 0);
		await dse.waitFor(`app.workspace.getMostRecentLeaf().view.editor.getValue() === ${JSON.stringify(spliced(STAM, AT, undefined, 'collapsible'))}`, 'the key to be written');
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 11 });
		await waitNoList();
	});

	it('[AUTH-K10] the key is picked with nothing typed, then Enter with no Escape: a new line, the key line whole (no `collapsiblecollapsible`)', async () => {
		const rel = 'Authoring/key-empty-enter.md';
		await openEditor(rel, STAM, 'live-preview', AT);
		await typeKeys('c', TRIGGER);
		await waitList();
		await browser.keys('Backspace');
		await waitList(9);
		await pressList('Enter'); // the first row, `collapsible`
		await waitNoList();
		await browser.keys('Enter');
		await dse.settle();
		expect((await editorState()).value).toBe('```ds-stam\ncollapsible\n\n```\nafter\n');
		expect((await editorState()).cursor).toEqual({ line: 2, ch: 0 });
		expect(await savedText(rel)).toBe('```ds-stam\ncollapsible\n\n```\nafter\n');
	});

	it('[AUTH-K11] a typed prefix (`cur`) accepted with Enter: the cursor is after `current_stamina`, no list is on screen, the next Enter is a new line', async () => {
		const rel = 'Authoring/key-typed-enter.md';
		await openEditor(rel, STAM, 'live-preview', AT);
		await typeKeys('cur', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await waitNoList();
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 15 });
		await browser.keys('Enter');
		await dse.settle();
		expect((await editorState()).value).toBe('```ds-stam\ncurrent_stamina\n\n```\nafter\n');
	});

	it('[AUTH-K12] typing on after a pick keeps working: `style` picked with nothing typed, then `: ` opens its value list; `rec` picked (recoveries) then `_` lists recoveries_max', async () => {
		await emptyLinePick('Authoring/key-then-colon.md', STAM, AT, 8); // the ninth row: style
		await dse.waitFor(`app.workspace.getMostRecentLeaf().view.editor.getValue() === ${JSON.stringify(spliced(STAM, AT, undefined, 'style'))}`, 'the key to be written');
		await waitNoList();
		await typeKeys(': ', TRIGGER);
		expect((await waitList(2)).map((r) => r.text)).toEqual(['default', 'sheet']);
		await browser.keys('Escape');
		await waitNoList();
		await openEditor('Authoring/key-prefix-pair.md', STAM, 'live-preview', AT);
		await typeKeys('rec', TRIGGER);
		expect((await waitList(2)).map((r) => r.text)).toEqual(['recoveries', 'recoveries_max']);
		await pressList('Enter');
		await waitNoList();
		expect((await editorState()).value.split('\n')[1]).toBe('recoveries');
		await typeKeys('_', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['recoveries_max']);
		await browser.keys('Escape');
		await waitNoList();
	});

	it('[AUTH-K13] one Ctrl+Z after a pick with nothing typed: the note is not left damaged (it takes the pick back, nothing else)', async () => {
		const rel = 'Authoring/key-undo.md';
		await emptyLinePick(rel, STAM, AT, 0);
		await waitNoList();
		await browser.keys(['Control', 'z']);
		await dse.waitFor(`app.workspace.getMostRecentLeaf().view.editor.getValue() === ${JSON.stringify(STAM)}`, 'the undo to take the pick back');
		await waitNoList();
		const state = await editorState();
		// Observed in Obsidian 1.14.4: the one undo takes the pick back (the typed `c` and its Backspace were two earlier steps that cancel out), so the
		// block is as before the pick, with no list on screen.
		expect(state.value).toBe(STAM);
		expect(await listRows()).toHaveLength(0);
	});

	// SC-679, no wait between the accept and the next Enter (see AUTH-G19): the shipped key list and a typed prefix.
	it('[AUTH-K15] a key picked with nothing typed by Enter, Enter in one burst: the key once (`collapsible`) plus a new line', async () => {
		const rel = 'Authoring/key-burst-empty.md';
		await openEditor(rel, STAM, 'live-preview', AT);
		await typeKeys('c', TRIGGER);
		await waitList();
		await browser.keys('Backspace');
		await waitList(9);
		await browser.keys(['Enter', 'Enter']);
		await dse.settle();
		const state = await editorState();
		expect(state.value).toBe('```ds-stam\ncollapsible\n\n```\nafter\n');
		expect(state.cursor).toEqual({ line: 2, ch: 0 });
	});

	it('[AUTH-K16] `rec` accepted with Enter, Enter in one burst: `recoveries` once (not `recoveriesoveries`) plus a new line', async () => {
		const rel = 'Authoring/key-burst-typed.md';
		await openEditor(rel, STAM, 'live-preview', AT);
		await typeKeys('rec', TRIGGER);
		await waitList(2);
		await browser.keys(['Enter', 'Enter']);
		await dse.settle();
		const state = await editorState();
		expect(state.value).toBe('```ds-stam\nrecoveries\n\n```\nafter\n');
		expect(state.cursor).toEqual({ line: 2, ch: 0 });
	});

	it('[AUTH-K14] integrity: the text above and below the block and a second ds-* block in the note are byte-identical after a pick with nothing typed', async () => {
		const rel = 'Authoring/key-integrity.md';
		const note = '# Above\n\nsome prose\n\n```ds-stam\n\n```\n\nbetween\n\n```ds-skills\nonly_show_selected: true\n```\n\nbelow\n';
		const at = { line: 5, ch: 0 };
		await openEditor(rel, note, 'source', at);
		await typeKeys('c', TRIGGER);
		await waitList();
		await browser.keys('Backspace');
		await waitList(9);
		await clickRow(KEY, 0);
		await waitNoList();
		expect(await savedText(rel)).toBe(spliced(note, at, undefined, 'collapsible'));
		await browser.keys('Enter');
		await dse.settle();
		expect(await savedText(rel)).toBe(spliced(note, at, undefined, 'collapsible\n'));
	});

	// SC-707: the initiative tracker has no schema of its own; its keys come from a suggestions-only one. The notes are written whole and only the
	// word is typed (no Enter typed into the block, so the editor's own indentation never enters into what is asserted).
	it('[AUTH-K17] a ds-initiative block offers its top-level keys: `he` offers heroes, Enter writes it over what was typed, nothing else changes', async () => {
		const rel = 'Authoring/key-initiative-top.md';
		const note = '```ds-initiative\n\n```\nafter\n';
		await openEditor(rel, note, 'live-preview', AT);
		await typeKeys('he', TRIGGER);
		expect((await waitList(1)).map((r) => [r.id, r.text])).toEqual([[KEY, 'heroes']]);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe(spliced(note, AT, undefined, 'heroes'));
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 6 });
	});

	it('[AUTH-K18] inside a hero entry of a ds-initiative block: `max` offers max_stamina (a hero key), and Enter writes it; `hero` offers nothing (heroes is a top-level key)', async () => {
		const rel = 'Authoring/key-initiative-hero.md';
		const note = '```ds-initiative\nheroes:\n  - name: Frodo\n    \n```\nafter\n';
		const at = { line: 3, ch: 4 };
		await openEditor(rel, note, 'source', at);
		await typeKeys('hero', TRIGGER);
		await waitNoList();
		await browser.keys(['Backspace', 'Backspace', 'Backspace', 'Backspace']);
		await typeKeys('max', TRIGGER);
		expect((await waitList(1)).map((r) => [r.id, r.text])).toEqual([[KEY, 'max_stamina']]);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe(spliced(note, at, undefined, 'max_stamina'));
		expect((await editorState()).cursor).toEqual({ line: 3, ch: 15 });
	});

	it('[AUTH-K19] a creature two lists deep (enemy_groups > creatures) and a `- ` first key: `max` offers max_stamina; on a `- ` line `amo` offers amount (Live Preview)', async () => {
		const rel = 'Authoring/key-initiative-creature.md';
		const note = '```ds-initiative\nenemy_groups:\n  - name: Orcs\n    creatures:\n      - name: Orc\n        \n      - \n```\nafter\n';
		await openEditor(rel, note, 'live-preview', { line: 5, ch: 8 });
		await typeKeys('max', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['max_stamina']);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe(spliced(note, { line: 5, ch: 8 }, undefined, 'max_stamina'));
		await setCursor({ line: 6, ch: 8 });
		await typeKeys('amo', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['amount']);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe('```ds-initiative\nenemy_groups:\n  - name: Orcs\n    creatures:\n      - name: Orc\n        max_stamina\n      - amount\n```\nafter\n');
	});

	it('[AUTH-K20] another element: a ds-skills `custom_skills:` entry offers its own keys (`ha` offers has_skill), and a bare word under `skills:` (a list of names) offers nothing', async () => {
		const rel = 'Authoring/key-skills-nested.md';
		const note = '```ds-skills\ncustom_skills:\n  - name: Juggling\n    \nskills:\n  - \n```\nafter\n';
		await openEditor(rel, note, 'source', { line: 3, ch: 4 });
		await typeKeys('ha', TRIGGER);
		expect((await waitList(1)).map((r) => [r.id, r.text])).toEqual([[KEY, 'has_skill']]);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe(spliced(note, { line: 3, ch: 4 }, undefined, 'has_skill'));
		await setCursor({ line: 5, ch: 4 });
		await typeKeys('cl', TRIGGER);
		await waitNoList();
	});

	it('[AUTH-K21] a nested enum: `squad_role: ca` under a creature (two lists deep) offers captain; Enter writes `squad_role: captain` over the typed part, nothing else changes', async () => {
		const rel = 'Authoring/key-initiative-enum.md';
		const note = '```ds-initiative\nenemy_groups:\n  - name: Squad\n    is_squad: true\n    creatures:\n      - name: Goblin\n        \n```\nafter\n';
		const at = { line: 6, ch: 8 };
		await openEditor(rel, note, 'source', at);
		await typeKeys('squad_role: ca', 'authoring.schema.trigger');
		expect((await waitList(1)).map((r) => [r.id, r.text])).toEqual([['authoring.schema.value', 'captain']]);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe(spliced(note, at, undefined, 'squad_role: captain'));
		expect((await editorState()).cursor).toEqual({ line: 6, ch: 27 });
	});

});
