import {MarkdownPostProcessorContext, Plugin} from "obsidian";

export class BoldKeyWithValueView {
    private plugin: Plugin;
    private key: string;
    private value: string;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, key: string, value: string, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.key = key;
        this.value = value;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        return this.buildWithClasses(parent, "");
    }

    public buildWithClasses(parent: HTMLElement, classNames: string) {
        const container = parent.createEl("div", {cls: `ds-bkv-container ${classNames}`});
        container.createEl("span", {cls: "ds-bkv-key", text: `${this.key}: `});
        container.createEl("span", {cls: "ds-bkv-value", text: this.value});
    }
}
