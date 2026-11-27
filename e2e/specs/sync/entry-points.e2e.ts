// SC-441: the other ways to start a Sync, driven THROUGH the windows they open (their controls are owned by other manifests: `settings.compendium.sync`
// by settings-tab.ts (SC-440), `authoring.search.sync` by authoring-search.ts (SC-443)). Same `plugin.syncCompendium()` behind all three entry points:
// a folder of files with no manifest opens "Existing compendium folder found" instead of syncing.
import { expect } from '@wdio/globals';
import '../../driver/dse';
import { dse } from '../../driver/dse';
import { openEditor, palette as authoringPalette } from '../../driver/authoring';
import { closeSettings, ctl, onMain, openAt } from '../../driver/settingsDrive';
import { LEGACY, createNotes, dismiss, fixtureRelease, noWindows, startSyncTest, waitWindow, windows } from '../../driver/sync';

const DC = 'DS Compendium';
const RELEASE_A = { 'class/shadow.md': 'shadow A' };
const REFERENCE = ['insert-compendium-reference', 'Insert Draw Steel: compendium reference'] as const;

describe('sync: the other entry points', () => {
	it('[SYNC-E10] the Sync button of Settings > Compendium opens "Existing compendium folder found" for a folder with files and no manifest, and syncs nothing until it is answered', async () => {
		const t = await startSyncTest();
		await createNotes({ [`${DC}/old-download.md`]: 'from an older plugin' });
		await t.rebase();
		await fixtureRelease.publish('v1', RELEASE_A);
		await openAt('settings.page.compendium');
		try {
			await dse.click(ctl('settings.compendium.sync'));
			// Obsidian opens the window in the window that is active: the settings popout, where the driver is
			await waitWindow(LEGACY);
			expect((await windows()).map((w) => w.title)).toEqual([LEGACY]);
			expect(await onMain(() => fixtureRelease.calls())).toEqual([]);
			await dismiss('legacy', 'x');
			await noWindows();
		} finally {
			await closeSettings();
		}
		await t.expectChange({});
	});

	it('[SYNC-E11] the "Sync compendium…" row of the compendium search window (nothing indexed) opens the same window for such a folder, and syncs nothing until it is answered', async () => {
		const t = await startSyncTest();
		await openEditor('Authoring/entry-point.md', 'x\n', 'live-preview', { line: 0, ch: 0 });
		await createNotes({ [`${DC}/old-download.md`]: 'from an older plugin' });
		await t.rebase();
		await fixtureRelease.publish('v1', RELEASE_A);
		await authoringPalette(REFERENCE[0], REFERENCE[1], { opensSearch: true });
		await dse.click(dse.control('authoring.search.sync'));
		await waitWindow(LEGACY);
		expect(await fixtureRelease.calls()).toEqual([]);
		await dismiss('legacy', 'x');
		await noWindows();
		await t.expectChange({});
		expect((await windows()).length).toBe(0);
	});
});
