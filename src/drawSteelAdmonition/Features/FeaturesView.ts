import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { FeatureView } from "@drawSteelAdmonition/Features/FeatureView";
import { FeatureConfig } from "@model/FeatureConfig";

export class FeaturesView {
    private plugin: Plugin;
    private features: FeatureConfig[];
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, abilities: FeatureConfig[], ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.features = abilities;
        this.ctx = ctx;
    }

    public build(container: HTMLElement) {
        if (!this.features || this.features.length === 0) {
            return;
        }

        const featuresContainer = container.createEl("div", { cls: "ds-sb-features" });
        featuresContainer.addClass("ds-features");
        this.features.forEach((feature: FeatureConfig) => {
            new FeatureView(this.plugin, feature, this.ctx).build(featuresContainer);
        });
    }
}
