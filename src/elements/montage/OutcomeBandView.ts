// SC-191 impl spec §D "outcome band (verdict / tracks / rule line / notes / brink)" —
// replaces RoundTrackView's steppers-plus-chip with the settled `merged` band (ledger
// 2026-08-28/08-29: "I like the footer showing the outcome information … Lets clean up the
// UI to avoid all the duplication"). One band states: the live/final verdict word, the one
// stat that is not a tally (hero actions left / rounds used), the two EQUAL-WIDTH tracks
// (ledger 2026-08-29 ruling — a countable slot per limit, so a lower failure_limit means
// WIDER failure slots, never a shorter track), the rule the band's own word depends on, the
// Director's notes (spec §D "Notes"), and the brink alert.
//
// The `pending` band (model.ts's montageOutcome fourth band, fixed in this slice) is a real
// band here too: a montage with nothing recorded gets a neutral crest and "This montage" /
// "Not started" rather than reading as a Total Failure.
import { setIcon } from 'obsidian';
import type { MontageModel, MontageOutcome } from './model';
import { montageOutcome, montageTallies, montageBandCopy } from './model';

const BAND_ICON: Record<MontageOutcome, string> = {
	pending: 'hourglass',
	total: 'trophy',
	partial: 'flag',
	failure: 'skull',
};

export class OutcomeBandView {
	constructor(private readonly model: MontageModel) {}

	public build(parent: HTMLElement): void {
		const m = this.model;
		const band = montageOutcome(m);
		const tallies = montageTallies(m);
		const copy = montageBandCopy(m);
		const party = m.participants?.length ?? 0;
		const entries = m.entries ?? [];
		const roundsLeft = Math.max(0, m.rounds - m.current_round + 1);
		const actionsThisRound = entries.filter((e) => e.round === m.current_round).length;
		const actionsLeft = tallies.complete ? 0 : Math.max(0, roundsLeft * party - actionsThisRound);
		const margin = tallies.successes - tallies.failures;
		// The brink: one success from Total Success AND still reachable in the actions left
		// — a montage that cannot possibly log enough successes before it runs out is not
		// "on the brink", it is already trending toward partial/failure.
		const brink = !tallies.complete && tallies.toTotal === 1 && tallies.toTotal <= actionsLeft;

		const bandEl = parent.createDiv({ cls: 'dse-mt__outcome' });
		bandEl.setAttribute('data-band', band);
		bandEl.setAttribute('data-brink', brink ? 'on' : 'off');

		this.buildTop(bandEl, band, copy.word, tallies.complete, actionsLeft);
		this.buildTracks(bandEl, tallies.successes, m.success_limit, copy.successTail, tallies.failures, m.failure_limit, copy.failureTail);
		this.buildRule(bandEl, tallies.complete, margin);
		this.buildNotes(bandEl, entries);
		if (brink) this.buildBrinkAlert(bandEl);
	}

	private buildTop(bandEl: HTMLElement, band: MontageOutcome, word: string, complete: boolean, actionsLeft: number): void {
		const top = bandEl.createDiv({ cls: 'dse-mt__outcome-top' });
		const now = top.createDiv({ cls: 'dse-mt__verdict-now' });
		const crest = now.createSpan({ cls: 'dse-mt__verdict-crest' });
		crest.setAttribute('aria-hidden', 'true');
		setIcon(crest, BAND_ICON[band]);
		const words = now.createDiv({ cls: 'dse-mt__verdict-words' });
		words.createSpan({
			cls: 'dse-mt__verdict-eyebrow',
			text: complete ? 'Final result' : band === 'pending' ? 'This montage' : 'If it ended now',
		});
		words.createSpan({ cls: 'dse-mt__verdict-word', text: word });

		const stats = top.createDiv({ cls: 'dse-mt__verdict-stats' });
		const s = stats.createDiv({ cls: 'dse-mt__stat' });
		s.setAttribute('data-kind', 'actions');
		s.createSpan({ cls: 'dse-mt__stat-value', text: String(complete ? this.model.current_round : actionsLeft) });
		s.createSpan({ cls: 'dse-mt__stat-label', text: complete ? 'rounds used' : 'hero actions left' });
	}

