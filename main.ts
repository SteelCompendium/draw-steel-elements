import {Plugin} from 'obsidian';
import {PowerRollProcessor} from "./src/drawSteelAdmonition/powerRollProcessor";
import {HorizontalRuleProcessor} from "./src/drawSteelAdmonition/horizontalRuleProcessor";

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
	}

	onunload() {
	}
}

