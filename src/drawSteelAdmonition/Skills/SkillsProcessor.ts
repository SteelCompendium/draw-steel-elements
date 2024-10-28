import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {SkillsView} from "./SkillsView";
import {Skills} from "../../model/Skills";

export class SkillsProcessor {
	plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl("div", { cls: "ds-skills-ele-container" });
		try {
			new SkillsView(this.plugin, Skills.parseYaml(source), ctx).build(container);
		} catch (error) {
			let userMessage =
				"The Draw Steel Elements plugin loaded the Skills Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", {text: userMessage, cls: "error-message"});
		}
	}
}
