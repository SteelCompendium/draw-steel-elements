// The ConditionsModal (src/views/ConditionsModal.ts), reached from initiative's per-row "Add Condition"
// button. Pilot scope is deliberately narrow: just what the scenarios drive (SC-431's Escape in the
// add dropdown; SC-468's keyboard picks in the row editor). The rest of the modal is not inventoried
// here.
import { c, surface } from './surface';

export default surface('conditions-modal', {
	reach: [{ host: 'initiative', control: 'init.cond.add', ...c(['click'], ['SC-431']) }],
	controls: {
		'cond.add': c(['click', 'press:Escape'], ['SC-431']),
		'cond.input': c(['type', 'press:Escape', 'press:Enter'], ['SC-431', 'SC-468']),
		// SC-468: the row's cog (opens the inline editor) and the editor's pick options (repeated nodes: nth).
		'cond.edit': c(['click'], ['SC-468']),
		'cond.duration': c(['press:Enter'], ['SC-468']),
		'cond.swatch': c(['click', 'press:Enter'], ['SC-468']),
		'cond.effect': c(['press:Enter'], ['SC-468']),
	},
});
