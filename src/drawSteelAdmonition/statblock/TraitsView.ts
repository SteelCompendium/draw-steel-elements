// TraitsView.ts

import { App, MarkdownPostProcessorContext } from "obsidian";
import { StatblockData, Trait } from "../../model/StatblockData";

export class TraitsView {
    private app: App;
    private data: StatblockData;
    private ctx: MarkdownPostProcessorContext;

    constructor(app: App, data: StatblockData, ctx: MarkdownPostProcessorContext) {
        this.app = app;
        this.data = data;
        this.ctx = ctx;
    }

    public build(container: HTMLElement) {
        if (!this.data.traits || this.data.traits.length === 0) {
            return;
        }

        const traitsContainer = container.createEl("div", { cls: "ds-sb-traits" });

        this.data.traits.forEach((trait: Trait) => {
            const traitEl = traitsContainer.createEl("div", { cls: "ds-sb-trait" });

            // Title Line: "name (type)"
            const titleText = trait.type ? `${trait.name} (${trait.type})` : trait.name;
            traitEl.createEl("div", { cls: "ds-sb-trait-title", text: titleText });

            // Effect Line
            traitEl.createEl("div", { cls: "ds-sb-trait-effect", text: trait.effect });
        });
    }
}
