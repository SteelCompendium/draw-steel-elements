// SC-441: the "Existing compendium folder found" window (src/views/LegacyCompendiumModal.ts), in real Obsidian. The only flow that can TRASH a folder.
// The folder holds a compendium-like set of files (one of them an edited copy of a release file, one an older plugin's download) plus a user note of the
// user's own; the window is reached the real way (the palette's "Sync compendium" before the first sync). Each scenario asserts the whole tree.
//   E the window's buttons, focus on open and the ways out · R the re-run after it
import { expect } from '@wdio/globals';
import '../../driver/dse';
import { dse } from '../../driver/dse';
import { ev } from '../../driver/page';
import {
	LEGACY, MANIFEST, createNotes, dismiss, enterOn, fixtureRelease, noWindows, noticeTexts, palette, startSyncTest, waitNotice, waitWindow, windows,
} from '../../driver/sync';
import type { SyncTest } from '../../driver/sync';

const DC = 'DS Compendium';
const RELEASE_A = {
	'class/shadow.md': 'shadow A',
	'rule/combat/turn.md': 'turn A',
	'kit/panther.md': 'panther A',
};
const USER = {
	[`${DC}/old-download.md`]: 'a file from an older plugin version',
	[`${DC}/class/shadow.md`]: 'shadow, edited by the user',
	[`${DC}/My homebrew.md`]: 'the user\'s own note, inside the folder',
	'Journal.md': 'my journal, outside the folder',
	'DS Compendium Notes/x.md': 'a sibling folder whose name starts the same',
};
const clearNotices = (): Promise<unknown> => ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);

/** The vault holds the user's folder and notes, a release is on offer, and the palette's Sync has opened the window. */
async function openWindow(opts: { trash?: 'local' | 'none' } = {}): Promise<SyncTest> {
	const t = await startSyncTest(opts);
	await createNotes(USER);
	await t.rebase();
	await fixtureRelease.publish('v1', RELEASE_A);
	await palette.sync();
	await waitWindow(LEGACY);
	return t;
}