	private buildTracks(
		bandEl: HTMLElement,
		successes: number,
		successLimit: number,
		successTail: string,
		failures: number,
		failureLimit: number,
		failureTail: string,
	): void {
		const tracks = bandEl.createDiv({ cls: 'dse-mt__outcome-tracks' });
		this.buildTrackRow(tracks, 'success', 'check', 'Successes', successes, successLimit, successTail);
		this.buildTrackRow(tracks, 'failure', 'x', 'Failures', failures, failureLimit, failureTail);
	}

	private buildTrackRow(
		parent: HTMLElement,
		kind: 'success' | 'failure',
		glyph: string,
		word: string,
		filled: number,
		limit: number,
		tail: string,
	): void {
		const row = parent.createDiv({ cls: 'dse-mt__prog' });
		row.setAttribute('data-kind', kind);
		const label = row.createSpan({ cls: 'dse-mt__prog-label' });
		setIcon(label.createSpan({ cls: 'dse-mt__prog-glyph' }), glyph);
		label.createSpan({ cls: 'dse-mt__prog-word', text: word });

		// The countable track: length always states the Director's limit (ledger
		// 2026-08-29's equal-width ruling), only fill states progress.
		const track = row.createDiv({ cls: 'dse-mt__track' });
		track.setAttribute('data-kind', kind);
		for (let i = 0; i < limit; i++) {
			const slot = track.createSpan({ cls: 'dse-mt__track-slot' });
			slot.setAttribute('data-filled', i < filled ? 'on' : 'off');
			if (i === limit - 1) slot.setAttribute('data-goal', 'on');
		}
		row.createSpan({ cls: 'dse-mt__prog-tail', text: tail });
	}

	private buildRule(bandEl: HTMLElement, complete: boolean, margin: number): void {
		const rules = bandEl.createDiv({ cls: 'dse-mt__verdict-rules' });
		rules.createSpan({
			cls: 'dse-mt__verdict-rule',
			text: complete
				? 'Total Success awards 1 Victory on an easy or moderate montage, 2 on a hard one.'
				: `Partial Success needs successes to lead failures by 2 — currently ${margin >= 0 ? '+' : ''}${margin}.`,
		});
	}

	private buildNotes(bandEl: HTMLElement, entries: NonNullable<MontageModel['entries']>): void {
		const noted = entries
			.filter((e) => e.note)
			.slice()
			.sort((a, b) => a.round - b.round || a.hero.localeCompare(b.hero));
		if (noted.length === 0) return;

		const box = bandEl.createDiv({ cls: 'dse-mt__notes' });
		box.createSpan({ cls: 'dse-mt__notes-head', text: 'Notes' });
		const list = box.createEl('ul', { cls: 'dse-mt__notes-list' });
		for (const e of noted) {
			const li = list.createEl('li', { cls: 'dse-mt__note' });
			li.setAttribute('data-kind', e.result);
			setIcon(li.createSpan({ cls: 'dse-mt__note-glyph' }), e.result === 'success' ? 'check' : e.result === 'failure' ? 'x' : 'circle-plus');
			const who = li.createSpan({ cls: 'dse-mt__note-who' });
			who.createSpan({ cls: 'dse-mt__note-hero', text: e.hero });
			who.createSpan({ cls: 'dse-mt__note-where', text: `round ${e.round}${e.skill ? ' · ' + e.skill.toLowerCase() : ''}` });
			li.createSpan({ cls: 'dse-mt__note-text', text: e.note ?? '' });
		}
	}

	private buildBrinkAlert(bandEl: HTMLElement): void {
		const alert = bandEl.createDiv({ cls: 'dse-mt__verdict-alert' });
		alert.createSpan({ cls: 'dse-mt__verdict-alert-mark', text: '◆' });
		alert.createSpan({ cls: 'dse-mt__verdict-alert-text', text: 'One success from Total Success' });
	}
}
