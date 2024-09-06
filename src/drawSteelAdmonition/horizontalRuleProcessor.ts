import {MarkdownPostProcessorContext} from "obsidian";

export class HorizontalRuleProcessor {
	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl('div', {cls: "ds-hr-container"});
		container.createEl("div", {cls: "ds-hr-left-line"});
		container.createEl("div", {cls: "ds-hr-center"});
		container.createEl("div", {cls: "ds-hr-right-line"});
	}
}