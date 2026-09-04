// SC-191 impl spec §D "board (Heroes column + `+`, round columns, Tally)" — replaces
// ParticipantsView's skill-chip/record-form list with the settled `roster` board: a CSS
// grid with one row per hero, one column per round, and a trailing Tally column, read from
// `model.entries` (§B.2). Geometry seam (spec §D): the expanded round-track list arrives as
// ONE `setProperty('--dse-mt-cols', …)` call — never a literal per-column width in TS.
//
// EVERY REAL BUTTON GOES THROUGH `kit/iconButton` (spec §D: "every button… never a bare
// <button> — its UA padding is what falsified round 4's control"), never a hand-rolled
// `createEl('button', …)`. That is not only the component-mapping rule — a bare `<button>`
// is also reached by Obsidian's own `app.css` (height clamped to 30px, box-shadow/colour/
// font overwritten — SC-203/SC-205's "PLUGIN-WIDE HOST RE-GROUNDING"), and only `.dse-btn`
// (the class `iconButton` stamps) is re-grounded against that host leak. `.dse-mt__cell` /
// `.dse-mt__board-addhero` / `.dse-mt__board-rowact` therefore ride `iconButton`'s real
// `<button class="dse-btn">` and layer their own class on top for bespoke sizing — the same
// "iconButton, plus a second class" gesture `initiative`'s `.dse-init__cell` already uses
// (view.ts's `handle.buttonEl.addClass('dse-init__cell')`).
//
// SLICE 4 (brief §2): every write affordance the settled design puts on a cell (the
// open-socket quick-record trio, the per-row "Log an action" button, the correction/
// note-edit chip) is now wired to `kit/managedModal` — spec §D's "Log an action… sheet"
// (`LogActionModal.ts`) — through the `onOpenSheet`/`onAddHero` callbacks the owning
// `MontageView` supplies. Per the read-only rule (spec §C-7, owner ruling I-6: EXPLICIT
// read-only states, never a dead end): on a read-only host every control here stays a
// real, aria-labelled, DISABLED stub (`iconButton`'s own `disabled` option / the cell's
// own `aria-disabled`) — the same shape slices 2-3 shipped, just now gated on
// `canPersist` instead of unconditionally true.
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';
import { iconButton } from '@/framework/kit';
import type { MontageModel, MontageEntry, MontageResult } from './model';
import { montageTallies, isKnownMontageResult } from './model';
import type { SheetMode } from './LogActionModal';

const RESULT_ICON: Record<MontageResult, string> = {
	success: 'check',
	failure: 'x',
	// A RINGED plus, never the bare one — the bare glyph is already "add" on three other
	// controls (spec §A carries this from the mock's ICON.assist comment), so a plain plus
	// in a cell would read as an empty add-socket rather than "a hero assisted here".
	assist: 'circle-plus',
};

type RoundState = 'past' | 'current' | 'future';

/** A read-only-host control never fires — the whole point is `disabled` suppresses it
 *  (see file header) — but iconButton's `onClick` is mandatory, so every stub site
 *  shares this no-op. */
const STUB_NOOP = (): void => {};

/** `"1 success"` / `"2 successes"` / `"0 failures"` — the accessible tally reading. */
const plural = (n: number, singular: string, pluralForm: string): string => `${n} ${n === 1 ? singular : pluralForm}`;

export class BoardView {
	constructor(
		private readonly model: MontageModel,
		private readonly owner: Component,
		private readonly canPersist: boolean,
		/** Opens the Log an action… sheet, pre-filled per `mode` (view.ts owns turning a
		 *  click into one — a cell/row-act click here never touches the model directly). */
		private readonly onOpenSheet: (mode: SheetMode) => void,
		/** The Heroes header's "+" — the board-corner shortcut to the same "Add a hero"
		 *  action the ⋯ chrome item fires. */
		private readonly onAddHero: () => void,
	) {}

	public build(parent: HTMLElement): void {
		const participants = this.model.participants ?? [];
		const wrap = parent.createDiv({ cls: 'dse-mt__board-wrap' });
		const board = wrap.createDiv({ cls: 'dse-mt__board' });
		const complete = montageTallies(this.model).complete;
		// Fix-round-1 M-4: `role="table"` on a node with no owned `role="row"`/`role="cell"`
		// children is an invalid mapping — AT announces "a table with no rows", worse than no
		// role at all. The grid is purely visual; every cell already carries its own full
		// `aria-label` (hero, round, result), so the flat DOM reads correctly in visual/DOM
		// order without a table role at all.
		board.setAttribute('data-complete', complete ? 'on' : 'off');

		// The sanctioned geometry seam (spec §D2 §5 precedent): `repeat(var(--n), …)` is not
		// legal CSS, so the expanded track list is computed once and handed to the sheet as
		// ONE custom property — never a literal per-column width from TS.
		const cols = ['minmax(6.2em, auto)'];
		for (let r = 0; r < this.model.rounds; r++) cols.push('minmax(5.2em, 1fr)');
		cols.push('minmax(4.4em, auto)');
		board.style.setProperty('--dse-mt-cols', cols.join(' '));

		this.buildHeaderRow(board);
		if (participants.length === 0) {
			this.buildEmptyRow(board);
		} else {
			participants.forEach((p, i) => {
				this.buildHeroRow(board, p.name, i === participants.length - 1, complete);
			});
		}
	}

