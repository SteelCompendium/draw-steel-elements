// SC-441 coverage check (b) for the compendium sync windows: the real-Obsidian census (method: see _census.e2e.ts, CDP event listeners). Scoped by
// CONTAINER, not by class: each window's content (`.modal-container .dse-modal .modal-content *`), in every phase, each reached the real way (the
// palette commands, a real click on "Move N file(s)", a real Stop; the error screen through a page-side `execute` that throws). Obsidian's own X and
// backdrop sit OUTSIDE `.modal-content` (host ids `modal.close` / `modal.backdrop`: allowlisted, they carry Obsidian's listeners, not ours). Anything
// inside that listens for input must carry an id of the window manifests.
// (A separate file from _census.e2e.ts, like authoring/census.e2e.ts: ids continue at CENSUS-35.)
import { expect } from '@wdio/globals';
import '../../driver/dse';
import { dse } from '../../driver/dse';
import { censusFindings, eventfulNodes } from '../../driver/census';
import { ev } from '../../driver/page';
import { allowPageErrors } from '../../driver/settingsDrive';
import {
	LEGACY, createNotes, dismiss, fixtureRelease, hold, noWindows, palette, startSyncTest, waitWindow,
} from '../../driver/sync';
import { DC, legacyFixture, reachError, reachPreview, reachRunning, reachStopped, reachSummary } from '../../driver/syncMigration';
import { idsOf } from '../../manifest/surface';
import legacyManifest, { VIRTUAL_IDS as LEGACY_VIRTUAL, HOST_IDS as LEGACY_HOST } from '../../manifest/sync-legacy-window';
import migrationManifest, { VIRTUAL_IDS as MIGRATION_VIRTUAL, HOST_IDS as MIGRATION_HOST } from '../../manifest/sync-migration-window';

const IDS = new Set([...idsOf(legacyManifest), ...idsOf(migrationManifest)].filter((id) => ![...LEGACY_VIRTUAL, ...MIGRATION_VIRTUAL, ...LEGACY_HOST, ...MIGRATION_HOST].includes(id)));
const SCOPE = ['.modal-container .dse-modal .modal-content *'];
const RELEASE_A = { 'class/shadow.md': 'shadow A' };

/** Scan the open window, assert no finding, and that the probe saw exactly the controls of this phase (a probe that sees nothing proves nothing). */
async function scan(expectIds: string[]): Promise<void> {
	const nodes = await eventfulNodes(SCOPE, null);
	expect(censusFindings(nodes, IDS)).toEqual([]);
	const ids = nodes.map((n) => n.id).filter((id): id is string => id !== null);
	for (const id of expectIds) expect(ids).toContain(id);
}

describe('real-Obsidian census: the compendium sync windows (SC-441)', () => {
	it('[CENSUS-35] the open "Existing compendium folder found" window: every node that listens for input is an identified control', async () => {
		await startSyncTest();
		await createNotes({ [`${DC}/old-download.md`]: 'from an older plugin' });
		await fixtureRelease.publish('v1', RELEASE_A);
		await palette.sync();
		await waitWindow(LEGACY);
		await scan(['sync.legacy.keep', 'sync.legacy.trash']);
		await dismiss('legacy', 'x');
		await noWindows();
	});

	it('[CENSUS-36] the migration PREVIEW: every node that listens for input is an identified control', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		await reachPreview();
		await scan(['migration.preview.not-now', 'migration.preview.sync-anyway', 'migration.preview.move']);
		await dismiss('preview', 'x');
		await noWindows();
	});

	it('[CENSUS-37] the RUNNING phase (the run held at its 3rd move): the Stop button is an identified control', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		await reachRunning(2);
		await scan(['migration.running.stop']);
		await dse.click(dse.control('migration.running.stop'));
		await scan(['migration.running.stop']); // "Stopping…": the same node, still identified
		await hold.release();
		await waitWindow('Migration stopped');
		await dismiss('stopped', 'x');
		await noWindows();
	});

	it('[CENSUS-38] the SUMMARY of a complete run with every path list drawn (closed, then every list opened): every node that listens for input is an identified control', async () => {
		const t = await startSyncTest();
		const f = await legacyFixture(t, 25, (pairs) => ({ [`${DC}/${pairs[3].newRelative}`]: 'parked on a 7.0.0 path' }));
		await hold.failRename(f.pairs[5].newRelative);
		await reachSummary();
		const lists = ['backed-up', 'moved-modified', 'blocked', 'failed', 'unmapped'].map((l) => `migration.list.${l}`);
		await scan([...lists, 'migration.summary.close', 'migration.summary.sync-now']);
		for (const id of lists) await ev(`document.querySelector('[data-dse-control="${id}"]').click()`); // open them (the page-side click is setup, not a drive)
		await scan([...lists, 'migration.summary.close', 'migration.summary.sync-now']);
		await dismiss('summary', 'x');
		await noWindows();
	});

	it('[CENSUS-39] the STOPPED summary (a real Stop at the held 4th move): every node that listens for input is an identified control', async () => {
		const t = await startSyncTest();
		await legacyFixture(t);
		await reachStopped(3);
		await scan(['migration.list.backed-up', 'migration.stopped.close', 'migration.stopped.finish']);
		await dismiss('stopped', 'x');
		await noWindows();
	});

	it('[CENSUS-40] the ERROR screen: its Close button is an identified control', async () => {
		const t = await startSyncTest();
		allowPageErrors(/the compendium migration failed/); // the window's `failed` callback logs the error by design
		await legacyFixture(t);
		await reachError();
		await scan(['migration.error.close']);
		await dismiss('error', 'x');
		await noWindows();
	});
});
