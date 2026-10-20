// The ConditionsModal (src/views/ConditionsModal.ts), reached from initiative's per-row "Add Condition"
// button. Pilot scope is deliberately narrow (SC-431): just what the Escape-in-the-add-dropdown
// scenario drives. The rest of the modal is not inventoried here.
import { c, surface } from './surface';

export default surface('conditions-modal', {
	reach: [{ host: 'initiative', control: 'init.cond.add', ...c(['click'], ['SC-431']) }],
	controls: {
		'cond.add': c(['click', 'press:Escape'], ['SC-431']),
		'cond.input': c(['type', 'press:Escape'], ['SC-431']),
	},
});
