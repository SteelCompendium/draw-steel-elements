// SC-191 impl spec §I slices 2-4 + fix round 2 — MontageView on the settled
// `roster`/`merged` design (spec §A design freeze): HeadView (cardHead +
// crest/deck/round-chip) over an optional description brief, the StripView cheat-sheet
// (slice 3), the BoardView grid (Heroes × rounds × Tally, read from `model.entries`), the
// OutcomeBandView (the merged verdict/tracks/notes band, including the `pending` band
// model.ts returns at 0/0), the bottom action bar (slice 4 + fix round 2), and the
// GuideView foot rules panel (slice 3). Replaces the pre-SC-191 RoundTrackView (steppers +
// a bare outcome chip) and ParticipantsView (skill-chip/record-form list) — both deleted
// in slice 2.
//
// SLICE 4: the hand-rolled ⋯ `Menu` is gone (HeadView.ts) — every ⋯ item now rides the
// SC-169 chrome panel through `chromeItems()` (the SC-182 seam SkillsView already
// established: a definition-level `chrome.items()` sees only `{model, def}` and cannot
// reach `this.update`/`this.persist`). The board's cells/row-act/add-hero controls, the
// bar's `Log an action…`, and a recorded cell's edit affordance all open `LogActionModal`
// (kit managedModal, the SC-186 `ConditionsModal` precedent); every mutation a modal, a
// bar button or a chrome item triggers runs through model.ts's delta-write helpers (spec
// §B.3) and then the SAME commit() shape Reset always used — rebuild, then
// debounce-persist, never from render.
//
// FIX ROUND 2 (ledger 2026-09-03): the settled mock's bottom action bar (mock6.js
// `actionBar()`) was dropped by a spec omission, not a Scott ruling — restored here:
// `End round N` (the ONLY control that advances `current_round` — model.ts confirms it
// was previously touched only by parse/reset) and `Undo` (removes the most recently
// logged entry) join `Log an action…` in the LIVE bar; the bar stands down to `Reopen` +
// danger `Clear all` once the montage is COMPLETE, mirroring the mock's own done-state
// bar. `Clear all` moved OUT of the ⋯ menu (now four items, not five) — it lives only in
// the done-state bar, sharing `resetMontageProgress` with Reset progress rather than
// being a second ⋯ label for the identical action.
//
// Reset here clears PROGRESS only (successes/failures/current_round/each participant's
// skills_used) — the Director-set config (title, description, rounds, limits, participant
// roster) survives a reset. SC-191 additionally clears `entries`: leaving stale entries on
// the board after their tallies were just zeroed would render a board that visibly
// contradicts the outcome band it sits above (five filled cells over a "Not started" band) —
// the same whole-model-mutation shape as before, just now covering the field the board
// reads.
import { Component, Notice } from 'obsidian';
import { ElementView } from '@/framework/view';
import { MOVING_ATTR } from '@/framework/host/adoptView';
import type { ChromeMenuItem } from '@/framework/chrome/types';
import { iconButton, openManagedModal } from '@/framework/kit';
import type { DseModal } from '@/framework/kit';
import type { MontageModel, MontageEntry } from './model';
import {
	addMontageHero,
	addMontageRound,
	backMontageRound,
	correctMontageEntry,
	endMontageRound,
	logMontageEntry,
	montagePreviousRound,
	montageReopenable,
	montageTallies,
	nextHeroToAct,
	removeMontageEntry,
	resetMontageProgress,
	setMontageLimits,
	undoLastMontageEntry,
} from './model';
import { HeadView } from './HeadView';
import { BoardView } from './BoardView';
import { OutcomeBandView } from './OutcomeBandView';
import { StripView } from './StripView';
import { GuideView } from './GuideView';
import { LogActionModal } from './LogActionModal';
import type { SheetMode } from './LogActionModal';
import { MontageAddHeroModal, MontageSetLimitsModal } from './ConfigModals';

const STRIP_SLOT = 'montage.strip';
const GUIDE_SLOT = 'montage.guide';

/** A read-only/no-op bar button never fires — `disabled` suppresses it — but
 *  iconButton's `onClick` is mandatory; the same convention BoardView.ts's own
 *  `STUB_NOOP` establishes. */
const STUB_NOOP = (): void => {};

export class MontageView extends ElementView<MontageModel> {
	/** SC-326 r2 — the board's horizontal scroll, captured by `update()` just before the
	 *  element is emptied and consumed by `onMount` right after the fresh board is built (a
	 *  scrollLeft set before the board exists, or while it is still detached, is a no-op). */
	private pendingBoardScroll: { left: number; atEnd: boolean } | null = null;
	/** The board's scrollLeft as the user (or `restoreBoardScroll`) last left it — kept from the
	 *  board's own `scroll` events, so a DOM move that silently resets it can be undone. */
	private boardLeft = 0;

