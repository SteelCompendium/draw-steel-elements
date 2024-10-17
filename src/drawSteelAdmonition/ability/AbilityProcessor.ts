import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {AbilityView} from "./AbilityView";
import {Ability} from "../../model/Ability";

export class AbilityProcessor {
	plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl("div", { cls: "ds-ability-ele-container ds-container" });
		try {
			new AbilityView(this.plugin, Ability.parse(source), ctx).build(container);
		} catch (error) {
			// Display error message to the user
			let userMessage =
				"The Draw Steel Elements plugin loaded the Ability Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", {text: userMessage, cls: "error-message"});
		}
	}
}
