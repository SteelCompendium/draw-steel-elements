import { MarkdownPostProcessorContext, Plugin } from "obsidian";
import { CommonElementWrapper } from "@model/CommonElementWrapper";
import { AbstractElementView } from "@drawSteelAdmonition/Common/AbstractElementView";

export class CommonElementWrapperView extends AbstractElementView {
    private state: { isCollapsed: boolean };

    constructor(
        plugin: Plugin,
        data: CommonElementWrapper,
        ctx: MarkdownPostProcessorContext,
        options: { elementName: string },
    ) {
        super(plugin, data, ctx, options);
        this.state = { isCollapsed: this.data?.collapse_default ?? false };
    }

    public build(
        parent: HTMLElement,
        children: Array<HTMLElement>,
    ): HTMLElement {
        const container = parent.createEl("div", {
            cls: "ds-common-element-wrapper",
        });
        container.toggleClass(
            "ds-common-element-wrapper-collapsible",
            this.data.collapsible,
        );

        // Hide Indicator
        // TODO: implement

        if (!this.state.isCollapsed) {
            if (children) {
                container.appendChild(children[0])
            }
        } else {
            container.createEl("div", { text: this.options.elementName });
        }

        // Container click handler - only triggers on container itself
        container.addEventListener("click", (event: MouseEvent) => {
            if (this.data.collapsible == false) return;
            if (event.target === container) {
                this.state.isCollapsed = !this.state.isCollapsed;
                container.empty();
                if (!this.state.isCollapsed) {
                    if (children) {
                        container.appendChild(children[0])
                    }
                } else { 
                    container.createEl("div", { text: this.options.elementName });
                }
            }
        });

        return container;
    }
}