	/** SC-326 r2 — every write rebuilds the whole element (the framework default `update`:
	 *  empty the root, run `onMount` again), which throws the board away; its replacement
	 *  starts at scrollLeft 0, so a tap in a far round column snapped the board back to
	 *  round 1 (measured in real Obsidian: 884 -> 0 on the first frame after the tap). Carry
	 *  the position across. */
	async update(model: MontageModel): Promise<void> {
		const board = this.rootEl.querySelector<HTMLElement>('.dse-mt__board');
		this.pendingBoardScroll =
			board && board.scrollLeft > 0
				? { left: board.scrollLeft, atEnd: board.scrollWidth - board.clientWidth - board.scrollLeft <= 1 }
				: null;
		try {
			await super.update(model);
		} finally {
			this.pendingBoardScroll = null; // never leak into a later mount
		}
	}

	protected async onMount(root: HTMLElement, model: MontageModel): Promise<void> {
		// Per-mount listener owner: torn down by the framework default update() before
		// the next onMount runs (F1 §4.5) — nothing accumulates across resets/refreshes.
		const cycleOwner = this.addChild(new Component());
		const canPersist = this.cx.host.canPersist;
		const blockKey = this.cx.host.blockKey();

		const container = root.createDiv({ cls: 'dse-mt' });

		new HeadView(model, cycleOwner).build(container);
		await this.buildBrief(container, model);
		// The strip sits between the brief and the board (spec §A: "above the table" —
		// ledger 2026-08-29). Session-only state (spec §C: UI state never touches the
		// note) — the block key + slot pair is the same (blockKey, slot) address every
		// other kit/collapsible consumer uses (skills' per-group collapsibles, the SC-169
		// chrome panel).
		const strip = new StripView(cycleOwner).build(
			container,
			{ session: this.cx.session, blockKey, slot: STRIP_SLOT },
			// A live toggle can flip the guide's own dedup (spec §A round-5/6 ruling) — a
			// full rebuild is the same "unload children + onMount again" shape Reset
			// already uses, and it is what lets GuideView read the strip's just-toggled
			// state at its own next build rather than reaching back into a mounted
			// StripView after the fact. Never persists (this.model is untouched) and
			// never writes the note (spec §C: UI state is session-only).
			() => void this.update(this.model),
		);
		new BoardView(
			model,
			cycleOwner,
			canPersist,
			(mode) => this.openSheet(mode),
			(entry) => this.commitNewEntry(entry),
			() => this.openAddHero(),
		).build(container);
		this.restoreBoardScroll(container, cycleOwner);
		new OutcomeBandView(model).build(container);
		this.buildActionBar(container, model, canPersist, cycleOwner);
		// The foot rules guide (spec §A: "collapsed by default"). Its "Each test" block
		// dedups against the strip's own pinned state (spec §A round-5/6 ruling) — read
		// ONCE at build time from the strip's just-mounted `isOpen()`, and kept correct on
		// a live toggle by a full element rebuild (see the strip's onToggle wiring below),
		// never by reaching into GuideView after the fact.
		new GuideView(cycleOwner).build(container, { session: this.cx.session, blockKey, slot: GUIDE_SLOT }, strip.isOpen());
	}

	/** The Director's brief — read-only authored prose, rendered above the board (spec §D:
	 *  "description -> ElementView.renderMarkdown into a .dse-mt__brief paragraph"). */
	private async buildBrief(container: HTMLElement, model: MontageModel): Promise<void> {
		const description = model.description?.trim();
		if (!description) return;
		const brief = container.createDiv({ cls: 'dse-mt__brief' });
		await this.renderMarkdown(description, brief.createDiv({ cls: 'dse-mt__brief-text' }));
	}

