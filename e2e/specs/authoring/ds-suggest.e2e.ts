// SC-443: the `/ds` EditorSuggest (src/authoring/suggest.ts), typed for real into a real editor. The rows Obsidian draws are `.suggestion-item`s
// of ours (`authoring.ds.item`): their texts, then accept by Enter / click, move with the arrows, dismiss with Escape. Each accept asserts the
// NOTE FILE: the typed `/ds…` token replaced by the element's scaffold and nothing else touched, the cursor on the first body line, and the
// block drawn as a DSE element. Suppression: no list inside any open fence or mid-word. Gate OFF here: the deferred elements and ds-hero
// are not offered (AUTH-S01, S05); the gate-ON list is AUTH-G09. After a pick the list is closed and the next Enter is a new line (AUTH-S10..S17, SC-682).
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import {
	clearNotices, clickRow, drawn, editorState, expectNoList, leaveBlock, listRows, noticeTexts, openEditor, pressList, savedText, scaffoldOf, selectedListRow, setCursor, spliced, toReading, typeKeys, underPrefix, waitList, waitNoList,
} from '../../driver/authoring';
import { existingBlocksIntactProblem } from '../../driver/authoringIntact';
import { advertised, el } from '../../driver/authoringTrips';

const TRIGGER = 'authoring.ds.trigger';
const ITEM = 'authoring.ds.item';
const BEFORE = 'Intro line above\n\n\nOutro line below\n';
const AT = { line: 2, ch: 0 };
/** What a `/ds` row shows: the element's name, then its first alias. */
const rowText = (id: string): string => el(id).name + el(id).alias;

describe('/ds suggest: the list', () => {
	it('[AUTH-S01] Live Preview, `/ds`: the thirteen shipped elements in registry order, each row identified, the first selected; Escape closes the list and writes nothing but the typed token', async () => {
		await openEditor('Authoring/ds-list.md', BEFORE, 'live-preview', AT);
		await typeKeys('/ds', TRIGGER);
		const rows = await waitList(13);
		expect(rows.map((r) => r.text)).toEqual(advertised(false).map((e) => e.name + e.alias));
		expect(rows.every((r) => r.id === ITEM)).toBe(true);
		expect(rows.map((r) => r.selected)).toEqual([true, ...Array(12).fill(false)]);
		for (const hidden of ['Roll', 'Encounter builder', 'Project / Downtime tracker', 'Party tracker', 'Conditions', 'Heroic resource', 'Surges', 'Hero Tokens', 'Hero sheet']) {
			expect(rows.some((r) => r.text.startsWith(hidden))).toBe(false);
		}
		await pressList('Escape');
		await waitNoList();
		expect(await savedText('Authoring/ds-list.md')).toBe(spliced(BEFORE, AT, undefined, '/ds'));
	});

	it('[AUTH-S05] gate OFF: `/dsroll`, `/dsencounter`, `/dshero` and `/dspower` (a deferred element\'s name and aliases, and ds-hero) offer nothing; `/dssk` still offers Skills in the same spot', async () => {
		await openEditor('Authoring/ds-hidden.md', BEFORE, 'live-preview', AT);
		for (const q of ['roll', 'encounter', 'hero', 'power']) {
			await typeKeys(`/ds${q}`, TRIGGER);
			await waitNoList();
			await browser.keys(Array(3 + q.length).fill('Backspace'));
		}
		await typeKeys('/dssk', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual([rowText('skills')]);
	});
});

describe('/ds suggest: accept', () => {
	it('[AUTH-S02] Live Preview, `/dsstam` + Enter: the token is replaced by the Stamina bar scaffold, the rest of the note is untouched, the cursor is on the first body line, the block draws', async () => {
		const rel = 'Authoring/ds-enter.md';
		await openEditor(rel, BEFORE, 'live-preview', AT);
		await typeKeys('/dsstam', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual([rowText('stamina-bar')]);
		await pressList('Enter');
		await expectNoList(); // SC-682: the pick closes the list; nothing is sent to dismiss it
		const inserted = scaffoldOf('stamina-bar', 'ds-stam');
		expect(await savedText(rel)).toBe(spliced(BEFORE, AT, undefined, inserted));
		expect((await editorState()).cursor).toEqual({ line: 3, ch: 0 });
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: ['stamina-bar'], errors: [] });
	});

	it('[AUTH-S03] Source mode, `/dsfb` (an alias only) + a click on the row: the Featureblock scaffold replaces the token', async () => {
		const rel = 'Authoring/ds-click.md';
		await openEditor(rel, BEFORE, 'source', AT);
		await typeKeys('/dsfb', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual([rowText('featureblock')]);
		await clickRow(ITEM, 0);
		await waitNoList();
		expect(await savedText(rel)).toBe(spliced(BEFORE, AT, undefined, scaffoldOf('featureblock', 'ds-fb')));
		expect((await editorState()).cursor).toEqual({ line: 3, ch: 0 });
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['featureblock'], errors: [] });
	});

	it('[AUTH-S04] Source mode, an indented token: ArrowDown twice and ArrowUp once select the second row, Enter picks it (Skills); the two spaces before the token stay and go on every line of the block', async () => {
		const before = 'Intro line above\n  \nOutro line below\n';
		const rel = 'Authoring/ds-arrows.md';
		await openEditor(rel, before, 'source', { line: 1, ch: 2 });
		await typeKeys('/ds', TRIGGER);
		await waitList(13);
		await pressList('ArrowDown');
		await pressList('ArrowDown');
		expect(await selectedListRow()).toBe(2);
		await pressList('ArrowUp');
		expect(await selectedListRow()).toBe(1);
		await pressList('Enter');
		await expectNoList(); // SC-682: the pick closes the list; nothing is sent to dismiss it
		expect(await savedText(rel)).toBe(spliced(before, { line: 1, ch: 2 }, undefined, underPrefix(scaffoldOf('skills', 'ds-skills'), '  ')));
		expect((await editorState()).cursor).toEqual({ line: 2, ch: 2 });
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['skills'], errors: [] });
	});

	it('[AUTH-S09] Source mode: a `/ds…` pick with text after the cursor on its line: the block ends on its own line and the text moves to the line below it', async () => {
		const rel = 'Authoring/ds-tail.md';
		const before = 'Intro line above\n tail words\nOutro line below\n';
		await openEditor(rel, before, 'source', { line: 1, ch: 0 });
		await typeKeys('/dsfb', TRIGGER); // an alias only: one row, the Featureblock
		await waitList(1);
		await pressList('Enter');
		await expectNoList(); // SC-682: the pick closes the list; nothing is sent to dismiss it
		expect(await savedText(rel)).toBe(spliced(before, { line: 1, ch: 0 }, undefined, scaffoldOf('featureblock', 'ds-fb') + '\n'));
		expect((await editorState()).cursor).toEqual({ line: 2, ch: 0 });
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['featureblock'], errors: [] });
	});
});

