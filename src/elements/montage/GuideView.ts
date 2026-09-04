// SC-191 impl spec §I slice 3 / §D "foot rules panel" — the montage's rules-guidance
// disclosure: a `kit/collapsible` (session-persisted, `slot: 'montage.guide'`), CLOSED by
// default (ledger 2026-08-28: "collapable and collapsed by default"), sitting at the very
// foot of the card, and EXPANDED IN PRINT — a rules panel on a printed card is exactly the
// surface a Director reaches for at the table, so its structural layout lives in the
// montage's base (print-reaching) CSS tier, unlike the strip (spec §E: "the guide panel
// expanded" is one of the three named exceptions to the Steel-only/print-excluded rule).
// The force-open-under-print behaviour itself is NOT bespoke here — it is the plugin-wide
// `.dse-collapse__region[hidden] { display: block !important }` print rule every
// `kit/collapsible` already carries (styles-source.css's "Print RULES" section); this view
// only has to make sure the CONTENT is laid out correctly once that fires.
//
// READS NOTHING FROM THE MODEL (spec §B.2) — every line here is the book's own rules text,
// condensed only where a table cell demands it.
//
// THE PINNED-STUB DEDUP (ledger 2026-08-29/08-30, round 5/6): with the cheat-sheet strip
// pinned (open) above the board, restating the same tier table one band lower is the exact
// duplication round 4 spent its whole budget removing — dedup does not stop applying
// because the duplicate happens to be a rules table. So when `stripOpen` is true, the
// "Each test" block collapses to a one-line pointer; the strip (round 6) now carries the
// WHOLE book table including the crit row, so there is no orphan fact left for the stub to
// carry (unlike round 5's strip, which dropped the crit row and needed a leftover line).
//
// FIX ROUND 3 (review-2 H-1's dedup half) — BOTH forms are now always built into the DOM,
// tagged `.dse-mt__guide-tiers-{full,stub}`, and CSS (not this build-time branch) decides
// which one shows. Print is WHY: `stripOpen` is a screen-only pin state fixed at BUILD
// time, but print is a pure CSS presentation layer replayed over that same already-built
// DOM — before this fix, if `stripOpen` was true the FULL table simply never existed in the
// DOM at all, so no print rule could ever surface it (moot before H-1's own fix, since the
// strip itself printed as an unreadable blob either way — but once the strip prints a real
// table, the two need independent screen/print answers: screen still respects `stripOpen`
// via `[data-strip-open]` on the root; print ALWAYS shows the stub, because the strip now
// always prints its own full table regardless of its screen pin state (print force-opens
// every collapsible), so showing the full table here too would be a genuine on-paper
// duplicate no Director asked for.
import type { Component } from 'obsidian';
import { collapsible } from '@/framework/kit';
import type { SessionPersist } from '@/framework/session';

interface TableSpec {
	title: string;
	lede?: string;
	head: readonly string[];
	rows: readonly (readonly string[])[];
	foot?: string;
}

/** "Each test" — the book's Test Difficulty Outcomes table, power-roll rows × difficulty
 *  columns (Draw Steel Heroes:20471) — the SAME orientation the strip adopts (spec §A: the
 *  flip was to the Power Roll's own layout, which is also this panel's pre-existing one —
 *  "there is nothing to flip here", the strip was the surface that changed). */
const TIERS: TableSpec = {
	title: 'Each test',
	lede: 'The Director picks a difficulty per test; the power roll reads across.',
	head: ['Power roll', 'Easy', 'Medium', 'Hard'],
	rows: [
		['≤11', 'success, consequence', 'failure', 'failure, consequence'],
		['12–16', 'success', 'success, consequence', 'failure'],
		['17+', 'success, reward', 'success', 'success'],
		['nat 19–20', 'success, reward', 'success, reward', 'success, reward'],
	],
	foot: 'Any success counts toward the success limit; any failure counts toward the failure limit.',
};

/** "The montage" — Draw Steel Heroes:21306's success/failure limits per montage
 *  difficulty, and the party-size adjustment (:21320). */
const LIMITS: TableSpec = {
	title: 'The montage',
	lede: 'Success and failure limits, set before play.',
	head: ['Montage', '✓ limit', '✕ limit'],
	rows: [
		['Easy', '5', '5'],
		['Moderate', '6', '4'],
		['Hard', '7', '3'],
	],
	foot: 'For five heroes. ±1 to both per hero over or under five, minimum 2.',
};

