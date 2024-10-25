import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {CounterView} from "./CounterView";
import {Counter} from "../../model/Counter";

export class CounterProcessor {
	plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		console.log(ctx);
		const container = el.createEl("div", { cls: "ds-counter-ele-container" });
		try {
			new CounterView(this.plugin, Counter.parseYaml(source), ctx).build(container);
		} catch (error) {
			// Display error message to the user
			let userMessage =
				"The Draw Steel Elements plugin loaded the Counter Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", {text: userMessage, cls: "error-message"});
		}
	}
}
