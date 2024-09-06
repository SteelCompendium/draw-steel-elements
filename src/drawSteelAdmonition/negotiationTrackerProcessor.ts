import {MarkdownPostProcessorContext, parseYaml, setTooltip} from "obsidian";
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
		NegotiationTrackerProcessor.addPatience(trackers, yaml);
		NegotiationTrackerProcessor.addInterest(trackers, yaml);
		NegotiationTrackerProcessor.addActions(yaml, trackers, container);

		const details = container.createEl("div", {cls: "ds-nt-details"});
		NegotiationTrackerProcessor.addMotivations(yaml, details, container);
		NegotiationTrackerProcessor.addPitfalls(yaml, details);
	}

	private static addPatience(trackers: any, yaml: any) {
		const patienceCont = trackers.createEl("div", {cls: "ds-nt-patience-container"});
		patienceCont.createEl("div", {cls: "ds-nt-patience-label", text: "Patience"});

		const bubbleCont = patienceCont.createEl("div", {cls: "ds-nt-patience-bubble-container"});
		bubbleCont.createEl("div", {cls: "ds-nt-patience-bubble ds-nt-patience-bubble-0", text: "0"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setPatience(0, trackers));
		bubbleCont.createEl("div", {cls: "ds-nt-patience-bubble ds-nt-patience-bubble-1", text: "1"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setPatience(1, trackers));
		bubbleCont.createEl("div", {cls: "ds-nt-patience-bubble ds-nt-patience-bubble-2", text: "2"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setPatience(2, trackers));
		bubbleCont.createEl("div", {cls: "ds-nt-patience-bubble ds-nt-patience-bubble-3", text: "3"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setPatience(3, trackers));
		bubbleCont.createEl("div", {cls: "ds-nt-patience-bubble ds-nt-patience-bubble-4", text: "4"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setPatience(4, trackers));
		bubbleCont.createEl("div", {cls: "ds-nt-patience-bubble ds-nt-patience-bubble-5", text: "5"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setPatience(5, trackers));

		const initialPatience = yaml["initial_patience"];
		if (initialPatience) {
			NegotiationTrackerProcessor.setPatience(initialPatience, trackers)
		}
	}

	private static addInterest(trackers: any, yaml: any) {
		const interestCont = trackers.createEl("div", {cls: "ds-nt-interest-container"});
		interestCont.createEl("div", {cls: "ds-nt-interest-header", text: "Interest"});

		const offerCont = interestCont.createEl("div", {cls: "ds-nt-interest-offer-container"});

		const i5Line = offerCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-5-line"});
		i5Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-5-label", text: "5"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setInterest(5, trackers));
		i5Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-5-offer", text: yaml["i5"]});

		const i4Line = offerCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-4-line"});
		i4Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-4-label", text: "4"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setInterest(4, trackers));
		i4Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-4-offer", text: yaml["i4"]});

		const i3Line = offerCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-3-line"});
		i3Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-3-label", text: "3"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setInterest(3, trackers));
		i3Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-3-offer", text: yaml["i3"]});

		const i2Line = offerCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-2-line"});
		i2Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-2-label", text: "2"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setInterest(2, trackers));
		i2Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-2-offer", text: yaml["i2"]});

		const i1Line = offerCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-1-line"});
		i1Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-1-label", text: "1"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setInterest(1, trackers));
		i1Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-1-offer", text: yaml["i1"]});

		const i0Line = offerCont.createEl("div", {cls: "ds-nt-interest-line ds-nt-interest-0-line"});
		i0Line.createEl("div", {cls: "ds-nt-interest-label ds-nt-interest-0-label", text: "0"})
			.addEventListener("click", evt => NegotiationTrackerProcessor.setInterest(0, trackers));
		i0Line.createEl("div", {cls: "ds-nt-interest-offer ds-nt-interest-0-offer", text: yaml["i0"]});

		const initialInterest = yaml["initial_interest"];
		if (initialInterest) {
			NegotiationTrackerProcessor.setInterest(initialInterest, trackers)
		}
	}

	private static addActions(yaml: any, trackers: any, root: HTMLElement) {
		const actionsContainer = trackers.createEl("div", {cls: "ds-nt-actions-container"});

		const actionTab = actionsContainer.createEl("div", {cls: "ds-nt-action-tabs"});
		actionTab.createEl("div", {cls: "ds-nt-action-tab ds-nt-argument-tab", text: "Make an Argument"});
		actionTab.createEl("div", {cls: "ds-nt-action-tab ds-nt-learn-more-tab", text: "Learn Motivation/Pitfall"});

		const argumentContainer = actionsContainer.createEl("div", {cls: "ds-nt-action-container ds-nt-argument-container"});

		const argumentBody = argumentContainer.createEl("div", {cls: "ds-nt-argument-body"});

		const argModifiers = argumentBody.createEl("div", {cls: "ds-nt-argument-modifiers"});

		// Motivations
		const motivations = yaml["motivations"];
		if (motivations) {
			const motHeader = argModifiers.createEl("div", {
				cls: "ds-nt-argument-modifier-motivation-header",
				text: "Appeals to Motivation"
			});
			setTooltip(motHeader, "If the Heroes appeal to a Motivation (w/o a Pitfall): Difficulty of the Argument Test is Easy.");
			motivations.forEach(mot => {
				const motLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-motivation-line"});
				const motCB = motLine.createEl("input", {
					cls: "ds-nt-argument-modifier-motivation-checkbox",
					type: "checkbox"
				});
				motLine.createEl("label", {cls: "ds-nt-argument-modifier-motivation-label", text: mot["name"].trim()});
				motCB.addEventListener("change", evt => NegotiationTrackerProcessor.updateArgument(root));
			});
		}

		// Reused Motivation
		const reuseMotivationLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-reuse-motivation-line"});
		setTooltip(reuseMotivationLine, "If the Heroes try to appeal to a Motivation multiple times: Interest remains and Patience decreases by 1.");
		const reuseMotivationLabel = reuseMotivationLine.createEl("label", {cls: "ds-nt-argument-modifier-reuse-motivation-label"});
		const reuseMotivationCheckbox = reuseMotivationLabel.createEl("input", {
			cls: "ds-nt-argument-modifier-reuse-motivation-checkbox",
			type: "checkbox"
		})
		reuseMotivationLabel.createEl("span", {
			cls: "ds-nt-argument-modifier-reuse-motivation-text",
			text: "Reused Motivation"
		});
		reuseMotivationCheckbox.addEventListener("change", evt => NegotiationTrackerProcessor.updateArgument(root));

		// Pitfalls
		const pitfalls = yaml["pitfalls"];
		if (pitfalls) {
			const pitHeader = argModifiers.createEl("div", {
				cls: "ds-nt-argument-modifier-pitfall-header",
				text: "Mentions Pitfall"
			});
			setTooltip(pitHeader, "If the Heroes mention a Pitfall: Argument fails and the NPC may warn Heroes.");
			pitfalls.forEach(pit => {
				const pitLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-pitfall-line"});
				const pitCB = pitLine.createEl("input", {
					cls: "ds-nt-argument-modifier-pitfall-checkbox",
					type: "checkbox"
				});
				pitLine.createEl("label", {cls: "ds-nt-argument-modifier-pitfall-label", text: pit["name"].trim()});
				pitCB.addEventListener("change", evt => NegotiationTrackerProcessor.updateArgument(root));
			});
		}

		// Lie used
		const lieLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-lie-line"});
		setTooltip(lieLine, "If the NPC catches a lie: Arguments that fail to increase Interest will lose an additional Interest.");
		const lieCheckbox = lieLine.createEl("input", {cls: "ds-nt-argument-modifier-lie-checkbox", type: "checkbox"})
		lieLine.createEl("label", {cls: "ds-nt-argument-modifier-lie-label", text: "Caught in a lie"});
		lieCheckbox.addEventListener("change", evt => NegotiationTrackerProcessor.updateArgument(root));

		// Same Argument
		const sameArgLine = argModifiers.createEl("div", {cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-same-arg-line"});
		setTooltip(sameArgLine, "If the Heroes try to use the same Argument (w/o Motivation): Test automatically gets tier-1 result.");
		const sameArgLabel = sameArgLine.createEl("label", {cls: "ds-nt-argument-modifier-same-arg-label"});
		const sameArgCheckbox = sameArgLabel.createEl("input", {
			cls: "ds-nt-argument-modifier-same-arg-checkbox",
			type: "checkbox"
		})
		sameArgLabel.createEl("span", {cls: "ds-nt-argument-modifier-same-arg-text", text: "Same Argument"})
		sameArgCheckbox.addEventListener("change", evt => NegotiationTrackerProcessor.updateArgument(root));

		// Power Roll
		const argPowerRoll = argumentBody.createEl("div", {cls: "ds-nt-argument-power-roll"});

		const typeContainer = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-roll-line"});
		typeContainer.createEl("span", {cls: "pr-roll-value", text: "Power Roll + Reason, Intuition, or Presence"});

		const t1Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-1-line"});
		PowerRollProcessor.tier1Key(t1Container);
		t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value", text: ""});

		const t2Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-2-line"});
		PowerRollProcessor.tier2Key(t2Container);
		t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value", text: ""});

		const t3Container = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-tier-3-line"});
		PowerRollProcessor.tier3Key(t3Container);
		t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value", text: ""});

		const critContainer = argPowerRoll.createEl("div", {cls: "pr-detail-line pr-tier-line pr-crit-line"});
		PowerRollProcessor.critKey(critContainer);
		critContainer.createEl("span", {cls: "pr-tier-value pr-crit-value", text: ""});

		// TODO
		// Footer
		argumentContainer.createEl("div", {cls: "ds-nt-argument-footer", text: ""});

		// Update the argument for initial state
		NegotiationTrackerProcessor.updateArgument(root)
	}

	private static addMotivations(yaml: any, details: any, root: HTMLElement) {
		const motivations = yaml["motivations"];
		if (motivations) {
			const motivationsCont = details.createEl("div", {cls: "ds-nt-motivations"});
			motivationsCont.createEl("div", {cls: "ds-nt-details-header ds-nt-motivation-header", text: "Motivations"});
			const motivationList = details.createEl("div", {cls: "ds-nt-motivation-list"});

			motivations.forEach(mot => {
				const label = motivationList.createEl("label", {cls: "ds-nt-details-label ds-nt-motivation-label"})
				setTooltip(label, "Check Motivations that have already been appealed to.");
				label.addEventListener("click", evt => NegotiationTrackerProcessor.updateArgument(root));
				label.createEl("input", {cls: "ds-nt-details-checkbox ds-nt-motivation-checkbox", type: "checkbox"});
				label.createEl("span", {cls: "ds-nt-details-name ds-nt-motivation-name", text: mot["name"].trim() + ": "});
				label.createEl("span", {cls: "ds-nt-details-reason ds-nt-motivation-reason", text: mot["reason"].trim()});
			});
		}
	}

	private static addPitfalls(yaml: any, details: any) {
		const pitfalls = yaml["pitfalls"];
		if (pitfalls) {
			const pitfallsCont = details.createEl("div", {cls: "ds-nt-pitfalls"});
			pitfallsCont.createEl("div", {cls: "ds-nt-details-header ds-nt-pitfall-header", text: "Pitfalls"});
			const pitfallList = details.createEl("div", {cls: "ds-nt-pitfall-list"});

			pitfalls.forEach(pit => {
				const label = pitfallList.createEl("label", {cls: "ds-nt-details-label ds-nt-pitfall-label"});
				// label.createEl("input", {cls: "ds-nt-details-checkbox ds-nt-pitfall-checkbox", type: "checkbox"});
				label.createEl("span", {cls: "ds-nt-details-name ds-nt-pitfall-name", text: pit["name"].trim() + ": "});
				label.createEl("span", {cls: "ds-nt-details-reason ds-nt-pitfall-reason", text: pit["reason"].trim()});
			});
		}
	}

	// Updates the interest display to reflect the new interest level
	private static setPatience(newPatience: number, container: HTMLElement) {
		for (let i = 0; i <= 5; i++) {
			const bubble = container.find(".ds-nt-patience-bubble-" + i) as HTMLInputElement;
			if (i > newPatience) {
				bubble.removeClass("ds-nt-patience-selected");
			} else {
				bubble.addClass("ds-nt-patience-selected");
			}
		}
	}

	// Updates the interest display to reflect the new interest level
	private static setInterest(newInterest: number, container: HTMLElement) {
		for (let i = 0; i <= 5; i++) {
			const line = container.find(".ds-nt-interest-" + i + "-line") as HTMLInputElement;
			const offer = (line.find(".ds-nt-interest-offer") as HTMLElement)
			if (i > newInterest) {
				line.removeClass("ds-nt-interest-selected");
			} else {
				line.addClass("ds-nt-interest-selected");
			}
			if (i < newInterest) {
				offer.addClass("ds-nt-interest-faded");
			} else {
				offer.removeClass("ds-nt-interest-faded");
			}
		}
	}

	// Updates an argument (options and results) based on the current state of the argument options
	private static updateArgument(parent: HTMLElement) {
		let lieCheckbox = parent.findAll(".ds-nt-argument-modifier-lie-checkbox")[0] as HTMLInputElement;
		let sameArgumentCheckbox = parent.findAll(".ds-nt-argument-modifier-same-arg-checkbox")[0] as HTMLInputElement;
		let reuseMotivationCheckbox = parent.findAll(".ds-nt-argument-modifier-reuse-motivation-checkbox")[0] as HTMLInputElement;

		let usedMotivation = false;
		for (let motivationEle of parent.findAll(".ds-nt-argument-modifier-motivation-checkbox")) {
			// TODO - if the matching Motivation Detail is checked (previously used) the reusedMotivation checkbox should auto-check
			if ((motivationEle as HTMLInputElement).checked) {
				usedMotivation = true;
			}
		}
		let usedPitfall = false;
		for (let pitfallEle of parent.findAll(".ds-nt-argument-modifier-pitfall-checkbox")) {
			if ((pitfallEle as HTMLInputElement).checked) {
				usedPitfall = true;
			}
		}

		// enable "Reused Motivation" checkbox only if motivation used
		reuseMotivationCheckbox.disabled = !usedMotivation;
		// enable "Same Argument" checkbox only if motivation not used
		sameArgumentCheckbox.disabled = usedMotivation;

		let caughtLying = lieCheckbox.checked;
		let reusedMotivation = reuseMotivationCheckbox.checked && !reuseMotivationCheckbox.disabled;
		let sameArgument = sameArgumentCheckbox.checked;

		const prTiers = NegotiationTrackerProcessor.recalculateArgument(usedMotivation, usedPitfall, caughtLying, reusedMotivation, sameArgument);

		(parent.findAll(".pr-tier-1-value")[0] as HTMLInputElement).setText(prTiers.t1);
		(parent.findAll(".pr-tier-2-value")[0] as HTMLInputElement).setText(prTiers.t2);
		(parent.findAll(".pr-tier-3-value")[0] as HTMLInputElement).setText(prTiers.t3);
		(parent.findAll(".pr-crit-value")[0] as HTMLInputElement).setText(prTiers.crit);

		const motivationDetailLabels = parent.findAll(".ds-nt-motivation-label");
		// For all the Argument Motivations...
		parent.findAll(".ds-nt-argument-modifier-motivation-label").forEach(argMot => {
			const argMotivationName= argMot.getText();
			// Remove any previous markings
			argMot.removeClass("ds-nt-arg-motivation-used");

			// Iterate over all the Motivation Details...
			motivationDetailLabels.forEach(label => {
				const motivationDetailName = label.find(".ds-nt-motivation-name")?.getText();
				// ...to see if the names match and if the Motivation Detail is checked - then mark the Arg Motivation
				if (motivationDetailName?.contains(argMotivationName)) {
					if ((label.find(".ds-nt-motivation-checkbox") as HTMLInputElement).checked) {
						argMot.addClass("ds-nt-arg-motivation-used");
						setTooltip(argMot, "This Motivation was used in a previous Argument.");
					}
				}
			});
		});
	}

	// Returns the PowerRollTiers for an Argument
	private static recalculateArgument(usedMotivation: boolean, usedPitfall: boolean, caughtLying: boolean, reusedMotivation: boolean, sameArgument: boolean): PowerRollTiers {
		let result = this.baselineArgument(usedMotivation, usedPitfall, reusedMotivation, sameArgument);

		// Modify if caught lying
		if (caughtLying) {
			if (result.t1.interest <= 0) result.t1.interest -= 1;
			if (result.t2.interest <= 0) result.t2.interest -= 1;
			if (result.t3.interest <= 0) result.t3.interest -= 1;
			if (result.crit.interest <= 0) result.crit.interest -= 1;
		}

		return result.toPowerRollTiers();
	}

	// Returns the Negotiation Result given the type of argument being made.  Does NOT account for modifiers
	private static baselineArgument(usedMotivation: boolean, usedPitfall: boolean, reusedMotivation: boolean, sameArgument: boolean): NegotiationResult {
		// Used pitfall
		if (usedPitfall) {
			return new NegotiationResult(
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
			);
		}

		// Used same motivation a second time, no pitfall
		if (reusedMotivation) {
			if (usedMotivation) {
				console.log("[WARN|draw-steel-elements] Argument made with 'reusedMotivation', but 'usedMotivation' is false");
			}
			if (sameArgument) {
				console.log("[WARN|draw-steel-elements] Argument made with 'reusedMotivation', but 'sameArgument' is true - invalid state.");
			}
			return new NegotiationResult(
				new NegotiationTierResult(0, -1),
				new NegotiationTierResult(0, -1),
				new NegotiationTierResult(0, -1),
				new NegotiationTierResult(0, -1),
			);
		}

		// Used motivation without pitfall
		if (usedMotivation) {
			if (sameArgument) {
				console.log("[WARN|draw-steel-elements] Argument 'usedMotivation', but 'sameArgument' is true - invalid state.");
			}
			return new NegotiationResult(
				new NegotiationTierResult(0, -1),
				new NegotiationTierResult(+1, -1),
				new NegotiationTierResult(+1, 0),
				new NegotiationTierResult(+1, 0),
			);
		}

		// No motivation/pitfall, but used same argument twice
		if (sameArgument) {
			return new NegotiationResult(
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1)
			);
		}

		// No motivation/pitfall, normal argument
		return new NegotiationResult(
			new NegotiationTierResult(-1, -1),
			new NegotiationTierResult(0, -1),
			new NegotiationTierResult(+1, -1),
			new NegotiationTierResult(+1, 0),
		);
	}
}

// Represents the full result of a negotiation power roll
export class NegotiationResult {
	public t1: NegotiationTierResult;
	public t2: NegotiationTierResult;
	public t3: NegotiationTierResult;
	public crit: NegotiationTierResult;

	constructor(t1: NegotiationTierResult, t2: NegotiationTierResult, t3: NegotiationTierResult, crit: NegotiationTierResult) {
		this.t1 = t1;
		this.t2 = t2;
		this.t3 = t3;
		this.crit = crit;
	}

	toPowerRollTiers() {
		return new PowerRollTiers(
			this.t1.toString(),
			this.t2.toString(),
			this.t3.toString(),
			this.crit.toString(),
		)
	}
}

// Represents the result of a single negotiation power roll's tier
export class NegotiationTierResult {
	public interest: number;
	public patience: number;
	public other: string;

	constructor(interest: number, patience: number, other: string | void) {
		this.interest = interest;
		this.patience = patience;
		this.other = other ?? "";
	}

	public toString = (): string => {
		let result = ""
		if (this.interest != 0) {
			result += this.interest + " Interest"
		}
		if (this.patience != 0) {
			if (result != "") {
				result += ", "
			}
			result += this.patience + " Patience"
		}
		if (this.other != "") {
			if (result != "") {
				result += ", "
			}
			result += this.other
		}
		if (result == "") {
			result = "No effect"
		}
		return result;
	}
}
