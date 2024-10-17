import {Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin} from "obsidian";
import {Ability} from "../../model/Ability";

export class AbilityView {
    private plugin: Plugin;
    private data: Ability;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: Ability, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const container = parent.createEl("div", {cls: "ds-ability-container"});

        if (this.data.indent) {
            container.addClass("indent-" + this.data.indent);
        }

        const typeContainer = container.createEl("div", {cls: "pr-name-line"});
        if (this.data.name) {
            this.renderMD(this.ctx, this.data.name, typeContainer.createEl("span", {cls: "ability-name-value ds-multiline"}));
        }

        if (this.data.cost) {
            this.renderMD(this.ctx, " (" + String(this.data.cost).trim() + ")", typeContainer.createEl("span", {cls: "ability-cost-value"}));
        }

        if (this.data.flavor) {
            const flavorContainer = container.createEl("div", {cls: "ability-detail-line pr-flavor-line"});
            this.renderMD(this.ctx, this.data.flavor, flavorContainer.createEl("span", {cls: "ability-flavor-value ds-multiline"}));
        }

        if (this.data.keywords || this.data.type) {
            const row1 = container.createEl("div", {cls: "ability-detail-table-row"});
            const keywordCell = row1.createEl("div", {cls: "ability-detail-table-cell pr-keyword-cell"});
            if (this.data.keywords) {
                keywordCell.createEl("span", {cls: "ability-detail-key pr-keyword-key", text: "Keywords: "});
                const keywordsText = this.data.keywords.length > 0 ? this.data.keywords.join(", ") : "";
                this.renderMD(this.ctx, keywordsText, keywordCell.createEl("span", {cls: "pr-detail-value pr-keyword-value ds-multiline"}));
            }
            const typeCell = row1.createEl("div", {cls: "ability-detail-table-cell pr-type-cell"});
            if (this.data.type) {
                typeCell.createEl("span", {cls: "ability-detail-key pr-type-key", text: "Type: "});
                this.renderMD(this.ctx, this.data.type, typeCell.createEl("span", {cls: "pr-detail-value pr-type-value ds-multiline"}));
            }
        }

        if (this.data.distance || this.data.target) {
            const row2 = container.createEl("div", {cls: "ability-detail-table-row"});
            const distanceCell = row2.createEl("div", {cls: "ability-detail-table-cell pr-distance-cell"});
            if (this.data.distance) {
                distanceCell.createEl("span", {cls: "ability-detail-key pr-distance-key", text: "Distance: "});
                this.renderMD(this.ctx, this.data.distance, distanceCell.createEl("span", {cls: "pr-detail-value pr-distance-value ds-multiline"}));
            }
            const targetCell = row2.createEl("div", {cls: "ability-detail-table-cell pr-target-cell"});
            if (this.data.target) {
                targetCell.createEl("span", {cls: "ability-detail-key pr-target-key", text: "Target: "});
                this.renderMD(this.ctx, this.data.target, targetCell.createEl("span", {cls: "pr-detail-value pr-target-value ds-multiline"}));
            }
        }

        if (this.data.trigger) {
            const triggerContainer = container.createEl("div", {cls: "ability-detail-line pr-trigger-line"});
            triggerContainer.createEl("span", {cls: "ability-detail-key pr-trigger-key", text: "Trigger: "});
            this.renderMD(this.ctx, this.data.trigger, triggerContainer.createEl("span", {cls: "pr-detail-value pr-trigger-value ds-multiline"}));
        }


        const effectsContainer = container.createEl("div", {cls: "ds-effects-container"});
        if (this.data.effects) {
            for (let effect of this.data.effects) {
                effect.asView(effectsContainer, this.plugin, this.ctx);
            }
        }
    }

    // This will parse a string and render it as markdown
    private renderMD(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
        el.addClass("ability-inline-p");
        MarkdownRenderer.render(this.plugin.app, markdown, el, ctx.sourcePath, this.plugin as Component);
    }
}
