import {Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin} from "obsidian";
import {FeatureblockConfig} from "@model/FeatureblockConfig";
import {FeatureConfig} from "@model/FeatureConfig";
import {FeaturesView} from "@drawSteelAdmonition/Features/FeaturesView";
import {HorizontalRuleProcessor} from "@drawSteelAdmonition/Common/horizontalRuleProcessor";

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

        let title = this.data.featureblock.name;
        const meta: string[] = [];
        if (this.data.featureblock.level !== undefined) meta.push(`Level ${this.data.featureblock.level}`);
        if (this.data.featureblock.featureblock_type) meta.push(this.data.featureblock.featureblock_type);

        if (meta.length > 0) {
            title += ` (${meta.join(" ")})`;
        }

        header.createEl("div", {text: title, cls: "ds-fb-title"});
    }

    private renderFlavor(parent: HTMLElement) {
        if (this.data.featureblock.flavor) {
            const flavorEl = parent.createEl("div", {cls: "ds-fb-flavor"});
            MarkdownRenderer.render(this.plugin.app, this.data.featureblock.flavor, flavorEl, this.ctx.sourcePath, this.plugin as Component);
        }
    }

    private renderStats(parent: HTMLElement) {
        const stats = [];
        if (this.data.featureblock.ev) stats.push({name: "EV", value: this.data.featureblock.ev});
        if (this.data.featureblock.stamina) stats.push({name: "Stamina", value: this.data.featureblock.stamina});
        if (this.data.featureblock.size) stats.push({name: "Size", value: this.data.featureblock.size});

        if (this.data.featureblock.stats) {
            this.data.featureblock.stats.forEach(s => stats.push(s));
        }

        if (stats.length > 0) {
            const statsContainer = parent.createEl("ul", {cls: "ds-fb-stats"});
            stats.forEach(stat => {
                const li = statsContainer.createEl("li");
                const strong = li.createEl("strong", {text: stat.name + ":"});
                li.appendChild(document.createTextNode(" " + stat.value));
            });
        }
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
