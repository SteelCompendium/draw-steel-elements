// SC-438 e2e driver: helpers for the montage tracker and its three modals, composed from `dse` (the way driver/pool.ts is for the
// minion pool modal). Per-test setup lives here, not in a `beforeEach`. Fixture notes are in vaults/shipped/Montage/.
import { dse } from './dse';

export const EMPTY = 'Montage/empty.md'; // no heroes, no limits (0 / 0), round 1 of 2
export const FRESH = 'Montage/fresh.md'; // Kira and Bram, nothing logged, round 1 of 3, limits 3 / 2
export const MID = 'Montage/mid.md'; // title, brief, Kira / Bram / Osric (no skills list) / Yenna (no round-1 entry), round 2 of 3, limits 4 / 3
export const BRINK = 'Montage/brink.md'; // 2 of 3 successes in round 2: "One success from Total Success"
export const ACTED = 'Montage/acted.md'; // both heroes have acted in the round in play: "Log an action..." is disabled
export const DONE = 'Montage/done.md'; // Total Success (2 of 2), not reopenable
export const FAILED = 'Montage/failed.md'; // Total Failure (2 of 2 failures), not reopenable
export const EXHAUSTED = 'Montage/exhausted.md'; // out of rounds (round 3 of 2), Partial Success, reopenable
export const OVER = 'Montage/over-limit.md'; // hand-edited past both limits (4 of 2 successes, 3 of 1 failures)
export const WIDE = 'Montage/wide.md'; // twelve rounds: the board scrolls, the hero column is pinned
export const HAND = 'Montage/hand-written.md'; // scalar `skills_used`, a hero with no list, an entry with an unrecognised result
export const TWO = 'Montage/two-blocks.md'; // two different blocks with prose above, between and below
export const TWINS = 'Montage/twins.md'; // two IDENTICAL blocks with prose above, between and below
export const MONTAGE = 'ds-montage';

type Scope = ReturnType<typeof dse.block>;
type Modal = Awaited<ReturnType<typeof dse.modal>>;

/** Which montage modal: the Log an action sheet, Add a hero, or Set limits. */
export type MontageModalKind = 'montage-log' | 'montage-add-hero' | 'montage-limits';

/** Open `note` in Reading view and hand back the (`block`-th) montage's scope. */
export async function openMontage(note: string, block = 0): Promise<Scope> {
	await dse.openNote(note);
	return dse.block(MONTAGE, block);
}

/** Hover the montage (the chrome panel stays hidden until the pointer is over it) and click one of its chrome items. */
export async function clickChrome(root: Scope, id: string): Promise<void> {
	await dse.hover(root.root);
	await dse.click(root.control(id));
}

/** The Log an action sheet, opened from the bar's "Log an action..." button. */
export async function openLogFromBar(note: string, block = 0): Promise<{ root: Scope; modal: Modal }> {
	const root = await openMontage(note, block);
	await dse.click(root.control('montage.bar.log'));
	return { root, modal: await dse.modal('montage-log') };
}

/** The Add a hero modal, opened from the chrome item (default) or the board header's "+". */
export async function openAddHero(note: string, via: 'chrome' | 'board' = 'chrome', block = 0): Promise<{ root: Scope; modal: Modal }> {
	const root = await openMontage(note, block);
	if (via === 'chrome') await clickChrome(root, 'montage.chrome.add-hero');
	else await dse.click(root.control('montage.board.add-hero'));
	return { root, modal: await dse.modal('montage-add-hero') };
}

/** The Set limits modal, opened from the chrome item. */
export async function openLimits(note: string, block = 0): Promise<{ root: Scope; modal: Modal }> {
	const root = await openMontage(note, block);
	await clickChrome(root, 'montage.chrome.set-limits');
	return { root, modal: await dse.modal('montage-limits') };
}
