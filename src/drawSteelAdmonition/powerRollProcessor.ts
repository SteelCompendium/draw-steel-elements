import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {AbilityView} from "./AbilityView";
import {Ability} from "../model/Ability";

export class PowerRollProcessor {
	plugin: Plugin;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl("div", { cls: "pr-container ds-container" });
		new AbilityView(this.plugin, Ability.parse(source), ctx).build(container);
	}
}
