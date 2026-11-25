// SC-441: the compendium Sync as a user runs it from the command palette, in real Obsidian, against a fixture release (no network, no product change).
// Every scenario starts from `startSyncTest()` (disposable-vault guard, trash setting read back, trash canary, pristine tree) and asserts the WHOLE
// file tree before and after: what was created, what moved (a trash is a move into `.trash/`), what changed, and that nothing else did.
//   S sync runs and their file effects · R re-runs with nothing to do · F failure paths · B the busy guard (SC-243) · D the Destination guard (SC-643)
import { expect } from '@wdio/globals';
import '../../driver/dse';
import { allowPageErrors } from '../../driver/settingsDrive';
import { ev } from '../../driver/page';
import {
	MANIFEST, createNotes, editNote, fixtureRelease, noWindows, noticeTexts, palette, startSyncTest, waitNotice,
} from '../../driver/sync';

const DC = 'DS Compendium';
const RELEASE_A = {
	'class/shadow.md': 'shadow A',
	'rule/combat/turn.md': 'turn A',
	'rule/retired.md': 'retired A',
	'kit/doomed.md': 'doomed A',
	'kit/panther.md': 'panther A',
};
const RELEASE_B = {
	'class/shadow.md': 'shadow B',
	'rule/combat/turn.md': 'turn A',
	'kit/panther.md': 'panther A',
	'condition/new.md': 'new B',
};
const createdA = (root = DC): Record<string, string | null> => ({
	...Object.fromEntries(Object.entries(RELEASE_A).map(([p, c]) => [`${root}/${p}`, c])),
	[MANIFEST]: null,
});
const ISOLATED = ['class', 'rule', 'rule/combat', 'kit'];
const foldersA = (root = DC): string[] => [root, ...ISOLATED.map((f) => `${root}/${f}`)].sort();
const busy = (): Promise<boolean> => ev<boolean>(`app.plugins.plugins['draw-steel-elements'].syncService.isBusy()`);
const MINE_OUT = 'Journal.md';
const MINE_IN = `${DC}/class/My own class.md`;

