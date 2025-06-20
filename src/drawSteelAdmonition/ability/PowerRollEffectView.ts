import { Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin } from "obsidian";
import { PowerRollEffect } from "steel-compendium-sdk";

export class PowerRollEffectView {
    private plugin: Plugin;
    private data: PowerRollEffect;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: PowerRollEffect, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const container = parent.createEl("div", { cls: "ds-pr-effect-container" });
        if (this.data.roll) {
            const typeContainer = container.createEl("div", { cls: "ability-detail-line pr-roll-line" });
            this.renderMD(this.ctx, this.data.roll, typeContainer.createEl("span", { cls: "ability-roll-value ds-multiline" }));
        }

        if (this.data.t1) {
            const t1Container = container.createEl("div", { cls: "ability-detail-line pr-tier-line pr-tier-1-line" });
            PowerRollEffectView.tier1Key(t1Container);
            this.renderMD(this.ctx, this.data.t1, t1Container.createEl("span", { cls: "pr-tier-value pr-tier-1-value ds-multiline" }));
        }

        if (this.data.t2) {
            const t2Container = container.createEl("div", { cls: "ability-detail-line pr-tier-line pr-tier-2-line" });
            PowerRollEffectView.tier2Key(t2Container);
            this.renderMD(this.ctx, this.data.t2, t2Container.createEl("span", { cls: "pr-tier-value pr-tier-2-value ds-multiline" }));
        }

        if (this.data.t3) {
            const t3Container = container.createEl("div", { cls: "ability-detail-line pr-tier-line pr-tier-3-line" });
            PowerRollEffectView.tier3Key(t3Container);
            this.renderMD(this.ctx, this.data.t3, t3Container.createEl("span", { cls: "pr-tier-value pr-tier-3-value ds-multiline" }));
        }

        if (this.data.crit) {
            const critContainer = container.createEl("div", { cls: "ability-detail-line pr-tier-line pr-crit-line" });
            PowerRollEffectView.critKey(critContainer);
            this.renderMD(this.ctx, this.data.crit, critContainer.createEl("span", { cls: "pr-tier-value pr-crit-value ds-multiline" }));
        }
    }

    // TODO - this doesnt belong here?
    private renderMD(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
        el.addClass("ability-inline-p");
        MarkdownRenderer.render(this.plugin.app, markdown, el, ctx.sourcePath, this.plugin as Component);
    }

    public static tier1Key(parentElement: HTMLElement) {
        const container = parentElement.createEl("div", { cls: "tier-key-container t1-key-container" });
        const body = container.createEl('div', { cls: "t1-key-body" });
        body.createEl('div', { cls: "t1-key-body-text", text: "≤11" });
    }

    public static tier2Key(parentElement: HTMLElement) {
        const container = parentElement.createEl("div", { cls: "tier-key-container t2-key-container" });
        const body = container.createEl('div', { cls: "t2-key-body" });
        body.createEl('div', { cls: "t2-key-body-text", text: "12-16" });
    }

    public static tier3Key(parentElement: HTMLElement) {
        const container = parentElement.createEl("div", { cls: "tier-key-container t3-key-container" });
        const body = container.createEl('div', { cls: "t3-key-body" });
        body.createEl('div', { cls: "t3-key-body-text", text: "17+" });
    }

    public static critKey(parentElement: HTMLElement) {
        const container = parentElement.createEl("div", { cls: "tier-key-container crit-key-container" });
        const body = container.createEl('div', { cls: "crit-key-body" });
        body.createEl('div', { cls: "crit-key-body-text", text: "crit" });
    }
}
