import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {StatblockConfig} from "@model/StatblockConfig";
import {BoldKeyWithValueView} from "@drawSteelAdmonition/Common/BoldKeyWithValueView";

export class FeatureblockStatsView {
    private plugin: Plugin;
    private data: FeatureblockConfig;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: StatblockConfig, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const statsContainer = parent.createEl("div", {cls: "ds-fb-stats"});

        if (this.data.featureblock.stamina || this.data.featureblock.size) {
            const line = statsContainer.createEl("div", {cls: "ds-fb-stats-row"});
            if (this.data.featureblock.stamina) {
                new BoldKeyWithValueView(this.plugin, "Stamina", this.data.featureblock.stamina, this.ctx)
                    .buildWithClasses(line, "ds-fb-stats-left");
            }
            if (this.data.featureblock.size) {
                new BoldKeyWithValueView(this.plugin, "Size", this.data.featureblock.size, this.ctx)
                    .buildWithClasses(line, "ds-fb-stats-right");
            }
        }

        if (!this.data.featureblock.stats || this.data.featureblock.stats.length === 0) {
            return;
        }

        let line;
        for (let i = 0; i < this.data.featureblock.stats.length; i++) {
            const kv = new BoldKeyWithValueView(this.plugin, this.data.featureblock.stats[i].name, this.data.featureblock.stats[i].value, this.ctx);
            // Every even stat should make a new line
            if (i % 2 == 0) {
                line = statsContainer.createEl("div", {cls: "ds-fb-stats-row"});
                kv.buildWithClasses(line, "ds-fb-stats-left");
            } else {
                kv.buildWithClasses(line, "ds-fb-stats-right");
            }
        }
    }
}
