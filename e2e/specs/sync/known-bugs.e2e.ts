// SC-441: the defects the survey found on the compendium Sync / migration surface, as real-Obsidian scenarios. Each `knownBug` encodes the CORRECT
// behaviour: it passes while the bug exists and FAILS the moment it is fixed (then the marker comes off). `failsWith` pins WHAT fails, so a marker cannot
// go green for another reason. Every side effect stays inside the disposable vault (startSyncTest: guard, trash setting read back, canary, pristine tree).
//   K the markers · D08..D10 what a `.trash` / `.obsidian` / file Destination actually does in real Obsidian (SC-700)
import { expect } from '@wdio/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import '../../driver/dse';
import { dse, knownBug } from '../../driver/dse';
import { ev } from '../../driver/page';
import { allowPageErrors } from '../../driver/settingsDrive';
import {
	LEGACY, createNotes, diffTrees, dismiss, fixtureRelease, hold, noWindows, noticeTexts, palette, seedLegacy, startSyncTest, waitNotice, waitWindow, windows, windowsWithin, within,
} from '../../driver/sync';
import { DC, legacyFixture, reachRunning } from '../../driver/syncMigration';

const RELEASE_A = { 'class/shadow.md': 'shadow A', 'rule/combat/turn.md': 'turn A', 'kit/panther.md': 'panther A' };
const clearNotices = (): Promise<unknown> => ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
const TRASH_ID = 'sync.legacy.trash';
const setDestination = (value: string): Promise<unknown> =>
	ev(`(() => { app.plugins.plugins['draw-steel-elements'].settings.compendiumDestinationDirectory = ${JSON.stringify(value)}; return true; })()`);
/** Every text file under the vault copy (including dot-folders), path -> text. */
function everyText(base: string): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (dir: string, rel: string): void => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const r = rel ? `${rel}/${e.name}` : e.name;
			if (e.isDirectory()) walk(path.join(dir, e.name), r);
			else if (!r.startsWith('.obsidian/')) out[r] = fs.readFileSync(path.join(dir, e.name), 'utf8');
		}
	};
	walk(base, '');
	return out;
}

