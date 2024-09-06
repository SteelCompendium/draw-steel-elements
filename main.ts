import {Plugin} from 'obsidian';
import {PowerRollProcessor} from "./src/drawSteelAdmonition/powerRollProcessor";
import {HorizontalRuleProcessor} from "./src/drawSteelAdmonition/horizontalRuleProcessor";
import {NegotiationTrackerProcessor} from "./src/drawSteelAdmonition/negotiationTrackerProcessor";

export default class DrawSteelAdmonitionPlugin extends Plugin {
	async onload() {
		console.log("Loading Draw Steel Elements Plugin.")

		let powerRollProcessor = new PowerRollProcessor();
		this.registerMarkdownCodeBlockProcessor("ds-pr", powerRollProcessor.postProcess);
		this.registerMarkdownCodeBlockProcessor("ds-power-roll", powerRollProcessor.postProcess);

		let hrProcessor = new HorizontalRuleProcessor();
		this.registerMarkdownCodeBlockProcessor("ds-hr", hrProcessor.postProcess);
		this.registerMarkdownCodeBlockProcessor("ds-horizontal-rule", hrProcessor.postProcess);

		let ntProcessor = new NegotiationTrackerProcessor();
		this.registerMarkdownCodeBlockProcessor("ds-nt", ntProcessor.postProcess);
		this.registerMarkdownCodeBlockProcessor("ds-negotiation-tracker", ntProcessor.postProcess);
	}

	onunload() {
	}
}

