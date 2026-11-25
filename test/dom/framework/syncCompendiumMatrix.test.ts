// SC-441 — the compendium Sync as a user meets it: the REAL plugin and the REAL windows over a vault that behaves like Obsidian's, a fixture
// release server for the network, and every scenario asserting the WHOLE file tree before and after (what was created, removed, changed; nothing
// else), never only "the window closed". Companion to the unit matrices (compendiumSyncMatrix / compendiumMigrationMatrix: the engines) and
// sync-windows-matrix (every way out of a window): this file is the flow.
//
// ALREADY COVERED (not repeated): the SC-643 blank / vault-root forms and the "Destination changed while the window was open" answers with the
// windows mocked (syncCompendiumDestination.test.ts), the SC-243 busy lock and lock-first window callbacks and the SC-646 unhandled-rejection checks
// (syncCompendiumBusy.test.ts). Known open defects of this surface are pinned in syncCompendiumBugs.test.ts (test.failing).
import { Notice } from '../../mocks/obsidian';
import { DESTINATION_REFUSED_NOTICE } from '@model/CompendiumDestination';
import { SYNC_BUSY_NOTICE } from '@/data/CompendiumSyncService';
import {
	MANIFEST_PATH, NO_CHANGE, STATE_PATH, captureWindows, control, diffTree, makeSyncHarness, pressEscape, seedLegacyTree, settle, treeOf, until, windowTitles,
} from '../../fakes/syncHarness';
import type { SyncHarness } from '../../fakes/syncHarness';

const ROOT = 'DS Compendium';
const LEGACY_WINDOW = 'Existing compendium folder found';
const MIGRATION_PREVIEW = 'Move your compendium to the 7.0.0 layout';
const RELEASE_V1 = { 'class/a.md': 'A1', 'rule/b.md': 'B1' };
const MANIFEST_KEY = `[adapter] ${MANIFEST_PATH}`;
const STATE_KEY = `[adapter] ${STATE_PATH}`;

let windows: ReturnType<typeof captureWindows>;
beforeEach(() => {
	Notice.notices.length = 0;
	document.body.innerHTML = '';
	windows = captureWindows();
	jest.spyOn(console, 'error').mockImplementation(() => {}); // the failure paths log by design; each test asserts the Notice instead
	jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	windows.restore();
	jest.restoreAllMocks();
});
const notices = (): string => Notice.notices.join('\n');
const requests = (h: SyncHarness): number => h.server.calls.length;
const stateOf = (h: SyncHarness): { declined: boolean; incomplete: boolean; migrated: string[] } | null => {
	const raw = h.vault.adapter.store.get(STATE_PATH);
	return raw === undefined ? null : JSON.parse(raw);
};

// ================================================================================================ the Destination folder

describe('the Destination folder: where a first Sync writes', () => {
	const FOLDERS: Array<[string, string]> = [
		['', 'DS Compendium'], ['   ', 'DS Compendium'], ['Notes/Compendium', 'Notes/Compendium'], ['Notes/Compendium/', 'Notes/Compendium'],
		['  Compendium  ', 'Compendium'], ['a\\b', 'a/b'], ['./x', 'x'], ['a//b', 'a/b'], ['a/../b', 'b'], ['ds compendium', 'ds compendium'],
	];
	test.each(FOLDERS)('setting %j: the sync writes under %j, creates nothing elsewhere, and the manifest names that folder', async (setting, folder) => {
		const h = await makeSyncHarness(setting);
		h.vault.setText('Journal.md', 'my journal');
		h.vault.setText('DS Compendium Notes/x.md', 'a sibling folder whose name starts the same');
		h.server.publish('v1', RELEASE_V1);
		const before = treeOf(h.vault);
		await h.plugin.syncCompendium();
		const diff = diffTree(before, treeOf(h.vault));
		expect(diff.removed).toEqual([]);
		expect(diff.changed).toEqual([]);
		expect(diff.created.sort()).toEqual([`${folder}/class/a.md`, `${folder}/rule/b.md`, MANIFEST_KEY].sort());
		expect(JSON.parse(h.vault.adapter.store.get(MANIFEST_PATH) as string).root).toBe(folder);
		expect(windowTitles()).toEqual([]);
	});

	const REFUSED = ['/', '.', './', '..', '../x', '../..', 'a/..', '\\', '//'];
	test.each(REFUSED)('setting %j (the vault root, or outside the vault): a Notice names the setting; no request, no window, no change at all, the busy lock is free', async (setting) => {
		const h = await makeSyncHarness(setting);
		h.vault.setText('Journal.md', 'my journal');
		h.server.publish('v1', RELEASE_V1);
		const before = treeOf(h.vault);
		await h.plugin.syncCompendium();
		expect(Notice.notices).toEqual([DESTINATION_REFUSED_NOTICE]);
		expect(requests(h)).toBe(0);
		expect(windowTitles()).toEqual([]);
		expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
		expect(h.plugin.syncService.isBusy()).toBe(false);
	});

	test('a Destination that is a FILE: the Sync fails with a Notice, nothing is written, the file is untouched, the lock is free', async () => {
		const h = await makeSyncHarness('Notes.md');
		h.vault.setText('Notes.md', 'my note, not a folder');
		h.server.publish('v1', RELEASE_V1);
		const before = treeOf(h.vault);
		await expect(h.plugin.syncCompendium()).rejects.toThrow(/not a directory/);
		expect(notices()).toContain('compendium sync failed');
		expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
		expect(windowTitles()).toEqual([]);
		expect(h.plugin.syncService.isBusy()).toBe(false);
	});
});

