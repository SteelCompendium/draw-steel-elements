import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {StatblockData, parseStatblockData} from "../../model/StatblockData";
import {HeaderView} from "./HeaderView";
import {StatsView} from "./StatsView";
import {AbilitiesView} from "./AbilitiesView";
import {TraitsView} from "./TraitsView";

export class StatblockProcessor {
    private plugin: Plugin;
    private data: StatblockData;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
        this.ctx = ctx;
        this.data = parseStatblockData(source);

        const container = el.createEl('div', {cls: "ds-sb-container"});

        // Build the views
        new HeaderView(this.plugin, this.data, this.ctx).build(container);
        new StatsView(this.plugin, this.data, this.ctx).build(container);
        new TraitsView(this.plugin, this.data, this.ctx).build(container);
        new AbilitiesView(this.plugin, this.data, this.ctx).build(container);
    }
}
