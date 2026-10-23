// ds-counter (src/elements/counter/view.ts): the kit stepper's three controls, stamped with the `counter`
// prefix. Pilot scope is deliberately narrow: just what SC-495 drives (a keyboard "-" that reaches min, and a mouse click on it).
import { c, surface } from './surface';

export default surface('counter', {
	controls: {
		'counter.dec': c(['press:Enter', 'click'], ['SC-495']),
	},
});
