// SC-132 — the recoveries strip, extracted and given Model M.
//
// It used to exist TWICE, in near-identical copies: stamina-bar/view.ts's D7 Task 4
// strip (bound to the standalone `StaminaBar` model) and hero/view.ts's re-expression of
// the same against `HeroState`. That was tolerable while the strip was three read-only
// pips and a button; Model M adds click-to-set, a keyboard value control, grouping, the
// eyebrow, per-marker labelling and an optional popover, and two copies of that would
// drift within a release. Both views now compose THIS, handing it a value and two
// callbacks — the model stays theirs, the widget is shared (the same split the kit uses
// for every other control).
//
// MODEL M, in one sentence (SC-132 round 4, approved in comment 59638cd9): the markers
// are a VALUE CONTROL — clicking marker n sets the count, so both directions and any
// distance are one click — Catch Breath stays a separate icon-only button because
// spending-with-a-heal is a different act from editing a counter, and every mutation
// posts an undo toast (the caller's job: it owns the model that has to be restored).
//
//   Why "set the count" and not "toggle this one": RAW loses recoveries in multiples
//   ("the target loses 1d3 Recoveries" — Monsters :1646, :23792, :24808; "loses 2
//   Recoveries" — :21039), so a toggle would need three clicks for one monster rider.
//
//   Why the two EDGES read the way a reader predicts: clicking a marker that is still
//   available spends exactly up to and including it (`n = i`), and clicking one already
//   spent restores up to and including it (`n = i + 1`). So the last available marker
//   spends one, the first spent marker restores one, and no click is ever a no-op —
//   the same convention a star rating uses. `markerTarget` below is that rule, alone,
//   so it can be tested without a DOM.
//
// ACCESSIBILITY: the row is ONE `role="slider"` rather than N focusable markers. That is
// the honest ARIA for a value control (Model M's own description), it keeps the tab order
// to a single stop instead of twelve, and arrow keys/Home/End give the keyboard the same
// "any distance in one gesture" the mouse gets. The markers stay decorative `div`s —
// making them real `<button>`s would put UA chrome inside a 12px cell and change what the
// LEGACY theme renders, which this redesign is not allowed to do.
import { setTooltip } from 'obsidian';
import type { Component } from 'obsidian';
import { iconButton } from './iconButton';
import type { IconButtonHandle } from './iconButton';

/** Recovery markers per group. Scott, round 3: "we can add a small amount of whitespace
 *  between a group of 3-5 recovery cells to allow quick counting, kinda like how commas
 *  separate groups of 3 digits". G4 confirmed in round 5 — the only size that divides
 *  BOTH common counts evenly (8 → 4·4, 12 → 4·4·4). */
export const RECOVERY_GROUP_SIZE = 4;

/** Winded/dying, as the strip's badge reports it. Null = healthy (the badge is silent —
 *  a status that is always visible stops being a status). */
export type WoundState = 'winded' | 'dying' | null;

export interface RecoveriesStripOptions {
	/** recoveries_max — the number of markers drawn (the row's LENGTH says the maximum). */
	max: number;
	/** F1 §4.4: false renders read-only (visible but inert), never a dead-end click. */
	canPersist: boolean;
	owner: Component;
	/** Model M: the user asked for exactly `n` remaining. */
	onSetRemaining: (n: number) => void;
	/** RR §8 Catch Breath — spend one AND heal; the caller owns the heal. */
	onCatchBreath: () => void;
	/** The optional ALT stepper popover (a preference, default off): a marker click opens
	 *  a ∓ popover instead of committing immediately. */
	popoverEditor?: boolean;
	/** Shown on the inert controls when canPersist is false. */
	readOnlyTooltip?: string;
}

export interface RecoveriesStripState {
	remaining: number;
	wound: WoundState;
	/** RR §8: "Can't Catch Breath [while dying]" — plus the obvious floor at 0 remaining,
	 *  and the read-only gate. Computed by the caller, which owns the stamina model. */
	catchBreathDisabled: boolean;
}

export interface RecoveriesStripHandle {
	readonly rootEl: HTMLElement;
	readonly catchBreathEl: HTMLButtonElement;
	update(state: RecoveriesStripState): void;
}

