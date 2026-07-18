// D8 Task 6 (spec §4.2) — the successes/failures tallies + round counter + the live
// derived outcome-band readout, on the kit `stepper` (same widget/CB-10 single-commit
// contract as Counter). No max on the successes/failures/round steppers deliberately —
// a Director may legitimately push a tally past its own limit (a hand-edited block, a
// house-ruled overshoot); montageOutcome (model.ts) is what actually reads the limits,
// not the widget bounds. The "/ limit" (or "/ rounds") caption is a STATIC sibling span,
// not the stepper's own `format` option — format() only paints the read-only
// (`editable:false`) span, never the `<input>` an editable/canPersist stepper actually
// renders (stepper.ts's render() sets `inputEl.value` directly), so a static caption is
// the only way the limit stays visible in BOTH modes. F1 §4.4: read-only hosts
// REAL-disable every stepper button (the kit stepper has no built-in "editable disables
// the buttons too" behavior — same gap CounterElementView papers over the same way).
import type { Component } from 'obsidian';
import { stepper } from '@/framework/kit';
import type { StepperHandle } from '@/framework/kit';
import type { MontageModel } from './model';
import { montageOutcome } from './model';
import type { MontageOutcome } from './model';

const OUTCOME_LABEL: Record<MontageOutcome, string> = {
	total: 'Total Success',
	partial: 'Partial Success',
	failure: 'Total Failure',
};

export class RoundTrackView {
	private outcomeEl?: HTMLElement;

	constructor(
		private readonly model: MontageModel,
		private readonly persist: () => void,
		private readonly owner: Component,
		private readonly canPersist: boolean,
	) {}

	public build(parent: HTMLElement): void {
		const container = parent.createDiv({ cls: 'dse-mt__round-track' });

		const tallies = container.createDiv({ cls: 'dse-mt__tallies' });
		this.buildTally(tallies, 'Successes', this.model.successes, this.model.success_limit, (value) => {
			this.model.successes = value;
			this.renderOutcome();
			this.persist();
		});
		this.buildTally(tallies, 'Failures', this.model.failures, this.model.failure_limit, (value) => {
			this.model.failures = value;
			this.renderOutcome();
			this.persist();
		});

		const roundWrap = container.createDiv({ cls: 'dse-mt__round' });
		roundWrap.createDiv({ cls: 'dse-mt__tally-label', text: 'Round' });
		this.disableIfReadOnly(
			stepper(
				roundWrap,
				{
					value: this.model.current_round,
					min: 1,
					editable: this.canPersist,
					integer: true,
					label: 'Current round',
					onChange: (value) => {
						this.model.current_round = value;
						this.renderOutcome();
						this.persist();
					},
				},
				this.owner,
			),
		);
		roundWrap.createSpan({ cls: 'dse-mt__tally-limit', text: `/ ${this.model.rounds}` });

		this.outcomeEl = container.createDiv({ cls: 'dse-mt__outcome' });
		this.renderOutcome();
	}

	private buildTally(
		parent: HTMLElement,
		label: string,
		value: number,
		limit: number,
		onChange: (value: number) => void,
	): void {
		const wrap = parent.createDiv({ cls: 'dse-mt__tally' });
		wrap.createDiv({ cls: 'dse-mt__tally-label', text: label });
		this.disableIfReadOnly(
			stepper(
				wrap,
				{
					value,
					min: 0,
					editable: this.canPersist,
					integer: true,
					label,
					onChange,
				},
				this.owner,
			),
		);
		wrap.createSpan({ cls: 'dse-mt__tally-limit', text: `/ ${limit}` });
	}

	/** Read-only hosts (F1 §4.4): visible but REAL-disabled — no dead-end write path. */
	private disableIfReadOnly(handle: StepperHandle): void {
		if (this.canPersist) return;
		handle.rootEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
			btn.disabled = true;
		});
	}

	private renderOutcome(): void {
		if (!this.outcomeEl) return;
		const outcome = montageOutcome(this.model);
		this.outcomeEl.setText(OUTCOME_LABEL[outcome]);
		this.outcomeEl.setAttribute('data-outcome', outcome);
	}
}
