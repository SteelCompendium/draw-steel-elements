import {MarkdownPostProcessorContext} from "obsidian";

export class HorizontalRuleProcessor {
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		HorizontalRuleProcessor.build(el);
	}

	public static build(parent: HTMLElement) {
		const container = parent.createEl('div', {cls: "ds-hr-container"})
		container.createEl("div", {cls: "ds-hr-left-line"});
		container.createEl("div", {cls: "ds-hr-center"});
		container.createEl("div", {cls: "ds-hr-right-line"});
	}
}