describe('/ds suggest: where it stays silent', () => {
	it('[AUTH-S06] inside an open ds-* fence (a typed `/ds` is a value, not a trigger); the same keys after the block closed open the list', async () => {
		const rel = 'Authoring/ds-in-ds.md';
		const before = '```ds-stam\nmax_stamina: 20\n```\n\nafter\n';
		await openEditor(rel, before, 'live-preview', { line: 1, ch: 14 });
		await typeKeys(' /ds', TRIGGER);
		await waitNoList();
		await setCursor({ line: 3, ch: 0 });
		await typeKeys('/ds', TRIGGER);
		expect((await waitList(13)).length).toBe(13);
	});

	it('[AUTH-S07] mid-word (`foo/ds`), inside a ```js fence and inside a ~~~ fence: no list; an unrelated `/ds` after them still opens it', async () => {
		const rel = 'Authoring/ds-silent.md';
		const before = 'Intro\n\n```js\nconst x = 1\n```\n~~~\ntext\n~~~\n';
		await openEditor(rel, before, 'live-preview', { line: 1, ch: 0 });
		await typeKeys('foo/ds', TRIGGER);
		await waitNoList();
		await browser.keys(Array(6).fill('Backspace'));
		await setCursor({ line: 3, ch: 11 });
		await typeKeys(' /ds', TRIGGER);
		await waitNoList();
		await setCursor({ line: 6, ch: 4 });
		await typeKeys(' /ds', TRIGGER);
		await waitNoList();
		await setCursor({ line: 1, ch: 0 });
		await typeKeys('/ds', TRIGGER);
		expect((await waitList(13)).length).toBe(13);
	});

	it('[AUTH-S08] Tab does not accept a row (Obsidian\'s list takes Enter and a click only): the note gets no block', async () => {
		const rel = 'Authoring/ds-tab.md';
		await openEditor(rel, BEFORE, 'live-preview', AT);
		await typeKeys('/dsct', TRIGGER);
		await waitList();
		await browser.keys('Tab');
		await dse.settle();
		expect((await savedText(rel)).includes('```ds-')).toBe(false);
		await browser.keys('Escape');
		await waitNoList();
	});
});

