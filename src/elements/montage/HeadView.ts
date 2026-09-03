// SC-191 impl spec §D "head (crest, eyebrow, name, deck, round chip)" — replaces the
// hand-rolled head block MontageView.buildHead() used to own directly (negotiation-sibling:
// kit cardHead + a canPersist-gated Reset iconButton/Menu, F1 §4.4). Slice 2 extracts it into
// its own view (spec §I "Replaces RoundTrackView/ParticipantsView with
// HeadView/BoardView/OutcomeBandView") and adds the two new slots cardHead already supports
// (crest.ts, cardHead.ts) but the pre-SC-191 head never used: a leftDeck line ("N heroes · one
// action each per round") and a rightEyebrow round chip ("Round 3 / 3" / "Complete").
//
// SLICE 4: the hand-rolled ⋯ `Menu` (a single "Reset progress" item) is DELETED — the SC-169
// chrome panel (`ElementView.chromeItems()`, view.ts) now carries all five ⋯ items, including
// Reset progress. The mock's `.mt2-menu` was always a drawing of the panel, never a second
// menu (spec §D). HeadView is now purely presentational: no canPersist gate, no Reset wiring.
import type { Component } from 'obsidian';
import { cardHead } from '@/framework/kit';
import type { MontageModel } from './model';
import { montageOutcome, montageTallies } from './model';

export class HeadView {
	constructor(
		private readonly model: MontageModel,
		private readonly owner: Component,
	) {}

	public build(container: HTMLElement): void {
		const head = container.createDiv({ cls: 'dse-mt__head' });

		const title = this.model.title?.trim() ?? '';
		const complete = montageTallies(this.model).complete;
		const party = this.model.participants?.length ?? 0;

		cardHead(
			head,
			{
				leftEyebrow: title ? 'Montage Test' : undefined,
				name: title || 'Montage Test',
				// The deck line names the montage's one un-tallied fact: how many actions a
				// round buys. It is the only place this is written at sidebar width, where
				// the board's own round header row stands down (spec §E narrow @container).
				leftDeck: `${party} ${party === 1 ? 'hero' : 'heroes'} · one action each per round`,
				// The ROUND chip. Not a tally (spec §D dedupe note) — it survives the
				// head/board/outcome-band de-duplication because it is the montage's LENGTH,
				// which nothing else on the card states at narrow width.
				rightEyebrow: complete ? 'Complete' : `Round ${this.model.current_round} / ${this.model.rounds}`,
				crest: { icon: bandCrestIcon(this.model), size: 'lg' },
				level: 2,
			},
			this.owner,
		);
	}
}

/** The head crest is decorative (crest.ts: aria-hidden, no semantics depend on it) — an
 *  hourglass while the montage runs, matching the outcome band's own `pending`/live crest,
 *  since the head is the one place the crest is visible at every scroll position. */
function bandCrestIcon(model: MontageModel): string {
	return montageOutcome(model) === 'total' ? 'trophy' : 'hourglass';
}
