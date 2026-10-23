// The roll bar's Edges / Banes steppers on a `ds-feature` (src/framework/kit/rollBar.ts), reached with the
// shipped "Enable rolling" preference on: the launch button, the Modifiers disclosure, and the two
// read-only steppers (range 0..9). Pilot scope is deliberately narrow: just what SC-495 drives (a keyboard
// "+" that reaches the maximum on a stepper that shows its number as plain text).
import { c, surface } from './surface';

export default surface('roll-bar', {
	controls: {
		'roll.launch': c(['click'], ['SC-495']),
		'roll.modifiers': c(['click'], ['SC-495']),
		'roll.edges.inc': c(['press:Enter'], ['SC-495']),
		'roll.banes.inc': c(['press:Enter'], ['SC-495']),
	},
});
