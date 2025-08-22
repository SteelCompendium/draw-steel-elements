import { App, Modal, setIcon } from 'obsidian';
import { Condition, CreatureInstance, Hero } from "@drawSteelAdmonition/EncounterData";
import { ConditionManager, ConditionConfig } from "@utils/Conditions";
import { CustomizeConditionModal } from "@views/CustomizeConditionModal";

export class AddConditionsModal extends Modal {
	private character: Hero | CreatureInstance;
	private conditionManager: ConditionManager;
	private onAdd: (conditions: Condition[]) => void;
	private selectedConditions: Map<string, Condition>;

	constructor(
		app: App,
		character: Hero | CreatureInstance,
		conditionManager: ConditionManager,
		onAdd: (conditions: Condition[]) => void
	) {
		super(app);
		this.character = character;
		this.conditionManager = conditionManager;
		this.onAdd = onAdd;
		this.selectedConditions = new Map();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const modalContainer = contentEl.createEl('div', { cls: 'add-condition-modal' });

		modalContainer.createEl('h2', { text: 'Add Conditions' });

		const conditionsList = modalContainer.createEl('div', { cls: 'conditions-list' });

		// Add standard conditions
		this.conditionManager.getConditions().forEach(condition => {
			this.addConditionToModal(conditionsList, condition);
		});

		// Divider between conditions and pseudo-conditions
		const divider = conditionsList.createEl('div', { cls: 'horizontal-divider' });

		// Add pseudo-conditions
		this.conditionManager.getPseudoConditions().forEach(condition => {
			this.addConditionToModal(conditionsList, condition);
		});

		// Modal action buttons
		const buttonsContainer = modalContainer.createEl('div', { cls: 'modal-buttons' });
		const cancelButton = buttonsContainer.createEl('button', { text: 'Cancel' });
		const addButton = buttonsContainer.createEl('button', { text: 'Add Conditions' });

		cancelButton.addEventListener('click', () => {
			this.close();
		});

		addButton.addEventListener('click', () => {
			this.onAdd(Array.from(this.selectedConditions.values()));
			this.close();
		});
	}

	private addConditionToModal(conditionsList: HTMLElement, condition: ConditionConfig) {
		const conditionEl = conditionsList.createEl('div', { cls: 'condition-item' });

		// Icon preview
		const iconEl = conditionEl.createEl('div', { cls: 'condition-icon-preview' });
		setIcon(iconEl, condition.iconName);

		// Label for the condition name
		const label = conditionEl.createEl('div', { cls: 'condition-label', text: condition.displayName });

		// Customize icon (cog), hidden by default, shown on hover
		const customizeIconEl = conditionEl.createEl('div', { cls: 'condition-customize-icon' });
		setIcon(customizeIconEl, 'cog');
		customizeIconEl.title = 'Customize Condition';

		// Hide customize icon initially
		customizeIconEl.style.display = 'none';

		// Show the customize icon on hover
		conditionEl.addEventListener('mouseenter', () => {
			customizeIconEl.style.display = '';
		});
		conditionEl.addEventListener('mouseleave', () => {
			customizeIconEl.style.display = 'none';
		});

		// Click handler for customize icon
		customizeIconEl.addEventListener('click', (event) => {
			event.stopPropagation(); // Prevent the click from toggling selection
			this.openCustomizeConditionModal(condition.key, iconEl, condition);
		});

		// Click handler for selecting/deselecting the condition
		conditionEl.addEventListener('click', () => {
			if (this.selectedConditions.has(condition.key)) {
				// Deselect condition
				this.selectedConditions.delete(condition.key);
				conditionEl.classList.remove('selected');
			} else {
				// Select condition
				const conditionData: Condition = { key: condition.key };
				this.selectedConditions.set(condition.key, conditionData);
				conditionEl.classList.add('selected');
			}
		});

		// Double-click handler for opening customization modal
		conditionEl.addEventListener('dblclick', (event) => {
			event.stopPropagation(); // Prevent the click from toggling selection again
			this.openCustomizeConditionModal(condition.key, iconEl, condition);
		});

		// Append elements to conditionEl
		conditionEl.appendChild(iconEl);
		conditionEl.appendChild(label);
		conditionEl.appendChild(customizeIconEl);
	}

	// Updates the icon preview with customizations
	private updateIconPreview(iconEl: HTMLElement, conditionConfig: ConditionConfig, conditionData: Condition) {
		// Reset icon classes and set the icon
		iconEl.className = 'condition-icon-preview';
		setIcon(iconEl, conditionConfig.iconName);

		// Apply color customization
		if (conditionData.color) {
			iconEl.style.color = conditionData.color;
		} else {
			iconEl.style.color = '';
		}

		// Remove existing effect classes
		iconEl.classList.remove(
			'condition-effect-blink',
			'condition-effect-glow',
			'condition-effect-glow-pulse',
			'condition-effect-breathing',
			'condition-effect-blur-pulse'
		);

		// Apply effect customization
		if (conditionData.effect && conditionData.effect !== 'static') {
			iconEl.classList.add(`condition-effect-${conditionData.effect}`);
		}
	}

	// Opens the customize condition modal and updates the icon preview upon changes
	private openCustomizeConditionModal(conditionKey: string, iconEl: HTMLElement, conditionConfig: ConditionConfig) {
		let conditionData = this.selectedConditions.get(conditionKey);
		if (!conditionData) {
			// If condition is not selected yet, create default condition data and select it
			conditionData = { key: conditionKey };
			this.selectedConditions.set(conditionKey, conditionData);
			// Also mark the condition as selected
			const conditionEl = iconEl.parentElement;
			if (conditionEl) {
				conditionEl.classList.add('selected');
			}
		}

		const customizeModal = new CustomizeConditionModal(
			this.app,
			conditionData,
			conditionConfig,
			updatedCondition => {
				this.selectedConditions.set(conditionKey, updatedCondition);
				this.updateIconPreview(iconEl, conditionConfig, updatedCondition);
			}
		);
		customizeModal.open();
	}
}
