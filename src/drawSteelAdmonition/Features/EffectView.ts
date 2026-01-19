import { Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin } from "obsidian";
import { Effect } from "steel-compendium-sdk";
import {FeatureConfig} from "@model/FeatureConfig";
import {FeaturesView} from "@drawSteelAdmonition/Features/FeaturesView";

export class EffectView {
    private plugin: Plugin;
    private data: Effect;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: Effect, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        // TODO - rename ds-pr
        const container = parent.createEl("div", { cls: "ds-effect-container" });

        if (this.data.name || this.data.cost) {
            const cost = this.data.cost ? " (" + this.data.cost?.toString().trim() + ")" : "";
            let title = this.data.name ? this.data.name + cost : cost;
            title = title ? title + ": " : "";
            container.createEl("span", { cls: "ds-feature-detail-key ds-pr-effect-key", text: title });
        }

        if (this.data.effect) {
            this.renderMD(this.ctx, this.data.effect, container.createEl("span", { cls: "ds-pr-detail-value ds-pr-effect-value ds-multiline" }));
        }

        if (this.data.roll) {
            const typeContainer = container.createEl("div", { cls: "ds-feature-detail-line ds-pr-roll-line" });
            this.renderMD(this.ctx, this.data.roll, typeContainer.createEl("span", { cls: "ds-feature-roll-value ds-multiline" }));
        }

        if (this.data.tier1) {
            const t1Container = container.createEl("div", { cls: "ds-feature-detail-line ds-pr-tier-line ds-pr-tier-1-line" });
            EffectView.tier1Key(t1Container);
            this.renderMD(this.ctx, this.data.tier1, t1Container.createEl("span", { cls: "ds-pr-tier-value ds-pr-tier-1-value ds-multiline" }));
        }

        if (this.data.tier2) {
            const t2Container = container.createEl("div", { cls: "ds-feature-detail-line ds-pr-tier-line ds-pr-tier-2-line" });
            EffectView.tier2Key(t2Container);
            this.renderMD(this.ctx, this.data.tier2, t2Container.createEl("span", { cls: "ds-pr-tier-value ds-pr-tier-2-value ds-multiline" }));
        }

        if (this.data.tier3) {
            const t3Container = container.createEl("div", { cls: "ds-feature-detail-line ds-pr-tier-line ds-pr-tier-3-line" });
            EffectView.tier3Key(t3Container);
            this.renderMD(this.ctx, this.data.tier3, t3Container.createEl("span", { cls: "ds-pr-tier-value ds-pr-tier-3-value ds-multiline" }));
        }

        if (this.data.crit) {
            const critContainer = container.createEl("div", { cls: "ds-feature-detail-line ds-pr-tier-line ds-pr-crit-line" });
            EffectView.critKey(critContainer);
            this.renderMD(this.ctx, this.data.crit, critContainer.createEl("span", { cls: "ds-pr-tier-value ds-pr-crit-value ds-multiline" }));
        }

        if (this.data.features && this.data.features.length > 0) {
            const featureConfigs = this.data.features.map(f => new FeatureConfig(f));
            new FeaturesView(this.plugin, featureConfigs, this.ctx).build(container)
        }
    }

    // TODO - this doesnt belong here?
    private renderMD(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
        el.addClass("ds-feature-inline-p");
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
