import {MarkdownPostProcessorContext, parseYaml} from "obsidian";
import {PowerRollProcessor} from "./powerRollProcessor";
import {PowerRollTiers} from "../model/powerRoll";

export class NegotiationTrackerProcessor {
	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const yaml = parseYaml(source);

		const container = el.createEl('div', {cls: "ds-nt-container"});

		const name = yaml["name"];
		if (name) {
			const nameContainer = container.createEl("div", {cls: "ds-nt-name-line"});
			nameContainer.createEl("span", {cls: "ds-nt-name-value", text: "Negotiation: " + name.trim()});
		}

		const trackers = container.createEl("div", {cls: "ds-nt-trackers"});
		NegotiationTrackerProcessor.addPatience(trackers);
		NegotiationTrackerProcessor.addInterest(trackers, yaml);
		NegotiationTrackerProcessor.addActions(yaml, trackers);

		const details = container.createEl("div", {cls: "ds-nt-details"});
		NegotiationTrackerProcessor.addMotivations(yaml, details);
		NegotiationTrackerProcessor.addPitfalls(yaml, details);
	}

	private static addPatience(trackers: any) {
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

	private static addInterest(trackers: any, yaml: any) {
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

	private static addActions(yaml: any, trackers: any) {
		const actionsContainer = trackers.createEl("div", {cls: "ds-nt-actions-container"});

		const actionTab = actionsContainer.createEl("div", {cls: "ds-nt-action-tabs"});
		actionTab.createEl("div", {cls: "ds-nt-action-tab ds-nt-argument-tab", text: "Make an Argument"});
		actionTab.createEl("div", {cls: "ds-nt-action-tab ds-nt-learn-more-tab", text: "Learn Motivation/Pitfall"});

		const argumentContainer = actionsContainer.createEl("div", {cls: "ds-nt-action-container ds-nt-argument-container"});

		const argModifiers = argumentContainer.createEl("div", {cls: "ds-nt-argument-modifiers"});

		const motivations = yaml["motivations"];
		if (motivations) {
			argModifiers.createEl("div", {
				cls: "ds-nt-argument-modifier-motivation-header",
				text: "Appeals to Motivation"
			});
			motivations.forEach(mot => {
				const motLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-motivation-line"});
				const motCB = motLine.createEl("input", {cls: "ds-nt-argument-modifier-motivation-checkbox", type: "checkbox"});
				motLine.createEl("label", {cls: "ds-nt-argument-modifier-motivation-label", text: mot["name"].trim()});
				motCB.addEventListener("change", evt => NegotiationTrackerProcessor.updateArgument(argumentContainer));
			});
		}

		const pitfalls = yaml["pitfalls"];
		if (pitfalls) {
			argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-pitfall-header", text: "Mentions Pitfall"});
			pitfalls.forEach(pit => {
				const pitLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-pitfall-line"});
				const pitCB = pitLine.createEl("input", {cls: "ds-nt-argument-modifier-pitfall-checkbox", type: "checkbox"});
				pitLine.createEl("label", {cls: "ds-nt-argument-modifier-pitfall-label", text: pit["name"].trim()});
				pitCB.addEventListener("change", evt => NegotiationTrackerProcessor.updateArgument(argumentContainer));
			});
		}

		const lieLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-lie-line"});
		const lieCheckbox = lieLine.createEl("input", {cls: "ds-nt-argument-modifier-lie-checkbox", type: "checkbox"})
		lieLine.createEl("label", {cls: "ds-nt-argument-modifier-lie-label", text: "Caught in a lie"});
		lieCheckbox.addEventListener("change", evt => NegotiationTrackerProcessor.updateArgument(argumentContainer));

		// TODO - same arg twice rules!

		const argPowerRoll = argumentContainer.createEl("div", {cls: "ds-nt-argument-power-roll"});

		const typeContainer = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-roll-line"});
		typeContainer.createEl("span", {cls: "pr-roll-value", text: "Power Roll + Reason, Intuition, or Presence"});

		const t1Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-1-line"});
		PowerRollProcessor.tier1Key(t1Container);
		t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value", text: "-1 Interest, -1 Patience"});

		const t2Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-2-line"});
		PowerRollProcessor.tier2Key(t2Container);
		t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value", text: "-1 Patience"});

		const t3Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-3-line"});
		PowerRollProcessor.tier3Key(t3Container);
		t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value", text: "+1 Interest, -1 Patience"});

		const critContainer = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-crit-line"});
		PowerRollProcessor.critKey(critContainer);
		critContainer.createEl("span", {cls: "pr-tier-value pr-crit-value", text: "+1 Interest"});
	}

	private static addMotivations(yaml: any, details: any) {
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

	private static addPitfalls(yaml: any, details: any) {
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

	private static updateArgument(argumentContainer: HTMLElement) {
		let usedMotivation = false;
		for (let motivationEle of argumentContainer.findAll(".ds-nt-argument-modifier-motivation-checkbox")) {
			if ((motivationEle as HTMLInputElement).checked) {
				usedMotivation = true;
			}
		}
		let usedPitfall = false;
		for (let pitfallEle of argumentContainer.findAll(".ds-nt-argument-modifier-pitfall-checkbox")) {
			if ((pitfallEle as HTMLInputElement).checked) {
				usedPitfall = true;
			}
		}
		let caughtLying = (argumentContainer.findAll(".ds-nt-argument-modifier-lie-checkbox")[0] as HTMLInputElement).checked;

		const prTiers = NegotiationTrackerProcessor.recalculateArgument(usedMotivation, usedPitfall, caughtLying);

		(argumentContainer.findAll(".pr-tier-1-value")[0] as HTMLInputElement).setText(prTiers.t1);
		(argumentContainer.findAll(".pr-tier-2-value")[0] as HTMLInputElement).setText(prTiers.t2);
		(argumentContainer.findAll(".pr-tier-3-value")[0] as HTMLInputElement).setText(prTiers.t3);
		(argumentContainer.findAll(".pr-crit-value")[0] as HTMLInputElement).setText(prTiers.crit);
	}

	private static recalculateArgument(usedMotivation: boolean, usedPitfall: boolean, caughtLying: boolean): PowerRollTiers {
		if (usedPitfall && !caughtLying) {
			return new PowerRollTiers(
				"-1 Interest, -1 Patience",
				"-1 Interest, -1 Patience",
				"-1 Interest, -1 Patience",
				"-1 Interest, -1 Patience");
		} else if (usedPitfall && caughtLying) {
			return new PowerRollTiers(
				"-2 Interest, -1 Patience",
				"-2 Interest, -1 Patience",
				"-2 Interest, -1 Patience",
				"-2 Interest, -1 Patience");
		} else if (usedMotivation && !caughtLying) {
			return new PowerRollTiers(
				"-1 Patience",
				"+1 Interest, -1 Patience",
				"+1 Interest",
				"+1 Interest");
		} else if (usedMotivation && caughtLying) {
			return new PowerRollTiers(
				"-1 Interest, -1 Patience",
				"-1 Patience",
				"No effect",
				"No effect");
		} else if (!usedMotivation && !caughtLying) {
			return new PowerRollTiers(
				"-1 Interest, -1 Patience",
				"-1 Patience",
				"+1 Interest, -1 Patience",
				"+1 Interest");
		} else if (!usedMotivation && caughtLying) {
			return new PowerRollTiers(
				"-2 Interest, -1 Patience",
				"-1 Interest, -1 Patience",
				"-1 Patience",
				"No effect");
		}
		throw new Error("Failed to make power roll for those combo")
	}
}
