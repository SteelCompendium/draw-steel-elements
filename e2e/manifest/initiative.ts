// The initiative tracker's own controls (src/elements/initiative/view.ts, src/views/ResetEncounterModal.ts).
// Pilot scope is deliberately narrow: just what SC-485's default-key scenarios press to reach a write (the
// hero's Steel turn overlay, the chrome panel's "Reset encounter state" item and its confirm button). The
// tracker's stamina entry points are `reach` rows of manifest/stamina-edit-modal.ts and manifest/conditions-modal.ts.
import { c, surface } from './surface';

export default surface('initiative', {
	controls: {
		// The full-bleed button over a hero's portrait (hero rows only; creature rows have no overlay).
		'init.hero.turn': c(['click'], ['SC-485', 'SC-500']),
		// A chrome-panel item. The item is always in the DOM, but the panel is hidden (opacity 0, no pointer events)
		// until the pointer is over the tracker or focus is inside it, so a scenario must call `dse.hover(root.root)`
		// (or Tab in) before pressing it.
		'init.reset-encounter': c(['click'], ['SC-485', 'SC-500']),
		// The "Yes, Reset" button of ResetEncounterModal.
		'init.reset-encounter.confirm': c(['click'], ['SC-485', 'SC-500']),
	},
});
