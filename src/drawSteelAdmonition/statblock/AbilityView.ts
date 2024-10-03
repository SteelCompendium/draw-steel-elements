import {App} from "obsidian";
import {Ability} from "../../model/StatblockData";

export class AbilityView {
    private app: App;
    private ability: Ability;

    constructor(app: App, ability: Ability) {
        this.app = app;
        this.ability = ability;
    }

    public build(container: HTMLElement) {
        const abilityEl = container.createEl("div", { cls: "ds-sb-ability" });

        // Ability Title: "name ◆ cost"
        const titleLine = abilityEl.createEl("div", { cls: "ds-sb-ability-title" });
        const nameText = this.ability.name ?? "Unnamed Ability";
        const costText = this.ability.cost ? `⬩ ${this.ability.cost}` : "";
        titleLine.createEl("span", { text: `${nameText} ${costText}` });

        // Keyword-Type Line
        const keywordTypeLine = abilityEl.createEl("div", { cls: "ds-sb-ability-table-line" });
        const keywordsText = this.ability.keywords && this.ability.keywords.length > 0 ? `Keywords: ${this.ability.keywords.join(", ")}` : "";
        const typeText = this.ability.type ? `Type: ${this.ability.type}` : "";
        keywordTypeLine.createEl("div", {cls: "ds-sb-ability-table-cell", text: keywordsText});
        keywordTypeLine.createEl("div", {cls: "ds-sb-ability-table-cell", text: typeText});

        // Distance-Target Line
        const distanceTargetLine = abilityEl.createEl("div", { cls: "ds-sb-ability-table-line" });
        const distanceText = this.ability.distance ? `Distance ${this.ability.distance}` : "";
        const targetText = this.ability.target ? `Target ${this.ability.target}` : "";
        distanceTargetLine.createEl("div", {cls: "ds-sb-ability-table-cell", text: distanceText});
        distanceTargetLine.createEl("div", {cls: "ds-sb-ability-table-cell", text: targetText});

        // Power Roll Container
        const powerRollContainer = abilityEl.createEl("div", { cls: "ds-sb-ability-power-roll" });
        // TODO - power roll

        // Effect Line
        if (this.ability.effect) {
            const effectEl = abilityEl.createEl("div", { cls: "ds-sb-ability-effect" });
            effectEl.createEl("span", { text: `Effect ${this.ability.effect}` });
        }

        // Additional Effects
        if (this.ability.additionalEffects && this.ability.additionalEffects.length > 0) {
            this.ability.additionalEffects.forEach(addEffect => {
                const additionalEffectEl = abilityEl.createEl("div", { cls: "ds-sb-ability-additional-effect" });
                additionalEffectEl.createEl("span", { text: `${addEffect.cost} ${addEffect.effect}` });
            });
        }
    }
}
