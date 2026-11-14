// SC-439 e2e driver: helpers for the negotiation tracker, composed from `dse` (the way driver/pool.ts is for the minion pool modal).
// Per-test setup lives here, not in a `beforeEach`. Fixture notes are in vaults/shipped/Negotiation/.
import { expect } from '@wdio/globals';
import { dse } from './dse';

export const BASIC = 'Negotiation/basic.md'; // Frodo, Interest 3 / Patience 3, Higher Authority + Peace unspent, pitfall Power
export const SPENT = 'Negotiation/spent.md'; // the same at 3 / 3 of 4, Higher Authority already spent
export const ENDED = 'Negotiation/ended.md'; // Patience 0 at Interest 3, both spent: "Final offer"
export const DEAL = 'Negotiation/deal.md'; // Interest 5
export const HOSTILE = 'Negotiation/hostile.md'; // Interest 0
export const MINIMAL = 'Negotiation/minimal.md'; // `name:` only
export const TWO = 'Negotiation/two-blocks.md'; // the innkeeper (3 / 3) and the guard captain (2 / 4), prose above, between, below
export const UNKNOWN = 'Negotiation/unknown-keys.md'; // `note_to_self`, and `gm_note` in a motivation and a pitfall
export const WRONG_NAME = 'Negotiation/wrong-name.md'; // `name: 2024`
export const FRACTION = 'Negotiation/fraction.md'; // `current_interest: 0.4`
export const DUPLICATES = 'Negotiation/dup-names.md'; // two motivations both named Higher Authority
export const NAMELESS = 'Negotiation/nameless.md'; // a motivation with a reason and no name
export const CURRENT_ONLY = 'Negotiation/current-only.md'; // `current_interest: 3`, `current_patience: 2`, no initial_*
export const QUOTED = 'Negotiation/quoted.md'; // `current_interest: "3"`, `current_patience: "2"`
export const NEGO = 'ds-negotiation';
/** Tab presses from the top of the note to a control (the chrome panel, the options button and the tabs are in the way). */
export const TABS = 60;

type Scope = ReturnType<typeof dse.block>;
type Modal = Awaited<ReturnType<typeof dse.modal>>;
export type { Scope, Modal };

/** Open `note` in Reading view and hand back the (`block`-th) negotiation's scope. */
export async function openNego(note: string, block = 0): Promise<Scope> {
	await dse.openNote(note);
	return dse.block(NEGO, block);
}

/** The negotiation block as the note holds it (the n-th `ds-negotiation` fence). */
export interface Block {
	name?: unknown;
	initial_interest?: number | string;
	initial_patience?: number | string;
	current_interest?: number | string;
	current_patience?: number | string;
	motivations?: Array<{ name?: string; reason?: string; hasBeenAppealedTo?: boolean; [key: string]: unknown }>;
	pitfalls?: Array<{ name?: string; reason?: string; [key: string]: unknown }>;
	currentArgument?: { motivationsUsed: string[]; pitfallsUsed: string[]; lieUsed: boolean; sameArgumentUsed: boolean; reusedMotivation: boolean };
	[key: string]: unknown;
}
export const blockOf = (note: string, n = 0): Promise<Block> => dse.expectNoteBlock(note, NEGO, n).value() as Promise<Block>;

/** The standing a block holds: `current_*`, else the `initial_*` it was drawn from (a write back to the initial value omits a key the note never declared, SC-482). */
export const patienceOf = (b: Block): number | string | undefined => b.current_patience ?? b.initial_patience;
export const interestOf = (b: Block): number | string | undefined => b.current_interest ?? b.initial_interest;

/** The argument under way as a block holds it (a block that never declared it, or wrote it back cleared, reads as the cleared one). */
export const argOf = (b: Block): NonNullable<Block['currentArgument']> =>
	b.currentArgument ?? { motivationsUsed: [], pitfallsUsed: [], lieUsed: false, sameArgumentUsed: false, reusedMotivation: false };

/** A Patience seal by its value (the DOM order is 0..5). */
export const patienceSeal = (root: Scope, value: number) => root.control('negotiation.patience.seal', { nth: value });
/** An Interest row by its value (the DOM order is 5..0, so the value 5 is `nth` 0). */
export const interestSeal = (root: Scope, value: number) => root.control('negotiation.interest.seal', { nth: 5 - value });

/** The page-side expression for the n-th negotiation card in the Reading view (a node to READ). */
const card = (n: number): string => `[...document.querySelectorAll('.markdown-reading-view [data-dse-element="negotiation"]')][${n}]`;

