// Plan 09 Task 3 (D2 §3.5b / OD-6) — MinionStaminaPoolModal on the unified stamina-modal
// template: composes the SAME shared primitives as StaminaEditModal (staminaPreviewBar,
// staminaStepperRow, setButtonText — see that file for the template) plus this modal's
// optional minion-list section (.dse-sedit__minions: info text, checkbox rows, condition
// icons). Kit controls throughout — REAL <button>s / REAL `disabled` (CB-8); zero inline
// colors/widths (SC-5): bar geometry via --dse-* custom properties, the checked-minion
// crimson via the `.dse-minion__check:checked ~ *` --dse-danger rule, the healing
// warning via .dse-sedit__warn (--dse-warn) + the `hidden` attribute.
//
// The data-corruption fixes are preserved verbatim:
//   CB-1 — the Apply clamp uses `(aliveCount) * minionMaxStamina` (parenthesized), never
//          the old `len ?? 0 * max` precedence bug;
//   CB-2 — ALL persistence routes through the injected persist callback (the old direct
//          CodeBlocks.updateCodeBlock(app, data, ctx, "") empty-fence write is dead);
//   DC-6 — condition removal AND damage in one session each persist once.
import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { Creature, CreatureInstance, EnemyGroup, Condition } from '@drawSteelAdmonition/EncounterData';
// SC-183 r3 / GH #67 — the pool is addressed per SQUAD now (a group may hold several).
// Reading `group.minion_stamina_pool` directly would show squad 2 the squad-1 pool.
// SC-195: `minionPoolMaxOf` is the C1 fix — the persisted, ORIGINAL-count-based max
// (never the alive count this modal used to recompute); `foldedCaptainStaminaBonus`
// (fix round, HIGH-1) is the PERSISTED-flag-driven per-minion Stamina step while
// captained, for the kill-ladder divisor below — never the live `captainStaminaBonus`
// gate, which can disagree with the persisted pool max (see that helper's doc comment).
import { foldedCaptainStaminaBonus, minionPoolMaxOf, minionPoolOf, setMinionPool } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager } from '@utils/Conditions';
import { applyConditionColor, applyConditionEffect } from '@/elements/conditionColor';
import { DseModal, iconButton } from '@/framework/kit';
import type { IconButtonHandle, StepperHandle } from '@/framework/kit';
import { staminaPreviewBar, staminaStepperRow, setButtonText } from './StaminaEditModal';
import type { StaminaPreviewBarHandle } from './StaminaEditModal';

export class MinionStaminaPoolModal extends DseModal {
	private group: EnemyGroup;
	private creature: Creature; // Minion creature
	// Injected persistence: the modal mutates the caller's shared encounter data in
	// place, then persist() writes it back (and rebuilds the caller's UI). The modal
	// never touches CodeBlocks/ctx directly (CB-2).
	private persist: () => void;

	// Pending STAMINA change — the legacy bookkeeping, verbatim.
	private pendingStaminaChange: number = 0;
	// SC-430: the pending change a half-typed (uncommitted) pool draft WOULD stage, or null
	// when there is no parseable dirty draft. Read only through effectivePending() by every
	// piece of UI that re-renders at commit and can change size: Apply's label/state, the
	// heal-warning icon beside it, and the info text above it (2 lines -> 1 shifts Apply up by
	// a line). All of them show the post-commit result while the field is still focused, so
	// nothing moves at blur — a button that moves between mousedown (blur) and mouseup loses the
	// click in Chromium. The preview bar is fixed geometry and may lag. The committed truth
	// stays pendingStaminaChange.
	private draftStaminaChange: number | null = null;
	// SC-429: `auto` marks a box the MODAL checked (the "pool at 0 -> every remaining minion
	// dies" rule), as opposed to one the USER ticked. When that rule stops applying, only the
	// auto boxes revert; the user's own ticks keep their state.
	private minionCheckboxes: { instance: CreatureInstance; checkbox: HTMLInputElement; auto: boolean }[] = [];

