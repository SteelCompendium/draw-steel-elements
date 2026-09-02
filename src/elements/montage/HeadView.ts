// SC-191 impl spec §D "head (crest, eyebrow, name, deck, round chip)" — replaces the
// hand-rolled head block MontageView.buildHead() used to own directly (negotiation-sibling:
// kit cardHead + a canPersist-gated Reset iconButton/Menu, F1 §4.4). Slice 2 extracts it into
// its own view (spec §I "Replaces RoundTrackView/ParticipantsView with
// HeadView/BoardView/OutcomeBandView") and adds the two new slots cardHead already supports
// (crest.ts, cardHead.ts) but the pre-SC-191 head never used: a leftDeck line ("N heroes · one
// action each per round") and a rightEyebrow round chip ("Round 3 / 3" / "Complete").
//
// THE ⋯ MENU IS UNCHANGED — still the hand-rolled `Menu` with its one "Reset progress" item.
// Replacing it with the SC-169 chrome panel (`ElementChrome.items`, spec §D) is explicitly
// slice 4's job (brief §2 "out of scope … the ⋯ chrome menu … (slice 4)"); slice 2 only moves
// the existing, working control into its own file and enriches the head it sits in.
import { Component, Menu } from 'obsidian';
import { cardHead } from '@/framework/kit';
import { iconButton } from '@/framework/kit';
import type { MontageModel } from './model';
import { montageOutcome, montageTallies } from './model';

export class HeadView {
	constructor(
		private readonly model: MontageModel,
		private readonly owner: Component,
		private readonly canPersist: boolean,
		/** Reset progress — bound to THIS view instance's model (CB-4: one view per block,
		 *  never a shared processor field). Runs the whole-model mutation, then the
		 *  framework's default update()+persist(), the same shape as negotiation's reset. */
		private readonly onReset: () => void,
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

		if (!this.canPersist) return;

		const menu = iconButton(
			head,
			{
				icon: 'more-vertical',
				label: 'Montage options',
				variant: 'ghost',
				onClick: (event: MouseEvent) => {
					const m = new Menu();
					m.addItem((item) =>
						item
							.setTitle('Reset progress')
							.setIcon('rotate-ccw')
							.onClick(() => this.onReset()),
					);
					m.showAtMouseEvent(event);
				},
			},
			this.owner,
		);
		menu.buttonEl.addClass('dse-mt__menu');
	}
}

/** The head crest is decorative (crest.ts: aria-hidden, no semantics depend on it) — an
 *  hourglass while the montage runs, matching the outcome band's own `pending`/live crest,
 *  since the head is the one place the crest is visible at every scroll position. */
function bandCrestIcon(model: MontageModel): string {
	return montageOutcome(model) === 'total' ? 'trophy' : 'hourglass';
}
