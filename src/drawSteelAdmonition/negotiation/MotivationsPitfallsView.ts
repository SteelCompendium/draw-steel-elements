// Plan 09 Task 7 (D2 §3.10) — the Motivations/Pitfalls details block, re-classed onto
// the .dse-nt__motivations grammar (same list/details structure as before: motivation
// rows are <label> + native checkbox — already real controls — pitfall rows are static
// name/reason lines). Listeners are owner-bound (F1 §4.5); the legacy `title` moved
// onto the kit tooltip (§4.2). Read-only hosts (F1 §4.4): checkboxes render REAL-
// disabled with no listeners — visible state, no write path.
//
// Persistence contract unchanged (Plan 05 Task 5): the owning NegotiationView injects
// `persist`; a user toggle routes through NegotiationData.setMotivationUsed (which also
// maintains currentArgument.reusedMotivation) and persists — rendering never writes.
import type { Component } from 'obsidian';
import { tooltip } from '@/framework/kit';
import { NegotiationData } from '@model/NegotiationData';

export class MotivationsPitfallsView {
	constructor(
		private readonly data: NegotiationData,
		private readonly persist: () => void,
		private readonly owner: Component,
		private readonly canPersist: boolean,
	) {}

	public build(parent: HTMLElement): void {
		const container = parent.createDiv({ cls: 'dse-nt__motivations' });
		this.addMotivations(container);
		this.addPitfalls(container);
	}

	private addMotivations(parent: HTMLElement): void {
		if (this.data.motivations.length === 0) return;
		parent.createDiv({ cls: 'dse-nt__details-header', text: 'Motivations' });
		const list = parent.createDiv({ cls: 'dse-nt__details-list' });

		for (const mot of this.data.motivations) {
			const label = list.createEl('label', { cls: 'dse-nt__details-item' });
			tooltip(label, 'Check Motivations that have already been appealed to.');
			const checkbox = label.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
			checkbox.checked = mot.hasBeenAppealedTo ?? false;
			if (!this.canPersist) checkbox.disabled = true;
			label.createSpan({ cls: 'dse-nt__details-name', text: mot.name + ': ' });
			label.createSpan({ cls: 'dse-nt__details-reason', text: mot.reason });
			// Read-only: no listener at all — there is no write path to reach (§4.4).
			if (this.canPersist) {
				this.owner.registerDomEvent(checkbox, 'change', () => {
					this.data.setMotivationUsed(mot.name, checkbox.checked);
					this.persist();
				});
			}
		}
	}

	private addPitfalls(parent: HTMLElement): void {
		if (this.data.pitfalls.length === 0) return;
		parent.createDiv({ cls: 'dse-nt__details-header', text: 'Pitfalls' });
		const list = parent.createDiv({ cls: 'dse-nt__details-list' });

		for (const pit of this.data.pitfalls) {
			const item = list.createDiv({ cls: 'dse-nt__details-item' });
			item.createSpan({ cls: 'dse-nt__details-name', text: pit.name + ': ' });
			item.createSpan({ cls: 'dse-nt__details-reason', text: pit.reason });
		}
	}
}
