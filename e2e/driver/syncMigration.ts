// SC-441 e2e driver: the migration window's fixtures and the ways to REACH each of its phases with real input (ledger O7). Builds on driver/sync.ts.
//   preview  : the palette's "Migrate compendium from the pre-7.0.0 layout" (or a first Sync of a legacy folder) opens it
//   running  : a click on "Move N file(s)" with a page-side hold on the n-th rename, so the run is still going when the spec acts
//   summary  : the run finished (complete)
//   stopped  : a REAL click on Stop while the hold is on, then the hold is released
//   error    : the engine's `execute` is replaced page-side by one that throws (the engine swallows its own bookkeeping errors, so no real input reaches it)
import { dse } from './dse';
import { ev } from './page';
import {
	COMPLETE, ERROR, PREVIEW, RUNNING, STOPPED, createNotes, fixtureRelease, hold, palette, seedLegacy, waitWindow,
} from './sync';
import type { Expect, LegacyPair, SyncTest } from './sync';

export const DC = 'DS Compendium';
export const BACKUP = `${DC} backup (pre-7.0.0)`;
export const USER_IN = `${DC}/My own note.md`;
export const USER_OUT = 'Journal.md';
export const N = 25;

export interface Fixture {
	pairs: LegacyPair[];
	/** The moved file the user's outside note links to, and the link text. */
	linked: LegacyPair;
	journal: string;
}

/** Basename of a vault path without the extension. */
export const stem = (p: string): string => (p.split('/').pop() as string).replace(/\.md$/, '');

/**
 * 25 files at pre-7.0.0 paths of the shipped map, a note of the user's own inside the folder (no mapping: left alone), and an outside note that links
 * to one moved file. The outside note's link must RESOLVE before the run (Obsidian rewrites links it has resolved), so this waits for the cache.
 */
export async function legacyFixture(t: SyncTest, count = N): Promise<Fixture> {
	const pairs = await seedLegacy(count);
	const stems = pairs.map((p) => stem(p.oldRelative));
	const linked = pairs.find((p) => stems.filter((s) => s === stem(p.oldRelative)).length === 1) as LegacyPair;
	const journal = `Intro line, untouched.\nSee [[${stem(linked.oldRelative)}]] for the details.\nOutro line, untouched.`;
	await createNotes({ [USER_IN]: 'the user\'s own note inside the compendium folder, no 7.0.0 counterpart', [USER_OUT]: journal });
	await ev(`new Promise((resolve) => { const t = setInterval(() => { const r = app.metadataCache.resolvedLinks[${JSON.stringify(USER_OUT)}] ?? {}; if (r[${JSON.stringify(`${DC}/${linked.oldRelative}`)}]) { clearInterval(t); resolve(true); } }, 25); })`);
	await t.rebase();
	return { pairs, linked, journal };
}

/** A release that holds every pair's new path with the "official" text, tagged `v4` (what a sync after the move installs). */
export const publishNewTree = (pairs: LegacyPair[], tag = 'v4'): Promise<void> =>
	fixtureRelease.publish(tag, Object.fromEntries(pairs.map((p) => [p.newRelative, `official ${p.newRelative}`])));

/** The difference a COMPLETE run makes: every file moved, every non-pristine file copied to the backup folder, a report note, the two state files. */
export function completeRun(t: SyncTest, f: Fixture, over: { moved?: LegacyPair[]; backedUp?: LegacyPair[]; manifest?: boolean } = {}): Expect {
	const moved = over.moved ?? f.pairs;
	const backedUp = over.backedUp ?? moved;
	const backups = Object.fromEntries(backedUp.map((p) => [`${BACKUP}/${p.oldRelative}`, p.content]));
	return {
		moved: Object.fromEntries(moved.map((p) => [`${DC}/${p.oldRelative}`, `${DC}/${p.newRelative}`])),
		created: { ...backups, '.obsidian/plugins/draw-steel-elements/compendium-migration-state.json': null, ...(over.manifest === false ? {} : { '.obsidian/plugins/draw-steel-elements/compendium-manifest.json': null }) },
		createdMatching: [/^Draw Steel Elements migration report \d{4}-\d{2}-\d{2} \d{4}( \(\d+\))?\.md$/],
		dirsCreated: t.dirsFor([...moved.map((p) => `${DC}/${p.newRelative}`), ...Object.keys(backups)]),
		// the journal note's link is rewritten by Obsidian when "Automatically update internal links" is on: callers add `modified` for it
	};
}

/** Open the preview through the palette's Migrate command. */
export async function reachPreview(): Promise<void> {
	await palette.migrate();
	await waitWindow(PREVIEW);
}
/** Preview, then a REAL click on "Move N file(s)" with the run held at the n-th rename; returns once the engine is held there. */
export async function reachRunning(holdAt: number): Promise<void> {
	await reachPreview();
	await hold.renames(holdAt);
	await dse.click(dse.control('migration.preview.move'));
	await waitWindow(RUNNING);
	await hold.waitHeld();
}
/** A complete run, left on its summary. */
export async function reachSummary(): Promise<void> {
	await reachPreview();
	await dse.click(dse.control('migration.preview.move'));
	await waitWindow(COMPLETE);
}
/** A run stopped by a real click on Stop while held at the n-th rename (the one in flight finishes), left on the "Migration stopped" summary. */
export async function reachStopped(holdAt = 3): Promise<void> {
	await reachRunning(holdAt);
	await dse.click(dse.control('migration.running.stop'));
	await hold.release();
	await waitWindow(STOPPED);
}
/** The engine throws: the run's error screen. */
export async function reachError(): Promise<void> {
	await reachPreview();
	await ev(`(() => { app.plugins.plugins['draw-steel-elements'].migrationService.execute = async () => { throw new Error('e2e: vault write refused'); }; return true; })()`);
	await dse.click(dse.control('migration.preview.move'));
	await waitWindow(ERROR);
}
