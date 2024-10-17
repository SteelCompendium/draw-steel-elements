import {Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin} from "obsidian";
import {MundaneEffect} from "../../model/Effect";

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
        const cost = this.data.cost ? " (" + this.data.cost?.trim() + ")" : "";
        let text = this.data.name ? this.data.name + cost : cost;
		text = text ? text + ": " : "";
        container.createEl("span", {cls: "ability-detail-key pr-effect-key", text: text});
        this.renderMD(this.ctx, this.data.effect, container.createEl("span", {cls: "pr-detail-value pr-effect-value ds-multiline"}));
    }

    // TODO - this doesnt belong here?
    private renderMD(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
        el.addClass("ability-ability-inline-p");
        MarkdownRenderer.render(this.plugin.app, markdown, el, ctx.sourcePath, this.plugin as Component);
    }
}
