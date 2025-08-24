import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { createApp } from 'vue';
import HorizontalRule from "@drawSteelComponents/HorizontalRule/HorizontalRule.vue";

export class HorizontalRuleProcessor {
	plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		// Create a wrapper for the Vue component
		const vueWrapper = el.createEl("div", { cls: "vue-wrapper" });
		try {
			// Create and mount Vue app directly
			const app = createApp(HorizontalRule).mount(vueWrapper);
			
			// Store app instance for cleanup if needed
			(vueWrapper as any)._vueApp = app;
		} catch (error) {
			// Display error message to the user
			let userMessage =
				"The Draw Steel Elements plugin failed to load the Horizontal Rule. " +
				"Please correct the following error:\n\n";
			userMessage += error.message;
			vueWrapper.createEl("div", { text: userMessage, cls: "error-message" });
		}
	}
}

