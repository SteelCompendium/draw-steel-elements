// SC-441: the migration window's SUMMARY after a complete run, its path lists, what Obsidian does to the user's links (both settings of "Automatically
// update internal links"), and the re-runs, in real Obsidian. The run is real (25 files at real pre-7.0.0 paths, each backed up, moved, reported); every
// scenario asserts the whole tree. A sync after the move installs the "official" text over the moved files in place (they are the plugin's now).
//   M the summary and its buttons · L links · R re-runs
import { expect } from '@wdio/globals';
import '../../driver/dse';
import { dse } from '../../driver/dse';
import { ev } from '../../driver/page';
import { COMPLETE, MANIFEST, dismiss, enterOn, fixtureRelease, hold, noWindows, noticeTexts, palette, startSyncTest, waitNotice, waitWindow, windows } from '../../driver/sync';
import { DC, N, USER_IN, USER_OUT, completeRun, legacyFixture, publishNewTree, reachSummary, stem } from '../../driver/syncMigration';
import type { Fixture } from '../../driver/syncMigration';
import type { SyncTest, Tree } from '../../driver/sync';

const clearNotices = (): Promise<unknown> => ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
const MOVED_NOTICE = new RegExp(`${N} compendium file\\(s\\) moved to the 7\\.0\\.0 layout`);
const MOVES_FILES = ['migration.preview.move', 'migration.preview.sync-anyway', 'migration.summary.sync-now', 'migration.stopped.finish', 'sync.legacy.trash'];

/** A complete run on screen as its summary, plus the tree at that moment. */
async function summary(opts: { updateLinks?: boolean } = {}): Promise<{ t: SyncTest; f: Fixture; afterRun: Tree }> {
	const t = await startSyncTest(opts);
	const f = await legacyFixture(t);
	await publishNewTree(f.pairs);
	await reachSummary();
	const afterRun = await t.settled();
	await clearNotices();
	return { t, f, afterRun };
}
const newPaths = (f: Fixture): Record<string, string> => Object.fromEntries(f.pairs.map((p) => [`${DC}/${p.newRelative}`, `official ${p.newRelative}`]));

describe('migration window: the summary after a complete run', () => {
	it('[SYNC-M30] a click on Close reports the move in a Notice and changes nothing more; the run itself moved all 25, backed each up, wrote the report and updated the outside note\'s link', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await publishNewTree(f.pairs);
		await reachSummary();
		const w = (await windows())[0];
		console.log(`SYNC-FOCUS summary: ${w.focus}`);
		expect(MOVES_FILES).not.toContain(w.focus);
		expect(w.buttons.map((b) => b.id)).toEqual(['migration.summary.close', 'migration.summary.sync-now']);
		const afterRun = await t.expectChange(completeRun(t, f));
		await dse.click(dse.control('migration.summary.close'));
		await waitNotice(MOVED_NOTICE);
		await noWindows();
		await t.expectSince(afterRun, {});
		expect(await fixtureRelease.calls()).toEqual([]);
		expect(JSON.parse(t.read('.obsidian/plugins/draw-steel-elements/compendium-migration-state.json'))).toMatchObject({ declined: false, incomplete: false });
		expect(t.read(USER_IN)).toContain('the user\'s own note');
	});

	it('[SYNC-M31] Enter on Close (Tab to it) does the same', async () => {
		const { t, afterRun } = await summary();
		await enterOn('migration.summary.close');
		await waitNotice(MOVED_NOTICE);
		await noWindows();
		await t.expectSince(afterRun, {});
		expect(await fixtureRelease.calls()).toEqual([]);
	});

	it('[SYNC-M32] a click on "Sync the compendium now" syncs the release: the 25 moved files are UPDATED in place to the official text (not skipped as the user\'s), the user\'s notes are untouched', async () => {
		const { t, f, afterRun } = await summary();
		await dse.click(dse.control('migration.summary.sync-now'));
		await waitNotice(new RegExp(`compendium v4 synced — 0 new, ${N} updated, 0 removed\\.`));
		await noWindows();
		await t.expectSince(afterRun, { modified: { ...newPaths(f), [MANIFEST]: null } });
		expect(JSON.parse(t.read(MANIFEST)).releaseTag).toBe('v4');
		expect(t.read(USER_IN)).toContain('the user\'s own note');
		expect((await noticeTexts()).join('\n')).toMatch(MOVED_NOTICE);
	});

	it('[SYNC-M33] Enter on "Sync the compendium now" (Tab to it) does the same sync', async () => {
		const { t, f, afterRun } = await summary();
		await enterOn('migration.summary.sync-now');
		await waitNotice(new RegExp(`compendium v4 synced — 0 new, ${N} updated`));
		await noWindows();
		await t.expectSince(afterRun, { modified: { ...newPaths(f), [MANIFEST]: null } });
	});

	/** The body shared by M34..M36: leaving the summary by a dismissal reports the move and changes nothing. */
	async function leave(way: 'escape' | 'x' | 'backdrop'): Promise<void> {
		const { t, afterRun } = await summary();
		await dismiss('summary', way);
		await waitNotice(MOVED_NOTICE);
		await noWindows();
		await t.expectSince(afterRun, {});
		expect(await fixtureRelease.calls()).toEqual([]);
	}
	it('[SYNC-M34] Escape at the summary reports the move and changes nothing (never a sync)', () => leave('escape'));
	it('[SYNC-M35] the X at the summary does the same', () => leave('x'));
	it('[SYNC-M36] a click outside the summary does the same', () => leave('backdrop'));

	it('[SYNC-M37] the five path lists (backed up, moved but different, not moved, failed, left in place) are collapsed disclosure buttons that open on a click and shut on Enter, and fire nothing', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t, N, (pairs) => ({ [`${DC}/${pairs[3].newRelative}`]: 'the user\'s file parked on a 7.0.0 path' }));
		const blocked = f.pairs[3];
		const failed = f.pairs[5];
		await hold.failRename(failed.newRelative);
		await publishNewTree(f.pairs);
		await reachSummary();
		const moved = f.pairs.filter((p) => p !== blocked && p !== failed);
		const afterRun = await t.expectChange(completeRun(t, f, { moved, backedUp: f.pairs.filter((p) => p !== blocked), extraDirsFor: [`${DC}/${failed.newRelative}`] }));
		expect(t.read(`${DC}/${blocked.newRelative}`)).toBe('the user\'s file parked on a 7.0.0 path');
		expect(t.read(`${DC}/${blocked.oldRelative}`)).toBe(blocked.content);
		expect(t.read(`${DC}/${failed.oldRelative}`)).toBe(failed.content);
		for (const id of ['backed-up', 'moved-modified', 'blocked', 'failed', 'unmapped']) {
			const sel = `[data-dse-control="migration.list.${id}"]`;
			expect(await dse.page<boolean>(`!!document.querySelector('${sel}')`)).toBe(true);
			const open = (): Promise<string> => dse.page<string>(`document.querySelector('${sel}').getAttribute('aria-expanded')`);
			expect(await open()).toBe('false');
			await dse.click(dse.control(`migration.list.${id}`));
			expect(await open()).toBe('true');
			expect(await dse.page<boolean>(`!document.querySelector('${sel}').parentElement.querySelector('.dse-collapse__region').hidden`)).toBe(true);
			await dse.press('Enter', dse.control(`migration.list.${id}`));
			expect(await open()).toBe('false');
		}
		await t.expectSince(afterRun, {});
		expect((await windows())[0].title).toBe(COMPLETE);
		await dismiss('summary', 'x');
		await noWindows();
	});
});

