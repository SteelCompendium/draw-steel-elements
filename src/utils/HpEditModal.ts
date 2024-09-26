import { App, Modal, MarkdownPostProcessorContext, setIcon } from "obsidian";

export class HpEditModal extends Modal {
	private character: Hero | CreatureInstance;
	private creature?: Creature; // For CreatureInstance
	private data: EncounterData;
	private ctx: MarkdownPostProcessorContext;
	private updateCallback: () => void;

	// New properties for pending HP and Temp HP changes
	private pendingHpChange: number = 0;
	private pendingTempHpChange: number = 0;

	constructor(
		app: App,
		character: Hero | CreatureInstance,
		creature: Creature | null,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		updateCallback: () => void
	) {
		super(app);
		this.character = character;
		this.creature = creature;
		this.data = data;
		this.ctx = ctx;
		this.updateCallback = updateCallback;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();

		// Character Info
		const name = this.isHero(this.character)
			? this.character.name
			: this.creature.name + " #" + this.character.id;
		contentEl.createEl('h2', { text: `${name} Stamina`, cls: 'stamina-header' });

		// Adjust maxHp and negativeHpLimit based on character type
		const maxHp = this.isHero(this.character)
			? this.character.max_hp
			: this.creature?.max_hp ?? 0;
		const currentHp = this.character.current_hp ?? maxHp;
		const currentTempHp = this.isHero(this.character) ? this.character.temp_hp ?? 0 : 0;
		const negativeHpLimit = this.isHero(this.character)
			? -0.5 * maxHp
			: 0; // Enemies cannot have negative HP

		// First Row: HP Bar
		const hpBarContainer = contentEl.createEl('div', { cls: 'hp-bar-container' });
		if (this.isHero(this.character)) {
			const hpBarOverlay = hpBarContainer.createEl('div', { cls: 'hp-bar-overlay', text: "Dying" });
		}
		const hpBar = hpBarContainer.createEl('div', { cls: 'hp-bar' });
		const hpBarFillLeft = hpBar.createEl('div', { cls: 'hp-bar-fill-left' });
		const hpBarFillRight = hpBar.createEl('div', { cls: 'hp-bar-fill-right' });

		// Update the HP bar display
		this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);

