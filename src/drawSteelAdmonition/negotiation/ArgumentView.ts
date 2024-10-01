import {App, MarkdownPostProcessorContext, setTooltip} from "obsidian";
import {NegotiationData} from "../../model/NegotiationData";
import {CodeBlocks} from "../../utils/CodeBlocks";
import {PowerRollProcessor} from "../powerRollProcessor";
import {ArgumentPowerRoll} from "../../model/Arguments";
import {MotivationsPitfallsView} from "./MotivationsPitfallsView";

export class ArgumentView {
	private app: App;
	private data: NegotiationData;
	private ctx: MarkdownPostProcessorContext;

	constructor(app: App, data: NegotiationData, ctx: MarkdownPostProcessorContext) {
		this.app = app;
		this.data = data;
		this.ctx = ctx;
	}

	// TODO - Do I need both of these args?
	public build(parent: HTMLElement, root: HTMLElement) {
		this.populateArgumentTab(parent, root);
	}

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
				motCB.checked = this.data.currentArgument.motivationsUsed.includes(mot.name);
				motCB.addEventListener("change", () => {
					if (motCB.checked) {
						if (!this.data.currentArgument.motivationsUsed.includes(mot.name)) {
							this.data.currentArgument.motivationsUsed.push(mot.name);
						}
						if (mot.hasBeenAppealedTo) {
							this.data.currentArgument.reusedMotivation = true;
						}
					} else {
						const index = this.data.currentArgument.motivationsUsed.indexOf(mot.name);
						if (index > -1) {
							this.data.currentArgument.motivationsUsed.splice(index, 1);
						}
					}

					this.updateArgument(root);
					CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
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
		reuseMotivationCheckbox.checked = this.data.currentArgument.reusedMotivation;
		reuseMotivationCheckbox.addEventListener("change", () => {
			this.data.currentArgument.reusedMotivation = reuseMotivationCheckbox.checked;
			this.updateArgument(root);
			CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
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
				pitCB.checked = this.data.currentArgument.pitfallsUsed.includes(pit.name);
				pitCB.addEventListener("change", () => {
					if (pitCB.checked) {
						if (!this.data.currentArgument.pitfallsUsed.includes(pit.name)) {
							this.data.currentArgument.pitfallsUsed.push(pit.name);
						}
					} else {
						const index = this.data.currentArgument.pitfallsUsed.indexOf(pit.name);
						if (index > -1) {
							this.data.currentArgument.pitfallsUsed.splice(index, 1);
						}
					}
					this.updateArgument(root);
					CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
				});
			});
		}

		// Lie used
		const lieLine = argModifiers.createEl("div", { cls: "ds-nt-argument-modifier-line ds-nt-argument-modifier-lie-line" });
		lieLine.title =  "If the NPC catches a lie: Arguments that fail to increase Interest will lose an additional Interest.";
		const lieCheckbox = lieLine.createEl("input", { cls: "ds-nt-argument-modifier-lie-checkbox", type: "checkbox" }) as HTMLInputElement;
		lieLine.createEl("label", { cls: "ds-nt-argument-modifier-lie-label", text: "Caught in a lie" });
		lieCheckbox.checked = this.data.currentArgument.lieUsed;
		lieCheckbox.addEventListener("change", () => {
			this.data.currentArgument.lieUsed = lieCheckbox.checked;
			this.updateArgument(root);
			CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
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
		sameArgCheckbox.checked = this.data.currentArgument.sameArgumentUsed;
		sameArgCheckbox.addEventListener("change", () => {
			this.data.currentArgument.sameArgumentUsed = sameArgCheckbox.checked;
			this.updateArgument(root);
			CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
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

		// Complete Argument Button
		const completeButton = argumentContainer.createEl('button', { cls: 'ds-nt-complete-argument-button', text: 'Complete Argument' });
		completeButton.addEventListener('click', () => {
			// Update mot.hasBeenAppealedTo for motivations used in the current argument
			this.data.currentArgument.motivationsUsed.forEach(motName => {
				const mot = this.data.motivations.find(m => m.name === motName);
				if (mot) {
					mot.hasBeenAppealedTo = true;
				}
			});

			// Reset currentArgument
			this.data.currentArgument = {
				motivationsUsed: [],
				pitfallsUsed: [],
				lieUsed: false,
				sameArgumentUsed: false,
				reusedMotivation: false,
			};

			// Update the code block
			CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);

			//  TODO - this should probably make a new view...? or this whole "completeButton" functionality should be extracted? idk
			// Re-render the argument tab to reset the checkboxes
			argumentContainer.empty();
			this.populateArgumentTab(argumentContainer, root);

			// Optionally, re-render motivations and pitfalls sections if needed
			const details = root.querySelector('.ds-nt-details') as HTMLElement;
			details.empty();
			new MotivationsPitfallsView(this.app, this.data, this.ctx).build(details);
		});

		// Update the argument for initial state
		this.updateArgument(root);
	}

	// TODO - remove?
	// Update Argument Based on Current State
	private updateArgument(parent: HTMLElement) {
		const lieCheckbox = parent.querySelector(".ds-nt-argument-modifier-lie-checkbox") as HTMLInputElement;
		const sameArgumentCheckbox = parent.querySelector(".ds-nt-argument-modifier-same-arg-checkbox") as HTMLInputElement;
		const reuseMotivationCheckbox = parent.querySelector(".ds-nt-argument-modifier-reuse-motivation-checkbox") as HTMLInputElement;

		const usedMotivation = this.data.currentArgument.motivationsUsed.length > 0;
		const usedPitfall = this.data.currentArgument.pitfallsUsed.length > 0;

		// Determine if any of the motivations used in the current argument have been used before
		const anyMotivationReused = this.data.currentArgument.motivationsUsed.some(motName => {
			const mot = this.data.motivations.find(m => m.name === motName);
			return mot && mot.hasBeenAppealedTo;
		});

		// Enable/Disable Reuse Motivation Checkbox
		reuseMotivationCheckbox.disabled = !anyMotivationReused;
		if (reuseMotivationCheckbox.disabled) {
			reuseMotivationCheckbox.checked = false;
		}

		// Enable/Disable Same Argument Checkbox
		sameArgumentCheckbox.disabled = usedMotivation;

		const caughtLying = this.data.currentArgument.lieUsed;
		const reusedMotivation = this.data.currentArgument.reusedMotivation;
		const sameArgument = this.data.currentArgument.sameArgumentUsed;

		const prTiers = ArgumentPowerRoll
			.build(usedMotivation, usedPitfall, caughtLying, reusedMotivation, sameArgument)
			.toPowerRollTiers();

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
				argMotLabel.classList.toggle("ds-nt-arg-motivation-used", mot.hasBeenAppealedTo ?? false);
				if (mot.hasBeenAppealedTo) {
					setTooltip(argMotLabel as HTMLElement, "This Motivation was used in a previous Argument.");
				} else {
					setTooltip(argMotLabel as HTMLElement, "");
				}
			}
		});
	}
}
