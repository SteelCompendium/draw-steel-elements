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
import { MOVING_ATTR } from '../host/adoptView';
import { stampControl } from './controlId';
import { registerEscapeConsumer } from './escapeConsumer';

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
	 * Clamp the SEED value into [min,max] on first render. Default true. Set false
	 * (P09 T4 review) for persisted values that may legitimately sit out of range — a
	 * hand-edited `current_value: 25` under `max: 20` — which must DISPLAY as stored,
	 * never be silently misrepresented as the bound. While out of range, the ± buttons
	 * step the value back TOWARD the range one `step` at a time (25 → 24, never a
	 * jump to 20) but never further out (the outward button disables via the normal
	 * at-bound rule, since 25 ≥ max); once back inside [min,max], normal clamping
	 * resumes. TYPED commits (`editable`) and setValue still clamp normally — typing
	 * is deliberate; only the seeded/±-stepped value honors out-of-range. This is the
	 * legacy CounterView contract (display unclamped; decrement guarded only by min,
	 * increment only by max; finishEditing clamped).
	 */
	clampInitial?: boolean;
	/**
	 * Accessible name of the whole group (§4.2); the buttons derive theirs from it
	 * ("Decrease {label}" / "Increase {label}").
	 */
	label: string;
	/** SC-408: control-id prefix; stamps `<id>.dec`, `<id>.input` (or `<id>.value` when not
	 *  editable) and `<id>.inc` (attributes only). */
	control?: string;
	/** Display formatting for the read-only value (ignored when `editable`). */
	format?: (value: number) => string;
	/**
	 * SC-377 — build the read-only value node's CONTENT yourself (ignored when `editable`;
	 * takes precedence over `format`). For a value that needs structure `format`'s plain string
	 * cannot carry, e.g. a caption span beside a numeral span. Called on every render with the
	 * (already emptied) value node and must write only into it; the node itself, its
	 * aria-live and the CB-7 update-in-place contract are unchanged.
	 */
	renderValue?: (valueEl: HTMLElement, value: number) => void;
	/** Fired once per user-driven value CHANGE — never by setValue(). */
	onChange: (value: number) => void;
	/**
	 * SC-430 — opt-in, `editable` only: observe the half-typed DRAFT without committing it
	 * (commit stays on blur / Enter — lifecycle G-S3 pins that a half-typed draft survives the
	 * adoption blur). Fired on every `input` event with the value a commit WOULD land
	 * (Math.trunc'd when `integer`, then clamped to [min,max]), or `null` when the draft is
	 * empty / unparseable; and with `null` once the draft is RESOLVED (committed, reverted by
	 * Escape, or discarded as invalid), BEFORE `onChange` fires for a commit. A caller that
	 * previews a pending edit (e.g. an Apply button's label/enabled state) uses it to follow
	 * the draft. When absent no listener is added and nothing else changes.
	 */
	onDraftInput?: (draft: number | null) => void;
}

export interface StepperHandle {
	readonly rootEl: HTMLElement;
	/** External update, in place: clamps, re-renders, refreshes button disabling. Does NOT fire onChange. */
	setValue(value: number): void;
	getValue(): number;
	/**
	 * SC-430: commit the typed draft NOW through the same path blur/Enter use (a no-op
	 * when the draft is clean or the stepper isn't `editable`). Lets a caller whose own
	 * button is about to read the value make sure a pending draft has landed first.
	 */
	commitDraft(): void;
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
	let current = opts.clampInitial === false ? opts.value : clamp(opts.value);
	/**
	 * Clamp for ± STEP commits. Under clampInitial:false an out-of-range `current`
	 * widens its violated bound to itself, so a step may move toward the range
	 * (25 → 24 with max 20 — the step result stands, no snap to the bound) but never
	 * further out; the far bound still clamps normally (a big step from 25 can't
	 * overshoot below min). With in-range values — and always in the default mode —
	 * this IS `clamp`.
	 */
	const stepClamp = (n: number): number => {
		let lo = opts.min;
		let hi = opts.max;
		if (opts.clampInitial === false) {
			if (hi !== undefined && current > hi) hi = current;
			if (lo !== undefined && current < lo) lo = current;
		}
		if (lo !== undefined && n < lo) return lo;
		if (hi !== undefined && n > hi) return hi;
		return n;
	};

