import {App, MarkdownPostProcessorContext, setTooltip, stringifyYaml, TFile} from "obsidian";
import {NegotiationData, parseNegotiationData} from "../model/NegotiationData";
import {PowerRollProcessor} from "./powerRollProcessor";

export class NegotiationTrackerProcessor {
	private app: App;
	private data: NegotiationData;
	private ctx: MarkdownPostProcessorContext;

	constructor(app: App) {
		this.app = app;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		this.ctx = ctx;
		this.data = parseNegotiationData(source);

		const container = el.createEl('div', { cls: "ds-nt-container" });

		const name = this.data.name;
		if (name) {
			const nameContainer = container.createEl("div", { cls: "ds-nt-name-line" });
			nameContainer.createEl("span", { cls: "ds-nt-name-value", text: "Negotiation: " + name.trim() });
		}

		const trackers = container.createEl("div", { cls: "ds-nt-trackers" });
		this.addPatience(trackers);
		this.addInterest(trackers);
		this.addActions(trackers, container);

		const details = container.createEl("div", { cls: "ds-nt-details" });
		this.addMotivations(details);
		this.addPitfalls(details);
	}

	// Add Patience Tracker
	private addPatience(trackers: HTMLElement) {
		const patienceCont = trackers.createEl("div", { cls: "ds-nt-patience-container" });
		patienceCont.createEl("div", { cls: "ds-nt-patience-label", text: "Patience" });

		const bubbleCont = patienceCont.createEl("div", { cls: "ds-nt-patience-bubble-container" });
		for (let i = 0; i <= 5; i++) {
			const bubble = bubbleCont.createEl("div", {
				cls: `ds-nt-patience-bubble ds-nt-patience-bubble-${i}`,
				text: `${i}`
			});
			bubble.addEventListener("click", () => this.setPatience(i, trackers));
		}

		// Initialize Patience Display
		if (this.data.current_patience != null) {
			this.setPatience(this.data.current_patience, trackers);
		}
	}

	// Set Patience Level
	private setPatience(newPatience: number, container: HTMLElement) {
		for (let i = 0; i <= 5; i++) {
			const bubble = container.querySelector(`.ds-nt-patience-bubble-${i}`) as HTMLElement;
			if (i > newPatience) {
				bubble.classList.remove("ds-nt-patience-selected");
			} else {
				bubble.classList.add("ds-nt-patience-selected");
			}
		}
		// Update Data and Save
		this.data.current_patience = newPatience;
		this.updateCodeBlock();
	}

	// Add Interest Tracker
	private addInterest(trackers: HTMLElement) {
		const interestCont = trackers.createEl("div", { cls: "ds-nt-interest-container" });
		interestCont.createEl("div", { cls: "ds-nt-interest-header", text: "Interest" });

		const offerCont = interestCont.createEl("div", { cls: "ds-nt-interest-offer-container" });

		for (let i = 5; i >= 0; i--) {
			const iLine = offerCont.createEl("div", { cls: `ds-nt-interest-line ds-nt-interest-${i}-line` });
			const label = iLine.createEl("div", { cls: `ds-nt-interest-label ds-nt-interest-${i}-label`, text: `${i}` });
			label.addEventListener("click", () => this.setInterest(i, trackers));

			const offerText = this.data[`i${i}`] ?? `Offer at Interest ${i}`;
			iLine.createEl("div", { cls: `ds-nt-interest-offer ds-nt-interest-${i}-offer`, text: offerText });
		}

		// Initialize Interest Display
		if (this.data.current_interest != null) {
			this.setInterest(this.data.current_interest, trackers);
		}
	}

	// Set Interest Level
	private setInterest(newInterest: number, container: HTMLElement) {
		for (let i = 0; i <= 5; i++) {
			const line = container.querySelector(`.ds-nt-interest-${i}-line`) as HTMLElement;
			const offer = line.querySelector(`.ds-nt-interest-offer`) as HTMLElement;
			if (i > newInterest) {
				line.classList.remove("ds-nt-interest-selected");
			} else {
				line.classList.add("ds-nt-interest-selected");
			}
			if (i < newInterest) {
				offer.classList.add("ds-nt-interest-faded");
			} else {
				offer.classList.remove("ds-nt-interest-faded");
			}
		}
		// Update Data and Save
		this.data.current_interest = newInterest;
		this.updateCodeBlock();
	}

