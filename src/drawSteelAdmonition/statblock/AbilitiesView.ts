import { App, MarkdownPostProcessorContext } from "obsidian";
import { StatblockData, Ability } from "../../model/StatblockData";
import { AbilityView } from "./AbilityView";

export class AbilitiesView {
    private app: App;
    private data: StatblockData;
    private ctx: MarkdownPostProcessorContext;

    constructor(app: App, data: StatblockData, ctx: MarkdownPostProcessorContext) {
        this.app = app;
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
            new AbilityView(this.app, ability).build(abilitiesContainer);
        });
    }
}
