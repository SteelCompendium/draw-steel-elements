// ResetEncounterModal (src/views/ResetEncounterModal.ts), opened by the tracker's chrome-panel "Reset encounter state" item
// (`init.reset-encounter`, manifest/initiative.ts) (SC-437). A confirm for a destructive action: Cancel takes the initial focus,
// "Yes, Reset" is the danger button. Obsidian's own X and backdrop are host ids the driver resolves from its selectors.
// `rows` cite the SC-437 scenario group X: X01 confirm, X02 cancel, X03 Escape / close, X04 keyboard.
import { c, surface } from './surface';

export default surface('reset-encounter-modal', {
	reach: [{ host: 'initiative', control: 'init.reset-encounter', ...c(['click'], ['X01']) }],
	controls: {
		'init.reset-encounter.cancel': c(['click', 'press:Enter'], ['X02', 'X04']),
		'init.reset-encounter.confirm': c(['click', 'press:Enter'], ['SC-485', 'SC-500', 'X01', 'X04']),
		'modal.close': c(['click', 'press:Escape'], ['X03']),
		'modal.backdrop': c(['click'], ['X03']),
	},
});
