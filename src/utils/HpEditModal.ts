import {App, Modal, MarkdownPostProcessorContext, setIcon} from "obsidian";

export class HpEditModal extends Modal {
	private character: Hero | CreatureInstance;
	private creature?: Creature; // For CreatureInstance
	private data: EncounterData;
	private ctx: MarkdownPostProcessorContext;
	private updateCallback: () => void;

	// New properties for pending HP change
	private pendingHpChange: number = 0;

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
		contentEl.createEl('h2', { text: `Edit Stamina for ${name}` });

		// Adjust maxHp and negativeHpLimit based on character type
		const maxHp = this.isHero(this.character)
			? this.character.max_hp
			: this.creature?.max_hp ?? 0;
		const currentHp = this.character.current_hp ?? maxHp;
		const negativeHpLimit = this.isHero(this.character)
			? -0.5 * maxHp
			: 0; // Enemies cannot have negative HP

		// First Row: HP Bar
		const hpBarContainer = contentEl.createEl('div', { cls: 'hp-bar-container' });
		const hpBar = hpBarContainer.createEl('div', { cls: 'hp-bar' });
		const hpBarFillLeft = hpBar.createEl('div', { cls: 'hp-bar-fill-left' });
		const hpBarFillRight = hpBar.createEl('div', { cls: 'hp-bar-fill-right' });

		// Update the HP bar display
		this.updateHpBar(hpBarFillLeft, hpBarFillRight, currentHp, maxHp);

		// Second Row: Numeric HP Display with Increment/Decrement Buttons
		const hpNumericContainer = contentEl.createEl('div', { cls: 'hp-numeric-container' });

