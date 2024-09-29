import { App, Modal, MarkdownPostProcessorContext, setIcon } from "obsidian";
import { Creature, CreatureInstance, EncounterData, EnemyGroup } from "../drawSteelAdmonition/EncounterData";
import { ConditionManager } from "../utils/Conditions";
import { AddConditionsModal } from "../views/ConditionSelectModal";
import { CodeBlocks } from "../utils/CodeBlocks";

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

		contentEl.createEl("h2", { text: `${this.group.name} - Minion Stamina Pool`, cls: "stamina-header" });

		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances.filter((inst) => !inst.isDead).length;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;

		// First Row: STAMINA Pool Bar
		const staminaBarContainer = contentEl.createEl("div", { cls: "stamina-bar-container" });
		const staminaBar = staminaBarContainer.createEl("div", { cls: "stamina-bar" });
		const staminaBarFill = staminaBar.createEl("div", { cls: "stamina-bar-fill" });

		// Add tick marks at each minion death point
		for (let i = 1; i < aliveMinions; i++) {
			const tickPosition = (i * minionMaxStamina) / poolMaxStamina;
			const tick = staminaBar.createEl("div", { cls: "stamina-bar-tick" });
			tick.style.left = `${tickPosition * 100}%`;
		}

		// Update the STAMINA bar display
		this.updateStaminaBar(staminaBarFill);

		// Second Row: Stamina Modifiers
		const staminaModContainer = contentEl.createEl("div", { cls: "stamina-mod-container" });

		// Decrement Button
		const decrementButton = staminaModContainer.createEl("div", { cls: "stamina-adjust-btn" });
		setIcon(decrementButton, "minus-circle");
		decrementButton.addEventListener("click", () => {
			this.pendingStaminaChange -= 1;
			this.updateStaminaBar(staminaBarFill);
			this.updateActionButton(actionButton);
			this.updateInfoText(infoText);
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
				this.updateStaminaBar(staminaBarFill);
				this.updateActionButton(actionButton);
				this.updateInfoText(infoText);
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
			this.pendingStaminaChange += 1;
			this.updateStaminaBar(staminaBarFill);
			this.updateActionButton(actionButton);
			this.updateInfoText(infoText);
		});

		// Third Row: Apply Damage
		const applyContainer = contentEl.createEl("div", { cls: "apply-container" });
		const applyRow = applyContainer.createEl("div", { cls: "apply-row" });
		applyRow.createEl("span", { text: "Apply" });

		const damageInput = applyRow.createEl("input", {
			type: "number",
			cls: "apply-input",
		}) as HTMLInputElement;
		damageInput.value = "0";

		applyRow.createEl("span", { text: "damage to" });

		const minionCountInput = applyRow.createEl("input", {
			type: "number",
			cls: "apply-input",
		}) as HTMLInputElement;
		minionCountInput.value = "0";

		applyRow.createEl("span", { text: "minions" });

		// Apply Damage Button
		const applyDamageButton = applyContainer.createEl("button", { cls: "apply-btn" });
		setIcon(applyDamageButton.createEl("div", { cls: "btn-icon" }), "sword");
		applyDamageButton.createEl("div", { cls: "btn-text", text: "Apply Damage" });
		applyDamageButton.addEventListener("click", () => {
			const damage = parseInt(damageInput.value);
			const minions = parseInt(minionCountInput.value);
			if (!isNaN(damage) && !isNaN(minions)) {
				const totalDamage = damage * minions;
				this.pendingStaminaChange -= totalDamage;
				this.updateStaminaBar(staminaBarFill);
				this.updateActionButton(actionButton);
				this.updateInfoText(infoText);
			}
		});

		// Info Text
		const infoText = contentEl.createEl("div", { cls: "info-text" });
		this.updateInfoText(infoText);

		// Minion List
		const minionListContainer = contentEl.createEl("div", { cls: "minion-list-container" });

		// List the minions
		this.creature.instances.forEach((instance) => {
			if (instance.isDead) return; // Skip dead minions

			const minionRow = minionListContainer.createEl("div", { cls: "minion-row" });

			const checkbox = minionRow.createEl("input", { type: "checkbox", cls: "minion-checkbox" }) as HTMLInputElement;
			checkbox.addEventListener("change", () => {
				this.updateActionButton(actionButton);
			});
			this.minionCheckboxes.push({ instance, checkbox });

			minionRow.createEl("span", { text: `${this.creature.name} #${instance.id}`, cls: "minion-name" });

			// Icons for conditions
			const conditionsEl = minionRow.createEl("div", { cls: "minion-conditions" });
			this.buildConditionIcons(conditionsEl, instance, this.data, this.ctx);
		});

		// Bottom: Action Button and Reset Button
		const actionButtonContainer = contentEl.createEl("div", { cls: "action-button-container" });

		// Reset Button
		const resetButton = actionButtonContainer.createEl("button", { cls: "reset-button" });
		setIcon(resetButton.createEl("div", { cls: "btn-icon" }), "undo");
		resetButton.createEl("div", { cls: "btn-text", text: "Reset" });
		resetButton.addEventListener("click", () => {
			this.pendingStaminaChange = 0;
			damageInput.value = "0";
			minionCountInput.value = "0";
			staminaValueDisplay.value = poolCurrentStamina.toString();
			this.updateStaminaBar(staminaBarFill);
			this.updateActionButton(actionButton);
			this.updateInfoText(infoText);
			// Uncheck all checkboxes
			this.minionCheckboxes.forEach((item) => {
				item.checkbox.checked = false;
				item.checkbox.disabled = false;
			});
		});

		const actionButton = actionButtonContainer.createEl("button", { cls: "action-button" });
		this.updateActionButton(actionButton);
		actionButton.addEventListener("click", () => {
			const newStamina = poolCurrentStamina + this.pendingStaminaChange;
			const maxStamina = this.creature.instances.filter((inst) => !inst.isDead).length * minionMaxStamina;
			this.group.minion_stamina_pool = Math.min(maxStamina, Math.max(0, newStamina));

			// Update the minion instances based on the selected checkboxes
			const checkedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked);

			checkedMinions.forEach((item) => {
				item.instance.isDead = true;
			});

			// Update the creature.amount
			this.creature.amount = this.creature.instances.filter((inst) => !inst.isDead).length;

			// Update the data and call the updateCallback
			this.updateCallback();
			this.close();
		});
	}

	private updateStaminaBar(staminaBarFill: HTMLElement) {
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances.filter((inst) => !inst.isDead).length;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;
		const newStamina = Math.min(poolMaxStamina, Math.max(0, poolCurrentStamina + this.pendingStaminaChange));
		const percentage = (newStamina / poolMaxStamina) * 100;
		staminaBarFill.style.width = `${percentage}%`;
		// Update the stamina display value
		const staminaValueDisplay = this.contentEl.querySelector(".stamina-value-display") as HTMLInputElement;
		if (staminaValueDisplay) {
			staminaValueDisplay.value = newStamina.toString();
		}
	}

	private updateInfoText(infoText: HTMLElement) {
		const totalPendingDamage = -this.pendingStaminaChange; // pendingStaminaChange is negative when taking damage
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances.filter((inst) => !inst.isDead).length;
		const poolMaxStamina = aliveMinions * minionMaxStamina;
		const poolCurrentStamina = this.group.minion_stamina_pool ?? poolMaxStamina;
		const newStamina = poolCurrentStamina + this.pendingStaminaChange;

		// Calculate how many minions should die based on the damage
		const initialMinionsKilled = Math.floor((poolMaxStamina - poolCurrentStamina) / minionMaxStamina);
		const finalMinionsKilled = Math.floor((poolMaxStamina - newStamina) / minionMaxStamina);
		const minionsToKill = finalMinionsKilled - initialMinionsKilled;

		infoText.textContent = `${totalPendingDamage} damage will kill ${minionsToKill} minion(s). Please select ${minionsToKill} minion(s) to kill.`;
	}

	private updateActionButton(actionButton: HTMLElement) {
		const staminaChange = this.pendingStaminaChange;
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances.filter((inst) => !inst.isDead).length;
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
					CodeBlocks.updateCodeBlock(this.app, data, ctx);
				});
			}
		});

		const addConditionEl = container.createEl("div", { cls: "add-condition-icon" });
		setIcon(addConditionEl, "plus-circle");
		addConditionEl.title = "Add Condition";
		addConditionEl.addEventListener("click", () => {
			const addConditionsModal = new AddConditionsModal(
				this.app,
				character,
				conditionManager,
				(newConditions) => {
					character.conditions = (character.conditions || []).concat(newConditions);
					container.empty();
					this.buildConditionIcons(container, character, data, ctx);
					CodeBlocks.updateCodeBlock(this.app, data, ctx);
				}
			);
			addConditionsModal.open();
		});
	}
}
