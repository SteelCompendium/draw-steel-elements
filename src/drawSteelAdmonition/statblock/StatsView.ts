import { Plugin, MarkdownPostProcessorContext } from "obsidian";
import { StatblockConfig } from "@model/StatblockConfig";

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

		this.statsRow(statsContainer);

        // immunities and weaknesses
		const firstLine = statsContainer.createEl("div", { cls: "ds-sb-stats-line" });
		const immuText = this.data.statblock.immunities?.length ?? 0 > 0 ? `${this.data.statblock.immunities?.join(", ")}` : "-";
		const weakText = this.data.statblock.weaknesses?.length ?? 0 > 0 ? `${this.data.statblock.weaknesses?.join(", ")}` : "-";
		firstLine.createEl("div", { cls: "ds-sb-stats-left", text: `Immunity: ${immuText}` });
		firstLine.createEl("div", { cls: "ds-sb-stats-right", text: `Weakness: ${weakText}` });

		// immunities and weaknesses
		const secondLine = statsContainer.createEl("div", { cls: "ds-sb-stats-line" });
		const movement = this.data.statblock.movement ?? "-";
		const captain = this.data.statblock.withCaptain ? `With Captain: ${this.data.statblock.withCaptain}` : "";
		secondLine.createEl("div", { cls: "ds-sb-stats-left", text: `Movement: ${movement}` });
		secondLine.createEl("div", { cls: "ds-sb-stats-right", text: captain });

		// characteristics
        const thirdLine = statsContainer.createEl("div", { cls: "ds-sb-stats-line ds-sb-characteristics-line" });
        thirdLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Might ${this.formatCharacteristic(this.data.statblock.characteristics.might)}` });
        thirdLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Agility ${this.formatCharacteristic(this.data.statblock.characteristics.agility)}` });
        thirdLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Reason ${this.formatCharacteristic(this.data.statblock.characteristics.reason)}` });
        thirdLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Intuition ${this.formatCharacteristic(this.data.statblock.characteristics.intuition)}` });
        thirdLine.createEl("div", { cls: "ds-sb-characteristics-pair", text: `Presence ${this.formatCharacteristic(this.data.statblock.characteristics.presence)}` });
    }

    private formatCharacteristic(value?: number): string {
        if (value === undefined || isNaN(value)) {
            return "N/A";
        }
        return value >= 0 ? `+${value}` : `${value}`;
    }

	private statsRow(statsContainer: HTMLDivElement) {
		const secondLine = statsContainer.createEl("div", { cls: "ds-sb-stats-row" });

		const sizeItem = secondLine.createEl("div", { cls: "ds-sb-stats-item" });
		sizeItem.createEl("div", { cls: "ds-sb-stats-item-top", text: `${this.data.statblock.size ?? "-"}` });
		sizeItem.createEl("div", { cls: "ds-sb-stats-item-bottom", text: `Size` });

		const speedItem = secondLine.createEl("div", { cls: "ds-sb-stats-item" });
		speedItem.createEl("div", { cls: "ds-sb-stats-item-top", text: `${this.data.statblock.speed ?? "-"}` });
		speedItem.createEl("div", { cls: "ds-sb-stats-item-bottom", text: `Speed` });

		const staminaItem = secondLine.createEl("div", { cls: "ds-sb-stats-item" });
		staminaItem.createEl("div", { cls: "ds-sb-stats-item-top", text: `${this.data.statblock.stamina ?? "-"}` });
		staminaItem.createEl("div", { cls: "ds-sb-stats-item-bottom", text: `Stamina` });

		const stabilityItem = secondLine.createEl("div", { cls: "ds-sb-stats-item" });
		stabilityItem.createEl("div", { cls: "ds-sb-stats-item-top", text: `${this.data.statblock.stability ?? "-"}` });
		stabilityItem.createEl("div", { cls: "ds-sb-stats-item-bottom", text: `Stability` });

		const freeStrikeItem = secondLine.createEl("div", { cls: "ds-sb-stats-item" });
		freeStrikeItem.createEl("div", { cls: "ds-sb-stats-item-top", text: `${this.data.statblock.freeStrike ?? "-"}` });
		freeStrikeItem.createEl("div", { cls: "ds-sb-stats-item-bottom", text: `Free Strike` });
	}
}