	private buildHeaderRow(board: HTMLElement): void {
		const corner = board.createDiv({ cls: 'dse-mt__board-corner' });
		corner.createSpan({ cls: 'dse-mt__board-cornerword', text: 'Hero' });
		// "Add a hero" is the board-corner shortcut to the same action the ⋯ chrome item
		// fires (spec §D) — real-disabled on a read-only host (see file header), never a
		// dead end.
		const addHero = iconButton(
			corner,
			{
				icon: 'plus',
				label: 'Add a hero',
				disabled: !this.canPersist,
				onClick: this.canPersist ? () => this.onAddHero() : STUB_NOOP,
			},
			this.owner,
		);
		addHero.buttonEl.addClass('dse-mt__board-addhero');

		for (let r = 1; r <= this.model.rounds; r++) {
			const h = board.createDiv({ cls: 'dse-mt__board-rhead' });
			const state = this.roundState(r);
			h.setAttribute('data-state', state);
			h.setAttribute('data-round', String(r));
			const title = h.createDiv({ cls: 'dse-mt__rhead-title' });
			title.createSpan({ cls: 'dse-mt__rhead-w', text: 'Round' });
			title.createSpan({ cls: 'dse-mt__rhead-n', text: String(r) });
			h.createSpan({
				cls: 'dse-mt__rhead-sub',
				text: state === 'current' ? 'in play' : state === 'past' ? 'done' : 'to come',
			});
		}
		board.createDiv({ cls: 'dse-mt__board-thead', text: 'Tally' });
	}

	private buildEmptyRow(board: HTMLElement): void {
		const empty = board.createDiv({ cls: 'dse-mt__board-empty' });
		empty.setAttribute('data-lastrow', 'on');
		empty.setText('No heroes yet — add one from the montage menu.');
	}

	private buildHeroRow(board: HTMLElement, name: string, isLast: boolean, complete: boolean): void {
		const entries = this.entriesForHero(name);

		const nameCell = board.createDiv({ cls: 'dse-mt__board-name' });
		nameCell.setAttribute('data-hero', name);
		if (isLast) nameCell.setAttribute('data-lastrow', 'on');
		nameCell.createSpan({ cls: 'dse-mt__board-who', text: name });

		// The per-row "Log an action" control — the touch/narrow path to the same sheet a
		// cell socket opens (spec §D). Targets the CURRENT round: edit mode if this hero
		// already has an entry there, else new mode pre-filled hero=name round=current —
		// exactly what an open current-round socket for this row would open.
		// FIX ROUND 3 (review-2 M-1, guard 1 of 2): `complete` stands this control down
		// exactly like the bar it mirrors (view.ts's buildActionBar, which never renders
		// Log an action… once the montage is complete). Before this fix the row chip
		// stayed live on a complete montage and its target round was
		// `this.model.current_round` — which after `endMontageRound()` can be
		// `rounds + 1`, a round the board has no column for at all, so a logged entry
		// there was invisible and unreachable by the only editor the element has.
		const currentRoundEntry = this.entryFor(entries, this.model.current_round);
		const rowActDisabled = !this.canPersist || complete;
		const rowAct = iconButton(
			nameCell,
			{
				icon: 'plus',
				label: `Log an action for ${name}`,
				disabled: rowActDisabled,
				onClick: rowActDisabled
					? STUB_NOOP
					: () =>
							this.onOpenSheet(
								currentRoundEntry
									? { kind: 'edit', entry: currentRoundEntry }
									: { kind: 'new', hero: name, round: this.model.current_round },
							),
			},
			this.owner,
		);
		rowAct.buttonEl.addClass('dse-mt__board-rowact');

		for (let r = 1; r <= this.model.rounds; r++) {
			this.buildCell(board, name, r, this.entryFor(entries, r), isLast, complete);
		}

		const successCount = entries.filter((e) => e.result === 'success').length;
		const failureCount = entries.filter((e) => e.result === 'failure').length;
		const total = board.createDiv({ cls: 'dse-mt__board-total' });
		total.setAttribute('data-hero', name);
		if (isLast) total.setAttribute('data-lastrow', 'on');
		// Fix-round-1 M-4: the two bare numeral spans (`tallyPart`, aria-hidden below) read
		// as "2 0" to a screen reader — this is the one readable name for the cell.
		total.setAttribute('aria-label', `${name}: ${plural(successCount, 'success', 'successes')}, ${plural(failureCount, 'failure', 'failures')}`);
		this.tallyPart(total, 'success', successCount);
		this.tallyPart(total, 'failure', failureCount);
	}

