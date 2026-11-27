// SC-441: the migration window while it RUNS, after a Stop, and on its error screen, in real Obsidian. A run of 25 files takes milliseconds, so a page-side
// hold parks the engine on the n-th move (or backup copy); the Stop, the Escape, the X and the click outside are REAL input, and the held file finishes
// when the hold is released (the engine stops "after the file in flight"). Every scenario asserts the whole tree: every source is at exactly one of its two
// paths with its bytes, every moved file has its backup (taken first), and nothing else changed.
//   M the window in its phases · R finishing the remainder and the re-run with nothing to do
import { expect } from '@wdio/globals';
import '../../driver/dse';
import { dse } from '../../driver/dse';
import { ev } from '../../driver/page';
import { allowPageErrors } from '../../driver/settingsDrive';
import {
	COMPLETE, PREVIEW, RUNNING, STATE, STOPPED, dismiss, enterOn, fixtureRelease, hold, noWindows, noticeTexts, palette, startSyncTest, waitNotice, waitWindow, windows,
} from '../../driver/sync';
import { BACKUP, DC, N, USER_OUT, completeRun, legacyFixture, planOrder, reachError, reachPreview, reachRunning, reachStopped } from '../../driver/syncMigration';

const clearNotices = (): Promise<unknown> => ev(`(document.querySelectorAll('.notice').forEach((n) => n.click()), true)`);
const MANIFEST_KEY = '.obsidian/plugins/draw-steel-elements/compendium-manifest.json';
/** A destructive or moving button must never hold the focus when a window opens (ledger O15). */
const MOVES_FILES = ['migration.preview.move', 'migration.preview.sync-anyway', 'migration.summary.sync-now', 'migration.stopped.finish', 'sync.legacy.trash'];

describe('migration window: running and Stop', () => {
	it('[SYNC-M10] a click on Stop while the run is held at the 4th move: it reads "Stopping…" and is disabled (a second click does nothing), the file in flight finishes, the rest stays put, the summary offers "Finish moving the remaining 21"', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await reachRunning(3);
		const [w] = await windows();
		console.log(`SYNC-FOCUS running: ${w.focus}`);
		expect(MOVES_FILES).not.toContain(w.focus);
		expect(w.buttons.map((b) => [b.id, b.disabled])).toEqual([['migration.running.stop', false]]);
		await dse.click(dse.control('migration.running.stop'));
		expect((await windows())[0].buttons).toEqual([{ id: 'migration.running.stop', label: 'Stopping…', disabled: true }]);
		await dse.click(dse.control('migration.running.stop')); // disabled: nothing happens (credits click-disabled)
		await hold.release();
		const w2 = await waitWindow(STOPPED);
		console.log(`SYNC-FOCUS stopped: ${w2.focus}`);
		expect(MOVES_FILES).not.toContain(w2.focus);
		expect(w2.buttons.map((b) => b.id)).toEqual(['migration.stopped.close', 'migration.stopped.finish']);
		expect(w2.buttons[1].label).toBe(`Finish moving the remaining ${N - 4}`);
		const moved = planOrder(f.pairs).slice(0, 4);
		await t.expectChange(completeRun(t, f, { moved, backedUp: f.pairs }));
		expect(JSON.parse(t.read(STATE))).toMatchObject({ incomplete: true });
		await noWindows().catch(() => dismiss('stopped', 'x'));
	});

	it('[SYNC-M11] Enter on Stop (Tab to it) stops the run the same way', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await reachRunning(5);
		await enterOn('migration.running.stop');
		await hold.release();
		await waitWindow(STOPPED);
		await t.expectChange(completeRun(t, f, { moved: planOrder(f.pairs).slice(0, 6), backedUp: f.pairs }));
		await dismiss('stopped', 'x');
		await noWindows();
	});

	it('[SYNC-M12] a Stop during the BACKUP phase moves nothing: the copies already taken stay, no file is renamed, the state says incomplete', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await reachPreview();
		await hold.backups(3);
		await dse.click(dse.control('migration.preview.move'));
		await waitWindow(RUNNING);
		await hold.waitHeld();
		await dse.click(dse.control('migration.running.stop'));
		await hold.release();
		await waitWindow(STOPPED);
		const copied = planOrder(f.pairs).slice(0, 4); // the 4th copy was in flight
		await t.expectChange(completeRun(t, f, { moved: [], backedUp: copied }));
		expect(JSON.parse(t.read(STATE))).toMatchObject({ incomplete: true });
		await dismiss('stopped', 'x');
		await noWindows();
	});

	/** The body shared by M13..M15: a dismissal in the middle of a run stops it after the file in flight; nothing is synced. */
	async function dismissWhileRunning(way: 'escape' | 'x' | 'backdrop'): Promise<void> {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await publishNothing();
		await reachRunning(2);
		await clearNotices();
		await dismiss('running', way);
		await noWindows();
		await hold.release();
		await waitNotice(/stopped after moving 3 file\(s\); 22 still to go/);
		const all = (await noticeTexts()).join(' | ');
		console.log(`SYNC-OBSERVED notices after a ${way} mid-run: ${all}`);
		await t.expectChange(completeRun(t, f, { moved: planOrder(f.pairs).slice(0, 3), backedUp: f.pairs }));
		expect(JSON.parse(t.read(STATE))).toMatchObject({ incomplete: true });
		expect(await fixtureRelease.calls()).toEqual([]);
	}
	const publishNothing = (): Promise<void> => fixtureRelease.publish('v4', { 'x.md': 'x' });
	it('[SYNC-M13] Escape in the middle of a run stops it after the file in flight, writes the report, syncs nothing', () => dismissWhileRunning('escape'));
	it('[SYNC-M14] the X in the middle of a run does the same', () => dismissWhileRunning('x'));
	it('[SYNC-M15] a click outside the window in the middle of a run does the same', () => dismissWhileRunning('backdrop'));
});

