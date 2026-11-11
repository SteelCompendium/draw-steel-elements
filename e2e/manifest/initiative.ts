// The initiative tracker's own controls (src/elements/initiative/view.ts): the title edit, the round and
// Malice controls, the turn controls (hero portrait overlay and checkbox, enemy-group header), the action
// checklists, condition removal, the captain badge and the roster cells, plus the chrome panel's two items
// (SC-437; SC-485 seeded the file with the hero turn overlay and the Reset encounter item).
// NOT listed here, because other surfaces own them (the ids reach this one as `reach` rows of theirs):
//   - the stamina entry points `init.hero.stamina`, `init.hero.bar`, `init.detail.stamina`, `init.detail.bar`
//     and the cell's double-click (`init.cell.stamina` dblclick): manifest/stamina-edit-modal.ts and
//     manifest/minion-pool-modal.ts;
//   - the "Add Condition" button `init.cond.add` (hero and creature rows): manifest/conditions-modal.ts;
//   - ResetEncounterModal's own buttons: manifest/reset-encounter-modal.ts.
// `rows` cite the SC-437 scenario groups: T title edit, R round, M Malice, N turn, A action checklist,
// C conditions, K captain, S selection, X reset, F keyboard focus after a rebuild. A repeated control is driven through `nth`.
import { c, surface } from './surface';

export default surface('initiative', {
	controls: {
		// -- T. The encounter title: a focusable text span (click / Enter / Space open the editor), then a
		//    textarea that commits on Enter, Shift+Enter or a real blur and reverts on Escape.
		'init.title': c(['click', 'press:Enter', 'press:Space'], ['T01', 'T02', 'T03']),
		'init.title.input': c(['type', 'press:Enter', 'press:Shift+Enter', 'press:Escape', 'blur'], ['T01', 'T04', 'T05', 'T06', 'T07']),

		// -- R. Round. "Advance round" sits on the Heroes heading line; "Reset turns (this round)" is a chrome-panel item
		//    (hidden, opacity 0, until the pointer is over the tracker or focus is inside it: `dse.hover(root.root)` first).
		'init.round.advance': c(['click', 'press:Enter'], ['R01', 'F02', 'M10']),
		'init.reset-turns': c(['click', 'press:Enter'], ['R02', 'F03']),
		// A chrome-panel item that opens ResetEncounterModal (see manifest/reset-encounter-modal.ts).
		'init.reset-encounter': c(['click', 'press:Enter'], ['SC-485', 'SC-500', 'X01', 'F05']),

		// -- M. Malice: the kit stepper (min 0 since SC-577: the - button disables at 0), the quick-add row and the log disclosure. The stepper's value node is
		//    a programmatic focus target (tabindex -1) that nothing clicks, so it lists no interaction.
		'init.malice.dec': c(['click', 'click-disabled'], ['M01', 'M07']),
		'init.malice.value': c([]),
		'init.malice.inc': c(['click'], ['M01', 'M02', 'M10']),
		'init.malice.quickadd.amount': c(['type', 'press:Enter'], ['M03', 'M04', 'M10']),
		'init.malice.quickadd.label': c(['type', 'press:Enter'], ['M03', 'M04', 'M10', 'M11']),
		'init.malice.quickadd.add': c(['click'], ['M03', 'M05', 'M10']),
		'init.malice.log': c(['click'], ['M06']),

		// -- N. Turn taken. The hero's portrait overlay is the Steel screen's control (the SC-485 pilot id); the checkbox
		//    beside it is display:none on screen and comes back only with the Initiative portraits preference off.
		//    The enemy group's header button is a real, visible button on screen.
		'init.hero.turn': c(['click'], ['SC-485', 'SC-500', 'N01']),
		'init.hero.turnbox': c(['click'], ['N02']),
		'init.group.turn': c(['click'], ['N03']),

		// -- A. Per-turn action checklists (repeated nodes: nth). A hero's four slots, a creature instance's four slots and
		//    a minion squad's five (Main / Maneuver / Second move are mutually exclusive).
		'init.hero.action': c(['click'], ['A01']),
		'init.detail.action': c(['click'], ['A02']),
		'init.detail.squad-action': c(['click'], ['A03', 'A04']),

		// -- C. A condition icon on a hero or creature row: a click removes it. (Adding one opens ConditionsModal, whose
		//    reach row `init.cond.add` is in manifest/conditions-modal.ts.)
		'init.cond.remove': c(['click'], ['C01']),

		// -- K. The captain badge on the open creature's name line: "Make captain" (promote) or "Captain" (relieve).
		'init.captain.make': c(['click', 'press:Enter'], ['K01', 'F04']),
		'init.captain.relieve': c(['click', 'press:Enter'], ['K02', 'F04']),

		// -- S. A roster cell (repeated: nth) selects its instance. The id kept its SC-408 name, `init.cell.stamina`, because
		//    the cell's double-click was the first thing driven (the stamina modals' reach row); a click is selection.
		'init.cell.stamina': c(['click'], ['S01']),
	},
});
