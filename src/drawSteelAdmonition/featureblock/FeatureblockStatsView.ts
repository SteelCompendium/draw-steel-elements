import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {FeatureblockConfig} from "@model/FeatureblockConfig";
import {BoldKeyWithValueView} from "@drawSteelAdmonition/Common/BoldKeyWithValueView";

export class FeatureblockStatsView {
    private plugin: Plugin;
    private data: FeatureblockConfig;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: FeatureblockConfig, ctx: MarkdownPostProcessorContext) {
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

        let line: HTMLDivElement | undefined;
        for (let i = 0; i < this.data.featureblock.stats.length; i++) {
            const kv = new BoldKeyWithValueView(this.plugin, this.data.featureblock.stats[i].name, this.data.featureblock.stats[i].value, this.ctx);
            // Every even stat should make a new line
            if (i % 2 == 0) {
                line = statsContainer.createEl("div", {cls: "ds-fb-stats-row"});
                kv.buildWithClasses(line, "ds-fb-stats-left");
            } else {
                // `line` is always set here: i is odd only after an i-1 (even) iteration ran above.
                kv.buildWithClasses(line!, "ds-fb-stats-right");
            }
        }
    }
}