	private bar!: StaminaPreviewBarHandle;
	private poolStepper!: StepperHandle;
	private infoTextEl!: HTMLElement;
	private warningIconEl!: HTMLElement;
	private actionBtn!: IconButtonHandle;
	private damageInput!: HTMLInputElement;

	constructor(
		app: App,
		group: EnemyGroup,
		creature: Creature,
		persist: () => void,
	) {
		super(app);
		this.group = group;
		this.creature = creature;
		this.persist = persist;
	}

	/**
	 * SC-429 / item 2: initial focus. DseModal focuses the FIRST focusable control after
	 * onOpen; StaminaEditModal's first control is its Apply box, but here the stepper row
	 * comes first in the DOM, so a bare open left focus on "Decrease Stamina pool" (Space/Enter
	 * right after opening decremented the pool). Mirror the stamina edit modal: focus the
	 * Apply box (the damage field, the first control of the Apply row).
	 */
	open(): void {
		super.open();
		this.damageInput?.focus();
	}

	onOpen() {
		this.setDseTitle(`${this.group.name} - Minion Stamina Pool`);

		// SC-195 / C1: the pool's max is the persisted, ORIGINAL-count-based value (never
		// recomputed from the alive count — that was the pre-existing divergence from the
		// row bar/print readout, which always used the original `amount`).
		const poolMaxStamina = minionPoolMaxOf(this.creature);
		const poolCurrentStamina = minionPoolOf(this.group, this.creature) ?? poolMaxStamina;

		// -- The preview bar (shared template) with a tick at each minion death point --
		// Evenly divides the bar into `amount` segments (the ORIGINAL squad size, C1)
		// rather than deriving a per-minion step from `poolMaxStamina`, which may no
		// longer be an even multiple of any single per-minion value once a captain-bonus
		// crossing has happened mid-fight (SC-195).
		const ticks: number[] = [];
		for (let i = 1; i < this.creature.amount; i++) {
			ticks.push(i / this.creature.amount);
		}
		this.bar = staminaPreviewBar(this.body, { ticks });

		// -- Numeric adjust (kit stepper) ---------------------------------------------
		// Bounded [0, poolMax] — exactly the legacy ± behavior (its in/decrement already
		// clamped the step to those value bounds); the Apply-time CB-1 clamp below stays
		// the authoritative gate for the persisted value. KNOWN DEVIATION: a TYPED draft
		// past poolMax is clamped at commit here, where legacy carried the raw overshoot
		// pending until Apply — so the type-past-max-then-decrement corridor persists a
		// different in-range value (same pending maintainer sign-off as the single-stamina
		// stepper's overshoot note in StaminaEditModal).
		const adjustSection = this.body.createDiv({ cls: 'dse-sedit__adjust' });
		this.poolStepper = staminaStepperRow(
			adjustSection,
			{
				value: poolCurrentStamina,
				min: 0,
				max: poolMaxStamina,
				label: 'Stamina pool',
				displayMax: poolMaxStamina,
				onChange: (value) => {
					this.pendingStaminaChange = value - poolCurrentStamina;
					this.refresh();
				},
				onDraftInput: (draft) => {
					this.draftStaminaChange =
						draft === null || draft === this.poolStepper.getValue() ? null : draft - poolCurrentStamina;
					this.updateInfoText();
					this.updateActionButton();
				},
			},
			this.lifecycle,
		);

		// -- Apply damage row -----------------------------------------------------------
		const applySection = this.body.createDiv({ cls: 'dse-sedit__apply' });
		const applyRow = applySection.createDiv({ cls: 'dse-sedit__apply-row' });
		applyRow.createSpan({ text: 'Apply' });
		const damageInput = applyRow.createEl('input', {
			type: 'number',
			cls: 'dse-sedit__apply-input',
			attr: { size: 3 },
		});
		this.damageInput = damageInput;
		damageInput.value = '0';
		damageInput.setAttribute('aria-label', 'Damage per minion');
		// SC-241: the Apply box is a MAGNITUDE, not a signed delta — `min="0"` mirrors
		// the exact idiom SC-133 RC-3 already uses for StaminaEditModal's Apply box.
		damageInput.setAttribute('min', '0');
		applyRow.createSpan({ text: 'damage to' });
		const minionCountInput = applyRow.createEl('input', {
			type: 'number',
			cls: 'dse-sedit__apply-input',
			attr: { size: 3 },
		});
		minionCountInput.value = '1';
		// SC-429: the cap is the LIVING minions (the same `!isDead` rule the list and the kill
		// math use), not every instance the squad ever had.
		minionCountInput.max =
			this.creature.instances?.filter((inst) => !inst.isDead).length.toString() ?? '';
		minionCountInput.min = '0';
		minionCountInput.setAttribute('aria-label', 'Number of minions hit');
		applyRow.createSpan({ text: 'minions' });

		iconButton(
			applyRow,
			{
				icon: 'sword',
				label: 'Apply Damage',
				text: 'Apply Damage',
				onClick: () => {
					const damage = parseInt(damageInput.value);
					const minions = parseInt(minionCountInput.value);
					if (!isNaN(damage) && !isNaN(minions)) {
						// SC-241: clamp BOTH parsed values to a magnitude — the same class of
						// bug SC-133 RC-3 fixed in StaminaEditModal's Apply box. Either box
						// going negative (or both, which would otherwise cancel back out to a
						// positive `totalDamage`) must never flip this into a heal.
						const clampedDamage = Math.max(0, damage);
						// SC-429: ...and cap the count at the LIVING minions. The box's `max` only bounds
						// the spinner; a typed or pasted number goes straight through, and the rules
						// cannot hit more minions than are alive. Show the cap in the box.
						const alive = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
						const clampedMinions = Math.min(alive, Math.max(0, minions));
						minionCountInput.value = String(clampedMinions);
						const totalDamage = clampedDamage * clampedMinions;
						this.pendingStaminaChange -= totalDamage;
						this.refresh();
					}
				},
			},
			this.lifecycle,
		);

		// -- Minion list (the OPTIONAL section that distinguishes this modal) -----------
		const minionSection = this.body.createDiv({ cls: 'dse-sedit__minions' });
		this.infoTextEl = minionSection.createDiv({ cls: 'dse-sedit__info' });

		this.creature.instances?.forEach((instance) => {
			if (instance.isDead) return; // Skip dead minions

			const minionRow = minionSection.createDiv({ cls: 'dse-minion' });

			// The checkbox comes FIRST in the row: the `.dse-minion__check:checked ~ *`
			// CSS rule colors the name/conditions with --dse-danger (the old inline
			// crimson, evicted — SC-5).
			const checkbox = minionRow.createEl('input', { type: 'checkbox', cls: 'dse-minion__check' });
			checkbox.setAttribute('aria-label', `Kill ${this.creature.name} #${instance.id}`);
			const entry = { instance, checkbox, auto: false };
			this.lifecycle.registerDomEvent(checkbox, 'change', () => {
				entry.auto = false; // a hand toggle always makes the box the user's own (SC-429)
				this.updateCheckboxes();
				this.updateActionButton();
			});
			this.minionCheckboxes.push(entry);

			const minionName = minionRow.createSpan({
				text: `${this.creature.name} #${instance.id}`,
				cls: 'dse-minion__name',
			});
			// Toggle the checkbox when clicking the minion's name (legacy affordance).
			this.lifecycle.registerDomEvent(minionName, 'click', () => {
				if (!checkbox.disabled) {
					checkbox.checked = !checkbox.checked;
					entry.auto = false; // SC-429: as the change handler above
					this.updateCheckboxes();
					this.updateActionButton();
				}
			});

			const conditionsEl = minionRow.createDiv({ cls: 'dse-minion__conditions' });
			this.buildConditionIcons(conditionsEl, instance);
		});

		// -- Footer: Reset + healing warning + the dynamic apply button (accent) --------
		const [, actionBtn] = this.footer([
			{
				icon: 'undo',
				label: 'Reset',
				text: 'Reset',
				onClick: () => {
					this.pendingStaminaChange = 0;
					damageInput.value = '0';
					minionCountInput.value = '1';
					// Uncheck all checkboxes (updateCheckboxes/refresh re-derive enablement).
					this.minionCheckboxes.forEach((item) => {
						item.checkbox.checked = false;
						item.checkbox.disabled = true;
						item.auto = false;
					});
					this.refresh();
				},
			},
			{
				label: 'No Stamina Change',
				text: 'No Stamina Change',
				variant: 'accent',
				disabled: true,
				onClick: () => {
					// SC-430: a still-typed pool draft lands first, through the same path blur
					// uses (a no-op when blur already committed it).
					this.poolStepper.commitDraft();
					const newStamina = poolCurrentStamina + this.pendingStaminaChange;
					// CB-1's original fix (the `len ?? 0 * max` precedence bug, clamping the
					// pool to the alive-minion COUNT instead of count * max) is superseded by
					// SC-195's C1 fix: the clamp ceiling is now the persisted/original-count
					// max (`minionPoolMaxOf`), never a live alive-count recompute, so the
					// parenthesization footgun this comment used to warn about no longer has
					// anything to bite — there is no `len ?? 0 * max`-shaped expression left.
					const maxStamina = minionPoolMaxOf(this.creature);
					setMinionPool(this.group, this.creature, Math.min(maxStamina, Math.max(0, newStamina)));

					// Update the minion instances based on the selected checkboxes
					const checkedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked);
					checkedMinions.forEach((item) => {
						item.instance.isDead = true;
					});

					// Persist the mutated encounter data via the injected callback (CB-2)
					this.persist();
					this.close();
				},
			},
		]);
		this.actionBtn = actionBtn;

