// MontageRemoveHeroModal (src/elements/montage/ConfigModals.ts): "Remove a hero" (SC-690), one chip per hero on the board (nothing picked at first), a plain
// line saying what the picked hero's removal takes with it, and Cancel / Remove (Remove stays real-disabled, reading plain "Remove", until a hero is picked; then it reads "Remove <name>"). Opened by the chrome
// panel's "Remove a hero" item, which is not offered while the board has no hero. Remove takes the hero's row, `skills_used` and logged actions off the note and
// the tally follows. The hero chips share one id; the hero's name is on `data-dse-focus-at` (the way the board names a hero's controls), so a chip is driven
// by `nth` or by that attribute. Obsidian's own X and backdrop are host ids the driver resolves from its selectors.
// `rows` cite the SC-690 scenario group D: D01 the window and its list, D02 picking and the line, D03 Remove with logged actions, D04 Cancel, D05 Escape / close /
// backdrop, D06 keyboard, D07 the last hero, D08-D14 what the write leaves alone (another block, twins, unknown keys, hand-written and quoted values), D15 remove
// then add the same name, D16 an outside edit while the window is open, D17 a short window with many heroes, D18 two heroes with one name. C07 (chrome.e2e.ts) is the item itself, F14-F17 (focus.e2e.ts) where focus goes.
import { c, surface } from './surface';

export default surface('montage-remove-hero-modal', {
	reach: [{ host: 'montage', control: 'montage.chrome.remove-hero', ...c(['click'], ['D01']) }],
	controls: {
		'montage.remove-hero.hero': c(['click', 'press:Enter', 'press:Escape'], ['D02', 'D03', 'D05', 'D06', 'D17', 'D18']),
		'montage.remove-hero.cancel': c(['click', 'press:Enter'], ['D04']),
		'montage.remove-hero.submit': c(['click', 'click-disabled', 'press:Enter'], ['D01', 'D03', 'D06']),
		'modal.close': c(['click', 'press:Escape'], ['D05']),
		'modal.backdrop': c(['click'], ['D05']),
	},
});
