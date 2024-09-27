import {App, MarkdownPostProcessorContext, Modal, setIcon} from 'obsidian';
import {Condition, ConditionManager} from "./Conditions";
import {CodeBlocks} from "./CodeBlocks";
import {CreatureInstance, EncounterData, Hero} from "../drawSteelAdmonition/EncounterData";

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
        const conditionSelectContainer = contentEl.createEl('div', {cls: 'condition-select-container'});
        conditionSelectContainer.createEl('h2', {text: 'Add Condition'});

        this.addConditions(this.conditionManager.getConditions(), conditionSelectContainer);
        conditionSelectContainer.createEl('div', {cls: 'horizontal-divider'});
        this.addConditions(this.conditionManager.getPseudoConditions(), conditionSelectContainer);
    }

    private addConditions(conditions: Condition[], contentEl: HTMLElement) {
        conditions.forEach(condition => {
            // Skip conditions the character already has
            if (this.character.conditions?.includes(condition.key)) {
                return;
            }

            const conditionEl = contentEl.createEl('div', {cls: 'condition-select-item'});

            const iconEl = conditionEl.createEl('div', {cls: 'condition-icon'});
            setIcon(iconEl, condition.iconName);
            iconEl.title = condition.displayName;

            const nameEl = conditionEl.createEl('div', {text: condition.displayName});

            conditionEl.addEventListener('click', () => {
                if (!this.character.conditions) {
                    this.character.conditions = [];
                }
                this.character.conditions.push(condition.key);
                this.close();
                this.callback();
                CodeBlocks.updateCodeBlock(this.app, this.data, this.ctx)
            });
        });
    }
}
