import {Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin} from "obsidian";
import {FeatureblockConfig} from "@model/FeatureblockConfig";
import {FeatureConfig} from "@model/FeatureConfig";
import {FeaturesView} from "@drawSteelAdmonition/Features/FeaturesView";
import {HorizontalRuleProcessor} from "@drawSteelAdmonition/Common/horizontalRuleProcessor";
import {HeaderView} from "@drawSteelAdmonition/Common/HeaderView";
import {FeatureblockStatsView} from "@drawSteelAdmonition/featureblock/FeatureblockStatsView";

export class FeatureblockView {
    private plugin: Plugin;
    private data: FeatureblockConfig;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: FeatureblockConfig, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        this.renderHeader(parent);
        this.renderFlavor(parent);
        this.renderStats(parent);
        this.renderFeatures(parent);
    }

    private renderHeader(parent: HTMLElement) {
        const header = parent.createEl("div", {cls: "ds-fb-header"});

        const level = this.data.featureblock.level !== undefined ? `Level ${this.data.featureblock.level}` : "";
        const type = this.data.featureblock.featureblock_type ?? "";
        new HeaderView(this.plugin,
            this.ctx,
            this.data.featureblock.name ?? "Unnamed Featureblock",
            `${level} ${type}`,
            "",
            this.data.featureblock.ev !== undefined ? `EV ${this.data.featureblock.ev}` : ""
        ).build(header);
    }

    private renderFlavor(parent: HTMLElement) {
        if (this.data.featureblock.flavor) {
            const flavorEl = parent.createEl("div", {cls: "ds-fb-flavor"});
            MarkdownRenderer.render(this.plugin.app, this.data.featureblock.flavor, flavorEl, this.ctx.sourcePath, this.plugin as Component);
        }
    }

    private renderStats(parent: HTMLElement) {
        new FeatureblockStatsView(this.plugin, this.data, this.ctx).build(parent);
    }

    private renderFeatures(parent: HTMLElement) {
        if (this.data.featureblock.features && this.data.featureblock.features.length > 0) {
            HorizontalRuleProcessor.build(parent);
            const featuresContainer = parent.createEl("div", {cls: "ds-fb-features"});
            featuresContainer.addClass("ds-features");
            const featureConfigs = this.data.featureblock.features.map(f => new FeatureConfig(f));
            new FeaturesView(this.plugin, featureConfigs, this.ctx).build(featuresContainer);
        }
    }
}
