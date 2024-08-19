import {DrawSteelAdmonition} from "./drawSteelAdmonition";
import {DrawSteelAdmonitionSettings} from "../settings/drawSteelAdmonitionSettings";
import { MarkdownPostProcessorContext } from "obsidian";

export class DrawSteelAdmonitionsPostProcessor {
	settings: DrawSteelAdmonitionSettings;

	constructor(settings: DrawSteelAdmonitionSettings) {
		this.settings = settings;
	}

	postProcess(element: HTMLElement, context: MarkdownPostProcessorContext) {
		element.findAll("code").forEach(codeblock => {
			this.settings.drawSteelAdmonitions.forEach((dsa: DrawSteelAdmonition) => dsa.process(codeblock));
		});
	}
}
