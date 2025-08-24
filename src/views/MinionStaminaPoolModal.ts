import { App, Modal, MarkdownPostProcessorContext, setIcon } from "obsidian";
import { Creature, CreatureInstance, EncounterData, EnemyGroup, Condition } from "@drawSteelAdmonition/EncounterData";
import { ConditionManager } from "@utils/Conditions";
import { CodeBlocks } from "@utils/CodeBlocks";

export class MinionStaminaPoolModal extends Modal {
	private group: EnemyGroup;
	private creature: Creature; // Minion creature
	private data: EncounterData;
	private ctx: MarkdownPostProcessorContext;
	private updateCallback: () => void;

	// New properties for pending STAMINA changes
	private pendingStaminaChange: number = 0;
	private minionCheckboxes: { instance: CreatureInstance; checkbox: HTMLInputElement }[] = [];

	constructor(
		app: App,
		group: EnemyGroup,
		creature: Creature,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		updateCallback: () => void
	) {
		super(app);
		this.group = group;
		this.creature = creature;
		this.data = data;
		this.ctx = ctx;
		this.updateCallback = updateCallback;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		const minionsStaminaModal = contentEl.createEl("div", { cls: "minion-stamina-modal" });

		minionsStaminaModal.createEl("h2", { text: `${this.group.name} - Minion Stamina Pool`, cls: "stamina-header" });

		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;

		// First Row: STAMINA Pool Bar
		const staminaBarContainer = minionsStaminaModal.createEl("div", { cls: "stamina-bar-container" });
		const staminaBar = staminaBarContainer.createEl("div", { cls: "stamina-bar" });

		// Create two fill elements for the stamina bar
		const staminaBarFillLeft = staminaBar.createEl("div", { cls: "stamina-bar-fill stamina-bar-fill-left" });
		const staminaBarFillRight = staminaBar.createEl("div", { cls: "stamina-bar-fill stamina-bar-fill-right" });

		// Add tick marks at each minion death point
		for (let i = 1; i < aliveMinions; i++) {
			const tickPosition = (i * minionMaxStamina) / poolMaxStamina;
			const tick = staminaBar.createEl("div", { cls: "stamina-bar-tick" });
			tick.style.left = `${tickPosition * 100}%`;
		}

		// Update the STAMINA bar display
		this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight);

		// Second Row: Stamina Modifiers
		const staminaModContainer = minionsStaminaModal.createEl("div", { cls: "stamina-mod-container" });

