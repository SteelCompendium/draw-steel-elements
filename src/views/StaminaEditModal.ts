// Plan 09 Task 3 (D2 §3.5b / OD-6) — the ONE stamina-modal template, on the kit
// managedModal (DseModal). StaminaEditModal (single stamina: hero/creature) and
// MinionStaminaPoolModal (the squad pool) were ~90% identical hand-rolled Modals; the
// shared template primitives now live HERE (staminaPreviewBar, staminaStepperRow,
// setButtonText — exported) and MinionStaminaPoolModal composes exactly the same
// scaffold plus its own optional minion-list section (.dse-sedit__minions).
//
// CB-8: every control is a kit iconButton/stepper — REAL <button>s with the REAL
// `disabled` property; the legacy "disabled" class (opacity + pointer-events) is gone.
//
// SC-5: this file (with MinionStaminaPoolModal.ts) was the inline-style epicenter. The
// preview bar's fill/delta widths are now `--dse-*` custom properties (setProperty
// geometry — the ONE sanctioned .style use, D2 §5) and every color comes from a class
// rule keyed to --dse-* tokens ([data-state] / [data-kind] / .dse-sedit__warn). Zero
// color literals, zero el.style.color.
//
// Persistence byte-compat (the Task-3 bar): the edit MATH is preserved verbatim from
// the legacy modal — pending-change bookkeeping, temp-absorbs-damage ordering, the
// hero ceil(-0.5 × max) floor, and clampStamina at Apply. The model mutation +
// updateCallback contract are unchanged, so the YAML any caller persists after an edit
// is byte-identical to what the legacy modal produced for the same edit.
import type { App, Component } from 'obsidian';
import { DseModal, iconButton, stepper } from '@/framework/kit';
import type { IconButtonHandle, StepperHandle } from '@/framework/kit';
import { StaminaBar } from '@model/StaminaBar';

// ---------------------------------------------------------------------------------
// Shared §3.5b template primitives (composed by BOTH stamina modals)

export interface StaminaPreviewBarOptions {
	/** Render the hero "Dying" threshold zone (single-stamina hero modal only). */
	dyingZone?: boolean;
	/** Minion-death tick positions as FRACTIONS of the track (minion pool modal only). */
	ticks?: number[];
}

export interface StaminaPreviewBarHandle {
	readonly rootEl: HTMLElement;
	/**
	 * Reflects the pending edit onto the bar, in place: fill/delta widths as
	 * --dse-fill/--dse-delta-fill percentages (sanctioned geometry), the delta's
	 * heal-vs-damage COLOR via [data-kind] class rules — never inline (SC-5).
	 */
	set(fillPct: number, deltaPct: number, kind: 'heal' | 'damage' | 'none'): void;
}

/**
 * The preview bar at the top of both stamina modals (D2 §3.5b): the same .dse-stamina
 * grammar as the element bar, in its --modal variant (fill + pending-delta flex pair).
 * The fill keeps the legacy modals' constant healthy green ([data-state="healthy"]) —
 * the modal bars never state-shifted, and Legacy is today's look.
 */
export function staminaPreviewBar(
	parent: HTMLElement,
	opts: StaminaPreviewBarOptions = {},
): StaminaPreviewBarHandle {
	const rootEl = parent.createDiv({ cls: 'dse-stamina dse-stamina--modal' });
	const track = rootEl.createDiv({ cls: 'dse-stamina__track' });
	const fillEl = track.createDiv({ cls: 'dse-stamina__fill' });
	fillEl.setAttribute('data-state', 'healthy');
	const deltaEl = track.createDiv({ cls: 'dse-stamina__delta' });
	deltaEl.setAttribute('data-kind', 'none');
	if (opts.dyingZone) {
		const zone = track.createDiv({ cls: 'dse-stamina__threshold dse-stamina__threshold--dying' });
		zone.createSpan({ cls: 'dse-stamina__label', text: 'Dying' });
	}
	for (const frac of opts.ticks ?? []) {
		const tick = track.createDiv({ cls: 'dse-stamina__tick' });
		tick.style.setProperty('--dse-tick-x', `${frac * 100}%`);
	}
	return {
		rootEl,
		set(fillPct: number, deltaPct: number, kind: 'heal' | 'damage' | 'none'): void {
			fillEl.style.setProperty('--dse-fill', `${fillPct}%`);
			deltaEl.style.setProperty('--dse-delta-fill', `${kind === 'none' ? 0 : deltaPct}%`);
			deltaEl.setAttribute('data-kind', kind);
		},
	};
}

