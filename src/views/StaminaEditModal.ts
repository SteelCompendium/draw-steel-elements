import { App, Modal, setIcon } from "obsidian";
import {StaminaBar} from "@model/StaminaBar";

export class StaminaEditModal extends Modal {
	private staminaBar: StaminaBar;
	private isHero: boolean;
	private name: string;
	private updateCallback: () => void;

	// New properties for pending STAMINA and Temp STAMINA changes
	private pendingStaminaChange: number = 0;
	private pendingTempStaminaChange: number = 0;

	constructor(
		app: App,
		staminaBar: StaminaBar,
		isHero: boolean,
		name: string,
		updateCallback: () => void
	) {
		super(app);
		this.staminaBar = staminaBar;
		this.isHero = isHero;
		this.name = name;
		this.updateCallback = updateCallback;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();

		// Character Info
		contentEl.createEl('h2', { text: `${this.name} Stamina`, cls: 'stamina-header' });

		// Adjust maxStamina and negativeStaminaLimit based on character type
		const maxStamina = this.staminaBar.max_stamina;
		const currentStamina = this.staminaBar.current_stamina ?? maxStamina;
		const currentTempStamina = this.staminaBar.temp_stamina ?? 0;
		const negativeStaminaLimit = this.isHero ? Math.ceil(-0.5 * maxStamina) : 0;

		// First Row: STAMINA Bar
		const staminaBarContainer = contentEl.createEl('div', { cls: 'stamina-bar-container' });
		if (this.isHero) {
			staminaBarContainer.createEl('div', { cls: 'stamina-bar-overlay', text: "Dying" });
		}
		const staminaBar = staminaBarContainer.createEl('div', { cls: 'stamina-bar' });
		const staminaBarFillLeft = staminaBar.createEl('div', { cls: 'stamina-bar-fill-left' });
		const staminaBarFillRight = staminaBar.createEl('div', { cls: 'stamina-bar-fill-right' });

		// Update the STAMINA bar display
		this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);

		// Third Row: Apply Damage/Healing with Input
		const modifierContainer = contentEl.createEl('div', { cls: 'modifier-container' });

		const applyContainer = modifierContainer.createEl('div', { cls: 'apply-container' });

		const applyRow = applyContainer.createEl('div', { cls: 'apply-row' });
		applyRow.createEl('span', { text: 'Apply' });

		const applyInput = applyRow.createEl('input', {
			type: 'number',
			cls: 'apply-input',
		}) as HTMLInputElement;
		applyInput.value = '0';
		applyInput.focus();

		const damageButton = applyContainer.createEl('button', { cls: 'apply-btn' });
		setIcon(damageButton.createEl('div', { cls: 'btn-icon' }), "sword");
		damageButton.createEl('div', { cls: 'btn-text', text: 'Damage' });
		damageButton.addEventListener('click', () => {
			const adjustment = parseInt(applyInput.value);
			if (!isNaN(adjustment)) {
				// Apply damage to temp STAMINA first
				let tempStaminaAvailable = currentTempStamina + this.pendingTempStaminaChange;
				let tempStaminaUsed = Math.min(adjustment, tempStaminaAvailable);
				this.pendingTempStaminaChange -= tempStaminaUsed;
				let remainingDamage = adjustment - tempStaminaUsed;
				this.pendingStaminaChange -= Math.min(remainingDamage, this.amountToDeath(currentStamina, negativeStaminaLimit));

				this.updateStaminaDisplay(staminaValueDisplay, currentStamina);
				tempStaminaInput.value = (currentTempStamina + this.pendingTempStaminaChange).toString();
				this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
				this.updateActionButton(actionButton);
			}
		});

		const healingButton = applyContainer.createEl('button', { cls: 'apply-btn' });
		setIcon(healingButton.createEl('div', { cls: 'btn-icon' }), "plus");
		healingButton.createEl('div', { cls: 'btn-text', text: 'Healing' });
		healingButton.addEventListener('click', () => {
			const adjustment = parseInt(applyInput.value);
			if (!isNaN(adjustment)) {
				this.pendingStaminaChange += Math.min(adjustment, this.amountToMaxStamina(currentStamina, maxStamina));
				this.updateStaminaDisplay(staminaValueDisplay, currentStamina);
				this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
				this.updateActionButton(actionButton);
			}
		});

		modifierContainer.createEl('div', { cls: 'vertical-divider', text: ' ' });

		// Stamina edit container
		const staminaModContainer = modifierContainer.createEl('div', { cls: 'stamina-mod-container' });
		const staminaNumericContainer = staminaModContainer.createEl('div', { cls: 'stamina-numeric-container' });

