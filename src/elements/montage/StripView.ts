// SC-191 impl spec §I slice 3 / §D "cheat-sheet handle + strip" — the Test tiers cheat
// sheet: a `kit/collapsible` (session-persisted, `slot: 'montage.strip'`), closed by
// default, sitting between the brief and the board (spec §A "strip orientation:
// tiers-as-rows × difficulty-as-columns, adopting Power Roll"; ledger 2026-08-29/08-30).
//
// READS NOTHING FROM THE MODEL (spec §B.2: "Strip and foot guide: read nothing from the
// model — they are rules text"). The rows below are the book's Test Difficulty Outcomes
// table (Draw Steel Heroes:20471), transcribed once here and never derived.
//
// THE ROW KEY IS THE SHIPPED POWER ROLL BADGE, not a lookalike — `kit/tierBadge` mounts
// the real `.dse-pr__badge .dse-pr__badge--{t1,t2,t3,crit}` DOM (powerRollPanel.ts), so the
// strip spells the bands exactly as every other Power Roll surface in the plugin does
// (spec §D). §J1's fix is a GRID-TRACK width (`.dse-mt__tier-key`'s column), never a width
// override on the badge itself — the mock's `.mt6-row__key .dse-pr__badge { width: 100%;
// max-width: 4.6em }` is exactly the bug §J1 diagnoses and deletes.
//
// THE TIER WASH is `styles-source.css`'s `.dse-pr__row` recipe (`--t` + a 3px left edge +
// a `--tw` gradient), copied verbatim per spec §D — but never by putting `.dse-pr__row` on
// this node (the shipped rule carries `:first-child`/`aria-checked`/`@supports` siblings
// that belong to a real radiogroup, not this static reference strip) and never via
// `color-mix()` (the plugin's Chromium-106 floor, SC-160/SC-171 — the static `--tw` twins
// ARE the whole implementation). `edge` (ledger 2026-08-30, spec §A `data-tierstyle`): the
// wash dies at 12% of the row instead of the Power Roll's own 60%, so it tints the row's
// KEY column rather than bleeding across the three cells being compared to each other.
//
// THE RIDER MARK is the gold pip (§J2), CSS-only (no `<svg>`): a small forged tab — gold
// fill (`--dse-vp`), a faint top-down sheen (`--dse-sheen-soft`), a 1px steel-grey rim
// (`--dse-metal-line`) — riding the seal's bottom-right corner. ▲ a reward, ▼ a
// consequence. Colourblind rule: the ▲/▼ SHAPE and the "with a reward"/"with a
// consequence" WORDS beside every cell carry the meaning; gold/steel-grey only decorate —
// named in prose (not asserted by pixel colour) per Scott's own rule.
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';
import { collapsible, tierBadge } from '@/framework/kit';
import type { SessionPersist } from '@/framework/session';

type StripTier = 'low' | 'mid' | 'high' | 'crit';
type StripKind = 'success' | 'failure';
type StripRider = 'reward' | 'consequence' | undefined;

interface StripCell {
	kind: StripKind;
	rider?: StripRider;
}

interface StripRow {
	tier: StripTier;
	cells: [StripCell, StripCell, StripCell];
}

/** Draw Steel Heroes:20471, the Test Difficulty Outcomes table — tiers on the rows,
 *  difficulty on the columns (spec §A: the strip adopts the Power Roll's own orientation,
 *  not the book's page layout). The crit row is the strip's fourth row — round 6's finding
 *  that flipping the axes lets the strip carry the WHOLE book table, which is what lets the
 *  foot guide's pinned form (GuideView) become a pure pointer instead of an orphan line. */
const STRIP_ROWS: StripRow[] = [
	{
		tier: 'low',
		cells: [{ kind: 'success', rider: 'consequence' }, { kind: 'failure' }, { kind: 'failure', rider: 'consequence' }],
	},
	{
		tier: 'mid',
		cells: [{ kind: 'success' }, { kind: 'success', rider: 'consequence' }, { kind: 'failure' }],
	},
	{
		tier: 'high',
		cells: [{ kind: 'success', rider: 'reward' }, { kind: 'success' }, { kind: 'success' }],
	},
	{
		tier: 'crit',
		cells: [{ kind: 'success', rider: 'reward' }, { kind: 'success', rider: 'reward' }, { kind: 'success', rider: 'reward' }],
	},
];

