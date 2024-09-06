import {DrawSteelAdmonition} from "./drawSteelAdmonition";
import {parseYaml, Setting} from "obsidian";
import {DrawSteelAdmonitionType} from "./drawSteelAdmonitionType";
import {SyntaxNodeRef} from "@lezer/common";
import {RangeSetBuilder} from "@codemirror/state";
import {Decoration} from "@codemirror/view";

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
			const yaml = parseYaml(codeElement.getText());
			let containerClasses = [];
			const indent = yaml["indent"]

			if (indent && Number.isNumber(indent)) {
				containerClasses.push("indent-" + indent);
			}

			const container = document.createElement('div');
			container.addClass("pr-container");
			container.addClasses(containerClasses);

			const type = yaml["type"] ?? yaml["name"];
			if (type) {
				const typeContainer = container.createEl("div", {cls: "pr-type-line"});
				typeContainer.createEl("span", {cls: "pr-type-value", text: type.trim()});
			}

			const t1 = yaml["t1"] ?? yaml["tier 1"] ?? yaml["11 or lower"];
			if (t1) {
				const t1Container = container.createEl("div", {cls: "pr-tier-line pr-tier-1-line"});
				t1Container.createEl("span", {cls: "pr-tier-key pr-tier-1-key", text: "11 or lower: "});
				t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value", text: t1.trim()});
			}

			const t2 = yaml["t2"] ?? yaml["tier 2"] ?? yaml["12-16"];
			if (t2) {
				const t2Container = container.createEl("div", {cls: "pr-tier-line pr-tier-2-line"});
				t2Container.createEl("span", {cls: "pr-tier-key pr-tier-2-key", text: "12-16: "});
				t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value", text: t2.trim()});
			}

			const t3 = yaml["t3"] ?? yaml["tier 3"] ?? yaml["13-16"];
			if (t3) {
				const t3Container = container.createEl("div", {cls: "pr-tier-line pr-tier-3-line"});
				t3Container.createEl("span", {cls: "pr-tier-key pr-tier-3-key", text: "17+: "});
				t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value", text: t3.trim()});
			}

			const crit = yaml["critical"] ?? yaml["crit"] ?? yaml["nat 19-20"];
			if (crit) {
				const critContainer = container.createEl("div", {cls: "pr-tier-line pr-crit-line"});
				critContainer.createEl("span", {cls: "pr-tier-key pr-crit-key", text: "Nat 19-20: "});
				critContainer.createEl("span", {cls: "pr-tier-value pr-crit-value", text: crit.trim()});
			}

			const notes = yaml["notes"] ?? yaml["note"];
			if (notes) {
				if (Array.isArray(notes)) {
					const notesContainer = container.createEl("ul", {cls: "pr-note-list"});
					notes.forEach(note => notesContainer.createEl("li", {cls: "pr-note-item", text: note.trim()}));
				} else {
					const noteContainer = container.createEl("div", {cls: "pr-note-line"});
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
}