// ================================================================================================ the persisted state x the next Sync

describe('what the next Sync does, per persisted state, manifest and folder contents', () => {
	interface Row {
		name: string;
		arrange: (h: SyncHarness) => Promise<void>;
		windows: string[];
		synced: boolean;
		state: { declined: boolean; incomplete: boolean } | null;
	}
	/** Run a Sync into an empty vault so a manifest exists (the plugin's own previous sync). */
	const withManifest = async (h: SyncHarness): Promise<void> => {
		await h.plugin.syncCompendium();
		Notice.notices.length = 0;
		h.server.calls.length = 0;
	};
	const stop = async (h: SyncHarness, afterPolls: number): Promise<void> => {
		let polls = 0;
		await h.plugin.migrationService.execute(await h.plugin.migrationService.plan(ROOT), { shouldAbort: () => polls++ >= afterPolls });
	};
	const ROWS: Row[] = [
		{ name: 'no folder, no manifest, no state: syncs', arrange: async () => {}, windows: [], synced: true, state: null },
		{ name: 'an empty folder: syncs (nothing in it to offer to trash)', arrange: async (h) => { h.vault.folders.add(ROOT); }, windows: [], synced: true, state: null },
		{ name: 'a folder of the user\'s own notes: "Existing compendium folder found"', arrange: async (h) => { h.vault.setText(`${ROOT}/mine.md`, 'mine'); }, windows: [LEGACY_WINDOW], synced: false, state: null },
		{ name: '19 files at pre-7.0.0 paths: not a legacy compendium, so the plain "Existing compendium folder found"', arrange: async (h) => { seedLegacyTree(h.vault, 19); }, windows: [LEGACY_WINDOW], synced: false, state: null },
		{ name: '20 files at pre-7.0.0 paths: the migration window', arrange: async (h) => { seedLegacyTree(h.vault, 20); }, windows: [MIGRATION_PREVIEW], synced: false, state: null },
		{ name: 'a manifest and 20 legacy files, no pending offer: syncs (the offer is a first-sync / owed-offer thing)', arrange: async (h) => { await withManifest(h); seedLegacyTree(h.vault, 20); }, windows: [], synced: true, state: null },
		{ name: 'declined, no manifest, 20 legacy files: asks again', arrange: async (h) => { seedLegacyTree(h.vault, 20); await h.plugin.migrationService.markDeclined(ROOT); }, windows: [MIGRATION_PREVIEW], synced: false, state: { declined: true, incomplete: false } },
		{ name: 'declined, a manifest, ONE legacy file left: asks again (an owed offer needs a single file)', arrange: async (h) => { await withManifest(h); seedLegacyTree(h.vault, 1); await h.plugin.migrationService.markDeclined(ROOT); }, windows: [MIGRATION_PREVIEW], synced: false, state: { declined: true, incomplete: false } },
		{ name: 'stopped mid-run (incomplete), legacy files left: asks again', arrange: async (h) => { seedLegacyTree(h.vault, 25); await stop(h, 30); }, windows: [MIGRATION_PREVIEW], synced: false, state: { declined: false, incomplete: true } },
		{ name: 'declined, a manifest, nothing legacy left: settles the offer and syncs', arrange: async (h) => { await withManifest(h); h.vault.setText(`${ROOT}/mine.md`, 'mine'); await h.plugin.migrationService.markDeclined(ROOT); }, windows: [], synced: true, state: { declined: false, incomplete: false } },
		{ name: 'declined, the compendium folder gone: syncs and leaves the decline recorded (nothing to settle it against)', arrange: async (h) => { await h.plugin.migrationService.markDeclined(ROOT); }, windows: [], synced: true, state: { declined: true, incomplete: false } },
		{ name: 'settled (a finished migration) with a manifest: syncs', arrange: async (h) => { seedLegacyTree(h.vault, 25); await h.plugin.migrationService.execute(await h.plugin.migrationService.plan(ROOT)); }, windows: [], synced: true, state: { declined: false, incomplete: false } },
	];
	test.each(ROWS)('$name', async (row) => {
		const h = await makeSyncHarness();
		h.server.publish('v1', RELEASE_V1);
		await row.arrange(h);
		h.server.calls.length = 0;
		await h.plugin.syncCompendium();
		await settle();
		expect(windowTitles()).toEqual(row.windows);
		expect(requests(h) > 0).toBe(row.synced);
		const state = stateOf(h);
		expect(state === null ? null : { declined: state.declined, incomplete: state.incomplete }).toEqual(row.state);
	});
});