	// Add Actions with Tabs
	private addActions(trackers: HTMLElement, root: HTMLElement) {
		const actionsContainer = trackers.createEl("div", { cls: "ds-nt-actions-container" });

		// Create Tabs
		const actionTab = actionsContainer.createEl("div", { cls: "ds-nt-action-tabs" });
		const argumentTab = actionTab.createEl("div", { cls: "ds-nt-action-tab ds-nt-argument-tab active", text: "Make an Argument" });
		const learnMoreTab = actionTab.createEl("div", { cls: "ds-nt-action-tab ds-nt-learn-more-tab", text: "Learn Motivation/Pitfall" });

		// Create Content Containers
		const argumentContainer = actionsContainer.createEl("div", { cls: "ds-nt-action-container ds-nt-argument-container active" });
		const learnMoreContainer = actionsContainer.createEl("div", { cls: "ds-nt-action-container ds-nt-learn-more-container" });

		// Tab Switching Functionality
		argumentTab.addEventListener('click', () => {
			argumentTab.classList.add('active');
			learnMoreTab.classList.remove('active');
			argumentContainer.classList.add('active');
			learnMoreContainer.classList.remove('active');
		});

		learnMoreTab.addEventListener('click', () => {
			learnMoreTab.classList.add('active');
			argumentTab.classList.remove('active');
			learnMoreContainer.classList.add('active');
			argumentContainer.classList.remove('active');
		});

		// Populate Content for Each Tab
		this.populateArgumentTab(argumentContainer, root);
		this.populateLearnMoreTab(learnMoreContainer);
	}