const DIFFS = ['Easy', 'Medium', 'Hard'] as const;

/** Draw Steel Heroes:20480 — the sentence that makes the strip countable; the crit clause
 *  is what buys the `crit` badge the right to be three letters instead of a phrase. */
const STRIP_FOOT = 'Any success counts toward the success limit; any failure toward the failure limit. A crit is a natural 19 or 20.';
const STRIP_LEGEND = 'a rider rides the seal’s corner: ▲ with a reward · ▼ with a consequence';

export class StripView {
	constructor(private readonly owner: Component) {}

	/** Returns the collapsible's `isOpen()` so the caller (MontageView) can pass the
	 *  pinned/closed state to GuideView's own dedup (spec §A round-5/6 dedup: "the foot
	 *  panel's 'Each test' block stands down while strip is pinned"). `onToggle` fires on a
	 *  REAL user click only (never on mount) — MontageView uses it to rebuild the whole
	 *  element so the guide's dedup stays correct live, not only at the next remount. */
	public build(container: HTMLElement, persist: SessionPersist, onToggle?: () => void): { isOpen(): boolean } {
		const handle = collapsible(container, { title: 'Test tiers', open: false, persist, onToggle }, this.owner);
		handle.rootEl.addClass('dse-mt__strip');
		handle.headerEl.createSpan({
			cls: 'dse-mt__strip-hint',
			text: handle.isOpen() ? 'pinned' : 'easy · medium · hard',
		});

		const well = handle.contentEl.createDiv({ cls: 'dse-mt__strip-well' });
		const rows = well.createDiv({ cls: 'dse-mt__tier-rows' });

		const head = rows.createDiv({ cls: 'dse-mt__tier-row dse-mt__tier-row--head' });
		head.createSpan({ cls: 'dse-mt__tier-key' });
		for (const d of DIFFS) head.createSpan({ cls: 'dse-mt__tier-col', text: d });

		for (const row of STRIP_ROWS) {
			const r = rows.createDiv({ cls: 'dse-mt__tier-row' });
			r.setAttribute('data-tier', row.tier);
			const key = r.createSpan({ cls: 'dse-mt__tier-key' });
			tierBadge(key, row.tier);
			for (const cell of row.cells) this.buildCell(r, cell);
		}

		well.createEl('p', { cls: 'dse-mt__strip-foot', text: STRIP_FOOT });
		well.createEl('p', { cls: 'dse-mt__strip-legend', text: STRIP_LEGEND });

		return { isOpen: () => handle.isOpen() };
	}

	private buildCell(row: HTMLElement, cell: StripCell): void {
		const box = row.createSpan({ cls: 'dse-mt__tier-cell' });
		box.setAttribute('data-kind', cell.kind);
		box.setAttribute('data-rider', cell.rider ?? 'none');

		const mark = box.createSpan({ cls: 'dse-mt__tier-mark' });
		const seal = mark.createSpan({ cls: 'dse-mt__tier-seal' });
		seal.setAttribute('data-kind', cell.kind);
		seal.setAttribute('aria-hidden', 'true');
		setIcon(seal, cell.kind === 'success' ? 'check' : 'x');
		if (cell.rider) {
			const pip = seal.createSpan({ cls: 'dse-mt__tier-pip' });
			pip.setAttribute('aria-hidden', 'true');
		}

		const word = box.createSpan({ cls: 'dse-mt__tier-word' });
		word.createSpan({ cls: 'dse-mt__tier-word-kind', text: cell.kind });
		if (cell.rider) {
			word.createSpan({ cls: 'dse-mt__tier-word-rider', text: `with a ${cell.rider}` });
		}
	}
}
