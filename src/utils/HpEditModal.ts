import { App, Modal, MarkdownPostProcessorContext } from "obsidian";

export class HpEditModal extends Modal {
	private character: Hero | Creature;
	private data: EncounterData;
	private ctx: MarkdownPostProcessorContext;
	private updateCallback: () => void;

	constructor(
		app: App,
		character: Hero | Creature,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		updateCallback: () => void
	) {
		super(app);
		this.character = character;
		this.data = data;
		this.ctx = ctx;
		this.updateCallback = updateCallback;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();

		// Character Info
		contentEl.createEl('h2', { text: `Edit HP for ${this.character.name}` });

		const maxHp = this.character.max_hp;
		const negativeHpLimit = this.isHero(this.character)
			? -0.5 * maxHp
			: 0; // Enemies cannot have negative HP

		// Current HP Input
		const currentHpContainer = contentEl.createEl('div', { cls: 'hp-input-container' });
		currentHpContainer.createEl('label', { text: 'Current HP:' });
		const currentHpInput = currentHpContainer.createEl('input', {
			attr: { type: 'number', step: '1' },
			cls: 'hp-input',
		});
		currentHpInput.value = (this.character.current_hp ?? maxHp).toString();

		// Temp HP Input (Heroes Only)
		let tempHpInput: HTMLInputElement | null = null;
		if (this.isHero(this.character)) {
			const tempHpContainer = contentEl.createEl('div', { cls: 'hp-input-container' });
			tempHpContainer.createEl('label', { text: 'Temp HP:' });
			tempHpInput = tempHpContainer.createEl('input', {
				attr: { type: 'number', step: '1', min: '0' },
				cls: 'hp-input',
			});
			tempHpInput.value = (this.character.temp_hp ?? 0).toString();
		}

		// Adjustment Input
		const adjustContainer = contentEl.createEl('div', { cls: 'hp-adjust-container' });
		adjustContainer.createEl('label', { text: 'Adjustment Amount:' });
		const adjustInput = adjustContainer.createEl('input', {
			attr: { type: 'number', step: '1' },
			cls: 'hp-adjust-input',
		});
		adjustInput.value = '0';

		const adjustButtonsContainer = contentEl.createEl('div', { cls: 'hp-adjust-buttons' });
		const damageButton = adjustButtonsContainer.createEl('button', { text: 'Damage', cls: 'hp-adjust-btn' });
		const healButton = adjustButtonsContainer.createEl('button', { text: 'Heal', cls: 'hp-adjust-btn' });

		damageButton.addEventListener('click', () => {
			const adjustment = parseInt(adjustInput.value);
			if (!isNaN(adjustment)) {
				this.adjustHp(-adjustment, negativeHpLimit);
				currentHpInput.value = this.character.current_hp!.toString();
			}
		});

		healButton.addEventListener('click', () => {
			const adjustment = parseInt(adjustInput.value);
			if (!isNaN(adjustment)) {
				this.adjustHp(adjustment, negativeHpLimit);
				currentHpInput.value = this.character.current_hp!.toString();
			}
		});

		// Save and Cancel Buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
		const saveButton = buttonContainer.createEl('button', { text: 'Save', cls: 'modal-save-btn' });
		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel', cls: 'modal-cancel-btn' });

		saveButton.addEventListener('click', () => {
			let newCurrentHp = parseInt(currentHpInput.value);
			if (isNaN(newCurrentHp)) newCurrentHp = this.character.current_hp ?? maxHp;
			newCurrentHp = this.clampHp(newCurrentHp, negativeHpLimit);
			this.character.current_hp = newCurrentHp;

			if (tempHpInput) {
				let newTempHp = parseInt(tempHpInput.value);
				if (isNaN(newTempHp) || newTempHp < 0) newTempHp = 0;
				this.character.temp_hp = newTempHp;
			}

			this.updateCallback();
			this.close();
		});

		cancelButton.addEventListener('click', () => {
			this.close();
		});
	}

	private isHero(character: Hero | Creature): character is Hero {
		return 'temp_hp' in character;
	}

	private adjustHp(amount: number, negativeHpLimit: number) {
		let newHp = (this.character.current_hp ?? this.character.max_hp) + amount;
		newHp = this.clampHp(newHp, negativeHpLimit);
		this.character.current_hp = newHp;
	}

	private clampHp(hp: number, negativeHpLimit: number): number {
		const maxPossibleHp = this.character.max_hp + (this.character.temp_hp ?? 0);
		hp = Math.min(hp, maxPossibleHp); // Cannot exceed max HP plus temp HP
		hp = Math.max(hp, negativeHpLimit); // Cannot go below negative HP limit
		return hp;
	}
}