	const rootEl = parent.createDiv({ cls: 'dse-stepper' });
	rootEl.setAttribute('role', 'group');
	rootEl.setAttribute('aria-label', opts.label);

	const minusBtn = iconButton(
		rootEl,
		{ icon: 'minus', label: `Decrease ${opts.label}`, onClick: (evt) => commit(current - step, evt.detail === 0) },
		owner,
	);
	minusBtn.buttonEl.addClass('dse-stepper__btn');
	if (opts.control) stampControl(minusBtn.buttonEl, `${opts.control}.dec`);

	let valueEl: HTMLElement | undefined;
	let inputEl: HTMLInputElement | undefined;
	if (opts.editable) {
		inputEl = rootEl.createEl('input', { cls: 'dse-stepper__input', type: 'number' });
		inputEl.setAttribute('aria-label', opts.label);
		if (opts.control) stampControl(inputEl, `${opts.control}.input`);
		inputEl.setAttribute('aria-live', 'polite'); // §4.8 — ± presses change it programmatically
		if (opts.min !== undefined) inputEl.setAttribute('min', String(opts.min));
		if (opts.max !== undefined) inputEl.setAttribute('max', String(opts.max));
		inputEl.setAttribute('step', String(step));
	} else {
		valueEl = rootEl.createSpan({ cls: 'dse-stepper__value' });
		if (opts.control) stampControl(valueEl, `${opts.control}.value`);
		valueEl.setAttribute('aria-live', 'polite'); // §4.8 — announce changes
		// SC-495: programmatically focusable (a ± button that disables itself at its bound hands focus
		// here) but NOT a tab stop — the Tab order of every surface is unchanged.
		valueEl.setAttribute('tabindex', '-1');
	}

	const plusBtn = iconButton(
		rootEl,
		{ icon: 'plus', label: `Increase ${opts.label}`, onClick: (evt) => commit(current + step, evt.detail === 0) },
		owner,
	);
	plusBtn.buttonEl.addClass('dse-stepper__btn');
	if (opts.control) stampControl(plusBtn.buttonEl, `${opts.control}.inc`);

	/** Reflects `current` onto the DOM in place + auto-disables at the bounds (real property). */
	function render(keyboard = false): void {
		if (inputEl) inputEl.value = String(current);
		if (valueEl) {
			if (opts.renderValue) {
				valueEl.empty();
				opts.renderValue(valueEl, current);
			} else valueEl.setText(format(current));
		}
		// SC-495: a ± button that disables itself WHILE IT HOLDS FOCUS makes Chromium drop focus to
		// <body> (Enter/Space then do nothing, the focus ring is gone, a screen reader loses its place).
		// For a KEYBOARD press hand focus to the value node instead. "Keyboard" is read from the
		// activating click event (`detail === 0`: Enter/Space and a programmatic click; a real pointer
		// click has `detail >= 1`), NOT from the button's :focus-visible state: a note's click shield
		// keeps a button's earlier keyboard focus through a mouse click.
		// Never the opposite button: a held Enter auto-repeats and would ping-pong the value.
		// A POINTER press moves nothing (the base behaviour): a focused number field takes the mouse
		// wheel (a scroll over it would change the pending value, and a click away would write it), and
		// a field focused by a tap raises the soft keyboard on a phone. A disable while focus is
		// elsewhere (setValue, a typed commit) moves nothing either.
		const active = rootEl.ownerDocument.activeElement;
		const held = active === minusBtn.buttonEl || active === plusBtn.buttonEl ? (active as HTMLButtonElement) : null;
		minusBtn.setDisabled(opts.min !== undefined && current <= opts.min);
		plusBtn.setDisabled(opts.max !== undefined && current >= opts.max);
		if (held && keyboard && held.disabled) {
			// `focusVisible` (Chromium 124+) shows the ring on the new target; older engines ignore the key.
			(inputEl ?? valueEl)?.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
		}
	}

