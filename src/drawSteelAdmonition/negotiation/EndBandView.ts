// SC-379 — the "negotiation over" band (approved by Scott, 2026-10-02). It states the book's
// three stop conditions in words, derived purely from the live standing
// (NegotiationData.ending()) — no model field, nothing persisted:
//   final   Patience is spent        -> "Final offer": the NPC makes a final offer at the
//                                       CURRENT Interest
//   deal    Interest reached 5       -> "Negotiation over": the NPC agrees (the i5 text)
//   hostile Interest fell to 0       -> "Negotiation over": the NPC ends it (the i0 text)
// The band exists only while ended: refresh() inserts it after the Interest board, updates
// it in place when the ending changes kind, and removes it when the standing moves off an
// ending condition. It is information, not a control, so read-only hosts show it too. The
// flag glyph and the words carry the state; the gold is decoration (never the sole signal).
import { setIcon } from 'obsidian';
import { NegotiationData } from '@model/NegotiationData';

export class EndBandView {
	private bandEl: HTMLElement | null = null;

	constructor(
		private readonly data: NegotiationData,
		/** The band is seated directly after this element (the Interest board). */
		private readonly anchorEl: HTMLElement,
	) {}

	/** The mounted band, or null while the negotiation is live. */
	public get element(): HTMLElement | null {
		return this.bandEl;
	}

	/** Syncs the band with the model: insert / update in place / remove. */
	public refresh(): void {
		const kind = this.data.ending();
		if (kind === null) {
			this.bandEl?.remove();
			this.bandEl = null;
			return;
		}

		if (!this.bandEl) {
			const band = document.createElement('div');
			band.classList.add('dse-nt__end');
			band.setAttribute('role', 'status');
			const flag = band.createSpan({ cls: 'dse-nt__icon dse-nt__end-flag' });
			flag.setAttribute('aria-hidden', 'true');
			setIcon(flag, 'flag');
			const body = band.createDiv({ cls: 'dse-nt__end-body' });
			body.createDiv({ cls: 'dse-nt__end-label' });
			body.createDiv({ cls: 'dse-nt__end-text' });
			this.anchorEl.after(band);
			this.bandEl = band;
		}

		const band = this.bandEl;
		band.setAttribute('data-kind', kind);
		const label = band.querySelector('.dse-nt__end-label') as HTMLElement;
		const text = band.querySelector('.dse-nt__end-text') as HTMLElement;
		label.setText(kind === 'final' ? 'Final offer' : 'Negotiation over');

		// The words and the offer. `final` quotes the Interest the heroes are stuck at.
		const interest = Math.round(NegotiationData.clampStanding(this.data.current_interest));
		const lead =
			kind === 'final'
				? `Patience is spent — the NPC makes a final offer at Interest ${interest}: `
				: kind === 'deal'
					? 'Interest reached 5 — the NPC agrees: '
					: 'Interest fell to 0 — the NPC ends it: ';
		const offer = kind === 'deal' ? this.data.i5 : kind === 'hostile' ? this.data.i0 : this.data.offerFor(interest);
		text.empty();
		text.createSpan({ text: lead });
		text.createEl('strong', { text: offer });
	}
}
