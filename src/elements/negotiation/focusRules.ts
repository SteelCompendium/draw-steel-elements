// SC-642 — where keyboard focus goes when the control a keyboard user pressed on the negotiation card is no longer usable. The shared kit
// helper (`framework/kit/controlFocus.ts`, SC-588 / SC-626) does the capture / restore; this file is only this card's mapping.
//
// Complete Argument disarms the very button it was pressed on (the argument is spent, so no tier is chosen and the button is disabled), and
// Chromium blurs a focused button as it is disabled, inside the same click dispatch (2-3 ms after the click, about 410 ms before the save lands):
// focus ended on <body>, in Reading view and in Live Preview (measured, SC-642 r1 / r2). The card is not rebuilt by that write, so nothing hands
// focus back.
//
// Landing: the FIRST USABLE control of the Argument tab, in Tab order, i.e. where the NEXT argument starts: the first Motivation chip, else
// the first Pitfall chip, else the "NPC caught a lie" box (the one modifier that is always enabled; the other two are greyed out until a
// motivation is appealed to). The tier rows are never a landing: they are not chosen yet, and there are none while the negotiation is over.
// Rejected: the Complete button itself (disabled, so no Tab stop); the first tier row (skips the appeals the next argument may still want,
// and does not exist once the write ended the negotiation); the card root (a Tab from it re-enters at the top of the card, which is the
// same place with an extra step); the pressed button's neighbour by position (the hint text, not a control).
//
// SC-639: Reset rebuilds the whole card, so the options button the menu was opened from is thrown away with it, and focus falls to <body> (measured
// in real Obsidian, Reading view and Live Preview: the button holds focus through the whole time the menu is open, the click on Reset detaches it, and
// the old button's focusout is the last card event). "Was focus in the card" is asked when the menu OPENS (view.ts), not when Reset is chosen, so a
// menu that one day takes DOM focus for itself cannot make the answer null. Landing: the NEW card's options button, the control the user came from;
// a Reset chosen while focus was elsewhere moves nothing.
import type { ControlFallbacks } from '@/framework/kit/controlFocus';

/** SC-639: the control Reset hands focus to on the rebuilt card: the options button the menu was opened from (see `resetNegotiation` in view.ts). */
export const RESET_LANDING = 'negotiation.menu';

/** Family -> the families to try, in order, when the control's own family has no usable control. Same shape as the montage's. */
export const NEGOTIATION_FOCUS_FALLBACKS: ControlFallbacks = {
	'negotiation.complete': ['negotiation.appeal.motivation', 'negotiation.appeal.pitfall', 'negotiation.mod.lie'],
	// SC-639: the options button is always rebuilt with the card (SC-641 decided Reset stays and falls back to the defaults, so the button is never hidden), so this is a guard. If it is ever
	// absent: the card's tabs (the first Tab stop below the standing), else the card itself (`tabindex=-1`, the kit's last resort).
	// SC-656: an outside edit can disable the box that has focus (a motivation appealed to elsewhere greys out "same argument"; one un-spent greys out
	// "reuse"). The lie box is the one modifier that is always enabled and sits between the two; else the first motivation chip.
	'negotiation.mod.same': ['negotiation.mod.lie', 'negotiation.appeal.motivation'],
	'negotiation.mod.reuse': ['negotiation.mod.lie', 'negotiation.appeal.motivation'],
	[RESET_LANDING]: ['negotiation.tab.argument', 'negotiation.tab.learn-more'],
};