// ================================================================================================ failures and the busy lock

describe('a failed Sync leaves the tree untouched and the lock free', () => {
	const FAILURES: Array<[string, (h: SyncHarness) => void, RegExp]> = [
		['the release lookup answers HTTP 503', (h) => { h.server.lookupStatus = 503; }, /GitHub release lookup failed \(HTTP 503\)/],
		['the release does not exist (HTTP 404)', (h) => { h.server.releases.clear(); }, /HTTP 404/],
		['the download answers HTTP 500', (h) => { h.server.downloadStatus = 500; }, /Asset download failed \(HTTP 500\)/],
		['the download is not a zip', (h) => { h.server.brokenZip = true; }, /not a valid zip/],
	];
	test.each(FAILURES)('first sync, %s: no file, no manifest, no state; one failure Notice; the lock is free; a retry works', async (_name, fail, message) => {
		const h = await makeSyncHarness();
		h.server.publish('v1', RELEASE_V1);
		fail(h);
		const before = treeOf(h.vault);
		await expect(h.plugin.syncCompendium()).rejects.toThrow(message);
		expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
		expect(Notice.notices.filter((n) => n.includes('compendium sync failed'))).toHaveLength(1);
		expect(h.plugin.syncService.isBusy()).toBe(false);
		// fixed: the very next Sync goes through
		h.server.lookupStatus = null; h.server.downloadStatus = null; h.server.brokenZip = false;
		h.server.publish('v1', RELEASE_V1);
		await h.plugin.syncCompendium();
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('A1');
	});

	test.each(FAILURES)('a later sync, %s: every installed file and the manifest are byte-identical afterwards', async (_name, fail, message) => {
		const h = await makeSyncHarness();
		h.server.publish('v1', RELEASE_V1);
		await h.plugin.syncCompendium();
		h.vault.setText(`${ROOT}/class/my notes.md`, 'mine, next to the installed files');
		h.server.publish('v2', { 'class/a.md': 'A2', 'rule/b.md': 'B1' });
		fail(h);
		const before = treeOf(h.vault);
		await expect(h.plugin.syncCompendium()).rejects.toThrow(message);
		expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
		expect(h.plugin.syncService.isBusy()).toBe(false);
	});

	test('a real zip with hostile names (parent segments, absolute, backslash, drive-prefixed) writes nothing outside the Destination folder: the safe entries land, the rest is reported in the Notice and the console', async () => {
		const h = await makeSyncHarness();
		h.vault.setText('Journal.md', 'my journal');
		h.server.publish('v1', {
			'class/a.md': 'A1', '../escape.md': 'x', '/abs.md': 'x', '\\win.md': 'x', 'C:\\drive.md': 'x', 'a/../../up.md': 'x',
		});
		const before = treeOf(h.vault);
		await h.plugin.syncCompendium();
		const diff = diffTree(before, treeOf(h.vault));
		expect(diff.created.sort()).toEqual([`${ROOT}/class/a.md`, MANIFEST_KEY].sort());
		expect(diff.changed).toEqual([]);
		expect(notices()).toContain('5 file(s) skipped to protect your changes');
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('sync skipped these paths'), expect.objectContaining({
			rejectedUnsafePaths: expect.arrayContaining(['../escape.md', '/abs.md', 'a/../../up.md']),
		}));
	});

	test('two entries that differ only by case on a case-INSENSITIVE filesystem: the sync fails cleanly (one failure Notice, the lock free) and writes nothing outside the Destination folder', async () => {
		const h = await makeSyncHarness();
		h.vault.caseInsensitive = true;
		h.vault.setText('Journal.md', 'my journal');
		h.server.publish('v1', { 'class/a.md': 'lower', 'class/A.md': 'UPPER' });
		const before = treeOf(h.vault);
		await expect(h.plugin.syncCompendium()).rejects.toThrow(/already exists/);
		const diff = diffTree(before, treeOf(h.vault));
		expect(diff.removed).toEqual([]);
		expect(diff.changed).toEqual([]);
		for (const p of diff.created) expect(p.startsWith(`${ROOT}/`)).toBe(true);
		expect(h.vault.text('Journal.md')).toBe('my journal');
		expect(Notice.notices.filter((n) => n.includes('compendium sync failed'))).toHaveLength(1);
		expect(h.plugin.syncService.isBusy()).toBe(false);
	});

	test('a sync whose archive holds nothing usable fails before any write', async () => {
		const h = await makeSyncHarness();
		h.server.publish('v1', { 'dir/': '' });
		const before = treeOf(h.vault);
		await expect(h.plugin.syncCompendium()).rejects.toThrow(/contains no files/);
		expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
	});
});

