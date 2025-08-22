import {App, Modal, setIcon} from "obsidian";
import {Condition} from "@drawSteelAdmonition/EncounterData";
import {ConditionConfig} from "@utils/Conditions";

export class CustomizeConditionModal extends Modal {
    private conditionData: Condition;
    private conditionConfig: ConditionConfig;
    private onUpdate: (conditionData: Condition) => void;

    constructor(app: App, conditionData: Condition, conditionConfig: ConditionConfig, onUpdate: (conditionData: Condition) => void) {
        super(app);
        this.conditionData = { ...conditionData };
		this.conditionConfig = conditionConfig;
        this.onUpdate = onUpdate;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const modalContainer = contentEl.createEl('div', { cls: 'customize-condition-modal' });

        modalContainer.createEl('h2', { text: 'Customize Condition' });

        const bodyContainer = modalContainer.createEl('div', { cls: 'customize-condition-body' });

        const toolsContainer = bodyContainer.createEl('div', { cls: 'customize-condition-tools' });

        // Color Picker
        const colorPickerContainer = toolsContainer.createEl('div', { cls: 'color-picker-container' });
        colorPickerContainer.createEl('label', { text: 'Color: ' });
        const colorInput = colorPickerContainer.createEl('input', { type: 'color' }) as HTMLInputElement;
        colorInput.value = this.conditionData.color || '#ffffff';

        // Effect Selector
        const effectContainer = toolsContainer.createEl('div', { cls: 'effect-container' });
        effectContainer.createEl('label', { text: 'Effect: ' });
        const effectSelect = effectContainer.createEl('select') as HTMLSelectElement;
        const effects = ['static', 'blink', 'glow', 'glow-pulse', 'breathing', 'blur-pulse'];
        effects.forEach(effect => {
            const option = effectSelect.createEl('option', { text: effect, value: effect });
            if (this.conditionData.effect === effect) option.selected = true;
        });

		// Preview
        const previewContainer = bodyContainer.createEl('div', { cls: 'customize-condition-preview', text: 'asdf' });
        setIcon(previewContainer, this.conditionConfig.iconName);

		effectSelect.addEventListener('change', () => {
			this.conditionData.effect = effectSelect.value;
			this.updateIconPreview(previewContainer, this.conditionData);
		});

		colorInput.addEventListener('change', () => {
			this.conditionData.color = colorInput.value;
			this.updateIconPreview(previewContainer, this.conditionData);
		});

        // Modal action buttons
        const buttonsContainer = modalContainer.createEl('div', { cls: 'modal-buttons' });
        const cancelButton = buttonsContainer.createEl('button', { text: 'Cancel' });
        const saveButton = buttonsContainer.createEl('button', { text: 'Save' });

        cancelButton.addEventListener('click', () => {
            this.close();
        });

        saveButton.addEventListener('click', () => {
            this.conditionData.color = colorInput.value;
            this.conditionData.effect = effectSelect.value;
            this.onUpdate(this.conditionData);
            this.close();
        });
    }

	// TODO - this is duplicated code
	private updateIconPreview(iconEl: HTMLElement, conditionData: Condition) {
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
}
