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
import {
	DseModal,
	iconButton,
	renderStaminaGauge,
	setStaminaGaugeDelta,
	staminaGaugeGeometry,
	stepper,
	tooltip,
	updateStaminaGauge,
} from '@/framework/kit';
import type { IconButtonHandle, StaminaGaugeValues, StepperHandle } from '@/framework/kit';
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
	 * Reflects the pending edit onto the LEGACY track, in place: fill/delta widths as
	 * --dse-fill/--dse-delta-fill percentages (sanctioned geometry), the delta's
	 * heal-vs-damage COLOR via [data-kind] class rules — never inline (SC-5).
	 */
	set(fillPct: number, deltaPct: number, kind: 'heal' | 'damage' | 'none'): void;
	/**
	 * SC-132/SC-133 RC-1+RC-2: reflects the same pending edit onto the STEEL GAUGE.
	 *
	 * `committed` and `pending` are the two states as whole {current, temp, max}
	 * triples, not percentages, because the gauge's scale depends on temp — handing it
	 * two pre-computed widths off two different denominators is exactly the bug SC-133
	 * exists to fix. The gauge draws the PENDING state (what Apply will produce) and
	 * ghosts the difference as a delta band.
	 */
	setGauge(committed: StaminaGaugeValues, pending: StaminaGaugeValues): void;
}

/**
 * The preview bar at the top of both stamina modals (D2 §3.5b).
 *
 * TWO instruments in one node, exactly like the element bar: the LEGACY `.dse-stamina`
 * track (fill + pending-delta flex pair, unchanged — Legacy is today's look) and, hidden
 * by the base sheet and revealed only by the Steel screen layer, the same forged gauge
 * the cluster draws.
 *
 * Why the modal gets the real gauge rather than a modal-shaped approximation: SC-133's
 * whole finding was that a preview computing its own geometry disagrees with the bar it
 * is previewing — temp stamina was invisible here, so a temp-only Damage press looked
 * like nothing had happened. One builder, one geometry function, one answer.
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

	const gaugeOpts = { dyingZone: opts.dyingZone === true, ticks: opts.ticks };
	const cluster = rootEl.createDiv({ cls: 'dse-stamina__cluster dse-stamina__cluster--preview' });
	const gaugeEl = renderStaminaGauge(cluster, gaugeOpts);

	return {
		rootEl,
		set(fillPct: number, deltaPct: number, kind: 'heal' | 'damage' | 'none'): void {
			fillEl.style.setProperty('--dse-fill', `${fillPct}%`);
			deltaEl.style.setProperty('--dse-delta-fill', `${kind === 'none' ? 0 : deltaPct}%`);
			deltaEl.setAttribute('data-kind', kind);
		},
		setGauge(committed: StaminaGaugeValues, pending: StaminaGaugeValues): void {
			cluster.setAttribute('data-temp', (pending.temp ?? 0) > 0 ? 'on' : 'off');
			updateStaminaGauge(gaugeEl, pending, gaugeOpts);
			// Both ends of the band are measured on the PENDING scale (same denominator),
			// or a temp change would move the ruler out from under the comparison.
			const scale = { ...committed, temp: pending.temp };
			const from = staminaGaugeGeometry(scale, gaugeOpts).capX;
			const to = staminaGaugeGeometry(pending, gaugeOpts).capX;
			const kind = to > from ? 'heal' : to < from ? 'damage' : 'none';
			setStaminaGaugeDelta(gaugeEl, Math.min(from, to), Math.abs(to - from), kind);
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
	btn.buttonEl.querySelector('.dse-btn__text')?.setText(text);
	btn.setLabel(text);
}

/** FOLLOWUPS #27b: the visible reason (house rule — never a silent disable, same
 *  convention as the bar's own read-only tooltip) shown on Spend Recovery when no
 *  Recoveries remain. */
const NO_RECOVERIES_TOOLTIP = 'No Recoveries remaining';
/** SC-133 I3 (fix-round-1): same house rule, for the OTHER reason Spend Recovery
 *  disables — Recoveries remain, but the next press would heal 0. Under the
 *  rebased gain calc (see StaminaEditModal.recoverySpendResult) this can only
 *  happen at the max-side cap, so the reason is always accurate. */
const NO_GAIN_TOOLTIP = 'Already at maximum Stamina';
/** The Spend Recovery button's own accessible name/tooltip (FOLLOWUPS #27-fix-round
 *  finding 1) — re-asserted whenever the button re-enables, so the reason tooltip
 *  above never sticks past the state it describes (native setTooltip stamps
 *  aria-label as a side effect, so "clearing" a tooltip means re-asserting the
 *  correct one, not removing an attribute production never sets). */