/**
 * Model M's set-rule, isolated from the DOM.
 *
 * @param index 0-based marker index that was activated
 * @param remaining the count before the click
 * @returns the count after it
 */
export function markerTarget(index: number, remaining: number): number {
	return index < remaining ? index : index + 1;
}

/** The tooltip carries the fraction on EVERY form, including the narrow one where the
 *  RECOVERIES eyebrow stands down — Scott, round 3: "On more condensed views I think we
 *  can drop it (still need a tooltip). The tooltip can show the fraction". */
function fractionLabel(remaining: number, max: number): string {
	return `Recoveries: ${remaining} / ${max}`;
}

/**
 * Mounts the strip under the bar: the Legacy status badge, the RECOVERIES eyebrow, the
 * marker row, and the icon-only Catch Breath control.
 */
export function renderRecoveriesStrip(
	parent: HTMLElement,
	opts: RecoveriesStripOptions,
): RecoveriesStripHandle {
	const rootEl = parent.createDiv({ cls: 'dse-stamina-rec' });

	// The Legacy strip's own Winded/Dying badge. Kept in the DOM (Legacy renders it, and
	// this redesign leaves Legacy byte-identical) and hidden by the Steel layer, where
	// the cluster's own state word says it once, in one place.
	const statusEl = rootEl.createDiv({ cls: 'dse-stamina-rec__status' });

	// Steel-only chrome: the base sheet hides it, so Legacy and print are unaffected.
	// It stands down again below ~290px of strip via a container query — measured, not
	// guessed: at the narrowest real hero column the eyebrow costs the markers 71 of the
	// 143px they need.
	const eyebrowEl = rootEl.createDiv({ cls: 'dse-stamina-rec__eyebrow' });
	eyebrowEl.createSpan({ cls: 'dse-stamina-rec__eyebrow-word', text: 'Recoveries' });

	const pipsEl = rootEl.createDiv({ cls: 'dse-stamina-rec__pips' });
	pipsEl.setAttribute('role', 'slider');
	pipsEl.setAttribute('aria-label', 'Recoveries');
	pipsEl.setAttribute('aria-valuemin', '0');
	pipsEl.setAttribute('aria-valuemax', String(opts.max));
	for (let i = 0; i < opts.max; i++) {
		const pip = pipsEl.createDiv({ cls: 'dse-stamina-rec__pip' });
		// Grouping whitespace is stamped per marker rather than with :nth-child, so the
		// group size stays a decision in code (this constant) instead of being hard-coded
		// into a stylesheet selector.
		if (i > 0 && i % RECOVERY_GROUP_SIZE === 0) pip.setAttribute('data-grp', 'start');
		// The row's slider role already reports the value to AT; twelve marker labels
		// would say the same thing twelve more times.
		pip.setAttribute('aria-hidden', 'true');
	}

	const catchBreath: IconButtonHandle = iconButton(
		rootEl,
		{
			icon: 'wind',
			label: 'Catch Breath',
			// The text node stays in the DOM for Legacy (byte-identical) and is hidden by
			// the Steel layer — Scott: "If there is a button, I think it needs to be only
			// the icon."
			text: 'Catch Breath',
			onClick: () => opts.onCatchBreath(),
		},
		opts.owner,
	);

	let current = 0;
	let popover: HTMLElement | null = null;
	let repaintPopover: (() => void) | null = null;

	const closePopover = (): void => {
		popover?.remove();
		popover = null;
		repaintPopover = null;
	};

	const commit = (n: number): void => {
		const clamped = Math.max(0, Math.min(opts.max, n));
		if (clamped === current) return;
		opts.onSetRemaining(clamped);
	};

	/** The ALT editor: one extra click per edit, and a stray click becomes structurally
	 *  incapable of changing anything. Off by default; Scott asked for it as an option
	 *  ("can we allow for the ALT stepper popover as an optional setting. I think it looks
	 *  really good and some players may want it"). */
	const openPopover = (): void => {
		if (popover) {
			closePopover();
			return;
		}
		const pop = rootEl.createDiv({ cls: 'dse-stamina-rec__pop' });
		popover = pop;
		pop.createSpan({ cls: 'dse-stamina-rec__pop-title', text: 'Recoveries' });
		const dec = pop.createEl('button', { cls: 'dse-stamina-rec__pop-btn', text: '−' });
		dec.type = 'button';
		dec.setAttribute('aria-label', 'Spend a Recovery');
		const val = pop.createSpan({ cls: 'dse-stamina-rec__pop-val' });
		const inc = pop.createEl('button', { cls: 'dse-stamina-rec__pop-btn', text: '+' });
		inc.type = 'button';
		inc.setAttribute('aria-label', 'Restore a Recovery');
		repaintPopover = () => val.setText(`${current} / ${opts.max}`);
		repaintPopover();
		dec.addEventListener('click', () => commit(current - 1));
		inc.addEventListener('click', () => commit(current + 1));
		pop.createDiv({ cls: 'dse-stamina-rec__pop-sep' });
		const cb = pop.createEl('button', { cls: 'dse-stamina-rec__pop-cb', text: 'Catch Breath' });
		cb.type = 'button';
		cb.addEventListener('click', () => {
			closePopover();
			opts.onCatchBreath();
		});
	};

	if (opts.canPersist) {
		opts.owner.registerDomEvent(pipsEl, 'click', (evt: MouseEvent) => {
			if (opts.popoverEditor) {
				openPopover();
				return;
			}
			const target = (evt.target as HTMLElement | null)?.closest('.dse-stamina-rec__pip');
			if (!target) return;
			const index = Array.prototype.indexOf.call(pipsEl.children, target);
			if (index < 0) return;
			commit(markerTarget(index, current));
		});
		pipsEl.setAttribute('tabindex', '0');
		opts.owner.registerDomEvent(pipsEl, 'keydown', (evt: KeyboardEvent) => {
			const step =
				evt.key === 'ArrowRight' || evt.key === 'ArrowUp'
					? 1
					: evt.key === 'ArrowLeft' || evt.key === 'ArrowDown'
						? -1
						: 0;
			if (step !== 0) {
				evt.preventDefault();
				commit(current + step);
				return;
			}
			if (evt.key === 'Home') {
				evt.preventDefault();
				commit(0);
			} else if (evt.key === 'End') {
				evt.preventDefault();
				commit(opts.max);
			} else if (evt.key === 'Escape') {
				closePopover();
			}
		});
		// The popover is a transient overlay, so it dismisses the way every other one
		// does: a click anywhere outside it closes it.
		opts.owner.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			if (!popover) return;
			const node = evt.target as Node | null;
			if (node && rootEl.contains(node)) return;
			closePopover();
		});
	} else {
		pipsEl.setAttribute('aria-disabled', 'true');
		if (opts.readOnlyTooltip !== undefined) setTooltip(catchBreath.buttonEl, opts.readOnlyTooltip);
	}

	return {
		rootEl,
		catchBreathEl: catchBreath.buttonEl,
		update(state: RecoveriesStripState): void {
			current = state.remaining;
			pipsEl.querySelectorAll<HTMLElement>('.dse-stamina-rec__pip').forEach((pip, i) => {
				pip.toggleClass('dse-stamina-rec__pip--filled', i < state.remaining);
				// Per-marker intent, so the affordance is legible before it is clicked
				// rather than only after.
				setTooltip(pip, `Set Recoveries to ${markerTarget(i, state.remaining)}`);
			});
			pipsEl.setAttribute('aria-valuenow', String(state.remaining));
			pipsEl.setAttribute('aria-valuetext', fractionLabel(state.remaining, opts.max));
			setTooltip(pipsEl, fractionLabel(state.remaining, opts.max));

			statusEl.hidden = state.wound === null;
			if (state.wound) {
				statusEl.setText(state.wound === 'dying' ? 'Dying' : 'Winded');
				statusEl.setAttribute('data-state', state.wound);
			} else {
				statusEl.setText('');
				statusEl.removeAttribute('data-state');
			}

			catchBreath.setDisabled(state.catchBreathDisabled);
			repaintPopover?.();
		},
	};
}