	/**
	 * FIX ROUND 2 + FIX ROUND 3 (review-2 L-3) — the bottom action bar. LIVE state:
	 * `Log an action…` (accent) · `Undo` · `End round N` (mock6.js:1458-1460).
	 * COMPLETE state: `Undo` · `Reopen` (only when reopenable — model.ts's own doc) ·
	 * danger `Clear all` — fix round 3 ADDS `Undo` to the complete-state bar, per the
	 * owner's own correction of mock6.js:1420-1425's drawn (Reopen + Clear all only)
	 * shape: logging the winning success is what flips the montage complete, so the
	 * bar standing fully down in the SAME breath removed the one-click undo for the
	 * entry the Director is most likely to want to undo. Recovery still exists either
	 * way (click the cell, press Remove) — this keeps the fast path too. The mock's own
	 * fourth live-state control, `more` (⋯), is the SC-169 chrome panel here, not a bar
	 * button — never duplicated.
	 *
	 * SC-334: `Back to round N` joins both bars whenever `montagePreviousRound` names a round
	 * to go back to — the live bar past round 1 (just before `End round N`, the control it
	 * reverses), and the complete bar of a montage that only ran out of ROUNDS (ending the
	 * last round by mistake used to leave `Reopen`, which ADDS a round, as the only way
	 * out). Like `Reopen`, it is present only when it applies, never a dead control.
	 *
	 * Read-only: every button in the bar renders real-disabled rather than the row being
	 * omitted (owner ruling I-6, "explicit read-only states" — the board's own
	 * convention, matched here for consistency within one bar rather than mixing
	 * disabled-but-visible new controls with an omitted old one).
	 */
	private buildActionBar(container: HTMLElement, model: MontageModel, canPersist: boolean, owner: Component): void {
		const complete = montageTallies(model).complete;
		const row = container.createDiv({ cls: 'dse-mt__actionrow' });
		row.setAttribute('data-complete', complete ? 'on' : 'off');
		const disabled = !canPersist;

		if (complete) {
			this.buildUndoButton(row, model, disabled, owner);
			this.buildBackButton(row, model, disabled, owner);
			if (montageReopenable(model)) {
				iconButton(
					row,
					{
						icon: 'undo',
						label: 'Reopen',
						text: 'Reopen',
						disabled,
						onClick: disabled
							? STUB_NOOP
							: () => {
									addMontageRound(model);
									void this.commit();
								},
					},
					owner,
				);
			}
			iconButton(
				row,
				{
					icon: 'trash',
					label: 'Clear all',
					text: 'Clear all',
					variant: 'danger',
					disabled,
					onClick: disabled
						? STUB_NOOP
						: () => {
								new Notice('Montage progress cleared');
								resetMontageProgress(model);
								void this.commit();
							},
				},
				owner,
			);
			return;
		}

		// SC-334 review-1 MED-1: NO fallback hero. This used to be `?? participants[0]`, so
		// once every hero had acted in the round in play the button still opened a new sheet
		// for the first hero — whose (hero, round) cell was already filled. Logging it wrote a
		// second entry the board never draws (first entry wins, BoardView.entriesForHero) but
		// the stored tally still counted — a Total Success from an entry nobody can see.
		// SC-334's own Back to round lands exactly in that state, and the sheet has no Hero
		// chips left to steer away with, so the button now stands down instead: every hero
		// has acted, so the next move is End round or a click on a cell to correct it.
		const hero = nextHeroToAct(model);
		iconButton(
			row,
			{
				icon: 'plus',
				label: 'Log an action…',
				text: 'Log an action…',
				variant: 'accent',
				// No dead end (F1 §4.4): an empty roster, or a round every hero has already
				// acted in, has nobody to pre-fill, so this stays disabled rather than opening
				// a sheet with no Hero (or a sheet for a hero who already acted).
				disabled: disabled || !hero,
				onClick:
					disabled || !hero
						? STUB_NOOP
						: () => this.openSheet({ kind: 'new', hero, round: model.current_round }),
			},
			owner,
		);
		this.buildUndoButton(row, model, disabled, owner);
		this.buildBackButton(row, model, disabled, owner);
		iconButton(
			row,
			{
				icon: 'chevron-right',
				label: `End round ${model.current_round}`,
				text: `End round ${model.current_round}`,
				disabled,
				onClick: disabled
					? STUB_NOOP
					: () => {
							endMontageRound(model);
							void this.commit();
						},
			},
			owner,
		);
	}

	/** `Undo` — shared between the LIVE and COMPLETE bars (fix round 3, L-3): removes
	 *  the most recently logged entry either way, disabled whenever there is nothing to
	 *  undo. */
	private buildUndoButton(row: HTMLElement, model: MontageModel, disabled: boolean, owner: Component): void {
		const hasEntries = (model.entries?.length ?? 0) > 0;
		iconButton(
			row,
			{
				icon: 'undo',
				label: 'Undo',
				text: 'Undo',
				disabled: disabled || !hasEntries,
				onClick:
					disabled || !hasEntries
						? STUB_NOOP
						: () => {
								undoLastMontageEntry(model);
								void this.commit();
							},
			},
			owner,
		);
	}