const SPEND_RECOVERY_LABEL = 'Spend Recovery';

// ---------------------------------------------------------------------------------
// The single-stamina modal (hero / creature)

/**
 * SC-132 H1: the two things a CALLER can know that the `StaminaBar` model cannot.
 *
 * Both exist because the hero sheet now opens this modal (its bar mounts canPersist, and
 * the duplicate stepper row it replaced is gone). The sheet's Recoveries are real but
 * they are not a `StaminaBar`'s: their size and their heal rate come from
 * `deriveHeroStats`, where kits and class features can move them.
 */
export interface StaminaEditModalOptions {
	/**
	 * Overrides RR §8's default recovery value (`StaminaBar.recoveryValue`, i.e.
	 * `floor(max/3)`). The hero sheet passes its DERIVED value; without this the modal
	 * would heal the book rate while the sheet's own Catch Breath button, two inches
	 * away, healed the kit-adjusted one.
	 */
	recoveryValue?: number;
	/**
	 * Render the Spend Recovery quick action at all. Default true (every pre-SC-132
	 * caller). False is for a caller that KNOWS there is no pool to spend from — see
	 * hero/view.ts: without it the button renders enabled, heals `recoveryValue` and
	 * spends nothing, because `recoveriesTracked` gates the decrement but not the
	 * control.
	 */
	spendRecovery?: boolean;
}

export class StaminaEditModal extends DseModal {
	private staminaBar: StaminaBar;
	private isHero: boolean;
	private name: string;
	private updateCallback: () => void;
	private opts: StaminaEditModalOptions;

	// Pending STAMINA and Temp STAMINA changes — the legacy bookkeeping, verbatim
	// (byte-compat-load-bearing: every Apply funnels through clampStamina below).
	private pendingStaminaChange: number = 0;
	private pendingTempStaminaChange: number = 0;
	// FOLLOWUPS #27b: pending Recoveries spend, same bookkeeping shape as the two
	// above — only ever touched (non-zero) when the model carries `recoveries`
	// (D7 §4.2). Applied to `staminaBar.recoveries` on Apply, alongside the stamina
	// fields; reset back to 0 by Reset.
	private pendingRecoveriesChange: number = 0;

	constructor(
		app: App,
		staminaBar: StaminaBar,
		isHero: boolean,
		name: string,
		updateCallback: () => void,
		opts: StaminaEditModalOptions = {},
	) {
		super(app);
		this.staminaBar = staminaBar;
		this.isHero = isHero;
		this.name = name;
		this.updateCallback = updateCallback;
		this.opts = opts;
	}

