import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { StatblockConfig } from "@model/StatblockConfig";
import { HeaderView } from "@drawSteelAdmonition/Common/HeaderView";
import { StatsView } from "@drawSteelAdmonition/statblock/StatsView";
import { FeaturesView } from "@drawSteelAdmonition/Features/FeaturesView";
import { HorizontalRuleProcessor } from "@drawSteelAdmonition/Common/horizontalRuleProcessor";
import { FeatureConfig } from "@model/FeatureConfig";

export class StatblockProcessor {
	private plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl('div', { cls: "ds-sb-container ds-container" });
		try {
			const data = StatblockConfig.readYaml(source);
			this.buildUI(container, data, ctx);
		} catch (error) {
			// Display error message to the user
			let userMessage =
				"The Draw Steel Elements plugin loaded the Statblock Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", { text: userMessage, cls: "error-message ds-container" });
		}
	}

	private buildUI(container: HTMLElement, data: StatblockConfig, ctx: MarkdownPostProcessorContext): void {
        const level = data.statblock.level !== undefined ? `Level ${data.statblock.level}` : "Level N/A";
        const roles = data.statblock.roles?.join(", ") ?? "No Role";
        new HeaderView(this.plugin,
            ctx,
            data.statblock.name ?? "Unnamed Creature",
            `${level} ${roles}`,
            data.statblock.ancestry?.join(", ") ?? "Unknown Ancestry",
            data.statblock.ev !== undefined ? `EV ${data.statblock.ev}` : "EV N/A"
            ).build(container);

		new StatsView(this.plugin, data, ctx).build(container);
        if (data.statblock.features?.length > 0) {
            HorizontalRuleProcessor.build(container);
            const featureConfigs = data.statblock.features.map(f => new FeatureConfig(f));
            new FeaturesView(this.plugin, featureConfigs, ctx).build(container)
        }
	}
}

