// SC-443: the authoring paths with the experimental gate ON (SC-406). The command set is built when the plugin loads, so the gate flips with
// a plugin reload: `dse.setPrefs({}, { experimental: true })` saves data.json and disables / enables the plugin (the commands and both
// suggesters are registered again), `dse.setPrefs({})` puts the shipped state back. Driven here: the eight deferred elements' insert commands
// (AUTH-G01..G08, each a Live Preview round trip like AUTH-I), the `/ds` list and a deferred pick, the enum value list (ds-roll's `mode` and
// `difficulty` are the only top-level enums in any schema, and ds-roll is deferred) and the key list of ds-roll and the hidden ds-hero,
// which stays out of the palette and `/ds` even with the gate on (SC-190).
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import {
	clickRow, closeList, drawn, insertCommandIds, openEditor, paletteRows, pressList, savedText, scaffoldOf, setCursor, spliced, toReading, typeKeys, waitList,
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
		await closeList(); // the key list of the new ds-roll block opens over its first line
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
		// (an accept with nothing typed leaves the cursor in front of the inserted value, see AUTH-G13: put it at the line's end to go on)
		await setCursor({ line: 1, ch: 13 });
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
});
