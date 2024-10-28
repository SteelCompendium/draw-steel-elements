import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {CharacteristicsView} from "./CharacteristicsView";
import {Characteristics} from "../../model/Characteristics";

export class CharacteristicsProcessor {
	plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl("div", { cls: "ds-characteristics-ele-container" });
		try {
			new CharacteristicsView(this.plugin, Characteristics.parseYaml(source), ctx).build(container);
		} catch (error) {
			let userMessage =
				"The Draw Steel Elements plugin loaded the Characteristics Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", {text: userMessage, cls: "error-message"});
		}
	}
}