		// The "minions cannot regain stamina" warning sits between Reset and Apply;
		// shown/hidden via the `hidden` ATTRIBUTE (never inline display — D2 §5),
		// colored by the .dse-sedit__warn rule (--dse-warn).
		const footerEl = actionBtn.buttonEl.parentElement as HTMLElement;
		footerEl.classList.add('dse-sedit__footer'); // Reset left / warning + apply right
		this.warningIconEl = footerEl.createSpan({ cls: 'dse-sedit__warn' });
		setIcon(this.warningIconEl, 'alert-circle');
		this.warningIconEl.hidden = true;
		footerEl.insertBefore(this.warningIconEl, actionBtn.buttonEl);

		this.refresh();
	}

	/** One targeted refresh after every edit: stepper, bar, info, checkboxes, apply. */
	private refresh(): void {
		// SC-430: setValue below re-renders the input, discarding any typed draft.
		this.draftStaminaChange = null;
		// Legacy display parity: the pool input always showed the CLAMPED new value.
		this.poolStepper.setValue(this.clampedNewStamina());
		this.updateStaminaBar();
		this.updateInfoText();
		this.updateCheckboxes();
		this.updateActionButton();
	}

	/** Legacy pool math (shared by the bar/info/checkbox/button updates), SC-195-updated:
	 *  `poolMaxStamina` is now the persisted/original-count max (C1, `minionPoolMaxOf`)
	 *  instead of a live alive-count recompute, and the kill-ladder divisor is the
	 *  CURRENT effective per-minion Stamina (`per + the active captain bonus`) — a
	 *  captained squad drops a minion every `per + N` damage, not every `per`, matching
	 *  the pool's own build rule (each minion's Stamina, captain bonus included,
	 *  multiplied by the squad's count). Fix round (HIGH-1): the bonus folded into the
	 *  divisor must be the PERSISTED flag (`foldedCaptainStaminaBonus`), never the live
	 *  gate — a pre-upgrade captained squad (flag absent) or a bound-but-down captain
	 *  (flag true, live gate 0) made the two disagree, corrupting the ladder. */
	private poolNumbers() {
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = minionPoolMaxOf(this.creature);
		const poolCurrentStamina = minionPoolOf(this.group, this.creature) ?? poolMaxStamina;
		const pending = this.effectivePending();
		const newStamina = poolCurrentStamina + pending;
		const effectivePerMinion = minionMaxStamina + foldedCaptainStaminaBonus(this.creature);
		// How many minions this edit kills. DAMAGE uses the death ladder (the boundaries the
		// pending change crosses: `floor((max - new) / per) - floor((max - cur) / per)`,
		// divisor per SC-195), with exactly two clamps (SC-417 MEDIUM-1): the count never
		// exceeds the LIVING minions (overkill, or a pool already below its death ticks,
		// used to ask for more kills than there are minions and lock Apply), and a pool
		// driven to <= 0 kills every living minion. A HEAL never demands a kill (count <= 0,
		// SC-417 MEDIUM-R3); a negative count means the heal would lift the pool past a
		// dead minion's share, which the modal refuses.
		const initialMinionsKilled = Math.floor((poolMaxStamina - poolCurrentStamina) / effectivePerMinion);
		const finalMinionsKilled = Math.floor((poolMaxStamina - newStamina) / effectivePerMinion);
		let minionsToKill = finalMinionsKilled - initialMinionsKilled;
		if (pending > 0) {
			minionsToKill = Math.min(0, minionsToKill);
		} else if (pending < 0 && newStamina <= 0) {
			minionsToKill = aliveMinions;
		} else {
			minionsToKill = Math.min(aliveMinions, minionsToKill);
		}
		// The highest pool a heal may reach: the top of the death bracket the pool already
		// sits in. This is the SAME bound the ladder refuses on (`minionsToKill < 0` iff
		// `new > poolMax - initialMinionsKilled * per`), so the message and the refusal can't
		// disagree. It equals the living minions' worth (`alive * per`) on a consistent squad,
		// and sits below it when the pool is underfunded (captain relieved, 6.0.2 damage).
		const healCeiling = poolMaxStamina - initialMinionsKilled * effectivePerMinion;
		return { minionMaxStamina, aliveMinions, poolMaxStamina, poolCurrentStamina, newStamina, minionsToKill, healCeiling };
	}

	/** SC-430: the committed pending change, or the one a dirty typed draft would stage. */
	private effectivePending(): number {
		return this.draftStaminaChange ?? this.pendingStaminaChange;
	}

	private clampedNewStamina(): number {
		const { poolMaxStamina, poolCurrentStamina } = this.poolNumbers();
		return Math.min(poolMaxStamina, Math.max(0, poolCurrentStamina + this.pendingStaminaChange));
	}

	private updateStaminaBar(): void {
		const { poolMaxStamina, poolCurrentStamina } = this.poolNumbers();
		const newStamina = this.clampedNewStamina();

		const currentStaminaPercentage = (poolCurrentStamina / poolMaxStamina) * 100;
		const newStaminaPercentage = (newStamina / poolMaxStamina) * 100;
		const pendingChangePercentage = ((newStamina - poolCurrentStamina) / poolMaxStamina) * 100;

		if (this.pendingStaminaChange > 0) {
			// Healing: the delta rides the current fill's right edge (--dse-stamina-temp blue).
			this.bar.set(currentStaminaPercentage, pendingChangePercentage, 'heal');
		} else if (this.pendingStaminaChange < 0) {
			// Damage: legacy verbatim — the delta width is the FULL pending damage
			// (track overflow clips it), not the clamped remainder.
			this.bar.set(newStaminaPercentage, (this.pendingStaminaChange / poolMaxStamina) * -100, 'damage');
		} else {
			this.bar.set(currentStaminaPercentage, 0, 'none');
		}
		// SC-132: the same edit on the Steel gauge. A squad pool has no negative range —
		// `dyingZone: false` collapses the zero bulkhead onto the channel's left edge, so
		// the pour simply starts there — and no temp stamina, so the gauge degenerates to
		// exactly what this modal has always shown, in the cluster's material. The death
		// ticks come through as graduations (the gauge's own index-mark vocabulary).
		this.bar.setGauge(
			{ current: poolCurrentStamina, temp: 0, max: poolMaxStamina },
			{ current: newStamina, temp: 0, max: poolMaxStamina },
		);
	}

	private updateInfoText(): void {
		const { minionsToKill, healCeiling } = this.poolNumbers();
		const pending = this.effectivePending(); // SC-430: follows a typed draft (see the field comment)
		this.infoTextEl.hidden = pending === 0; // SC-429: the `hidden` attribute, never inline display
		if (minionsToKill < 0) {
			// A heal past a dead minion's share (SC-417 LOW-1): say the rule, never a
			// negative count.
			this.infoTextEl.textContent = `A heal can't raise the pool above the living minions' share (${healCeiling} stamina).`;
		} else if (pending > 0) {
			this.infoTextEl.textContent = `Heal ${pending} stamina; dead minions stay dead.`;
		} else if (pending === 0) {
			// SC-429: nothing pending (no damage, so no kills to select) — hide the line rather
			// than read "0 damage will kill 0 minion(s). Select 0 minion(s) to kill."
			this.infoTextEl.textContent = '';
		} else {
			const totalPendingDamage = -pending;
			// SC-429: with no kills owed there is nothing to select, so drop that sentence.
			this.infoTextEl.textContent =
				`${totalPendingDamage} damage will kill ${minionsToKill} minion(s).` +
				(minionsToKill > 0 ? ` \nSelect ${minionsToKill} minion(s) to kill.` : '');
		}
	}

	/** Legacy wording verbatim; the disabled state is the REAL property (CB-8). */
	private updateActionButton(): void {
		const staminaChange = this.effectivePending();
		const { newStamina, minionsToKill, healCeiling } = this.poolNumbers();

		// Count the number of minions selected
		let selectedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked).length;
		if (this.draftStaminaChange !== null) {
			// SC-430: the boxes are only re-derived when the draft commits (updateCheckboxes);
			// predict that outcome so a draft that empties the pool (all auto-checked) or needs
			// no kills (all cleared) shows the post-commit Apply state now rather than one blur
			// later.
			if (newStamina <= 0) selectedMinions = this.minionCheckboxes.length;
			else if (minionsToKill <= 0) selectedMinions = 0;
			// The commit reverts the boxes the modal ticked itself (SC-429), leaving the user's.
			else selectedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked && !item.auto).length;
		}

		// Disable the apply button if the number of selected minions doesn't match minionsToKill
		const disableActionButton = minionsToKill !== selectedMinions;

		let actionText = '';
		if (staminaChange < 0) {
			actionText += `Deal ${Math.abs(staminaChange)} damage`;
			if (minionsToKill > 0) {
				actionText += `, kill ${minionsToKill} minion(s)`;
			}
		} else if (staminaChange > 0) {
			actionText += `Heal ${staminaChange} stamina`;
		} else {
			actionText = 'No Stamina Change';
		}
		setButtonText(this.actionBtn, actionText);

		// Disable the button if no change or kills not accounted for — REAL disabled (CB-8).
		this.actionBtn.setDisabled(staminaChange === 0 || disableActionButton);

		// Explain the disabled state (legacy tooltip preserved).
		if (disableActionButton && minionsToKill > 0) {
			this.actionBtn.buttonEl.setAttribute('title', `Select ${minionsToKill} minion(s) to kill`);
		} else if (minionsToKill < 0) {
			// SC-417 LOW-1: the refused heal gets its reason.
			const reason = `Minions can't regain Stamina past a dead minion's share (at most ${healCeiling})`;
			this.actionBtn.buttonEl.setAttribute('title', reason);
			// LOW-R3: the accessible name (aria-label, the hover tooltip) carries it too — the
			// visible text stays the action (house rule: Spend Recovery's disable reason).
			this.actionBtn.setLabel(`${actionText} — ${reason}`);
		} else {
			this.actionBtn.buttonEl.removeAttribute('title');
		}

		// Show the warning icon when healing (hidden attribute — never inline display).
		if (staminaChange > 0) {
			this.warningIconEl.hidden = false;
			this.warningIconEl.setAttribute('title', 'Typically minions are unable to regain stamina');
		} else {
			this.warningIconEl.hidden = true;
		}
	}

	private updateCheckboxes(): void {
		const { newStamina, minionsToKill } = this.poolNumbers();

		// If minion pool stamina reaches 0, auto-select all checkboxes
		if (newStamina <= 0) {
			this.minionCheckboxes.forEach((item) => {
				// Only a box the user had not already ticked becomes the modal's (auto) tick.
				if (!item.checkbox.checked) item.auto = true;
				item.checkbox.checked = true;
				item.checkbox.disabled = true;
			});
			return;
		}

		// SC-429: the 0-pool rule no longer applies — revert what IT checked (the user's own
		// ticks stay; the branches below re-derive availability from them).
		this.minionCheckboxes.forEach((item) => {
			if (item.auto) {
				item.checkbox.checked = false;
				item.auto = false;
			}
		});

		// If no minions need to be killed, disable all checkboxes
		if (minionsToKill <= 0) {
			this.minionCheckboxes.forEach((item) => {
				item.checkbox.checked = false;
				item.checkbox.disabled = true;
			});
		} else {
			// Enable checkboxes up to minionsToKill
			const selectedCount = this.minionCheckboxes.filter((item) => item.checkbox.checked).length;
			this.minionCheckboxes.forEach((item) => {
				if (item.checkbox.checked) {
					item.checkbox.disabled = false;
				} else {
					item.checkbox.disabled = selectedCount >= minionsToKill;
				}
			});
		}
	}

	private buildConditionIcons(container: HTMLElement, character: CreatureInstance): void {
		const conditions = character.conditions || [];

		const conditionManager = new ConditionManager();

		conditions.forEach((conditionEntry) => {
			let conditionKey: string;
			let conditionData: Condition | null = null;
			if (typeof conditionEntry === 'string') {
				conditionKey = conditionEntry;
			} else if (typeof conditionEntry === 'object' && conditionEntry.key) {
				conditionKey = conditionEntry.key;
				conditionData = conditionEntry;
			} else {
				return;
			}

			const condition = conditionManager.getAnyConditionByKey(conditionKey);
			if (condition) {
				const iconEl = container.createDiv({ cls: 'condition-icon' });
				setIcon(iconEl, conditionData?.icon?.trim() || condition.iconName);
				iconEl.title = condition.displayName;

				// Apply color and effect customizations through the SHARED Task 8
				// helpers (SC-5/SD-2): the user-supplied color rides the sanctioned
				// --dse-condition-color custom property only after CSS.supports
				// validation, and the effect class only toggles for the known
				// vocabulary (raw classList.add throws on whitespace).
				if (conditionData) {
					applyConditionColor(iconEl, conditionData.color);
					applyConditionEffect(iconEl, conditionData.effect);
				}

				this.lifecycle.registerDomEvent(iconEl, 'click', () => {
					character.conditions = conditions.filter((entry) => entry !== conditionEntry);
					container.empty();
					this.buildConditionIcons(container, character);
					// Route through the injected callback — never CodeBlocks directly.
					// The old direct CodeBlocks.updateCodeBlock(app, data, ctx, "") call
					// rewrote the fence with an EMPTY language, corrupting the block (CB-2).
					this.persist();
				});
			}
		});

		// TODO - Add-condition UI stayed disabled after the original "saving condition
		// changes prevents the damage from saving" bug (DC-6, now fixed by routing all
		// persistence through this.persist()). Re-enabling is a feature decision.
	}
}
