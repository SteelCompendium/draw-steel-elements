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
	COMPLETE, LEGACY, MANIFEST, PREVIEW, createFolders, createNotes, diffTrees, dismiss, fixtureRelease, hold, noWindows, noticeTexts, palette, seedLegacy, startSyncTest, waitNotice, waitWindow, windows, windowsWithin, within,
} from '../../driver/sync';
import { DC, legacyFixture, reachPreview, reachRunning, reachSummary } from '../../driver/syncMigration';

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
		// Whatever SC-653 ships (the same window without the trash button, or a refusal with a Notice and no window), the trash choice must not be offered:
		// wait for the window OR a Notice, and fail only on a trash button.
		const seen = await within(8000, async () => (await windows()).length > 0 || (await noticeTexts()).some((n) => /Destination|sync|refus|can't/i.test(n)));
		// a Sync that does nothing visible is not a fix: "no window" counts only when a Notice said why
		if (!seen) throw new Error('the Sync showed neither a window nor a Notice');
		const ws = await windows();
		if (ws.some((w) => w.buttons.some((b) => b.id === TRASH_ID))) throw new Error(`the window offers "Move old compendium to trash" for a folder of the user's own notes`);
	}, { failsWith: /offers "Move old compendium to trash" for a folder of the user's own notes/ });

	knownBug('SC-653', '[SYNC-K02] under "Permanently delete" the trash choice is not offered, or says the folder will be deleted for good, or leaves the folder recoverable under .trash', async () => {
		const t = await startSyncTest({ trash: 'none' });
		await createNotes({ [`${DC}/old-download.md`]: 'from an older plugin', [`${DC}/class/shadow.md`]: 'shadow, edited' });
		await t.rebase();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		// a refusal with a Notice (no window at all) is a fix too: wait for the window OR a Notice
		const seen = await within(8000, async () => (await windows()).length > 0 || (await noticeTexts()).some((n) => /Destination|sync|refus|can't/i.test(n)));
		if (!seen) throw new Error('the Sync showed neither a window nor a Notice');
		const [w] = await windows();
		if (w === undefined) return; // no window, but a Notice said why: no trash choice
		const body = await dse.page<string>(`document.querySelector('.modal-container .dse-modal__body').textContent`);
		if (!w.buttons.some((b) => b.id === TRASH_ID)) return; // no trash choice at all
		if (/permanent/i.test(body + w.buttons.map((b) => b.label).join(' '))) return; // the window says so
		// the posted plan: the folder always goes to the vault's own .trash, whatever "Deleted files" says. Take the choice (inside the disposable vault) and look.
		await dse.click(dse.control(TRASH_ID));
		await within(10000, async () => (await noticeTexts()).some((n) => /synced|failed/.test(n)));
		const after = await t.settled();
		if (Object.keys(after.files).some((p) => p.startsWith('.trash/') && /old-download\.md$/.test(p))) return;
		throw new Error('the window offers the trash button under "Permanently delete", never says the folder is deleted for good, and the folder is not under .trash afterwards');
	}, { failsWith: /never says the folder is deleted for good, and the folder is not under \.trash afterwards/ });

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
			await within(10000, async () => (await noticeTexts()).some((n) => /stopped after moving/.test(n))); // let the run end before the next scenario starts
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
			await within(10000, async () => (await noticeTexts()).some((n) => /stopped after moving/.test(n)));
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
		const accepted: string[] = [];
		for (const dest of ['.trash', '.obsidian']) {
			const t = await startSyncTest();
			await setDestination(dest);
			await fixtureRelease.publish('v1', RELEASE_A);
			await palette.sync();
			await within(6000, async () => (await noticeTexts()).some((n) => /synced|failed|can't be the vault root/.test(n)));
			const texts = (await noticeTexts()).join(' | ');
			const wrote = Object.keys((await t.settled()).files).some((p) => p.startsWith(`${dest}/`));
			if (wrote || !/can't be the vault root/.test(texts)) accepted.push(`${dest} (${texts.slice(0, 80)})`);
		}
		// both Destinations are tried before the verdict, so a fix of one does not hide the other
		if (accepted.length) throw new Error(`a Destination of "${accepted[0].split(' ')[0]}" was accepted: ${accepted.join('; ')}`);
	}, { failsWith: /a Destination of "\.(trash|obsidian)" was accepted/ });

	knownBug('SC-702', '[SYNC-K10] with "Automatically update internal links" OFF the migration preview names that setting before the run', async () => {
		const t = await startSyncTest({ updateLinks: false });
		await legacyFixture(t);
		expect(await ev<unknown>(`app.vault.getConfig('alwaysUpdateLinks')`)).toBe(false);
		await reachPreview();
		const body = await dse.page<string>(`document.querySelector('.modal-container .dse-modal__body').textContent`);
		// the preview promises that Obsidian updates the links "automatically"; with the setting OFF it must name the setting Obsidian reads
		if (!/Automatically update internal links/i.test(body)) throw new Error('the preview does not name the "Automatically update internal links" setting although it is off');
	}, { failsWith: /the preview does not name the "Automatically update internal links" setting although it is off/ });

	knownBug('SC-703', '[SYNC-K11] after a phase change the keyboard focus is inside the window (the complete summary)', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		await reachSummary();
		const [w] = await windows();
		if (w.focus === null) throw new Error('the keyboard focus is not inside the window after the phase change (it is on the page body)');
	}, { failsWith: /the keyboard focus is not inside the window after the phase change/ });
});

describe('sync: what odd Destinations do in real Obsidian (SC-700)', () => {
	const FILES = { 'class/shadow.md': 'shadow A', 'rule/combat/turn.md': 'turn A', 'kit/panther.md': 'panther A' };
	const under = (root: string): Record<string, string> => Object.fromEntries(Object.entries(FILES).map(([p, c]) => [`${root}/${p}`, c]));
	const dirs = (root: string): string[] => ['class', 'rule', 'rule/combat', 'kit'].map((d) => `${root}/${d}`);

	it('[SYNC-D08] a Destination of ".trash" is accepted today: the compendium is written inside the vault\'s trash folder (SC-700 changes this: this test then goes red)', async () => {
		const t = await startSyncTest();
		await setDestination('.trash');
		await fixtureRelease.publish('v1', FILES);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 3 new/);
		await t.expectChange({ created: { ...under('.trash'), [MANIFEST]: null }, dirsCreated: ['.trash', ...dirs('.trash')].sort() });
	});

	it('[SYNC-D09] a Destination of ".obsidian" is accepted today: the compendium is written into the vault\'s configuration folder (the reset removes it again; SC-700 changes this: this test then goes red)', async () => {
		const t = await startSyncTest();
		await setDestination('.obsidian');
		await fixtureRelease.publish('v1', FILES);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 3 new/);
		await t.expectChange({ created: { ...under('.obsidian'), [MANIFEST]: null }, dirsCreated: dirs('.obsidian').sort() });
	});

	it('[SYNC-D10] a Destination that is a FILE: the Sync fails with a Notice, writes nothing, and leaves the note alone', async () => {
		const t = await startSyncTest();
		allowPageErrors(/compendium sync failed/);
		await createNotes({ 'Notes.md': 'my note, not a folder' });
		await t.rebase();
		await setDestination('Notes.md');
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium sync failed — ENOTDIR/);
		await noWindows();
		await t.expectChange({});
		expect(t.read('Notes.md')).toBe('my note, not a folder');
	});
});

