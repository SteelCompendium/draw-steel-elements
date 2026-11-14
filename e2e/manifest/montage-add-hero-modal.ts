// MontageAddHeroModal (src/elements/montage/ConfigModals.ts): "Add a hero", a name field with Cancel / Add (SC-438). Opened by the chrome
// panel's "Add a hero" item or the board header's "+". Add stays real-disabled until the name has a non-space character.
// Obsidian's own X and backdrop are host ids the driver resolves from its selectors.
// `rows` cite the SC-438 scenario group H: H01 add, H02 empty / blank name, H03 cancel, H04 Escape / close / backdrop, H05 keyboard.
import { c, surface } from './surface';

export default surface('montage-add-hero-modal', {
	reach: [
		{ host: 'montage', control: 'montage.chrome.add-hero', ...c(['click'], ['H01']) },
		{ host: 'montage', control: 'montage.board.add-hero', ...c(['click'], ['H01']) },
	],
	controls: {
		'montage.add-hero.name': c(['type', 'press:Escape'], ['H01', 'H02', 'H04']),
		'montage.add-hero.cancel': c(['click', 'press:Enter'], ['H03', 'H05']),
		'montage.add-hero.submit': c(['click', 'click-disabled', 'press:Enter'], ['H01', 'H02', 'H05']),
		'modal.close': c(['click', 'press:Escape'], ['H04']),
		'modal.backdrop': c(['click'], ['H04']),
	},
});
