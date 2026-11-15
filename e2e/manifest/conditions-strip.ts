// The ds-conditions strip's own "+ add condition" button (src/elements/conditions/panel.ts, also the hero sheet's Conditions slot): the control
// that opens the Conditions window (manifest/conditions-modal.ts is the window). SC-662 gave it an id so focus can return to it when an outside
// edit to the note closes the window in the pinned sidebar (e2e/specs/sidebar/pending-saves.e2e.ts).
import { c, surface } from './surface';

export default surface('conditions-strip', {
	controls: {
		'cond.strip.add': c(['press:Enter'], ['SC-662']),
	},
});