describe('two operations together: only one runs', () => {
	test('two Syncs started together (the button and the command): the second shows the busy Notice and asks for nothing; the first completes', async () => {
		const h = await makeSyncHarness();
		h.server.publish('v1', RELEASE_V1);
		let release!: () => void;
		h.server.gate = new Promise<void>((resolve) => { release = resolve; });
		const first = h.plugin.syncCompendium();
		const second = h.plugin.syncCompendium();
		await second;
		await until(() => h.server.calls.length === 1, 'the first sync to reach the lookup');
		expect(Notice.notices).toContain(SYNC_BUSY_NOTICE);
		expect(h.server.calls).toHaveLength(1); // only the first sync's lookup is on the wire
		release();
		await first;
		expect(h.server.calls).toHaveLength(2); // lookup + download, once
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('A1');
		expect(h.plugin.syncService.isBusy()).toBe(false);
	});

	test('Check for updates while a Sync runs is refused with its own Notice and makes no request; a Sync while a Check runs is refused too', async () => {
		const h = await makeSyncHarness();
		h.server.publish('v1', RELEASE_V1);
		let release!: () => void;
		h.server.gate = new Promise<void>((resolve) => { release = resolve; });
		const sync = h.plugin.syncCompendium();
		expect(await h.plugin.syncService.checkForUpdates()).toBeNull();
		expect(Notice.notices).toContain('Draw Steel Elements: a compendium operation is already running.');
		release();
		await sync;
		h.server.gate = new Promise<void>((resolve) => { release = resolve; });
		Notice.notices.length = 0;
		const check = h.plugin.syncService.checkForUpdates();
		await h.plugin.syncCompendium();
		expect(Notice.notices).toContain(SYNC_BUSY_NOTICE);
		release();
		expect((await check)?.latestTag).toBe('v1');
		expect(h.plugin.syncService.isBusy()).toBe(false);
	});
});

// ================================================================================================ "Existing compendium folder found"

