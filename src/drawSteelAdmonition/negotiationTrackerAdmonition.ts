import {DrawSteelAdmonition} from "./drawSteelAdmonition";
import {Setting} from "obsidian";
import {DrawSteelAdmonitionType} from "./drawSteelAdmonitionType";
import {SyntaxNodeRef} from "@lezer/common";
import {RangeSetBuilder} from "@codemirror/state";
import {Decoration} from "@codemirror/view";
import YAML from 'yaml'
import {PowerRollAdmonition} from "./powerRollAdmonition";

export class NegotiationTrackerAdmonition extends DrawSteelAdmonition {
	type = DrawSteelAdmonitionType.NegotiationTracker;

	static create() {
		return new NegotiationTrackerAdmonition();
	}

	static unmarshal(data: any): NegotiationTrackerAdmonition {
		if (data.type != DrawSteelAdmonitionType.NegotiationTracker) {
			throw new Error("Cannot unmarshal data into NegotiationTrackerAdmonition: Wrong type: " + data.type);
		}
		return new NegotiationTrackerAdmonition();
	}

	constructor() {
		super();
	}

	process(codeElement: HTMLElement) {
		if (codeElement.hasClass("language-ds-negotiation-tracker") || codeElement.innerText.startsWith("ds-negotiation-tracker")
			|| codeElement.hasClass("language-ds-nt") || codeElement.innerText.startsWith("ds-nt")) {
			const yaml = YAML.parse(codeElement.getText());

			const container = document.createElement('div');
			container.addClass("ds-nt-container");

			const name = yaml["name"];
			if (name) {
				const nameContainer = container.createEl("div", {cls: "ds-nt-name-line"});
				nameContainer.createEl("span", {cls: "ds-nt-name-value", text: "Negotiation: " + name.trim()});
			}

			const trackers = container.createEl("div", {cls: "ds-nt-trackers"});
			this.addPatience(trackers);
			this.addInterest(trackers, yaml);
			this.addActions(yaml, trackers);

			const details = container.createEl("div", {cls: "ds-nt-details"});
			this.addMotivations(yaml, details);
			this.addPitfalls(yaml, details);

			// codeElement.setText(result);
			const preEle = codeElement.parentNode;
			preEle?.parentNode?.replaceChild(container, preEle);
		}
	}

	private addPitfalls(yaml: any, details: any) {
		const pitfalls = yaml["pitfalls"];
		if (pitfalls) {
			const pitfallsCont = details.createEl("div", {cls: "ds-nt-pitfalls"});
			pitfallsCont.createEl("div", {cls: "ds-nt-details-header ds-nt-pitfall-header", text: "Pitfalls"});
			const pitfallList = details.createEl("ul", {cls: "ds-nt-pitfall-list"});

			pitfalls.forEach(pit => {
				const pitText = pit["name"].trim() + ": " + pit["reason"].trim();
				pitfallList.createEl("li", {cls: "ds-nt-pitfall-item", text: pitText});
			});
		}
	}

	private addMotivations(yaml: any, details: any) {
		const motivations = yaml["motivations"];
		if (motivations) {
			const motivationsCont = details.createEl("div", {cls: "ds-nt-motivations"});
			motivationsCont.createEl("div", {cls: "ds-nt-details-header ds-nt-motivation-header", text: "Motivations"});
			const motivationList = details.createEl("ul", {cls: "ds-nt-motivation-list"});

			motivations.forEach(mot => {
				const motText = mot["name"].trim() + ": " + mot["reason"].trim();
				motivationList.createEl("li", {cls: "ds-nt-motivation-item", text: motText})
			});
		}
	}

