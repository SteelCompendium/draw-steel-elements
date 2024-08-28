import {DrawSteelAdmonition} from "./drawSteelAdmonition";
import {Setting} from "obsidian";
import {DrawSteelAdmonitionType} from "./drawSteelAdmonitionType";
import {SyntaxNodeRef} from "@lezer/common";
import {RangeSetBuilder} from "@codemirror/state";
import {Decoration} from "@codemirror/view";
import YAML from 'yaml'

export class PowerRollAdmonition extends DrawSteelAdmonition {
	type = DrawSteelAdmonitionType.PowerRoll;

	static create() {
		return new PowerRollAdmonition();
	}

	static unmarshal(data: any): PowerRollAdmonition {
		if (data.type != DrawSteelAdmonitionType.PowerRoll) {
			throw new Error("Cannot unmarshal data into PowerRollAdmonition: Wrong type: " + data.type);
		}
		return new PowerRollAdmonition();
	}

	constructor() {
		super();
	}

	process(codeElement: HTMLElement) {
		if (codeElement.hasClass("language-power-roll") || codeElement.hasClass("language-pr")) {
			const yaml = YAML.parse(codeElement.getText());
			let containerClasses = [];
			const indent = yaml["indent"]

			if (indent && Number.isNumber(indent)) {
				containerClasses.push("indent-" + indent);
			}

			const container = document.createElement('div');
			container.addClass("pr-container");
			container.addClasses(containerClasses);

			const name = yaml["name"];
			if (name) {
				const typeContainer = container.createEl("div", {cls: "pr-name-line"});
				typeContainer.createEl("span", {cls: "pr-name-value", text: name.trim()});
			}

			const flavor = yaml["flavor"];
			if (flavor) {
				const typeContainer = container.createEl("div", {cls: "pr-detail-line pr-flavor-line"});
				typeContainer.createEl("span", {cls: "pr-flavor-value", text: flavor.trim()});
			}

			const keywords = yaml["keywords"];
			const type = yaml["type"];
			if (keywords || type) {
				const row1 = container.createEl("div", {cls: "pr-detail-table-row"});
				const keywordCell = row1.createEl("div", {cls: "pr-detail-table-cell pr-keyword-cell"});
				if (keywords) {
					keywordCell.createEl("span", {cls: "pr-detail-key pr-keyword-key", text: "Keywords: "});
					keywordCell.createEl("span", {cls: "pr-detail-value pr-keyword-value", text: keywords.trim()});
				}
				const typeCell = row1.createEl("div", {cls: "pr-detail-table-cell pr-type-cell"});
				if (type) {
					typeCell.createEl("span", {cls: "pr-detail-key pr-type-key", text: "Type: "});
					typeCell.createEl("span", {cls: "pr-detail-value pr-type-value", text: type.trim()});
				}
			}

			const distance = yaml["distance"];
			const target = yaml["target"];
			if (distance || target) {
				const row2 = container.createEl("div", {cls: "pr-detail-table-row"});
				const distanceCell = row2.createEl("div", {cls: "pr-detail-table-cell pr-distance-cell"});
				if (distance) {
					distanceCell.createEl("span", {cls: "pr-detail-key pr-distance-key", text: "Distance: "});
					distanceCell.createEl("span", {cls: "pr-detail-value pr-distance-value", text: distance.trim()});
				}
				const targetCell = row2.createEl("div", {cls: "pr-detail-table-cell pr-target-cell"});
				if (target) {
					targetCell.createEl("span", {cls: "pr-detail-key pr-target-key", text: "Target: "});
					targetCell.createEl("span", {cls: "pr-detail-value pr-target-value", text: target.trim()});
				}
			}

			const roll = yaml["roll"];
			if (roll) {
				const typeContainer = container.createEl("div", {cls: "pr-detail-line pr-roll-line"});
				typeContainer.createEl("span", {cls: "pr-roll-value", text: roll.trim()});
			}

			const t1 = yaml["t1"] ?? yaml["tier 1"] ?? yaml["11 or lower"];
			if (t1) {
				const t1Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-1-line"});
				// t1Container.createEl("span", {cls: "pr-tier-key pr-tier-1-key", text: "11 or lower: "});
				PowerRollAdmonition.tier1Key(t1Container);
				t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value", text: t1.trim()});
			}

			const t2 = yaml["t2"] ?? yaml["tier 2"] ?? yaml["12-16"];
			if (t2) {
				const t2Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-2-line"});
				// t2Container.createEl("span", {cls: "pr-tier-key pr-tier-2-key", text: "12-16: "});
				PowerRollAdmonition.tier2Key(t2Container);
				t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value", text: t2.trim()});
			}

			const t3 = yaml["t3"] ?? yaml["tier 3"] ?? yaml["17+"];
			if (t3) {
				const t3Container = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-3-line"});
				// t3Container.createEl("span", {cls: "pr-tier-key pr-tier-3-key", text: "17+: "});
				PowerRollAdmonition.tier3Key(t3Container);
				t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value", text: t3.trim()});
			}

			const crit = yaml["critical"] ?? yaml["crit"] ?? yaml["nat 19-20"];
			if (crit) {
				const critContainer = container.createEl("div", {cls: "pr-detail-line pr-tier-line pr-crit-line"});
				// critContainer.createEl("span", {cls: "pr-tier-key pr-crit-key", text: "Nat 19-20: "});
				PowerRollAdmonition.critKey(critContainer);
				critContainer.createEl("span", {cls: "pr-tier-value pr-crit-value", text: crit.trim()});
			}

			const effect = yaml["effect"] ;
			if (effect) {
				const effectContainer = container.createEl("div", {cls: "pr-detail-line pr-effect-line"});
				effectContainer.createEl("span", {cls: "pr-detail-key pr-effect-key", text: "Effect: "});
				effectContainer.createEl("span", {cls: "pr-detail-value pr-effect-value", text: effect.trim()});
			}

			const notes = yaml["notes"] ?? yaml["note"];
			if (notes) {
				if (Array.isArray(notes)) {
					const notesContainer = container.createEl("ul", {cls: "pr-note-list"});
					notes.forEach(note => notesContainer.createEl("li", {cls: "pr-note-item", text: note.trim()}));
				} else {
					const noteContainer = container.createEl("div", {cls: "pr-detail-line pr-note-line"});
					noteContainer.createEl("span", {cls: "pr-note", text: notes.trim()});
				}
			}

			// codeElement.setText(result);
			const preEle = codeElement.parentNode;
			preEle?.parentNode?.replaceChild(container, preEle);
		}
	}