export interface StaminaStepperRowOptions {
	value: number;
	min?: number;
	max?: number;
	/** Accessible name of the stepper group (the ± buttons derive theirs from it). */
	label: string;
	/** The "/ N" display max shown beside the stepper. */
	displayMax: number;
	onChange: (value: number) => void;
}

/** The shared "⊖ [value] ⊕ / max" row: a kit editable stepper plus the max display. */
export function staminaStepperRow(
	parent: HTMLElement,
	opts: StaminaStepperRowOptions,
	owner: Component,
): StepperHandle {
	const rowEl = parent.createDiv({ cls: 'dse-sedit__stepper-row' });
	const handle = stepper(
		rowEl,
		{
			value: opts.value,
			min: opts.min,
			max: opts.max,
			editable: true,
			// Stamina is count-like: a typed "7.5" commits 7 (Math.trunc — the legacy
			// modals' parseInt semantics), so persist() never writes a float.
			integer: true,
			label: opts.label,
			onChange: opts.onChange,
		},
		owner,
	);
	rowEl.createSpan({ cls: 'dse-sedit__max', text: `/ ${opts.displayMax}` });
	return handle;
}

/**
 * Updates a kit iconButton's visible text AND accessible name in place (the dynamic
 * "Gain N Stamina" apply button). DOM text only — no styles involved.
 */
export function setButtonText(btn: IconButtonHandle, text: string): void {
	(btn.buttonEl.querySelector('.dse-btn__text') as HTMLElement | null)?.setText(text);
	btn.setLabel(text);
}

// ---------------------------------------------------------------------------------
// The single-stamina modal (hero / creature)

export class StaminaEditModal extends DseModal {
	private staminaBar: StaminaBar;
	private isHero: boolean;
	private name: string;
	private updateCallback: () => void;

	// Pending STAMINA and Temp STAMINA changes — the legacy bookkeeping, verbatim
	// (byte-compat-load-bearing: every Apply funnels through clampStamina below).
	private pendingStaminaChange: number = 0;
	private pendingTempStaminaChange: number = 0;

	constructor(
		app: App,
		staminaBar: StaminaBar,
		isHero: boolean,
		name: string,
		updateCallback: () => void,
	) {
		super(app);
		this.staminaBar = staminaBar;
		this.isHero = isHero;
		this.name = name;
		this.updateCallback = updateCallback;
	}

