// ds-counter (src/elements/counter/view.ts): the kit stepper's controls, stamped with the `counter` prefix by
// `stepper({ control: 'counter' })` (src/framework/kit/stepper.ts). SC-495 and SC-602 seeded this file with the "-" / "+" keyboard and mouse
// presses; SC-442 completes it: the value field, the disabled state at a limit, Space on the buttons and every key the field takes.
// The counter draws nothing else of its own. The framework chrome panel inside its card (`chrome.collapse` / `chrome.expand`, and the
// experimental `chrome.pin`) belongs to manifest/chrome.ts; the optional Edit item (Authoring controls preference) is not an id'd control.
// `rows` cite scenario groups: S the buttons (mouse and keyboard), T the typed value, E the min / max edges; or the ticket that added the pair.
// A press of "-" / "+" and a commit of the field are the only writes; every write goes through the debounced persist.
import { c, surface } from './surface';

export default surface('counter', {
	controls: {
		// -- S / E. "-": a click or Enter / Space on the focused button steps down by 1. At min_value the button is REALLY disabled (a click does
		//    nothing); a keyboard press that disables it hands focus to the field (SC-495), a mouse press moves nothing.
		'counter.dec': c(['press:Enter', 'click', 'click-disabled', 'press:Space'], ['SC-495', 'S01', 'S02', 'S03', 'E01', 'E02']),
		// -- S / E. "+": the same, up to max_value (a counter with no max_value never disables it).
		'counter.inc': c(['press:Enter', 'click', 'click-disabled', 'press:Space'], ['SC-602', 'S01', 'S02', 'S03', 'E01', 'E02']),
		// -- T. The value: an <input type=number> on a writable counter. Typing only edits a draft; Enter or leaving the field (blur) commits it
		//    once (a decimal is cut toward zero, a value past a limit is clamped, an empty or unreadable box reverts, a commit that changes
		//    nothing writes nothing), Escape reverts a dirty draft, and ArrowUp / ArrowDown are the browser's own number stepping (they only
		//    change the draft: the commit is the same Enter or blur).
		'counter.input': c(['type', 'press:Enter', 'press:Escape', 'blur', 'press:ArrowUp', 'press:ArrowDown'], ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'E03']),
		// -- The value as plain text on a read-only counter (a Canvas card, print / export, a nested render: any host that cannot persist). A programmatic focus target
		//    (tabindex -1) that nothing clicks or types into, so it lists no interaction (the way `init.malice.value` does).
		'counter.value': c([]),
	},
});
