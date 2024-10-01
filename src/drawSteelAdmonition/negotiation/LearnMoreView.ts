import {App, MarkdownPostProcessorContext, setTooltip} from "obsidian";
import {NegotiationData} from "../../model/NegotiationData";

export class LearnMoreView {
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
		const learnMoreBody = parent.createEl("div", { cls: "ds-nt-learn-more-body" });
		// Add content for learning motivations and pitfalls
		learnMoreBody.createEl("p", { text: "Content for learning motivations and pitfalls goes here." });
	}
}
