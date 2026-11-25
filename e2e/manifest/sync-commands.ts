// The two palette commands that start a compendium sync or the pre-7.0.0 migration (main.ts `onload`) (SC-441).
// A command has no DOM of its own, so its control id is the command id under a prefix: `sync.cmd.<command id>` (the same convention as
// authoring-commands.ts). The one interaction kind is `palette`: the command RUN THROUGH OBSIDIAN'S COMMAND PALETTE with real keys (Ctrl+P, the
// command's name, Enter). `app.commands.executeCommandById` is a programmatic shortcut and never credits a pair (a hotkey is the same code path
// behind a different key; the palette is the one that needs no setup).
//   - `sync-compendium` ("Sync compendium"): `plugin.syncCompendium()`, the same entry point as the Settings Sync button and the search window's
//     Sync row. Depending on the vault it syncs, opens "Existing compendium folder found" (sync-legacy-window.ts), opens the migration window
//     (sync-migration-window.ts), or refuses with a Notice (a Destination folder that is the vault root or outside the vault; a sync already
//     running).
//   - `migrate-compendium-layout` ("Migrate compendium from the pre-7.0.0 layout"): `plugin.migrateCompendium()`: always available, opens the
//     migration window or says there is nothing to migrate.
// The retired `download-data-md-dse` alias is gone (SC-406): the census (test/dom/e2eCensus.test.ts) pins that these two are the only sync /
// migration commands the plugin registers.
// `rows` cite the SC-441 scenario groups: S sync runs (`SYNC-S<nn>`), M the migration window (`SYNC-M<nn>`), D the Destination-folder guard
// (`SYNC-D<nn>`); specs in e2e/specs/sync/.
import { c, surface } from './surface';

const palette = (rows: readonly string[]) => c(['palette'], rows);

export default surface('sync-commands', {
	controls: {
		'sync.cmd.sync-compendium': palette(['S', 'D']),
		'sync.cmd.migrate-compendium-layout': palette(['M']),
	},
});

/** The command ids (as `app.commands` lists them, without the plugin prefix) and their palette names. */
export const SYNC_COMMANDS: Readonly<Record<string, string>> = {
	'sync-compendium': 'Sync compendium',
	'migrate-compendium-layout': 'Migrate compendium from the pre-7.0.0 layout',
};
