import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { AbilityView } from "../ability/AbilityView";
import { Ability } from "src/model/Ability";

export class AbilitiesView {
    private plugin: Plugin;
    private abilities: Ability[];
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, abilities: Ability[], ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.abilities = abilities;
        this.ctx = ctx;
    }

    public build(container: HTMLElement) {
        if (!this.abilities || this.abilities.length === 0) {
            return;
        }

        const abilitiesContainer = container.createEl("div", { cls: "ds-sb-abilities" });

        this.abilities.forEach((ability: Ability) => {
            new AbilityView(this.plugin, ability, this.ctx).build(abilitiesContainer);
        });
    }
}
