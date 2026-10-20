// The StaminaEditModal (src/views/StaminaEditModal.ts) and every way to reach it.
// Hosts in the pilot: ds-stamina-bar (`stamina.bar`, in manifest/stamina-bar.ts) and
// initiative's stamina entry points (`reach` below). Pool modal = rollout, not here.
import { c, surface } from './surface';

export default surface('stamina-edit-modal', {
	reach: [
		// The numeric controls are the keyboard / assistive-tech write path: the Steel theme stands them
		// down visually (not clickable by pointer), so a scenario reaches them with Tab + Enter.
		{ host: 'initiative', control: 'init.hero.stamina', ...c(['press:Enter'], ['E07']) },
		{ host: 'initiative', control: 'init.hero.bar', ...c(['click'], ['E08']) },
		{ host: 'initiative', control: 'init.detail.stamina', ...c(['press:Enter'], ['E09']) },
		{ host: 'initiative', control: 'init.detail.bar', ...c(['click'], ['E10', 'E21']) },
		// The roster cell is one <button>: a click selects the instance, a double-click edits its stamina.
		{ host: 'initiative', control: 'init.cell.stamina', ...c(['click', 'dblclick'], ['E11', 'E12', 'E20']) },
	],
	controls: {
		// -- A. Apply box, Damage, Healing
		'sedit.apply-amount': c(['type', 'press:Enter', 'press:ArrowUp', 'press:ArrowDown'], ['A01', 'A07', 'A08', 'A09', 'A16', 'A18', 'M02']),
		'sedit.damage': c(['click'], ['A01', 'A02', 'A05', 'A07']),
		'sedit.healing': c(['click'], ['A11', 'A12']),
		// -- S. Stamina stepper
		'sedit.stamina.dec': c(['click'], ['S01']),
		'sedit.stamina.inc': c(['click'], ['S01']),
		'sedit.stamina.input': c(['click', 'type', 'press:Enter', 'press:Escape', 'blur'], ['S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S13', 'S14']),
		// -- T. Temporary Stamina stepper
		'sedit.temp.dec': c(['click', 'click-disabled'], ['T04', 'T05']),
		'sedit.temp.inc': c(['click'], ['T01']),
		'sedit.temp.input': c(['type', 'press:Escape', 'blur'], ['T02', 'T03', 'T09', 'T10', 'T12']),
		// -- Q. Quick actions
		'sedit.kill': c(['click'], ['Q01']),
		'sedit.full-heal': c(['click'], ['Q04']),
		'sedit.spend-recovery': c(['click', 'click-disabled'], ['Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q13']),
		// -- SC-432: the confirmation over the modal (first press of the relabelled heal, hero with no pool)
		'sedit.free-heal.cancel': c(['click'], ['Q13']),
		'sedit.free-heal.confirm': c(['click'], ['Q13']),
		// -- F. Footer
		'sedit.reset': c(['click'], ['F05', 'F06']),
		'sedit.apply': c(['click', 'click-disabled'], ['F01', 'F02', 'F03', 'F04', 'M07', 'W01']),
		// -- Obsidian host controls (resolved by the driver from Obsidian's selectors)
		'modal.close': c(['click', 'press:Escape'], ['F07', 'K03']),
		'modal.backdrop': c(['click'], ['F07']),
	},
});
