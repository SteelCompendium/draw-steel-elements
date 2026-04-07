import { MarkdownPostProcessorContext, Plugin } from "obsidian";

export abstract class AbstractElementView {
    protected plugin: Plugin;
    protected data: any;
    protected ctx: MarkdownPostProcessorContext;
    protected options?: any

    constructor(plugin: Plugin, data: any, ctx: MarkdownPostProcessorContext, options?: any) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
        this.options = options;
    }

    public abstract build(parent: HTMLElement, children?: Array<HTMLElement>, options?: any): HTMLElement | Promise<HTMLElement>;
}