	// Populate Argument Tab
	private populateArgumentTab(argumentContainer: HTMLElement, root: HTMLElement) {
		const argumentBody = argumentContainer.createEl("div", { cls: "ds-nt-argument-body" });
		const argModifiers = argumentBody.createEl("div", { cls: "ds-nt-argument-modifiers" });

		// Motivations
		if (this.data.motivations.length > 0) {
			const motHeader = argModifiers.createEl("div", {
				cls: "ds-nt-argument-modifier-motivation-header",
				text: "Appeals to Motivation"
			});
			setTooltip(motHeader, "If the Heroes appeal to a Motivation (w/o a Pitfall): Difficulty of the Argument Test is Easy.");

			this.data.motivations.forEach(mot => {
				const motLine = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-motivation-line" });
				const motCB = motLine.createEl("input", {
					cls: "ds-nt-argument-modifier-motivation-checkbox",
					type: "checkbox"
				}) as HTMLInputElement;
				const motLabel = motLine.createEl("label", { cls: "ds-nt-argument-modifier-motivation-label", text: mot.name });
				motLabel.setAttribute('data-motivation-name', mot.name); // Set data attribute
				motCB.checked = mot.isMentioned ?? false;
				motCB.addEventListener("change", () => {
					mot.isMentioned = motCB.checked;
					this.updateArgument(root);
					this.updateCodeBlock();
				});
			});
		}

		// Reused Motivation
		const reuseMotivationLine = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-reuse-motivation-line" });
		reuseMotivationLine.title = "If the Heroes try to appeal to a Motivation multiple times: Interest remains and Patience decreases by 1.";
		const reuseMotivationLabel = reuseMotivationLine.createEl("label", { cls: "ds-nt-argument-modifier-reuse-motivation-label" });
		const reuseMotivationCheckbox = reuseMotivationLabel.createEl("input", {
			cls: "ds-nt-argument-modifier-reuse-motivation-checkbox",
			type: "checkbox"
		}) as HTMLInputElement;
		reuseMotivationLabel.createEl("span", {
			cls: "ds-nt-argument-modifier-reuse-motivation-text",
			text: "Reused Motivation"
		});
		reuseMotivationCheckbox.addEventListener("change", () => {
			this.updateArgument(root);
			this.updateCodeBlock();
		});

		// Pitfalls
		if (this.data.pitfalls.length > 0) {
			const pitHeader = argModifiers.createEl("div", {
				cls: "ds-nt-argument-modifier-pitfall-header",
				text: "Mentions Pitfall"
			});
			pitHeader.title = "If the Heroes mention a Pitfall: Argument fails and the NPC may warn Heroes.";

			this.data.pitfalls.forEach(pit => {
				const pitLine = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-pitfall-line" });
				const pitCB = pitLine.createEl("input", {
					cls: "ds-nt-argument-modifier-pitfall-checkbox",
					type: "checkbox"
				}) as HTMLInputElement;
				pitLine.createEl("label", { cls: "ds-nt-argument-modifier-pitfall-label", text: pit.name });
				pitCB.checked = pit.isMentioned ?? false;
				pitCB.addEventListener("change", () => {
					pit.isMentioned = pitCB.checked;
					this.updateArgument(root);
					this.updateCodeBlock();
				});
			});
		}

		// Lie used
		const lieLine = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-lie-line" });
		lieLine.title =  "If the NPC catches a lie: Arguments that fail to increase Interest will lose an additional Interest.";
		const lieCheckbox = lieLine.createEl("input", { cls: "ds-nt-argument-modifier-lie-checkbox", type: "checkbox" }) as HTMLInputElement;
		lieLine.createEl("label", { cls: "ds-nt-argument-modifier-lie-label", text: "Caught in a lie" });
		lieCheckbox.addEventListener("change", () => {
			this.updateArgument(root);
			this.updateCodeBlock();
		});

		// Same Argument
		const sameArgLine = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-same-arg-line" });
		sameArgLine.title = "If the Heroes try to use the same Argument (w/o Motivation): Test automatically gets tier-1 result.";
		const sameArgLabel = sameArgLine.createEl("label", { cls: "ds-nt-argument-modifier-same-arg-label" });
		const sameArgCheckbox = sameArgLabel.createEl("input", {
			cls: "ds-nt-argument-modifier-same-arg-checkbox",
			type: "checkbox"
		}) as HTMLInputElement;
		sameArgLabel.createEl("span", { cls: "ds-nt-argument-modifier-same-arg-text", text: "Same Argument" });
		sameArgCheckbox.addEventListener("change", () => {
			this.updateArgument(root);
			this.updateCodeBlock();
		});

		// Power Roll Display
		const argPowerRoll = argumentBody.createEl("div", { cls: "ds-nt-argument-power-roll" });

		const typeContainer = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-roll-line" });
		typeContainer.createEl("span", { cls: "pr-roll-value", text: "Power Roll + Reason, Intuition, or Presence" });

		const t1Container = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-1-line" });
		PowerRollProcessor.tier1Key(t1Container);
		t1Container.createEl("span", { cls: "pr-tier-value pr-tier-1-value", text: "" });

		const t2Container = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-2-line" });
		PowerRollProcessor.tier2Key(t2Container);
		t2Container.createEl("span", { cls: "pr-tier-value pr-tier-2-value", text: "" });

		const t3Container = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-tier-line pr-tier-3-line" });
		PowerRollProcessor.tier3Key(t3Container);
		t3Container.createEl("span", { cls: "pr-tier-value pr-tier-3-value", text: "" });

		const critContainer = argPowerRoll.createEl("div", { cls: "pr-detail-line pr-tier-line pr-crit-line" });
		PowerRollProcessor.critKey(critContainer);
		critContainer.createEl("span", { cls: "pr-tier-value pr-crit-value", text: "" });

		// Update the argument for initial state
		this.updateArgument(root);
	}

	// Populate Learn More Tab
	private populateLearnMoreTab(learnMoreContainer: HTMLElement) {
		const learnMoreBody = learnMoreContainer.createEl("div", { cls: "ds-nt-learn-more-body" });
		// Add content for learning motivations and pitfalls
		learnMoreBody.createEl("p", { text: "Content for learning motivations and pitfalls goes here." });
	}

