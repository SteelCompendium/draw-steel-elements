import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import {AbilityView} from "../ability/AbilityView";
import {AbilityOld} from "../../model/AbilityOld";

export class AbilitiesView {
    private plugin: Plugin;
    private abilities: AbilityOld[];
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, abilities: AbilityOld[], ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.abilities = abilities;
        this.ctx = ctx;
    }

    public build(container: HTMLElement) {
        if (!this.abilities || this.abilities.length === 0) {
            return;
        }

        const abilitiesContainer = container.createEl("div", { cls: "ds-sb-abilities" });

        this.abilities.forEach((ability: AbilityOld) => {
            new AbilityView(this.plugin, ability, this.ctx).build(abilitiesContainer);
        });
    }
}
