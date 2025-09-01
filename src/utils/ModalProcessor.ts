import { Modal, App, MarkdownPostProcessorContext } from "obsidian";
import { createApp, h, DefineComponent } from "vue";

export class ModalProcessor extends Modal {
    vueComponent: DefineComponent<any, any, any>;
    vueProps: Record<string, any>;
    ctx: MarkdownPostProcessorContext;
    vueApp: any;
    header: string;
    onResult?: (value: any) => void;

    constructor(
        app: App,
        vueComponent: DefineComponent<any, any, any>,
        ctx: MarkdownPostProcessorContext,
        vueProps: Record<string, any> = {},
        header: string = "",
        onResult?: (value: any) => void
    ) {
        super(app);
        this.vueComponent = vueComponent;
        this.vueProps = vueProps;
        this.ctx = ctx;
        this.header = header;
        this.onResult = onResult;
    }

    onOpen() {
        if (this.header) this.titleEl.setText(this.header);
        this.vueApp = createApp({
            render: () =>
                h(this.vueComponent, {
                    ...this.vueProps,
                    onClose: () => this.close(),
                    onResult: (value: any) => {
                        if (this.onResult) this.onResult(value);
                        this.close();
                    },
                }),
        });
        this.vueApp.provide("obsidianApp", this.app);
        this.vueApp.provide("obsidianContext", this.ctx);
        this.vueApp.mount(this.contentEl);
    }

    onClose() {
        this.vueApp?.unmount();
        this.contentEl.empty();
    }
}
