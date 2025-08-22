import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { StatblockConfig } from "@model/StatblockConfig";
import { HeaderView } from "@drawSteelAdmonition/statblock/HeaderView";
import { StatsView } from "@drawSteelAdmonition/statblock/StatsView";
import { AbilitiesView } from "@drawSteelAdmonition/statblock/AbilitiesView";
import { TraitsView } from "@drawSteelAdmonition/statblock/TraitsView";
import { HorizontalRuleProcessor } from "@drawSteelAdmonition/horizontalRuleProcessor";
import { AbilityConfig } from "src/model/AbilityConfig";
import { Ability } from "steel-compendium-sdk";

export class StatblockProcessor {
	private plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl('div', { cls: "ds-sb-container ds-container" });
		try {
			const data = StatblockConfig.readYaml(source);
			this.buildUI(container, data, ctx);
		} catch (error) {
			// Display error message to the user
			let userMessage =
				"The Draw Steel Elements plugin loaded the Statblock Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", { text: userMessage, cls: "error-message ds-container" });
		}
	}

	private buildUI(container: HTMLElement, data: StatblockConfig, ctx: MarkdownPostProcessorContext): void {
		new HeaderView(this.plugin, data, ctx).build(container);
		new StatsView(this.plugin, data, ctx).build(container);

		if (data.statblock.traits.length > 0) {
			HorizontalRuleProcessor.build(container);
			new TraitsView(this.plugin, data, ctx).build(container);
		}

		const abilities: Ability[] = [];
		const villainPowers: Ability[] = [];
		data.statblock.abilities.forEach(a => {
			!a.type?.startsWith("Villain Action") ? abilities.push(a) : villainPowers.push(a);
		})

		if (abilities.length > 0) {
			HorizontalRuleProcessor.build(container);
			new AbilitiesView(this.plugin, AbilityConfig.allFrom(abilities), ctx).build(container);
		}

		if (villainPowers.length > 0) {
			HorizontalRuleProcessor.build(container);
			new AbilitiesView(this.plugin, AbilityConfig.allFrom(villainPowers), ctx).build(container);
		}
	}
}

