import {MarkdownPostProcessorContext, Plugin} from "obsidian";

export class HeaderView {
    private plugin: Plugin;
    private titleLeft: string;
    private titleRight: string;
    private infoLeft: string;
    private infoRight: string;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, ctx: MarkdownPostProcessorContext,
                titleLeft: string, titleRight: string, infoLeft: string, infoRight: string) {
        this.plugin = plugin;
        this.titleLeft = titleLeft;
        this.titleRight = titleRight;
        this.infoLeft = infoLeft;
        this.infoRight = infoRight;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const headerContainer = parent.createEl("div", {cls: "ds-header-container"});

        const firstLine = headerContainer.createEl("div", {cls: "ds-header-title-line"});
        firstLine.createEl("div", {cls: "ds-header-title-left", text: this.titleLeft});
        firstLine.createEl("div", {cls: "ds-header-title-right", text: this.titleRight});

        const secondLine = headerContainer.createEl("div", {cls: "ds-header-subtitle-line"});
        secondLine.createEl("div", {cls: "ds-sb-header-left", text: this.infoLeft});
        secondLine.createEl("div", {cls: "ds-sb-header-right", text: this.infoRight});
    }
}