describe('sync: runs from the command palette', () => {
	it('[SYNC-S01] a first Sync into a vault with no compendium creates every release file and the manifest, shows the summary Notice, and touches nothing else', async () => {
		const t = await startSyncTest();
		await createNotes({ [MINE_OUT]: 'my journal, outside the compendium folder' });
		await t.rebase();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new, 0 updated, 0 removed\./);
		await t.expectChange({ created: createdA(), dirsCreated: foldersA() });
		expect(t.read(MINE_OUT)).toBe('my journal, outside the compendium folder');
		expect(await fixtureRelease.calls()).toEqual([
			'https://api.github.com/repos/SteelCompendium/data-unified/releases/latest',
			'https://assets.example/v1.zip',
		]);
		const manifest = JSON.parse(t.read(MANIFEST));
		expect({ releaseTag: manifest.releaseTag, root: manifest.root, locale: manifest.locale, files: Object.keys(manifest.files).sort() }).toEqual({
			releaseTag: 'v1', root: DC, locale: 'en', files: Object.keys(RELEASE_A).sort(),
		});
		expect(await busy()).toBe(false);
	});

	it('[SYNC-R01] a second Sync of the same release creates, updates and trashes nothing (only the manifest\'s timestamp changes), says so, and leaves the user\'s notes alone', async () => {
		const t = await startSyncTest();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new/);
		await createNotes({ [MINE_OUT]: 'my journal', [MINE_IN]: 'my own class, next to the installed files' });
		await t.rebase();
		await ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 0 new, 0 updated, 0 removed\./);
		await t.expectChange({ modified: { [MANIFEST]: null } });
		expect(t.read(MINE_IN)).toBe('my own class, next to the installed files');
		expect((await fixtureRelease.calls()).length).toBe(4); // two requests per Sync
	});

	it('[SYNC-S02] a newer release updates the changed file in place, creates the new one, moves the file removed upstream into .trash (flat, by name), KEEPS the one the user edited, and never touches the user\'s own notes', async () => {
		const t = await startSyncTest();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new/);
		await editNote(`${DC}/kit/doomed.md`, 'doomed A, edited by the user');
		await createNotes({ [MINE_OUT]: 'my journal', [MINE_IN]: 'my own class' });
		await t.rebase();
		await ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
		await fixtureRelease.publish('v2', RELEASE_B);
		await palette.sync();
		await waitNotice(/compendium v2 synced — 1 new, 1 updated, 1 removed\./);
		await waitNotice(/1 file\(s\) skipped to protect your changes/);
		await t.expectChange({
			created: { [`${DC}/condition/new.md`]: 'new B' },
			modified: { [`${DC}/class/shadow.md`]: 'shadow B', [MANIFEST]: null },
			// Obsidian's own trash keeps the file NAME only: a trashed note lands flat in `.trash/` (verified in real Obsidian 1.14.4)
			moved: { [`${DC}/rule/retired.md`]: '.trash/retired.md' },
			dirsCreated: ['.trash', `${DC}/condition`],
		});
		expect(t.read('.trash/retired.md')).toBe('retired A');
		expect(t.read(`${DC}/kit/doomed.md`)).toBe('doomed A, edited by the user'); // removed upstream but modified: kept in place
		expect(t.read(MINE_IN)).toBe('my own class');
		expect(t.read(MINE_OUT)).toBe('my journal');
		expect(JSON.parse(t.read(MANIFEST)).releaseTag).toBe('v2');
	});

	it('[SYNC-S03] a Sync with the release tag pinned asks for that tag\'s release, not the latest', async () => {
		const t = await startSyncTest();
		await fixtureRelease.publish('v1', RELEASE_A, false);
		await fixtureRelease.publish('v2', RELEASE_B, true);
		await ev(`(() => { const p = app.plugins.plugins['draw-steel-elements']; p.settings.compendiumReleaseTag = 'v1'; return true; })()`);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new/);
		await t.expectChange({ created: createdA(), dirsCreated: foldersA() });
		expect(await fixtureRelease.calls()).toEqual(['https://api.github.com/repos/SteelCompendium/data-unified/releases/tags/v1', 'https://assets.example/v1.zip']);
	});

	it('[SYNC-R02] the Migrate command on a folder that is already in the 7.0.0 layout says there is nothing to migrate, opens no window and changes no file', async () => {
		const t = await startSyncTest();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new/);
		await t.rebase();
		await ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
		await palette.migrate();
		await waitNotice(/nothing to migrate — no pre-7\.0\.0 compendium files found\./);
		await noWindows();
		await t.expectChange({});
	});
});

describe('sync: failure paths leave the tree untouched', () => {
	// The runner reads `[ID]` from the first string literal after `it(`, so every id is written out: no title is built in a loop.
	/** The body shared by F01..F04: the failure is induced, the Sync fails visibly, the tree is untouched, and the next Sync works. */
	async function failedSync(induce: () => Promise<unknown>, message: RegExp): Promise<void> {
		const t = await startSyncTest();
		allowPageErrors(/compendium sync failed/); // the sync's own console.error (SC-646: that is the ONLY page error allowed)
		await fixtureRelease.publish('v1', RELEASE_A);
		await induce();
		await palette.sync();
		await waitNotice(message);
		expect((await noticeTexts()).filter((n) => /compendium sync failed/.test(n))).toHaveLength(1);
		await t.expectChange({});
		expect(await busy()).toBe(false);
		await fixtureRelease.failLookup(null);
		await fixtureRelease.failDownload(null);
		await fixtureRelease.brokenZip(false);
		await ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new/);
		await t.expectChange({ created: createdA(), dirsCreated: foldersA() });
	}
	const TAIL = 'one failure Notice, no file written, no manifest, the lock free, nothing unhandled; the next Sync works';
	it('[SYNC-F01] the release lookup answers HTTP 503: one failure Notice, no file written, no manifest, the lock free, nothing unhandled; the next Sync works', () =>
		failedSync(() => fixtureRelease.failLookup(503), /GitHub release lookup failed \(HTTP 503\)/));
	it('[SYNC-F02] the release does not exist (HTTP 404): one failure Notice, no file written, no manifest, the lock free, nothing unhandled; the next Sync works', () =>
		failedSync(() => fixtureRelease.failLookup(404), /GitHub release lookup failed \(HTTP 404\)/));
	it('[SYNC-F03] the download answers HTTP 500: one failure Notice, no file written, no manifest, the lock free, nothing unhandled; the next Sync works', () =>
		failedSync(() => fixtureRelease.failDownload(500), /Asset download failed \(HTTP 500\)/));
	it('[SYNC-F04] the download is not a zip: one failure Notice, no file written, no manifest, the lock free, nothing unhandled; the next Sync works', () =>
		failedSync(() => fixtureRelease.brokenZip(true), /not a valid zip file/));
	void TAIL;

	it('[SYNC-F05] a failed Sync after an earlier one leaves every installed file, the user\'s notes and the manifest byte-identical', async () => {
		const t = await startSyncTest();
		allowPageErrors(/compendium sync failed/);
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new/);
		await createNotes({ [MINE_IN]: 'my own class' });
		await t.rebase();
		await ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
		await fixtureRelease.publish('v2', RELEASE_B);
		await fixtureRelease.failDownload(500);
		await palette.sync();
		await waitNotice(/Asset download failed \(HTTP 500\)/);
		await t.expectChange({});
		expect(await busy()).toBe(false);
	});
});

