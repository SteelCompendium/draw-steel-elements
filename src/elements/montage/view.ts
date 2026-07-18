// D8 Task 6 (spec §4) — MontageView: the ds-montage element, sibling to Negotiation (the
// F1 negotiation/view.ts decomposition — cardHead + a canPersist-gated reset iconButton
// + Menu, sub-views built fresh each mount) — NOT the stale
// src/drawSteelAdmonition/negotiation/ legacy port path (that's a byte-compat wrapper
// around a pre-Framework-v2 class; montage has no legacy predecessor to wrap).
//
// Reset here clears PROGRESS only (successes/failures/current_round/each participant's
// skills_used) — the Director-set config (title, rounds, limits, participant roster)
// survives a reset, since re-authoring the whole block for a second montage attempt
// would defeat the point of a reset button. Same shape as negotiation's resetData(): a
// whole-model mutation, framework default update() (unload children + onMount again),
// then persist — never during render.
import { Component, Menu, Notice } from 'obsidian';
import { ElementView } from '@/framework/view';
import { cardHead, iconButton } from '@/framework/kit';
import type { MontageModel } from './model';
import { RoundTrackView } from './RoundTrackView';
import { ParticipantsView } from './ParticipantsView';

export class MontageView extends ElementView<MontageModel> {
	protected onMount(root: HTMLElement, model: MontageModel): void {
		// Per-mount listener owner: torn down by the framework default update() before
		// the next onMount runs (F1 §4.5) — nothing accumulates across resets/refreshes.
		const cycleOwner = this.addChild(new Component());
		const persist = (): void => {
			void this.persist();
		};
		// Record-test mutations touch both sub-views (a tally + the skill chip list) —
		// a full rebuild is the simplest correct way to keep them in sync (same shape as
		// the Reset flow below); the steppers' own ± clicks still repaint in place via
		// their kit handles, this is only reached from ParticipantsView.
		const refresh = (): void => {
			void this.update(this.model);
		};
		const canPersist = this.cx.host.canPersist;

		const container = root.createDiv({ cls: 'dse-mt' });

		this.buildHead(container, cycleOwner, model);

		new RoundTrackView(model, persist, cycleOwner, canPersist).build(container);

		new ParticipantsView(model, persist, refresh, cycleOwner, canPersist, this.cx.roll).build(container);
	}

	/** kit cardHead (CB-16-style: name slot, never a baked "Montage Test: " prefix) + the
	 *  Reset options button (write action — canPersist only, F1 §4.4). */
	private buildHead(container: HTMLElement, owner: Component, model: MontageModel): void {
		const head = container.createDiv({ cls: 'dse-mt__head' });

		const title = model.title?.trim() ?? '';
		cardHead(
			head,
			{
				leftEyebrow: title ? 'Montage Test' : undefined,
				name: title || 'Montage Test',
				level: 2,
			},
			owner,
		);

		if (!this.cx.host.canPersist) return;

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
							.setTitle('Reset Progress')
							.setIcon('rotate-ccw')
							.onClick(() => void this.resetProgress()),
					);
					m.showAtMouseEvent(event);
				},
			},
			owner,
		);
		menu.buttonEl.addClass('dse-mt__menu');
	}

	private async resetProgress(): Promise<void> {
		new Notice('Montage progress reset');
		this.model.successes = 0;
		this.model.failures = 0;
		this.model.current_round = 1;
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
