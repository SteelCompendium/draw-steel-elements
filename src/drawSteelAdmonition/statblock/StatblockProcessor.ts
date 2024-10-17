import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {StatblockData, parseStatblockData} from "../../model/StatblockData";
import {HeaderView} from "./HeaderView";
import {StatsView} from "./StatsView";
import {AbilitiesView} from "./AbilitiesView";
import {TraitsView} from "./TraitsView";
import {HorizontalRuleProcessor} from "../horizontalRuleProcessor";

export class StatblockProcessor {
    private plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl('div', {cls: "ds-sb-container ds-container"});
		try {
			const data = parseStatblockData(source);
			this.buildUI(container, data, ctx);
		} catch (error) {
			// Display error message to the user
			let userMessage =
				"The Draw Steel Elements plugin loaded the Statblock Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", {text: userMessage, cls: "error-message ds-container"});
		}
	}

	private buildUI(container: HTMLElement, data: StatblockData, ctx: MarkdownPostProcessorContext): void {
        new HeaderView(this.plugin, data, ctx).build(container);
        new StatsView(this.plugin, data, ctx).build(container);

		if (data.traits.length > 0) {
			HorizontalRuleProcessor.build(container);
			new TraitsView(this.plugin, data, ctx).build(container);
		}

        let abilities = [];
        let villainPowers = [];
        data.abilities.forEach(a => {
            !a.type?.startsWith("Villain Action") ? abilities.push(a) : villainPowers.push(a);
        })

		if (abilities.length > 0) {
			HorizontalRuleProcessor.build(container);
			new AbilitiesView(this.plugin, abilities, ctx).build(container);
		}

		if (villainPowers.length > 0) {
			HorizontalRuleProcessor.build(container);
			new AbilitiesView(this.plugin, villainPowers, ctx).build(container);
		}
    }
}

