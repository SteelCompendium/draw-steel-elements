import {App, MarkdownPostProcessorContext, Modal, setIcon, stringifyYaml, TFile} from 'obsidian';
import {ConditionManager} from "./Conditions";

export class ConditionSelectModal extends Modal {
	private conditionManager: ConditionManager;
	private character: Hero | CreatureInstance;
	private data: EncounterData;
	private ctx: MarkdownPostProcessorContext;
	private callback: () => void;

	constructor(
		app: App,
		conditionManager: ConditionManager,
		character: Hero | CreatureInstance,
		data: EncounterData,
		ctx: MarkdownPostProcessorContext,
		callback: () => void
	) {
		super(app);
		this.conditionManager = conditionManager;
		this.character = character;
		this.data = data;
		this.ctx = ctx;
		this.callback = callback;
	}

	onOpen() {
		const {contentEl} = this;

		contentEl.createEl('h2', {text: 'Add Condition'});

		const conditions = this.conditionManager.getConditions();

		conditions.forEach(condition => {
			// Skip conditions the character already has
			if (this.character.conditions?.includes(condition.key)) {
				return;
			}

			const conditionEl = contentEl.createEl('div', {cls: 'condition-select-item'});

			const iconEl = conditionEl.createEl('div', {cls: 'condition-icon'});
			setIcon(iconEl, condition.iconName);
			iconEl.title = condition.displayName;

			const nameEl = conditionEl.createEl('span', {text: condition.displayName});

			conditionEl.addEventListener('click', () => {
				// Add the condition
				if (!this.character.conditions) {
					this.character.conditions = [];
				}
				this.character.conditions.push(condition.key);
				// Close the modal
				this.close();
				// Call the callback to update the UI
				this.callback();
				// Update codeblock
				this.updateCodeBlock();
			});
		});
	}

	private async updateCodeBlock() {
		const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const section = this.ctx.getSectionInfo(this.ctx.el);
		if (!section) return;

		const {lineStart, lineEnd} = section;

		// Reconstruct the code block with the updated data
		const newCodeBlockContent = [];
		newCodeBlockContent.push('```' + "ds-initiative");
		newCodeBlockContent.push(stringifyYaml(this.data).trim());
		newCodeBlockContent.push('```');

		// Replace the old code block with the new one
		lines.splice(lineStart, lineEnd - lineStart + 1, ...newCodeBlockContent);

		const newContent = lines.join('\n');

		// Write the updated content back to the file
		await this.app.vault.modify(file, newContent);
	}
}
