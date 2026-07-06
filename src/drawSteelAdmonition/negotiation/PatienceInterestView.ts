// Plan 09 Task 7 (D2 §3.10) — the Patience track + Interest ladder on the kit
// iconButton: every clickable bubble is a REAL <button aria-pressed> (click-to-set),
// keyboard-operable by construction, replacing the legacy click-<div>s. Selection
// repaints IN PLACE through the kit handles (aria-pressed/[data-pressed]) plus the
// [data-current]/[data-reached] attributes the CSS keys to --dse-accent (current-rung
// glow) and --dse-fg-faint (passed rungs) — no querySelector class sweeps, no rebuild.
//
// Persistence contract unchanged (Plan 05 Task 5): the owning NegotiationView injects
// `persist` (framework debounced write-behind); a user mutation mutates the model then
// persists — rendering NEVER writes. Read-only hosts (F1 §4.4): the bubbles render as
// visible state but REAL-disabled (CB-8 — the kit guard also swallows synthetic
// clicks), and no persist path can fire.
import type { Component } from 'obsidian';
import { iconButton } from '@/framework/kit';
import type { IconButtonHandle } from '@/framework/kit';
import { NegotiationData } from '@model/NegotiationData';

export class PatienceInterestView {
	private readonly patienceBubbles: IconButtonHandle[] = [];
	private readonly interestBubbles: IconButtonHandle[] = [];
	private readonly interestRows: HTMLElement[] = [];
	private readonly interestOffers: HTMLElement[] = [];

	constructor(
		private readonly data: NegotiationData,
		private readonly persist: () => void,
		private readonly owner: Component,
		private readonly canPersist: boolean,
	) {}

	public build(parent: HTMLElement): void {
		this.addPatience(parent);
		this.addInterest(parent);
	}

	/** A track bubble: round kit iconButton, aria-pressed = "filled up to here". */
	private bubble(
		parent: HTMLElement,
		value: number,
		label: string,
		onClick: () => void,
	): IconButtonHandle {
		const handle = iconButton(
			parent,
			{
				text: String(value),
				label,
				pressed: false, // painted by the render pass below
				disabled: !this.canPersist,
				onClick,
			},
			this.owner,
		);
		handle.buttonEl.addClass('dse-nt__bubble');
		handle.buttonEl.setAttribute('data-value', String(value));
		return handle;
	}

	// -- Patience: label + 6 bubbles over a connector line ---------------------------

	private addPatience(parent: HTMLElement): void {
		const container = parent.createDiv({ cls: 'dse-nt__patience' });
		container.createDiv({ cls: 'dse-nt__patience-label', text: 'Patience' });
		const track = container.createDiv({ cls: 'dse-nt__patience-track' });
		for (let i = 0; i <= 5; i++) {
			this.patienceBubbles.push(
				this.bubble(track, i, `Set patience to ${i}`, () => this.setPatience(i)),
			);
		}
		this.renderPatience();
	}

	/** User mutation: update data, repaint in place, persist (render never writes). */
	private setPatience(value: number): void {
		this.data.current_patience = value;
		this.renderPatience();
		this.persist();
	}

	private renderPatience(): void {
		this.patienceBubbles.forEach((bubble, i) => bubble.setPressed(i <= this.data.current_patience));
	}

	// -- Interest: the 5..0 offer ladder ----------------------------------------------

	private addInterest(parent: HTMLElement): void {
		const container = parent.createDiv({ cls: 'dse-nt__interest' });
		container.createDiv({ cls: 'dse-nt__interest-header', text: 'Interest' });
		const ladder = container.createDiv({ cls: 'dse-nt__interest-ladder' });

		// NegotiationData's i0..i5 are individually declared string fields (not
		// index-signature-accessible) — an explicit map instead of `this.data[`i${i}`]`.
		const offers: Record<number, string> = {
			0: this.data.i0,
			1: this.data.i1,
			2: this.data.i2,
			3: this.data.i3,
			4: this.data.i4,
			5: this.data.i5,
		};

		for (let i = 5; i >= 0; i--) {
			const row = ladder.createDiv({ cls: 'dse-nt__interest-row' });
			row.setAttribute('data-interest', String(i));
			this.interestBubbles[i] = this.bubble(row, i, `Set interest to ${i}`, () =>
				this.setInterest(i),
			);
			this.interestRows[i] = row;
			this.interestOffers[i] = row.createDiv({ cls: 'dse-nt__interest-offer', text: offers[i] });
		}
		this.renderInterest();
	}

	/** User mutation: update data, repaint in place, persist (render never writes). */
	private setInterest(value: number): void {
		this.data.current_interest = value;
		this.renderInterest();
		this.persist();
	}

	private renderInterest(): void {
		const current = this.data.current_interest;
		for (let i = 0; i <= 5; i++) {
			// Bubbles fill up to the current rung (legacy ds-nt-interest-selected)…
			this.interestBubbles[i].setPressed(i <= current);
			// …the current rung glows (--dse-accent, via CSS)…
			this.interestRows[i].toggleAttribute('data-current', i === current);
			// …and PASSED rungs below it fade (--dse-fg-faint, via CSS).
			this.interestOffers[i].toggleAttribute('data-reached', i < current);
		}
	}
}
