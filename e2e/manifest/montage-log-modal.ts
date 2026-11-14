// LogActionModal (src/elements/montage/LogActionModal.ts): the "Log an action..." sheet, new mode (title "<hero> · round N", a Result
// chip group, a Skill field with its reuse warning, a Note, footer Cancel / Log) and edit mode (the same fields pre-filled, footer
// Remove / Cancel / Save) (SC-438). One `montage.log.submit` id covers both the "Log" and the "Save" button, one `montage.log.remove`
// the edit-only Remove. Obsidian's own X and backdrop are host ids the driver resolves from its selectors.
// `rows` cite the SC-438 scenario group L: L01 result chips, L02 skill, L03 note, L04 log, L05 save, L06 remove, L07 cancel, L08 Escape
// / close / backdrop, L09 disabled Log / Save, L10 keyboard.
import { c, surface } from './surface';

export default surface('montage-log-modal', {
	reach: [
		{ host: 'montage', control: 'montage.cell', ...c(['click'], ['L04', 'L05', 'L06']) },
		{ host: 'montage', control: 'montage.cell.socket', ...c(['click'], ['L04']) },
		{ host: 'montage', control: 'montage.board.row-act', ...c(['click'], ['L04', 'L05']) },
		{ host: 'montage', control: 'montage.bar.log', ...c(['click'], ['L04']) },
	],
	controls: {
		// -- L01. The Result chips (a pressed-state group; a new sheet starts on Success, an edit starts on the entry's own result,
		//    and an entry with an unrecognised result starts with none pressed and Log / Save disabled).
		'montage.log.result.success': c(['click'], ['L01']),
		'montage.log.result.failure': c(['click'], ['L01']),
		'montage.log.result.assist': c(['click'], ['L01']),
		// -- L02, L03. Skill (a warning, never a block, when the hero already used it) and Note (multi-line, optional).
		'montage.log.skill': c(['type'], ['L02']),
		'montage.log.note': c(['type', 'press:Escape'], ['L03', 'L08']),
		// -- L04-L07, L09, L10. Footer. Log / Save is real-disabled until a Result is chosen, when the round has no board column,
		//    or when a NEW sheet is for a (hero, round) that already has an entry.
		'montage.log.remove': c(['click'], ['L06']),
		'montage.log.cancel': c(['click', 'press:Enter'], ['L07', 'L10']),
		'montage.log.submit': c(['click', 'click-disabled', 'press:Enter'], ['L04', 'L05', 'L09', 'L10']),
		// -- L08. Obsidian host controls (resolved by the driver from Obsidian's selectors)
		'modal.close': c(['click', 'press:Escape'], ['L08']),
		'modal.backdrop': c(['click'], ['L08']),
	},
});