	onOpen() {
		this.setDseTitle(this.name ? `${this.name} Stamina` : 'Stamina');

		// Adjust maxStamina and negativeStaminaLimit based on character type (legacy
		// verbatim; the hero floor is ceil(-0.5 × max)).
		const maxStamina = this.staminaBar.max_stamina;
		const currentStamina = this.staminaBar.current_stamina ?? maxStamina;
		const currentTempStamina = this.staminaBar.temp_stamina ?? 0;
		const negativeStaminaLimit = this.isHero ? Math.ceil(-0.5 * maxStamina) : 0;

		// -- The preview bar (shared template) --------------------------------------
		const bar = staminaPreviewBar(this.body, { dyingZone: this.isHero });
		const updateBar = (): void => {
			// Legacy geometry verbatim: percentages over max + dying zone.
			const dyingLength = negativeStaminaLimit * -1;
			const barLength = maxStamina + dyingLength;
			const adjustedCurrentStamina = this.staminaBar.current_stamina + dyingLength;
			if (this.pendingStaminaChange > 0) {
				bar.set(
					(adjustedCurrentStamina / barLength) * 100,
					(this.pendingStaminaChange / barLength) * 100,
					'heal',
				);
			} else if (this.pendingStaminaChange < 0) {
				bar.set(
					((adjustedCurrentStamina + this.pendingStaminaChange) / barLength) * 100,
					(this.pendingStaminaChange / barLength) * -100,
					'damage',
				);
			} else {
				bar.set((adjustedCurrentStamina / barLength) * 100, 0, 'none');
			}
		};

		// -- Body sections: apply | numeric adjust + temp | quick actions -----------
		const row = this.body.createDiv({ cls: 'dse-sedit__row' });

		// Apply-damage/heal panel.
		const applySection = row.createDiv({ cls: 'dse-modal__section dse-sedit__apply' });
		const applyRow = applySection.createDiv({ cls: 'dse-sedit__apply-row' });
		applyRow.createSpan({ text: 'Apply' });
		const applyInput = applyRow.createEl('input', {
			type: 'number',
			cls: 'dse-sedit__apply-input',
		}) as HTMLInputElement;
		applyInput.value = '0';
		applyInput.setAttribute('aria-label', 'Amount to apply');

		iconButton(
			applySection,
			{
				icon: 'sword',
				label: 'Damage',
				text: 'Damage',
				onClick: () => {
					const adjustment = parseInt(applyInput.value);
					if (!isNaN(adjustment)) {
						// Legacy verbatim: damage consumes temp STAMINA first, the
						// remainder is capped at the distance to the death floor.
						const tempStaminaAvailable = currentTempStamina + this.pendingTempStaminaChange;
						const tempStaminaUsed = Math.min(adjustment, tempStaminaAvailable);
						this.pendingTempStaminaChange -= tempStaminaUsed;
						const remainingDamage = adjustment - tempStaminaUsed;
						this.pendingStaminaChange -= Math.min(
							remainingDamage,
							this.amountToDeath(currentStamina, negativeStaminaLimit),
						);
						refresh();
					}
				},
			},
			this.lifecycle,
		).buttonEl.classList.add('dse-sedit__btn');
		iconButton(
			applySection,
			{
				icon: 'plus',
				label: 'Healing',
				text: 'Healing',
				onClick: () => {
					const adjustment = parseInt(applyInput.value);
					if (!isNaN(adjustment)) {
						this.pendingStaminaChange += Math.min(
							adjustment,
							this.amountToMaxStamina(currentStamina, maxStamina),
						);
						refresh();
					}
				},
			},
			this.lifecycle,
		).buttonEl.classList.add('dse-sedit__btn');

		// Numeric adjust (kit stepper) + temp stamina.
		const adjustSection = row.createDiv({ cls: 'dse-modal__section dse-sedit__adjust' });
		// Deliberately UNBOUNDED (no stepper min/max): the legacy modal clamped the
		// STEP but never the pending VALUE — e.g. stacked Spend Recovery presses
		// over-shoot max and the display shows the raw sum, with clampStamina at Apply
		// owning the final persisted value. KNOWN DEVIATION (degenerate overshoot
		// corridor): once the pending value sits past max, legacy's next `+` was
		// CORRECTIVE — its step was min(1, distance-to-max), NEGATIVE when over, so it
		// snapped the value back to max — e.g. max 20, current 10: Spend Recovery ×2
		// (→22) → `+` (→20) → `−`×3 → legacy persisted 17, while this unbounded stepper
		// walks 22 → 23 → 20 and Apply's clamp persists 20. A deliberate, no-corruption
		// deviation (both persist in-range values) — PENDING maintainer sign-off on
		// strict byte-compat vs. this cleaner behavior.
		const staminaStepper = staminaStepperRow(
			adjustSection,
			{
				value: currentStamina,
				label: 'Stamina',
				displayMax: maxStamina,
				onChange: (value) => {
					this.pendingStaminaChange = value - currentStamina;
					refresh();
				},
			},
			this.lifecycle,
		);

		const tempSection = adjustSection.createDiv({ cls: 'dse-sedit__temp' });
		tempSection.createDiv({ cls: 'dse-sedit__temp-title', text: 'Temporary Stamina' });
		// min 0 IS the legacy behavior: the decrement guard refused to go below 0 and
		// typed negatives were corrected to 0 — the stepper floor reproduces both
		// (with a real disabled minus at the floor instead of a silent no-op, CB-8).
		const tempStepper = stepper(
			tempSection,
			{
				value: currentTempStamina,
				min: 0,
				editable: true,
				integer: true, // typed "2.5" commits 2 (legacy parseInt semantics)
				label: 'Temporary Stamina',
				onChange: (value) => {
					this.pendingTempStaminaChange = value - currentTempStamina;
					refresh();
				},
			},
			this.lifecycle,
		);

		// Quick modifiers.
		const quickSection = row.createDiv({ cls: 'dse-modal__section dse-sedit__quick' });
		iconButton(
			quickSection,
			{
				icon: 'skull',
				label: 'Kill',
				text: 'Kill',
				variant: 'danger',
				onClick: () => {
					this.pendingStaminaChange = negativeStaminaLimit - currentStamina;
					this.pendingTempStaminaChange = -currentTempStamina; // Remove all temp STAMINA
					refresh();
				},
			},
			this.lifecycle,
		).buttonEl.classList.add('dse-sedit__btn');
		iconButton(
			quickSection,
			{
				icon: 'plus',
				label: 'Full Heal',
				text: 'Full Heal',
				onClick: () => {
					this.pendingStaminaChange = maxStamina - currentStamina;
					this.pendingTempStaminaChange = -currentTempStamina; // Reset temp stamina to 0
					refresh();
				},
			},
			this.lifecycle,
		).buttonEl.classList.add('dse-sedit__btn');
		iconButton(
			quickSection,
			{
				icon: 'syringe',
				label: 'Spend Recovery',
				text: 'Spend Recovery',
				onClick: () => {
					const adjustment = Math.min(Math.floor(maxStamina / 3), maxStamina);
					if (!isNaN(adjustment)) {
						this.pendingStaminaChange += adjustment;
						refresh();
					}
				},
			},
			this.lifecycle,
		).buttonEl.classList.add('dse-sedit__btn');

		// -- Footer: Reset + the dynamic apply button (accent) ----------------------
		const [, actionBtn] = this.footer([
			{
				icon: 'undo',
				label: 'Reset',
				text: 'Reset',
				onClick: () => {
					this.pendingStaminaChange = 0;
					this.pendingTempStaminaChange = 0;
					refresh();
				},
			},
			{
				label: 'No Stamina Change',
				text: 'No Stamina Change',
				variant: 'accent',
				disabled: true,
				onClick: () => {
					// Legacy Apply verbatim — clampStamina is the byte-compat gate.
					const newCurrentStamina = this.clampStamina(
						currentStamina + this.pendingStaminaChange,
						negativeStaminaLimit,
						maxStamina,
					);
					this.staminaBar.current_stamina = newCurrentStamina;
					this.staminaBar.temp_stamina = currentTempStamina + this.pendingTempStaminaChange;
					this.updateCallback();
					this.close();
				},
			},
		]);
		// Reset left / apply right (the legacy space-between footer).
		actionBtn.buttonEl.parentElement?.classList.add('dse-sedit__footer');

		/** One targeted refresh after every edit: steppers, bar, apply button — in place. */
		const refresh = (): void => {
			staminaStepper.setValue(currentStamina + this.pendingStaminaChange);
			tempStepper.setValue(currentTempStamina + this.pendingTempStaminaChange);
			updateBar();
			this.updateActionButton(actionBtn);
		};
		refresh();
	}

