// SC-443: the compendium search window and what each choice writes (src/authoring/CompendiumSearchModal.ts, compendiumInsert.ts), run from the
// palette over a small fixture compendium (13 files of test/fixtures/md-dse, copied into the vault at run time; none of it reaches the network).
// Query and `type:` / `source:` filters typed into the window's input, rows picked by Enter / click / Shift-click / Ctrl-click, Escape. The
// reference command writes a reference block (`ds-sb` / `ds-feature` / `ds-featureblock` for the three typed families, `ds-scc` for the rest),
// Shift inserts an inline link, Ctrl copies the code and writes nothing; the snapshot command offers only the three families and writes the
// plugin's own YAML (golden files in e2e/vaults/golden, from the jest harness). Every case asserts the NOTE FILE and, for a block, that it draws.
// The empty-compendium state: one "Sync compendium…" row, driven up to the point a sync would start (a page-side stub answers the lookup).
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { releaseStub } from '../../driver/settingsDrive';
import {
	ABILITY, drawn, editorState, GOBLIN, indexedCount, installCompendium, KIT, leaveBlock, MALICE, modifierClick, openEditor, palette, pressSearch, savedText, searchFor, searchRows,
	selectedSearchRow, spliced, toReading, waitSearchClosed,
} from '../../driver/authoring';
import { goldenSnapshot, sameDataAsJest, CURSOR, NOTE_BEFORE } from '../../driver/authoringTrips';

const REFERENCE = ['insert-compendium-reference', 'Insert Draw Steel: compendium reference'] as const;
const SNAPSHOT = ['insert-compendium-block', 'Insert Draw Steel: compendium block (snapshot)'] as const;
const RESULT = 'authoring.search.result';
// The window lists entries in the order the plugin's index learned of them. A live vault learns of the files as Obsidian parses them (the order
// the metadata cache finishes in, which is not the order they were created in), so the specs compare lists sorted and find rows by type.
const ALL = ['Bleeding', 'Coat the Blade', 'Devil Malice', 'Gnoll Gnasher', 'Goblin Stinker', 'Growing Ferocity', 'Hit and Run', 'Hit and Run', 'Mountain', 'Panther', 'Panther', 'Skitterling', 'Taking a Turn'];
const SNAPSHOTTABLE = ['Coat the Blade', 'Devil Malice', 'Gnoll Gnasher', 'Goblin Stinker', 'Growing Ferocity', 'Hit and Run', 'Hit and Run', 'Panther', 'Skitterling'];
const sorted = (names: string[]): string[] => [...names].sort();
/** The position of the row of `type` (and source) among `rows`. */
const indexOfType = (rows: Array<{ type: string; source: string }>, type: string, source?: string): number => {
	const i = rows.findIndex((r) => r.type === type && (source === undefined || r.source === source));
	if (i < 0) throw new Error(`no ${type} row in ${JSON.stringify(rows)}`);
	return i;
};
const RELEASE_URL = 'https://api.github.com/repos/SteelCompendium/data-unified/releases/latest';
const placeholder = (): Promise<string> => dse.page<string>(`document.querySelector('[data-dse-control="authoring.search.input"]').placeholder`);

/** Open the editor with the compendium installed and run `command` from the palette; returns with the window open. */
async function openSearch(rel: string, mode: 'live-preview' | 'source', command: readonly [string, string], before = NOTE_BEFORE, at = CURSOR): Promise<void> {
	await openEditor(rel, before, mode, at);
	await installCompendium();
	await palette(command[0], command[1], { opensSearch: true });
}