describe('sync: after the Destination folder was changed (SC-706)', () => {
	const MINE = 'MY OWN notes about the shadow class, written by the user';
	/** One sync into "DS Compendium", then the Destination points at "Notes" (the user's folder, if `files` is given). */
	async function changedDestination(files: Record<string, string> | null) {
		const t = await startSyncTest();
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitNotice(/compendium v1 synced — 3 new/);
		if (files !== null) await createNotes(files);
		await t.rebase();
		await clearNotices();
		await setDestination('Notes');
		return t;
	}

	it('[SYNC-K12] a Sync into a CHANGED Destination never overwrites a file the plugin did not install there, and asks first if the folder holds files', async () => {
		const t = await changedDestination({ 'Notes/class/shadow.md': MINE, 'Notes/Session 1.md': 'my session notes' });
		try {
			await palette.sync();
			await waitWindow(LEGACY);
			// asked first: nothing was written into the folder, and the user's text is where they left it
			await t.expectChange({});
			expect(t.read('Notes/class/shadow.md')).toBe(MINE);
			expect(Object.values(everyText(t.base))).toContain(MINE);
			await dismiss('legacy', 'escape');
			await noWindows();
			await t.expectChange({});
		} finally {
			await setDestination('DS Compendium'); // startSyncTest also restores it for the next scenario
		}
	});

	it('[SYNC-D11] "Keep everything" on that window syncs into the folder: the colliding note keeps its bytes and the Notice says it was skipped', async () => {
		const t = await changedDestination({ 'Notes/class/shadow.md': MINE, 'Notes/Session 1.md': 'my session notes' });
		try {
			await palette.sync();
			await waitWindow(LEGACY);
			await dse.click(dse.control('sync.legacy.keep'));
			await waitNotice(/compendium v1 synced — 2 new, 0 updated, 0 removed\./);
			await waitNotice(/1 file\(s\) skipped to protect your changes/);
			await noWindows();
			await t.expectChange({
				created: { 'Notes/rule/combat/turn.md': 'turn A', 'Notes/kit/panther.md': 'panther A' },
				modified: { [MANIFEST]: null },
				dirsCreated: ['Notes/rule', 'Notes/rule/combat', 'Notes/kit'].sort(),
			});
			expect(t.read('Notes/class/shadow.md')).toBe(MINE);
			expect(t.read('Notes/Session 1.md')).toBe('my session notes');
		} finally {
			await setDestination('DS Compendium');
		}
	});

	it('[SYNC-D12] a changed Destination that is an empty folder syncs at once with no window, as a first sync would', async () => {
		const t = await changedDestination(null);
		try {
			await createFolders(['Notes']);
			await t.rebase();
			await palette.sync();
			await waitNotice(/compendium v1 synced — 3 new, 0 updated, 0 removed\./);
			await noWindows();
			await t.expectChange({
				created: { 'Notes/class/shadow.md': 'shadow A', 'Notes/rule/combat/turn.md': 'turn A', 'Notes/kit/panther.md': 'panther A' },
				modified: { [MANIFEST]: null },
				dirsCreated: ['Notes/class', 'Notes/rule', 'Notes/rule/combat', 'Notes/kit'].sort(),
			});
		} finally {
			await setDestination('DS Compendium');
		}
	});

	it('[SYNC-D13] a compendium folder RENAMED in Obsidian and set as the Destination keeps updating: the window asks once, "Keep everything" updates the changed file in place, and the next sync (same folder now) updates it again', async () => {
		const t = await startSyncTest();
		try {
			await fixtureRelease.publish('v1', RELEASE_A);
			await palette.sync();
			await waitNotice(/compendium v1 synced — 3 new/);
			await ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('${DC}'), 'Compendium'); return true; })()`);
			await t.rebase();
			await clearNotices();
			await setDestination('Compendium');
			await fixtureRelease.publish('v2', { ...RELEASE_A, 'class/shadow.md': 'shadow B' });
			await palette.sync();
			await waitWindow(LEGACY);
			await dse.click(dse.control('sync.legacy.keep'));
			await waitNotice(/compendium v2 synced — 0 new, 1 updated, 0 removed\./);
			await noWindows();
			expect((await noticeTexts()).join('\n')).not.toMatch(/skipped to protect your changes/);
			expect(t.read('Compendium/class/shadow.md')).toBe('shadow B');
			expect(JSON.parse(t.read(MANIFEST)).root).toBe('Compendium');
			await clearNotices();
			await fixtureRelease.publish('v3', { ...RELEASE_A, 'class/shadow.md': 'shadow C' });
			await palette.sync();
			await waitNotice(/compendium v3 synced — 0 new, 1 updated, 0 removed\./);
			await noWindows();
			expect(t.read('Compendium/class/shadow.md')).toBe('shadow C');
		} finally {
			await setDestination('DS Compendium');
		}
	});

	it('[SYNC-D14] a changed Destination that holds a pre-7.0.0 compendium: the Sync offers the migration, and after the run the next sync UPDATES the moved files (none skipped as the user\'s)', async () => {
		const t = await startSyncTest();
		try {
			await fixtureRelease.publish('v1', RELEASE_A);
			await palette.sync();
			await waitNotice(/compendium v1 synced — 3 new/);
			await setDestination('Legacy Compendium');
			const pairs = await seedLegacy(25, 'Legacy Compendium');
			await t.rebase();
			await clearNotices();
			await fixtureRelease.publish('v4', Object.fromEntries(pairs.map((p) => [p.newRelative, `official ${p.newRelative}`])));
			await palette.sync();
			await waitWindow(PREVIEW);
			await dse.click(dse.control('migration.preview.move'));
			await waitWindow(COMPLETE);
			await clearNotices();
			await dse.click(dse.control('migration.summary.sync-now'));
			await waitNotice(/compendium v4 synced — 0 new, 25 updated, 0 removed\./);
			expect((await noticeTexts()).join('\n')).not.toMatch(/skipped to protect your changes/);
			await noWindows();
			for (const p of pairs) expect(t.read(`Legacy Compendium/${p.newRelative}`)).toBe(`official ${p.newRelative}`);
			expect(JSON.parse(t.read(MANIFEST)).root).toBe('Legacy Compendium');
		} finally {
			await setDestination('DS Compendium');
		}
	});
});
