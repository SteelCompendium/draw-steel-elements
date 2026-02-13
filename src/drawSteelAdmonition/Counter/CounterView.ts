import { MarkdownPostProcessorContext, Plugin, setIcon } from "obsidian";
import { CommonElementWrapperView } from "@drawSteelAdmonition/Common/CommonElementWrapperView";
import { Counter } from "@model/Counter";
import { CodeBlocks } from "@utils/CodeBlocks";
import { AbstractElementView } from "@drawSteelAdmonition/Common/AbstractElementView";

export abstract class CounterView extends AbstractElementView {
    constructor(
        plugin: Plugin,
        data: Counter,
        ctx: MarkdownPostProcessorContext,
    ) {
        super(plugin, data, ctx);
    }

    public async build(parent: HTMLElement): Promise<HTMLElement> {
        let view: CounterView;
        if (this.data?.style === "horizontal") {
            const { CounterHorizontalView } =
                await import("@drawSteelAdmonition/Counter/CounterHorizontalView");
            view = new CounterHorizontalView(this.plugin, this.data, this.ctx);
        } else {
            const { CounterVerticalView } =
                await import("@drawSteelAdmonition/Counter/CounterVerticalView");
            view = new CounterVerticalView(this.plugin, this.data, this.ctx);
        }
        return view.build(parent);
    }

    protected buildBase(parent: HTMLElement): HTMLElement {
        const container = parent.createEl("div", {
            cls: "ds-counter-container",
        });

        const elementWrapper = new CommonElementWrapperView(
            this.plugin,
            this.data,
            this.ctx,
            { elementName: "Counter" },
        );

        elementWrapper.build(parent, [container]);
        return container;
    }

    protected incrementValue() {
        const { current_value, max_value } = this.data;
        if (max_value !== undefined && current_value >= max_value) {
            return;
        }
        this.data.current_value += 1;
    }

    protected decrementValue() {
        const { current_value, min_value } = this.data;
        if (current_value <= min_value) {
            return;
        }
        this.data.current_value -= 1;
    }

    protected updateButtons(
        incrementButton: HTMLElement,
        decrementButton: HTMLElement,
    ) {
        const { current_value, max_value, min_value } = this.data;
        incrementButton.toggleAttribute(
            "disabled",
            max_value !== undefined && current_value >= max_value,
        );
        decrementButton.toggleAttribute("disabled", current_value <= min_value);
    }

    protected setEventListeners(
        valueDisplay: HTMLInputElement,
        incrementButton: HTMLButtonElement,
        decrementButton: HTMLButtonElement,
    ) {
        valueDisplay.addEventListener("click", () => {
            if (document.activeElement !== valueDisplay) {
                valueDisplay.select();
            }
            valueDisplay.focus();
        });

        valueDisplay.addEventListener("change", () => {
            let newValue = parseInt(valueDisplay.value);
            if (!isNaN(newValue)) {
                newValue = Math.min(newValue, this.data?.max_value ?? Infinity);
                newValue = Math.max(newValue, this.data.min_value ?? 0);
                this.data.current_value = newValue;
                valueDisplay.value = newValue.toString();
                this.updateButtons(incrementButton, decrementButton);
                if (this.data.auto_save) {
                    CodeBlocks.updateCounter(
                        this.plugin.app,
                        this.data,
                        this.ctx,
                    );
                }
            }
        });

        incrementButton.addEventListener("click", () => {
            this.incrementValue();
            valueDisplay.value = this.data.current_value.toString();
            this.updateButtons(incrementButton, decrementButton);
            CodeBlocks.updateCounter(this.plugin.app, this.data, this.ctx);
        });

        decrementButton.addEventListener("click", () => {
            this.decrementValue();
            valueDisplay.value = this.data.current_value.toString();
            this.updateButtons(incrementButton, decrementButton);
            CodeBlocks.updateCounter(this.plugin.app, this.data, this.ctx);
        });
    }
}
