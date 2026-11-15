// The authoring insert COMMANDS (src/authoring/insert.ts `registerInsertCommands`, src/authoring/compendiumInsert.ts
// `registerCompendiumInsertCommands`; registered in main.ts) (SC-443).
// A command has no DOM of its own, so its control id is the command id under a prefix: `authoring.cmd.<command id>` (the commands are
// `insert-<element id>` plus `insert-compendium-reference` / `insert-compendium-block`). The one interaction kind is `palette`: the command
// RUN THROUGH OBSIDIAN'S COMMAND PALETTE with real keys (Ctrl+P, type the command's name, Enter) while the note's editor is focused. That is
// the real input a user has; `app.commands.executeCommandById` is a programmatic shortcut and never credits a pair. (A hotkey is the same
// code path behind a different key; the palette is the one that needs no setup.)
// NOT listed: `insert-hero` (SC-190: `ds-hero` is hidden, it has no command in either mode) and the generic block edit form (SC-404).
// SHIPPED vs GATE ON (SC-406): the shipped build (experimental OFF) registers a command only for an element that is not `hidden` and not
// `deferred`: the thirteen first. The eight deferred elements get theirs only with the gate on (the command set is built once at plugin
// load, so the gate-on scenarios reload the plugin through `dse.setPrefs({}, { experimental: true })`); they are declared here and driven
// by the `G` rows, the one place a spec turns the gate on.
// `rows` cite the SC-443 scenario groups: I insert commands (`AUTH-I<nn>`, shipped), C the two compendium commands (their round trips are
// the C rows of authoring-search.ts), G experimental gate on (`AUTH-G<nn>`).
import { c, surface } from './surface';

const palette = (rows: readonly string[]) => c(['palette'], rows);

export default surface('authoring-commands', {
	controls: {
		// -- I. The thirteen shipped element commands (experimental OFF).
		'authoring.cmd.insert-horizontal-rule': palette(['I']),
		'authoring.cmd.insert-skills': palette(['I']),
		'authoring.cmd.insert-stamina-bar': palette(['I']),
		'authoring.cmd.insert-negotiation': palette(['I']),
		'authoring.cmd.insert-initiative': palette(['I']),
		'authoring.cmd.insert-feature': palette(['I']),
		'authoring.cmd.insert-featureblock': palette(['I']),
		'authoring.cmd.insert-statblock': palette(['I']),
		'authoring.cmd.insert-counter': palette(['I']),
		'authoring.cmd.insert-values-row': palette(['I']),
		'authoring.cmd.insert-characteristics': palette(['I']),
		'authoring.cmd.insert-scc': palette(['I']),
		'authoring.cmd.insert-montage': palette(['I']),

		// -- C. The two compendium commands: each opens the search window (authoring-search.ts) on its own default action.
		'authoring.cmd.insert-compendium-reference': palette(['C']),
		'authoring.cmd.insert-compendium-block': palette(['C']),

		// -- G. The eight deferred elements' commands: present only with the experimental gate on.
		'authoring.cmd.insert-roll': palette(['G']),
		'authoring.cmd.insert-encounter': palette(['G']),
		'authoring.cmd.insert-project': palette(['G']),
		'authoring.cmd.insert-party': palette(['G']),
		'authoring.cmd.insert-conditions': palette(['G']),
		'authoring.cmd.insert-heroic-resource': palette(['G']),
		'authoring.cmd.insert-surges': palette(['G']),
		'authoring.cmd.insert-hero-tokens': palette(['G']),
	},
});

/** The commands only the gate-on build registers (ids as `app.commands` lists them, without the plugin prefix). */
export const GATE_ON_COMMANDS: readonly string[] = [
	'insert-roll',
	'insert-encounter',
	'insert-project',
	'insert-party',
	'insert-conditions',
	'insert-heroic-resource',
	'insert-surges',
	'insert-hero-tokens',
];
