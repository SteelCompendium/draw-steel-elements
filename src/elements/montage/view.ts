// SC-191 impl spec §I slice 2 — MontageView on the settled `roster`/`merged` design (spec
// §A design freeze): HeadView (cardHead + crest/deck/round-chip + the unchanged Reset menu)
// over an optional description brief, the BoardView grid (Heroes × rounds × Tally, read
// from `model.entries`), and the OutcomeBandView (the merged verdict/tracks/notes band,
// including the `pending` band model.ts now returns at 0/0). Replaces the pre-SC-191
// RoundTrackView (steppers + a bare outcome chip) and ParticipantsView (skill-chip/
// record-form list) — both deleted in this slice (spec §D "the new block owns `.dse-mt__*`
// wholesale").
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

export class MontageView extends ElementView<MontageModel> {
	protected async onMount(root: HTMLElement, model: MontageModel): Promise<void> {
		// Per-mount listener owner: torn down by the framework default update() before
		// the next onMount runs (F1 §4.5) — nothing accumulates across resets/refreshes.
		const cycleOwner = this.addChild(new Component());
		const canPersist = this.cx.host.canPersist;

		const container = root.createDiv({ cls: 'dse-mt' });

		new HeadView(model, cycleOwner, canPersist, () => void this.resetProgress()).build(container);
		await this.buildBrief(container, model);
		new BoardView(model, cycleOwner).build(container);
		new OutcomeBandView(model).build(container);
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
