import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import {AbilityView} from "../AbilityView";
import {Ability} from "../../model/Ability";

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

        // TODO - Do I need to handle villain powers differently?
        // const abilities = abilities.filter(ability => !ability.type?.startsWith("Villain Action"));

        this.abilities.forEach((ability: Ability) => {
            new AbilityView(this.plugin, ability, this.ctx).build(abilitiesContainer);
        });
    }
}
