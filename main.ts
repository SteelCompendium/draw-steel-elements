import {Plugin} from 'obsidian';
import {PowerRollProcessor} from "./src/drawSteelAdmonition/powerRollProcessor";

export default class DrawSteelAdmonitionPlugin extends Plugin {
	async onload() {
		console.log("Loading Draw Steel Elements Plugin.")

		this.registerMarkdownCodeBlockProcessor("ds-pr", new PowerRollProcessor().postProcess);
	}

	onunload() {
	}
}