	/**
	 * The ONE commit path (CB-10): clamp, then no-op unless the value actually changed
	 * — so Enter-then-blur cannot double-fire onChange. render() runs either way to
	 * normalize a draft like "07" or an out-of-range "50" back to the shown value.
	 * Uses stepClamp (≡ clamp except for an out-of-range clampInitial:false value);
	 * the typed path below pre-applies the FULL clamp, so typed commits always land
	 * inside [min,max].
	 */
	function commit(next: number, keyboard = false): void {
		next = stepClamp(next);
		if (next === current) {
			render(keyboard);
			return;
		}
		current = next;
		render(keyboard);
		opts.onChange(current);
	}

	let commitTypedDraft: () => void = () => undefined;
	if (inputEl) {
		const el = inputEl;
		/** What a commit of the current draft would land: truncated + fully clamped, or null. */
		const parseDraft = (): number | null => {
			const raw = el.value.trim();
			const parsed = raw === '' ? NaN : Number(raw);
			if (Number.isNaN(parsed)) return null;
			return clamp(opts.integer ? Math.trunc(parsed) : parsed);
		};
		const commitDraft = (): void => {
			opts.onDraftInput?.(null); // the draft is resolving — before onChange runs
			const next = parseDraft();
			if (next === null) {
				render(); // invalid draft → revert, no commit
				return;
			}
			// `integer`: truncate toward zero (parseInt semantics) BEFORE clamping.
			// FULL clamp here (typing is deliberate — it lands inside [min,max] even
			// when clampInitial:false left `current` out of range); stepClamp inside
			// commit() is then an identity on the already-clamped value.
			commit(next);
		};
		/** Reverts a DIRTY draft to the shown value (no commit); false = nothing to revert. */
		const cancelDraft = (): boolean => {
			if (el.value === String(current)) return false;
			render();
			opts.onDraftInput?.(null);
			return true;
		};
		// SC-431: a containing DseModal calls this from its Obsidian Scope, which runs in the
		// window capture phase BEFORE the keydown handler below can swallow the key.
		registerEscapeConsumer(el, cancelDraft, owner);
		owner.registerDomEvent(el, 'keydown', (evt: KeyboardEvent) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				commitDraft();
			} else if (evt.key === 'Escape') {
				// Revert only a dirty draft, and swallow the key; a clean Escape bubbles
				// normally. (Inside a DseModal the Scope already handled a dirty one.)
				if (cancelDraft()) {
					evt.preventDefault();
					evt.stopPropagation();
				}
			}
		});
		// SC-340 §9.1: when the block is adopted after its own write, Obsidian takes the
		// section out of the document and a focused input blurs (B11) — then focus comes back.
		// That blur is not the user leaving the field: never commit a half-typed draft on it.
		//
		// Fix round 1 (I-1): a real-Chromium probe showed blur fires DURING the move itself,
		// while the node is STILL connected (before it's actually detached/reinserted) — so
		// `!el.isConnected` alone never catches it in a real browser (only in jsdom, whose
		// timing differs). adoptView marks the moving root `data-dse-moving` for the exact
		// duration of the move; `closest()` catches that case order-independently, and
		// `!el.isConnected` stays as a second, redundant guard for the reverse ordering.
		owner.registerDomEvent(el, 'blur', () => {
			if (!el.isConnected || el.closest(`[${MOVING_ATTR}]`)) return;
			commitDraft();
		});
		commitTypedDraft = commitDraft;
		const onDraftInput = opts.onDraftInput;
		if (onDraftInput) {
			owner.registerDomEvent(el, 'input', () => onDraftInput(parseDraft()));
		}
	}

	render();

	return {
		rootEl,
		setValue: (value: number): void => {
			current = clamp(value);
			render();
		},
		getValue: () => current,
		commitDraft: () => commitTypedDraft(),
	};
}
