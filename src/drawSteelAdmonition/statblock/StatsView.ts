import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { StatblockConfig } from "../../model/StatblockConfig";

export class StatsView {
    private plugin: Plugin;
    private data: StatblockConfig;
    private ctx: MarkdownPostProcessorContext;

    constructor(plugin: Plugin, data: StatblockConfig, ctx: MarkdownPostProcessorContext) {
        this.plugin = plugin;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const statsContainer = parent.createEl("div", { cls: "ds-sb-stats" });

        // Stamina
        const firstLine = statsContainer.createEl("div", { cls: "ds-sb-stats-line" });
        firstLine.createEl("div",
            { cls: "ds-sb-stats-left", text: `Stamina ${this.data.statblock.stamina ?? "N/A"}` });

        // immunities and weaknesses

        const immuText = this.data.statblock.immunities?.length ?? 0 > 0 ? `Immunity: ${this.data.statblock.immunities?.join(", ")}` : "";
        const weakText = this.data.statblock.weaknesses?.length ?? 0 > 0 ? `Weakness: ${this.data.statblock.weaknesses?.join(", ")}` : "";
        const immuWeakText = `${immuText} ${weakText}`;
        firstLine.createEl("div", { cls: "ds-sb-stats-right", text: immuWeakText });

        // Speed, size, and stability
        const secondLine = statsContainer.createEl("div", { cls: "ds-sb-stats-line" });
        secondLine.createEl("div",
            { cls: "ds-sb-stats-left", text: `Speed ${this.data.statblock.speed ?? "N/A"}` });
        secondLine.createEl("div",
            { cls: "ds-sb-stats-right", text: `Size ${this.data.statblock.size ?? "N/A"} / Stability ${this.data.statblock.stability ?? "N/A"}` });

        // Free strike
        const thirdLine = statsContainer.createEl("div", { cls: "ds-sb-stats-line" });
        thirdLine.createEl("div",
            { cls: "ds-sb-stats-left", text: "" });
        thirdLine.createEl("div",
            { cls: "ds-sb-stats-right", text: `Free Strike ${this.data.statblock.freeStrike ?? "N/A"}` });

        // characteristics
        const fourthLine = statsContainer.createEl("div", { cls: "ds-sb-stats-line ds-sb-characteristics-line" });
        fourthLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Might ${this.formatCharacteristic(this.data.statblock.characteristics.might)}` });
        fourthLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Agility ${this.formatCharacteristic(this.data.statblock.characteristics.agility)}` });
        fourthLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Reason ${this.formatCharacteristic(this.data.statblock.characteristics.reason)}` });
        fourthLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Intuition ${this.formatCharacteristic(this.data.statblock.characteristics.intuition)}` });
        fourthLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Presence ${this.formatCharacteristic(this.data.statblock.characteristics.presence)}` });
    }

    private formatCharacteristic(value?: number): string {
        if (value === undefined || isNaN(value)) {
            return "N/A";
        }
        return value >= 0 ? `+${value}` : `${value}`;
    }
}
