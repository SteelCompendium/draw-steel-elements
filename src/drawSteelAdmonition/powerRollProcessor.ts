import { App, Component, MarkdownPostProcessorContext, MarkdownRenderer } from "obsidian";
import {parseAbilityData} from "../model/Ability";

export class PowerRollProcessor {
	app: App;
	plugin: Component;

	constructor(app: App, plugin: Component) {
		this.app = app;
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const data = parseAbilityData(source);

		const container = el.createEl("div", { cls: "pr-container" });
		container.addClass("pr-container");

		if (data.indent) {
			container.addClass("indent-" + data.indent);
		}

		const typeContainer = container.createEl("div", { cls: "pr-name-line" });
		if (data.name) {
			this.render(ctx, data.name, typeContainer.createEl("span", { cls: "pr-name-value ds-multiline" }));
		}

		if (data.cost) {
			this.render(ctx, "(" + String(data.cost).trim() + ")", typeContainer.createEl("span", { cls: "pr-cost-value" }));
		}

		if (data.flavor) {
			const flavorContainer = container.createEl("div", { cls: "pr-detail-line pr-flavor-line" });
			this.render(ctx, data.flavor, flavorContainer.createEl("span", { cls: "pr-flavor-value ds-multiline" }));
		}

		if (data.keywords || data.type) {
			const row1 = container.createEl("div", { cls: "pr-detail-table-row" });
			const keywordCell = row1.createEl("div", { cls: "pr-detail-table-cell pr-keyword-cell" });
			if (data.keywords) {
				keywordCell.createEl("span", { cls: "pr-detail-key pr-keyword-key", text: "Keywords: " });
				this.render(ctx, data.keywords, keywordCell.createEl("span", { cls: "pr-detail-value pr-keyword-value ds-multiline" }));
			}
			const typeCell = row1.createEl("div", { cls: "pr-detail-table-cell pr-type-cell" });
			if (data.type) {
				typeCell.createEl("span", { cls: "pr-detail-key pr-type-key", text: "Type: " });
				this.render(ctx, data.type, typeCell.createEl("span", { cls: "pr-detail-value pr-type-value ds-multiline" }));
			}
		}

		if (data.distance || data.target) {
			const row2 = container.createEl("div", { cls: "pr-detail-table-row" });
			const distanceCell = row2.createEl("div", { cls: "pr-detail-table-cell pr-distance-cell" });
			if (data.distance) {
				distanceCell.createEl("span", { cls: "pr-detail-key pr-distance-key", text: "Distance: " });
				this.render(ctx, data.distance, distanceCell.createEl("span", { cls: "pr-detail-value pr-distance-value ds-multiline" }));
			}
			const targetCell = row2.createEl("div", { cls: "pr-detail-table-cell pr-target-cell" });
			if (data.target) {
				targetCell.createEl("span", { cls: "pr-detail-key pr-target-key", text: "Target: " });
				this.render(ctx, data.target, targetCell.createEl("span", { cls: "pr-detail-value pr-target-value ds-multiline" }));
			}
		}

		if (data.trigger) {
			const triggerContainer = container.createEl("div", { cls: "pr-detail-line pr-trigger-line" });
			triggerContainer.createEl("span", { cls: "pr-detail-key pr-trigger-key", text: "Trigger: " });
			this.render(ctx, data.trigger, triggerContainer.createEl("span", { cls: "pr-detail-value pr-trigger-value ds-multiline" }));
		}

		if (data.roll) {
			const typeContainer = container.createEl("div", { cls: "pr-detail-line pr-roll-line" });
			this.render(ctx, data.roll, typeContainer.createEl("span", { cls: "pr-roll-value ds-multiline" }));
		}

		if (data.t1) {
			const t1Container = container.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-1-line" });
			PowerRollProcessor.tier1Key(t1Container);
			this.render(ctx, data.t1, t1Container.createEl("span", { cls: "pr-tier-value pr-tier-1-value ds-multiline" }));
		}

		if (data.t2) {
			const t2Container = container.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-2-line" });
			PowerRollProcessor.tier2Key(t2Container);
			this.render(ctx, data.t2, t2Container.createEl("span", { cls: "pr-tier-value pr-tier-2-value ds-multiline" }));
		}

		if (data.t3) {
			const t3Container = container.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-3-line" });
			PowerRollProcessor.tier3Key(t3Container);
			this.render(ctx, data.t3, t3Container.createEl("span", { cls: "pr-tier-value pr-tier-3-value ds-multiline" }));
		}

		if (data.crit) {
			const critContainer = container.createEl("div", { cls: "pr-detail-line pr-tier-line pr-crit-line" });
			PowerRollProcessor.critKey(critContainer);
			this.render(ctx, data.crit, critContainer.createEl("span", { cls: "pr-tier-value pr-crit-value ds-multiline" }));
		}

		if (data.effect) {
			const effectContainer = container.createEl("div", { cls: "pr-detail-line pr-effect-line" });
			effectContainer.createEl("span", { cls: "pr-detail-key pr-effect-key", text: "Effect: " });
			this.render(ctx, data.effect, effectContainer.createEl("span", { cls: "pr-detail-value pr-effect-value ds-multiline" }));
		}

		if (data.fields && data.fields.length > 0) {
			const fieldsContainer = container.createEl("div", { cls: "pr-fields-container" });
			data.fields.forEach(field => {
				const fieldLine = fieldsContainer.createEl("div", { cls: "pr-field-line" });
				fieldLine.createEl("span", { cls: "pr-field-key", text: field.name.trim() + ": " });
				this.render(ctx, field.value, fieldLine.createEl("span", { cls: "pr-field-value ds-multiline" }));
			});
		}

		if (data.spend) {
			const spendLine = container.createEl("div", { cls: "pr-detail-line pr-spend-line" });
			spendLine.createEl("span", { cls: "pr-detail-key pr-spend-key", text: "Spend " + data.spend.cost.trim() + ": " });
			this.render(ctx, data.spend.value, spendLine.createEl("span", { cls: "pr-detail-value pr-spend-value ds-multiline" }));
		}

		if (data.persistent) {
			const persistentLine = container.createEl("div", { cls: "pr-detail-line pr-persistent-line" });
			persistentLine.createEl("span", { cls: "pr-detail-key pr-persistent-key", text: "Persistent " + data.persistent.cost.trim() + ": " });
			this.render(ctx, data.persistent.value, persistentLine.createEl("span", { cls: "pr-detail-value pr-persistent-value ds-multiline" }));
		}

		if (data.notes) {
			if (Array.isArray(data.notes)) {
				const notesContainer = container.createEl("ul", { cls: "pr-note-list" });
				data.notes.forEach(note => this.render(ctx, note, notesContainer.createEl("li", { cls: "pr-note-item" })));
			} else {
				const noteContainer = container.createEl("div", { cls: "pr-detail-line pr-note-line" });
				this.render(ctx, data.notes, noteContainer.createEl("span", { cls: "pr-note ds-multiline" }));
			}
		}
	}

	private render(ctx: MarkdownPostProcessorContext, markdown: string, el: HTMLElement) {
		el.addClass("ds-pr-inline-p");
		MarkdownRenderer.render(this.app, markdown.trim(), el, ctx.sourcePath, this.plugin);
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