		// Second Row: Numeric HP Display with Increment/Decrement Buttons
		// (leaving this open for future...)

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
				this.pendingHpChange -= Math.min(adjustment, this.amountToDeath(currentHp, negativeHpLimit));
				this.updateHpDisplay(hpValueDisplay, currentHp, maxHp, currentTempHp);
				this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
				this.updateActionButton(actionButton);
			}
		});

		const healingButton = applyContainer.createEl('button', { cls: 'apply-btn' });
		setIcon(healingButton.createEl('div', { cls: 'btn-icon' }), "plus");
		healingButton.createEl('div', { cls: 'btn-text', text: 'Healing' });
		healingButton.addEventListener('click', () => {
			const adjustment = parseInt(applyInput.value);
			if (!isNaN(adjustment)) {
				this.pendingHpChange += Math.min(adjustment, this.amountToMaxHp(currentHp, maxHp));
				this.updateHpDisplay(hpValueDisplay, currentHp, maxHp, currentTempHp);
				this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
				this.updateActionButton(actionButton);
			}
		});

		modifierContainer.createEl('div', { cls: 'vertical-divider', text: ' '});

		// Stamina edit container
		const staminaModContainer = modifierContainer.createEl('div', { cls: 'stamina-mod-container' });
		const hpNumericContainer = staminaModContainer.createEl('div', { cls: 'hp-numeric-container' });

		// Decrement Button
		const decrementButton = hpNumericContainer.createEl('div', { cls: 'hp-adjust-btn' });
		setIcon(decrementButton, "minus-circle");
		decrementButton.addEventListener('click', () => {
			this.pendingHpChange -= Math.min(1, this.amountToDeath(currentHp, negativeHpLimit));
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp, currentTempHp);
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
			this.updateActionButton(actionButton);
		});

		// HP Value Display (Editable)
		const hpValueDisplay = hpNumericContainer.createEl('input', {
			type: 'number',
			cls: 'hp-value-display',
		}) as HTMLInputElement;
		hpValueDisplay.value = (currentHp + this.pendingHpChange).toString();
		hpValueDisplay.autofocus = false;
		hpValueDisplay.addEventListener('input', () => {
			const newHpValue = parseInt(hpValueDisplay.value);
			if (!isNaN(newHpValue)) {
				this.pendingHpChange = newHpValue - currentHp;
				this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
				this.updateActionButton(actionButton);
			}
		});

		// Display Max HP
		const maxHpDisplay = hpNumericContainer.createEl('span', { text: `/ ${maxHp}`, cls: 'max-hp-display' });

		// Increment Button
		const incrementButton = hpNumericContainer.createEl('div', { cls: 'hp-adjust-btn' });
		setIcon(incrementButton, "plus-circle");
		incrementButton.addEventListener('click', () => {
			this.pendingHpChange += Math.min(1, this.amountToMaxHp(currentHp, maxHp));
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp, currentTempHp);
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
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
			this.pendingTempHpChange -= 1;
			tempStaminaInput.value = (currentTempHp + this.pendingTempHpChange).toString();
			this.updateActionButton(actionButton);
		});

		// Input for temp stamina
		const tempStaminaInput = tempStaminaBody.createEl('input', {
			type: 'number',
			cls: 'temp-stamina-input',
		}) as HTMLInputElement;
		tempStaminaInput.value = (currentTempHp + this.pendingTempHpChange).toString();
		tempStaminaInput.addEventListener('input', () => {
			const newTempHpValue = parseInt(tempStaminaInput.value);
			if (!isNaN(newTempHpValue)) {
				this.pendingTempHpChange = newTempHpValue - currentTempHp;
				this.updateActionButton(actionButton);
			}
		});

		// Increase Temp Stamina Button
		const incrementTempButton = tempStaminaBody.createEl('div', { cls: 'temp-stamina-btn' });
		setIcon(incrementTempButton, 'plus-circle');
		incrementTempButton.addEventListener('click', () => {
			this.pendingTempHpChange += 1;
			tempStaminaInput.value = (currentTempHp + this.pendingTempHpChange).toString();
			this.updateActionButton(actionButton);
		});

		modifierContainer.createEl('div', { cls: 'vertical-divider', text: ' '});

		// Quick Modifiers
		const quickModContainer = modifierContainer.createEl('div', { cls: 'quick-mod-container' });

		const killButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn' });
		setIcon(killButton.createEl('div', { cls: 'btn-icon' }), "skull");
		killButton.createEl('div', { cls: 'btn-text', text: 'Kill' });
		killButton.addEventListener('click', () => {
			this.pendingHpChange = (currentHp * -1) - (this.isHero(this.character) ? (maxHp * 0.5) : 0);
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp, currentTempHp);
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
			this.updateActionButton(actionButton);
		});

		const fullHealButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn' });
		setIcon(fullHealButton.createEl('div', { cls: 'btn-icon' }), "plus");
		fullHealButton.createEl('div', { cls: 'btn-text', text: 'Full Heal' });
		fullHealButton.addEventListener('click', () => {
			this.pendingHpChange = maxHp - currentHp;
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp, currentTempHp);
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
			this.updateActionButton(actionButton);
		});

		const recoveryButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn' });
		setIcon(recoveryButton.createEl('div', { cls: 'btn-icon' }), "syringe");
		recoveryButton.createEl('div', { cls: 'btn-text', text: 'Spend Recovery' });
		recoveryButton.addEventListener('click', () => {
			const adjustment = Math.min(Math.floor(maxHp / 3), maxHp);
			if (!isNaN(adjustment)) {
				this.pendingHpChange += adjustment;
				this.updateHpDisplay(hpValueDisplay, currentHp, maxHp, currentTempHp);
				this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
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
			this.pendingHpChange = 0;
			this.pendingTempHpChange = 0;
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp, currentTempHp);
			tempStaminaInput.value = (currentTempHp + this.pendingTempHpChange).toString();
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, negativeHpLimit, maxHp);
			this.updateActionButton(actionButton);
		});

		const actionButton = actionButtonContainer.createEl('button', { cls: 'action-button' });
		this.updateActionButton(actionButton);
		actionButton.addEventListener('click', () => {
			const newCurrentHp = this.clampHp(currentHp + this.pendingHpChange, negativeHpLimit, maxHp);
			this.character.current_hp = newCurrentHp;

			if (this.isHero(this.character)) {
				const newTempHp = currentTempHp + this.pendingTempHpChange;
				this.character.temp_hp = newTempHp;
			}

			this.updateCallback();
			this.close();
		});

		// Set focus once we have loaded
		queueMicrotask(() => { applyInput.focus(); });
	}

	private isHero(character: Hero | CreatureInstance): character is Hero {
		return character.isHero;
	}

	private clampHp(hp: number, negativeHpLimit: number, maxPossibleHp: number): number {
		hp = Math.min(hp, maxPossibleHp); // Cannot exceed max HP
		hp = Math.max(hp, negativeHpLimit); // Cannot go below negative HP limit
		return hp;
	}

	private amountToMaxHp(currentHp, maxHp) {
		return maxHp - currentHp - this.pendingHpChange;
	}

	private amountToDeath(currentHp, negativeHpLimit) {
		return (negativeHpLimit * -1) + currentHp + this.pendingHpChange;
	}

	private updateHpBar(hpBarFillLeft: HTMLElement, hpBarFillRight: HTMLElement, negativeHpLimit: number, maxHp: number) {
		const dyingLength = negativeHpLimit * -1;
		const barLength = maxHp + dyingLength;
		if (this.pendingHpChange > 0) {
			// Healing
			hpBarFillLeft.style.width = `${((this.character.current_hp + dyingLength) / barLength) * 100}%`;
			hpBarFillLeft.style.backgroundColor = 'limegreen';
			hpBarFillRight.style.width = `${((this.pendingHpChange) / barLength) * 100}%`;
			hpBarFillRight.style.backgroundColor = 'deepskyblue';
			hpBarFillRight.style.borderRadius = '0 3px 3px 0';
		} else if (this.pendingHpChange < 0) {
			// Damage
			hpBarFillLeft.style.width = `${((this.character.current_hp + this.pendingHpChange + dyingLength) / barLength) * 100}%`;
			hpBarFillLeft.style.backgroundColor = 'limegreen';
			hpBarFillRight.style.width = `${(this.pendingHpChange / barLength) * -100}%`;
			hpBarFillRight.style.backgroundColor = 'crimson';
			hpBarFillRight.style.borderRadius = '3px 0 0 3px';
		} else {
			// No change
			hpBarFillLeft.style.width = `${((this.character.current_hp + dyingLength) / barLength) * 100}%`;
			hpBarFillLeft.style.backgroundColor = 'limegreen';
			hpBarFillRight.style.width = `0%`;
			hpBarFillRight.style.backgroundColor = 'deepskyblue';
		}
	}

	private updateHpDisplay(hpValueDisplay: HTMLInputElement, currentHp: number, maxHp: number, currentTempHp: number) {
		const newHpValue = currentHp + this.pendingHpChange;
		hpValueDisplay.value = newHpValue.toString();
	}

	private updateActionButton(actionButton: HTMLElement) {
		const hpChange = this.pendingHpChange;
		const tempHpChange = this.pendingTempHpChange;
		let actionText = '';

		if (hpChange < 0) {
			actionText += `Lose ${Math.abs(hpChange)} Stamina`;
		} else if (hpChange > 0) {
			actionText += `Gain ${hpChange} Stamina`;
		}

		if (tempHpChange !== 0) {
			if (actionText !== '') {
				actionText += ' and ';
			}
			if (tempHpChange > 0) {
				actionText += `Gain ${tempHpChange} Temp Stamina`;
			} else {
				actionText += `Lose ${Math.abs(tempHpChange)} Temp Stamina`;
			}
		}

		if (actionText === '') {
			actionText = 'No Stamina Change';
		}

		actionButton.textContent = actionText;

		// Disable the button if no change
		actionButton.toggleClass('disabled', hpChange === 0 && tempHpChange === 0);
	}
}
