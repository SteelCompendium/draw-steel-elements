// Plan 14 Task 3 (D5 §3.5) — kit/rollResultCard: the compact post-roll card.
// Headline (tier / opposed / flat total; crit gets the reminder), the engine's
// traceable breakdown verbatim, Reroll/Clear actions. Small and inline — never
// a modal. The card root is a polite live region so a roll announces itself
// (§3.4 step 3). Kit⊥elements: takes a RollResult, knows nothing of session or
// service. Tokens only (OD-D5-9).
import type { Component } from 'obsidian';
import { iconButton } from './iconButton';
import type { RollResult } from '../roll/types';

export interface RollResultCardOptions {
	result: RollResult;
	/** Attribution marker when the Dice Roller bridge rolled the faces (§6.3). */
	delegate?: 'native' | 'dice-roller';
	onReroll?: () => void;
	onClear?: () => void;
}

export interface RollResultCardHandle {
	readonly rootEl: HTMLElement;
}

/** Mounts one result card into `parent`. Re-rolls REPLACE the card (caller empties). */
export function rollResultCard(
	parent: HTMLElement,
	opts: RollResultCardOptions,
	owner: Component,
): RollResultCardHandle {
	const { result } = opts;
	const rootEl = parent.createDiv({ cls: 'dse-rollcard' });
	// The live region: mounting/replacing the card announces the outcome (§3.6).
	rootEl.setAttribute('role', 'status');
	rootEl.setAttribute('aria-live', 'polite');

	const headline =
		result.isCritical ? `Critical! · ${result.total}`
		: result.tier !== undefined ? `Tier ${result.tier} · ${result.total}`
		: result.input.mode === 'opposed' ? `Opposed — ${result.total}`
		: `${result.total}`;
	rootEl.createDiv({ cls: 'dse-rollcard__headline', text: headline });
	if (result.isCritical) {
		rootEl.createDiv({
			cls: 'dse-rollcard__crit-note',
			text: 'Natural 19–20: you gain an additional main action this turn.',
		});
	}
	rootEl.createDiv({ cls: 'dse-rollcard__breakdown', text: result.breakdown });
	if (opts.delegate === 'dice-roller') {
		rootEl.createDiv({ cls: 'dse-rollcard__delegate', text: 'rolled with Dice Roller' });
	}

	const actionsEl = rootEl.createDiv({ cls: 'dse-rollcard__actions' });
	if (opts.onReroll) {
		iconButton(actionsEl, { icon: 'dices', label: 'Reroll', text: 'Reroll', onClick: () => opts.onReroll!() }, owner);
	}
	if (opts.onClear) {
		iconButton(actionsEl, { icon: 'x', label: 'Clear result', text: 'Clear', variant: 'ghost', onClick: () => opts.onClear!() }, owner);
	}

	return { rootEl };
}