		// Decrement Button
		const decrementButton = staminaNumericContainer.createEl('div', { cls: 'stamina-adjust-btn' });
		setIcon(decrementButton, "minus-circle");
		decrementButton.addEventListener('click', () => {
			this.pendingStaminaChange -= Math.min(1, this.amountToDeath(currentStamina, negativeStaminaLimit));
			this.updateStaminaDisplay(staminaValueDisplay, currentStamina);
			this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
			this.updateActionButton(actionButton);
		});

		// STAMINA Value Display (Editable)
		const staminaValueDisplay = staminaNumericContainer.createEl('input', {
			type: 'number',
			cls: 'stamina-value-display',
		}) as HTMLInputElement;
		staminaValueDisplay.value = (currentStamina + this.pendingStaminaChange).toString();
		staminaValueDisplay.autofocus = false;
		staminaValueDisplay.addEventListener('input', () => {
			const newStaminaValue = parseInt(staminaValueDisplay.value);
			if (!isNaN(newStaminaValue)) {
				this.pendingStaminaChange = newStaminaValue - currentStamina;
				this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
				this.updateActionButton(actionButton);
			}
		});

		// Display Max STAMINA
		staminaNumericContainer.createEl('span', { text: `/ ${maxStamina}`, cls: 'max-stamina-display' });

		// Increment Button
		const incrementButton = staminaNumericContainer.createEl('div', { cls: 'stamina-adjust-btn' });
		setIcon(incrementButton, "plus-circle");
		incrementButton.addEventListener('click', () => {
			this.pendingStaminaChange += Math.min(1, this.amountToMaxStamina(currentStamina, maxStamina));
			this.updateStaminaDisplay(staminaValueDisplay, currentStamina);
			this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
			this.updateActionButton(actionButton);
		});

		// Temporary Stamina Container
		const tempStaminaContainer = staminaModContainer.createEl('div', { cls: 'temp-stamina-container' });
		tempStaminaContainer.createEl('div', { cls: 'temp-stamina-title', text: 'Temporary Stamina' });
		const tempStaminaBody = tempStaminaContainer.createEl('div', { cls: 'temp-stamina-body' });

		// Decrease Temp Stamina Button
		const decrementTempButton = tempStaminaBody.createEl('div', { cls: 'temp-stamina-btn' });
		setIcon(decrementTempButton, 'minus-circle');
		decrementTempButton.addEventListener('click', () => {
			if (currentTempStamina + this.pendingTempStaminaChange <= 0) {
				return;
			}
			this.pendingTempStaminaChange -= 1;
			tempStaminaInput.value = (currentTempStamina + this.pendingTempStaminaChange).toString();
			this.updateActionButton(actionButton);
		});

		// Input for temp stamina
		const tempStaminaInput = tempStaminaBody.createEl('input', {
			type: 'number',
			cls: 'temp-stamina-input',
		}) as HTMLInputElement;
		tempStaminaInput.min = '0';
		tempStaminaInput.value = (currentTempStamina + this.pendingTempStaminaChange).toString();
		tempStaminaInput.addEventListener('input', () => {
			let newTempStaminaValue = parseInt(tempStaminaInput.value);
			if (!isNaN(newTempStaminaValue)) {
				// Ensure the temp stamina value is not negative
				if (newTempStaminaValue < 0) {
					newTempStaminaValue = 0;
					tempStaminaInput.value = '0'; // Update the input field to reflect the corrected value
				}
				this.pendingTempStaminaChange = newTempStaminaValue - currentTempStamina;
				this.updateActionButton(actionButton);
			}
		});

		// Increase Temp Stamina Button
		const incrementTempButton = tempStaminaBody.createEl('div', { cls: 'temp-stamina-btn' });
		setIcon(incrementTempButton, 'plus-circle');
		incrementTempButton.addEventListener('click', () => {
			this.pendingTempStaminaChange += 1;
			tempStaminaInput.value = (currentTempStamina + this.pendingTempStaminaChange).toString();
			this.updateActionButton(actionButton);
		});

		modifierContainer.createEl('div', { cls: 'vertical-divider', text: ' ' });

		// Quick Modifiers
		const quickModContainer = modifierContainer.createEl('div', { cls: 'quick-mod-container' });

		const killButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn' });
		setIcon(killButton.createEl('div', { cls: 'btn-icon' }), "skull");
		killButton.createEl('div', { cls: 'btn-text', text: 'Kill' });
		killButton.addEventListener('click', () => {
			this.pendingStaminaChange = negativeStaminaLimit - currentStamina;
			this.pendingTempStaminaChange = -currentTempStamina; // Remove all temp STAMINA
			tempStaminaInput.value = '0';
			this.updateStaminaDisplay(staminaValueDisplay, currentStamina);
			this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
			this.updateActionButton(actionButton);
		});

