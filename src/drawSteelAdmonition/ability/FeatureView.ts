import {Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin} from "obsidian";
import {FeatureConfig} from "@model/FeatureConfig";
import {EffectView} from "@drawSteelAdmonition/ability/EffectView";

export class FeatureView {
    private plugin: Plugin;
    private data: FeatureConfig;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: FeatureConfig, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const container = parent.createEl("div", {cls: "ds-feature-container"});

        if (this.data.indent) {
            container.addClass("indent-" + this.data.indent);
        }

        const headerContainer = container.createEl("div", {cls: "ds-feature-header-line"});
        const nameCostContainer = headerContainer.createEl("div", {cls: "ds-feature-name-line"});
        if (this.data.feature.name) {
            this.renderMD(this.ctx, this.data.feature.name, nameCostContainer.createEl("span", {cls: "ds-feature-name-value ds-multiline"}));
        }

        if (this.data.feature.cost) {
            this.renderMD(this.ctx, " (" + String(this.data.feature.cost).trim() + ")", nameCostContainer.createEl("span", {cls: "ds-feature-cost-value"}));
        }

        if (this.data.feature.ability_type) {
            this.renderMD(this.ctx, this.data.feature.ability_type.trim(), headerContainer.createEl("span", {cls: "ds-feature-ability-type"}));
        }

        if (this.data.feature.flavor) {
            const flavorContainer = container.createEl("div", {cls: "ds-feature-detail-line pr-flavor-line"});
            this.renderMD(this.ctx, this.data.feature.flavor, flavorContainer.createEl("span", {cls: "ds-feature-flavor-value ds-multiline"}));
        }

        if (this.data.feature.keywords || this.data.feature.usage) {
            const row1 = container.createEl("div", {cls: "ds-feature-detail-table-row"});
            const keywordCell = row1.createEl("div", {cls: "ds-feature-detail-table-cell pr-keyword-cell"});
            if (this.data.feature.keywords) {
                keywordCell.createEl("span", {cls: "ds-feature-detail-key pr-keyword-key"});
                const keywordsText = this.data.feature.keywords.length > 0 ? this.data.feature.keywords.join(", ") : "";
                this.renderMD(this.ctx, keywordsText, keywordCell.createEl("span", {cls: "pr-detail-value pr-keyword-value ds-multiline"}));
            }
            const typeCell = row1.createEl("div", {cls: "ds-feature-detail-table-cell pr-type-cell"});
            if (this.data.feature.usage) {
                typeCell.createEl("span", {cls: "ds-feature-detail-key pr-type-key"});
                this.renderMD(this.ctx, this.data.feature.usage, typeCell.createEl("span", {cls: "pr-detail-value pr-type-value ds-multiline"}));
            }
        }

        if (this.data.feature.distance || this.data.feature.target) {
            const row2 = container.createEl("div", {cls: "ds-feature-detail-table-row"});
            const distanceCell = row2.createEl("div", {cls: "ds-feature-detail-table-cell ds-feature-distance-cell"});
            if (this.data.feature.distance) {
                distanceCell.createEl("span", {cls: "ds-feature-detail-key ds-feature-distance-key"});
                this.renderMD(this.ctx, this.data.feature.distance, distanceCell.createEl("span", {cls: "pr-detail-value ds-feature-distance-value ds-multiline"}));
            }
            const targetCell = row2.createEl("div", {cls: "ds-feature-detail-table-cell ds-feature-target-cell"});
            if (this.data.feature.target) {
                targetCell.createEl("span", {cls: "ds-feature-detail-key ds-feature-target-key"});
                this.renderMD(this.ctx, this.data.feature.target, targetCell.createEl("span", {cls: "pr-detail-value ds-feature-target-value ds-multiline"}));
            }
        }

        if (this.data.feature.trigger) {
            const triggerContainer = container.createEl("div", {cls: "ds-feature-detail-line pr-trigger-line"});
            triggerContainer.createEl("span", {cls: "ds-feature-detail-key pr-trigger-key", text: "Trigger: "});
            this.renderMD(this.ctx, this.data.feature.trigger, triggerContainer.createEl("span", {cls: "pr-detail-value pr-trigger-value ds-multiline"}));
        }

        // TODO - extract this out since its reused in multiple places
        const effectsContainer = container.createEl("div", {cls: "ds-effects-container"});
        if (this.data.feature.effects) {
            for (const effect of this.data.feature.effects) {
                new EffectView(this.plugin, effect, this.ctx).build(effectsContainer);
            }
        }
    }

    // This will parse a string and render it as markdown
    private renderMD(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
        el.addClass("ds-feature-inline-p");
        if (markdown === "-") {
            MarkdownRenderer.render(this.plugin.app, "--", el, ctx.sourcePath, this.plugin as Component);
        } else {
            MarkdownRenderer.render(this.plugin.app, markdown, el, ctx.sourcePath, this.plugin as Component);
        }
    }
}
