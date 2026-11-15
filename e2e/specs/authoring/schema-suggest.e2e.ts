// SC-443: the in-fence key autocomplete (src/authoring/schemaSuggest.ts), typed for real inside a ds-* block. A key name at the start of a body
// line offers the schema's keys; the rows are `authoring.schema.key`. Accept by Enter / click, move with ArrowDown, dismiss with Escape; each
// accept asserts the NOTE FILE (the typed prefix became the key, every other byte as it was). The block's language decides the keys: a second
// block uses the second's. Silent outside the block, on a fence line, on an indented line, and for the deferred elements while the gate is OFF.
// (The enum value list exists only with the gate ON: AUTH-G10.)
import { browser, expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { clickRow, closeList, editorState, openEditor, pressList, savedText, selectedListRow, setCursor, spliced, typeKeys, waitList, waitNoList } from '../../driver/authoring';

const TRIGGER = 'authoring.schema.trigger';
const KEY = 'authoring.schema.key';
const STAM = '```ds-stam\n\n```\nafter\n';
const AT = { line: 1, ch: 0 };

describe('in-fence key autocomplete', () => {
	it('[AUTH-K01] Live Preview: `cur` in a ds-stam block offers current_stamina; Enter writes the key over what was typed, nothing else changes, the cursor is after it', async () => {
		const rel = 'Authoring/key-enter.md';
		await openEditor(rel, STAM, 'live-preview', AT);
		await typeKeys('cur', TRIGGER);
		const rows = await waitList(1);
		expect(rows).toEqual([{ id: KEY, text: 'current_stamina', selected: true }]);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe(spliced(STAM, AT, undefined, 'current_stamina'));
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 15 });
	});

	it('[AUTH-K02] Source mode: `max` offers max_stamina; a click on the row writes it', async () => {
		const rel = 'Authoring/key-click.md';
		await openEditor(rel, STAM, 'source', AT);
		await typeKeys('max', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual(['max_stamina']);
		await clickRow(KEY, 0);
		await closeList();
		expect(await savedText(rel)).toBe(spliced(STAM, AT, undefined, 'max_stamina'));
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 11 });
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
		await typeKeys('\n  cur', TRIGGER); // an indented key (nested keys are out of scope)
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

	// SC-679, shipped build: the key list opened on an empty line with nothing typed (type a letter, delete it) and a pick leaves the cursor
	// in front of the key and the old list on screen; the next Enter writes a second key (`collapsiblecollapsible`).
	knownBug('SC-679', '[AUTH-K09] picking a key with nothing typed leaves the cursor after the key', async () => {
		const rel = 'Authoring/key-empty-query.md';
		await openEditor(rel, STAM, 'live-preview', AT);
		await typeKeys('c', TRIGGER);
		await waitList();
		await browser.keys('Backspace');
		await waitList(9);
		await pressList('Enter');
		await dse.waitFor(`app.workspace.getMostRecentLeaf().view.editor.getValue() === ${JSON.stringify(spliced(STAM, AT, undefined, 'collapsible'))}`, 'the key to be written');
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 11 });
	}, { failsWith: /Expected|Received/ });
});
