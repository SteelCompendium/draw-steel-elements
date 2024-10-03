import {App, Plugin, MarkdownPostProcessorContext} from "obsidian";
import {parseAbilityData} from "../model/Ability";
import {AbilityView} from "./AbilityView";

export class PowerRollProcessor {
	plugin: Plugin;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl("div", { cls: "pr-container" });
		new AbilityView(this.plugin, parseAbilityData(source), ctx).build(container);
	}
}
