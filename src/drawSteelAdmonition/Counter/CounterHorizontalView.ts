import {
    MarkdownPostProcessorContext,
    Plugin,
    setIcon,
} from "obsidian";
import { Counter } from "@model/Counter";
import { CounterView } from "@drawSteelAdmonition/Counter/CounterView";
import { CodeBlocks } from "@utils/CodeBlocks";

export class CounterHorizontalView extends CounterView {
    constructor(
        plugin: Plugin,
        data: Counter,
        ctx: MarkdownPostProcessorContext,
    ) {
        super(plugin, data, ctx);
    }

    public async build(parent: HTMLElement): Promise<HTMLElement> {
        const container = super.buildBase(parent);

        // TODO: Remove
        // Not implemented warning
        container.createEl('div', {
            text: "Horizontal Counter is not implemented yet"
        })

        // // LAYOUT
        // const displayContainer = container.createEl("div", {
        //     cls: "ds-counter-display-container",
        // });

        // const nameTopDisplay = displayContainer.createEl("div", {
        //     cls: "ds-counter-name",
        //     text: this.data?.name_top,
        // });

        // const valueDisplay = displayContainer.createEl("input", {
        //     cls: "ds-counter-value",
        //     value: this.data?.current_value.toString(),
        //     placeholder: this.data?.current_value.toString(),
        //     type: "number",
        // });
        // valueDisplay.readOnly = false;

        // const nameBottomDisplay = displayContainer.createEl("div", {
        //     cls: "ds-counter-name",
        //     text: this.data?.name_bottom,
        // });

        // const controlsContainer = container.createEl("div", {
        //     cls: "ds-counter-controls",
        // });

        // const incrementButton = controlsContainer.createEl("button", {
        //     cls: "ds-counter-button",
        // });
        // const decrementButton = controlsContainer.createEl("button", {
        //     cls: "ds-counter-button",
        // });

        // // EVENTS
        // valueDisplay.addEventListener("click", () => {
        //     valueDisplay.focus();
        //     valueDisplay.select();
        // });
        // valueDisplay.addEventListener("change", () => {
        //     let newValue = parseInt(valueDisplay.value);
        //     if (!isNaN(newValue)) {
        //         newValue = Math.min(newValue, this.data?.max_value ?? Infinity);
        //         newValue = Math.max(newValue, this.data.min_value ?? 0);
        //         this.data.current_value = newValue;
        //         valueDisplay.value = newValue.toString();
        //         super.updateButtons(incrementButton, decrementButton);
        //         if (this.data.auto_save) {
        //             CodeBlocks.updateCounter(
        //                 this.plugin.app,
        //                 this.data,
        //                 this.ctx,
        //             );
        //         }
        //     }
        // });

        // incrementButton.addEventListener("click", () => {
        //     this.incrementValue();
        //     valueDisplay.value = this.data.current_value.toString();
        //     this.updateButtons(incrementButton, decrementButton);
        //     CodeBlocks.updateCounter(this.plugin.app, this.data, this.ctx);
        // });

        // decrementButton.addEventListener("click", () => {
        //     this.decrementValue();
        //     valueDisplay.value = this.data.current_value.toString();
        //     this.updateButtons(incrementButton, decrementButton);
        //     CodeBlocks.updateCounter(this.plugin.app, this.data, this.ctx);
        // });

        // // STYLING
        // valueDisplay.style.fontSize = `${this.data.value_height}em`;
        // setIcon(incrementButton, "chevron-up");
        // setIcon(decrementButton, "chevron-down");

        // nameTopDisplay.style.fontSize = `${this.data.name_top_height}em`;
        // nameBottomDisplay.style.fontSize = `${this.data.name_bottom_height}em`;

        // // ADDITIONAL
        // this.updateButtons(incrementButton, decrementButton);

        return container;
    }
}
