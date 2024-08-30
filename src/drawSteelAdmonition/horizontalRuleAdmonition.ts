import {DrawSteelAdmonition} from "./drawSteelAdmonition";
import {Setting} from "obsidian";
import {DrawSteelAdmonitionType} from "./drawSteelAdmonitionType";
import {SyntaxNodeRef} from "@lezer/common";
import {RangeSetBuilder} from "@codemirror/state";
import {Decoration} from "@codemirror/view";
import YAML from 'yaml'

export class HorizontalRuleAdmonition extends DrawSteelAdmonition {
	type = DrawSteelAdmonitionType.HorizontalRule;

	static create() {
		return new HorizontalRuleAdmonition();
	}

	static unmarshal(data: any): HorizontalRuleAdmonition {
		if (data.type != DrawSteelAdmonitionType.HorizontalRule) {
			throw new Error("Cannot unmarshal data into HorizontalRuleAdmonition: Wrong type: " + data.type);
		}
		return new HorizontalRuleAdmonition();
	}

	constructor() {
		super();
	}

	process(codeElement: HTMLElement) {
		if (codeElement.hasClass("language-ds-horizontal-rule") || codeElement.innerText.startsWith("ds-horizontal-rule")
			|| codeElement.hasClass("language-ds-hr") || codeElement.innerText.startsWith("ds-hr")) {
			const yaml = YAML.parse(codeElement.getText());

			const container = document.createElement('div');
			container.addClass("ds-hr-container");

			container.createEl("div", {cls: "ds-hr-left-line"});
			container.createEl("div", {cls: "ds-hr-center"});
			container.createEl("div", {cls: "ds-hr-right-line"});

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
		return "HorizontalRuleAdmonition{}";
	}
}
