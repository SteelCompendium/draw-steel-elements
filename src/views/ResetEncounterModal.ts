import { App, Modal } from 'obsidian';

export class ResetEncounterModal extends Modal {
	private onConfirm: () => void;

	constructor(app: App, onConfirm: () => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Confirm Encounter Reset' });

		contentEl.createEl('p', { text: 'Are you sure you want to reset the encounter data?  ' +
				'All state will be lost including current stamina, conditions, turn tracker, and villain power.' });

		const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });

		const confirmButton = buttonContainer.createEl('button', { text: 'Yes, Reset', cls: 'mod-warning' });
		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });

		confirmButton.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});

		cancelButton.addEventListener('click', () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