	private buildCell(
		board: HTMLElement,
		hero: string,
		round: number,
		entry: MontageEntry | undefined,
		isLast: boolean,
		complete: boolean,
	): void {
		const state = complete ? 'past' : this.roundState(round);
		// Fix-round-1 L-2: an entry whose `result` isn't one of the three known values (a
		// preserved Director typo, model.ts's own `isKnownMontageResult`) renders with the
		// SAME face as "nothing recorded" — but its note, if any, is never lost: the note
		// mark still shows here (`data-noted`) and the text still lists in the outcome band
		// (which reads `entries` directly, unfiltered by result validity).
		const known = entry !== undefined && isKnownMontageResult(entry.result);
		// Fix-round-1 M-1: the cell is `role="button" tabindex="0"` per spec §D ("the cell
		// itself role='button' tabindex='0'") — NOT a real `<button>`. Slice 2 originally
		// rode `kit/iconButton` here to dodge the button host-leak gate, but that made the
		// cell a real `.dse-btn`: full kit chrome (1px border, 5.44px radius, sheen
		// gradient, drop shadow) the mock's board never has, PLUS `.dse-btn[disabled] {
		// opacity: .5 }` (base tier) dimming the cell's own recorded data — the ✓/✗ ring,
		// the skill caption, the note mark — by half, which is the worst case for a
		// colourblind reader relying on shape. A `div` isn't a button KIND at all, so it
		// never reaches the host-leak gate in the first place — no override CSS needed to
		// neutralise chrome that was never there.
		// SLICE 4: ANY existing entry opens the edit sheet — including one with an
		// unrecognised `result` (a preserved Director typo, `known` false). Fixing that
		// typo through the UI is exactly what the sheet is for; LogActionModal pre-selects
		// no Result chip for it (see its own doc), forcing an explicit valid choice rather
		// than guessing one. An EMPTY socket is interactive only in the round currently in
		// play, unchanged from slices 2-3.
		const isInteractive = entry !== undefined || state === 'current';
		const ariaLabel = known
			? `${hero}, round ${round}: ${entry.result} with ${entry.skill ?? 'no skill'}${entry.note ? '. Note: ' + entry.note : ''} — edit`
			: entry !== undefined
				? `${hero}, round ${round}: unrecognised result "${entry.result}"${entry.note ? '. Note: ' + entry.note : ''} — edit`
				: `${hero}, round ${round}: nothing logged — log an action`;

		const cell = board.createDiv({ cls: 'dse-mt__cell' });
		cell.setAttribute('aria-label', ariaLabel);
		if (isInteractive) {
			// A recorded cell opens the sheet in EDIT mode (fix-round-1 M-1: `aria-disabled`,
			// not native `disabled` — a `div` isn't a button KIND, see file header); an open
			// socket opens it in NEW mode pre-filled hero+round. Real-disabled (never wired)
			// on a read-only host — the settled aria-label already states the wording either
			// way.
			cell.setAttribute('role', 'button');
			cell.setAttribute('tabindex', '0');
			if (!this.canPersist) {
				cell.setAttribute('aria-disabled', 'true');
			} else {
				// Branches on `entry !== undefined`, NOT `known` — an existing entry with an
				// unrecognised result (a preserved Director typo) still opens EDIT mode, so
				// the sheet is exactly how it gets fixed (isInteractive's own doc, above).
				const openThisCell = (): void =>
					this.onOpenSheet(entry !== undefined ? { kind: 'edit', entry } : { kind: 'new', hero, round });
				this.owner.registerDomEvent(cell, 'click', openThisCell);
				this.owner.registerDomEvent(cell, 'keydown', (evt: KeyboardEvent) => {
					if (evt.key !== 'Enter' && evt.key !== ' ') return;
					evt.preventDefault();
					openThisCell();
				});
			}
		}
		cell.setAttribute('data-kind', known ? entry.result : 'none');
		cell.setAttribute('data-state', state);
		cell.setAttribute('data-round', String(round));
		cell.setAttribute('data-hero', hero);
		if (isLast) cell.setAttribute('data-lastrow', 'on');
		if (entry?.note) cell.setAttribute('data-noted', 'on');

		if (known && isKnownMontageResult(entry.result)) {
			// The cell edit chip (spec §D: "kit/iconButton (variant: ghost) inset from the
			// top-right") — decorative here, not a second interactive control: the whole cell
			// is ALREADY the edit trigger (fix-round-1 M-1, above), so nesting a real
			// `<button>` inside a `div[role=button]` would be an invalid, double-firing
			// interactive-in-interactive mapping. A small `aria-hidden` pencil glyph borrows
			// the ghost-button VISUAL vocabulary (subtle, no chrome at rest) without the
			// nested-control semantics; placed top-LEFT since the note mark already owns
			// top-right. Only on a writable host — a read-only cell has nothing to edit.
			if (this.canPersist) {
				const editMark = cell.createSpan({ cls: 'dse-mt__cell-editmark' });
				editMark.setAttribute('aria-hidden', 'true');
				setIcon(editMark, 'pencil');
			}
			const face = cell.createDiv({ cls: 'dse-mt__cell-face' });
			setIcon(face.createSpan({ cls: 'dse-mt__cell-glyph' }), RESULT_ICON[entry.result]);
			if (entry.skill) face.createSpan({ cls: 'dse-mt__cell-skill', text: entry.skill });
			if (entry.note) {
				// A permanent dog-eared-page mark (spec §D), never hover-revealed — "there is
				// something recorded here" has to be true when nobody is pointing at the card.
				const mark = cell.createSpan({ cls: 'dse-mt__cell-notemark' });
				mark.setAttribute('aria-hidden', 'true');
				mark.setAttribute('title', entry.note);
				setIcon(mark, 'sticky-note');
			}
		} else if (state === 'current' && entry === undefined) {
			cell.createSpan({ cls: 'dse-mt__cell-hint', text: 'to act' });
		} else {
			const face = cell.createDiv({ cls: 'dse-mt__cell-face' });
			setIcon(face.createSpan({ cls: 'dse-mt__cell-glyph dse-mt__cell-glyph--none' }), 'minus');
			face.createSpan({
				cls: 'dse-mt__cell-skill dse-mt__cell-skill--none',
				text: state === 'past' || entry !== undefined ? 'no action' : '',
			});
			if (entry?.note) {
				const mark = cell.createSpan({ cls: 'dse-mt__cell-notemark' });
				mark.setAttribute('aria-hidden', 'true');
				mark.setAttribute('title', entry.note);
				setIcon(mark, 'sticky-note');
			}
		}
	}

