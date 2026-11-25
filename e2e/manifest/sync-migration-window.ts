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
// Closing without a button is an ANSWER here (the header of the source file states the rule): at the PREVIEW it declines, mid-run it stops the run and
// delivers the report, after a run it reports the dismissal, from the ERROR screen it closes quietly. It never syncs.
// ENTRY POINTS (not re-declared here: each control is owned by the manifest named, and the SYNC-M scenarios drive it THROUGH this window):
//   - `settings.compendium.sync` (settings-tab.ts, SC-440) and `authoring.search.sync` (authoring-search.ts, SC-443): a first Sync of a legacy
//     folder, or a Sync while the migration is owed, opens THIS window instead of syncing;
//   - `sync.cmd.sync-compendium` and `sync.cmd.migrate-compendium-layout` (sync-commands.ts).
// Kinds: `click`, and `press:Enter` on the focused button, as every other modal manifest declares (Space is not declared: SC-441 ledger O14 Q6).
// `click-disabled` on Stop once it reads "Stopping…" (a click on a disabled button does nothing). The "Move 0 file(s)" disabled state exists in the
// source but is unreachable on screen (the window is never opened for a plan with nothing to move: the plugin shows a Notice instead), so it is a
// jest pin (compendium-migration-modal.test.ts), not a pair.
// DISMISSALS. Obsidian draws the X and the backdrop, so the real nodes carry the shared HOST ids `modal.close` (`click`, `press:Escape`) and
// `modal.backdrop` (`click`), declared by every modal manifest and credited when a spec really clicks them (no new pair here). The exercised-set gate
// keys on (control, kind) alone, so one surface per phase could not make it DEMAND a separate drive per phase, and `click` cannot tell the X from the
// backdrop. So each way out of each phase is also a VIRTUAL id of its own (no DOM node; the driver credits it after the real dismissal happened),
// using only kinds that already exist: `migration.<phase>.escape` x `press:Escape`, `.x` x `click`, `.backdrop` x `click`.
// `rows` cite the SC-441 scenario groups: M the migration window (`SYNC-M<nn>`), R re-runs with nothing to do (`SYNC-R<nn>`); specs in e2e/specs/sync/.
import { c, surface } from './surface';
import type { ControlSpec } from './surface';

const PHASES = ['preview', 'running', 'summary', 'stopped', 'error'] as const;
/** Ids with no DOM node of ours: the census skips them, the driver credits them after the real dismissal happened. */
export const VIRTUAL_IDS: readonly string[] = PHASES.flatMap((p) => [`migration.${p}.escape`, `migration.${p}.x`, `migration.${p}.backdrop`]);
/** Obsidian's own X and backdrop (host ids shared with every modal manifest; the real-Obsidian census allowlists them). */
export const HOST_IDS: readonly string[] = ['modal.close', 'modal.backdrop'];

const KEYS = ['click', 'press:Enter'] as const;
const dismissals = (phase: (typeof PHASES)[number]): Record<string, ControlSpec> => ({
	[`migration.${phase}.escape`]: c(['press:Escape'], ['M']),
	[`migration.${phase}.x`]: c(['click'], ['M']),
	[`migration.${phase}.backdrop`]: c(['click'], ['M']),
});

export default surface('sync-migration-window', {
	controls: {
		// -- PREVIEW
		'migration.preview.not-now': c(KEYS, ['M']),
		'migration.preview.sync-anyway': c(KEYS, ['M']),
		'migration.preview.move': c(KEYS, ['M']),
		...dismissals('preview'),

		// -- RUNNING
		'migration.running.stop': c([...KEYS, 'click-disabled'], ['M']),
		...dismissals('running'),

		// -- SUMMARY after a complete run
		'migration.summary.close': c(KEYS, ['M', 'R']),
		'migration.summary.sync-now': c(KEYS, ['M', 'R']),
		...dismissals('summary'),

		// -- STOPPED: the summary after a stopped run
		'migration.stopped.close': c(KEYS, ['M']),
		'migration.stopped.finish': c(KEYS, ['M', 'R']),
		...dismissals('stopped'),

		// -- ERROR: the run threw
		'migration.error.close': c(KEYS, ['M']),
		...dismissals('error'),

		// -- The per-path lists in either summary (a disclosure button each)
		'migration.list.backed-up': c(KEYS, ['M']),
		'migration.list.moved-modified': c(KEYS, ['M']),
		'migration.list.blocked': c(KEYS, ['M']),
		'migration.list.failed': c(KEYS, ['M']),
		'migration.list.unmapped': c(KEYS, ['M']),

		// -- Obsidian's X and backdrop (host ids, credited by the real clicks; the pairs are declared by every modal manifest)
		'modal.close': c(['click', 'press:Escape'], ['M']),
		'modal.backdrop': c(['click'], ['M']),
	},
});
