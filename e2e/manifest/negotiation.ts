// ds-negotiation (src/elements/negotiation/view.ts and the views it mounts from src/drawSteelAdmonition/negotiation/):
// the card's options button and its native Reset menu, the two-tab actions area, the Patience and Interest tracks, the
// "Make an Argument" tab (appeal / mention chips, three modifier checkboxes, the tier radiogroup, Complete Argument) and
// the Motivations cards' Spent chips (SC-439). The "Learn Motivation/Pitfall" tab, the end band and the card head are text:
// nothing in them is interactive, so they list no control.
// NOT listed here, because another surface owns them: the framework chrome's Collapse / Expand buttons
// (`chrome.collapse`, `chrome.expand`: manifest/chrome.ts, which the negotiation's root also carries) and the block edit
// form (src/authoring/FormModal.ts), which only the optional card pencil opens.
// Which kinds are declared. A native <button> is activated by Enter (and Space) with no handler of ours, so, as in the other
// manifests, `press:Enter` is listed for a button a keyboard user reaches and a press changes something; Space is not listed
// separately. A radiogroup (a track, the tier rows) and the tablist listen for keys on their own node: the group is its own
// control, and a key pressed with focus on a seal / row / tab inside it is credited to the group (`press` needs focus within).
// `press:Enter` is NOT declared on a seal (the only tab stop is the checked one, so Enter re-selects it: nothing happens) or on
// a tab (an unselected tab is not a tab stop, and the selected one is a no-op to re-select); it IS on a tier row (the first row
// is the tab stop while none is chosen, and Enter chooses it). The checkboxes are click only (Space is the browser's).
// `rows` cite the SC-439 scenario groups: T tabs, P patience, I interest, M motivation cards (Spent chip), A argument tab
// (chips, modifiers, tier, Complete), R reset menu. Repeated controls are driven through `nth`: a seal's `nth` is its position
// in the DOM (Patience 0..5 left to right, Interest 5..0 top to bottom), a chip's is its position in its row.
import { c, surface } from './surface';

/** The keys a radiogroup moves selection with (kit/track.ts, kit/powerRollPanel.ts): previous / next along the rail, and the ends. */
const RADIO_KEYS = ['press:ArrowRight', 'press:ArrowLeft', 'press:ArrowDown', 'press:ArrowUp', 'press:Home', 'press:End'];

export default surface('negotiation', {
	controls: {
		// -- R. The card's options button (a real icon button, top right) opens Obsidian's own Menu, whose only item is
		//    "Reset negotiation". The menu item is a native node outside the card: it carries its id (`MenuItem.dom`) and is
		//    clicked; Enter / arrows inside the native menu are Obsidian's, and focus never moves onto an item, so only the
		//    mouse is declared for it.
		'negotiation.menu': c(['click', 'press:Enter'], ['R01', 'R02']),
		'negotiation.menu.reset': c(['click'], ['R01', 'R02', 'R03']),

		// -- T. The two tabs ("Make an Argument", "Learn Motivation/Pitfall"). The tablist moves selection with the arrow
		//    keys (wrapping, Home / End; selection follows focus); a click selects the clicked tab.
		'negotiation.tablist': c(['press:ArrowRight', 'press:ArrowLeft', 'press:Home', 'press:End'], ['T02']),
		'negotiation.tab.argument': c(['click'], ['T01']),
		'negotiation.tab.learn-more': c(['click'], ['T01', 'T03']),

		// -- P. Patience: six seals 0..5 across (nth = the value). A click on the checked seal does nothing.
		'negotiation.patience': c(RADIO_KEYS, ['P02']),
		'negotiation.patience.seal': c(['click'], ['P01', 'P03']),

		// -- I. Interest: six rows 5..0 down (nth 0 is value 5).
		'negotiation.interest': c(RADIO_KEYS, ['I02']),
		'negotiation.interest.seal': c(['click'], ['I01', 'I03']),

		// -- M. The Motivations card's "Mark spent" / "Spent" chip, one per motivation.
		'negotiation.spent': c(['click', 'press:Enter'], ['M01', 'M02']),

		// -- A. "Make an Argument". Appeal chips (one per motivation) and mention chips (one per pitfall) toggle what the
		//    argument uses; the three modifier checkboxes are greyed out while they cannot apply (Reuses a Motivation needs a
		//    spent motivation appealed to; same-argument is off while any motivation is appealed to); the four tiers are a
		//    radiogroup; Complete Argument is disabled until a tier is chosen and while the negotiation is over.
		'negotiation.appeal.motivation': c(['click', 'press:Enter'], ['A01', 'A03']),
		'negotiation.appeal.pitfall': c(['click', 'press:Enter'], ['A02', 'A03']),
		'negotiation.mod.reuse': c(['click', 'click-disabled'], ['A04', 'A05']),
		'negotiation.mod.lie': c(['click'], ['A04']),
		'negotiation.mod.same': c(['click', 'click-disabled'], ['A04', 'A05']),
		'negotiation.tier': c(RADIO_KEYS, ['A07']),
		'negotiation.tier.row': c(['click', 'press:Enter'], ['A06', 'A08']),
		'negotiation.complete': c(['click', 'click-disabled', 'press:Enter'], ['A09', 'A10', 'A11']),
	},
});
