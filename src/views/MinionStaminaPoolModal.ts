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
import { ConditionManager } from '@utils/Conditions';
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
	private minionCheckboxes: { instance: CreatureInstance; checkbox: HTMLInputElement }[] = [];

	private bar!: StaminaPreviewBarHandle;
	private poolStepper!: StepperHandle;
	private infoTextEl!: HTMLElement;
	private warningIconEl!: HTMLElement;
	private actionBtn!: IconButtonHandle;

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

	onOpen() {
		this.setDseTitle(`${this.group.name} - Minion Stamina Pool`);

		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;

		// -- The preview bar (shared template) with a tick at each minion death point --
		const ticks: number[] = [];
		for (let i = 1; i < aliveMinions; i++) {
			ticks.push((i * minionMaxStamina) / poolMaxStamina);
		}
		this.bar = staminaPreviewBar(this.body, { ticks });

		// -- Numeric adjust (kit stepper) ---------------------------------------------
		// Bounded [0, poolMax] — exactly the legacy ± behavior (its in/decrement already
		// clamped the step to those value bounds); the Apply-time CB-1 clamp below stays
		// the authoritative gate for the persisted value.
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
		}) as HTMLInputElement;
		damageInput.value = '0';
		damageInput.setAttribute('aria-label', 'Damage per minion');
		applyRow.createSpan({ text: 'damage to' });
		const minionCountInput = applyRow.createEl('input', {
			type: 'number',
			cls: 'dse-sedit__apply-input',
			attr: { size: 3 },
		}) as HTMLInputElement;
		minionCountInput.value = '1';
		minionCountInput.max = this.creature.instances?.length.toString() ?? '';
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
						const totalDamage = damage * minions;
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
			const checkbox = minionRow.createEl('input', { type: 'checkbox', cls: 'dse-minion__check' }) as HTMLInputElement;
			checkbox.setAttribute('aria-label', `Kill ${this.creature.name} #${instance.id}`);
			this.lifecycle.registerDomEvent(checkbox, 'change', () => {
				this.updateCheckboxes();
				this.updateActionButton();
			});
			this.minionCheckboxes.push({ instance, checkbox });

			const minionName = minionRow.createSpan({
				text: `${this.creature.name} #${instance.id}`,
				cls: 'dse-minion__name',
			});
			// Toggle the checkbox when clicking the minion's name (legacy affordance).
			this.lifecycle.registerDomEvent(minionName, 'click', () => {
				if (!checkbox.disabled) {
					checkbox.checked = !checkbox.checked;
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
					const newStamina = poolCurrentStamina + this.pendingStaminaChange;
					// Parens matter: `len ?? 0 * max` parses as `len ?? (0 * max)` and clamps
					// the pool to the alive-minion COUNT instead of count * max (CB-1).
					const maxStamina = (this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0) * minionMaxStamina;
					this.group.minion_stamina_pool = Math.min(maxStamina, Math.max(0, newStamina));

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
		// Legacy display parity: the pool input always showed the CLAMPED new value.
		this.poolStepper.setValue(this.clampedNewStamina());
		this.updateStaminaBar();
		this.updateInfoText();
		this.updateCheckboxes();
		this.updateActionButton();
	}

	/** Legacy pool math, verbatim (shared by the bar/info/checkbox/button updates). */
	private poolNumbers() {
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;
		const newStamina = poolCurrentStamina + this.pendingStaminaChange;
		// How many minions should die for this much damage (legacy verbatim).
		const initialMinionsKilled = Math.floor((poolMaxStamina - poolCurrentStamina) / minionMaxStamina);
		const finalMinionsKilled = Math.floor((poolMaxStamina - newStamina) / minionMaxStamina);
		const minionsToKill = finalMinionsKilled - initialMinionsKilled;
		return { minionMaxStamina, aliveMinions, poolMaxStamina, poolCurrentStamina, newStamina, minionsToKill };
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
	}

	private updateInfoText(): void {
		const totalPendingDamage = -this.pendingStaminaChange; // negative when taking damage
		const { minionsToKill } = this.poolNumbers();
		this.infoTextEl.textContent = `${totalPendingDamage} damage will kill ${minionsToKill} minion(s). \nSelect ${minionsToKill} minion(s) to kill.`;
	}

	/** Legacy wording verbatim; the disabled state is the REAL property (CB-8). */
	private updateActionButton(): void {
		const staminaChange = this.pendingStaminaChange;
		const { minionsToKill } = this.poolNumbers();

		// Count the number of minions selected
		const selectedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked).length;

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
				item.checkbox.checked = true;
				item.checkbox.disabled = true;
			});
			return;
		}

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
				setIcon(iconEl, condition.iconName);
				iconEl.title = condition.displayName;

				// Apply color and effect customizations
				if (conditionData) {
					if (conditionData.color) {
						// SC-5: the USER-SUPPLIED color rides the sanctioned scoped custom
						// property (never el.style.color); CSSOM setProperty is
						// injection-safe (invalid values are dropped at parse). Full SD-2
						// validation of condition colors is Task 8's (shared condition UI).
						iconEl.style.setProperty('--dse-condition-color', conditionData.color);
					}
					if (conditionData.effect) {
						iconEl.classList.add(`condition-effect-${conditionData.effect}`);
					}
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