	applyTo(node: SyntaxNodeRef, content: string, builder: RangeSetBuilder<Decoration>) {
		// TODO later
	}

	buildSettings(contentEl: HTMLElement, updateSampleFunction: () => void): Setting[] {
		const results = new Array<Setting>();

		// results.push(new Setting(contentEl)
		// 	.setName("")
		// 	.setDesc("Inline codeblock prefix to trigger this formatting")
		// 	.addText((text) => text
		// 		.setPlaceholder("Enter prefix")
		// 		.setValue(this.prefix)
		// 		.onChange((value) => {
		// 			this.prefix = value;
		// 			updateSampleFunction();
		// 		})
		// 	));
		//
		// results.push(new Setting(contentEl)
		// 	.setName("Hide prefix text")
		// 	.setDesc("If enabled, the 'prefix' text will not show in resulting Inline Admonition")
		// 	.addToggle((toggle) => toggle
		// 		.setValue(this.hideTriggerString)
		// 		.onChange((val) => {
		// 			this.hideTriggerString = val;
		// 			updateSampleFunction();
		// 		})
		// 	)
		// );

		return results;
	}

	public toString = (): string => {
		return "PowerRollAdmonition{}";
	}

	private static tier1Key(parentElement) {
		const container = parentElement.createEl("div", {cls: "tier-key-container t1-key-container"})

		const leftSide = container.createEl('div', {cls: "t1-key-left-side"});
		leftSide.createEl("div", {cls: "t1-key-brace-part t1-key-brace-p1"});
		leftSide.createEl("div", {cls: "t1-key-brace-part t1-key-brace-p2"});
		leftSide.createEl("div", {cls: "t1-key-brace-part t1-key-brace-p3"});
		leftSide.createEl("div", {cls: "t1-key-brace-part t1-key-brace-p4"});

		container.createEl('div', {cls: "t1-key-body", text: "≤11"});
	}

	private static tier2Key(parentElement) {
		const container = parentElement.createEl("div", {cls: "tier-key-container t2-key-container"})
		container.createEl('div', {cls: "t2-key-body", text: "12-16"});
	}

	private static tier3Key(parentElement) {
		const container = parentElement.createEl("div", {cls: "tier-key-container t3-key-container"})

		container.createEl('div', {cls: "t3-key-body", text: "17+"});

		const rightSide = container.createEl('div', {cls: "t3-key-right-side"});
		rightSide.createEl("div", {cls: "t3-key-brace-part t3-key-brace-p1"});
		rightSide.createEl("div", {cls: "t3-key-brace-part t3-key-brace-p2"});
		rightSide.createEl("div", {cls: "t3-key-brace-part t3-key-brace-p3"});
		rightSide.createEl("div", {cls: "t3-key-brace-part t3-key-brace-p4"});
	}

	private static critKey(parentElement) {
		const container = parentElement.createEl("div", {cls: "tier-key-container crit-key-container"})

		container.createEl('div', {cls: "crit-key-body", text: "crit"});

		const rightSide = container.createEl('div', {cls: "crit-key-right-side"});
		// rightSide.createEl("div", {cls: "crit-key-brace-part crit-key-brace-p1"});
		// rightSide.createEl("div", {cls: "crit-key-brace-part crit-key-brace-p2"});
	}
}