// SC-682: after ANY pick no list is on screen and the next Enter is a new line at the cursor. The oracle is what the user got before the fix by
// "pick, Escape, Enter" (measured on the unfixed build): Obsidian's own Enter at the first body line, so the new line carries the list item's
// indentation / the callout's `> `, and the plugin adds nothing. A test that first waits for the list to go away passes without the fix, so the
// second Enter goes in the very next command after the first (no wait, no Escape between them).
describe('/ds suggest: after a pick the list is closed and the next Enter is a new line (SC-682)', () => {
	const STAM = scaffoldOf('stamina-bar', 'ds-stam');
	/** The note with ONE empty line (carrying `prefix`) right after the block's opening fence: where Obsidian's Enter at the first body line puts it. */
	const withNewLine = (note: string, prefix = ''): string => note.replace('```ds-stam\n', '```ds-stam\n' + prefix + '\n');

	it('[AUTH-S10] Live Preview, the ticket\'s repro: `/dsstam`, Enter, Enter at once: one new line at the cursor, no Notice, no list, the block draws', async () => {
		const rel = 'Authoring/ds-enter-enter-lp.md';
		await openEditor(rel, BEFORE, 'live-preview', AT);
		await clearNotices();
		await typeKeys('/dsstam', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await browser.keys('Enter'); // the very next command: nothing waited for between the two keys
		await dse.settle();
		expect((await noticeTexts()).filter((t) => t.includes('nothing was inserted'))).toEqual([]);
		await expectNoList();
		const expected = withNewLine(spliced(BEFORE, AT, undefined, STAM));
		expect(await savedText(rel)).toBe(expected);
		expect((await editorState()).cursor).toEqual({ line: 4, ch: 0 });
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: ['stamina-bar'], errors: [] });
	});

	it('[AUTH-S11] Source mode: `/dsstam`, Enter, Enter at once: one new line at the cursor, no Notice, no list', async () => {
		const rel = 'Authoring/ds-enter-enter-src.md';
		await openEditor(rel, BEFORE, 'source', AT);
		await clearNotices();
		await typeKeys('/dsstam', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await browser.keys('Enter');
		await dse.settle();
		expect((await noticeTexts()).filter((t) => t.includes('nothing was inserted'))).toEqual([]);
		await expectNoList();
		expect(await savedText(rel)).toBe(withNewLine(spliced(BEFORE, AT, undefined, STAM)));
		expect((await editorState()).cursor).toEqual({ line: 4, ch: 0 });
	});

	it('[AUTH-S12] the settled case, as a person sees it: `/dsstam`, Enter, wait 1.5 s: no list of any kind is on screen (no Escape sent), then Enter adds one line', async () => {
		const rel = 'Authoring/ds-settled.md';
		await openEditor(rel, BEFORE, 'live-preview', AT);
		await typeKeys('/dsstam', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await browser.pause(1500);
		expect(await listRows()).toEqual([]);
		await browser.keys('Enter');
		await dse.settle();
		expect(await savedText(rel)).toBe(withNewLine(spliced(BEFORE, AT, undefined, STAM)));
		expect((await editorState()).cursor).toEqual({ line: 4, ch: 0 });
		await expectNoList();
	});

	it('[AUTH-S13] a click on the row leaves no list either, and the next Enter is a new line (Live Preview)', async () => {
		const rel = 'Authoring/ds-click-enter.md';
		await openEditor(rel, BEFORE, 'live-preview', AT);
		await typeKeys('/dsstam', TRIGGER);
		await waitList(1);
		await clickRow(ITEM, 0);
		await expectNoList(1500);
		await browser.keys('Enter');
		await dse.settle();
		expect(await savedText(rel)).toBe(withNewLine(spliced(BEFORE, AT, undefined, STAM)));
		expect((await editorState()).cursor).toEqual({ line: 4, ch: 0 });
	});

	it('[AUTH-S14] after a pick no list opens over the new block (Stamina bar, which has a key list, and Horizontal rule, which has none); typing on a body line of the Stamina block still opens the key list', async () => {
		const stam = 'Authoring/ds-pick-then-keys.md';
		await openEditor(stam, BEFORE, 'live-preview', AT);
		await typeKeys('/dsstam', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await expectNoList(1500);
		await browser.keys('Enter'); // a new empty line 3, the cursor on line 4
		await browser.keys('ArrowUp');
		await typeKeys('rec', 'authoring.schema.trigger');
		expect((await waitList(2)).map((r) => [r.id, r.text])).toEqual([['authoring.schema.key', 'recoveries'], ['authoring.schema.key', 'recoveries_max']]);
		await pressList('Escape');
		await waitNoList();
		const hr = 'Authoring/ds-pick-then-none.md';
		await openEditor(hr, BEFORE, 'live-preview', AT);
		await typeKeys('/dshori', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await expectNoList(1500);
		expect(await savedText(hr)).toBe(spliced(BEFORE, AT, undefined, scaffoldOf('horizontal-rule', 'ds-hr')));
	});

	it('[AUTH-S15] after a pick, `/ds` on a new line outside the block opens the list again and a second pick inserts a second block; both blocks are intact', async () => {
		const rel = 'Authoring/ds-two-picks.md';
		const before = 'Intro line above\n\n\n\nOutro line below\n';
		await openEditor(rel, before, 'live-preview', AT);
		await typeKeys('/dsstam', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await expectNoList();
		const first = spliced(before, AT, undefined, STAM);
		expect(await savedText(rel)).toBe(first);
		await setCursor({ line: 7, ch: 0 }); // the empty line below the block (the block is lines 2..6)
		await typeKeys('/dscounter', TRIGGER);
		expect((await waitList(1)).map((r) => r.text)).toEqual([rowText('counter')]);
		await pressList('Enter');
		await expectNoList();
		const second = spliced(first, { line: 7, ch: 0 }, undefined, scaffoldOf('counter', 'ds-ct'));
		expect(await savedText(rel)).toBe(second);
		expect(existingBlocksIntactProblem(first, second)).toBeNull();
		expect((await editorState()).cursor).toEqual({ line: 8, ch: 0 });
		await leaveBlock(2, { line: 0, ch: 0 });
		expect(await drawn('live-preview')).toEqual({ roots: ['stamina-bar', 'counter'], errors: [] });
	});

	it('[AUTH-S16] Live Preview, the SC-675 list-item shape (`- /dsstam`): pick, Enter at once: the new line carries the item\'s indentation, the items around are untouched', async () => {
		const rel = 'Authoring/ds-list-enter.md';
		const before = 'Intro line above\n\n- first item\n- \n\nOutro line below\n';
		const at = { line: 3, ch: 2 };
		await openEditor(rel, before, 'live-preview', at);
		await clearNotices();
		await typeKeys('/dsstam', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await browser.keys('Enter');
		await dse.settle();
		expect((await noticeTexts()).filter((t) => t.includes('nothing was inserted'))).toEqual([]);
		await expectNoList();
		const picked = 'Intro line above\n\n- first item\n- \n  ' + underPrefix(STAM, '  ') + '\n\nOutro line below\n';
		expect(await savedText(rel)).toBe(withNewLine(picked, '  '));
		expect((await editorState()).cursor).toEqual({ line: 6, ch: 2 });
	});

	it('[AUTH-S17] Source mode, the SC-675 callout shape (`> /dsstam`): pick, Enter at once: the new line keeps the `> `, the callout lines around are untouched', async () => {
		const rel = 'Authoring/ds-callout-enter.md';
		const before = 'Intro line above\n\n> [!note] Callout title\n> first line\n> \n\nOutro line below\n';
		const at = { line: 4, ch: 2 };
		await openEditor(rel, before, 'source', at);
		await clearNotices();
		await typeKeys('/dsstam', TRIGGER);
		await waitList(1);
		await pressList('Enter');
		await browser.keys('Enter');
		await dse.settle();
		expect((await noticeTexts()).filter((t) => t.includes('nothing was inserted'))).toEqual([]);
		await expectNoList();
		const picked = 'Intro line above\n\n> [!note] Callout title\n> first line\n> ' + underPrefix(STAM, '> ') + '\n\nOutro line below\n';
		expect(await savedText(rel)).toBe(withNewLine(picked, '> '));
		expect((await editorState()).cursor).toEqual({ line: 6, ch: 2 });
	});
});