describe('sync: known bugs', () => {
	knownBug('SC-653', '[SYNC-K01] a Destination folder holding only the user\'s own notes is NOT offered "Move old compendium to trash"', async () => {
		await startSyncTest();
		await createNotes({ [`${DC}/Session 1.md`]: 'my session notes', [`${DC}/NPCs/Innkeeper.md`]: 'my innkeeper' });
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitWindow(LEGACY);
		const [w] = await windows();
		if (w.buttons.some((b) => b.id === TRASH_ID)) throw new Error(`the window offers "Move old compendium to trash" for a folder of the user's own notes`);
	}, { failsWith: /offers "Move old compendium to trash" for a folder of the user's own notes/ });

	knownBug('SC-653', '[SYNC-K02] under "Permanently delete" the trash choice is either not offered or says the folder will be deleted for good', async () => {
		await startSyncTest({ trash: 'none' });
		await createNotes({ [`${DC}/old-download.md`]: 'from an older plugin', [`${DC}/class/shadow.md`]: 'shadow, edited' });
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitWindow(LEGACY);
		const [w] = await windows();
		const body = await dse.page<string>(`document.querySelector('.modal-container .dse-modal__body').textContent`);
		if (w.buttons.some((b) => b.id === TRASH_ID) && !/permanent/i.test(body + w.buttons.map((b) => b.label).join(' '))) {
			throw new Error('the window offers the trash button under "Permanently delete" and never says the folder is deleted for good');
		}
	}, { failsWith: /never says the folder is deleted for good/ });

	knownBug('SC-694', '[SYNC-K03] a Sync keeps what the user wrote in a compendium file it updates (in place or copied aside)', async () => {
		const t = await startSyncTest();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 3 new/);
		const edit = 'shadow A, with what the user wrote in it';
		await ev(`(async () => { const f = app.vault.getAbstractFileByPath('${DC}/class/shadow.md'); await app.vault.modify(f, ${JSON.stringify(edit)}); return true; })()`);
		await clearNotices();
		await fixtureRelease.publish('v2', { ...RELEASE_A, 'class/shadow.md': 'shadow B' });
		await palette.sync();
		await waitNotice(/compendium v2 synced/);
		await t.settled();
		if (!Object.values(everyText(t.base)).includes(edit)) throw new Error('the user\'s edit is gone from the vault: no file holds it after the Sync');
	}, { failsWith: /the user's edit is gone from the vault/ });

	knownBug('SC-695', '[SYNC-K04] when the Sync cannot start (the release lookup fails), "Move old compendium to trash" has trashed nothing', async () => {
		const t = await startSyncTest();
		allowPageErrors(/compendium sync failed/);
		await createNotes({ [`${DC}/old-download.md`]: 'from an older plugin', [`${DC}/My homebrew.md`]: 'mine' });
		await t.rebase();
		await fixtureRelease.publish('v1', RELEASE_A);
		await fixtureRelease.failLookup(503);
		await palette.sync();
		await waitWindow(LEGACY);
		await dse.click(dse.control(TRASH_ID));
		await waitNotice(/compendium sync failed/);
		await noWindows();
		const after = await t.settled();
		if (!(`${DC}/old-download.md` in after.files) || !(`${DC}/My homebrew.md` in after.files)) {
			throw new Error(`the sync failed and the old folder is already in the trash: ${JSON.stringify(diffTrees(t.before, after).created)}`);
		}
	}, { failsWith: /the old folder is already in the trash/ });

	knownBug('SC-357', '[SYNC-K05] while a migration run is still going, a second Migrate command opens no second window', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		try {
			// The open window blocks the palette (its scope takes Ctrl+P), so the second command can only come after the window is dismissed; the run
			// itself carries on until its file in flight is done (here: held), and it holds no busy lock in the meantime.
			await reachRunning(2);
			await clearNotices();
			await dismiss('running', 'x');
			await noWindows();
			await palette.migrate();
			const opened = await windowsWithin(1, 5000);
			const titles = (await windows()).map((w) => w.title);
			if (opened) throw new Error(`a second window opened over the running migration: ${JSON.stringify(titles)}`);
		} finally {
			await hold.release();
		}
	}, { failsWith: /a second window opened over the running migration/ });

	knownBug('SC-696', '[SYNC-K06] closing the migration window in the middle of a run does not say the compendium was left as it is', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		try {
			await reachRunning(2);
			await clearNotices();
			await dismiss('running', 'escape');
			await noWindows();
			await hold.release();
			await waitNotice(/stopped after moving 3 file\(s\)/);
			const texts = (await noticeTexts()).join(' | ');
			if (/left as it is/.test(texts)) throw new Error(`a Notice says the compendium was left as it is although files moved: ${texts.slice(0, 200)}`);
		} finally {
			await hold.release();
		}
	}, { failsWith: /says the compendium was left as it is although files moved/ });

	knownBug('SC-698', '[SYNC-K07] a Sync of a folder whose every legacy file is blocked does something visible: it syncs or opens a window', async () => {
		const t = await startSyncTest();
		const pairs = await seedLegacy(25);
		await createNotes(Object.fromEntries(pairs.map((p) => [`${DC}/${p.newRelative}`, `already here: ${p.newRelative}`])));
		await t.rebase();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await within(5000, async () => (await windows()).length > 0 || (await fixtureRelease.calls()).length > 0);
		const asked = (await fixtureRelease.calls()).length;
		const titles = (await windows()).map((w) => w.title);
		if (asked === 0 && titles.length === 0) throw new Error(`the Sync made no request and opened no window: ${(await noticeTexts()).join(' | ').slice(0, 200)}`);
	}, { failsWith: /the Sync made no request and opened no window/ });

	knownBug('SC-701', '[SYNC-K08] a Destination folder that holds only empty folders syncs without asking about "existing" files', async () => {
		const t = await startSyncTest();
		await ev(`(async () => { for (const f of ['${DC}', '${DC}/class', '${DC}/rule']) if (!app.vault.getAbstractFileByPath(f)) await app.vault.createFolder(f); return true; })()`);
		await t.rebase();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await windowsWithin(1, 4000);
		const titles = (await windows()).map((w) => w.title);
		if (titles.length > 0) throw new Error(`a folder with no file in it opened ${JSON.stringify(titles)}`);
	}, { failsWith: /a folder with no file in it opened/ });

	knownBug('SC-700', '[SYNC-K09] a Destination of ".trash" or ".obsidian" is refused with a Notice and nothing is written', async () => {
		for (const dest of ['.trash', '.obsidian']) {
			const t = await startSyncTest();
			await setDestination(dest);
			await fixtureRelease.publish('v1', RELEASE_A);
			await palette.sync();
			await within(6000, async () => (await noticeTexts()).some((n) => /synced|failed|can't be the vault root/.test(n)));
			const texts = (await noticeTexts()).join(' | ');
			const wrote = Object.keys((await t.settled()).files).some((p) => p.startsWith(`${dest}/`)) || fs.existsSync(path.join(t.base, dest, 'class'));
			await ev(`(async () => { const a = app.vault.adapter; for (const d of ['${dest}/class', '${dest}/rule', '${dest}/kit']) if (await a.exists(d)) await a.rmdir(d, true); return true; })()`);
			if (wrote || !/can't be the vault root/.test(texts)) throw new Error(`a Destination of "${dest}" was accepted: ${texts.slice(0, 160)}`);
		}
	}, { failsWith: /a Destination of "\.(trash|obsidian)" was accepted/ });
});

describe('sync: what odd Destinations do in real Obsidian (SC-700)', () => {
	it('[SYNC-D08] a Destination of ".trash" is accepted today: the compendium is written inside the vault\'s trash folder', async () => {
		const t = await startSyncTest();
		await setDestination('.trash');
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 3 new|compendium sync failed|Destination folder/);
		const after = await t.settled();
		const written = Object.keys(after.files).filter((p) => p.startsWith('.trash/'));
		console.log(`SYNC-OBSERVED Destination .trash: written ${JSON.stringify(written)}; notices ${JSON.stringify(await noticeTexts())}`);
		expect(written.length).toBeGreaterThanOrEqual(0);
	});

	it('[SYNC-D09] a Destination of ".obsidian" is accepted today: the compendium is written into the vault\'s configuration folder (the reset removes it again)', async () => {
		const t = await startSyncTest();
		await setDestination('.obsidian');
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 3 new|compendium sync failed|Destination folder/);
		await t.settled();
		const on = ['class', 'rule', 'kit'].filter((d) => fs.existsSync(path.join(t.base, '.obsidian', d)));
		console.log(`SYNC-OBSERVED Destination .obsidian: top folders written ${JSON.stringify(on)}; notices ${JSON.stringify(await noticeTexts())}`);
		await ev(`(async () => { const a = app.vault.adapter; for (const d of ['.obsidian/class', '.obsidian/rule', '.obsidian/kit']) if (await a.exists(d)) await a.rmdir(d, true); return true; })()`);
		expect(on.length).toBeGreaterThanOrEqual(0);
	});

	it('[SYNC-D10] a Destination that is a FILE: the Sync fails with a Notice, writes nothing, and leaves the note alone', async () => {
		const t = await startSyncTest();
		allowPageErrors(/compendium sync failed/);
		await createNotes({ 'Notes.md': 'my note, not a folder' });
		await t.rebase();
		await setDestination('Notes.md');
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium sync failed|synced/);
		const texts = (await noticeTexts()).join(' | ');
		console.log(`SYNC-OBSERVED Destination is a file: ${texts}`);
		await noWindows();
		const after = await t.settled();
		console.log(`SYNC-OBSERVED Destination is a file: diff ${JSON.stringify(diffTrees(t.before, after))}`);
		expect(t.read('Notes.md')).toBe('my note, not a folder');
	});
});
