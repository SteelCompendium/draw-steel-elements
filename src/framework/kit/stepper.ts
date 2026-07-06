// Plan 08 Task 2 (D2 §2.2) — kit/stepper: labelled numeric ± triad. Replaces
// StaminaAdjustor.vue and the ad-hoc stamina/counter/malice/patience ± <div>s.
// Two kit iconButtons (real <button>s, so min/max disabling is the REAL property —
// CB-8 semantics inherited) around an aria-live value display, or an
// <input type="number"> when `editable`.
//
// CB-10 (no double-commit): Enter and blur funnel into ONE commit path that is a
// no-op unless the clamped draft actually differs from the current value — an
// Enter-then-blur sequence fires onChange exactly once, and Escape reverts the draft
// so the following blur is a no-op too.
//
// F1 §4.5: every listener is owner-bound. CB-7: the Handle (setValue/getValue)
// updates the value node in place — callers never rebuild the triad.
import type { Component } from 'obsidian';
import { iconButton } from './iconButton';

export interface StepperOptions {
	value: number;
	min?: number;
	max?: number;
	/** Increment per ± press. Default 1. */
	step?: number;
	/** Render the value as an <input type="number"> the user can type into. */
	editable?: boolean;
	/**
	 * Integer-coerce TYPED commits with Math.trunc (parseInt's toward-zero semantics,
	 * applied before clamping) — for count-like steppers (stamina, counters) where a
	 * typed "7.5" must commit 7, never persist a float. The ± buttons already move by
	 * integer `step`, so this only affects the `editable` typed-commit path. Default
	 * false (raw Number() commit).
	 */
	integer?: boolean;
	/**
	 * Accessible name of the whole group (§4.2); the buttons derive theirs from it
	 * ("Decrease {label}" / "Increase {label}").
	 */
	label: string;
	/** Display formatting for the read-only value (ignored when `editable`). */
	format?: (value: number) => string;
	/** Fired once per user-driven value CHANGE — never by setValue(). */
	onChange: (value: number) => void;
}

export interface StepperHandle {
	readonly rootEl: HTMLElement;
	/** External update, in place: clamps, re-renders, refreshes button disabling. Does NOT fire onChange. */
	setValue(value: number): void;
	getValue(): number;
}

/** Mounts a decrement / value / increment triad into `parent` (D2 §2.2). */
export function stepper(
	parent: HTMLElement,
	opts: StepperOptions,
	owner: Component,
): StepperHandle {
	const step = opts.step ?? 1;
	const format = opts.format ?? ((n: number) => String(n));
	const clamp = (n: number): number => {
		if (opts.min !== undefined && n < opts.min) return opts.min;
		if (opts.max !== undefined && n > opts.max) return opts.max;
		return n;
	};
	let current = clamp(opts.value);

	const rootEl = parent.createDiv({ cls: 'dse-stepper' });
	rootEl.setAttribute('role', 'group');
	rootEl.setAttribute('aria-label', opts.label);

	const minusBtn = iconButton(
		rootEl,
		{ icon: 'minus', label: `Decrease ${opts.label}`, onClick: () => commit(current - step) },
		owner,
	);
	minusBtn.buttonEl.addClass('dse-stepper__btn');

	let valueEl: HTMLElement | undefined;
	let inputEl: HTMLInputElement | undefined;
	if (opts.editable) {
		inputEl = rootEl.createEl('input', { cls: 'dse-stepper__input', type: 'number' });
		inputEl.setAttribute('aria-label', opts.label);
		inputEl.setAttribute('aria-live', 'polite'); // §4.8 — ± presses change it programmatically
		if (opts.min !== undefined) inputEl.setAttribute('min', String(opts.min));
		if (opts.max !== undefined) inputEl.setAttribute('max', String(opts.max));
		inputEl.setAttribute('step', String(step));
	} else {
		valueEl = rootEl.createSpan({ cls: 'dse-stepper__value' });
		valueEl.setAttribute('aria-live', 'polite'); // §4.8 — announce changes
	}

	const plusBtn = iconButton(
		rootEl,
		{ icon: 'plus', label: `Increase ${opts.label}`, onClick: () => commit(current + step) },
		owner,
	);
	plusBtn.buttonEl.addClass('dse-stepper__btn');

	/** Reflects `current` onto the DOM in place + auto-disables at the bounds (real property). */
	function render(): void {
		if (inputEl) inputEl.value = String(current);
		if (valueEl) valueEl.setText(format(current));
		minusBtn.setDisabled(opts.min !== undefined && current <= opts.min);
		plusBtn.setDisabled(opts.max !== undefined && current >= opts.max);
	}

	/**
	 * The ONE commit path (CB-10): clamp, then no-op unless the value actually changed
	 * — so Enter-then-blur cannot double-fire onChange. render() runs either way to
	 * normalize a draft like "07" or an out-of-range "50" back to the shown value.
	 */
	function commit(next: number): void {
		next = clamp(next);
		if (next === current) {
			render();
			return;
		}
		current = next;
		render();
		opts.onChange(current);
	}

	if (inputEl) {
		const el = inputEl;
		const commitDraft = (): void => {
			const raw = el.value.trim();
			const parsed = raw === '' ? NaN : Number(raw);
			if (Number.isNaN(parsed)) {
				render(); // invalid draft → revert, no commit
				return;
			}
			// `integer`: truncate toward zero (parseInt semantics) BEFORE clamping.
			commit(opts.integer ? Math.trunc(parsed) : parsed);
		};
		owner.registerDomEvent(el, 'keydown', (evt: KeyboardEvent) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				commitDraft();
			} else if (evt.key === 'Escape') {
				// Revert only a dirty draft, and swallow the key so a containing modal
				// doesn't close on the SAME press; a clean Escape bubbles normally.
				if (el.value !== String(current)) {
					evt.preventDefault();
					evt.stopPropagation();
					render();
				}
			}
		});
		owner.registerDomEvent(el, 'blur', () => commitDraft());
	}

	render();

	return {
		rootEl,
		setValue: (value: number): void => {
			current = clamp(value);
			render();
		},
		getValue: () => current,
	};
}
