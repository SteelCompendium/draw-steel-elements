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
		new AbilityView(this.plugin, Ability.parse(source), ctx).build(container);
	}
}
