// SC-441 — defects the survey of the compendium Sync / migration surface found, pinned so they cannot be forgotten. NO product fix here (the test
// ticket changes no behaviour). Each defect is TWO tests: a plain one that states what the code does today (so the repro is proven to reach the
// defect, and a later fix breaks it loudly), and a `test.failing` that encodes the CORRECT behaviour and asserts only what any fix must satisfy,
// never a specific design. When a ticket is fixed: delete the plain test, drop `.failing`.
// The `[BUG-n]` labels are placeholders until the tracker keys exist (SC-441 rule: the owner files the tickets, the keys replace these labels).
// Defects already ticketed and NOT re-reported here: SC-653 (the window offers to trash any non-empty Destination folder, the user's own notes included).
import { Notice } from '../../mocks/obsidian';
import { DESTINATION_REFUSED_NOTICE } from '@model/CompendiumDestination';
import {
	MANIFEST_PATH, captureWindows, control, makeSyncHarness, pressEscape, seedLegacyTree, settle, treeOf, until, windowTitles,
} from '../../fakes/syncHarness';
import { migrationMap } from '@/data/CompendiumMigration';

const ROOT = 'DS Compendium';
const LEGACY_WINDOW = 'Existing compendium folder found';
const MIGRATION_PREVIEW = 'Move your compendium to the 7.0.0 layout';
const notices = (): string => Notice.notices.join('\n');
const everyFileHolds = (tree: Record<string, string>, text: string): boolean => Object.values(tree).some((v) => v === text);

