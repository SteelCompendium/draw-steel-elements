import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { FeatureblockConfig } from "@model/FeatureblockConfig";
import { FeatureblockView } from "@drawSteelAdmonition/featureblock/FeatureblockView";

export class FeatureblockProcessor {
	private plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl('div', { cls: "ds-fb-container ds-container" });
		try {
			const data = FeatureblockConfig.readYaml(source);
			new FeatureblockView(this.plugin, data, ctx).build(container);
		} catch (error) {
			// Display error message to the user
			let userMessage =
				"The Draw Steel Elements plugin loaded the Featureblock Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", { text: userMessage, cls: "error-message ds-container" });
		}
	}
}