	private addActions(yaml: any, trackers: any) {
		const actionsContainer = trackers.createEl("div", {cls: "ds-nt-actions-container"});

		const actionTab = actionsContainer.createEl("div", {cls: "ds-nt-action-tabs"});
		actionTab.createEl("div", {cls: "ds-nt-action-tab ds-nt-argument-tab", text: "Make an Argument"});
		actionTab.createEl("div", {cls: "ds-nt-action-tab ds-nt-learn-more-tab", text: "Learn Motivation/Pitfall"});

		const argumentContainer = actionsContainer.createEl("div", {cls: "ds-nt-action-container ds-nt-argument-container"});

		const argModifiers = argumentContainer.createEl("div", {cls: "ds-nt-argument-modifiers"});

		const motivations = yaml["motivations"];
		if (motivations) {
			argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-motivation-header", text: "Appeals to Motivation"});
			motivations.forEach(mot => {
				const motLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-motivation-line"});
				motLine.createEl("input", {cls: "ds-nt-argument-modifier-motivation-checkbox", type: "checkbox"});
				motLine.createEl("label", {cls: "ds-nt-argument-modifier-motivation-label", text: mot["name"].trim()});
			});
		}

		const pitfalls = yaml["pitfalls"];
		if (pitfalls) {
			argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-pitfall-header", text: "Mentions Pitfall"});
			pitfalls.forEach(pit => {
				const pitLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-pitfall-line"});
				pitLine.createEl("input", {cls: "ds-nt-argument-modifier-pitfall-checkbox", type: "checkbox"});
				pitLine.createEl("label", {cls: "ds-nt-argument-modifier-pitfall-label", text: pit["name"].trim()});
			});
		}

		const lieLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-lie-line"});
		const lieCheckbox = lieLine.createEl("input", {cls: "ds-nt-argument-modifier-lie-checkbox", type: "checkbox"})
		lieLine.createEl("label", {cls: "ds-nt-argument-modifier-lie-label", text: "Included a lie"});
		lieCheckbox.addEventListener("change", evt => {
			if (lieCheckbox.checked) {
				console.log("Checkbox is checked..");
				let tierValues = argumentContainer.findAll(".pr-tier-value")
				for (let tierValue of tierValues) {
					if (tierValue.getText().contains("-1 Interest")) {
						tierValue.setText(tierValue.getText().replace("-1 Interest", "-2 Interest"));
					} else if (!tierValue.getText().contains("+1 Interest")) {
						tierValue.setText("-1 Interest, " + tierValue.getText());
					}
				}
			}
		});

		const argPowerRoll = argumentContainer.createEl("div", {cls: "ds-nt-argument-power-roll"});

		const typeContainer = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-roll-line"});
		typeContainer.createEl("span", {cls: "pr-roll-value", text: "Power Roll + Reason, Intuition, or Presence"});

		const t1Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-1-line"});
		PowerRollAdmonition.tier1Key(t1Container);
		t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value", text: "-1 Interest, -1 Patience"});

		const t2Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-2-line"});
		PowerRollAdmonition.tier2Key(t2Container);
		t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value", text: "-1 Patience"});

		const t3Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-3-line"});
		PowerRollAdmonition.tier3Key(t3Container);
		t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value", text: "+1 Interest, -1 Patience"});

		const critContainer = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-crit-line"});
		PowerRollAdmonition.critKey(critContainer);
		critContainer.createEl("span", {cls: "pr-tier-value pr-crit-value", text: "+1 Interest"});
	}

	private addInterest(trackers: any, yaml: any) {
		const interestCont = trackers.createEl("div", {cls: "ds-nt-interest-container"});
		interestCont.createEl("div", {cls: "ds-nt-interest-header", text: "Interest"});

		const i5Line = interestCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-5-line"});
		i5Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-5-label", text: "5"});
		i5Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-5-offer", text: yaml["i5"]});

		const i4Line = interestCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-4-line"});
		i4Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-4-label", text: "4"});
		i4Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-4-offer", text: yaml["i4"]});

		const i3Line = interestCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-3-line"});
		i3Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-3-label", text: "3"});
		i3Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-3-offer", text: yaml["i3"]});

		const i2Line = interestCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-2-line"});
		i2Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-2-label ds-nt-button-selected", text: "2"});
		i2Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-2-offer", text: yaml["i2"]});

		const i1Line = interestCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-1-line"});
		i1Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-1-label ds-nt-button-selected", text: "1"});
		i1Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-1-offer", text: yaml["i1"]});
	}

	private addPatience(trackers: any) {
		const patienceCont = trackers.createEl("div", {cls: "ds-nt-patience-container"});
		patienceCont.createEl("div", {cls: "ds-nt-patience-label", text: "Patience"});
		patienceCont.createEl("div", {
			cls: "ds-nt-patience-bubble ds-nt-patience-bubble-1 ds-nt-button-selected",
			text: "1"
		});
		patienceCont.createEl("div", {
			cls: "ds-nt-patience-bubble ds-nt-patience-bubble-2 ds-nt-button-selected",
			text: "2"
		});
		patienceCont.createEl("div", {
			cls: "ds-nt-patience-bubble ds-nt-patience-bubble-3 ds-nt-button-selected",
			text: "3"
		});
		patienceCont.createEl("div", {cls: "ds-nt-patience-bubble ds-nt-patience-bubble-4", text: "4"});
		patienceCont.createEl("div", {cls: "ds-nt-patience-bubble ds-nt-patience-bubble-5", text: "5"});
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
		return "NegotiationTrackerAdmonition{}";
	}
}
