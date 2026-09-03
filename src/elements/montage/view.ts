// SC-191 impl spec §I slices 2-3 — MontageView on the settled `roster`/`merged` design
// (spec §A design freeze): HeadView (cardHead + crest/deck/round-chip + the unchanged Reset
// menu) over an optional description brief, the StripView cheat-sheet (slice 3, between the
// brief and the board — spec §A "above the table"), the BoardView grid (Heroes × rounds ×
// Tally, read from `model.entries`), the OutcomeBandView (the merged verdict/tracks/notes
// band, including the `pending` band model.ts now returns at 0/0), and the GuideView foot
// rules panel (slice 3, closed by default). Replaces the pre-SC-191 RoundTrackView
// (steppers + a bare outcome chip) and ParticipantsView (skill-chip/record-form list) —
// both deleted in slice 2 (spec §D "the new block owns `.dse-mt__*` wholesale").
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
import type { MontageModel } from './model';
import { HeadView } from './HeadView';
import { BoardView } from './BoardView';
import { OutcomeBandView } from './OutcomeBandView';
import { StripView } from './StripView';
import { GuideView } from './GuideView';

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

		new HeadView(model, cycleOwner, canPersist, () => void this.resetProgress()).build(container);
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
		new BoardView(model, cycleOwner).build(container);
		new OutcomeBandView(model).build(container);
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

	private async resetProgress(): Promise<void> {
		new Notice('Montage progress reset');
		this.model.successes = 0;
		this.model.failures = 0;
		this.model.current_round = 1;
		this.model.entries = undefined;
		for (const participant of this.model.participants ?? []) {
			participant.skills_used = [];
		}
		try {
			await this.update(this.model);
			await this.persist();
		} catch (error) {
			console.error('Draw Steel Elements: montage reset failed', error);
		}
	}
}