	/** SC-334 — `Back to round N`, shared between the LIVE and COMPLETE bars: moves
	 *  `current_round` back one round (model.ts's `backMontageRound`), never touching an
	 *  entry. Not rendered at all when `montagePreviousRound` names no round (round 1, or a
	 *  limit already reached) — the same "only when it applies" rule `Reopen` follows. */
	private buildBackButton(row: HTMLElement, model: MontageModel, disabled: boolean, owner: Component): void {
		const target = montagePreviousRound(model);
		if (target === undefined) return;
		iconButton(
			row,
			{
				icon: 'chevron-left',
				label: `Back to round ${target}`,
				text: `Back to round ${target}`,
				disabled,
				onClick: disabled
					? STUB_NOOP
					: () => {
							backMontageRound(model);
							void this.commit();
						},
			},
			owner,
		);
	}

	// -------------------------------------------------------------------- the sheet

	/** Opens the "Log an action…" sheet — the SAME modal for a fresh record and a
	 *  correction, distinguished only by `mode` (spec §D: "openManagedModal(owner, …),
	 *  the SC-186 ConditionsModal precedent"). Rendering never writes — the modal only
	 *  ever hands back a plain entry object; the mutation happens in the commit*
	 *  callbacks below, through model.ts's delta-write helpers. */
	private openSheet(mode: SheetMode): void {
		this.openTrackedModal(() =>
			new LogActionModal(this.cx.app, {
				model: this.model,
				mode,
				onSubmit: (entry) => this.commitSheetSubmit(mode, entry),
				onRemove: mode.kind === 'edit' ? () => this.commitSheetRemove(mode.entry) : undefined,
			}),
		);
	}

	/**
	 * FIX ROUND 3 (review-2 I-3) — `openManagedModal(this, …)` registers
	 * `this.register(() => modal.close())` on the long-lived `MontageView` itself, and
	 * `commit()`'s `update()` never clears the view's own registrations (only CHILD
	 * components get torn down on a rebuild) — so every sheet/config-modal open across
	 * the life of the rendered block added one more permanent closure, never freed until
	 * the whole element unmounts. Harmless per-open (`close()` is idempotent, matching
	 * the SC-186 precedent) but unbounded over a long editing session. Fixed by giving
	 * EACH open its own throwaway child `Component` — `openManagedModal`'s
	 * view-unload-closes-modal contract (F1 §4.5) still holds via the child (unloading
	 * `this` cascades to unload it, which closes the modal), and once the modal actually
	 * closes (Done/Cancel/Escape/programmatic), the child is removed from `this` too, so
	 * nothing accumulates. `DseModal.onClose` is user-overridable (the SC-186
	 * `ConditionsPanel.openAddModal` precedent already wraps it the same way for a
	 * different reason — deferring a persist to modal close). */
	private openTrackedModal<T extends DseModal>(factory: () => T): T {
		const modalOwner = this.addChild(new Component());
		const modal = openManagedModal(modalOwner, factory);
		const inheritedOnClose = modal.onClose.bind(modal) as () => void;
		modal.onClose = () => {
			inheritedOnClose();
			this.removeChild(modalOwner);
		};
		return modal;
	}

	private commitSheetSubmit(mode: SheetMode, entry: MontageEntry): void {
		if (mode.kind === 'edit') {
			correctMontageEntry(this.model, mode.entry, entry);
			void this.commit();
		} else {
			this.commitNewEntry(entry);
		}
	}

	/** SC-299 R-1 — shared by the sheet's own "new" mode submit AND the board's
	 *  open-socket quick trio (`BoardView`'s `onQuickLog`): the exact same
	 *  `logMontageEntry` + rebuild/debounce-persist path, so the quick trio never grows a
	 *  second write shape to keep in sync with the sheet's. */
	private commitNewEntry(entry: MontageEntry): void {
		logMontageEntry(this.model, entry);
		void this.commit();
	}

	private commitSheetRemove(entry: MontageEntry): void {
		removeMontageEntry(this.model, entry);
		void this.commit();
	}

	// -------------------------------------------------------------- the ⋯ chrome items