		// Decrement Button
		const decrementButton = hpNumericContainer.createEl('div', { text: '-', cls: 'hp-adjust-btn' });
		setIcon(decrementButton, "minus-circle")
		decrementButton.addEventListener('click', () => {
			this.pendingHpChange -= 1;
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp);
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, currentHp + this.pendingHpChange, maxHp);
			this.updateActionButton(actionButton);
		});

		// HP Value Display (Editable)
		const hpValueDisplay = hpNumericContainer.createEl('input', {
			type: 'number',
			cls: 'hp-value-display',
		}) as HTMLInputElement;
		hpValueDisplay.value = (currentHp + this.pendingHpChange).toString();
		hpValueDisplay.addEventListener('input', () => {
			const newHpValue = parseInt(hpValueDisplay.value);
			if (!isNaN(newHpValue)) {
				this.pendingHpChange = newHpValue - currentHp;
				this.updateHpBar(hpBarFillLeft, hpBarFillRight, currentHp + this.pendingHpChange, maxHp);
				this.updateActionButton(actionButton);
			}
		});

		// Display Max HP
		const maxHpDisplay = hpNumericContainer.createEl('span', { text: `/ ${maxHp}`, cls: 'max-hp-display' });

		// Increment Button
		const incrementButton = hpNumericContainer.createEl('div', { text: '+', cls: 'hp-adjust-btn' });
		setIcon(incrementButton, "plus-circle")
		incrementButton.addEventListener('click', () => {
			this.pendingHpChange += 1;
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp);
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, currentHp + this.pendingHpChange, maxHp);
			this.updateActionButton(actionButton);
		});

		// Third Row: Apply Damage/Healing with Input
		const modifierContainer = contentEl.createEl('div', { cls: 'modifier-container' });

		const applyContainer = modifierContainer.createEl('div', { cls: 'apply-container' });
		applyContainer.createEl('span', { text: 'Apply' });

		const applyInput = applyContainer.createEl('input', {
			type: 'number',
			cls: 'apply-input',
		}) as HTMLInputElement;
		applyInput.value = '0';

		const damageButton = applyContainer.createEl('button', { text: 'Damage', cls: 'apply-btn' });
		damageButton.addEventListener('click', () => {
			const adjustment = parseInt(applyInput.value);
			if (!isNaN(adjustment)) {
				this.pendingHpChange -= adjustment;
				this.updateHpDisplay(hpValueDisplay, currentHp, maxHp);
				this.updateHpBar(hpBarFillLeft, hpBarFillRight, currentHp + this.pendingHpChange, maxHp);
				this.updateActionButton(actionButton);
			}
		});

		const healingButton = applyContainer.createEl('button', { text: 'Healing', cls: 'apply-btn' });
		healingButton.addEventListener('click', () => {
			const adjustment = parseInt(applyInput.value);
			if (!isNaN(adjustment)) {
				this.pendingHpChange += adjustment;
				this.updateHpDisplay(hpValueDisplay, currentHp, maxHp);
				this.updateHpBar(hpBarFillLeft, hpBarFillRight, currentHp + this.pendingHpChange, maxHp);
				this.updateActionButton(actionButton);
			}
		});

		const tempStaminaButton = applyContainer.createEl('button', { text: 'Temp Stamina', cls: 'apply-btn' });

		modifierContainer.createEl('div', { cls: 'vertical-divider', text: ' '});

		const quickModContainer = modifierContainer.createEl('div', { cls: 'quick-mod-container' });
		const killButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn', text: 'Kill'});
		killButton.addEventListener('click', () => {
			this.pendingHpChange = currentHp * -1;
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp);
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, 0, maxHp);
			this.updateActionButton(actionButton);
		});

		const fullHealButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn', text: 'Full Heal'});
		fullHealButton.addEventListener('click', () => {
			this.pendingHpChange = maxHp - currentHp;
			this.updateHpDisplay(hpValueDisplay, currentHp, maxHp);
			this.updateHpBar(hpBarFillLeft, hpBarFillRight, maxHp, maxHp);
			this.updateActionButton(actionButton);
		});

		const recoveryButton = quickModContainer.createEl('button', { cls: 'quick-mod-btn', text: 'Spend Recovery' });
		recoveryButton.addEventListener('click', () => {
			const adjustment = Math.min(Math.floor(maxHp / 3), maxHp);
			if (!isNaN(adjustment)) {
				this.pendingHpChange += adjustment;
				this.updateHpDisplay(hpValueDisplay, currentHp, maxHp);
				this.updateHpBar(hpBarFillLeft, hpBarFillRight, currentHp + this.pendingHpChange, maxHp);
				this.updateActionButton(actionButton);
			}
		});

		// Bottom: Action Button
		const actionButtonContainer = contentEl.createEl('div', { cls: 'action-button-container' });
		const actionButton = actionButtonContainer.createEl('button', { cls: 'action-button' });
		this.updateActionButton(actionButton);

		actionButton.addEventListener('click', () => {
			const newCurrentHp = this.clampHp(currentHp + this.pendingHpChange, negativeHpLimit, maxHp);
			this.character.current_hp = newCurrentHp;

			this.updateCallback();
			this.close();
		});
	}

	private isHero(character: Hero | CreatureInstance): character is Hero {
		return character.isHero;
	}

	private clampHp(hp: number, negativeHpLimit: number, maxPossibleHp: number): number {
		hp = Math.min(hp, maxPossibleHp); // Cannot exceed max HP
		hp = Math.max(hp, negativeHpLimit); // Cannot go below negative HP limit
		return hp;
	}

	private updateHpBar(hpBarFillLeft: HTMLElement, hpBarFillRight: HTMLElement, hpValue: number, maxHp: number) {
		if (this.pendingHpChange > 0) {
			// Healing
			hpBarFillLeft.style.width = `${(this.character.current_hp / maxHp) * 100}%`;
			hpBarFillLeft.style.backgroundColor = 'limegreen';
			hpBarFillRight.style.width = `${(this.pendingHpChange / maxHp) * 100}%`;
			hpBarFillRight.style.backgroundColor = 'deepskyblue';
		} else if (this.pendingHpChange < 0) {
			// Damage
			// TODO - negative stamina
			hpBarFillLeft.style.width = `${( (this.character.current_hp + this.pendingHpChange) / maxHp) * 100}%`;
			hpBarFillLeft.style.backgroundColor = 'limegreen';
			hpBarFillRight.style.width = `${(this.pendingHpChange / maxHp) * -100}%`;
			hpBarFillRight.style.backgroundColor = 'red';
		} else {
			// No change
			hpBarFillLeft.style.width = `${(this.character.current_hp / maxHp) * 100}%`;
			hpBarFillLeft.style.backgroundColor = 'limegreen';
			hpBarFillRight.style.width = `0%`;
			hpBarFillRight.style.backgroundColor = 'deepskyblue';
		}
	}

	private updateHpDisplay(hpValueDisplay: HTMLInputElement, currentHp: number, maxHp: number) {
		const newHpValue = currentHp + this.pendingHpChange;
		hpValueDisplay.value = newHpValue.toString();
	}

	private updateActionButton(actionButton: HTMLElement) {
		const change = this.pendingHpChange;

		if (change < 0) {
			actionButton.textContent = `Lose ${Math.abs(change)} Stamina`;
		} else if (change > 0) {
			actionButton.textContent = `Gain ${change} Stamina`;
		} else {
			actionButton.textContent = `No Stamina Change`;
		}

		// Disable the button if no change
		actionButton.toggleClass('disabled', change === 0);
	}
}
