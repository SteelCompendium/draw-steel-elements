// SC-379 — the standing region: Patience on a HORIZONTAL rail, Interest on a VERTICAL rail,
// both made of the same round numbered seal (kit track()). Round 2's locked "A1" direction.
//
//  - Patience: six seals 0..5 across a rail. Filled steel = patience still left, dashed
//    hollow = spent, the current value is the solid teal ringed seal. A "n / 5" readout sits
//    beside the label (aria-hidden: the track already carries the value to AT).
//  - Interest: six rows 5..0, each the seal plus the authored outcome text. The current row
//    is ringed and carries a "now" tag (swapped for "final offer" / "outcome" once the
//    negotiation is over).
//
// Both tracks are real radiogroups (<button role="radio">, roving tabindex, arrow keys —
// see kit/track.ts). A selection mutates the model, repaints the whole standing region
// through the injected `refreshStanding` (both tracks, readouts, now-tag, the end band and
// data-ended, all in place — no rebuild) and THEN persists; rendering never writes. Read-only
// hosts (F1 §4.4) get REAL-disabled seals: visible state, no listeners, no write path.
//
// The YAML is untouched: nothing here adds a field, and an out-of-range authored value is
// only CLAMPED FOR DISPLAY (the file is not rewritten on render).
import { setIcon } from 'obsidian';
import type { Component } from 'obsidian';
import { track } from '@/framework/kit';
import type { TrackHandle } from '@/framework/kit';
import { NegotiationData } from '@model/NegotiationData';

export class PatienceInterestView {
	private patienceTrack!: TrackHandle;
	private interestTrack!: TrackHandle;
	private readoutValueEl!: HTMLElement;
	private nowEl!: HTMLElement;
	private interestEl!: HTMLElement;

	constructor(
		private readonly data: NegotiationData,
		private readonly persist: () => void,
		private readonly refreshStanding: () => void,
		private readonly owner: Component,
		private readonly canPersist: boolean,
	) {}

	/** Mounts the Patience strip then the Interest board; returns the board so the owning
	 *  view can seat the end band directly after it. */
	public build(parent: HTMLElement): HTMLElement {
		this.addPatience(parent);
		this.addInterest(parent);
		this.refresh();
		return this.interestEl;
	}

	/** Repaints both tracks, the readout and the now-tag in place from the model. */
	public refresh(): void {
		const patience = NegotiationData.clampStanding(this.data.current_patience);
		const interest = NegotiationData.clampStanding(this.data.current_interest);
		this.patienceTrack.setValue(patience);
		this.interestTrack.setValue(interest);
		this.readoutValueEl.setText(String(this.patienceTrack.getValue()));

		// The now-tag rides the checked Interest row; its words/flag follow the ending.
		const ending = this.data.ending();
		this.interestTrack.slotEls[this.interestTrack.getValue()].appendChild(this.nowEl);
		this.nowEl.empty();
		if (ending !== null) {
			const flag = this.nowEl.createSpan({ cls: 'dse-nt__icon dse-nt__now-flag' });
			setIcon(flag, 'flag');
		}
		this.nowEl.createSpan({
			text: ending === null ? 'now' : ending === 'final' ? 'final offer' : 'outcome',
		});
	}

	// -- Patience: label + readout + the horizontal rail ------------------------------

	private addPatience(parent: HTMLElement): void {
		const section = parent.createEl('section', { cls: 'dse-nt__patience' });

		const label = section.createDiv({ cls: 'dse-nt__patience-label' });
		const icon = label.createSpan({ cls: 'dse-nt__icon' });
		icon.setAttribute('aria-hidden', 'true');
		setIcon(icon, 'hourglass');
		label.createSpan({ cls: 'dse-nt__label', text: 'Patience' });

		const readout = section.createDiv({ cls: 'dse-nt__readout' });
		readout.setAttribute('aria-hidden', 'true');
		this.readoutValueEl = readout.createSpan({ cls: 'dse-nt__readout-value' });
		readout.createSpan({ cls: 'dse-nt__readout-of', text: '/ 5' });

		this.patienceTrack = track(
			section,
			{
				orientation: 'horizontal',
				max: 5,
				value: NegotiationData.clampStanding(this.data.current_patience),
				label: 'Patience',
				fill: 'remaining',
				disabled: !this.canPersist,
				onChange: (n) => this.setPatience(n),
			},
			this.owner,
		);
	}

	/** User mutation: update data, repaint in place, persist (render never writes). */
	private setPatience(value: number): void {
		this.data.current_patience = value;
		this.refreshStanding();
		this.persist();
	}

	// -- Interest: the 5..0 outcome board ----------------------------------------------

	private addInterest(parent: HTMLElement): void {
		const section = parent.createEl('section', { cls: 'dse-nt__interest' });
		this.interestEl = section;

		const head = section.createDiv({ cls: 'dse-nt__interest-head' });
		head.createSpan({ cls: 'dse-nt__label', text: 'Interest' });
		head.createSpan({ cls: 'dse-nt__interest-hint', text: 'what the NPC will agree to' });

		this.interestTrack = track(
			section,
			{
				orientation: 'vertical',
				order: 'descending',
				max: 5,
				value: NegotiationData.clampStanding(this.data.current_interest),
				label: 'Interest',
				fill: 'none',
				slotText: (n) => this.data.offerFor(n),
				// The row's visible text is the outcome; naming the radio by it too keeps AT
				// from hearing only "Interest 3" for a row that is really an offer.
				slotLabel: (n) => `Interest ${n}: ${this.data.offerFor(n)}`,
				disabled: !this.canPersist,
				onChange: (n) => this.setInterest(n),
			},
			this.owner,
		);
		// Mounted here, then moved onto the checked row by refresh() (build() calls it next).
		this.nowEl = section.createSpan({ cls: 'dse-nt__now' });
	}

	/** User mutation: update data, repaint in place, persist (render never writes). */
	private setInterest(value: number): void {
		this.data.current_interest = value;
		this.refreshStanding();
		this.persist();
	}
}
