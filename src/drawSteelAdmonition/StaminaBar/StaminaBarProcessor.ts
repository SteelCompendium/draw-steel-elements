import {Plugin, MarkdownPostProcessorContext} from "obsidian";
import {StaminaBarView} from "@drawSteelAdmonition/StaminaBar/StaminaBarView";
import {StaminaBar} from "@model/StaminaBar";

export class StaminaBarProcessor {
	plugin: Plugin;
	readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
		const container = el.createEl("div", { cls: "ds-stamina-bar-ele-container" });
		try {
			new StaminaBarView(this.plugin, StaminaBar.parseYaml(source), ctx).build(container);
            // Avoid clicks in reading mode from opening edit view
            const stop = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
            };
            // container.addEventListener("dblclick", stop, { capture: true });
            container.addEventListener("mousedown", stop, {capture: true});
            container.addEventListener("pointerdown", stop, {capture: true});
		} catch (error) {
			let userMessage =
				"The Draw Steel Elements plugin loaded the StaminaBar Element properly, but " +
				"failed to process the input config.  Please correct the following error:\n\n";
			userMessage += error.message;
			container.createEl("div", {text: userMessage, cls: "error-message"});
		}
	}
}
