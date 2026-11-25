// The "Existing compendium folder found" window (src/views/LegacyCompendiumModal.ts), opened by `plugin.syncCompendium()` before the FIRST
// sync when the Destination folder already holds files but there is no sync manifest (SC-441). The only flow in the plugin that can trash a
// folder: "Move old compendium to trash" hands the folder the window names to `fileManager.trashFile`, then syncs; "Keep everything" syncs
// into the folder as it is (files that collide with compendium paths are skipped and reported, nothing is overwritten or deleted).
// Both footer buttons are kit buttons (`DseModal.footer`), real `<button>`s; "Keep everything" takes the initial focus (the safe default).
// The window has no X of its own: Obsidian draws the X and the backdrop (host ids `modal.close` / `modal.backdrop`, declared by every modal
// manifest and credited when a spec really clicks them).
// ENTRY POINTS (not re-declared here: each control is owned by the manifest named, and the SYNC-E scenarios drive it THROUGH this window):
//   - `settings.compendium.sync` (settings-tab.ts, SC-440): the Settings > Compendium > Sync button;
//   - `authoring.search.sync` (authoring-search.ts, SC-443): the "Sync compendium" row of the compendium search window's empty state;
//   - `sync.cmd.sync-compendium` (sync-commands.ts): the palette command.
// All three call the same `syncCompendium()`; a Destination-folder change opens no window, and nothing offers it at plugin load.
// Kinds (the buttons are real `<button>`s): `click`, and `press:Enter` on the focused button, as every other modal manifest declares (Space is not
// declared: SC-441 ledger O14 Q6).
// DISMISSALS. Obsidian draws the X and the backdrop, so the real nodes carry the shared HOST ids `modal.close` (`click`, `press:Escape`) and
// `modal.backdrop` (`click`), declared by every modal manifest and credited when a spec really clicks them (no new pair here). The exercised-set gate
// keys on (control, kind) alone, so one surface per phase could not make it DEMAND a separate drive per window, and `click` cannot tell the X from the
// backdrop. So each way out of this window is also a VIRTUAL id of its own (no DOM node; the driver credits it after the real dismissal happened),
// using only kinds that already exist: `<id>.escape` x `press:Escape`, `<id>.x` x `click`, `<id>.backdrop` x `click`.
// Closing without a button calls NO callback: nothing is trashed, nothing is synced, nothing is recorded (the window has no persisted
// decline: the next Sync asks again).
// `rows` cite the SC-441 scenario groups: E the "Existing compendium folder found" window (`SYNC-E<nn>`; specs in e2e/specs/sync/).
import { c, surface } from './surface';

/** Ids with no DOM node of their own: the census skips them, the driver credits them after the real dismissal happened. */
export const VIRTUAL_IDS: readonly string[] = ['sync.legacy.escape', 'sync.legacy.x', 'sync.legacy.backdrop'];
/** Obsidian's own X and backdrop (host ids shared with every modal manifest; the real-Obsidian census allowlists them). */
export const HOST_IDS: readonly string[] = ['modal.close', 'modal.backdrop'];

const KEYS = ['click', 'press:Enter'] as const;

export default surface('sync-legacy-window', {
	controls: {
		'sync.legacy.keep': c(KEYS, ['E']),
		'sync.legacy.trash': c(KEYS, ['E']),
		'sync.legacy.escape': c(['press:Escape'], ['E']),
		'sync.legacy.x': c(['click'], ['E']),
		'sync.legacy.backdrop': c(['click'], ['E']),
		'modal.close': c(['click', 'press:Escape'], ['E']),
		'modal.backdrop': c(['click'], ['E']),
	},
});
