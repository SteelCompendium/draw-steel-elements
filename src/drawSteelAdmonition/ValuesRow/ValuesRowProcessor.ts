import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {ValuesRowView} from "./ValuesRowView";
import {Characteristics} from "../../model/Characteristics";
import {KeyValuePairs} from "../../model/KeyValuePairs";

export class ValuesRowProcessor {
	plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl("div", { cls: "ds-values-row-ele-container" });
		try {
			new ValuesRowView(this.plugin, KeyValuePairs.parseYaml(source), ctx).build(container);
		} catch (error) {
			let userMessage =
				"The Draw Steel Elements plugin loaded the ValuesRow Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", {text: userMessage, cls: "error-message"});
		}
	}
}