		const fullHealButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn' });
		setIcon(fullHealButton.createEl('div', { cls: 'btn-icon' }), "plus");
		fullHealButton.createEl('div', { cls: 'btn-text', text: 'Full Heal' });
		fullHealButton.addEventListener('click', () => {
			this.pendingStaminaChange = maxStamina - currentStamina;
			this.pendingTempStaminaChange = -currentTempStamina; // Reset temp stamina to 0
			tempStaminaInput.value = '0';
			this.updateStaminaDisplay(staminaValueDisplay, currentStamina);
			this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
			this.updateActionButton(actionButton);
		});

		const recoveryButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn' });
		setIcon(recoveryButton.createEl('div', { cls: 'btn-icon' }), "syringe");
		recoveryButton.createEl('div', { cls: 'btn-text', text: 'Spend Recovery' });
		recoveryButton.addEventListener('click', () => {
			const adjustment = Math.min(Math.floor(maxStamina / 3), maxStamina);
			if (!isNaN(adjustment)) {
				this.pendingStaminaChange += adjustment;
				this.updateStaminaDisplay(staminaValueDisplay, currentStamina);
				this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
				this.updateActionButton(actionButton);
			}
		});

		// Bottom: Action Button and Reset Button
		const actionButtonContainer = contentEl.createEl('div', { cls: 'action-button-container' });

		// Reset Button
		const resetButton = actionButtonContainer.createEl('button', { cls: 'reset-button' });
		setIcon(resetButton.createEl('div', { cls: 'btn-icon' }), "undo");
		resetButton.createEl('div', { cls: 'btn-text', text: 'Reset' });
		resetButton.addEventListener('click', () => {
			this.pendingStaminaChange = 0;
			this.pendingTempStaminaChange = 0;
			this.updateStaminaDisplay(staminaValueDisplay, currentStamina);
			tempStaminaInput.value = (currentTempStamina + this.pendingTempStaminaChange).toString();
			this.updateStaminaBar(staminaBarFillLeft, staminaBarFillRight, negativeStaminaLimit, maxStamina);
			this.updateActionButton(actionButton);
		});

		const actionButton = actionButtonContainer.createEl('button', { cls: 'action-button' });
		this.updateActionButton(actionButton);
		actionButton.addEventListener('click', () => {
			const newCurrentStamina = this.clampStamina(currentStamina + this.pendingStaminaChange, negativeStaminaLimit, maxStamina);
			this.staminaBar.current_stamina = newCurrentStamina;

			const newTempStamina = currentTempStamina + this.pendingTempStaminaChange;
			this.staminaBar.temp_stamina = newTempStamina;

			this.updateCallback();
			this.close();
		});

		// Set focus once we have loaded
		queueMicrotask(() => { applyInput.focus(); });
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

	private updateStaminaBar(staminaBarFillLeft: HTMLElement, staminaBarFillRight: HTMLElement, negativeStaminaLimit: number, maxStamina: number) {
		const dyingLength = negativeStaminaLimit * -1;
		const barLength = maxStamina + dyingLength;
		const adjustedCurrentStamina = this.staminaBar.current_stamina + dyingLength;

		if (this.pendingStaminaChange > 0) {
			// Healing
			staminaBarFillLeft.style.width = `${((adjustedCurrentStamina) / barLength) * 100}%`;
			staminaBarFillLeft.style.backgroundColor = 'limegreen';
			staminaBarFillRight.style.width = `${((this.pendingStaminaChange) / barLength) * 100}%`;
			staminaBarFillRight.style.backgroundColor = 'deepskyblue';
			staminaBarFillRight.style.borderRadius = '0 3px 3px 0';
		} else if (this.pendingStaminaChange < 0) {
			// Damage
			staminaBarFillLeft.style.width = `${((adjustedCurrentStamina + this.pendingStaminaChange) / barLength) * 100}%`;
			staminaBarFillLeft.style.backgroundColor = 'limegreen';
			staminaBarFillRight.style.width = `${(this.pendingStaminaChange / barLength) * -100}%`;
			staminaBarFillRight.style.backgroundColor = 'crimson';
			staminaBarFillRight.style.borderRadius = '3px 0 0 3px';
		} else {
			// No change
			staminaBarFillLeft.style.width = `${(adjustedCurrentStamina / barLength) * 100}%`;
			staminaBarFillLeft.style.backgroundColor = 'limegreen';
			staminaBarFillRight.style.width = `0%`;
			staminaBarFillRight.style.backgroundColor = 'deepskyblue';
		}
	}

	private updateStaminaDisplay(staminaValueDisplay: HTMLInputElement, currentStamina: number) {
		const newStaminaValue = currentStamina + this.pendingStaminaChange;
		staminaValueDisplay.value = newStaminaValue.toString();
	}

	private updateActionButton(actionButton: HTMLElement) {
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

		actionButton.textContent = actionText;

		// Disable the button if no change
		actionButton.toggleClass('disabled', staminaChange === 0 && tempStaminaChange === 0);
	}
}
