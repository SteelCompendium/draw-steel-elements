import {App, MarkdownPostProcessorContext} from "obsidian";
import {NegotiationData} from "@model/NegotiationData";
import {CodeBlocks} from "@utils/CodeBlocks";

export class PatienceInterestView {
	private app: App;
	private data: NegotiationData;
	private ctx: MarkdownPostProcessorContext;

	constructor(app: App, data: NegotiationData, ctx: MarkdownPostProcessorContext) {
		this.app = app;
		this.data = data;
		this.ctx = ctx;
	}

	public build(parent: HTMLElement) {
		this.addPatience(parent);
		this.addInterest(parent);
	}

	// Add Patience Tracker
	private addPatience(parent: HTMLElement) {
		const patienceCont = parent.createEl("div", { cls: "ds-nt-patience-container" });
		patienceCont.createEl("div", { cls: "ds-nt-patience-label", text: "Patience" });

		const bubbleCont = patienceCont.createEl("div", { cls: "ds-nt-patience-bubble-container" });
		for (let i = 0; i <= 5; i++) {
			const bubble = bubbleCont.createEl("div", {
				cls: `ds-nt-patience-bubble ds-nt-patience-bubble-${i}`,
				text: `${i}`
			});
			bubble.addEventListener("click", () => this.setPatience(i, parent));
		}

		// Initialize Patience Display
		if (this.data.current_patience != null) {
			this.setPatience(this.data.current_patience, parent);
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
		CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
	}

	// Add Interest Tracker
	private addInterest(parent: HTMLElement) {
		const interestCont = parent.createEl("div", { cls: "ds-nt-interest-container" });
		interestCont.createEl("div", { cls: "ds-nt-interest-header", text: "Interest" });

		const offerCont = interestCont.createEl("div", { cls: "ds-nt-interest-offer-container" });

		// NegotiationData's i0..i5 fields aren't index-signature-accessible (they're
		// individually declared, non-optional string fields); look them up via an
		// explicit map instead of dynamic `this.data[`i${i}`]` indexing.
		const interestOffers: Record<number, string> = {
			0: this.data.i0,
			1: this.data.i1,
			2: this.data.i2,
			3: this.data.i3,
			4: this.data.i4,
			5: this.data.i5,
		};

		for (let i = 5; i >= 0; i--) {
			const iLine = offerCont.createEl("div", { cls: `ds-nt-interest-line ds-nt-interest-${i}-line` });
			const label = iLine.createEl("div", { cls: `ds-nt-interest-label ds-nt-interest-${i}-label`, text: `${i}` });
			label.addEventListener("click", () => this.setInterest(i, parent));

			const offerText = interestOffers[i] ?? `Offer at Interest ${i}`;
			iLine.createEl("div", { cls: `ds-nt-interest-offer ds-nt-interest-${i}-offer`, text: offerText });
		}

		// Initialize Interest Display
		if (this.data.current_interest != null) {
			this.setInterest(this.data.current_interest, parent);
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
			if (i === newInterest) {
				line.classList.add("ds-nt-interest-current");
			} else {
				line.classList.remove("ds-nt-interest-current");
			}
		}
		// Update Data and Save
		this.data.current_interest = newInterest;
		CodeBlocks.updateNegotiationTracker(this.app, this.data, this.ctx);
	}
}
