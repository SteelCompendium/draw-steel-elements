import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { AbilityView } from "@drawSteelAdmonition/ability/AbilityView";
import { AbilityConfig } from "@model/AbilityConfig";

export class AbilitiesView {
    private plugin: Plugin;
    private abilities: AbilityConfig[];
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, abilities: AbilityConfig[], ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.abilities = abilities;
        this.ctx = ctx;
    }

    public build(container: HTMLElement) {
        if (!this.abilities || this.abilities.length === 0) {
            return;
        }

        const abilitiesContainer = container.createEl("div", { cls: "ds-sb-abilities" });

        this.abilities.forEach((ability: AbilityConfig) => {
            new AbilityView(this.plugin, ability, this.ctx).build(abilitiesContainer);
        });
    }
}
