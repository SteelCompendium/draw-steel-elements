import {
    Component,
    MarkdownPostProcessorContext,
    Plugin,
    setIcon,
} from "obsidian";
import { CommonElementWrapperView } from "@drawSteelAdmonition/Common/CommonElementWrapperView";
import { Counter } from "@model/Counter";
import { CodeBlocks } from "@utils/CodeBlocks";

export class CounterView {
    private plugin: Plugin;
    private data: Counter;
    private ctx: MarkdownPostProcessorContext;

    constructor(
        plugin: Plugin,
        data: Counter,
        ctx: MarkdownPostProcessorContext,
    ) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const elementWrapper = new CommonElementWrapperView(
            this.plugin,
            this.data,
            this.ctx,
        );
        if (this.data?.style === "horizontal") {
            elementWrapper.build(parent, this.buildHorizontal, "Counter");
            // this.buildHorizontal(parent);
            return;
        }
        elementWrapper.build(parent, this.buildVertical, "Counter");
    }

    private buildVertical = (parent: HTMLElement) => {
        // LAYOUT
        const container = parent.createEl("div", {
            cls: "ds-counter-container ds-counter-flex",
        });

        const displayContainer = container.createEl("div", {
            cls: "ds-counter-display-container",
        });

        const nameTopDisplay = displayContainer.createEl("div", {
            cls: "ds-counter-name",
            text: this.data?.name_top,
        });

        const valueDisplay = displayContainer.createEl("input", {
            cls: "ds-counter-value",
            value: this.data?.current_value.toString(),
            placeholder: this.data?.current_value.toString(),
            type: "number",
        });
        valueDisplay.readOnly = false;

        const nameBottomDisplay = displayContainer.createEl("div", {
            cls: "ds-counter-name",
            text: this.data?.name_bottom,
        });

        const controlsContainer = container.createEl("div", {
            cls: "ds-counter-controls",
        });

        const incrementButton = controlsContainer.createEl("button", {
            cls: "ds-counter-button",
        });
        const decrementButton = controlsContainer.createEl("button", {
            cls: "ds-counter-button",
        });

        // EVENTS
        valueDisplay.addEventListener("click", () => {
            valueDisplay.focus();
            valueDisplay.select();
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

        // STYLING
        valueDisplay.style.fontSize = `${this.data.value_height}em`;
        setIcon(incrementButton, "chevron-up");
        setIcon(decrementButton, "chevron-down");

        nameTopDisplay.style.fontSize = `${this.data.name_top_height}em`;
        nameBottomDisplay.style.fontSize = `${this.data.name_bottom_height}em`;

        // ADDITIONAL
        this.updateButtons(incrementButton, decrementButton);
    };

    private buildHorizontal = () => {};

    private incrementValue() {
        const { current_value, max_value } = this.data;
        if (max_value !== undefined && current_value >= max_value) {
            return;
        }
        this.data.current_value += 1;
    }

    private decrementValue() {
        const { current_value, min_value } = this.data;
        if (current_value <= min_value) {
            return;
        }
        this.data.current_value -= 1;
    }

    private updateButtons(
        incrementButton: HTMLElement,
        decrementButton: HTMLElement,
    ) {
        const { current_value, max_value, min_value } = this.data;
        if (max_value !== undefined && current_value >= max_value) {
            incrementButton.setAttribute("disabled", "true");
        } else {
            incrementButton.removeAttribute("disabled");
        }
        if (current_value <= min_value) {
            decrementButton.setAttribute("disabled", "true");
        } else {
            decrementButton.removeAttribute("disabled");
        }
    }
}
