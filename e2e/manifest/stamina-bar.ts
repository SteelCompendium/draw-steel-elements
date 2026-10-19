// ds-stamina-bar (src/elements/stamina-bar/view.ts) with its RecoveriesStrip, Catch Breath,
// the optional popover editor and the undo toast. Opening the modal is `stamina.bar`.
import { c, surface } from './surface';

export default surface('stamina-bar', {
	controls: {
		'stamina.bar': c(['click'], ['E01', 'W01']),
		// The marker row is ONE slider (role=slider, tabindex 0); each marker is a click target.
		'recov.marker': c(['click'], ['R04']),
		'recov.markers': c(['press:ArrowRight', 'press:ArrowLeft', 'press:Home', 'press:End', 'press:Escape', 'press:Tab'], ['R05', 'R09']),
		'recov.catch-breath': c(['click', 'click-disabled', 'press:Enter'], ['R01', 'R02', 'R03']),
		'recov.pop.dec': c(['click'], ['R07']),
		'recov.pop.inc': c(['click'], ['R07']),
		'recov.pop.catch-breath': c(['click', 'click-disabled', 'press:Enter'], ['R07', 'R08']),
		'undo.action': c(['click'], ['R06']),
	},
});