	/** SC-182 — the FOUR ⋯ items spec §D names, corrected by fix round 2's ruling (ledger
	 *  2026-09-03): add a round / add a hero / set limits… / Reset progress. `Clear all`
	 *  is REMOVED from here — it lives only in the done-state action bar now (sharing
	 *  `resetMontageProgress` with Reset progress), closing the "two ⋯ labels for one
	 *  action" confusion the original five-item list caused. The VIEW-contributed twin of
	 *  `chromeItems()` SkillsView already established: a definition-level
	 *  `chrome.items()` sees only `{model, def}` and cannot reach `this.update`/
	 *  `this.persist`, which every item here needs. Omitted entirely on a read-only host
	 *  (F1 §4.4): no dead-end panel item, matching the board's own read-only rule. */
	chromeItems(): ChromeMenuItem[] {
		if (!this.model || !this.cx.host.canPersist) return [];
		const model = this.model;
		return [
			{
				id: 'montage-add-round',
				icon: 'plus',
				label: 'Add a round',
				onClick: () => {
					addMontageRound(model);
					void this.commit();
				},
			},
			{
				id: 'montage-add-hero',
				icon: 'user-plus',
				label: 'Add a hero',
				onClick: () => this.openAddHero(),
			},
			{
				id: 'montage-set-limits',
				icon: 'hourglass',
				label: 'Set limits…',
				onClick: () => this.openSetLimits(),
			},
			{
				id: 'montage-reset-progress',
				icon: 'rotate-ccw',
				label: 'Reset progress',
				onClick: () => {
					new Notice('Montage progress reset');
					resetMontageProgress(model);
					void this.commit();
				},
			},
		];
	}

	private openAddHero(): void {
		this.openTrackedModal(() =>
			new MontageAddHeroModal(this.cx.app, (name) => {
				addMontageHero(this.model, name);
				void this.commit();
			}),
		);
	}

	private openSetLimits(): void {
		this.openTrackedModal(() =>
			new MontageSetLimitsModal(
				this.cx.app,
				this.model.success_limit,
				this.model.failure_limit,
				(successLimit, failureLimit) => {
					setMontageLimits(this.model, successLimit, failureLimit);
					void this.commit();
				},
			),
		);
	}

	/** Put the board back where `update()` found it, then keep it there. Round count changes
	 *  (the chrome's "Add a round") are handled by one rule: a board that was scrolled to its
	 *  FAR END stays at its far end (so a newly added last round is in view, not hidden past
	 *  the old edge); any other position is kept as is, and the browser clamps it if the
	 *  board got narrower.
	 *
	 *  The rebuild is not the only thing that zeroes the board. After the write lands the host
	 *  re-draws the section and ADOPTS this live root into it (`adoptView`: `appendChild` of
	 *  the root into the new section, detached until Obsidian inserts it) — and a scroll
	 *  container's offset does not survive being taken out of the document. Measured in real
	 *  Obsidian (lifecycle G-S13): 884 held through the rebuild, then 0 at the adoption ~0.55 s
	 *  later, with no `scroll` event and no ResizeObserver callback to react to (the root is out
	 *  and back within one frame). The framework path is shared by every element, so this view
	 *  undoes it locally: remember the offset from the board's `scroll` events, notice the move
	 *  through the `data-dse-moving` mark `adoptView` puts on the root, and re-apply the offset
	 *  as soon as the board is in the document again (before paint — it is never drawn at 0). */
	private restoreBoardScroll(container: HTMLElement, owner: Component): void {
		const board = container.querySelector<HTMLElement>('.dse-mt__board');
		if (!board) return;
		const saved = this.pendingBoardScroll;
		this.pendingBoardScroll = null;
		if (saved) board.scrollLeft = saved.atEnd ? board.scrollWidth : saved.left;
		this.boardLeft = board.scrollLeft;
		owner.registerDomEvent(board, 'scroll', () => {
			this.boardLeft = board.scrollLeft;
		});
		const doc = board.ownerDocument;
		const win = doc.defaultView;
		if (!win) return;
		const reapply = (): boolean => {
			if (!board.isConnected) return false;
			if (board.scrollLeft !== this.boardLeft) board.scrollLeft = this.boardLeft;
			return true;
		};
		const mark = new win.MutationObserver(() => {
			if (this.rootEl.hasAttribute(MOVING_ATTR) || reapply()) return;
			// moved into a section Obsidian has not inserted yet: wait for it to arrive
			const arrival = new win.MutationObserver(() => {
				if (reapply()) arrival.disconnect();
			});
			arrival.observe(doc.body, { childList: true, subtree: true });
			const timer = win.setTimeout(() => arrival.disconnect(), 5000);
			owner.register(() => {
				arrival.disconnect();
				win.clearTimeout(timer);
			});
		});
		mark.observe(this.rootEl, { attributes: true, attributeFilter: [MOVING_ATTR] });
		owner.register(() => mark.disconnect());
	}

	// ------------------------------------------------------------------------- commit

	/** Rendering never writes (spec §C) — every mutation above runs from a click handler
	 *  and lands here: rebuild, then debounce-persist, the same shape Reset always used. */
	private async commit(): Promise<void> {
		try {
			await this.update(this.model);
			await this.persist();
		} catch (error) {
			console.error('Draw Steel Elements: montage write failed', error);
		}
	}
}
