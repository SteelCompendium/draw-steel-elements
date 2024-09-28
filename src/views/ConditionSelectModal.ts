import {App, Modal, setIcon} from 'obsidian';
import {Condition, CreatureInstance, Hero} from "../drawSteelAdmonition/EncounterData";
import {ConditionManager, ConditionConfig} from "../utils/Conditions";
import {CustomizeConditionModal} from "./CustomizeConditionModal";

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
		const {contentEl} = this;
		contentEl.empty();

		const modalContainer = contentEl.createEl('div', { cls: 'add-condition-modal' });

		modalContainer.createEl('h2', {text: 'Add Conditions'});

		const conditionsList = modalContainer.createEl('div', {cls: 'conditions-list'});

		this.conditionManager.getConditions().forEach(condition => {
			this.addConditionToModal(conditionsList, condition);
		});
		conditionsList.createEl('div', {cls: 'horizontal-divider'});
		this.conditionManager.getPseudoConditions().forEach(condition => {
			this.addConditionToModal(conditionsList, condition);
		});

		// Modal action buttons
		const buttonsContainer = modalContainer.createEl('div', {cls: 'modal-buttons'});
		const cancelButton = buttonsContainer.createEl('button', {text: 'Cancel'});
		const addButton = buttonsContainer.createEl('button', {text: 'Add Conditions'});

		cancelButton.addEventListener('click', () => {
			this.close();
		});

		addButton.addEventListener('click', () => {
			this.onAdd(Array.from(this.selectedConditions.values()));
			this.close();
		});
	}

	private addConditionToModal(conditionsList: any, condition: ConditionConfig) {
		const conditionEl = conditionsList.createEl('div', {cls: 'condition-item'});

		// Checkbox for selecting the condition
		const checkbox = conditionEl.createEl('input', {type: 'checkbox'}) as HTMLInputElement;
		checkbox.id = `condition-${condition.key}`;

		// Icon preview
		const iconEl = conditionEl.createEl('div', {cls: 'condition-icon-preview'});
		setIcon(iconEl, condition.iconName);
		// iconEl.style.display = 'none'; // Hide initially

		// Label for the condition name
		const label = conditionEl.createEl('label', {text: condition.displayName});
		label.htmlFor = checkbox.id;

		// Customize button
		const customizeButton = conditionEl.createEl('button', {text: 'Customize', cls: 'customize-btn'});
		customizeButton.disabled = true;

		// Handle checkbox changes
		checkbox.addEventListener('change', () => {
			if (checkbox.checked) {
				const conditionData: Condition = {key: condition.key};
				this.selectedConditions.set(condition.key, conditionData);
				customizeButton.disabled = false;
				iconEl.style.display = ''; // Show icon
				this.updateIconPreview(iconEl, condition, conditionData);
			} else {
				this.selectedConditions.delete(condition.key);
				customizeButton.disabled = true;
				// iconEl.style.display = 'none'; // Hide icon
			}
		});

		// Open the customize modal when clicked
		customizeButton.addEventListener('click', () => {
			this.openCustomizeConditionModal(condition.key, iconEl, condition);
		});
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
			'condition-effect-glow-pulse',
			'condition-effect-breathing',
			'condition-effect-blur-pulse');

		// Apply effect customization
		if (conditionData.effect && conditionData.effect !== 'static') {
			iconEl.classList.add(`condition-effect-${conditionData.effect}`);
		}
	}

	// Opens the customize condition modal and updates the icon preview upon changes
	private openCustomizeConditionModal(conditionKey: string, iconEl: HTMLElement, conditionConfig: ConditionConfig) {
		const conditionData = this.selectedConditions.get(conditionKey);
		if (!conditionData) return;

		const customizeModal = new CustomizeConditionModal(
			this.app, conditionData,
			conditionConfig,
			updatedCondition => {
				this.selectedConditions.set(conditionKey, updatedCondition);
				this.updateIconPreview(iconEl, conditionConfig, updatedCondition);
			});
		customizeModal.open();
	}
}
