// The MinionStaminaPoolModal (src/views/MinionStaminaPoolModal.ts) and every way to reach it (SC-435).
// Opened from a minion SQUAD's roster cell (double-click) or its detail row (numeric control, row bar) in
// the initiative tracker; those host controls are shared with manifest/stamina-edit-modal.ts (a creature
// row opens the StaminaEditModal instead), so a reach pair listed in both counts once in the gate.
// `rows` cite the SC-435 scenario groups: A apply box, S pool stepper, K kill boxes, C conditions, F footer.
import { c, surface } from './surface';

export default surface('minion-pool-modal', {
	reach: [
		{ host: 'initiative', control: 'init.detail.stamina', ...c(['press:Enter'], ['E09']) },
		{ host: 'initiative', control: 'init.detail.bar', ...c(['click'], ['E10']) },
		{ host: 'initiative', control: 'init.cell.stamina', ...c(['dblclick'], ['E20']) },
	],
	controls: {
		// -- S. Pool stepper (bounded [0, pool max]; disabled at either end)
		'pool.stamina.dec': c(['click', 'click-disabled', 'press:Enter'], ['S01', 'S02', 'S08']),
		'pool.stamina.inc': c(['click', 'click-disabled', 'press:Enter'], ['S01', 'S02', 'S06']),
		'pool.stamina.input': c(['type', 'press:Enter', 'press:Escape', 'blur'], ['S03', 'S04', 'S05']),
		// -- A. Apply damage row: damage per minion x minions hit
		'pool.damage-amount': c(['type', 'press:ArrowDown'], ['A01', 'A02', 'A05']),
		'pool.minion-count': c(['type', 'press:ArrowUp'], ['A03', 'A04']),
		'pool.apply-damage': c(['click'], ['A01', 'A05']),
		// -- K. The living minions' kill checkboxes (a repeated node: nth) and their name labels
		'pool.kill': c(['click', 'click-disabled', 'press:Space'], ['K01', 'K02', 'K03', 'K05']),
		'pool.minion-name': c(['click'], ['K04']),
		// -- C. A minion's condition icon (a button: a click, Enter or Space removes the condition and saves at once)
		'pool.condition': c(['click', 'press:Enter', 'press:Space'], ['C01', 'C04', 'C05', 'C06', 'C07', 'C08']),
		// -- F. Footer
		'pool.reset': c(['click'], ['F01']),
		'pool.apply': c(['click', 'click-disabled', 'press:Enter'], ['F02', 'F03', 'K05']),
		// -- Obsidian host controls (resolved by the driver from Obsidian's selectors)
		'modal.close': c(['click', 'press:Escape'], ['F04', 'F05']),
		'modal.backdrop': c(['click'], ['F04']),
	},
});
