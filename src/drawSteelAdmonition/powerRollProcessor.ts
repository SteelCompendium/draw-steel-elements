import {App, Component, MarkdownPostProcessorContext, MarkdownRenderer, parseYaml} from "obsidian";

export class PowerRollProcessor {
	app: App;
	plugin: Component;

	constructor(app: App, plugin: Component) {
		this.app = app;
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const yaml = parseYaml(source);
		const indent = yaml["indent"]

		const container = el.createEl("div", {cls: "pr-container"});
		container.addClass("pr-container");

		if (indent && Number.isNumber(indent)) {
			container.addClass("indent-" + indent);
		}

		const typeContainer = container.createEl("div", {cls: "pr-name-line"});
		const name = yaml["name"];
		if (name) {
			this.render(ctx, name, typeContainer.createEl("span", {cls: "pr-name-value ds-multiline"}))
		}

		const cost = yaml["cost"];
		if (cost) {
			this.render(ctx, "(" + String(cost).trim() + ")", typeContainer.createEl("span", {cls: "pr-cost-value"}));
		}

		const flavor = yaml["flavor"];
		if (flavor) {
			const flavorContainer = container.createEl("div", {cls: "pr-detail-line pr-flavor-line"});
			this.render(ctx, flavor, flavorContainer.createEl("span", {cls: "pr-flavor-value ds-multiline"}));
		}

		const keywords = yaml["keywords"];
		const type = yaml["type"];
		if (keywords || type) {
			const row1 = container.createEl("div", {cls: "pr-detail-table-row"});
			const keywordCell = row1.createEl("div", {cls: "pr-detail-table-cell pr-keyword-cell"});
			if (keywords) {
				keywordCell.createEl("span", {cls: "pr-detail-key pr-keyword-key", text: "Keywords: "});
				this.render(ctx, keywords, keywordCell.createEl("span", {cls: "pr-detail-value pr-keyword-value ds-multiline"}));
			}
			const typeCell = row1.createEl("div", {cls: "pr-detail-table-cell pr-type-cell"});
			if (type) {
				typeCell.createEl("span", {cls: "pr-detail-key pr-type-key", text: "Type: "});
				this.render(ctx, type, typeCell.createEl("span", {cls: "pr-detail-value pr-type-value ds-multiline"}));
			}
		}

		const distance = yaml["distance"];
		const target = yaml["target"];
		if (distance || target) {
			const row2 = container.createEl("div", {cls: "pr-detail-table-row"});
			const distanceCell = row2.createEl("div", {cls: "pr-detail-table-cell pr-distance-cell"});
			if (distance) {
				distanceCell.createEl("span", {cls: "pr-detail-key pr-distance-key", text: "Distance: "});
				this.render(ctx, distance, distanceCell.createEl("span", {cls: "pr-detail-value pr-distance-value ds-multiline"}));
			}
			const targetCell = row2.createEl("div", {cls: "pr-detail-table-cell pr-target-cell"});
			if (target) {
				targetCell.createEl("span", {cls: "pr-detail-key pr-target-key", text: "Target: "});
				this.render(ctx, target, targetCell.createEl("span", {cls: "pr-detail-value pr-target-value ds-multiline"}));
			}
		}

		const trigger = yaml["trigger"];
		if (trigger) {
			const triggerContainer = container.createEl("div", {cls: "pr-detail-line pr-trigger-line"});
			triggerContainer.createEl("span", {cls: "pr-detail-key pr-trigger-key", text: "Trigger: "});
			this.render(ctx, trigger, triggerContainer.createEl("span", {cls: "pr-detail-value pr-trigger-value ds-multiline"}));
		}

		const roll = yaml["roll"];
		if (roll) {
			const typeContainer = container.createEl("div", {cls: "pr-detail-line pr-roll-line"});
			this.render(ctx, roll, typeContainer.createEl("span", {cls: "pr-roll-value ds-multiline"}));
		}

		const t1 = yaml["t1"] ?? yaml["tier 1"] ?? yaml["11 or lower"];
		if (t1) {
			const t1Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-1-line"});
			PowerRollProcessor.tier1Key(t1Container);
			this.render(ctx, t1, t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value ds-multiline"}));
		}

		const t2 = yaml["t2"] ?? yaml["tier 2"] ?? yaml["12-16"];
		if (t2) {
			const t2Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-2-line"});
			PowerRollProcessor.tier2Key(t2Container);
			this.render(ctx, t2, t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value ds-multiline"}));
		}

		const t3 = yaml["t3"] ?? yaml["tier 3"] ?? yaml["17+"];
		if (t3) {
			const t3Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-3-line"});
			PowerRollProcessor.tier3Key(t3Container);
			this.render(ctx, t3, t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value ds-multiline"}));
		}

		const crit = yaml["critical"] ?? yaml["crit"] ?? yaml["nat 19-20"];
		if (crit) {
			const critContainer = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-crit-line"});
			PowerRollProcessor.critKey(critContainer);
			this.render(ctx, crit, critContainer.createEl("span", {cls: "pr-tier-value pr-crit-value ds-multiline"}));
		}

		const effect = yaml["effect"];
		if (effect) {
			const effectContainer = container.createEl("div", {cls: "pr-detail-line pr-effect-line"});
			effectContainer.createEl("span", {cls: "pr-detail-key pr-effect-key", text: "Effect: "});
			this.render(ctx, effect, effectContainer.createEl("span", {cls: "pr-detail-value pr-effect-value ds-multiline"}));
		}

		const fields = yaml["custom_fields"] ?? yaml["fields"];
		if (fields) {
			if (Array.isArray(fields)) {
				const fieldsContainer = container.createEl("div", {cls: "pr-fields-container"});
				fields.forEach(field => {
					const fieldLine = fieldsContainer.createEl("div", {cls: "pr-field-line"});
					fieldLine.createEl("span", {cls: "pr-field-key", text: field["name"].trim() + ": "});
					this.render(ctx, field["value"], fieldLine.createEl("span", {cls: "pr-field-value ds-multiline"}));
				});
			}
		}

		const spend = yaml["spend"];
		if (spend) {
			const spendLine = container.createEl("div", {cls: "pr-detail-line pr-spend-line"});
			spendLine.createEl("span", {cls: "pr-detail-key pr-spend-key", text: "Spend " + String(spend["cost"]).trim() + ": "});
			this.render(ctx, spend["value"], spendLine.createEl("span", {cls: "pr-detail-value pr-spend-value ds-multiline"}));
		}

		const persistent = yaml["persistent"];
		if (persistent) {
			const persistentLine = container.createEl("div", {cls: "pr-detail-line pr-persistent-line"});
			persistentLine.createEl("span", {cls: "pr-detail-key pr-persistent-key", text: "Persistent " + String(persistent["cost"]).trim() + ": "});
			this.render(ctx, persistent["value"], persistentLine.createEl("span", {cls: "pr-detail-value pr-persistent-value ds-multiline"}));
		}

		const notes = yaml["notes"] ?? yaml["note"];
		if (notes) {
			if (Array.isArray(notes)) {
				const notesContainer = container.createEl("ul", {cls: "pr-note-list"});
				notes.forEach(note => this.render(ctx, note, notesContainer.createEl("li", {cls: "pr-note-item"})));
			} else {
				const noteContainer = container.createEl("div", {cls: "pr-detail-line pr-note-line"});
				this.render(ctx, notes, noteContainer.createEl("span", {cls: "pr-note ds-multiline"}));
			}
		}
	}

	private render(ctx, markdown: string, el: HTMLElement) {
		el.addClass("ds-pr-inline-p")
		MarkdownRenderer.render(this.app, markdown.trim(), el, ctx.sourcePath, this.plugin);
	}

	public static tier1Key(parentElement: HTMLElement) {
		const container = parentElement.createEl("div", {cls: "tier-key-container t1-key-container"})
		const body = container.createEl('div', {cls: "t1-key-body"});
		body.createEl('div', {cls: "t1-key-body-text", text: "≤11"});
	}

	public static tier2Key(parentElement: HTMLElement) {
		const container = parentElement.createEl("div", {cls: "tier-key-container t2-key-container"})
		const body = container.createEl('div', {cls: "t2-key-body"});
		body.createEl('div', {cls: "t2-key-body-text", text: "12-16"});
	}

	public static tier3Key(parentElement: HTMLElement) {
		const container = parentElement.createEl("div", {cls: "tier-key-container t3-key-container"})
		const body = container.createEl('div', {cls: "t3-key-body"});
		body.createEl('div', {cls: "t3-key-body-text", text: "17+"});
	}

	public static critKey(parentElement: HTMLElement) {
		const container = parentElement.createEl("div", {cls: "tier-key-container crit-key-container"})
		const body = container.createEl('div', {cls: "crit-key-body"});
		body.createEl('div', {cls: "crit-key-body-text", text: "crit"});
	}
}