	// Add Motivations
	private addMotivations(details: HTMLElement) {
		if (this.data.motivations.length > 0) {
			const motivationsCont = details.createEl("div", { cls: "ds-nt-motivations" });
			motivationsCont.createEl("div", { cls: "ds-nt-details-header ds-nt-motivation-header", text: "Motivations" });
			const motivationList = motivationsCont.createEl("div", { cls: "ds-nt-motivation-list" });

			this.data.motivations.forEach(mot => {
				const label = motivationList.createEl("label", { cls: "ds-nt-details-label ds-nt-motivation-label" });
				label.title = "Check Motivations that have already been appealed to.";
				const checkbox = label.createEl("input", { cls: "ds-nt-details-checkbox ds-nt-motivation-checkbox", type: "checkbox" }) as HTMLInputElement;
				checkbox.checked = mot.isMentioned ?? false;
				label.createEl("span", { cls: "ds-nt-details-name ds-nt-motivation-name", text: mot.name + ": " });
				label.createEl("span", { cls: "ds-nt-details-reason ds-nt-motivation-reason", text: mot.reason });
				checkbox.addEventListener("change", () => {
					mot.isMentioned = checkbox.checked;
					this.updateArgument(details);
					this.updateCodeBlock();
				});
			});
		}
	}

	// Add Pitfalls
	private addPitfalls(details: HTMLElement) {
		if (this.data.pitfalls.length > 0) {
			const pitfallsCont = details.createEl("div", { cls: "ds-nt-pitfalls" });
			pitfallsCont.createEl("div", { cls: "ds-nt-details-header ds-nt-pitfall-header", text: "Pitfalls" });
			const pitfallList = pitfallsCont.createEl("div", { cls: "ds-nt-pitfall-list" });

			this.data.pitfalls.forEach(pit => {
				const label = pitfallList.createEl("label", { cls: "ds-nt-details-label ds-nt-pitfall-label" });
				// Uncomment if you want checkboxes for pitfalls
				// const checkbox = label.createEl("input", { cls: "ds-nt-details-checkbox ds-nt-pitfall-checkbox", type: "checkbox" }) as HTMLInputElement;
				label.createEl("span", { cls: "ds-nt-details-name ds-nt-pitfall-name", text: pit.name + ": " });
				label.createEl("span", { cls: "ds-nt-details-reason ds-nt-pitfall-reason", text: pit.reason });
			});
		}
	}

	// Update Argument Based on Current State
	private updateArgument(parent: HTMLElement) {
		const lieCheckbox = parent.querySelector(".ds-nt-argument-modifier-lie-checkbox") as HTMLInputElement;
		const sameArgumentCheckbox = parent.querySelector(".ds-nt-argument-modifier-same-arg-checkbox") as HTMLInputElement;
		const reuseMotivationCheckbox = parent.querySelector(".ds-nt-argument-modifier-reuse-motivation-checkbox") as HTMLInputElement;

		const usedMotivation = this.data.motivations.some(mot => mot.isMentioned);
		const usedPitfall = this.data.pitfalls.some(pit => pit.isMentioned);

		// Enable/Disable Reuse Motivation Checkbox
		reuseMotivationCheckbox.disabled = !usedMotivation;

		// Enable/Disable Same Argument Checkbox
		sameArgumentCheckbox.disabled = usedMotivation;

		const caughtLying = lieCheckbox.checked;
		const reusedMotivation = reuseMotivationCheckbox.checked && !reuseMotivationCheckbox.disabled;
		const sameArgument = sameArgumentCheckbox.checked;

		const prTiers = this.recalculateArgument(usedMotivation, usedPitfall, caughtLying, reusedMotivation, sameArgument);

		(parent.querySelector(".pr-tier-1-value") as HTMLElement).setText(prTiers.t1);
		(parent.querySelector(".pr-tier-2-value") as HTMLElement).setText(prTiers.t2);
		(parent.querySelector(".pr-tier-3-value") as HTMLElement).setText(prTiers.t3);
		(parent.querySelector(".pr-crit-value") as HTMLElement).setText(prTiers.crit);

		// Update Motivation Labels to Indicate Previous Use
		const argMotLabels = parent.querySelectorAll(".ds-nt-argument-modifier-motivation-label");
		argMotLabels.forEach(argMotLabel => {
			const motName = argMotLabel.getAttribute('data-motivation-name');
			const mot = this.data.motivations.find(m => m.name === motName);
			if (mot) {
				argMotLabel.classList.toggle("ds-nt-arg-motivation-used", mot.isMentioned ?? false);
				if (mot.isMentioned) {
					setTooltip(argMotLabel as HTMLElement, "This Motivation was used in a previous Argument.");
				} else {
					setTooltip(argMotLabel as HTMLElement, "");
				}
			}
		});
	}

