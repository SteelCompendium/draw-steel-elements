import {MarkdownPostProcessorContext, Plugin} from "obsidian";
import { CommonElementWrapper } from "@model/CommonElementWrapper";

export class CommonElementWrapperView {
    private plugin: Plugin;
    private data: CommonElementWrapper;
    private ctx: MarkdownPostProcessorContext;
    private state: {isCollapsed: boolean}

    constructor(plugin: Plugin, data: CommonElementWrapper, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
        this.state = {isCollapsed: data.collapse_default};
    }

    public build(parent: HTMLElement, element: HTMLElement, elementName: string) {
        const container = parent.createEl("div", { cls: "ds-element-wrapper" });

        // Hide indicator
        // todo: implement

        if (!this.state.isCollapsed) {
            container.append(element)
        }

        else {
            container.createEl("div", {text:elementName})
        }

        container.addEventListener("click", () => {
            console.log("toggle", this.state)
            this.state.isCollapsed != this.state.isCollapsed;
        })
    }
}
