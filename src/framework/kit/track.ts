// SC-379 (slice 1) — kit/track: a 0..N radiogroup of numbered round "seals", drawn along
// a horizontal or a vertical rail. The first consumer is negotiation's Patience (horizontal,
// 'remaining' fill) and Interest (vertical, descending, plain) tracks; montage and the
// recoveries strip hand-roll their own pip rows today and migrate onto this part later
// (SC-380), so the part stays generic: it knows nothing about negotiation.
//
// A TRUE radiogroup (the same contract as powerRollPanel(selectable) and tabs): every slot
// is a real <button role="radio" aria-checked>, exactly one is checked, and the group is
// ONE Tab stop (roving tabindex: 0 on the checked slot, -1 on the rest). Arrow keys move
// along the rail in DOM order (Left/Up = previous, Right/Down = next, wrapping), Home/End
// jump to the ends, and selection FOLLOWS focus, so every move fires `onChange` exactly
// once. Clicking the slot that is already checked is a no-op (no onChange, no write).
//
// State is never carried by hue alone: the CSS pairs the fill kind (data-fill: a filled
// steel seal vs a hollow dashed one), the checked slot (solid fill + ring) and, for the
// vertical form, the row's own text. The hooks the CSS reads are attributes, not classes:
//   [data-fill="on|spent|plain|floor"]  per slot (see `fill`)
//   [data-current]                      on the checked slot
//   [data-edge="first|last"]            the DOM-order ends, so the vertical rail can be drawn
//                                       one row at a time and never overshoot (the rail runs
//                                       mark centre to mark centre, however tall a row wraps)
//
// `--dse-track-fill` (value / max) is the sanctioned TS -> CSS seam, like montage's
// `--dse-mt-cols`: the horizontal rail's solid segment reads it for its width. Colour,
// gradient and ring all live in styles-source.css.
//
// F1 §4.5: every listener is owner-bound (registerDomEvent). `disabled` hosts (read-only
// views, F1 §4.4) get REAL disabled buttons and no listeners at all: visible state, no
// write path.
import type { Component } from 'obsidian';

export interface TrackOptions {
	orientation: 'horizontal' | 'vertical';
	/** Slots are 0..max (min is always 0). */
	max: number;
	/** The checked slot; clamped to 0..max for display. */
	value: number;
	/** The radiogroup's aria-label ("Patience" / "Interest"). */
	label: string;
	/** DOM order of the slots; default ascending. Interest is descending (5 at the top). */
	order?: 'ascending' | 'descending';
	/** 'remaining' (Patience): 1..value = on, > value = spent, 0 = floor.
	 *  'none' (Interest): every slot is plain. Default 'none'. */
	fill?: 'remaining' | 'none';
	/** Vertical only: the row's text (Interest's outcome offer). */
	slotText?: (n: number) => string;
	/** Per-slot aria-label; default `${label} ${n}`. */
	slotLabel?: (n: number) => string;
	/** Read-only hosts: REAL disabled buttons, no listeners. */
	disabled?: boolean;
	/** Fired on USER selection changes only (click / keyboard) — never by setValue(). */
	onChange?: (n: number) => void;
}

export interface TrackHandle {
	readonly rootEl: HTMLElement;
	readonly slotEls: Readonly<Record<number, HTMLButtonElement>>;
	/** External update, in place: aria-checked, tabindex, data-fill, data-current. No
	 *  onChange, no focus steal. */
	setValue(n: number): void;
	getValue(): number;
}