		// Decrement Button
		const decrementButton = staminaModContainer.createEl("div", { cls: "stamina-adjust-btn" });
		setIcon(decrementButton, "minus-circle");
		decrementButton.addEventListener("click", () => {
			this.pendingStaminaChange -= Math.min(1, poolCurrentStamina + this.pendingStaminaChange);
			this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight);
			this.updateInfoText(infoText);
			this.updateCheckboxes();
			this.updateActionButton(actionButton, warningIcon);
		});

		// Input to set the stamina directly
		const staminaValueDisplay = staminaModContainer.createEl("input", {
			type: "number",
			cls: "stamina-value-display",
		}) as HTMLInputElement;
		staminaValueDisplay.value = (poolCurrentStamina + this.pendingStaminaChange).toString();
		staminaValueDisplay.addEventListener("input", () => {
			const newStaminaValue = parseInt(staminaValueDisplay.value);
			if (!isNaN(newStaminaValue)) {
				this.pendingStaminaChange = newStaminaValue - poolCurrentStamina;
				this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight);
				this.updateInfoText(infoText);
				this.updateCheckboxes();
				this.updateActionButton(actionButton, warningIcon);
			}
		});

		// Display Max STAMINA
		staminaModContainer.createEl("span", {
			text: `/ ${poolMaxStamina}`,
			cls: "max-stamina-display",
		});

		// Increment Button
		const incrementButton = staminaModContainer.createEl("div", { cls: "stamina-adjust-btn" });
		setIcon(incrementButton, "plus-circle");
		incrementButton.addEventListener("click", () => {
			this.pendingStaminaChange += Math.min(1, poolMaxStamina - poolCurrentStamina - this.pendingStaminaChange);
			this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight);
			this.updateInfoText(infoText);
			this.updateCheckboxes();
			this.updateActionButton(actionButton, warningIcon);
		});

		// Third Row: Apply Damage
		const applyContainer = minionsStaminaModal.createEl("div", { cls: "apply-container" });
		const applyRow = applyContainer.createEl("div", { cls: "apply-row" });
		applyRow.createEl("span", { text: "Apply" });

		const damageInput = applyRow.createEl("input", {
			type: "number",
			cls: "apply-input",
			attr: { size: 3 },
		}) as HTMLInputElement;
		damageInput.value = "0";

		applyRow.createEl("span", { text: "damage to" });

		const minionCountInput = applyRow.createEl("input", {
			type: "number",
			cls: "apply-input",
			attr: { size: 3 },
		}) as HTMLInputElement;
		minionCountInput.value = "1";
		minionCountInput.max = this.creature.instances?.length.toString() ?? "";
		minionCountInput.min = "0";

		applyRow.createEl("span", { text: "minions" });

		// Apply Damage Button
		const applyDamageButton = applyRow.createEl("button", { cls: "apply-btn" });
		setIcon(applyDamageButton.createEl("div", { cls: "btn-icon" }), "sword");
		applyDamageButton.createEl("div", { cls: "btn-text", text: "Apply Damage" });
		applyDamageButton.addEventListener("click", () => {
			const damage = parseInt(damageInput.value);
			const minions = parseInt(minionCountInput.value);
			if (!isNaN(damage) && !isNaN(minions)) {
				const totalDamage = damage * minions;
				this.pendingStaminaChange -= totalDamage;
				this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight);
				this.updateInfoText(infoText);
				this.updateCheckboxes();
				this.updateActionButton(actionButton, warningIcon);
			}
		});

		const divider = minionsStaminaModal.createEl("div", { cls: "horizontal-divider" });

		// Minion List
		const minionListContainer = minionsStaminaModal.createEl("div", { cls: "minion-list-container" });

		// Info Text
		const infoText = minionListContainer.createEl("div", { cls: "info-text" });
		this.updateInfoText(infoText);

		// List the minions
		this.creature.instances?.forEach((instance) => {
			if (instance.isDead) return; // Skip dead minions

			const minionRow = minionListContainer.createEl("div", { cls: "minion-row" });

			const checkbox = minionRow.createEl("input", { type: "checkbox", cls: "minion-checkbox" }) as HTMLInputElement;
			checkbox.addEventListener("change", () => {
				this.updateCheckboxes();
				this.updateActionButton(actionButton, warningIcon);
			});
			this.minionCheckboxes.push({ instance, checkbox });

			const minionName = minionRow.createEl("span", {
				text: `${this.creature.name} #${instance.id}`,
				cls: "minion-name",
			});

			// Toggle checkbox when clicking on minion's name
			minionName.addEventListener("click", () => {
				if (!checkbox.disabled) {
					checkbox.checked = !checkbox.checked;
					this.updateCheckboxes();
					this.updateActionButton(actionButton, warningIcon);
				}
			});

			// Icons for conditions
			const conditionsEl = minionRow.createEl("div", { cls: "minion-conditions" });
			this.buildConditionIcons(conditionsEl, instance, this.data, this.ctx);
		});

		// Bottom: Action Button and Reset Button
		const actionButtonContainer = minionsStaminaModal.createEl("div", { cls: "action-button-container" });

		// Reset Button
		const resetButton = actionButtonContainer.createEl("button", { cls: "reset-button" });
		setIcon(resetButton.createEl("div", { cls: "btn-icon" }), "undo");
		resetButton.createEl("div", { cls: "btn-text", text: "Reset" });
		resetButton.addEventListener("click", () => {
			this.pendingStaminaChange = 0;
			damageInput.value = "0";
			minionCountInput.value = "1";
			staminaValueDisplay.value = poolCurrentStamina.toString();
			this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight);
			this.updateInfoText(infoText);
			// Uncheck all checkboxes and enable them
			this.minionCheckboxes.forEach((item) => {
				item.checkbox.checked = false;
				item.checkbox.disabled = true;
			});
			this.updateCheckboxes();
			this.updateActionButton(actionButton, warningIcon);
		});

		// Warning Icon for Healing
		const warningIcon = actionButtonContainer.createEl("div", { cls: "warning-icon" });
		setIcon(warningIcon, "alert-circle");
		warningIcon.style.display = "none";

		const actionButton = actionButtonContainer.createEl("button", { cls: "action-button" });
		this.updateActionButton(actionButton, warningIcon);
		actionButton.addEventListener("click", () => {
			const newStamina = poolCurrentStamina + this.pendingStaminaChange;
			const maxStamina = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0 * minionMaxStamina;
			this.group.minion_stamina_pool = Math.min(maxStamina, Math.max(0, newStamina));

			// Update the minion instances based on the selected checkboxes
			const checkedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked);

			checkedMinions.forEach((item) => {
				item.instance.isDead = true;
			});

			// Update the creature.amount. EDIT: I dont think I want this...
			// this.creature.amount = this.creature.instances.filter((inst) => !inst.isDead).length;

			// Update the data and call the updateCallback
			this.updateCallback();
			this.close();
		});

		// Initialize checkboxes
		this.updateCheckboxes();
	}

	private updateStaminaBar(staminaBarFillLeft: HTMLElement, staminaBarFillRight: HTMLElement) {
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;
		const newStamina = Math.min(poolMaxStamina, Math.max(0, poolCurrentStamina + this.pendingStaminaChange));

		const currentStaminaPercentage = (poolCurrentStamina / poolMaxStamina) * 100;
		const newStaminaPercentage = (newStamina / poolMaxStamina) * 100;
		const pendingChangePercentage = ((newStamina - poolCurrentStamina) / poolMaxStamina) * 100;

		if (this.pendingStaminaChange > 0) {
			// Healing
			staminaBarFillLeft.style.width = `${currentStaminaPercentage}%`;
			staminaBarFillLeft.style.left = '1px'; // Adjust for border
			staminaBarFillLeft.style.backgroundColor = 'limegreen';

			staminaBarFillRight.style.width = `${pendingChangePercentage}%`;
			// staminaBarFillRight.style.left = `calc(${currentStaminaPercentage}% + 1px)`; // Adjust for border
			staminaBarFillRight.style.backgroundColor = 'deepskyblue';
			staminaBarFillRight.style.borderRadius = '0 3px 3px 0';
		} else if (this.pendingStaminaChange < 0) {
			// Damage
			staminaBarFillLeft.style.width = `${newStaminaPercentage}%`;
			staminaBarFillLeft.style.left = '1px'; // Adjust for border
			staminaBarFillLeft.style.backgroundColor = 'limegreen';
			staminaBarFillLeft.style.borderRadius = '3px 0 0 3px';
			staminaBarFillRight.style.width = `${(this.pendingStaminaChange / poolMaxStamina) * -100}%`;
			staminaBarFillRight.style.backgroundColor = 'crimson';
			staminaBarFillRight.style.borderRadius = '3px 0 0 3px';
		} else {
			// No change
			staminaBarFillLeft.style.width = `${currentStaminaPercentage}%`;
			staminaBarFillLeft.style.left = '1px'; // Adjust for border
			staminaBarFillLeft.style.backgroundColor = 'limegreen';
			staminaBarFillLeft.style.borderRadius = '3px 3px 3px 3px';

			staminaBarFillRight.style.width = `0%`;
		}

		// Update the stamina display value
		const staminaValueDisplay = this.contentEl.querySelector(".stamina-value-display") as HTMLInputElement;
		if (staminaValueDisplay) {
			staminaValueDisplay.value = newStamina.toString();
		}
	}

	private updateInfoText(infoText: HTMLElement) {
		const totalPendingDamage = -this.pendingStaminaChange; // pendingStaminaChange is negative when taking damage
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;
		const newStamina = poolCurrentStamina + this.pendingStaminaChange;

		// Calculate how many minions should die based on the damage
		const initialMinionsKilled = Math.floor((poolMaxStamina - poolCurrentStamina) / minionMaxStamina);
		const finalMinionsKilled = Math.floor((poolMaxStamina - newStamina) / minionMaxStamina);
		const minionsToKill = finalMinionsKilled - initialMinionsKilled;

		infoText.textContent = `${totalPendingDamage} damage will kill ${minionsToKill} minion(s). \nSelect ${minionsToKill} minion(s) to kill.`;
	}

	private updateActionButton(actionButton: HTMLElement, warningIcon: HTMLElement) {
		const staminaChange = this.pendingStaminaChange;
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;
		const newStamina = poolCurrentStamina + this.pendingStaminaChange;

		// Calculate how many minions should die based on the damage
		const initialMinionsKilled = Math.floor((poolMaxStamina - poolCurrentStamina) / minionMaxStamina);
		const finalMinionsKilled = Math.floor((poolMaxStamina - newStamina) / minionMaxStamina);
		const minionsToKill = finalMinionsKilled - initialMinionsKilled;

		// Count the number of minions selected
		const selectedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked).length;

		// Disable action button if the number of selected minions doesn't match minionsToKill
		const disableActionButton = minionsToKill !== selectedMinions;

		// Update action button text
		let actionText = "";
		if (staminaChange < 0) {
			actionText += `Deal ${Math.abs(staminaChange)} damage`;
			if (minionsToKill > 0) {
				actionText += `, kill ${minionsToKill} minion(s)`;
			}
		} else if (staminaChange > 0) {
			actionText += `Heal ${staminaChange} stamina`;
		} else {
			actionText = "No Stamina Change";
		}

		actionButton.textContent = actionText;

		// Disable the button if no change or kills not accounted for
		actionButton.toggleClass("disabled", staminaChange === 0 || disableActionButton);

		// Add tooltip if required
		if (disableActionButton && minionsToKill > 0) {
			actionButton.setAttribute("title", `Select ${minionsToKill} minion(s) to kill`);
		} else {
			actionButton.removeAttribute("title");
		}

		// Show warning icon if healing
		if (staminaChange > 0) {
			warningIcon.style.display = "flex";
			warningIcon.setAttribute("title", "Typically minions are unable to regain stamina");
		} else {
			warningIcon.style.display = "none";
		}
	}

	private updateCheckboxes() {
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;
		const newStamina = poolCurrentStamina + this.pendingStaminaChange;

		// Calculate how many minions should die based on the damage
		const initialMinionsKilled = Math.floor((poolMaxStamina - poolCurrentStamina) / minionMaxStamina);
		const finalMinionsKilled = Math.floor((poolMaxStamina - newStamina) / minionMaxStamina);
		const minionsToKill = finalMinionsKilled - initialMinionsKilled;

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

	private buildConditionIcons(
		container: HTMLElement,
		character: CreatureInstance,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext
	): void {
		const conditions = character.conditions || [];

		const conditionManager = new ConditionManager();

		conditions.forEach((conditionEntry) => {
			let conditionKey: string;
			let conditionData: Condition | null = null;
			if (typeof conditionEntry === "string") {
				conditionKey = conditionEntry;
			} else if (typeof conditionEntry === "object" && conditionEntry.key) {
				conditionKey = conditionEntry.key;
				conditionData = conditionEntry;
			} else {
				return;
			}

			const condition = conditionManager.getAnyConditionByKey(conditionKey);
			if (condition) {
				const iconEl = container.createEl("div", { cls: "condition-icon" });
				setIcon(iconEl, condition.iconName);
				iconEl.title = condition.displayName;

				// Apply color and effect customizations
				if (conditionData) {
					if (conditionData.color) {
						iconEl.style.color = conditionData.color;
					}
					if (conditionData.effect) {
						iconEl.classList.add(`condition-effect-${conditionData.effect}`);
					}
				}

				iconEl.addEventListener("click", () => {
					character.conditions = conditions.filter((entry) => entry !== conditionEntry);
					container.empty();
					this.buildConditionIcons(container, character, data, ctx);
					CodeBlocks.updateCodeBlock(this.app, data, ctx, "");
				});
			}
		});

		// TODO - Saving the condition changes seems to prevent the damage from saving.  Commenting out for now
		// const addConditionEl = container.createEl("div", { cls: "add-condition-icon" });
		// setIcon(addConditionEl, "plus-circle");
		// addConditionEl.title = "Add Condition";
		// addConditionEl.addEventListener("click", () => {
		// 	const addConditionsModal = new AddConditionsModal(
		// 		this.app,
		// 		character,
		// 		conditionManager,
		// 		(newConditions) => {
		// 			character.conditions = (character.conditions || []).concat(newConditions);
		// 			container.empty();
		// 			this.buildConditionIcons(container, character, data, ctx);
		// 			CodeBlocks.updateCodeBlock(this.app, data, ctx);
		// 		}
		// 	);
		// 	addConditionsModal.open();
		// });
	}
}