describe('migration window: after a Stop', () => {
	/** A stopped run on screen (4 files moved, 21 left) plus the tree at that moment. */
	async function stopped() {
		const t = await startSyncTest();
		const f = await legacyFixture(t);
		await reachStopped(3);
		const afterStop = await t.settled();
		await clearNotices();
		return { t, f, afterStop };
	}
	const STOPPED_NOTICE = /stopped after moving 4 file\(s\); 21 still to go/;

	it('[SYNC-M16] a click on Close reports the stop in a Notice and changes nothing more: no sync, the 21 are still owed', async () => {
		const { t, afterStop } = await stopped();
		await dse.click(dse.control('migration.stopped.close'));
		await waitNotice(STOPPED_NOTICE);
		await noWindows();
		await t.expectSince(afterStop, {});
		expect(await fixtureRelease.calls()).toEqual([]);
		expect(JSON.parse(t.read(STATE))).toMatchObject({ incomplete: true });
	});

	it('[SYNC-M17] Enter on Close (Tab to it) does the same', async () => {
		const { t, afterStop } = await stopped();
		await enterOn('migration.stopped.close');
		await waitNotice(STOPPED_NOTICE);
		await noWindows();
		await t.expectSince(afterStop, {});
	});

	it('[SYNC-M18] a click on "Finish moving the remaining 21" offers a fresh preview for exactly those 21; moving them completes the migration (21 more moves, a second backup folder, a second report), and nothing moved twice', async () => {
		const { t, f, afterStop } = await stopped();
		await dse.click(dse.control('migration.stopped.finish'));
		const preview = await waitWindow(PREVIEW);
		expect(preview.buttons[2].label).toBe(`Move ${N - 4} file(s)`);
		await t.expectSince(afterStop, {});
		await dse.click(dse.control('migration.preview.move'));
		await waitWindow(COMPLETE);
		const rest = planOrder(f.pairs).slice(4);
		const after = await t.expectSince(afterStop, {
			moved: Object.fromEntries(rest.map((p) => [`${DC}/${p.oldRelative}`, `${DC}/${p.newRelative}`])),
			created: Object.fromEntries(rest.map((p) => [`${BACKUP} (2)/${p.oldRelative}`, p.content])),
			// the note's name carries the MINUTE: ` (2)` is added only when the first run's note has the same minute, so a run that crosses a minute has none
			createdMatching: [/^Draw Steel Elements migration report \d{4}-\d{2}-\d{2} \d{4}( \(2\))?\.md$/],
			modified: { [STATE]: null, [MANIFEST_KEY]: null, ...(rest.some((p) => p.oldRelative === f.linked.oldRelative) ? { [USER_OUT]: null } : {}) },
			dirsCreated: t.dirsFor([...rest.map((p) => `${DC}/${p.newRelative}`), ...rest.map((p) => `${BACKUP} (2)/${p.oldRelative}`)]).filter((d) => !afterStop.dirs.includes(d)),
		});
		for (const p of f.pairs) {
			expect(`${DC}/${p.newRelative}` in after.files).toBe(true);
			expect(`${DC}/${p.oldRelative}` in after.files).toBe(false);
		}
		expect(JSON.parse(t.read(STATE))).toMatchObject({ incomplete: false });
		await dismiss('summary', 'x');
		await noWindows();
	});

	it('[SYNC-M19] Enter on "Finish moving the remaining 21" (Tab to it) opens the same fresh preview, moves nothing by itself, and leaving that preview records the decline', async () => {
		const { t, afterStop } = await stopped();
		await enterOn('migration.stopped.finish');
		const preview = await waitWindow(PREVIEW);
		expect(preview.focus).toBe('migration.preview.not-now');
		await t.expectSince(afterStop, {});
		await dismiss('preview', 'escape');
		await noWindows();
		await t.expectSince(afterStop, { modified: { [STATE]: null } });
		expect(JSON.parse(t.read(STATE))).toMatchObject({ declined: true });
	});

	/** The body shared by M20..M22: leaving the stopped summary by a dismissal reports the stop and changes nothing. */
	async function leaveStopped(way: 'escape' | 'x' | 'backdrop'): Promise<void> {
		const { t, afterStop } = await stopped();
		await dismiss('stopped', way);
		await waitNotice(STOPPED_NOTICE);
		await noWindows();
		await t.expectSince(afterStop, {});
		expect(await fixtureRelease.calls()).toEqual([]);
	}
	it('[SYNC-M20] Escape at the stopped summary reports the stop and changes nothing', () => leaveStopped('escape'));
	it('[SYNC-M21] the X at the stopped summary does the same', () => leaveStopped('x'));
	it('[SYNC-M22] a click outside the stopped summary does the same', () => leaveStopped('backdrop'));

	it('[SYNC-R04] after the remainder is finished the Migrate command has nothing to do: a Notice, no window, no change', async () => {
		const { t } = await stopped();
		await dse.click(dse.control('migration.stopped.finish'));
		await waitWindow(PREVIEW);
		await dse.click(dse.control('migration.preview.move'));
		await waitWindow(COMPLETE);
		await dse.click(dse.control('migration.summary.close'));
		await noWindows();
		const done = await t.settled();
		await clearNotices();
		await palette.migrate();
		await waitNotice(/nothing to migrate — no pre-7\.0\.0 compendium files found\./);
		await noWindows();
		await t.expectSince(done, {});
	});
});