describe('compendium search: the reference command', () => {
	it('[AUTH-C01] Live Preview: the window lists the whole compendium (13 entries); `gob` leaves Goblin Stinker; Enter writes a `ds-sb` reference block at the cursor, the rest of the note is untouched, and it draws', async () => {
		const rel = 'Authoring/search-enter.md';
		await openSearch(rel, 'live-preview', REFERENCE);
		expect(await placeholder()).toBe('Search the compendium…');
		const all = await searchRows();
		expect(sorted(all.map((r) => r.name))).toEqual(ALL);
		expect(all.every((r) => r.id === RESULT)).toBe(true);
		const rows = await searchFor('gob', 1);
		expect(rows[0]).toEqual({ id: RESULT, name: 'Goblin Stinker', type: 'statblock', source: 'mcdm.monsters.v1', code: GOBLIN, hint: '', selected: true });
		await pressSearch('Enter');
		await waitSearchClosed();
		const inserted = '```ds-sb\n' + GOBLIN + '\n```\n';
		expect(await savedText(rel)).toBe(spliced(NOTE_BEFORE, CURSOR, undefined, inserted));
		expect((await editorState()).cursor).toEqual({ line: 5, ch: 0 }); // after the inserted text: replaceSelection leaves it there
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: ['statblock'], errors: [] });
	});

	it('[AUTH-C02] Source mode: `pan` leaves two Panthers (a kit and a statblock, told apart by type and source); a plain click on the kit writes a `ds-scc` reference; Reading view draws the kit card', async () => {
		const rel = 'Authoring/search-click.md';
		await openSearch(rel, 'source', REFERENCE);
		const rows = await searchFor('pan', 2);
		expect(rows.map((r) => [r.name, r.type, r.source]).sort()).toEqual([['Panther', 'kit', 'mcdm.heroes.v1'], ['Panther', 'statblock', 'mcdm.beastheart.v1']]);
		await dse.click(dse.control(RESULT, { nth: indexOfType(rows, 'kit') }));
		await waitSearchClosed();
		expect(await savedText(rel)).toBe(spliced(NOTE_BEFORE, CURSOR, undefined, '```ds-scc\n' + KIT + '\n```\n'));
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['kit'], errors: [] });
		expect(await dse.page<boolean>(`document.querySelector('.markdown-reading-view [data-dse-element="kit"]').textContent.includes('Panther')`)).toBe(true);
	});

	it('[AUTH-C03] Live Preview: a Shift-click on the kit inserts an inline link where the cursor is, mid-line, and nothing else changes', async () => {
		const rel = 'Authoring/search-shift.md';
		const before = 'See  here\n';
		await openSearch(rel, 'live-preview', REFERENCE, before, { line: 0, ch: 4 });
		await modifierClick(indexOfType(await searchFor('pan', 2), 'kit'), 'Shift');
		await waitSearchClosed();
		const link = `[Panther](scc.v1:${KIT})`;
		expect(await savedText(rel)).toBe(spliced(before, { line: 0, ch: 4 }, undefined, link));
		expect((await editorState()).cursor).toEqual({ line: 0, ch: 4 + link.length });
		await toReading(rel);
		expect(await dse.page<string[]>(`Array.from(document.querySelectorAll('.markdown-reading-view a')).map((a) => a.textContent)`)).toContain('Panther');
	});

	it('[AUTH-C04] Source mode: a Ctrl-click copies `scc:<code>` and writes nothing to the note (a Notice says so)', async () => {
		const rel = 'Authoring/search-ctrl.md';
		const before = 'See here\n';
		await openSearch(rel, 'source', REFERENCE, before, { line: 0, ch: 4 });
		await modifierClick(indexOfType(await searchFor('pan', 2), 'kit'), 'Control');
		await waitSearchClosed();
		await dse.waitFor(`Array.from(document.querySelectorAll('.notice')).some((n) => n.textContent === ${JSON.stringify('Copied scc:' + KIT)})`, 'the "Copied" Notice');
		expect(await savedText(rel)).toBe(before);
	});

	it('[AUTH-C05] `type:` and `source:` filters, a no-match query and the arrow keys: the rows follow the query, ArrowDown / ArrowUp move the selection, Enter picks the second "Hit and Run" (the ability)', async () => {
		const rel = 'Authoring/search-keys.md';
		await openSearch(rel, 'live-preview', REFERENCE);
		const names = async (q: string, n?: number): Promise<string[]> => (await searchFor(q, n)).map((r) => `${r.name} [${r.type}]`).sort();
		expect(await names('type:kit', 2)).toEqual(['Mountain [kit]', 'Panther [kit]']);
		expect(await names('source:mcdm.beastheart.v1', 2)).toEqual(['Hit and Run [feature]', 'Panther [statblock]']);
		expect(await names('type:kit pan', 1)).toEqual(['Panther [kit]']);
		expect(await names('pan type:statblock source:mcdm.beastheart.v1', 1)).toEqual(['Panther [statblock]']);
		expect(await names('type:nothing', 0)).toEqual([]);
		expect(await dse.page<string>(`document.querySelector('.modal-container .prompt-results .suggestion-empty')?.textContent ?? ''`)).toBe('No results found.');
		const hits = await searchFor('hit', 2); // two entries sharing a name
		expect(hits.map((r) => `${r.name} [${r.type}]`).sort()).toEqual(['Hit and Run [ability]', 'Hit and Run [feature]']);
		expect(await selectedSearchRow()).toBe(0);
		await pressSearch('ArrowDown');
		expect(await selectedSearchRow()).toBe(1);
		await pressSearch('ArrowUp');
		expect(await selectedSearchRow()).toBe(0);
		await pressSearch('ArrowDown');
		await pressSearch('Enter');
		await waitSearchClosed();
		// the second row, whichever of the two it is: a typed `ds-feature` reference to ITS code
		expect(await savedText(rel)).toBe(spliced(NOTE_BEFORE, CURSOR, undefined, '```ds-feature\n' + hits[1].code + '\n```\n'));
		expect(hits[1].code).toMatch(/\/hit-and-run$/);
	});

	it('[AUTH-C06] Escape closes the window and writes nothing', async () => {
		const rel = 'Authoring/search-escape.md';
		await openSearch(rel, 'source', REFERENCE);
		await searchFor('pan', 2);
		await pressSearch('Escape');
		await waitSearchClosed();
		expect(await savedText(rel)).toBe(NOTE_BEFORE);
		expect(await dse.page<number>(`document.querySelectorAll('.notice').length`)).toBe(0);
	});
});

