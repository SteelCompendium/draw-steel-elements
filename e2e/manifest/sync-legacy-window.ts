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
// Kinds (the buttons are real `<button>`s): `click`, and `press:Enter` / `press:Space` on the focused button (a native button is activated by
// either key). Dismissals are VIRTUAL ids (no DOM node of ours; the id names which window and phase was dismissed, so the gate demands each
// one separately): `press:Escape` with the window open, `click:X` (Obsidian's close button) and `click:Backdrop` (a click outside the dialog).
// Closing without a button calls NO callback: nothing is trashed, nothing is synced, nothing is recorded (the window has no persisted
// decline: the next Sync asks again).
// `rows` cite the SC-441 scenario groups: E the "Existing compendium folder found" window (`SYNC-E<nn>`; specs in e2e/specs/sync/).
import { c, surface } from './surface';

/** Ids with no DOM node of their own: the census skips them, the driver credits them after the real dismissal happened. */
export const VIRTUAL_IDS: readonly string[] = ['sync.legacy.dismiss'];

const KEYS = ['click', 'press:Enter', 'press:Space'] as const;
const DISMISS = ['press:Escape', 'click:X', 'click:Backdrop'] as const;

export default surface('sync-legacy-window', {
	controls: {
		'sync.legacy.keep': c(KEYS, ['E']),
		'sync.legacy.trash': c(KEYS, ['E']),
		'sync.legacy.dismiss': c(DISMISS, ['E']),
	},
});
