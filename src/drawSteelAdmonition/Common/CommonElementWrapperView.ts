import { MarkdownPostProcessorContext, Plugin } from "obsidian";
import { CommonElementWrapper } from "@model/CommonElementWrapper";

export class CommonElementWrapperView {
    private plugin: Plugin;
    private data: CommonElementWrapper;
    private ctx: MarkdownPostProcessorContext;
    private state: { isCollapsed: boolean };

    constructor(plugin: Plugin, data: any, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data as CommonElementWrapper;
        this.ctx = ctx;
        this.state = { isCollapsed: this.data?.collapse_default ?? false };
    }

    public build(
        parent: HTMLElement,
        elementBuilder: Function,
        elementName: string,
    ) {
        const container = parent.createEl("div", { cls: "ds-common-element-wrapper" });
        container.style.cursor = "help";

        // Hide Indicator
        // TODO: implement

        if (!this.state.isCollapsed) {
            elementBuilder(container);
        } else {
            container.createEl("div", { text: elementName });
        }

        // Container click handler - only triggers on container itself
        container.addEventListener("click", (event: MouseEvent) => {
            if (event.target === container) {
                console.log("click")
                this.state.isCollapsed = !this.state.isCollapsed;
                container.empty();
                if (!this.state.isCollapsed) {
                    elementBuilder(container);
                } else {
                    container.createEl("div", { text: elementName });
                }
            }
        });

    }
}