describe('migration window: the error screen', () => {
	const FAILED = /the compendium migration stopped on an error — e2e: vault write refused/;
	async function errorScreen() {
		const t = await startSyncTest();
		allowPageErrors(/the compendium migration failed/); // the window's `failed` callback logs the error by design
		await legacyFixture(t);
		await reachError();
		const w = (await windows())[0];
		console.log(`SYNC-FOCUS error: ${w.focus}`);
		expect(MOVES_FILES).not.toContain(w.focus);
		expect(w.buttons.map((b) => b.id)).toEqual(['migration.error.close']);
		await waitNotice(FAILED);
		return t;
	}
	it('[SYNC-M23] a run that throws shows "Migration could not finish" with a Close button; Close closes it quietly: no sync, no decline, nothing changed', async () => {
		const t = await errorScreen();
		await dse.click(dse.control('migration.error.close'));
		await noWindows();
		await t.expectChange({});
		expect((await noticeTexts()).join('\n')).not.toMatch(/left as it is/);
		expect(await fixtureRelease.calls()).toEqual([]);
	});
	it('[SYNC-M24] Enter on Close (Tab to it) does the same', async () => {
		const t = await errorScreen();
		await enterOn('migration.error.close');
		await noWindows();
		await t.expectChange({});
	});
	/** The body shared by M25..M27: leaving the error screen by a dismissal is quiet too (the error was already reported). */
	async function leaveError(way: 'escape' | 'x' | 'backdrop'): Promise<void> {
		const t = await errorScreen();
		await dismiss('error', way);
		await noWindows();
		await t.expectChange({});
		expect((await noticeTexts()).join('\n')).not.toMatch(/left as it is|stopped after moving/);
	}
	it('[SYNC-M25] Escape at the error screen closes it quietly', () => leaveError('escape'));
	it('[SYNC-M26] the X at the error screen closes it quietly', () => leaveError('x'));
	it('[SYNC-M27] a click outside the error screen closes it quietly', () => leaveError('backdrop'));
});
