import {sanitizeClassName, slugify} from "../utils";
import {DrawSteelAdmonition} from "./drawSteelAdmonition";
import {Setting} from "obsidian";
import {DrawSteelAdmonitionType} from "./drawSteelAdmonitionType";
import {SyntaxNodeRef} from "@lezer/common";
import {RangeSetBuilder} from "@codemirror/state";
import {Decoration} from "@codemirror/view";
import YAML from 'yaml'

export class PowerRollAdmonition extends DrawSteelAdmonition {
	type= DrawSteelAdmonitionType.PowerRoll;

	// TODO - I dont like this...
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
		console.log(codeElement);

		if (codeElement.hasClass("language-power-roll") || codeElement.hasClass("language-pr")) {
			// this.cssClasses().forEach(c => codeElement.classList.add(c));
			let result = "<div class='pr-container'>"

			const yaml = YAML.parse(codeElement.getText());
			const type = yaml["type"] ?? yaml["name"];
			if (type) {
				result += "<div class='pr-type-line'><span class='pr-type-value'>" + type.trim() + "</span></div>";
			}

			const t1 = yaml["t1"] ?? yaml["tier 1"] ?? yaml["11 or lower"];
			if (t1) {
				result += "<div class='pr-tier-line pr-tier-1-line'>" +
					"<span class='pr-tier-key pr-tier-1-key'>11 or lower:</span> " +
					"<span class='pr-tier-value pr-tier-1-value'>" + t1.trim() + "</span>" +
					"</div>";
			}

			const t2 = yaml["t2"] ?? yaml["tier 2"] ?? yaml["12-16"];
			if (t2) {
				result += "<div class='pr-tier-line pr-tier-2-line'>" +
					"<span class='pr-tier-key pr-tier-2-key'>12-16:</span> " +
					"<span class='pr-tier-value pr-tier-2-value'>" + t2.trim() + "</span>" +
					"</div>";
			}

			const t3 = yaml["t3"] ?? yaml["tier 3"] ?? yaml["17+"];
			if (t3) {
				result += "<div class='pr-tier-line pr-tier-2-line'>" +
					"<span class='pr-tier-key pr-tier-3-key'>17+:</span> " +
					"<span class='pr-tier-value pr-tier-3-value'>" + t3.trim() + "</span>" +
					"</div>";
			}

			const notes = yaml["notes"] ?? yaml["note"];
			if (notes) {
				if (Array.isArray(notes)) {
					result += "<ul class='pr-note-list'>";
					notes.forEach(note => result += "<li class='pr-note-item'>" + note.trim() + "</li>");
					result += "</ul>";
				} else {
					result += "<div class='pr-note-line'><span class='pr-note'>" + notes.trim() + "</span></div>";
				}
			}
			result += "</div>"

			// codeElement.setText(result);
			const divElement = document.createElement('div');
			divElement.innerHTML = result;
			const preEle = codeElement.parentNode;
			preEle?.parentNode?.replaceChild(divElement, preEle);
		}
	}

	applyTo(node: SyntaxNodeRef, content: string, builder: RangeSetBuilder<Decoration>) {
		// if (content.startsWith(this.prefix)) {
		// 	builder.add(
		// 		node.from,
		// 		node.to,
		// 		Decoration.mark({
		// 			inclusive: true,
		// 			attributes: {class: this.cssClasses().join(" ")},
		// 			tagName: "span"
		// 		})
		// 	);
		// 	// Hide the prefix if necessary
		// 	if (this.hideTriggerString) {
		// 		builder.add(
		// 			node.from,
		// 			node.from + this.prefix.length,
		// 			Decoration.mark({
		// 				inclusive: true,
		// 				attributes: {class: "dsa-hidden"},
		// 				tagName: "span"
		// 			})
		// 		);
		// 	}
		// }
	}

	cssClasses(): string[] {
		const classes = super.cssClasses();
		classes.push("dsa-prefix")
		classes.push("dsa-prefix-" + sanitizeClassName(this.prefix));
		return classes;
	}

	buildSettings(contentEl: HTMLElement, updateSampleFunction: () => void): Setting[] {
		const results = new Array<Setting>();

		results.push(new Setting(contentEl)
			.setName("Prefix")
			.setDesc("Inline codeblock prefix to trigger this formatting")
			.addText((text) => text
				.setPlaceholder("Enter prefix")
				.setValue(this.prefix)
				.onChange((value) => {
					this.prefix = value;
					updateSampleFunction();
				})
			));

		results.push(new Setting(contentEl)
			.setName("Hide prefix text")
			.setDesc("If enabled, the 'prefix' text will not show in resulting Inline Admonition")
			.addToggle((toggle) => toggle
				.setValue(this.hideTriggerString)
				.onChange((val) => {
					this.hideTriggerString = val;
					updateSampleFunction();
				})
			)
		);

		return results;
	}

	public toString = (): string => {
		return "PowerRollAdmonition()";
	}
}
