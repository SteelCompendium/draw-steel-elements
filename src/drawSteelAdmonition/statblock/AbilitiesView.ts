import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { StatblockData, Ability } from "../../model/StatblockData";
import { AbilityView } from "./AbilityView";

export class AbilitiesView {
    private plugin: Plugin;
    private data: StatblockData;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: StatblockData, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(container: HTMLElement) {
        if (!this.data.abilities || this.data.abilities.length === 0) {
            return;
        }

        const abilitiesContainer = container.createEl("div", { cls: "ds-sb-abilities" });

        // TODO - Do I need to handle villain powers differently?
        // const abilities = this.data.abilities.filter(ability => !ability.type?.startsWith("Villain Action"));

        this.data.abilities.forEach((ability: Ability) => {
            new AbilityView(this.plugin, ability).build(abilitiesContainer);
        });
    }
}