/** Mounts the radiogroup of seals into `parent`. */
export function track(parent: HTMLElement, opts: TrackOptions, owner: Component): TrackHandle {
	const max = Math.max(0, Math.floor(opts.max));
	const fillMode = opts.fill ?? 'none';
	const vertical = opts.orientation === 'vertical';
	const clamp = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0);
	let value = clamp(opts.value);

	const rootEl = parent.createDiv({ cls: `dse-track dse-track--${opts.orientation}` });
	rootEl.setAttribute('role', 'radiogroup');
	rootEl.setAttribute('aria-label', opts.label);

	// Horizontal: the rail is two spans behind the seals (a dashed base and a solid segment
	// whose width the CSS derives from --dse-track-fill). The vertical rail is drawn per
	// slot instead (see the header) so it can never overshoot a wrapped row.
	if (!vertical) {
		rootEl.createSpan({ cls: 'dse-track__rail' });
		rootEl.createSpan({ cls: 'dse-track__rail-fill' });
	}

	// DOM order: ascending 0..max, or descending max..0.
	const order: number[] = [];
	for (let n = 0; n <= max; n++) order.push(n);
	if (opts.order === 'descending') order.reverse();

	const slotEls: Record<number, HTMLButtonElement> = {};
	order.forEach((n, i) => {
		const slot = rootEl.createEl('button', { cls: 'dse-track__slot' });
		slot.setAttribute('type', 'button'); // never a form submit
		slot.setAttribute('role', 'radio');
		slot.setAttribute('data-value', String(n));
		slot.setAttribute('aria-label', opts.slotLabel ? opts.slotLabel(n) : `${opts.label} ${n}`);
		if (i === 0) slot.setAttribute('data-edge', 'first');
		else if (i === order.length - 1) slot.setAttribute('data-edge', 'last');
		const mark = slot.createSpan({ cls: 'dse-track__mark' });
		mark.createSpan({ cls: 'dse-track__n', text: String(n) });
		if (vertical) slot.createSpan({ cls: 'dse-track__text', text: opts.slotText?.(n) ?? '' });
		if (opts.disabled) slot.disabled = true;
		slotEls[n] = slot;
	});

	/** Reflects `value` onto every slot + the fill seam, in place (roving tabindex). */
	function render(): void {
		rootEl.style.setProperty('--dse-track-fill', String(max === 0 ? 0 : value / max));
		for (const n of order) {
			const slot = slotEls[n];
			const checked = n === value;
			slot.setAttribute('aria-checked', String(checked));
			slot.setAttribute('tabindex', checked ? '0' : '-1');
			slot.toggleAttribute('data-current', checked);
			const fill =
				fillMode === 'remaining' ? (n === 0 ? 'floor' : n <= value ? 'on' : 'spent') : 'plain';
			slot.setAttribute('data-fill', fill);
		}
	}
	render(); // initial mount: no onChange

	/** The one selection-change path: no-ops on re-selection. */
	function change(n: number, focus: boolean): void {
		if (n === value) return;
		value = n;
		render();
		if (focus) slotEls[n].focus(); // selection follows focus
		opts.onChange?.(n);
	}

	if (!opts.disabled) {
		for (const n of order) {
			owner.registerDomEvent(slotEls[n], 'click', () => change(n, false));
		}
		owner.registerDomEvent(rootEl, 'keydown', (evt: KeyboardEvent) => {
			// Anchor on the slot the key landed on (falls back to the checked one).
			const landed = (evt.target as HTMLElement | null)?.closest?.('.dse-track__slot');
			const landedAt = order.findIndex((n) => slotEls[n] === landed);
			const current = landedAt === -1 ? order.indexOf(value) : landedAt;
			let next: number;
			switch (evt.key) {
				case 'ArrowRight':
				case 'ArrowDown':
					next = (current + 1) % order.length;
					break;
				case 'ArrowLeft':
				case 'ArrowUp':
					next = (current - 1 + order.length) % order.length;
					break;
				case 'Home':
					next = 0;
					break;
				case 'End':
					next = order.length - 1;
					break;
				default:
					return; // unhandled keys pass through untouched
			}
			evt.preventDefault();
			change(order[next], true);
		});
	}

	return {
		rootEl,
		slotEls,
		setValue: (n: number): void => {
			value = clamp(n);
			render();
		},
		getValue: () => value,
	};
}
