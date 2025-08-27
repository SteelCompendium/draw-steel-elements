import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { createApp, DefineComponent } from 'vue';

export class genericComponentProcessor {
    plugin: Plugin;
    component: DefineComponent<{}, {}, any>;
    model: any;
    component_name: string;
    readonly handler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => this.postProcess(source, el, ctx);

    constructor(plugin: Plugin, component: DefineComponent<{}, {}, any>, model: any, component_name: string) {
        this.plugin = plugin;
        this.component = component;
        this.model = model;
        this.component_name = component_name;
    }

    public postProcess(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void | Promise<any> {
        genericPostProcess(source, el, ctx, this.component, this.model, this.component_name);
    }
}

export function genericPostProcess(
        source: string, 
        el: HTMLElement, 
        ctx: MarkdownPostProcessorContext, 
        component: DefineComponent<{}, {}, any>,
        model: any,
        user_message_name: string
        ): void | Promise<any> {
    // Create a wrapper for the Vue component
    const vueWrapper = el.createEl("div", { cls: "vue-wrapper" });
    try {
        // Create and mount Vue app directly
        const app = createApp(component, {
                        skills: model.parseYaml(source)
                    });
                    app.mount(vueWrapper);
        
        // Store app instance for cleanup if needed
        (vueWrapper as any)._vueApp = app;
    } catch (error) {
        // Display error message to the user
        let userMessage =
            `The Draw Steel Elements plugin failed to load the ${user_message_name}.` +
            `Please correct the following error:\n\n`;
        userMessage += error.message;
        vueWrapper.createEl("div", { text: userMessage, cls: "error-message" });
    }
}
