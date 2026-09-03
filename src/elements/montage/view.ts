// SC-191 impl spec §I slices 2-4 — MontageView on the settled `roster`/`merged` design
// (spec §A design freeze): HeadView (cardHead + crest/deck/round-chip) over an optional
// description brief, the StripView cheat-sheet (slice 3), the BoardView grid (Heroes ×
// rounds × Tally, read from `model.entries`), the OutcomeBandView (the merged
// verdict/tracks/notes band, including the `pending` band model.ts returns at 0/0), the
// bottom "Log an action…" row (slice 4), and the GuideView foot rules panel (slice 3).
// Replaces the pre-SC-191 RoundTrackView (steppers + a bare outcome chip) and
// ParticipantsView (skill-chip/record-form list) — both deleted in slice 2.
//
// SLICE 4: the hand-rolled ⋯ `Menu` is gone (HeadView.ts) — every ⋯ item (add a round /
// add a hero / set limits… / Clear all / Reset progress) now rides the SC-169 chrome
// panel through `chromeItems()` (the SC-182 seam SkillsView already established: a
// definition-level `chrome.items()` sees only `{model, def}` and cannot reach
// `this.update`/`this.persist`). The board's cells/row-act/add-hero controls and this
// file's own bottom "Log an action…" button all open `LogActionModal` (kit
// managedModal, the SC-186 `ConditionsModal` precedent); every mutation a modal or a
// chrome item triggers runs through model.ts's delta-write helpers (spec §B.3) and then
// the SAME commit() shape Reset always used — rebuild, then debounce-persist, never
// from render.
//
// Reset here clears PROGRESS only (successes/failures/current_round/each participant's
// skills_used) — the Director-set config (title, description, rounds, limits, participant
// roster) survives a reset. SC-191 additionally clears `entries`: leaving stale entries on
// the board after their tallies were just zeroed would render a board that visibly
// contradicts the outcome band it sits above (five filled cells over a "Not started" band) —
// the same whole-model-mutation shape as before, just now covering the field the board
// reads. "Clear all" (the danger-drawn ⋯ item the mock shows) shares this exact
// implementation with "Reset progress" — neither the ledger nor the mock ever gives the
// two labels distinct semantics beyond the icon/wording the mock draws, so this slice does
// not invent a second, undocumented destructive scope (a full roster/config wipe) for
// "Clear all" — see the slice-4 report's "Scope notes".
import { Component, Notice } from 'obsidian';
import { ElementView } from '@/framework/view';
import type { ChromeMenuItem } from '@/framework/chrome/types';
import { iconButton, openManagedModal } from '@/framework/kit';
import type { MontageModel, MontageEntry } from './model';
import {
	addMontageHero,
	addMontageRound,
	correctMontageEntry,
	logMontageEntry,
	montageTallies,
	nextHeroToAct,
	removeMontageEntry,
	resetMontageProgress,
	setMontageLimits,
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

export class MontageView extends ElementView<MontageModel> {
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
			() => this.openAddHero(),
		).build(container);
		new OutcomeBandView(model).build(container);
		this.buildLogActionRow(container, model, canPersist, cycleOwner);
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
	 * "Log an action…" (ledger 2026-08-29: renamed off "Record…" for being "really
	 * confusing"; placement "at the bottom" accepted for lack of a better home) — the
	 * bar-level path to the same sheet a cell socket or the row-act chip opens,
	 * pre-filled with the current round and the next hero yet to act in it (round-4
	 * report: "the current round, and the next hero who has not yet acted in it").
	 * Omitted (F1 §4.4: no dead-end write affordance) when read-only, when the roster is
	 * empty (nobody to pre-fill), or once the montage is COMPLETE — a finished montage
	 * offers nothing new to log; per-cell corrections still work through the board.
	 */
	private buildLogActionRow(container: HTMLElement, model: MontageModel, canPersist: boolean, owner: Component): void {
		if (!canPersist || montageTallies(model).complete) return;
		const hero = nextHeroToAct(model) ?? model.participants?.[0]?.name;
		if (!hero) return;
		const row = container.createDiv({ cls: 'dse-mt__actionrow' });
		iconButton(
			row,
			{
				icon: 'plus',
				label: 'Log an action…',
				text: 'Log an action…',
				variant: 'accent',
				onClick: () => this.openSheet({ kind: 'new', hero, round: model.current_round }),
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
		openManagedModal(
			this,
			() =>
				new LogActionModal(this.cx.app, {
					model: this.model,
					mode,
					roll: this.cx.roll,
					onSubmit: (entry) => this.commitSheetSubmit(mode, entry),
					onRemove: mode.kind === 'edit' ? () => this.commitSheetRemove(mode.entry) : undefined,
				}),
		);
	}

	private commitSheetSubmit(mode: SheetMode, entry: MontageEntry): void {
		if (mode.kind === 'edit') correctMontageEntry(this.model, mode.entry, entry);
		else logMontageEntry(this.model, entry);
		void this.commit();
	}

	private commitSheetRemove(entry: MontageEntry): void {
		removeMontageEntry(this.model, entry);
		void this.commit();
	}

	// -------------------------------------------------------------- the ⋯ chrome items

	/** SC-182 — the five ⋯ items spec §D names (add a round / add a hero / set limits… /
	 *  Clear all / Reset progress), the VIEW-contributed twin of `chromeItems()`
	 *  SkillsView already established: a definition-level `chrome.items()` sees only
	 *  `{model, def}` and cannot reach `this.update`/`this.persist`, which every item
	 *  here needs. Omitted entirely on a read-only host (F1 §4.4): no dead-end panel
	 *  item, matching the board's own read-only rule. */
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
				id: 'montage-clear-all',
				icon: 'trash',
				label: 'Clear all',
				onClick: () => {
					new Notice('Montage progress cleared');
					resetMontageProgress(model);
					void this.commit();
				},
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
		openManagedModal(
			this,
			() =>
				new MontageAddHeroModal(this.cx.app, (name) => {
					addMontageHero(this.model, name);
					void this.commit();
				}),
		);
	}

	private openSetLimits(): void {
		openManagedModal(
			this,
			() =>
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
