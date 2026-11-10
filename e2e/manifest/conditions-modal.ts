// The ConditionsModal (src/views/ConditionsModal.ts): the whole window, reached from initiative's per-row "Add Condition"
// button on a hero row and on the selected creature's detail row. It applies LIVE: every add, remove and editor pick
// writes the note at once; opening, closing and focus moves write nothing. SC-431 / SC-468 / SC-474 piloted it
// (Escape in the dropdown, keyboard picks in the row editor, the click-away close); SC-436 inventoried the rest.
// `rows` cite the scenario groups: O open + reach, A the Add dropdown, C a custom condition, R a row (cog, remove),
// D the row editor (icon, duration, colour, effect; COND-D01..D17), X the close paths. The ids are the COND-<group><nn>
// scenarios of e2e/specs/conditions-modal/ (the pilot's COND-E01..E07 sit in e2e/specs/initiative/).
// The ConditionsPanel host (src/elements/conditions/panel.ts, ds-conditions) opens the same modal; it is another host
// and has no reach row here.
import { c, surface } from './surface';

export default surface('conditions-modal', {
	reach: [{ host: 'initiative', control: 'init.cond.add', ...c(['click', 'press:Enter'], ['SC-431', 'O01', 'O02', 'O03']) }],
	controls: {
		// -- A. The "+ Add condition" button, which swaps in place for the combobox
		'cond.add': c(['click', 'press:Enter', 'press:Escape'], ['SC-431', 'A01', 'O04']),
		// The combobox input: type filters the catalogue, Enter picks the active option, ArrowUp / ArrowDown move it,
		// Escape closes just the dropdown, a click away (the title) closes it too.
		'cond.input': c(['type', 'press:Escape', 'press:Enter', 'press:ArrowDown', 'press:ArrowUp', 'blur'], ['SC-431', 'SC-468', 'A02', 'A03', 'A05', 'C01']),
		// An option of the dropdown (a repeated node: nth): a known condition, or the "Add custom: <text>" row last.
		'cond.option': c(['click'], ['A04', 'C02']),
		// -- R. A condition row: its cog (opens the inline editor under it) and its trash button
		'cond.edit': c(['click', 'press:Enter', 'press:Escape'], ['SC-468', 'R01', 'R02', 'X05']),
		'cond.remove': c(['click', 'press:Enter'], ['R03', 'R04']),
		// -- D. The inline editor (repeated nodes: nth). SC-468: the pick options; SC-474: the icon search field.
		'cond.icon-search': c(['click', 'type', 'press:Escape'], ['SC-474', 'D02', 'X07']),
		'cond.icon': c(['click', 'press:Enter'], ['D02', 'D04']),
		'cond.duration': c(['click', 'press:Enter'], ['SC-468', 'D05', 'D08']),
		'cond.swatch': c(['click', 'press:Enter'], ['SC-468', 'D09', 'D10']),
		// The custom colour <input type="color">: transparent over the pipette swatch. Enter opens the browser's own colour
		// chooser, which CDP cannot reach: D11 drives that Enter. The chooser's commit (input + change) is dispatched page-side by
		// D17 (a real-Obsidian write test, credited with no pair), and the value matrix is jsdom (conditions-modal-matrix).
		'cond.color-custom': c(['press:Enter'], ['D11']),
		'cond.effect': c(['click', 'press:Enter'], ['SC-468', 'D12', 'D16']),
		// -- X. Close paths
		'cond.done': c(['click', 'press:Enter'], ['X01', 'X02']),
		// -- Obsidian host controls (resolved by the driver from Obsidian's selectors)
		'modal.close': c(['click', 'press:Escape'], ['X03', 'X04']),
		'modal.backdrop': c(['click'], ['X06']),
	},
});
