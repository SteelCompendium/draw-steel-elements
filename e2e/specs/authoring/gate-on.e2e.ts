// SC-443: the authoring paths with the experimental gate ON (SC-406). The command set is built when the plugin loads, so the gate flips with
// a plugin reload: `dse.setPrefs({}, { experimental: true })` saves data.json and disables / enables the plugin (the commands and both
// suggesters are registered again), `dse.setPrefs({})` puts the shipped state back. Driven here: the eight deferred elements' insert commands
// (AUTH-G01..G08, each a Live Preview round trip like AUTH-I), the `/ds` list and a deferred pick, the enum value list (ds-roll's `mode` and
// `difficulty` are the only top-level enums in any schema, and ds-roll is deferred) and the key list of ds-roll and the hidden ds-hero,
// which stays out of the palette and `/ds` even with the gate on (SC-190).
import { expect } from '@wdio/globals';
import { browser } from '@wdio/globals';
import { dse } from '../../driver/dse';
import {
	clickRow, closeList, drawn, editorState, expectNoList, insertCommandIds, listRows, openEditor, paletteRows, pressList, savedText, scaffoldOf, selectedListRow, spliced, toReading, typeKeys, waitList, waitNoList,
} from '../../driver/authoring';
import { advertised, commandTrip, CURSOR, NOTE_BEFORE } from '../../driver/authoringTrips';

