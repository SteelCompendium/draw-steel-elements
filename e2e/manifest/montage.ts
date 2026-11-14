// The montage tracker's own controls (src/elements/montage/: view.ts, BoardView.ts, StripView.ts, GuideView.ts): the chrome
// panel's four items, the board (the Heroes "+", each hero's "Log an action for <hero>" button, the round cells and the quick
// trio inside the open one), the bottom action bar and the two disclosures (SC-438).
// NOT listed here, because the modals own them (the ids reach those manifests as `reach` rows):
//   - the "Log an action..." sheet (manifest/montage-log-modal.ts, ids `montage.log.*`);
//   - "Add a hero" (manifest/montage-add-hero-modal.ts, ids `montage.add-hero.*`);
//   - "Set limits..." (manifest/montage-limits-modal.ts, ids `montage.limits.*`).
// Id naming: the bar's buttons are `montage.bar.*` and the chrome items `montage.chrome.*` so a `montage.log.*` / `montage.add-hero.*`
// prefix always means a modal control, never a bar button or a chrome item that merely shares its name.
// `rows` cite the SC-438 scenario groups: C chrome panel, B board, R action bar, G strip and guide (`MONT-<group><nn>`).
// A repeated control is driven through `nth`. The chrome panel is hidden (opacity 0) until the pointer is over the montage or
// focus is inside it: `dse.hover(root.root)` first.
import { c, surface } from './surface';

export default surface('montage', {
	controls: {
		// -- C. The chrome panel's four items. "Add a round" and "Reset progress" act at once (a Notice for Reset); "Add a hero" and
		//    "Set limits..." open their modal. Omitted entirely on a read-only host.
		'montage.chrome.add-round': c(['click', 'press:Enter'], ['C01']),
		'montage.chrome.add-hero': c(['click', 'press:Enter'], ['C02']),
		'montage.chrome.set-limits': c(['click', 'press:Enter'], ['C03']),
		'montage.chrome.reset-progress': c(['click', 'press:Enter'], ['C04']),

		// -- B. The board.
		//    The Heroes header's "+": the same "Add a hero" as the chrome item.
		'montage.board.add-hero': c(['click'], ['B01']),
		//    Each hero's name cell has "Log an action for <hero>": a new sheet for the round in play, or the edit sheet when that
		//    hero's cell for it is already filled. Real-disabled once the montage is complete.
		'montage.board.row-act': c(['click', 'click-disabled'], ['B02', 'B03']),
		//    A round cell with `role=button` + `tabindex=0`: a filled cell (edit sheet), an empty cell of a played round (new sheet).
		//    Enter and Space click it by hand-written key handling (not a native button).
		'montage.cell': c(['click', 'press:Enter', 'press:Space'], ['B04', 'B05', 'B06']),
		//    The open socket of the round in play (no role, no tabindex): a click anywhere on it but the quick trio opens the new sheet.
		'montage.cell.socket': c(['click'], ['B07']),
		//    The quick trio inside the open socket: one tap writes the entry at once (no skill, no note). One id per outcome so each
		//    kind is driven.
		'montage.quick.success': c(['click'], ['B08']),
		'montage.quick.failure': c(['click'], ['B08']),
		'montage.quick.assist': c(['click'], ['B08']),

		// -- R. The bottom action bar. Live: Log an action... / Undo / Back to round N / End round N. Complete: Undo / Back to round N /
		//    Reopen (only a montage that ran out of rounds) / Clear all. "Log an action..." disables when every hero has acted in the
		//    round in play (or there are no heroes); "Undo" disables with nothing logged. "Back to round N" and "Reopen" are absent
		//    when they do not apply.
		'montage.bar.log': c(['click', 'click-disabled'], ['R01', 'R02']),
		'montage.bar.undo': c(['click', 'click-disabled'], ['R03', 'R04']),
		'montage.bar.back': c(['click'], ['R05']),
		'montage.bar.end-round': c(['click'], ['R06']),
		'montage.bar.reopen': c(['click'], ['R07']),
		'montage.bar.clear-all': c(['click'], ['R08']),

		// -- G. The two session-only disclosures (Test tiers strip, "Running a montage test" guide): never a note write.
		'montage.strip': c(['click', 'press:Enter'], ['G01', 'G02']),
		'montage.guide': c(['click'], ['G03']),
	},
});