	onOpen() {
		this.setDseTitle(this.name ? `${this.name} Stamina` : 'Stamina');

		// Adjust maxStamina and negativeStaminaLimit based on character type (legacy
		// verbatim; the hero floor is ceil(-0.5 × max)).
		const maxStamina = this.staminaBar.max_stamina;
		const currentStamina = this.staminaBar.current_stamina ?? maxStamina;
		const currentTempStamina = this.staminaBar.temp_stamina ?? 0;
		const negativeStaminaLimit = this.isHero ? Math.ceil(-0.5 * maxStamina) : 0;
		// FOLLOWUPS #27b (fixed by #27-fix-round finding 2): gated on `recoveries_max`
		// (D7 §4.2) — the same presence gate stamina-bar/view.ts uses
		// (model.recoveries_max !== undefined) to decide whether to render the
		// recoveries strip at all, and the single source of truth per docs/stamina-bar.md
		// and StaminaBar's own field comment. `recoveries_max` set with `recoveries`
		// omitted is schema-legal and means "0 remaining" (matching the bar's `?? 0`
		// below) — gating on `recoveries !== undefined` instead missed that case: the
		// button never disabled and `recoveries` never got written back. A legacy block
		// (both fields absent) still leaves this false and pendingRecoveriesChange stays
		// 0 forever, so Spend Recovery's disable gate and recoveries write-back below are
		// both no-ops for it (behavior unchanged, per the followup).
		const recoveriesTracked = this.staminaBar.recoveries_max !== undefined;
		const currentRecoveries = this.staminaBar.recoveries ?? 0;

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
			// SC-132/SC-133 RC-1+RC-2: the same pending edit on the Steel gauge, as whole
			// values rather than percentages. This is additive — the legacy geometry above
			// is untouched, and so is every number Apply persists.
			bar.setGauge(
				{
					current: this.staminaBar.current_stamina,
					temp: currentTempStamina,
					max: maxStamina,
				},
				{
					current: this.staminaBar.current_stamina + this.pendingStaminaChange,
					temp: currentTempStamina + this.pendingTempStaminaChange,
					max: maxStamina,
				},
			);
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
		});
		applyInput.value = '0';
		applyInput.setAttribute('aria-label', 'Amount to apply');
		// SC-133 RC-3: the Apply box is a MAGNITUDE, not a signed delta — Damage/Healing
		// already pick the direction via which button is pressed. `min="0"` mirrors the
		// exact idiom the temp stepper below already uses for the same reason (a
		// decrement guard that refuses to go negative, never a silent sign flip).
		applyInput.setAttribute('min', '0');

		iconButton(
			applySection,
			{
				icon: 'sword',
				label: 'Damage',
				text: 'Damage',
				onClick: () => {
					const parsed = parseInt(applyInput.value);
					if (!isNaN(parsed)) {
						// SC-133 RC-3: clamp to a magnitude — a negative typed/leftover
						// value must never invert Damage into a temp-stamina mint (it
						// used to: Math.min(adjustment, tempAvailable) with a negative
						// adjustment flips the subtraction below into an addition).
						const adjustment = Math.max(0, parsed);
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
					const parsed = parseInt(applyInput.value);
					if (!isNaN(parsed)) {
						// SC-133 RC-3: same magnitude clamp as Damage — a negative value
						// must never invert Healing into applied damage.
						const adjustment = Math.max(0, parsed);
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
		// STEP but never the pending VALUE — e.g. typing a value past max shows the raw
		// number, with clampStamina at Apply owning the final persisted value. KNOWN
		// DEVIATION (degenerate overshoot corridor): once the pending value sits past
		// max, legacy's next `+` was CORRECTIVE — its step was min(1, distance-to-max),
		// NEGATIVE when over, so it snapped the value back to max — e.g. max 20,
		// current 10: typing 22 → `+` (→20) → `−`×3 → legacy persisted 17, while this
		// unbounded stepper walks 22 → 23 → 20 and Apply's clamp persists 20. A
		// deliberate, no-corruption deviation (both persist in-range values) — PENDING
		// maintainer sign-off on strict byte-compat vs. this cleaner behavior.
		// (SC-133 RC-4/I2: Spend Recovery below is now itself a MEMBER of this
		// corridor, not just a non-contributor — recoverySpendResult heals from the
		// CLAMPED position, so a press while the pending sum sits outside [floor, max]
		// (reachable only via THIS stepper's own typed/± overshoot, illustrated above —
		// Damage below is capped at amountToDeath and can never drive the sum past the
		// floor) snaps it back into range exactly like the stepper's own corrective
		// "+". Stacked Spend Recovery presses can no longer push the pending value
		// further past either clamp, and every SPEND RECOVERY press's own preview
		// matches what Apply persists — this does not reach the stepper's own typed-
		// overshoot corridor above, which can still disagree with Apply until the
		// corrective "+"/Apply's clamp resolves it, same as before this fix.)
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
					// SC-133 RC-5 (RAW reference/draw-steel-reference.md:279 — temp
					// doesn't stack, take higher) + fix-round-1 C1: floor against the
					// CURRENT session position (currentTempStamina +
					// pendingTempStaminaChange), NOT the stale onOpen snapshot —
					// Damage absorption (:255 above), Kill, and Full Heal all move
					// pendingTempStaminaChange DOWN mid-session, so flooring against
					// the snapshot let a later grant snap temp back UP to a value
					// already spent (e.g. temp 5, Damage absorbs 3 → running 2, then a
					// single "+" incorrectly jumped back to 5 instead of 3). Fixes
					// typed grants and the minus button; does NOT retrofit take-higher
					// onto a run of "+" clicks from the SAME position — I4 pins that
					// gap as a characterization test for SC-132, not fixed here.
					const granted = Math.max(value, currentTempStamina + this.pendingTempStaminaChange);
					this.pendingTempStaminaChange = granted - currentTempStamina;
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
		// SC-132 H1: a caller that knows there is no pool can suppress the control
		// outright. `recoveriesTracked` below gates the DECREMENT and the zero-disable,
		// not the button — so on a bar with no pool the press heals and spends nothing,
		// which on the hero sheet (whose pool is real but lives on HeroState) would have
		// been free healing at the wrong rate.
		const spendRecoveryBtn = this.opts.spendRecovery === false ? null : iconButton(
			quickSection,
			{
				icon: 'syringe',
				label: SPEND_RECOVERY_LABEL,
				text: SPEND_RECOVERY_LABEL,
				onClick: () => {
					// Defensive (CB-8): the button is real-disabled at zero remaining,
					// and (SC-133 I3) at zero true gain too — see refresh() below; this
					// early-return is a backstop in case onClick fires anyway.
					if (recoveriesTracked && currentRecoveries + this.pendingRecoveriesChange <= 0) return;
					// RR §8 "Recovery value: 1/3 of Stamina max" — StaminaBar.recoveryValue,
					// the model's own derived floor(max/3) math (FOLLOWUPS #27-fix-round
					// finding 3 — also used by both elements' Catch Breath).
					// SC-133 RC-4 / I2 (fix-round-1): heal from the REBASED (clamped)
					// position (recoverySpendResult below), never onto the raw pending
					// sum — see its doc for why a plain += would still lie once the raw
					// sum sits outside [floor, max]. A zero-gain result (only possible at
					// the max-side cap under a sane recoveryValue > 0) neither heals nor
					// spends a Recovery. fix-round-2 I2-nit: `!(gain > 0)`, NOT `gain <=
					// 0` — the old (pre-consolidation) code's `!isNaN(adjustment) &&
					// adjustment > 0` guard got dropped in the RC-4 rewrite, and `<= 0`
					// lets a NaN gain (e.g. a malformed `max_stamina`) THROUGH — NaN <= 0
					// is false. `!(gain > 0)` catches NaN the same way `isNaN` did.
					const { gain, newStamina } = this.recoverySpendResult(currentStamina, negativeStaminaLimit, maxStamina);
					if (!(gain > 0)) return;
					this.pendingStaminaChange = newStamina - currentStamina;
					if (recoveriesTracked) this.pendingRecoveriesChange -= 1;
					refresh();
				},
			},
			this.lifecycle,
		);
		spendRecoveryBtn?.buttonEl.classList.add('dse-sedit__btn');

		// -- Footer: Reset + the dynamic apply button (accent) ----------------------
		const [, actionBtn] = this.footer([
			{
				icon: 'undo',
				label: 'Reset',
				text: 'Reset',
				onClick: () => {
					this.pendingStaminaChange = 0;
					this.pendingTempStaminaChange = 0;
					this.pendingRecoveriesChange = 0;
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
					// FOLLOWUPS #27b: floored at 0 defensively (the disable gate already
					// prevents overspend via the UI) — never persist a negative pool.
					if (recoveriesTracked) {
						this.staminaBar.recoveries = Math.max(0, currentRecoveries + this.pendingRecoveriesChange);
					}
					this.updateCallback();
					this.close();
				},
			},
		]);
		// Reset left / apply right (the legacy space-between footer).
		actionBtn.buttonEl.parentElement?.classList.add('dse-sedit__footer');

		/** One targeted refresh after every edit: steppers, bar, apply button, and (D7
		 *  #27b) Spend Recovery's own disabled state — in place. */
		const refresh = (): void => {
			staminaStepper.setValue(currentStamina + this.pendingStaminaChange);
			tempStepper.setValue(currentTempStamina + this.pendingTempStaminaChange);
			updateBar();
			this.updateActionButton(actionBtn);
			// SC-133 I3 (fix-round-1) + fix-round-2 (untracked-recoveries residual): CB-8
			// — never a silent no-op. Computed and applied REGARDLESS of whether
			// Recoveries are tracked at all: a legacy bar (no `recoveries` fields) still
			// has nothing to gain from a press once at max, and gating this on
			// `recoveriesTracked` (as fix-round-1 did) left that case a silent no-op in
			// onClick with the button rendered enabled — the exact CB-8 violation this
			// whole mechanism exists to close, just for the untracked branch. `!(gain >
			// 0)`, not `gain <= 0` (matches onClick's guard — see its comment for why:
			// NaN-safety).
			const noGain = !(this.recoverySpendResult(currentStamina, negativeStaminaLimit, maxStamina).gain > 0);
			if (!spendRecoveryBtn) {
				// The caller suppressed the control (SC-132 H1) — nothing to disable.
			} else if (recoveriesTracked) {
				const remaining = currentRecoveries + this.pendingRecoveriesChange;
				const noneLeft = remaining <= 0;
				spendRecoveryBtn.setDisabled(noneLeft || noGain);
				// House rule: never a silent disable — a visible reason tooltip
				// accompanies the real `disabled` (CB-8), cleared once available again
				// (e.g. after Reset). FOLLOWUPS #27-fix-round finding 1: Obsidian's
				// native setTooltip stamps `aria-label` as a side effect (§2.5), so
				// "clearing" the reason means RE-ASSERTING the button's own label, not
				// removing an attribute (`data-tooltip`) real Obsidian never sets — the
				// old removeAttribute left the reason as the permanent accessible name
				// once the button had ever been disabled.
				if (noneLeft) tooltip(spendRecoveryBtn.buttonEl, NO_RECOVERIES_TOOLTIP);
				else if (noGain) tooltip(spendRecoveryBtn.buttonEl, NO_GAIN_TOOLTIP);
				else tooltip(spendRecoveryBtn.buttonEl, SPEND_RECOVERY_LABEL);
			} else {
				// Same house rule, untracked branch: no Recoveries counter to run out of,
				// but "no gain" is still a real, visible disabled reason.
				spendRecoveryBtn.setDisabled(noGain);
				if (noGain) tooltip(spendRecoveryBtn.buttonEl, NO_GAIN_TOOLTIP);
				else tooltip(spendRecoveryBtn.buttonEl, SPEND_RECOVERY_LABEL);
			}
		};
		refresh();
	}

	private clampStamina(stamina: number, negativeStaminaLimit: number, maxPossibleStamina: number): number {
		stamina = Math.min(stamina, maxPossibleStamina); // Cannot exceed max STAMINA
		stamina = Math.max(stamina, negativeStaminaLimit); // Cannot go below negative STAMINA limit
		return stamina;
	}

	/** SC-133 RC-4 / I2 (fix-round-1): what a single Spend Recovery press would
	 *  ACTUALLY deliver right now, computed from the CLAMPED (Apply-would-persist)
	 *  position rather than the raw pending sum.
	 *
	 *  A raw sum can already sit past either clamp before this press — NOT via
	 *  Damage (capped at amountToDeath above, can never drive the sum past the
	 *  floor) but via the STAMINA STEPPER's own typed or ± overshoot (deliberately
	 *  unbounded; see the KNOWN DEVIATION comment above). Adding recoveryValue to
	 *  that RAW sum and re-clamping (what the first
	 *  RC-4 pass did, headroom-to-max only) can report a gain that doesn't match
	 *  what Apply will actually persist — either silently zero when the two clamped
	 *  values happen to coincide, or, worse, a PARTIAL number that still doesn't
	 *  match Apply's own single clamp (verified by hand-tracing a straddling case:
	 *  raw 4 below the floor, +6 recovery -> raw only 2 back inside range -> this
	 *  method would report "+2", but pendingStaminaChange += 2 leaves the raw sum
	 *  STILL below the floor, so Apply persists the SAME floor value as before —
	 *  the preview would have lied again, the exact class of bug RC-4 exists to
	 *  close).
	 *
	 *  The fix computes and returns the REBASED absolute position: clamp the
	 *  CURRENT position first (`before`), heal from THAT, clamp again (`after`).
	 *  The caller assigns `pendingStaminaChange = after - currentStamina` (never
	 *  `+= gain`), so a pending sum that was sitting outside [floor, max] before
	 *  this press is snapped into range by it — the only way the preview and
	 *  Apply can agree on every press, not just ones that started in range. Under
	 *  this model a Recovery healing from ANY floor position always helps, as long
	 *  as recoveryValue > 0 — gain is only ever 0 at the max-side cap (or, degenerate
	 *  but real: recoveryValue itself is 0 whenever max_stamina ≤ 2, floor(max/3),
	 *  which permanently reports no gain and shows the max-side tooltip regardless
	 *  of position — doc note only, not a behavior this fix needs to change). So the
	 *  net effect is that Spend Recovery, like the stepper's own "+", becomes
	 *  another documented member of the corrective corridor above rather than a
	 *  route to a silently-zero OR dishonest partial spend. */
	private recoverySpendResult(
		currentStamina: number,
		negativeStaminaLimit: number,
		maxStamina: number,
	): { gain: number; newStamina: number } {
		const before = this.clampStamina(currentStamina + this.pendingStaminaChange, negativeStaminaLimit, maxStamina);
		// SC-132 H1: the caller's derived value wins when it supplied one (the hero
		// sheet's, which kits can move); otherwise RR §8's floor(max/3) off the model.
		const recoveryValue = this.opts.recoveryValue ?? this.staminaBar.recoveryValue;
		const after = this.clampStamina(before + recoveryValue, negativeStaminaLimit, maxStamina);
		return { gain: after - before, newStamina: after };
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
