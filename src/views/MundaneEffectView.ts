import {Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin} from "obsidian";
import {MundaneEffect, PowerRollEffect} from "../model/Effect";

export class MundaneEffectView {
    private plugin: Plugin;
    private data: MundaneEffect;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: MundaneEffect, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const container = parent.createEl("div", {cls: "ds-effect-container"});
        const text = "Spend " + this.data.cost.trim() + ": ";
        container.createEl("span", {cls: "pr-detail-key pr-effect-key", text: text});
        this.renderMD(this.ctx, this.data.value, container.createEl("span", {cls: "pr-detail-value pr-effect-value ds-multiline"}));
    }

    // TODO - this doesnt belong here?
    private renderMD(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
        el.addClass("ds-pr-inline-p");
        MarkdownRenderer.render(this.plugin.app, markdown, el, ctx.sourcePath, this.plugin as Component);
    }
}