	// Recalculate Argument Results
	private recalculateArgument(usedMotivation: boolean, usedPitfall: boolean, caughtLying: boolean, reusedMotivation: boolean, sameArgument: boolean): PowerRollTiers {
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

	// Baseline Argument Results
	private baselineArgument(usedMotivation: boolean, usedPitfall: boolean, reusedMotivation: boolean, sameArgument: boolean): NegotiationResult {
		// Used pitfall
		if (usedPitfall) {
			return new NegotiationResult(
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
			);
		}

		// Reused Motivation
		if (reusedMotivation) {
			return new NegotiationResult(
				new NegotiationTierResult(0, -1),
				new NegotiationTierResult(0, -1),
				new NegotiationTierResult(0, -1),
				new NegotiationTierResult(0, -1),
			);
		}

		// Used Motivation
		if (usedMotivation) {
			return new NegotiationResult(
				new NegotiationTierResult(0, -1),
				new NegotiationTierResult(+1, -1),
				new NegotiationTierResult(+1, 0),
				new NegotiationTierResult(+1, 0),
			);
		}

		// Same Argument without Motivation
		if (sameArgument) {
			return new NegotiationResult(
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1),
				new NegotiationTierResult(-1, -1)
			);
		}

		// Normal Argument
		return new NegotiationResult(
			new NegotiationTierResult(-1, -1),
			new NegotiationTierResult(0, -1),
			new NegotiationTierResult(+1, -1),
			new NegotiationTierResult(+1, 0),
		);
	}

	// Update the Code Block in the Markdown File
	private async updateCodeBlock(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const section = this.ctx.getSectionInfo(this.ctx.el);
		if (!section) return;

		const { lineStart, lineEnd } = section;

		// Reconstruct the code block with the updated data
		const newCodeBlockContent = [];
		newCodeBlockContent.push('```ds-nt');
		newCodeBlockContent.push(stringifyYaml(this.data).trim());
		newCodeBlockContent.push('```');

		// Replace the old code block with the new one
		lines.splice(lineStart, lineEnd - lineStart + 1, ...newCodeBlockContent);

		const newContent = lines.join('\n');

		// Write the updated content back to the file
		await this.app.vault.modify(file, newContent);
	}
}

// Helper Classes
export class PowerRollTiers {
	public t1: string;
	public t2: string;
	public t3: string;
	public crit: string;

	constructor(t1: string, t2: string, t3: string, crit: string) {
		this.t1 = t1;
		this.t2 = t2;
		this.t3 = t3;
		this.crit = crit;
	}
}

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
		);
	}
}

export class NegotiationTierResult {
	public interest: number;
	public patience: number;
	public other: string;

	constructor(interest: number, patience: number, other?: string) {
		this.interest = interest;
		this.patience = patience;
		this.other = other ?? "";
	}

	public toString = (): string => {
		let result = "";
		if (this.interest != 0) {
			result += `${this.interest > 0 ? '+' : ''}${this.interest} Interest`;
		}
		if (this.patience != 0) {
			if (result != "") {
				result += ", ";
			}
			result += `${this.patience > 0 ? '+' : ''}${this.patience} Patience`;
		}
		if (this.other != "") {
			if (result != "") {
				result += ", ";
			}
			result += this.other;
		}
		if (result == "") {
			result = "No effect";
		}
		return result;
	}
}