/** What the card shows: the checked seals (values), the ending (`data-ended`), the band's label, the open tab and Complete's state. */
export interface Shown {
	patience: number[];
	interest: number[];
	ended: string | null;
	band: string | null;
	readout: string | null;
	tab: string | null;
	completeDisabled: boolean | null;
	hint: string | null;
}
export const shown = (n = 0): Promise<Shown> =>
	dse.page<Shown>(`(() => {
		const r = ${card(n)};
		const on = (id) => [...r.querySelectorAll('[data-dse-control="negotiation.' + id + '.seal"]')].filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => Number(s.dataset.value));
		const complete = r.querySelector('[data-dse-control="negotiation.complete"]');
		return {
			patience: on('patience'),
			interest: on('interest'),
			ended: r.querySelector('.dse-nt')?.getAttribute('data-ended') ?? null,
			band: r.querySelector('.dse-nt__end .dse-nt__end-label')?.textContent ?? null,
			readout: r.querySelector('.dse-nt__readout-value')?.textContent ?? null,
			tab: r.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-dse-control') ?? null,
			completeDisabled: complete ? complete.disabled : null,
			hint: r.querySelector('.dse-nt__complete-hint')?.textContent ?? null,
		};
	})()`);

/** The text of the tier rows on the argument tab, Low to Crit (empty while the negotiation is over: the tiers are static then). */
export const tierTexts = (n = 0): Promise<string[]> =>
	dse.page<string[]>(`[...${card(n)}.querySelectorAll('[data-dse-control="negotiation.tier.row"] .dse-pr__text')].map((e) => e.textContent)`);

/** Which of a repeated control are pressed / checked: `aria-pressed` of every chip or Spent chip, in DOM order. */
export const pressedOf = (id: string, n = 0): Promise<string[]> =>
	dse.page<string[]>(`[...${card(n)}.querySelectorAll('[data-dse-control="${id}"]')].map((e) => e.getAttribute('aria-pressed'))`);

/** The three modifier checkboxes: checked / disabled, and the reason shown under a greyed-out line. */
export interface Mods {
	reuse: { checked: boolean; disabled: boolean; why: string | null };
	lie: { checked: boolean; disabled: boolean; why: string | null };
	same: { checked: boolean; disabled: boolean; why: string | null };
}
export const mods = (n = 0): Promise<Mods> =>
	dse.page<Mods>(`(() => {
		const r = ${card(n)};
		const one = (w) => { const b = r.querySelector('[data-dse-control="negotiation.mod.' + w + '"]'); return { checked: b.checked, disabled: b.disabled, why: b.closest('label').querySelector('.dse-nt__why')?.textContent ?? null }; };
		return { reuse: one('reuse'), lie: one('lie'), same: one('same') };
	})()`);

/** Where keyboard focus is: the control id (or null) and whether it is inside the n-th card. */
export const focusState = (n = 0): Promise<{ ctl: string | null; inCard: boolean; tag: string }> =>
	dse.page(`(() => {
		const a = document.activeElement;
		const c = ${card(n)};
		return { ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null, inCard: !!(a && c && c.contains(a)), tag: a?.tagName ?? '' };
	})()`);

/** Open the options menu with a real click and wait for the native menu to show. */
export async function openMenu(root: Scope): Promise<void> {
	await dse.click(root.control('negotiation.menu'));
	await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the options menu to open');
}

/** Choose "Reset negotiation" from the open menu with a real click: the one write. Returns the write count. */
export async function chooseReset(note: string): Promise<number> {
	const w = await dse.waitForWrite(note, () => dse.click(dse.control('negotiation.menu.reset')));
	await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
	return w.count;
}

/** Assert the Learn Motivation/Pitfall tab is showing (or not) by its rules text. */
export async function expectLearnShowing(root: Scope, showing: boolean): Promise<void> {
	const learn = root.control({ css: '.dse-nt__learn-more' });
	if (showing) await expect(learn).toBeDisplayed();
	else await expect(learn).not.toBeDisplayed();
}

/** The Motivations card: how many are open ("1 of 2 open") and which rows are struck as spent, in DOM order. */
export const dossier = (n = 0): Promise<{ count: string | null; spent: boolean[]; chips: string[] }> =>
	dse.page(`(() => {
		const r = ${card(n)};
		const col = r.querySelector('.dse-nt__dossier-col[data-kind="motivation"]');
		return {
			count: col?.querySelector('.dse-nt__dossier-count')?.textContent ?? null,
			spent: [...(col?.querySelectorAll('.dse-nt__dos') ?? [])].map((row) => row.classList.contains('is-spent')),
			chips: [...(col?.querySelectorAll('[data-dse-control="negotiation.spent"]') ?? [])].map((c) => (c.textContent ?? '').trim()),
		};
	})()`);
