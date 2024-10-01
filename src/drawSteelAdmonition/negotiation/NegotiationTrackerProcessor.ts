import {App, MarkdownPostProcessorContext} from "obsidian";
import {NegotiationData, parseNegotiationData} from "../../model/NegotiationData";
import {PatienceInterestView} from "./PatienceInterestView";
import {MotivationsPitfallsView} from "./MotivationsPitfallsView";
import {ArgumentView} from "./ArgumentView";
import {LearnMoreView} from "./LearnMoreView";

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

		// Initialize currentArgument if not present
		if (!this.data.currentArgument) {
			this.data.currentArgument = {
				motivationsUsed: [],
				pitfallsUsed: [],
				lieUsed: false,
				sameArgumentUsed: false,
				reusedMotivation: false,
			};
		}

		const container = el.createEl('div', {cls: "ds-nt-container"});

		const name = this.data.name;
		if (name) {
			const nameContainer = container.createEl("div", {cls: "ds-nt-name-line"});
			nameContainer.createEl("span", {cls: "ds-nt-name-value", text: "Negotiation: " + name.trim()});
		}

		const trackerContainer = container.createEl("div", {cls: "ds-nt-tracker-container"});
		new PatienceInterestView(this.app, this.data, this.ctx).build(trackerContainer);
		this.addActions(trackerContainer, container);

		const details = container.createEl("div", {cls: "ds-nt-details"});
		new MotivationsPitfallsView(this.app, this.data, this.ctx).build(details);
	}

	// Add Actions with Tabs
	private addActions(parent: HTMLElement, root: HTMLElement) {
		const actionsContainer = parent.createEl("div", {cls: "ds-nt-actions-container"});

		// Create Tabs
		const actionTab = actionsContainer.createEl("div", {cls: "ds-nt-action-tabs"});
		const argumentTab = actionTab.createEl("div", {
			cls: "ds-nt-action-tab ds-nt-argument-tab active",
			text: "Make an Argument"
		});
		const learnMoreTab = actionTab.createEl("div", {
			cls: "ds-nt-action-tab ds-nt-learn-more-tab",
			text: "Learn Motivation/Pitfall"
		});

		// Create Content Containers
		const argumentContainer = actionsContainer.createEl("div", {cls: "ds-nt-action-container ds-nt-argument-container active"});
		const learnMoreContainer = actionsContainer.createEl("div", {cls: "ds-nt-action-container ds-nt-learn-more-container"});

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
		new ArgumentView(this.app, this.data, this.ctx).build(argumentContainer, root);
		new LearnMoreView(this.app, this.data, this.ctx).build(learnMoreContainer, root);
	}
}

/*
name: Convincing [[Frodo]] to remember the taste of strawberries
initial_interest: 3
initial_patience: 3
motivations:
  - name: Higher Authority
    reason: Its Frodo's duty to destroy the ring
    hasBeenAppealedTo: false
  - name: Peace
    reason: Shire is life
    hasBeenAppealedTo: true
pitfalls:
  - name: Power
    reason: This ring is OP. No, you can't have it. Back off.
i5: Remembers the taste of strawberries and creme!
i4: Remembers the taste of strawberries
i3: Remembers the taste of strawberries, but only the unripe ones
i2: Doesn't remember the taste of strawberries, but remembers the smell
i1: Doesn't remember the taste of strawberries
i0: As above, and is convinced youre after the ring.  Draw Steel!
current_patience: 1
current_interest: 2
currentArgument:
  motivationsUsed:
    - Peace
  pitfallsUsed: []
  lieUsed: false
  sameArgumentUsed: false
  reusedMotivation: false
* */
