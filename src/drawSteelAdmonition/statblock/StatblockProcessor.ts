import { App, MarkdownPostProcessorContext, setIcon, Menu, Notice } from "obsidian";
import { StatblockData, parseStatblockData } from "../../model/StatblockData";
import { HeaderView } from "./HeaderView";
import { StatsView } from "./StatsView";
import { AbilitiesView } from "./AbilitiesView";
import { TraitsView } from "./TraitsView";

export class StatblockProcessor {
    private app: App;
    private data: StatblockData;
    private ctx: MarkdownPostProcessorContext;

    constructor(app: App) {
        this.app = app;
    }

    public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
        this.ctx = ctx;
        this.data = parseStatblockData(source);

        const container = el.createEl('div', { cls: "ds-sb-container" });

        // Build the views
        new HeaderView(this.app, this.data, this.ctx).build(container);
        new StatsView(this.app, this.data, this.ctx).build(container);
        new TraitsView(this.app, this.data, this.ctx).build(container);
        new AbilitiesView(this.app, this.data, this.ctx).build(container);
    }
}
