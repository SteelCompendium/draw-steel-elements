import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {AbilityView} from "./AbilityView";
import {Abilityv2} from "../model/Abilityv2";

export class PowerRollProcessor {
	plugin: Plugin;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl("div", { cls: "pr-container ds-container" });
		new AbilityView(this.plugin, Abilityv2.parse(source), ctx).build(container);
	}
}