describe('"Existing compendium folder found", driven through its buttons', () => {
	async function legacyVault(): Promise<SyncHarness> {
		const h = await makeSyncHarness();
		h.vault.setText(`${ROOT}/old-download.md`, 'from an older plugin');
		h.vault.setText(`${ROOT}/class/a.md`, 'the user edited this compendium file');
		h.vault.setText(`${ROOT}/My homebrew.md`, 'the user\'s own');
		h.vault.setText('Journal.md', 'a note outside the folder');
		h.vault.setText(`${ROOT} Notes/x.md`, 'a sibling folder whose name starts the same');
		h.server.publish('v1', RELEASE_V1);
		await h.plugin.syncCompendium();
		return h;
	}

	test('"Keep everything": the sync runs INTO the folder; every existing file keeps its bytes; the one that collides with a release path is skipped and reported; the manifest records only what was written', async () => {
		const h = await legacyVault();
		expect(windowTitles()).toEqual([LEGACY_WINDOW]);
		expect(requests(h)).toBe(0);
		const before = treeOf(h.vault);
		control('sync.legacy.keep').click();
		await until(() => notices().includes('compendium v1 synced'), 'the sync');
		const diff = diffTree(before, treeOf(h.vault));
		expect(diff.created.sort()).toEqual([`${ROOT}/rule/b.md`, MANIFEST_KEY].sort());
		expect(diff.removed).toEqual([]);
		expect(diff.changed).toEqual([]); // class/a.md (the user's version) is NOT overwritten
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('the user edited this compendium file');
		expect(Object.keys(JSON.parse(h.vault.adapter.store.get(MANIFEST_PATH) as string).files)).toEqual(['rule/b.md']);
		expect(notices()).toContain('1 file(s) skipped to protect your changes');
		expect(h.fileManager.trashed).toEqual([]);
		expect(windowTitles()).toEqual([]);
	});

	test('"Move old compendium to trash": exactly the folder the window names goes to the vault\'s trash with its bytes; the sibling folder and the outside note are untouched; then a fresh sync fills a new folder', async () => {
		const h = await legacyVault();
		expect(document.body.textContent).toContain(`"${ROOT}" already contains files`);
		const before = treeOf(h.vault);
		control('sync.legacy.trash').click();
		await until(() => notices().includes('compendium v1 synced'), 'the sync');
		expect(h.fileManager.trashed).toEqual([ROOT]);
		const diff = diffTree(before, treeOf(h.vault));
		expect(diff.removed.sort()).toEqual([`${ROOT}/My homebrew.md`, `${ROOT}/old-download.md`]);
		expect(diff.changed).toEqual([`${ROOT}/class/a.md`]); // the user's file left, the release's file took the path
		expect(diff.created.sort()).toEqual([
			'.trash/DS Compendium/My homebrew.md', '.trash/DS Compendium/class/a.md', '.trash/DS Compendium/old-download.md',
			`${ROOT}/rule/b.md`, MANIFEST_KEY,
		].sort());
		expect(h.vault.text('.trash/DS Compendium/class/a.md')).toBe('the user edited this compendium file');
		expect(h.vault.text('.trash/DS Compendium/My homebrew.md')).toBe('the user\'s own');
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('A1');
		expect(h.vault.text('Journal.md')).toBe('a note outside the folder');
		expect(h.vault.text(`${ROOT} Notes/x.md`)).toBe('a sibling folder whose name starts the same');
		expect(notices()).toContain('compendium v1 synced — 2 new, 0 updated, 0 removed.');
	});

	test('"Permanently delete" (Obsidian\'s other trash setting): the same choice removes the folder for good (nothing lands in .trash) and then syncs; the plugin cannot tell the difference', async () => {
		const h = await legacyVault();
		h.fileManager.trashMode = 'permanent';
		control('sync.legacy.trash').click();
		await until(() => notices().includes('compendium v1 synced'), 'the sync');
		expect([...h.vault.files.keys()].filter((p) => p.startsWith('.trash/'))).toEqual([]);
		expect(h.vault.text(`${ROOT}/old-download.md`)).toBeUndefined();
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('A1');
		expect(h.vault.text('Journal.md')).toBe('a note outside the folder');
	});

	test.each([['Escape'], ['the X / a click outside / an unload']])('%s: no file changes, nothing is requested, no state is written, the lock is free, and the next Sync asks again', async (way) => {
		const h = await legacyVault();
		const before = treeOf(h.vault);
		if (way === 'Escape') pressEscape(windows.legacy[0]);
		else windows.legacy[0].close();
		await settle();
		expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
		expect(requests(h)).toBe(0);
		expect(h.fileManager.trashed).toEqual([]);
		expect(h.plugin.syncService.isBusy()).toBe(false);
		expect(windowTitles()).toEqual([]);
		await h.plugin.syncCompendium();
		expect(windowTitles()).toEqual([LEGACY_WINDOW]);
	});
});

// ================================================================================================ the migration window

