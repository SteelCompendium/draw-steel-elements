// SC-438 e2e driver: helpers for the montage tracker and its three modals, composed from `dse` (the way driver/pool.ts is for the
// minion pool modal). Per-test setup lives here, not in a `beforeEach`. Fixture notes are in vaults/shipped/Montage/.
import { expect } from '@wdio/globals';
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
export const WIDE_ENTRIES = 'Montage/wide-entries.md'; // the wide board with Kira's entries in rounds 4, 5 and 10 (focusable cells to the right of round 1)
export const HAND = 'Montage/hand-written.md'; // scalar `skills_used`, a hero with no list, an entry with an unrecognised result
export const TWO = 'Montage/two-blocks.md'; // two different blocks with prose above, between and below
export const TWINS = 'Montage/twins.md'; // two IDENTICAL blocks with prose above, between and below
export const UNKNOWN = 'Montage/unknown-keys.md'; // a top-level key, an entry key and a participant key the product does not know (SC-625)
export const MONTAGE = 'ds-montage';
/** Tab presses from the top of the note to a control (the chrome panel and the whole board are in the way). */
export const TABS = 80;

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

/** The montage block as the note holds it (the n-th `ds-montage` fence). */
export interface Block {
	title?: string;
	rounds: number;
	success_limit: number;
	failure_limit: number;
	successes: number;
	failures: number;
	participants?: Array<{ name: string; skills_used?: string[] }>;
	entries?: Array<{ hero: string; round: number; result: string; skill?: string; note?: string }>;
	current_round: number;
	[key: string]: unknown;
}
export const blockOf = (note: string, n = 0): Promise<Block> => dse.expectNoteBlock(note, MONTAGE, n).value() as Promise<Block>;

/** A board cell by hero and round (a node to READ: its `data-kind`, `data-state`, label). */
export const cellOf = (root: Scope, hero: string, round: number) => root.control({ css: `.dse-mt__cell[data-hero="${hero}"][data-round="${round}"]` });
/** The head's round chip ("Round 2 / 3" / "Complete"), the band's verdict word and the tail of a track. Read as `textContent` (the Steel screen restyles the visible text). */
export const roundChip = (root: Scope) => root.control({ css: '.dse-head__eyebrow--right' });
export const verdict = (root: Scope) => root.control({ css: '.dse-mt__verdict-word' });
export const trackTail = (root: Scope, kind: 'success' | 'failure') => root.control({ css: `.dse-mt__prog[data-kind="${kind}"] .dse-mt__prog-tail` });
export const expectText = (el: ReturnType<Scope['control']>, text: string) => expect(el).toHaveElementProperty('textContent', text);

/** How many `.modal-container`s are open (an orphan fails every test, so a dismissal is asserted explicitly). */
export const modalsOpen = (): Promise<number> => dse.page<number>(`document.querySelectorAll('.modal-container').length`);

/** The control ids of the action bar, left to right. */
export const barIds = (): Promise<string[]> =>
	dse.page<string[]>(`Array.from(document.querySelectorAll('.markdown-reading-view [data-dse-element="montage"] .dse-mt__actionrow [data-dse-control]')).map((e) => e.getAttribute('data-dse-control'))`);

/** What holds focus: its control id, whether it is inside the Reading view's montage, the keyboard ring. */
export const focusState = () =>
	dse.page<{ ctl: string | null; inMontage: boolean; ring: boolean }>(`(() => {
		const a = document.activeElement;
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			inMontage: !!a?.closest('.markdown-reading-view [data-dse-element="montage"]'),
			ring: !!a && a.matches(':focus-visible'),
		};
	})()`);

/** Close the open modal with Escape through its X (the host control Escape is aimed at while focus sits in a field). */
export async function dismiss(modal: Modal): Promise<void> {
	await dse.click(modal.control('modal.close'));
	await expect(modal.root).not.toBeExisting();
}

/** A hero's "Log an action for <hero>" button is drawn only while the pointer is over the hero's name cell (opacity 0 otherwise): `await hoverHero(...)` first. */
export const hoverHero = (root: Scope, hero: string): Promise<void> => dse.hover(root.control({ css: `.dse-mt__board-name[data-hero="${hero}"]` }));
/** The n-th hero's row button (by id, so a click on it is a credited drive; `hoverHero` first). */
export const rowAct = (root: Scope, nth: number) => root.control('montage.board.row-act', { nth });

/** The open state lives in the plugin's session store, keyed by the block, so it outlives a test (and the note being reset): start every test closed. */
export async function closeDisclosures(root: Scope): Promise<void> {
	for (const id of ['montage.strip', 'montage.guide']) {
		if ((await root.control(id).getAttribute('aria-expanded')) === 'true') {
			await dse.click(root.control(id));
			await expect(root.control(id)).toHaveAttribute('aria-expanded', 'false');
		}
	}
}