describe('authoring with the experimental gate on', () => {
	before(async () => {
		await dse.setPrefs({}, { experimental: true });
	});
	after(async () => {
		await dse.setPrefs({});
	});

	it('[AUTH-G01] Roll', () => commandTrip('roll', 'live-preview'));
	it('[AUTH-G02] Encounter builder', () => commandTrip('encounter', 'live-preview'));
	it('[AUTH-G03] Project / Downtime tracker', () => commandTrip('project', 'live-preview'));
	it('[AUTH-G04] Party tracker', () => commandTrip('party', 'live-preview'));
	it('[AUTH-G05] Conditions', () => commandTrip('conditions', 'live-preview'));
	it('[AUTH-G06] Heroic resource', () => commandTrip('heroic-resource', 'live-preview'));
	it('[AUTH-G07] Surges', () => commandTrip('surges', 'live-preview'));
	it('[AUTH-G08] Hero Tokens', () => commandTrip('hero-tokens', 'live-preview'));

	it('[AUTH-G09] `/ds` offers all twenty-one advertised elements (never Hero sheet); `/dsroll` + Enter in Source mode writes the Roll scaffold at the token and Reading view draws it', async () => {
		const rel = 'Authoring/gate-ds.md';
		await openEditor(rel, NOTE_BEFORE, 'source', CURSOR);
		await typeKeys('/ds', 'authoring.ds.trigger');
		const rows = await waitList(21);
		expect(rows.map((r) => r.text)).toEqual(advertised(true).map((e) => e.name + e.alias));
		expect(rows.some((r) => r.text.startsWith('Hero sheet'))).toBe(false);
		await typeKeys('roll');
		expect((await waitList(1)).map((r) => r.text)).toEqual(['Rollds-roll']);
		await pressList('Enter');
		await expectNoList(); // SC-682: the pick closes the list; no key list opens over the new ds-roll block, and no Escape is sent
		expect(await savedText(rel)).toBe(spliced(NOTE_BEFORE, CURSOR, undefined, scaffoldOf('roll', 'ds-roll')));
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['roll'], errors: [] });
	});

	it('[AUTH-G10] the enum value list: `mode: ` in a ds-roll block offers its four values and a click writes one; `difficulty: m` offers medium and Enter writes it; only the typed value is replaced', async () => {
		const rel = 'Authoring/gate-enum.md';
		const before = '```ds-roll\n\n```\n';
		await openEditor(rel, before, 'live-preview', { line: 1, ch: 0 });
		await typeKeys('mode: ', 'authoring.schema.trigger');
		const rows = await waitList(4);
		expect(rows.map((r) => [r.id, r.text])).toEqual(['power-roll', 'test', 'opposed', 'flat'].map((v) => ['authoring.schema.value', v]));
		await clickRow('authoring.schema.value', 2);
		await closeList();
		expect(await savedText(rel)).toBe('```ds-roll\nmode: opposed\n```\n');
		// (the accept left the cursor after the value and no list on screen: SC-679, AUTH-G13..G15)
		await typeKeys('\ndifficulty: m', 'authoring.schema.trigger');
		expect((await waitList(1)).map((r) => [r.id, r.text])).toEqual([['authoring.schema.value', 'medium']]);
		await pressList('Enter');
		await closeList();
		expect(await savedText(rel)).toBe('```ds-roll\nmode: opposed\ndifficulty: medium\n```\n');
	});

	it('[AUTH-G11] key lists for the deferred ds-roll (`dif` -> difficulty) and the hidden ds-hero (`na` -> name) work with the gate on', async () => {
		const rel = 'Authoring/gate-keys.md';
		await openEditor(rel, '```ds-roll\n\n```\n\n```ds-hero\n\n```\n', 'source', { line: 1, ch: 0 });
		await typeKeys('dif', 'authoring.schema.trigger');
		expect((await waitList(1)).map((r) => [r.id, r.text])).toEqual([['authoring.schema.key', 'difficulty']]);
		await closeList();
		await dse.page(`(() => { const e = app.workspace.getMostRecentLeaf().view.editor; e.setCursor({ line: 5, ch: 0 }); e.focus(); return true; })()`);
		await typeKeys('na', 'authoring.schema.trigger');
		expect((await waitList(1)).map((r) => r.text)).toEqual(['name']);
		await closeList();
	});

	it('[AUTH-G12] ds-hero stays unadvertised: no `insert-hero` command (23 commands: 21 elements + the two compendium ones), no palette row, and `/dshero` offers only Heroic resource and Hero Tokens', async () => {
		await openEditor('Authoring/gate-hero.md', 'x\n', 'live-preview', { line: 0, ch: 1 });
		const ids = await insertCommandIds();
		expect(ids).toHaveLength(23);
		expect(ids).not.toContain('insert-hero');
		expect((await paletteRows('Insert Draw Steel: Hero')).some((r) => r.endsWith(': Hero sheet'))).toBe(false);
		await typeKeys('\n/dshero', 'authoring.ds.trigger');
		expect((await waitList(2)).map((r) => r.text)).toEqual(['Heroic resourceds-resource', 'Hero Tokensds-tokens']);
		await closeList();
	});

	// SC-679: an accept with nothing typed (start == end) used to leave the cursor in front of the inserted value and the old list on screen.
	const pickOpposed = async (rel: string, text = '```ds-roll\n\n```\n'): Promise<void> => {
		await openEditor(rel, text, 'live-preview', { line: 1, ch: 0 });
		await typeKeys('mode: ', 'authoring.schema.trigger');
		await waitList(4);
		await clickRow('authoring.schema.value', 2);
		await dse.waitFor(`app.workspace.getMostRecentLeaf().view.editor.getValue() === ${JSON.stringify('```ds-roll\nmode: opposed\n```\n')}`, 'the value to be written');
	};
	it('[AUTH-G13] picking `opposed` with nothing typed after `mode: ` leaves the cursor after the value and no list on screen', async () => {
		await pickOpposed('Authoring/gate-cursor.md');
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 13 });
		await waitNoList();
	});

	it('[AUTH-G14] after picking `opposed` with nothing typed, Escape then Enter (a new line) leaves `mode: opposed` whole', async () => {
		await pickOpposed('Authoring/gate-enter.md');
		await browser.keys('Escape');
		await waitNoList();
		await browser.keys('Enter');
		await dse.settle();
		expect((await editorState()).value.split('\n')[1]).toBe('mode: opposed');
	});

	it('[AUTH-G15] a click on a row with nothing typed, then Enter with NO Escape: a new line, `mode: opposed` whole, the cursor on the new line', async () => {
		const rel = 'Authoring/gate-click-enter.md';
		await pickOpposed(rel);
		await waitNoList(); // no stale rows, no reopened one-row list
		await browser.keys('Enter');
		await dse.settle();
		const state = await editorState();
		expect(state.value).toBe('```ds-roll\nmode: opposed\n\n```\n');
		expect(state.cursor).toEqual({ line: 2, ch: 0 });
		expect(await savedText(rel)).toBe('```ds-roll\nmode: opposed\n\n```\n');
		await waitNoList();
	});

	it('[AUTH-G16] the same by keyboard: Enter on a row (the third, after two ArrowDown) with nothing typed, then Enter again: a new line, `mode: opposed` whole', async () => {
		const rel = 'Authoring/gate-key-enter.md';
		await openEditor(rel, '```ds-roll\n\n```\n', 'live-preview', { line: 1, ch: 0 });
		await typeKeys('mode: ', 'authoring.schema.trigger');
		await waitList(4);
		await browser.keys(['ArrowDown', 'ArrowDown']); // raw keys: the manifest has no `press:ArrowDown` pair for a value row
		expect(await selectedListRow()).toBe(2);
		await pressList('Enter');
		await waitNoList();
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 13 });
		await browser.keys('Enter');
		await dse.settle();
		expect((await editorState()).value).toBe('```ds-roll\nmode: opposed\n\n```\n');
		expect((await editorState()).cursor).toEqual({ line: 2, ch: 0 });
	});

	// A canary for Obsidian's own behaviour, not DSE's: on the pinned 1.14.4 Tab does not accept a row. It guards the docs wording "Enter or a click"
	// and goes red exactly when an Obsidian that binds Tab means the docs must change.
	it('[AUTH-G17] Tab does not accept a row (the list stays, the note is unchanged); Enter then writes one value, and one more Enter is a new line', async () => {
		const rel = 'Authoring/gate-tab.md';
		await openEditor(rel, '```ds-roll\n\n```\n', 'live-preview', { line: 1, ch: 0 });
		await typeKeys('mode: ', 'authoring.schema.trigger');
		await waitList(4);
		await browser.keys('Tab');
		// a bounded quiet window (about 400 ms): every read in it must show that nothing happened
		for (let i = 0; i < 5; i++) {
			expect((await editorState()).value).toBe('```ds-roll\nmode: \n```\n');
			expect(await listRows()).toHaveLength(4);
			await browser.pause(80);
		}
		await pressList('Enter');
		await waitNoList();
		expect((await editorState()).value).toBe('```ds-roll\nmode: power-roll\n```\n');
		await browser.keys('Enter');
		await dse.settle();
		expect((await editorState()).value).toBe('```ds-roll\nmode: power-roll\n\n```\n');
	});

	// SC-679, no wait between the accept and the next Enter: Obsidian keeps the old rows up for about 100 ms after an accept unless the suggester
	// closes the list itself, and an Enter in that window used to accept the stale row again (`mode: opposedopposed`).
	it('[AUTH-G19] a click on a row with nothing typed, then Enter at once (no wait): `mode: opposed` whole plus a new line', async () => {
		const rel = 'Authoring/gate-burst-click.md';
		await openEditor(rel, '```ds-roll\n\n```\n', 'live-preview', { line: 1, ch: 0 });
		await typeKeys('mode: ', 'authoring.schema.trigger');
		await waitList(4);
		await clickRow('authoring.schema.value', 2);
		await browser.keys('Enter');
		await dse.settle();
		const state = await editorState();
		expect(state.value).toBe('```ds-roll\nmode: opposed\n\n```\n');
		expect(state.cursor).toEqual({ line: 2, ch: 0 });
	});

	it('[AUTH-G20] Enter, Enter in one burst on the open value list: the first row once (`mode: power-roll`) plus a new line', async () => {
		const rel = 'Authoring/gate-burst-keys.md';
		await openEditor(rel, '```ds-roll\n\n```\n', 'live-preview', { line: 1, ch: 0 });
		await typeKeys('mode: ', 'authoring.schema.trigger');
		await waitList(4);
		await browser.keys(['Enter', 'Enter']);
		await dse.settle();
		const state = await editorState();
		expect(state.value).toBe('```ds-roll\nmode: power-roll\n\n```\n');
		expect(state.cursor).toEqual({ line: 2, ch: 0 });
	});

	it('[AUTH-G18] a typed prefix (`mode: op`) accepted with Enter: the value replaces what was typed, the cursor is after it, no list is on screen and the next Enter is a new line', async () => {
		const rel = 'Authoring/gate-typed.md';
		await openEditor(rel, '```ds-roll\n\n```\n', 'live-preview', { line: 1, ch: 0 });
		await typeKeys('mode: op', 'authoring.schema.trigger');
		expect((await waitList(1)).map((r) => r.text)).toEqual(['opposed']);
		await pressList('Enter');
		await waitNoList();
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 13 });
		await browser.keys('Enter');
		await dse.settle();
		expect((await editorState()).value).toBe('```ds-roll\nmode: opposed\n\n```\n');
	});

	// SC-688: typing `mode:` (no space) opens the value list at once (kept), and an accept there writes the space too: `mode: power-roll`, a mapping
	// entry. (`mode:power-roll` made the block draw a parse error card.)
	it('[AUTH-G21] `mode:` with no space typed, then Enter on the open value list: the saved line is `mode: power-roll`, the cursor is after it and no list is left', async () => {
		const rel = 'Authoring/gate-nospace.md';
		await openEditor(rel, '```ds-roll\nname: x\n\n```\n', 'live-preview', { line: 2, ch: 0 });
		await typeKeys('mode:', 'authoring.schema.trigger');
		expect((await waitList(4)).map((r) => r.text)).toEqual(['power-roll', 'test', 'opposed', 'flat']);
		await pressList('Enter');
		await waitNoList();
		expect(await savedText(rel)).toBe('```ds-roll\nname: x\nmode: power-roll\n\n```\n');
		expect((await editorState()).cursor).toEqual({ line: 2, ch: 16 });
	});

	// SC-688, the mid-word half: with the cursor inside a value the accept replaces the whole word, it did write `mode: opposeded`.
	it('[AUTH-G22] a value accepted with the cursor mid-word (`mode: oppos|ed`, Enter on the open list): the whole word is replaced, `mode: opposed`, the cursor after it', async () => {
		const rel = 'Authoring/gate-midword.md';
		await openEditor(rel, '```ds-roll\nmode: oed\n```\n', 'live-preview', { line: 1, ch: 7 });
		await typeKeys('ppos', 'authoring.schema.trigger');
		expect((await waitList(1)).map((r) => r.text)).toEqual(['opposed']);
		await pressList('Enter');
		await waitNoList();
		expect(await savedText(rel)).toBe('```ds-roll\nmode: opposed\n```\n');
		expect((await editorState()).cursor).toEqual({ line: 1, ch: 13 });
	});

});