describe('the migration window, driven through its buttons over the shipped map', () => {
	const N = 25;
	async function legacyVault(): Promise<{ h: SyncHarness; pairs: Array<{ oldRelative: string; newRelative: string }> }> {
		const h = await makeSyncHarness();
		const pairs = seedLegacyTree(h.vault, N);
		h.vault.setText(`${ROOT}/My own note.md`, 'the user\'s own note, no 7.0.0 counterpart');
		h.vault.setText('Journal.md', 'a note outside the folder that links [[Disciple]]');
		h.server.publish('v4', Object.fromEntries(pairs.map((p) => [p.newRelative, `official ${p.newRelative}`])));
		return { h, pairs };
	}
	const open = async (h: SyncHarness): Promise<void> => {
		await h.plugin.syncCompendium();
		await settle();
		expect(windowTitles()).toEqual([MIGRATION_PREVIEW]);
	};
	const titleNow = (): string => windowTitles()[windowTitles().length - 1];

	test.each([['"Not now"', () => control('migration.preview.not-now').click()], ['Escape', () => pressEscape(windows.migration[0])], ['the X / a click outside / an unload', () => windows.migration[0].close()]])(
		'%s at the preview: no file moves, nothing is requested, the ONLY change is the state file recording the decline, and the next Sync offers again',
		async (_name, leave) => {
			const { h } = await legacyVault();
			await open(h);
			const before = treeOf(h.vault);
			leave();
			await settle();
			const diff = diffTree(before, treeOf(h.vault));
			expect(diff.created).toEqual([STATE_KEY]);
			expect(diff.removed).toEqual([]);
			expect(diff.changed).toEqual([]);
			expect(stateOf(h)).toMatchObject({ declined: true, incomplete: false, migrated: [] });
			expect(requests(h)).toBe(0);
			expect(notices()).toContain('compendium left as it is, and NOT synced');
			expect(h.fileManager.renamed).toEqual([]);
			await h.plugin.syncCompendium();
			expect(windowTitles()).toEqual([MIGRATION_PREVIEW]);
		},
	);

	test('"Sync without moving": the legacy files stay exactly where they are, the new tree is created beside them, the move can no longer be done, and the next Sync is a plain sync', async () => {
		const { h, pairs } = await legacyVault();
		await open(h);
		const before = treeOf(h.vault);
		control('migration.preview.sync-anyway').click();
		await until(() => notices().includes('compendium v4 synced'), 'the sync without moving');
		const diff = diffTree(before, treeOf(h.vault));
		expect(diff.removed).toEqual([]);
		expect(diff.changed).toEqual([]);
		expect(diff.created.sort()).toEqual([MANIFEST_KEY, ...pairs.map((p) => `${ROOT}/${p.newRelative}`)].sort());
		expect(h.fileManager.renamed).toEqual([]);
		for (const p of pairs) expect(h.vault.text(`${ROOT}/${p.oldRelative}`)).toBe(`legacy ${p.oldRelative}`);
		h.server.calls.length = 0;
		await h.plugin.syncCompendium();
		expect(windowTitles()).toEqual([]);
		expect(requests(h)).toBe(2);
	});

	test('"Move N file(s)" then "Close": every mapped file is at its new path with its bytes, the edited ones are copied to the backup folder BEFORE moving, the report note is at the vault root, and the user\'s notes are untouched', async () => {
		const { h, pairs } = await legacyVault();
		await open(h);
		const before = treeOf(h.vault);
		control('migration.preview.move').click();
		await until(() => titleNow() === 'Compendium moved', 'the summary');
		const diff = diffTree(before, treeOf(h.vault));
		expect(diff.changed).toEqual([]);
		expect(diff.removed.sort()).toEqual(pairs.map((p) => `${ROOT}/${p.oldRelative}`).sort());
		const backups = pairs.map((p) => `${ROOT} backup (pre-7.0.0)/${p.oldRelative}`);
		const reportNote = diff.created.filter((p) => /^Draw Steel Elements migration report /.test(p));
		expect(reportNote).toHaveLength(1);
		expect(diff.created.sort()).toEqual([
			...pairs.map((p) => `${ROOT}/${p.newRelative}`), ...backups, reportNote[0], STATE_KEY, MANIFEST_KEY,
		].sort());
		for (const p of pairs) {
			expect(h.vault.text(`${ROOT}/${p.newRelative}`)).toBe(`legacy ${p.oldRelative}`);
			expect(h.vault.text(`${ROOT} backup (pre-7.0.0)/${p.oldRelative}`)).toBe(`legacy ${p.oldRelative}`);
		}
		expect(h.vault.text(`${ROOT}/My own note.md`)).toBe('the user\'s own note, no 7.0.0 counterpart');
		expect(h.vault.text('Journal.md')).toBe('a note outside the folder that links [[Disciple]]');
		expect(h.fileManager.trashed).toEqual([]);
		expect(requests(h)).toBe(0);
		control('migration.summary.close').click();
		await settle();
		expect(windowTitles()).toEqual([]);
		expect(requests(h)).toBe(0); // Close never syncs
		expect(stateOf(h)).toMatchObject({ declined: false, incomplete: false });
		expect(stateOf(h)!.migrated.sort()).toEqual(pairs.map((p) => p.newRelative).sort());
	});

	test.each([['Escape', (m: { onEscapeKey(e: KeyboardEvent): void }) => pressEscape(m)], ['the X / a click outside / an unload', (m: { close(): void }) => m.close()]])(
		'%s at the summary of a completed run: no file changes, nothing is requested, and the window is simply gone', async (_name, leave) => {
			const { h } = await legacyVault();
			await open(h);
			control('migration.preview.move').click();
			await until(() => titleNow() === 'Compendium moved', 'the summary');
			const before = treeOf(h.vault);
			Notice.notices.length = 0;
			(leave as (m: never) => void)(windows.migration[0] as never);
			await settle();
			expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
			expect(requests(h)).toBe(0);
			expect(windowTitles()).toEqual([]);
			expect(notices()).toContain('compendium file(s) moved to the 7.0.0 layout');
		},
	);

	test('a completed run, then "Sync the compendium now": the moved files are UPDATED in place (not skipped as the user\'s), the user\'s own note is untouched, and a second Sync of the same release changes nothing', async () => {
		const { h, pairs } = await legacyVault();
		await open(h);
		control('migration.preview.move').click();
		await until(() => titleNow() === 'Compendium moved', 'the summary');
		control('migration.summary.sync-now').click();
		await until(() => notices().includes(`compendium v4 synced`), 'the sync after the move');
		for (const p of pairs) expect(h.vault.text(`${ROOT}/${p.newRelative}`)).toBe(`official ${p.newRelative}`);
		expect(notices()).toContain(`compendium v4 synced — 0 new, ${N} updated, 0 removed.`);
		expect(h.vault.text(`${ROOT}/My own note.md`)).toBe('the user\'s own note, no 7.0.0 counterpart');
		const before = treeOf(h.vault);
		Notice.notices.length = 0;
		await h.plugin.syncCompendium();
		const diff = diffTree(before, treeOf(h.vault));
		expect(diff.created).toEqual([]);
		expect(diff.removed).toEqual([]);
		expect(diff.changed).toEqual([MANIFEST_KEY]); // syncedAt only
		expect(notices()).toContain('compendium v4 synced — 0 new, 0 updated, 0 removed.');
		// and a Migrate command now has nothing to do: a Notice, no window, no change
		const settled = treeOf(h.vault);
		Notice.notices.length = 0;
		await h.plugin.migrateCompendium();
		expect(windowTitles()).toEqual([]);
		expect(notices()).toContain('nothing to migrate');
		expect(diffTree(settled, treeOf(h.vault))).toEqual(NO_CHANGE);
	});

	test('"Stop" held at the 4th move through the real button, then "Finish moving the remaining N": every file ends moved exactly once, the first 4 never move again, and the run after that has nothing to do', async () => {
		const { h, pairs } = await legacyVault();
		await open(h);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let moves = 0;
		h.fileManager.beforeRename = async () => { if (moves++ === 3) await gate; };
		control('migration.preview.move').click();
		await until(() => moves === 4, 'the 4th move to be held (backups done, 3 moved)');
		expect(titleNow()).toBe('Moving your compendium…');
		expect(h.fileManager.renamed).toHaveLength(3);
		control('migration.running.stop').click();
		expect(control('migration.running.stop').disabled).toBe(true);
		release();
		await until(() => titleNow() === 'Migration stopped', 'the stopped summary');
		expect(h.fileManager.renamed).toHaveLength(4); // the file in flight finished, nothing after it started
		const stopped = new Set(h.fileManager.renamed.map((r) => r.to));
		for (const p of pairs) { // never both, never neither
			const atOld = h.vault.files.has(`${ROOT}/${p.oldRelative}`);
			const atNew = h.vault.files.has(`${ROOT}/${p.newRelative}`);
			expect({ p: p.oldRelative, atOld, atNew }).toEqual({ p: p.oldRelative, atOld: !stopped.has(`${ROOT}/${p.newRelative}`), atNew: stopped.has(`${ROOT}/${p.newRelative}`) });
		}
		expect(stateOf(h)).toMatchObject({ incomplete: true });
		expect(requests(h)).toBe(0);
		expect(document.body.textContent).toContain(`Finish moving the remaining ${N - 4}`);
		expect(document.querySelector('[data-dse-control="migration.summary.sync-now"]')).toBeNull();
		h.fileManager.beforeRename = null;
		control('migration.stopped.finish').click();
		await until(() => titleNow() === MIGRATION_PREVIEW, 'the second preview');
		control('migration.preview.move').click();
		await until(() => titleNow() === 'Compendium moved', 'the summary');
		expect(h.fileManager.renamed).toHaveLength(N); // 4 + 21: no file moved twice
		expect(new Set(h.fileManager.renamed.map((r) => r.from)).size).toBe(N);
		for (const p of pairs) expect(h.vault.text(`${ROOT}/${p.oldRelative}`)).toBeUndefined();
		expect(stateOf(h)).toMatchObject({ incomplete: false });
		expect(requests(h)).toBe(0);
	});

	test('Escape in the middle of a run: the run stops after the file in flight, nothing is synced, the offer is owed again at the next Sync', async () => {
		const { h } = await legacyVault();
		await open(h);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let moves = 0;
		h.fileManager.beforeRename = async () => { if (moves++ === 2) await gate; };
		control('migration.preview.move').click();
		await until(() => moves === 3, 'the 3rd move to be held');
		pressEscape(windows.migration[0]);
		release();
		await until(() => notices().includes('stopped after moving'), 'the run to stop');
		expect(h.fileManager.renamed).toHaveLength(3);
		expect(requests(h)).toBe(0);
		expect(stateOf(h)).toMatchObject({ incomplete: true });
		expect(windowTitles()).toEqual([]);
		h.fileManager.beforeRename = null;
		await h.plugin.syncCompendium();
		await settle();
		expect(windowTitles()).toEqual([MIGRATION_PREVIEW]);
		expect(requests(h)).toBe(0);
	});

	test('a destination that is already taken is left alone: its bytes survive, the source stays, the summary lists it as not moved, and a sync afterwards treats the occupant as the user\'s', async () => {
		const { h, pairs } = await legacyVault();
		h.vault.setText(`${ROOT}/${pairs[3].newRelative}`, 'the user\'s file parked on a 7.0.0 path');
		await open(h);
		control('migration.preview.move').click();
		await until(() => titleNow() === 'Compendium moved', 'the summary');
		expect(h.vault.text(`${ROOT}/${pairs[3].newRelative}`)).toBe('the user\'s file parked on a 7.0.0 path');
		expect(h.vault.text(`${ROOT}/${pairs[3].oldRelative}`)).toBe(`legacy ${pairs[3].oldRelative}`);
		expect(document.querySelector('[data-dse-control="migration.list.blocked"]')).not.toBeNull();
		control('migration.summary.sync-now').click();
		await until(() => notices().includes('compendium v4 synced'), 'the sync after the move');
		expect(h.vault.text(`${ROOT}/${pairs[3].newRelative}`)).toBe('the user\'s file parked on a 7.0.0 path'); // a squatter: never overwritten
		expect(h.vault.text(`${ROOT}/${pairs[4].newRelative}`)).toBe(`official ${pairs[4].newRelative}`);
	});

	test('the error screen: a run that throws shows it, "Close" fires no sync and no decline, and the files stay where they were', async () => {
		const { h } = await legacyVault();
		await open(h);
		jest.spyOn(h.plugin.migrationService, 'execute').mockRejectedValue(new Error('vault write refused'));
		const before = treeOf(h.vault);
		control('migration.preview.move').click();
		await settle(20);
		expect(titleNow()).toBe('Migration could not finish');
		control('migration.error.close').click();
		await settle(20);
		expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
		expect(requests(h)).toBe(0);
		expect(notices()).toContain('the compendium migration stopped on an error — vault write refused');
		expect(notices()).not.toContain('left as it is');
	});

	test('the Migrate command with a folder that is already in the new layout says there is nothing to migrate and changes nothing', async () => {
		const h = await makeSyncHarness();
		h.server.publish('v1', RELEASE_V1);
		await h.plugin.syncCompendium();
		const before = treeOf(h.vault);
		Notice.notices.length = 0;
		await h.plugin.migrateCompendium();
		expect(windowTitles()).toEqual([]);
		expect(notices()).toContain('nothing to migrate — no pre-7.0.0 compendium files found.');
		expect(diffTree(before, treeOf(h.vault))).toEqual(NO_CHANGE);
	});

	test('the Migrate command with an empty folder names the folder; with a Destination that is the vault root it refuses', async () => {
		const h = await makeSyncHarness();
		h.vault.folders.add(ROOT);
		await h.plugin.migrateCompendium();
		expect(notices()).toContain(`nothing to migrate — "${ROOT}" is empty.`);
		Notice.notices.length = 0;
		h.plugin.settings.compendiumDestinationDirectory = '/';
		await h.plugin.migrateCompendium();
		expect(Notice.notices).toEqual([DESTINATION_REFUSED_NOTICE]);
		expect(windowTitles()).toEqual([]);
	});
});