describe('compendium search: the snapshot command', () => {
	it('[AUTH-C07] Live Preview: only the nine statblock / feature / featureblock entries are offered, no kit, condition or rule, whatever is typed; a click on Goblin Stinker writes its snapshot and it draws', async () => {
		const rel = 'Authoring/snapshot-click.md';
		await openSearch(rel, 'live-preview', SNAPSHOT);
		expect(await placeholder()).toBe('Search statblocks, features and featureblocks… (inserts a full snapshot)');
		expect(sorted((await searchRows()).map((r) => r.name))).toEqual(SNAPSHOTTABLE);
		for (const q of ['type:kit', 'type:condition', 'type:rule', 'turn', 'bleeding']) expect(await searchFor(q, 0)).toEqual([]);
		await searchFor('stinker', 1);
		await dse.click(dse.control(RESULT, { nth: 0 }));
		await waitSearchClosed();
		expect(await savedText(rel)).toBe(spliced(NOTE_BEFORE, CURSOR, undefined, goldenSnapshot('goblin-stinker')));
		expect(sameDataAsJest('goblin-stinker', goldenSnapshot('goblin-stinker'))).toBe(true);
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: ['statblock'], errors: [] });
	});

	it('[AUTH-C08] Source mode: Enter on Devil Malice writes the featureblock snapshot; Reading view draws it', async () => {
		const rel = 'Authoring/snapshot-enter.md';
		await openSearch(rel, 'source', SNAPSHOT);
		await searchFor('malice', 1);
		await pressSearch('Enter');
		await waitSearchClosed();
		expect(await savedText(rel)).toBe(spliced(NOTE_BEFORE, CURSOR, undefined, goldenSnapshot('devil-malice')));
		expect(sameDataAsJest('devil-malice', goldenSnapshot('devil-malice'))).toBe(true);
		await toReading(rel);
		expect(await drawn('reading')).toEqual({ roots: ['featureblock'], errors: [] });
		expect(MALICE).toContain('devil-malice');
	});

	it('[AUTH-C09] Live Preview: a Shift-click or Ctrl-click on a snapshot row still inserts the snapshot (the snapshot command ignores the modifiers) and copies nothing', async () => {
		const rel = 'Authoring/snapshot-modifier.md';
		await openSearch(rel, 'live-preview', SNAPSHOT);
		await searchFor('coat', 1);
		await modifierClick(0, 'Control');
		await waitSearchClosed();
		expect(await savedText(rel)).toBe(spliced(NOTE_BEFORE, CURSOR, undefined, goldenSnapshot('coat-the-blade')));
		expect(sameDataAsJest('coat-the-blade', goldenSnapshot('coat-the-blade'))).toBe(true);
		expect(await dse.page<number>(`document.querySelectorAll('.notice').length`)).toBe(0);
		await leaveBlock(1);
		expect(await drawn('live-preview')).toEqual({ roots: ['feature'], errors: [] });
		expect(ABILITY).toContain('coat-the-blade');
	});
});

