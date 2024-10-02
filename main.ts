import {Plugin} from 'obsidian';
import {PowerRollProcessor} from "./src/drawSteelAdmonition/powerRollProcessor";
import {HorizontalRuleProcessor} from "./src/drawSteelAdmonition/horizontalRuleProcessor";
import {InitiativeProcessor} from "./src/drawSteelAdmonition/initiativeProcessor";
import {NegotiationTrackerProcessor} from "./src/drawSteelAdmonition/negotiation/NegotiationTrackerProcessor";

export default class DrawSteelAdmonitionPlugin extends Plugin {
	async onload() {
		console.log("Loading Draw Steel Elements Plugin.")

		const powerRollProcessor = new PowerRollProcessor(this.app, this);
		const powerRollHandler = (source, el, ctx) => powerRollProcessor.postProcess(source, el, ctx);
		this.registerMarkdownCodeBlockProcessor("ds-pr", powerRollHandler);
		this.registerMarkdownCodeBlockProcessor("ds-power-roll", powerRollHandler);

		const hrProcessor = new HorizontalRuleProcessor();
		const hrHandler = (source, el, ctx) => hrProcessor.postProcess(source, el, ctx);
		this.registerMarkdownCodeBlockProcessor("ds-hr", hrHandler);
		this.registerMarkdownCodeBlockProcessor("ds-horizontal-rule", hrHandler);

		const initProcessor = new InitiativeProcessor(this.app);
		const initHandler = (source, el, ctx) => initProcessor.postProcess(source, el, ctx);
		this.registerMarkdownCodeBlockProcessor("ds-it", initHandler);
		this.registerMarkdownCodeBlockProcessor("ds-init", initHandler);
		this.registerMarkdownCodeBlockProcessor("ds-initiative", initHandler);
		this.registerMarkdownCodeBlockProcessor("ds-initiative-tracker", initHandler);

		let ntProcessor = new NegotiationTrackerProcessor(this.app);
		const ntHandler = (source, el, ctx) => ntProcessor.postProcess(source, el, ctx);
		this.registerMarkdownCodeBlockProcessor("ds-nt", ntHandler);
		this.registerMarkdownCodeBlockProcessor("ds-negotiation-tracker", ntHandler);
	}

	onunload() {
	}
}
