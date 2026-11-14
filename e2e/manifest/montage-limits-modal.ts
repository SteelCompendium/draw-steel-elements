// MontageSetLimitsModal (src/elements/montage/ConfigModals.ts): "Set limits...", a Success limit and a Failure limit number field (both
// pre-filled with the current limits) with Cancel / Save (SC-438). Opened by the chrome panel's "Set limits..." item. Save writes
// `Number(value) || 0` truncated and floored at 0 (0 means "no limit set").
// Obsidian's own X and backdrop are host ids the driver resolves from its selectors.
// `rows` cite the SC-438 scenario group S: S01 save, S02 invalid / cleared value, S03 limit below the current tally, S04 cancel,
// S05 Escape / close / backdrop, S06 keyboard.
import { c, surface } from './surface';

export default surface('montage-limits-modal', {
	reach: [{ host: 'montage', control: 'montage.chrome.set-limits', ...c(['click'], ['S01']) }],
	controls: {
		'montage.limits.success': c(['type'], ['S01', 'S02', 'S03']),
		'montage.limits.failure': c(['type'], ['S01', 'S02', 'S03']),
		'montage.limits.cancel': c(['click', 'press:Enter'], ['S04', 'S06']),
		'montage.limits.save': c(['click', 'press:Enter'], ['S01', 'S06']),
		'modal.close': c(['click', 'press:Escape'], ['S05']),
		'modal.backdrop': c(['click'], ['S05']),
	},
});
