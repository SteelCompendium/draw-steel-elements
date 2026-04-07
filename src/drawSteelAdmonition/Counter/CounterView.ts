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

    protected clampedCurrentValue() {
        const { current_value, max_value, min_value } = this.data;
        return Math.clamp(
            current_value,
            min_value ?? -Infinity,
            max_value ?? Infinity,
        );
    }

    protected incrementValue() {
        this.data.current_value += 1;
        this.data.current_value = this.clampedCurrentValue();
    }

    protected decrementValue() {
        this.data.current_value -= 1;
        this.data.current_value = this.clampedCurrentValue();
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

    protected applyValue(
        valueDisplay: HTMLInputElement,
        incrementButton: HTMLButtonElement,
        decrementButton: HTMLButtonElement,
    ) {
        this.data.current_value = this.clampedCurrentValue();
        valueDisplay.value = this.data.current_value.toString();
        this.updateButtons(incrementButton, decrementButton);
        if (this.data.auto_save) {
            CodeBlocks.updateCounter(this.plugin.app, this.data, this.ctx);
        }
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
                this.data.current_value = newValue;
                this.data.current_value = this.clampedCurrentValue();
                this.applyValue(valueDisplay, incrementButton, decrementButton);
            }
        });

        incrementButton.addEventListener("click", () => {
            this.incrementValue();
            this.applyValue(valueDisplay, incrementButton, decrementButton);
        });

        decrementButton.addEventListener("click", () => {
            this.decrementValue();
            this.applyValue(valueDisplay, incrementButton, decrementButton);
        });
    }
}
