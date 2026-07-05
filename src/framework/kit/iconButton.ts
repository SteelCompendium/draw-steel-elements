// Plan 08 Task 2 (D2 §2.1) — kit/iconButton + buttonRow: the accessible control
// primitive. Replaces DsButton.vue and the 30-of-51 click-handling <div>/<span>
// controls (MP-1): a REAL <button> so keyboard activation, focusability, and the
// `disabled` semantics come from the platform (§4.1).
//
// CB-8: "disabled" used to be a class, which left Enter (and synthetic clicks) live.
// Here disabled is the REAL HTMLButtonElement property — native activation is
// suppressed by the platform — plus an in-handler guard that also swallows synthetic
// dispatchEvent() clicks.
//
// D2 §5 / SC-5: consumes only --dse-* tokens (see the .dse-btn* rules in
// styles-source.css); no inline styles, no color literals. F1 §4.5: the click listener
// is owner-bound (registerDomEvent) so it is detached on owner.unload().
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';
import { tooltip } from './tooltip';

export type IconButtonVariant = 'default' | 'accent' | 'ghost' | 'danger';

export interface IconButtonOptions {
	/** Lucide icon name for setIcon → `.dse-btn__icon`. */
	icon?: string;
	/**
	 * REQUIRED accessible name (§4.2) — the aria-label. For icon-only buttons this is
	 * the whole name; with visible `text` it still wins as the announced name, so keep
	 * the two consistent.
	 */
	label: string;
	/** Visible text → `.dse-btn__text`. */
	text?: string;
	/** Visual variant → `.dse-btn--<variant>` (default adds no modifier). */
	variant?: IconButtonVariant;
	/**
	 * Renders aria-pressed (a toggle button, §4.3) + `[data-pressed]` for CSS.
	 * Omit entirely for plain (non-toggle) buttons.
	 */
	pressed?: boolean;
	/** Initial disabled state — the REAL property (CB-8), never a class. */
	disabled?: boolean;
	/** Native hover tooltip via kit tooltip() / Obsidian setTooltip (§2.5). */
	tooltip?: string;
	onClick: (evt: MouseEvent) => void;
}

export interface IconButtonHandle {
	readonly buttonEl: HTMLButtonElement;
	/** Toggles the real `disabled` property in place. */
	setDisabled(disabled: boolean): void;
	/** Reflects toggle state: aria-pressed + [data-pressed], in place. */
	setPressed(pressed: boolean): void;
	/** Updates the accessible name in place (e.g. Play ↔ Pause toggles). */
	setLabel(label: string): void;
}

/**
 * Mounts an accessible icon/text button into `parent`. Real `<button type="button">`,
 * required aria-label, ≥44×44 px hit area via CSS padding (`--dse-touch-min`, §4.6).
 */
export function iconButton(
	parent: HTMLElement,
	opts: IconButtonOptions,
	owner: Component,
): IconButtonHandle {
	const buttonEl = parent.createEl('button', { cls: 'dse-btn' });
	buttonEl.setAttribute('type', 'button'); // never an implicit form submit
	buttonEl.setAttribute('aria-label', opts.label);
	if (opts.variant && opts.variant !== 'default') {
		buttonEl.addClass(`dse-btn--${opts.variant}`);
	}

	if (opts.icon) {
		const iconEl = buttonEl.createSpan({ cls: 'dse-btn__icon' });
		setIcon(iconEl, opts.icon);
	}
	if (opts.text !== undefined) {
		buttonEl.createSpan({ cls: 'dse-btn__text', text: opts.text });
	}

	const setPressed = (pressed: boolean): void => {
		buttonEl.setAttribute('aria-pressed', String(pressed));
		if (pressed) buttonEl.setAttribute('data-pressed', '');
		else buttonEl.removeAttribute('data-pressed');
	};
	if (opts.pressed !== undefined) setPressed(opts.pressed);

	buttonEl.disabled = opts.disabled === true;

	if (opts.tooltip !== undefined) tooltip(buttonEl, opts.tooltip);

	owner.registerDomEvent(buttonEl, 'click', (evt: MouseEvent) => {
		// The real property already suppresses native activation (click/Enter/Space);
		// this guard additionally swallows synthetic dispatchEvent() clicks, which a
		// bare "disabled" class never did (CB-8).
		if (buttonEl.disabled) return;
		opts.onClick(evt);
	});

	return {
		buttonEl,
		setDisabled: (disabled: boolean): void => {
			buttonEl.disabled = disabled;
		},
		setPressed,
		setLabel: (label: string): void => {
			buttonEl.setAttribute('aria-label', label);
		},
	};
}

export interface ButtonRowHandle {
	readonly rowEl: HTMLElement;
	readonly buttons: IconButtonHandle[];
}

/** Mounts a `.dse-btn-row` of iconButtons (modal footers, action bars — §2.1). */
export function buttonRow(
	parent: HTMLElement,
	buttons: IconButtonOptions[],
	owner: Component,
): ButtonRowHandle {
	const rowEl = parent.createDiv({ cls: 'dse-btn-row' });
	return { rowEl, buttons: buttons.map((opts) => iconButton(rowEl, opts, owner)) };
}
