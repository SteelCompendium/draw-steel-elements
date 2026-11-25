// SC-441: the migration window's PREVIEW (src/views/CompendiumMigrationModal.ts), in real Obsidian: 25 files at real pre-7.0.0 paths, a note of the user's
// own inside the folder, one outside that links to a moved file. Nothing has happened yet when it opens; each button and each way out is driven with
// real input and the whole tree is asserted. (The run, the summaries and the error screen are in migration-run.e2e.ts and migration-summary.e2e.ts.)
//   M the window's buttons, focus on open and the ways out · R re-offers
import { expect } from '@wdio/globals';
import '../../driver/dse';
import { dse } from '../../driver/dse';
import { ev } from '../../driver/page';
import {
	LEGACY, MANIFEST, PREVIEW, STATE, dismiss, enterOn, fixtureRelease, noWindows, palette, startSyncTest, waitNotice, waitWindow, windows,
} from '../../driver/sync';
import { BACKUP, DC, N, USER_IN, USER_OUT, legacyFixture, publishNewTree, reachPreview } from '../../driver/syncMigration';

const clearNotices = (): Promise<unknown> => ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
const DECLINED = /compendium left as it is, and NOT synced/;

describe('migration window: the preview', () => {
	it('[SYNC-M01] opens through the Migrate command with the keyboard focus on "Not now", names the 25 files in "Move 25 file(s)", and has moved, written and asked for nothing', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await publishNewTree(f.pairs);
		await reachPreview();
		const [w] = await windows();
		console.log(`SYNC-FOCUS preview: ${w.focus}`);
		expect(w.focus).toBe('migration.preview.not-now');
		expect(w.buttons.map((b) => b.id)).toEqual(['migration.preview.not-now', 'migration.preview.sync-anyway', 'migration.preview.move']);
		expect(w.buttons[2].label).toBe(`Move ${N} file(s)`);
		expect(await dse.page<string>(`document.querySelector('.modal-container .dse-modal__body').textContent`)).toContain(`${N} file(s) will be moved inside "${DC}"`);
		await t.expectChange({});
		expect(await fixtureRelease.calls()).toEqual([]);
		await dismiss('preview', 'x');
		await noWindows();
	});

	it('[SYNC-M02] Enter straight away does only what the focused "Not now" does: the decline is recorded (the state file is the only change), nothing moves, nothing is synced, and the next Sync asks again', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await publishNewTree(f.pairs);
		await reachPreview();
		await dse.press('Enter', dse.control('migration.preview.not-now'));
		await waitNotice(DECLINED);
		await noWindows();
		await t.expectChange({ created: { [STATE]: null } });
		expect(JSON.parse(t.read(STATE))).toMatchObject({ declined: true, incomplete: false, migrated: [] });
		expect(await fixtureRelease.calls()).toEqual([]);
		await clearNotices();
		await palette.sync();
		await waitWindow(PREVIEW); // the offer is made again
		await dismiss('preview', 'x');
		await noWindows();
	});

	it('[SYNC-M03] a click on "Not now" does the same', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await reachPreview();
		await dse.click(dse.control('migration.preview.not-now'));
		await waitNotice(DECLINED);
		await noWindows();
		await t.expectChange({ created: { [STATE]: null } });
		expect(JSON.parse(t.read(STATE)).declined).toBe(true);
		expect(f.pairs.every((p) => t.exists(`${DC}/${p.oldRelative}`))).toBe(true);
	});

	it('[SYNC-M04] a click on "Sync without moving" leaves every legacy file where it is, creates the new tree beside it, writes the manifest, and the move can no longer be offered', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await publishNewTree(f.pairs);
		await reachPreview();
		await dse.click(dse.control('migration.preview.sync-anyway'));
		await waitNotice(new RegExp(`compendium v4 synced — ${N} new, 0 updated, 0 removed\\.`));
		await noWindows();
		await t.expectChange({
			created: { ...Object.fromEntries(f.pairs.map((p) => [`${DC}/${p.newRelative}`, `official ${p.newRelative}`])), [MANIFEST]: null },
			dirsCreated: t.dirsFor(f.pairs.map((p) => `${DC}/${p.newRelative}`)),
		});
		for (const p of f.pairs) expect(t.read(`${DC}/${p.oldRelative}`)).toBe(p.content);
		expect(t.exists(STATE)).toBe(false);
		await clearNotices();
		await palette.migrate(); // the new files now occupy every destination: nothing can move any more
		await waitNotice(/nothing to migrate/);
		await noWindows();
	});

	it('[SYNC-M05] Enter on "Sync without moving" (Tab from the initial focus) does the same sync', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await publishNewTree(f.pairs);
		await reachPreview();
		await enterOn('migration.preview.sync-anyway');
		await waitNotice(new RegExp(`compendium v4 synced — ${N} new`));
		await noWindows();
		await t.expectChange({
			created: { ...Object.fromEntries(f.pairs.map((p) => [`${DC}/${p.newRelative}`, `official ${p.newRelative}`])), [MANIFEST]: null },
			dirsCreated: t.dirsFor(f.pairs.map((p) => `${DC}/${p.newRelative}`)),
		});
		for (const p of f.pairs) expect(t.read(`${DC}/${p.oldRelative}`)).toBe(p.content);
	});

	it('[SYNC-M06] the Sync command on a legacy folder offers the same window instead of syncing; "Not now" there asks nothing of the network', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await publishNewTree(f.pairs);
		await palette.sync();
		await waitWindow(PREVIEW);
		expect((await windows()).map((w) => w.title)).toEqual([PREVIEW]); // not "Existing compendium folder found": 25 legacy files is a legacy layout
		void LEGACY;
		await dse.click(dse.control('migration.preview.not-now'));
		await waitNotice(DECLINED);
		await noWindows();
		await t.expectChange({ created: { [STATE]: null } });
		expect(await fixtureRelease.calls()).toEqual([]);
		expect(f.pairs.length).toBe(N);
	});

	it('[SYNC-M07] Escape at the preview is a dismissal, not consent: the decline is recorded, nothing moves, nothing is synced', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		await reachPreview();
		await dismiss('preview', 'escape');
		await waitNotice(DECLINED);
		await noWindows();
		await t.expectChange({ created: { [STATE]: null } });
		expect(JSON.parse(t.read(STATE)).declined).toBe(true);
	});

	it('[SYNC-M08] the X at the preview is a dismissal too: the decline is recorded, nothing moves', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		await reachPreview();
		await dismiss('preview', 'x');
		await waitNotice(DECLINED);
		await noWindows();
		await t.expectChange({ created: { [STATE]: null } });
	});

	it('[SYNC-M09] a click outside the preview is a dismissal too: the decline is recorded, nothing moves', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		await reachPreview();
		await dismiss('preview', 'backdrop');
		await waitNotice(DECLINED);
		await noWindows();
		await t.expectChange({ created: { [STATE]: null } });
		expect(t.exists(BACKUP)).toBe(false);
		expect(t.read(USER_IN)).toContain('the user\'s own note');
		expect(t.read(USER_OUT)).toContain('See [[');
	});
});