describe('compendium search: nothing indexed', () => {
	it('[AUTH-C10] Live Preview, reference command: one "Sync compendium…" row whatever is typed; Enter on it starts a sync (the page-side stub answers the lookup, nothing leaves the machine), closes the window and writes nothing', async () => {
		const rel = 'Authoring/search-empty-enter.md';
		await openEditor(rel, NOTE_BEFORE, 'live-preview', CURSOR);
		await dse.waitFor(`app.plugins.plugins['draw-steel-elements'].compendiumIndex.available === false`, 'an empty compendium');
		expect(await indexedCount()).toBe(0);
		try {
			await releaseStub.install();
			await palette(REFERENCE[0], REFERENCE[1], { opensSearch: true });
			const sync = { id: 'authoring.search.sync', name: 'Sync compendium…', hint: 'No compendium indexed yet — select to sync.' };
			expect((await searchRows()).map((r) => ({ id: r.id, name: r.name, hint: r.hint }))).toEqual([sync]);
			expect((await searchFor('gob', 1)).map((r) => ({ id: r.id, name: r.name, hint: r.hint }))).toEqual([sync]);
			await pressSearch('Enter');
			await waitSearchClosed();
			await dse.waitFor(`window.__stubCalls.length >= 1`, 'the sync to ask for the release');
			expect(await releaseStub.calls()).toEqual([RELEASE_URL]);
			expect(await savedText(rel)).toBe(NOTE_BEFORE);
		} finally {
			await dse.setPrefs({}); // reload the plugin: the stubbed lookup is left unanswered
		}
	});

	it('[AUTH-C11] Source mode, snapshot command: the same row, a click on it starts the sync and writes nothing', async () => {
		const rel = 'Authoring/search-empty-click.md';
		await openEditor(rel, NOTE_BEFORE, 'source', CURSOR);
		await dse.waitFor(`app.plugins.plugins['draw-steel-elements'].compendiumIndex.available === false`, 'an empty compendium');
		try {
			await releaseStub.install();
			await palette(SNAPSHOT[0], SNAPSHOT[1], { opensSearch: true });
			expect((await searchRows()).map((r) => r.id)).toEqual(['authoring.search.sync']);
			await dse.click(dse.control('authoring.search.sync'));
			await waitSearchClosed();
			await dse.waitFor(`window.__stubCalls.length >= 1`, 'the sync to ask for the release');
			expect(await releaseStub.calls()).toEqual([RELEASE_URL]);
			expect(await savedText(rel)).toBe(NOTE_BEFORE);
		} finally {
			await dse.setPrefs({});
		}
	});
});
