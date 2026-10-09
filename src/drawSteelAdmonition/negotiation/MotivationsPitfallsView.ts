// SC-379 — the Motivations / Pitfalls cards at the bottom of the tracker: two labelled,
// SHAPE-keyed columns (a ◆ for a motivation still open, ◇ once spent; the warning triangle for
// a pitfall — colour only reinforces the shape). Per Scott's "buttons in the tab", these cards
// carry NO appeal/mention controls (those are the chips inside "Make an Argument"). The only
// control is a motivation's "Mark spent" / "✓ Spent" chip, which still routes through
// NegotiationData.setMotivationUsed (it also maintains currentArgument.reusedMotivation) so the
// written YAML is exactly what the old checkbox wrote. Pitfall rows are reference text.
//
// A Spent toggle repaints this card in place (the row's ◆/◇, the strike-through, the chip, the
// "N of M open" count) and re-syncs the argument tab (via `refreshArgument`: the spent state of
// the appeal chips and the reuse modifier follow). `refresh()` is also called back by Complete
// Argument, which spends motivations without touching this card. Listeners are owner-bound
// (F1 §4.5); read-only hosts (F1 §4.4) get a REAL-disabled chip with no listener: visible state,
// no write path. Persistence is unchanged: a user toggle persists, rendering never writes.
import { setIcon } from 'obsidian';
import type { Component } from 'obsidian';
import { tooltip } from '@/framework/kit';
import { NegotiationData } from '@model/NegotiationData';

interface MotivationRow {
	rowEl: HTMLElement;
	glyphEl: HTMLElement;
	chipEl: HTMLButtonElement;
}

export class MotivationsPitfallsView {
	private readonly rows = new Map<string, MotivationRow>();
	private countEl?: HTMLElement;

	constructor(
		private readonly data: NegotiationData,
		private readonly persist: () => void,
		private readonly refreshArgument: () => void,
		private readonly owner: Component,
		private readonly canPersist: boolean,
	) {}

	public build(parent: HTMLElement): void {
		const container = parent.createDiv({ cls: 'dse-nt__dossier' });
		this.addMotivations(container);
		this.addPitfalls(container);
		this.refresh();
	}

	/** Repaints every motivation row (and the open count) from the model, in place. */
	public refresh(): void {
		let open = 0;
		for (const mot of this.data.motivations) {
			const row = this.rows.get(mot.name);
			if (!row) continue;
			const spent = mot.hasBeenAppealedTo ?? false;
			if (!spent) open++;
			row.rowEl.toggleClass('is-spent', spent);
			row.glyphEl.setText(spent ? '◇' : '◆');
			this.paintChip(row.chipEl, mot.name, spent);
		}
		this.countEl?.setText(`${open} of ${this.data.motivations.length} open`);
	}

	private addMotivations(parent: HTMLElement): void {
		if (this.data.motivations.length === 0) return;
		const col = parent.createEl('section', { cls: 'dse-nt__dossier-col' });
		col.setAttribute('data-kind', 'motivation');

		const head = col.createDiv({ cls: 'dse-nt__dossier-head' });
		const glyph = head.createSpan({ cls: 'dse-nt__glyph--mot', text: '◆' });
		glyph.setAttribute('aria-hidden', 'true');
		head.createSpan({ cls: 'dse-nt__label', text: 'Motivations' });
		this.countEl = head.createSpan({ cls: 'dse-nt__dossier-count' });

		for (const mot of this.data.motivations) {
			const rowEl = col.createDiv({ cls: 'dse-nt__dos' });
			const glyphEl = rowEl.createSpan({ cls: 'dse-nt__dos-glyph dse-nt__glyph--mot' });
			glyphEl.setAttribute('aria-hidden', 'true');
			const text = rowEl.createDiv({ cls: 'dse-nt__dos-text' });
			text.createSpan({ cls: 'dse-nt__dos-name', text: mot.name });
			text.createSpan({ cls: 'dse-nt__dos-reason', text: mot.reason });

			const chipEl = rowEl.createEl('button', { cls: 'dse-optchip dse-nt__chip' });
			chipEl.setAttribute('type', 'button');
			chipEl.setAttribute('data-kind', 'spent');
			if (!this.canPersist) chipEl.disabled = true;
			// Read-only: no listener at all — there is no write path to reach (§4.4).
			else {
				this.owner.registerDomEvent(chipEl, 'click', () => {
					this.data.setMotivationUsed(mot.name, !(mot.hasBeenAppealedTo ?? false));
					this.refresh();
					this.refreshArgument();
					this.persist();
				});
			}
			this.rows.set(mot.name, { rowEl, glyphEl, chipEl });
		}
	}

	private paintChip(chip: HTMLButtonElement, name: string, spent: boolean): void {
		chip.empty();
		chip.setAttribute('aria-pressed', String(spent));
		if (spent) {
			const check = chip.createSpan({ cls: 'dse-nt__icon dse-nt__chip-check' });
			check.setAttribute('aria-hidden', 'true');
			setIcon(check, 'check');
		}
		chip.createSpan({ cls: 'dse-nt__chip-text', text: spent ? 'Spent' : 'Mark spent' });
		tooltip(
			chip,
			spent
				? `${name} has already been appealed to. Select again to mark it unspent.`
				: `Mark ${name} as already appealed to.`,
		);
	}

	private addPitfalls(parent: HTMLElement): void {
		if (this.data.pitfalls.length === 0) return;
		const col = parent.createEl('section', { cls: 'dse-nt__dossier-col' });
		col.setAttribute('data-kind', 'pitfall');

		const head = col.createDiv({ cls: 'dse-nt__dossier-head' });
		const icon = head.createSpan({ cls: 'dse-nt__icon dse-nt__glyph--pit' });
		icon.setAttribute('aria-hidden', 'true');
		setIcon(icon, 'triangle-alert');
		head.createSpan({ cls: 'dse-nt__label', text: 'Pitfalls' });
		head.createSpan({ cls: 'dse-nt__dossier-count', text: `${this.data.pitfalls.length} known` });

		for (const pit of this.data.pitfalls) {
			const rowEl = col.createDiv({ cls: 'dse-nt__dos' });
			const glyph = rowEl.createSpan({ cls: 'dse-nt__icon dse-nt__dos-glyph dse-nt__glyph--pit' });
			glyph.setAttribute('aria-hidden', 'true');
			setIcon(glyph, 'triangle-alert');
			const text = rowEl.createDiv({ cls: 'dse-nt__dos-text' });
			text.createSpan({ cls: 'dse-nt__dos-name', text: pit.name });
			text.createSpan({ cls: 'dse-nt__dos-reason', text: pit.reason });
		}
	}
}
