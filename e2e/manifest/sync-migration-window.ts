// The pre-7.0.0 migration window (src/views/CompendiumMigrationModal.ts), opened by `plugin.offerMigration()`: on the first sync of a legacy
// compendium folder (and on every later sync while a declined or stopped migration is owed), and by the palette command "Migrate compendium
// from the pre-7.0.0 layout" at any time (SC-441). It MOVES files (`fileManager.renameFile`, so Obsidian rewrites the links in the user's notes),
// copies every modified or unknown file to a backup folder first, writes a report note, and never deletes. One dialog, five phases; each
// phase's buttons get their own ids because the buttons differ:
//   PREVIEW   "Not now", "Sync without moving", "Move N file(s)" (the number is in the label, not in the id)
//   RUNNING   "Stop" (becomes the disabled "Stopping…" once pressed: `click-disabled`)
//   SUMMARY   after a COMPLETE run: "Close", "Sync the compendium now"
//   STOPPED   after a STOPPED run: "Close", "Finish moving the remaining N" (the number is in the label, not in the id)
//   ERROR     the run threw: "Close"
// and, in both summaries, the collapsible per-path lists (one disclosure button per non-empty list: backed up, moved-but-modified, blocked,
// failed, left in place). The lists draw only when non-empty and start collapsed.
// Obsidian draws the X and the backdrop (host ids `modal.close` / `modal.backdrop`, credited when a spec really clicks them). Closing without
// a button is an ANSWER here (the header of the source file states the rule): at the PREVIEW it declines, mid-run it stops the run and delivers the
// report, after a run it reports the dismissal, from the ERROR screen it closes quietly. It never syncs.
// ENTRY POINTS (not re-declared here: each control is owned by the manifest named, and the SYNC-M scenarios drive it THROUGH this window):
//   - `settings.compendium.sync` (settings-tab.ts, SC-440) and `authoring.search.sync` (authoring-search.ts, SC-443): a first Sync of a legacy
//     folder, or a Sync while the migration is owed, opens THIS window instead of syncing;
//   - `sync.cmd.sync-compendium` and `sync.cmd.migrate-compendium-layout` (sync-commands.ts).
// Kinds: `click`, and `press:Enter` / `press:Space` on the focused button (a native button is activated by either key). `click-disabled` on
// Stop once it reads "Stopping…" (a click on a disabled button does nothing). The "Move 0 file(s)" disabled state exists in the source but is
// unreachable on screen (the window is never opened for a plan with nothing to move: the plugin shows a Notice instead), so it is a jest
// pin (compendium-migration-modal.test.ts), not a pair. Dismissals are VIRTUAL ids (no DOM node of ours; the id names which phase was
// dismissed, so the gate demands each one separately): `press:Escape`, `click:X`, `click:Backdrop`.
// `rows` cite the SC-441 scenario groups: M the migration window (`SYNC-M<nn>`), R re-runs with nothing to do (`SYNC-R<nn>`); specs in e2e/specs/sync/.
import { c, surface } from './surface';

/** Ids with no DOM node of ours: the census skips them, the driver credits them after the real dismissal happened. */
export const VIRTUAL_IDS: readonly string[] = [
	'migration.preview.dismiss',
	'migration.running.dismiss',
	'migration.summary.dismiss',
	'migration.stopped.dismiss',
	'migration.error.dismiss',
];

const KEYS = ['click', 'press:Enter', 'press:Space'] as const;
const DISMISS = ['press:Escape', 'click:X', 'click:Backdrop'] as const;

export default surface('sync-migration-window', {
	controls: {
		// -- PREVIEW
		'migration.preview.not-now': c(KEYS, ['M']),
		'migration.preview.sync-anyway': c(KEYS, ['M']),
		'migration.preview.move': c(KEYS, ['M']),
		'migration.preview.dismiss': c(DISMISS, ['M']),

		// -- RUNNING
		'migration.running.stop': c([...KEYS, 'click-disabled'], ['M']),
		'migration.running.dismiss': c(DISMISS, ['M']),

		// -- SUMMARY after a complete run
		'migration.summary.close': c(KEYS, ['M', 'R']),
		'migration.summary.sync-now': c(KEYS, ['M', 'R']),
		'migration.summary.dismiss': c(DISMISS, ['M']),

		// -- STOPPED: the summary after a stopped run
		'migration.stopped.close': c(KEYS, ['M']),
		'migration.stopped.finish': c(KEYS, ['M', 'R']),
		'migration.stopped.dismiss': c(DISMISS, ['M']),

		// -- ERROR: the run threw
		'migration.error.close': c(KEYS, ['M']),
		'migration.error.dismiss': c(DISMISS, ['M']),

		// -- The per-path lists in either summary (a disclosure button each)
		'migration.list.backed-up': c(KEYS, ['M']),
		'migration.list.moved-modified': c(KEYS, ['M']),
		'migration.list.blocked': c(KEYS, ['M']),
		'migration.list.failed': c(KEYS, ['M']),
		'migration.list.unmapped': c(KEYS, ['M']),
	},
});