	private clampStamina(stamina: number, negativeStaminaLimit: number, maxPossibleStamina: number): number {
		stamina = Math.min(stamina, maxPossibleStamina); // Cannot exceed max STAMINA
		stamina = Math.max(stamina, negativeStaminaLimit); // Cannot go below negative STAMINA limit
		return stamina;
	}

	private amountToMaxStamina(currentStamina: number, maxStamina: number) {
		return maxStamina - currentStamina - this.pendingStaminaChange;
	}

	private amountToDeath(currentStamina: number, negativeStaminaLimit: number) {
		return (negativeStaminaLimit * -1) + currentStamina + this.pendingStaminaChange;
	}

	/** Legacy wording verbatim; the disabled state is the REAL property (CB-8). */
	private updateActionButton(actionBtn: IconButtonHandle): void {
		const staminaChange = this.pendingStaminaChange;
		const tempStaminaChange = this.pendingTempStaminaChange;
		let actionText = '';

		if (staminaChange < 0) {
			actionText += `Lose ${Math.abs(staminaChange)} Stamina`;
		} else if (staminaChange > 0) {
			actionText += `Gain ${staminaChange} Stamina`;
		}

		if (tempStaminaChange !== 0) {
			if (actionText !== '') {
				actionText += ' and ';
			}
			if (tempStaminaChange > 0) {
				actionText += `Gain ${tempStaminaChange} Temp Stamina`;
			} else {
				actionText += `Lose ${Math.abs(tempStaminaChange)} Temp Stamina`;
			}
		}

		if (actionText === '') {
			actionText = 'No Stamina Change';
		}

		setButtonText(actionBtn, actionText);
		actionBtn.setDisabled(staminaChange === 0 && tempStaminaChange === 0);
	}
}