describe('sync: the busy guard (SC-243)', () => {
	it('[SYNC-B01] a Sync started while another is in flight shows the busy Notice and asks for nothing; the first one finishes and writes the tree', async () => {
		const t = await startSyncTest();
		await fixtureRelease.publish('v1', RELEASE_A);
		await fixtureRelease.hold();
		await palette.sync();
		await ev(`new Promise((resolve) => { const t = setInterval(() => { if (window.__rel441.calls.length === 1) { clearInterval(t); resolve(true); } }, 20); })`);
		expect(await busy()).toBe(true);
		await ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
		await palette.sync();
		await waitNotice(/a compendium sync is already running\./);
		expect(await fixtureRelease.calls()).toEqual(['https://api.github.com/repos/SteelCompendium/data-unified/releases/latest']);
		await fixtureRelease.release();
		await waitNotice(/compendium v1 synced — 5 new/);
		await t.expectChange({ created: createdA(), dirsCreated: foldersA() });
		expect(await busy()).toBe(false);
	});
});

describe('sync: the Destination folder guard (SC-643)', () => {
	const setDestination = (value: string): Promise<unknown> =>
		ev(`(() => { app.plugins.plugins['draw-steel-elements'].settings.compendiumDestinationDirectory = ${JSON.stringify(value)}; return true; })()`);

	it('[SYNC-D01] a blank Destination means the default folder: the sync writes under "DS Compendium"', async () => {
		const t = await startSyncTest();
		await setDestination('   ');
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new/);
		await t.expectChange({ created: createdA(), dirsCreated: foldersA() });
	});

	it('[SYNC-D02] a nested Destination with a trailing slash syncs into exactly that folder', async () => {
		const t = await startSyncTest();
		await setDestination('Notes/Compendium/');
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 5 new/);
		await t.expectChange({ created: createdA('Notes/Compendium'), dirsCreated: ['Notes', ...foldersA('Notes/Compendium')].sort() });
	});

	/** The body shared by D03..D06: the setting resolves to the vault root or outside the vault, so the Sync is refused before anything happens. */
	async function refusedDestination(value: string): Promise<void> {
		const t = await startSyncTest();
		await createNotes({ [MINE_OUT]: 'my journal' });
		await t.rebase();
		await setDestination(value);
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/the Destination folder can't be the vault root \(or outside the vault\)/);
		await noWindows();
		await t.expectChange({});
		expect(await fixtureRelease.calls()).toEqual([]);
		expect(await busy()).toBe(false);
	}
	it('[SYNC-D03] a Destination of "/" (the vault root) is refused with a Notice naming the setting: no request, no window, no change', () => refusedDestination('/'));
	it('[SYNC-D04] a Destination of "." (the vault root) is refused with a Notice naming the setting: no request, no window, no change', () => refusedDestination('.'));
	it('[SYNC-D05] a Destination of "../outside" (outside the vault) is refused with a Notice naming the setting: no request, no window, no change', () => refusedDestination('../outside'));
	it('[SYNC-D06] a Destination of "a/.." (resolves to the vault root) is refused with a Notice naming the setting: no request, no window, no change', () => refusedDestination('a/..'));

	it('[SYNC-D07] the Migrate command refuses a vault-root Destination the same way and opens no window', async () => {
		const t = await startSyncTest();
		await setDestination('/');
		await palette.migrate();
		await waitNotice(/the Destination folder can't be the vault root/);
		await noWindows();
		await t.expectChange({});
	});
});