/** "At the table" — the five rules a Director gets asked about mid-montage and cannot
 *  derive from the board (round 4's quick-check ask: "maybe guidance on how to set
 *  difficulties or something … shouldnt take up a bunch of screen real estate"). */
const TABLE_BULLETS = [
	'Two rounds by default. Each hero acts once a round: a test, an assist, or an ability.',
	'No hero may use the same skill twice in one montage. An applicable skill grants +2.',
	'An assist is its own roll: ≤11 gives a bane, 12–16 an edge, 17+ a double edge.',
	'Hit the success limit → total success. Otherwise, at the failure limit or out of rounds: partial success if successes lead failures by 2, else total failure.',
	'Victories: total success 1 (easy or moderate) or 2 (hard); partial success 1 (moderate or hard).',
];

/** The pinned stub (round 6 — no orphan line: the strip's own crit row already carries the
 *  one fact round 5's stub had to state separately). */
const PINNED_TITLE = 'Each test';
const PINNED_LEDE = 'The full tier table is pinned above the board.';

export class GuideView {
	constructor(private readonly owner: Component) {}

	public build(container: HTMLElement, persist: SessionPersist, stripOpen: boolean): void {
		const handle = collapsible(
			container,
			{ title: 'Running a montage test', open: false, persist },
			this.owner,
		);
		handle.rootEl.addClass('dse-mt__guide');
		// FIX ROUND 3: screen-only dedup switch — see the file-header note. Print never
		// reads this attribute; it always resolves to the stub via its own, later rule.
		handle.rootEl.setAttribute('data-strip-open', stripOpen ? 'on' : 'off');
		handle.headerEl.createSpan({
			cls: 'dse-mt__guide-hint',
			text: stripOpen ? 'limits · outcomes · at the table' : 'test tiers · limits · outcomes',
		});

		const body = handle.contentEl.createDiv({ cls: 'dse-mt__guide-body' });

		// FIX ROUND 3: both forms always built now (see the file-header note) — CSS, not
		// this branch, decides which one is visible, so print can differ from screen.
		const stub = this.buildBlock(body, PINNED_TITLE, PINNED_LEDE, true);
		stub.setAttribute('data-stub', 'on');
		stub.addClass('dse-mt__guide-tiers-stub');
		const tiers = this.buildBlock(body, TIERS.title, TIERS.lede, true);
		tiers.addClass('dse-mt__guide-tiers-full');
		this.buildTable(tiers, TIERS);

		const limits = this.buildBlock(body, LIMITS.title, LIMITS.lede, false);
		this.buildTable(limits, LIMITS);

		const table = this.buildBlock(body, 'At the table', undefined, false);
		const ul = table.createEl('ul', { cls: 'dse-mt__guide-list' });
		for (const b of TABLE_BULLETS) ul.createEl('li', { cls: 'dse-mt__guide-item', text: b });
	}

	private buildBlock(parent: HTMLElement, title: string, lede: string | undefined, wide: boolean): HTMLElement {
		const s = parent.createDiv({ cls: wide ? 'dse-mt__guide-block dse-mt__guide-block--wide' : 'dse-mt__guide-block' });
		s.createEl('h4', { cls: 'dse-mt__guide-title', text: title });
		if (lede) s.createEl('p', { cls: 'dse-mt__guide-lede', text: lede });
		return s;
	}

	/** The same sanctioned geometry seam the board uses (spec §D2 §5, mirrored here): the
	 *  expanded column list arrives as ONE `setProperty('--dse-mt-guide-cols', …)` call —
	 *  never a per-column literal in TS. */
	private buildTable(host: HTMLElement, spec: TableSpec): void {
		const t = host.createDiv({ cls: 'dse-mt__guide-table' });
		t.style.setProperty('--dse-mt-guide-cols', 'auto ' + 'minmax(0, 1fr) '.repeat(spec.head.length - 1));
		spec.head.forEach((h, i) => {
			const c = t.createSpan({ cls: 'dse-mt__guide-th', text: h });
			c.setAttribute('data-col', i === 0 ? 'key' : 'val');
		});
		for (const row of spec.rows) {
			row.forEach((cell, i) => {
				const c = t.createSpan({ cls: 'dse-mt__guide-td', text: cell });
				c.setAttribute('data-col', i === 0 ? 'key' : 'val');
			});
		}
		if (spec.foot) host.createEl('p', { cls: 'dse-mt__guide-foot', text: spec.foot });
	}
}