let windows: ReturnType<typeof captureWindows>;
beforeEach(() => {
	Notice.notices.length = 0;
	document.body.innerHTML = '';
	windows = captureWindows();
	jest.spyOn(console, 'error').mockImplementation(() => {});
	jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	windows.restore();
	jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------------------------- BUG-1 (High)
// A sync overwrites a compendium file the user edited, with no copy and no warning, whenever its bytes differ from the release (an upstream
// change, or simply the user's edit): the "installed by us, so safe to update" branch never asks whether the user changed it since.
describe('[BUG-1] a sync overwrites a compendium file the user edited', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		h.server.publish('v1', { 'class/a.md': 'A1', 'rule/b.md': 'B1' });
		await h.plugin.syncCompendium();
		h.vault.setText(`${ROOT}/class/a.md`, 'A1 + the user\'s own edit');
		h.server.publish('v2', { 'class/a.md': 'A2', 'rule/b.md': 'B1' });
		Notice.notices.length = 0;
		await h.plugin.syncCompendium();
		return h;
	}
	test('current behaviour: the edit is gone, no copy is kept anywhere, and the Notice only says "1 updated"', async () => {
		const h = await arrange();
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('A2');
		expect(everyFileHolds(treeOf(h.vault), 'A1 + the user\'s own edit')).toBe(false);
		expect(notices()).toContain('1 updated');
		expect(notices()).not.toContain('skipped to protect your changes');
	});
	test.failing('correct behaviour: the user\'s edit survives somewhere (kept in place or copied aside)', async () => {
		const h = await arrange();
		expect(everyFileHolds(treeOf(h.vault), 'A1 + the user\'s own edit')).toBe(true);
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-2 (High)
// "Move old compendium to trash" trashes the folder BEFORE the release is looked up or downloaded. Offline (or a GitHub outage, a rate limit, a
// broken release), the user ends with the old compendium in the trash and nothing in its place.
describe('[BUG-2] "Move old compendium to trash" trashes the folder before the download can fail', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		h.vault.setText(`${ROOT}/old.md`, 'old compendium file');
		h.vault.setText(`${ROOT}/mine.md`, 'the user\'s note');
		h.server.publish('v1', { 'class/a.md': 'A1' });
		h.server.lookupStatus = 503; // offline / GitHub down
		await h.plugin.syncCompendium();
		control('sync.legacy.trash').click();
		await until(() => notices().includes('compendium sync failed'), 'the sync to fail');
		return h;
	}
	test('current behaviour: the sync fails and the folder is already in the trash, with nothing synced', async () => {
		const h = await arrange();
		expect(notices()).toContain('compendium sync failed');
		expect(h.vault.text(`${ROOT}/old.md`)).toBeUndefined();
		expect(h.vault.text('.trash/DS Compendium/old.md')).toBe('old compendium file');
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBeUndefined();
	});
	test.failing('correct behaviour: when the sync cannot start, nothing was trashed (the folder is where it was)', async () => {
		const h = await arrange();
		expect(h.vault.text(`${ROOT}/old.md`)).toBe('old compendium file');
		expect(h.vault.text(`${ROOT}/mine.md`)).toBe('the user\'s note');
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-3 (Medium)
// A migration run holds no busy lock (only Sync and Check do). While one runs, a second "Migrate" command or a Sync opens another migration window
// on the same folder, and both can be run.
describe('[BUG-3] a migration run is not busy-locked', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		seedLegacyTree(h.vault, 25);
		await h.plugin.migrateCompendium();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let moves = 0;
		h.fileManager.beforeRename = async () => { if (moves++ === 1) await gate; };
		control('migration.preview.move').click();
		await until(() => moves === 2, 'the 2nd move to be held');
		expect(windowTitles()).toEqual(['Moving your compendium…']);
		Notice.notices.length = 0;
		await h.plugin.migrateCompendium();
		await h.plugin.syncCompendium();
		await settle();
		const titles = windowTitles();
		release();
		await until(() => h.fileManager.renamed.length === 25, 'the run to finish');
		return { h, titles };
	}
	test('current behaviour: the lock is free during the run and two more migration windows open over it', async () => {
		const { h, titles } = await arrange();
		expect(h.plugin.syncService.isBusy()).toBe(false);
		expect(titles).toEqual(['Moving your compendium…', MIGRATION_PREVIEW, MIGRATION_PREVIEW]);
	});
	test.failing('correct behaviour: a second Migrate or a Sync during a run opens no second window', async () => {
		const { titles } = await arrange();
		expect(titles).toEqual(['Moving your compendium…']);
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-4 (Low)
// Escape (or the X, or a click outside) in the middle of a run tells the user the compendium was "left as it is, and NOT synced" and records a decline,
// while files are being moved; the run's own "stopped after moving N" Notice follows.
describe('[BUG-4] dismissing the migration window mid-run says the compendium was left as it is', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		seedLegacyTree(h.vault, 25);
		await h.plugin.migrateCompendium();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let moves = 0;
		h.fileManager.beforeRename = async () => { if (moves++ === 2) await gate; };
		control('migration.preview.move').click();
		await until(() => moves === 3, 'the 3rd move to be held');
		Notice.notices.length = 0;
		pressEscape(windows.migration[0]);
		release();
		await until(() => notices().includes('stopped after moving'), 'the run to report');
		return h;
	}
	test('current behaviour: the "left as it is" Notice appears although files moved, then the "stopped after moving 3 file(s)" one', async () => {
		const h = await arrange();
		expect(h.fileManager.renamed).toHaveLength(3);
		expect(Notice.notices[0]).toContain('compendium left as it is, and NOT synced');
		expect(notices()).toContain('stopped after moving 3 file(s)');
	});
	test.failing('correct behaviour: no Notice claims the compendium was left as it is once files have moved', async () => {
		const h = await arrange();
		expect(h.fileManager.renamed.length).toBeGreaterThan(0);
		expect(notices()).not.toContain('left as it is');
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-5 (Low)
// Neither window is closed when the plugin unloads (they are opened with `.open()`, not `openManagedModal(owner, ...)`, although the source comment
// promises view-unload closes them). After "Disable plugin" the window stays on screen and its buttons still run a sync / a migration.
describe('[BUG-5] the windows outlive the plugin', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		h.vault.setText(`${ROOT}/old.md`, 'old');
		h.server.publish('v1', { 'class/a.md': 'A1' });
		await h.plugin.syncCompendium();
		h.plugin.onunload();
		await settle();
		return h;
	}
	test('current behaviour: the window is still open after unload and "Keep everything" syncs on the dead plugin', async () => {
		const h = await arrange();
		expect(windowTitles()).toEqual([LEGACY_WINDOW]);
		control('sync.legacy.keep').click();
		await until(() => notices().includes('compendium v1 synced'), 'the sync');
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('A1');
	});
	test.failing('correct behaviour: unloading the plugin closes its windows', async () => {
		await arrange();
		expect(windowTitles()).toEqual([]);
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-6 (Medium)
// With 20+ files at pre-7.0.0 paths whose 7.0.0 paths are ALL already taken (a new-layout copy dropped into the folder by hand, a restored
// backup), the migration plan is empty. Sync then says "nothing to migrate — no pre-7.0.0 compendium files found." and returns WITHOUT syncing.
// The next Sync does the same: the plugin can never sync that folder.
describe('[BUG-6] Sync is a dead end when every legacy file is blocked', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		for (const [oldPath, entry] of Object.entries(migrationMap().paths).slice(0, 25)) {
			h.vault.setText(`${ROOT}/${oldPath}`, `legacy ${oldPath}`);
			h.vault.setText(`${ROOT}/${entry[0]}`, `already here ${entry[0]}`);
		}
		h.server.publish('v1', { 'class/a.md': 'A1' });
		await h.plugin.syncCompendium();
		await h.plugin.syncCompendium();
		await settle();
		return h;
	}
	test('current behaviour: twice in a row, "nothing to migrate — no pre-7.0.0 compendium files found." and no request, no window, no manifest', async () => {
		const h = await arrange();
		expect(Notice.notices.filter((n) => n.includes('nothing to migrate — no pre-7.0.0 compendium files found'))).toHaveLength(2);
		expect(h.server.calls).toEqual([]);
		expect(windowTitles()).toEqual([]);
		expect(h.vault.adapter.store.has(MANIFEST_PATH)).toBe(false);
	});
	test.failing('correct behaviour: the Sync does something the user can see: it syncs, or a window explains the choice', async () => {
		const h = await arrange();
		expect(h.server.calls.length > 0 || windowTitles().length > 0).toBe(true);
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-7 (Low)
// A sync that fails part-way (a refused write) has already created files, and the manifest is only written at the end. The next Sync finds a
// non-empty folder with no manifest and opens "Existing compendium folder found", offering to trash the plugin's OWN half-written tree.
describe('[BUG-7] a failed sync leaves its own files looking like a foreign folder', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		h.server.publish('v1', { 'class/a.md': 'A1', 'rule/b.md': 'B1' });
		h.vault.failWrites.add(`${ROOT}/rule/b.md`);
		await h.plugin.syncCompendium().catch(() => {});
		h.vault.failWrites.clear();
		Notice.notices.length = 0;
		await h.plugin.syncCompendium();
		await settle();
		return h;
	}
	test('current behaviour: a.md was written by the failed sync, there is no manifest, and the next Sync asks the "existing compendium folder" question', async () => {
		const h = await arrange();
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('A1');
		expect(windowTitles()).toEqual([LEGACY_WINDOW]);
	});
	test.failing('correct behaviour: retrying the failed sync does not ask whether to trash the compendium it was installing', async () => {
		await arrange();
		expect(windowTitles()).toEqual([]);
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-8 (Low)
// The Destination folder may be the vault's configuration folder or its trash. (Model-based: the jest vault indexes dot-folders; the real
// Obsidian does not index them, so there the first-sync check cannot even see an existing one.)
describe('[BUG-8] a Destination of .obsidian or .trash is accepted', () => {
	test.each([['.obsidian'], ['.trash']])('current behaviour: %s is written into', async (dest) => {
		const h = await makeSyncHarness(dest);
		h.server.publish('v1', { 'class/a.md': 'A1' });
		await h.plugin.syncCompendium();
		expect(h.vault.text(`${dest}/class/a.md`)).toBe('A1');
	});
	test.failing.each([['.obsidian'], ['.trash']])('correct behaviour: %s is refused with the Destination Notice and nothing is written', async (dest) => {
		const h = await makeSyncHarness(dest);
		h.server.publish('v1', { 'class/a.md': 'A1' });
		const before = treeOf(h.vault);
		await h.plugin.syncCompendium();
		expect(Notice.notices).toEqual([DESTINATION_REFUSED_NOTICE]);
		expect(Object.keys(treeOf(h.vault)).sort()).toEqual(Object.keys(before).sort());
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-9 (Medium)
// Under Obsidian's "Deleted files: Permanently delete", "Move old compendium to trash" deletes the folder for good. The window never says so (it
// promises the trash), and the plugin cannot tell the setting apart: the wording is the only warning the user gets.
describe('[BUG-9] the trash button does not warn that Obsidian is set to delete permanently', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		(h.app as unknown as { vault: { getConfig: (key: string) => unknown } }).vault.getConfig = (key: string) => (key === 'trashOption' ? 'none' : undefined);
		h.vault.setText(`${ROOT}/old.md`, 'old');
		h.fileManager.trashMode = 'permanent';
		h.server.publish('v1', { 'class/a.md': 'A1' });
		await h.plugin.syncCompendium();
		return h;
	}
	test('current behaviour: the window offers "Move old compendium to trash" and its text never mentions permanent deletion; the files are then gone for good', async () => {
		const h = await arrange();
		const text = document.querySelector('.modal-container')!.textContent ?? '';
		expect(text).toContain('Move old compendium to trash');
		expect(text.toLowerCase()).not.toContain('permanent');
		control('sync.legacy.trash').click();
		await until(() => notices().includes('compendium v1 synced'), 'the sync');
		expect(h.vault.text(`${ROOT}/old.md`)).toBeUndefined();
		expect([...h.vault.files.keys()].filter((p) => p.startsWith('.trash/'))).toEqual([]);
	});
	test.failing('correct behaviour: with "Permanently delete" on, the window says the folder will be deleted for good', async () => {
		await arrange();
		const text = document.querySelector('.modal-container')!.textContent ?? '';
		expect(text.toLowerCase()).toContain('permanent');
	});
});

// ---------------------------------------------------------------------------------------------------------------- BUG-10 (Low)
// A folder that holds only EMPTY subfolders (every file deleted, the folders left behind) counts as "already contains files": the first Sync asks
// the "existing compendium folder" question about a folder with no file in it.
describe('[BUG-10] empty subfolders make an empty compendium folder "contain files"', () => {
	async function arrange() {
		const h = await makeSyncHarness();
		for (const folder of [ROOT, `${ROOT}/class`, `${ROOT}/rule`, `${ROOT}/rule/old`]) h.vault.folders.add(folder);
		h.server.publish('v1', { 'class/a.md': 'A1' });
		await h.plugin.syncCompendium();
		await settle();
		return h;
	}
	test('current behaviour: the window opens, its text says the folder "already contains files"', async () => {
		await arrange();
		expect(windowTitles()).toEqual([LEGACY_WINDOW]);
		expect(document.querySelector('.modal-container')!.textContent).toContain('already contains files');
	});
	test.failing('correct behaviour: a folder with no file in it syncs without a window', async () => {
		const h = await arrange();
		expect(windowTitles()).toEqual([]);
		expect(h.vault.text(`${ROOT}/class/a.md`)).toBe('A1');
	});
});
