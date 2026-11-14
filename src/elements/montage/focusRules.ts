// SC-626 — where keyboard focus goes when a montage control is replaced by the rebuild a write (or the Test tiers strip) causes.
// The montage empties its root and builds it again on every change (`MontageView.update`), so the node that held focus is gone;
// `kit/controlFocus.ts` hands focus to the control that stands for it. Most controls come back with the same id and the same
// position, and need nothing here. The rest are listed below: a control that changes identity when used (the quick trio, the open
// socket), and a control that can be GONE or DISABLED once the write has landed, which needs a nearest equivalent.
//
// Ids are the `data-dse-control` names (e2e/manifest/montage*.ts). A rule applies only when focus was inside the card (or the window
// that wrote) before the write: nothing here ever pulls focus in.
import type { ControlFallbacks, ControlFamilies } from '@/framework/kit/controlFocus';

/** Controls that turn into one another: the open socket of the round in play, and the three quick buttons inside it, become the
 *  recorded cell (same hero, same round) when one is pressed. The cell is named by `data-dse-focus-at` (BoardView), not by position:
 *  the set of cells that are controls changes when the montage completes. */
export const MONTAGE_FOCUS_FAMILIES: ControlFamilies = {
	'montage.cell.socket': 'montage.cell',
	'montage.quick.success': 'montage.cell',
	'montage.quick.failure': 'montage.cell',
	'montage.quick.assist': 'montage.cell',
};

/** Nearest equivalents, by family: tried in order when the control has no usable (enabled, focusable) successor after the write. A
 *  family with an entry also skips an unusable control for the nearest usable one of its own family.
 *
 *  The bar, live: Log an action · Undo · [Back to round N] · End round N. Complete: Undo · [Back to round N] · [Reopen] · Clear all.
 *  Clear all is never a landing: a second Enter on it would wipe the montage.
 *  - Log an action: disabled once every hero has acted (the next move is End round), gone when the write completed the montage
 *    (Undo, the control that reverses what was just logged).
 *  - Undo: disabled once nothing is left to undo (Log an action, the natural next move), else End round.
 *  - Back to round N: gone at round 1 (End round, the control it reversed).
 *  - End round N: gone when it ended the last round and the montage is complete (Back to round N, which reverses it; else Reopen; else Undo).
 *  - Reopen / Clear all: the montage runs again, so Log an action (else End round).
 *  - Log an action for <hero> (row): all disabled once the montage is complete (Undo, then Reopen).
 *  - A cell: Remove / Undo turn the recorded cell of the round in play into the open socket, which is no Tab stop: focus goes to the first
 *    quick button inside it (same cell, same `at`; it only focuses, nothing is logged). A cell is gone only when the montage completed and
 *    it was an empty past round (Log an action, End round, Undo). */
export const MONTAGE_FOCUS_FALLBACKS: ControlFallbacks = {
	'montage.bar.log': ['montage.bar.end-round', 'montage.bar.undo', 'montage.bar.back'],
	'montage.bar.undo': ['montage.bar.log', 'montage.bar.end-round'],
	'montage.bar.back': ['montage.bar.end-round', 'montage.bar.log', 'montage.bar.undo'],
	'montage.bar.end-round': ['montage.bar.back', 'montage.bar.reopen', 'montage.bar.undo'],
	'montage.bar.reopen': ['montage.bar.log', 'montage.bar.end-round', 'montage.bar.undo'],
	'montage.bar.clear-all': ['montage.bar.log', 'montage.bar.end-round'],
	'montage.board.row-act': ['montage.bar.undo', 'montage.bar.reopen'],
	'montage.cell': ['montage.bar.log', 'montage.bar.end-round', 'montage.bar.undo'],
};
