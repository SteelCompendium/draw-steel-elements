import { MarkdownPostProcessorContext, Plugin, setIcon } from "obsidian";
import { Counter } from "@model/Counter";
import { CounterView } from "@drawSteelAdmonition/Counter/CounterView";
import { CodeBlocks } from "@utils/CodeBlocks";

export class CounterVerticalView extends CounterView {
    constructor(
        plugin: Plugin,
        data: Counter,
        ctx: MarkdownPostProcessorContext,
    ) {
        super(plugin, data, ctx);
    }

    public async build(parent: HTMLElement): Promise<HTMLElement> {
        const container = super.buildBase(parent);

        // LAYOUT
        const displayContainer = container.createEl("div", {
            cls: "ds-counter-display-container",
        });

        const nameTopDisplay = displayContainer.createEl("div", {
            cls: "ds-counter-name",
            text: this.data?.name_top,
        });

        const valueDisplay = displayContainer.createEl("input", {
            cls: "ds-counter-value",
            value: this.clampedCurrentValue().toString(),
            placeholder: this.clampedCurrentValue().toString(),
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
        this.setEventListeners(valueDisplay, incrementButton, decrementButton);

        // STYLING
        valueDisplay.style.fontSize = `${this.data.value_height}em`;
        setIcon(incrementButton, "chevron-up");
        setIcon(decrementButton, "chevron-down");

        nameTopDisplay.style.fontSize = `${this.data.name_top_height}em`;
        nameBottomDisplay.style.fontSize = `${this.data.name_bottom_height}em`;

        // ADDITIONAL
        this.applyValue(valueDisplay, incrementButton, decrementButton);


        return container;
    }
}