describe('sync: "Existing compendium folder found"', () => {
	it('[SYNC-E01] opens with the keyboard focus on "Keep everything" (the safe default), offers exactly the two buttons, and has changed no file and asked for nothing yet', async () => {
		const t = await openWindow();
		const [w] = await windows();
		expect(w.focus).toBe('sync.legacy.keep');
		expect(w.buttons.map((b) => [b.id, b.disabled])).toEqual([['sync.legacy.keep', false], ['sync.legacy.trash', false]]);
		expect(await dse.page<string>(`document.querySelector('.modal-container .dse-modal__body').textContent`)).toContain(`"${DC}" already contains files`);
		await t.expectChange({});
		expect(await fixtureRelease.calls()).toEqual([]);
		await dismiss('legacy', 'x');
		await noWindows();
	});

	it('[SYNC-E02] Enter straight away does only what the focused "Keep everything" does: the sync runs INTO the folder, the edited file is skipped and reported, every existing file keeps its bytes, nothing is trashed', async () => {
		const t = await openWindow();
		expect((await windows())[0].focus).toBe('sync.legacy.keep');
		await dse.press('Enter', dse.control('sync.legacy.keep'));
		await waitNotice(/compendium v1 synced — 2 new, 0 updated, 0 removed\./);
		await waitNotice(/1 file\(s\) skipped to protect your changes/);
		await noWindows();
		await t.expectChange({
			created: { [`${DC}/rule/combat/turn.md`]: 'turn A', [`${DC}/kit/panther.md`]: 'panther A', [MANIFEST]: null },
			dirsCreated: [`${DC}/rule`, `${DC}/rule/combat`, `${DC}/kit`].sort(),
		});
		for (const [p, c] of Object.entries(USER)) expect(t.read(p)).toBe(c);
		expect(Object.keys(JSON.parse(t.read(MANIFEST)).files).sort()).toEqual(['kit/panther.md', 'rule/combat/turn.md']); // the user's edited file is not the plugin's
		expect(t.exists('.trash')).toBe(false);
	});

	it('[SYNC-E03] a click on "Keep everything" does the same', async () => {
		const t = await openWindow();
		await dse.click(dse.control('sync.legacy.keep'));
		await waitNotice(/compendium v1 synced — 2 new, 0 updated, 0 removed\./);
		await noWindows();
		await t.expectChange({
			created: { [`${DC}/rule/combat/turn.md`]: 'turn A', [`${DC}/kit/panther.md`]: 'panther A', [MANIFEST]: null },
			dirsCreated: [`${DC}/rule`, `${DC}/rule/combat`, `${DC}/kit`].sort(),
		});
	});

	it('[SYNC-R03] after "Keep everything" a second Sync of the same release changes nothing but the manifest\'s timestamp and says 0 / 0 / 0', async () => {
		const t = await openWindow();
		await dse.click(dse.control('sync.legacy.keep'));
		await waitNotice(/compendium v1 synced — 2 new/);
		await noWindows();
		await t.rebase();
		await clearNotices();
		await palette.sync();
		await waitNotice(/compendium v1 synced — 0 new, 0 updated, 0 removed\./);
		await noWindows();
		await t.expectChange({ modified: { [MANIFEST]: null } });
	});

	// The runner reads `[ID]` from the first string literal after `it(`, so every id is written out: no title is built in a loop.
	/** The body shared by E04 / E05: the trash choice, by click or by Enter after Tab. */
	async function trashChoice(how: 'click' | 'enter'): Promise<void> {
		const t = await openWindow();
		if (how === 'click') await dse.click(dse.control('sync.legacy.trash'));
		else await enterOn('sync.legacy.trash');
		await waitNotice(/compendium v1 synced — 3 new, 0 updated, 0 removed\./);
		await noWindows();
		const after = await t.settled();
		// what Obsidian's own trash did with the folder is recorded, not assumed
		const trashed = Object.keys(after.files).filter((p) => p.startsWith('.trash/'));
		console.log(`SYNC-OBSERVED trash of a folder: ${JSON.stringify(trashed)}`);
		expect(trashed.length).toBe(3);
		for (const [from, bytes] of [[`${DC}/old-download.md`, USER[`${DC}/old-download.md`]], [`${DC}/class/shadow.md`, USER[`${DC}/class/shadow.md`]], [`${DC}/My homebrew.md`, USER[`${DC}/My homebrew.md`]]] as const) {
			expect(trashed.some((p) => p.endsWith(from.split('/').pop() as string) && t.read(p) === bytes)).toBe(true);
		}
		expect(t.read(`${DC}/class/shadow.md`)).toBe('shadow A');
		expect(t.exists(`${DC}/old-download.md`)).toBe(false);
		expect(t.exists(`${DC}/My homebrew.md`)).toBe(false);
		expect(t.read('Journal.md')).toBe(USER['Journal.md']);
		expect(t.read('DS Compendium Notes/x.md')).toBe(USER['DS Compendium Notes/x.md']);
		expect(Object.keys(JSON.parse(t.read(MANIFEST)).files).sort()).toEqual(Object.keys(RELEASE_A).sort());
	}
	it('[SYNC-E04] "Move old compendium to trash" by click: exactly the folder the window names goes to the vault\'s .trash with its bytes, the sibling folder and the outside note are untouched, then a fresh sync fills a new folder', () => trashChoice('click'));
	it('[SYNC-E05] "Move old compendium to trash" by Enter after Tab to it: the same trash, the same fresh sync', () => trashChoice('enter'));

	/** The body shared by E06..E08: leaving without an answer changes nothing and the next Sync asks again. */
	async function leave(way: 'escape' | 'x' | 'backdrop'): Promise<void> {
		const t = await openWindow();
		await dismiss('legacy', way);
		await noWindows();
		await t.expectChange({});
		expect(await fixtureRelease.calls()).toEqual([]);
		expect(await ev<boolean>(`app.plugins.plugins['draw-steel-elements'].syncService.isBusy()`)).toBe(false);
		expect((await noticeTexts()).join('\n')).not.toMatch(/synced|failed/);
		await palette.sync();
		await waitWindow(LEGACY);
		await dismiss('legacy', 'x');
		await noWindows();
	}
	it('[SYNC-E06] leaving the window by Escape: no file changes, no request, nothing recorded, the lock is free, and the next Sync asks again', () => leave('escape'));
	it('[SYNC-E07] leaving the window by its X: no file changes, no request, nothing recorded, the lock is free, and the next Sync asks again', () => leave('x'));
	it('[SYNC-E08] leaving the window by a click outside it: no file changes, no request, nothing recorded, the lock is free, and the next Sync asks again', () => leave('backdrop'));

	it('[SYNC-E09] under "Deleted files: Permanently delete" the same trash button removes the folder FOR GOOD (nothing lands in .trash) and then syncs; the window does not say so', async () => {
		const t = await openWindow({ trash: 'none' });
		const body = await dse.page<string>(`document.querySelector('.modal-container .dse-modal__body').textContent`);
		console.log(`SYNC-OBSERVED permanent-delete window text mentions "permanent": ${/permanent/i.test(body)}`);
		await dse.click(dse.control('sync.legacy.trash'));
		await waitNotice(/compendium v1 synced — 3 new, 0 updated, 0 removed\./);
		await noWindows();
		await t.expectChange({
			created: { [`${DC}/rule/combat/turn.md`]: 'turn A', [`${DC}/kit/panther.md`]: 'panther A', [MANIFEST]: null },
			modified: { [`${DC}/class/shadow.md`]: 'shadow A' },
			removed: [`${DC}/old-download.md`, `${DC}/My homebrew.md`],
			dirsCreated: [`${DC}/rule`, `${DC}/rule/combat`, `${DC}/kit`].sort(),
		});
		expect(t.exists('.trash')).toBe(false);
	});
});
