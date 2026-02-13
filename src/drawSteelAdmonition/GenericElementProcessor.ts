import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { AbstractElementView } from "@drawSteelAdmonition/Common/AbstractElementView";

type ElementViewClass<T> = new (plugin: Plugin, model: any, ctx: MarkdownPostProcessorContext) => T 

export class GenericElementProcessor<T extends AbstractElementView> {
    plugin: Plugin;
    view: ElementViewClass<T>;
    model: any;
    element_name: string;
    edit_mode_safe: boolean;
    
    readonly handler = (
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext,
    ) => this.postProcess(source, el, ctx);

    constructor(
        plugin: Plugin,
        view: ElementViewClass<T>,
        model: any,
        element_name: string,
        edit_mode_safe: boolean = false,
    ) {
        this.plugin = plugin;
        this.view = view;
        this.model = model;
        this.element_name = element_name;
        this.edit_mode_safe = edit_mode_safe;
    }

    public postProcess(
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext,
    ): void | Promise<any> {
        genericElementPostProcess(
            this.plugin,
            source,
            el,
            ctx,
            this.view,
            this.model,
            this.element_name,
            this.edit_mode_safe,
        );
    }
}

export function genericElementPostProcess<T extends AbstractElementView>(
    plugin: Plugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    view: ElementViewClass<T>,
    model: any,
    user_message_name: string,
    edit_mode_safe: boolean,
): void | Promise<any> {
    // Edit mode safe elements don't have any interactive or otherwise
    // important elements outside the preview codeblock and thus don't need to
    // be indented
    let wrapper_class: string = edit_mode_safe
        ? "ds-element-wrapper-edit-safe"
        : "ds-element-wrapper";

    // Create a wrapper for the element
    const elementWrapper = el.createEl("div", { cls: wrapper_class });
    try {
        // Parse the YAML and create the view
        let parsedData: any;
        if (model) {
            parsedData = model.parseYaml(source);
        }

        // Create the view instance
        const viewInstance = new view(plugin, parsedData, ctx);

        // Render the element (using build method for consistency with existing views)
        viewInstance.build(elementWrapper);

        // Avoid clicks in reading mode from opening edit view
        const stop = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };
        // elementWrapper.addEventListener("dblclick", stop, { capture: true });
        elementWrapper.addEventListener("mousedown", stop, { capture: true });
        elementWrapper.addEventListener("pointerdown", stop, { capture: true });

        // Store view instance for cleanup if needed
        (elementWrapper as any)._elementView = viewInstance;
    } catch (error) {
        // Display error message to the user
        let userMessage =
            `The Draw Steel Elements plugin loaded the ${user_message_name} properly, but ` +
            `failed to process the input config. Please correct the following error:\n\n`;
        userMessage += error.message;
        elementWrapper.createEl("div", {
            text: userMessage,
            cls: "error-message",
        });
    }
}