describe('migration window: what happens to the user\'s links', () => {
	it('[SYNC-L01] with "Automatically update internal links" ON, Obsidian rewrites the one link to a moved file and nothing else in the outside note changes', async () => {
		const t = await startSyncTest({ updateLinks: true });
		const f = await legacyFixture(t);
		await reachSummary();
		await t.expectChange(completeRun(t, f));
		const after = t.read(USER_OUT).split('\n');
		const before = f.journal.split('\n');
		console.log(`SYNC-OBSERVED links ON: ${JSON.stringify(after[1])}`);
		expect(after).toHaveLength(3);
		expect(after[0]).toBe(before[0]);
		expect(after[2]).toBe(before[2]);
		expect(after[1]).not.toBe(before[1]);
		expect(after[1]).toContain(stem(f.linked.newRelative));
		expect(after[1]).toMatch(/^See \[\[.+\]\] for the details\.$/);
		const resolved = await ev<string[]>(`Object.keys(app.metadataCache.resolvedLinks[${JSON.stringify(USER_OUT)}] ?? {})`);
		expect(resolved).toEqual([`${DC}/${f.linked.newRelative}`]);
		await dismiss('summary', 'x');
		await noWindows();
	});

	it('[SYNC-L02] with "Automatically update internal links" OFF the move still happens and the window still says "links updated by Obsidian": what the note and the link cache hold is recorded', async () => {
		const t = await startSyncTest({ updateLinks: false });
		const f = await legacyFixture(t);
		await reachSummary();
		const body = await dse.page<string>(`document.querySelector('.modal-container .dse-modal__body').textContent`);
		await t.expectChange(completeRun(t, f, { links: false }));
		const resolved = await ev<string[]>(`Object.keys(app.metadataCache.resolvedLinks[${JSON.stringify(USER_OUT)}] ?? {})`);
		const unresolved = await ev<string[]>(`Object.keys(app.metadataCache.unresolvedLinks[${JSON.stringify(USER_OUT)}] ?? {})`);
		console.log(`SYNC-OBSERVED links OFF: note ${JSON.stringify(t.read(USER_OUT))}; resolved ${JSON.stringify(resolved)}; unresolved ${JSON.stringify(unresolved)}; window says "links updated by Obsidian": ${/links updated by Obsidian/.test(body)}`);
		expect(t.read(USER_OUT)).toBe(f.journal); // recorded: Obsidian leaves the note alone
		await dismiss('summary', 'x');
		await noWindows();
	});
});

describe('migration window: re-runs', () => {
	it('[SYNC-R05] after a complete migration the Sync command is a plain sync (no window): the moved files are updated in place, and a Migrate command afterwards has nothing to do', async () => {
		const { t, f, afterRun } = await summary();
		await dse.click(dse.control('migration.summary.close'));
		await waitNotice(MOVED_NOTICE);
		await noWindows();
		await clearNotices();
		await palette.sync();
		await waitNotice(new RegExp(`compendium v4 synced — 0 new, ${N} updated, 0 removed\\.`));
		await noWindows();
		const synced = await t.expectSince(afterRun, { modified: { ...newPaths(f), [MANIFEST]: null } });
		expect(JSON.parse(t.read(MANIFEST)).releaseTag).toBe('v4');
		await clearNotices();
		await palette.migrate();
		await waitNotice(/nothing to migrate — no pre-7\.0\.0 compendium files found\./);
		await noWindows();
		await t.expectSince(synced, {});
	});
});
