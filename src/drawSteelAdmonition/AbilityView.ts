import {Component, MarkdownPostProcessorContext, MarkdownRenderer, Plugin} from "obsidian";
import {Ability} from "../model/Ability";

export class AbilityView {
    private plugin: Plugin;
    private data: Ability;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: Ability, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const container = parent.createEl("div", {cls: "ds-ability-container"});

        if (this.data.indent) {
            container.addClass("indent-" + this.data.indent);
        }

        const typeContainer = container.createEl("div", {cls: "pr-name-line"});
        if (this.data.name) {
            this.renderMD(this.ctx, this.data.name, typeContainer.createEl("span", {cls: "pr-name-value ds-multiline"}));
        }

        if (this.data.cost) {
            this.renderMD(this.ctx, " (" + String(this.data.cost).trim() + ")", typeContainer.createEl("span", {cls: "pr-cost-value"}));
        }

        if (this.data.flavor) {
            const flavorContainer = container.createEl("div", {cls: "pr-detail-line pr-flavor-line"});
            this.renderMD(this.ctx, this.data.flavor, flavorContainer.createEl("span", {cls: "pr-flavor-value ds-multiline"}));
        }

        if (this.data.keywords || this.data.type) {
            const row1 = container.createEl("div", {cls: "pr-detail-table-row"});
            const keywordCell = row1.createEl("div", {cls: "pr-detail-table-cell pr-keyword-cell"});
            if (this.data.keywords) {
                keywordCell.createEl("span", {cls: "pr-detail-key pr-keyword-key", text: "Keywords: "});
                const keywordsText = this.data.keywords.length > 0 ? this.data.keywords.join(", ") : "";
                this.renderMD(this.ctx, keywordsText, keywordCell.createEl("span", {cls: "pr-detail-value pr-keyword-value ds-multiline"}));
            }
            const typeCell = row1.createEl("div", {cls: "pr-detail-table-cell pr-type-cell"});
            if (this.data.type) {
                typeCell.createEl("span", {cls: "pr-detail-key pr-type-key", text: "Type: "});
                this.renderMD(this.ctx, this.data.type, typeCell.createEl("span", {cls: "pr-detail-value pr-type-value ds-multiline"}));
            }
        }

        if (this.data.distance || this.data.target) {
            const row2 = container.createEl("div", {cls: "pr-detail-table-row"});
            const distanceCell = row2.createEl("div", {cls: "pr-detail-table-cell pr-distance-cell"});
            if (this.data.distance) {
                distanceCell.createEl("span", {cls: "pr-detail-key pr-distance-key", text: "Distance: "});
                this.renderMD(this.ctx, this.data.distance, distanceCell.createEl("span", {cls: "pr-detail-value pr-distance-value ds-multiline"}));
            }
            const targetCell = row2.createEl("div", {cls: "pr-detail-table-cell pr-target-cell"});
            if (this.data.target) {
                targetCell.createEl("span", {cls: "pr-detail-key pr-target-key", text: "Target: "});
                this.renderMD(this.ctx, this.data.target, targetCell.createEl("span", {cls: "pr-detail-value pr-target-value ds-multiline"}));
            }
        }

        if (this.data.trigger) {
            const triggerContainer = container.createEl("div", {cls: "pr-detail-line pr-trigger-line"});
            triggerContainer.createEl("span", {cls: "pr-detail-key pr-trigger-key", text: "Trigger: "});
            this.renderMD(this.ctx, this.data.trigger, triggerContainer.createEl("span", {cls: "pr-detail-value pr-trigger-value ds-multiline"}));
        }

        if (this.data.roll) {
            const typeContainer = container.createEl("div", {cls: "pr-detail-line pr-roll-line"});
            this.renderMD(this.ctx, this.data.roll, typeContainer.createEl("span", {cls: "pr-roll-value ds-multiline"}));
        }

        if (this.data.t1) {
            const t1Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-1-line"});
            AbilityView.tier1Key(t1Container);
            this.renderMD(this.ctx, this.data.t1, t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value ds-multiline"}));
        }

        if (this.data.t2) {
            const t2Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-2-line"});
            AbilityView.tier2Key(t2Container);
            this.renderMD(this.ctx, this.data.t2, t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value ds-multiline"}));
        }

        if (this.data.t3) {
            const t3Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-3-line"});
            AbilityView.tier3Key(t3Container);
            this.renderMD(this.ctx, this.data.t3, t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value ds-multiline"}));
        }

        if (this.data.crit) {
            const critContainer = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-crit-line"});
            AbilityView.critKey(critContainer);
            this.renderMD(this.ctx, this.data.crit, critContainer.createEl("span", {cls: "pr-tier-value pr-crit-value ds-multiline"}));
        }

        if (this.data.effect) {
            const effectContainer = container.createEl("div", {cls: "pr-detail-line pr-effect-line"});
            effectContainer.createEl("span", {cls: "pr-detail-key pr-effect-key", text: "Effect: "});
            this.renderMD(this.ctx, this.data.effect, effectContainer.createEl("span", {cls: "pr-detail-value pr-effect-value ds-multiline"}));
        }

        if (this.data.fields && this.data.fields.length > 0) {
            const fieldsContainer = container.createEl("div", {cls: "pr-fields-container"});
            this.data.fields.forEach(field => {
                const fieldLine = fieldsContainer.createEl("div", {cls: "pr-field-line"});
                fieldLine.createEl("span", {cls: "pr-field-key", text: field.name.trim() + ": "});
                this.renderMD(this.ctx, field.value, fieldLine.createEl("span", {cls: "pr-field-value ds-multiline"}));
            });
        }

        if (this.data.spend) {
            const spendLine = container.createEl("div", {cls: "pr-detail-line pr-spend-line"});
            spendLine.createEl("span", {cls: "pr-detail-key pr-spend-key", text: "Spend " + this.data.spend.cost.trim() + ": "});
            this.renderMD(this.ctx, this.data.spend.value, spendLine.createEl("span", {cls: "pr-detail-value pr-spend-value ds-multiline"}));
        }

        if (this.data.persistent) {
            const persistentLine = container.createEl("div", {cls: "pr-detail-line pr-persistent-line"});
            persistentLine.createEl("span", {cls: "pr-detail-key pr-persistent-key", text: "Persistent " + this.data.persistent.cost.trim() + ": "});
            this.renderMD(this.ctx, this.data.persistent.value, persistentLine.createEl("span", {cls: "pr-detail-value pr-persistent-value ds-multiline"}));
        }

        if (this.data.notes) {
            if (Array.isArray(this.data.notes)) {
                const notesContainer = container.createEl("ul", {cls: "pr-note-list"});
                this.data.notes.forEach(note => this.renderMD(this.ctx, note, notesContainer.createEl("li", {cls: "pr-note-item"})));
            } else {
                const noteContainer = container.createEl("div", {cls: "pr-detail-line pr-note-line"});
                this.renderMD(this.ctx, this.data.notes, noteContainer.createEl("span", {cls: "pr-note ds-multiline"}));
            }
        }
    }

    // This will parse a string and render it as markdown
    private renderMD(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
        el.addClass("ds-pr-inline-p");
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