	private tallyPart(parent: HTMLElement, kind: 'success' | 'failure', n: number): void {
		const s = parent.createSpan({ cls: 'dse-mt__tally' });
		s.setAttribute('data-kind', kind);
		// Fix-round-1 M-4: the parent `.dse-mt__board-total`'s own aria-label is the readable
		// name now — these glyph+numeral spans are a visual duplicate of it.
		s.setAttribute('aria-hidden', 'true');
		setIcon(s.createSpan({ cls: 'dse-mt__tally-glyph' }), RESULT_ICON[kind]);
		s.createSpan({ cls: 'dse-mt__tally-n', text: String(n) });
	}

	private roundState(round: number): RoundState {
		// 2c: a limit-ended montage can go complete mid-round (e.g. the success limit is
		// hit before every hero has acted), leaving `current_round` still pointing at that
		// unfinished round. Gate on `complete` first so the round HEADER agrees with what
		// the cell path (`buildCell`, above) and the settled mock already show: every round
		// of a finished montage reads 'past', never 'current'.
		if (montageTallies(this.model).complete) return 'past';
		if (round < this.model.current_round) return 'past';
		if (round === this.model.current_round) return 'current';
		return 'future';
	}

	/** Fix-round-1 L-6: ONE shared dedup for "this hero's entries" — first entry for a given
	 *  round wins, discarding any later duplicate for the SAME (hero, round) pair — used by
	 *  both the per-round cell lookup below (`entryFor`) and the tally count in
	 *  `buildHeroRow`. Previously the cell used `.find` (first match, so a duplicate never
	 *  rendered a second cell) while the tally counted every raw entry (so it silently
	 *  tallied the duplicate anyway) — the two layers disagreed about how many tests
	 *  happened. Deduping once, here, makes them agree by construction. */
	private entriesForHero(hero: string): MontageEntry[] {
		const seenRounds = new Set<number>();
		const deduped: MontageEntry[] = [];
		for (const e of this.model.entries ?? []) {
			if (e.hero !== hero || seenRounds.has(e.round)) continue;
			seenRounds.add(e.round);
			deduped.push(e);
		}
		return deduped;
	}

	private entryFor(entries: MontageEntry[], round: number): MontageEntry | undefined {
		return entries.find((e) => e.round === round);
	}
}
