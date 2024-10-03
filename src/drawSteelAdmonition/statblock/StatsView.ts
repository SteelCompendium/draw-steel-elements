// StatsView.ts

import {App, MarkdownPostProcessorContext} from "obsidian";
import {StatblockData} from "../../model/StatblockData";

export class StatsView {
    private app: App;
    private data: StatblockData;
    private ctx: MarkdownPostProcessorContext;

    constructor(app: App, data: StatblockData, ctx: MarkdownPostProcessorContext) {
        this.app = app;
        this.data = data;
        this.ctx = ctx;
    }

    public build(parent: HTMLElement) {
        const statsContainer = parent.createEl("div", {cls: "ds-sb-stats"});

        // Stamina and immunities
        const firstLine = statsContainer.createEl("div", {cls: "ds-sb-stats-line"});
        const leftEl2 = firstLine.createEl("div",
            {cls: "ds-sb-stats-left", text: `Stamina ${this.data.stamina ?? "N/A"}`});
        const rightEl2 = firstLine.createEl("div",
            {cls: "ds-sb-stats-right", text: `Immunity ${this.data.immunities?.join(", ") ?? "None"}`});

        // Speed, size, and stability
        const secondLine = statsContainer.createEl("div", {cls: "ds-sb-stats-line"});
        const leftEl1 = secondLine.createEl("div",
            {cls: "ds-sb-stats-left", text: `Speed ${this.data.speed ?? "N/A"}`});
        const rightEl1 = secondLine.createEl("div",
            {cls: "ds-sb-stats-right", text: `Size ${this.data.size ?? "N/A"} / Stability ${this.data.stability ?? "N/A"}`});

        // Free strike
        const thirdLine = statsContainer.createEl("div", {cls: "ds-sb-stats-line"});
        const leftEl = thirdLine.createEl("div",
            {cls: "ds-sb-stats-left", text: ""});
        const rightEl = thirdLine.createEl("div",
            {cls: "ds-sb-stats-right", text: `Free Strike ${this.data.freeStrike ?? "N/A"}`});

        // characteristics
        const fourthLine = statsContainer.createEl("div", {cls: "ds-sb-stats-line ds-sb-characteristics-line"});
        fourthLine.createEl("div", {cls: "ds-sb-characteristics-pair", text: `Might ${this.formatCharacteristic(this.data.characteristics.might)}`});
        fourthLine.createEl("div", {cls: "ds-sb-characteristics-pair", text: `Agility ${this.formatCharacteristic(this.data.characteristics.agility)}`});
        fourthLine.createEl("div", {cls: "ds-sb-characteristics-pair", text: `Reason ${this.formatCharacteristic(this.data.characteristics.reason)}`});
        fourthLine.createEl("div", {cls: "ds-sb-characteristics-pair", text: `Intuition ${this.formatCharacteristic(this.data.characteristics.intuition)}`});
        fourthLine.createEl("div", {cls: "ds-sb-characteristics-pair", text: `Presence ${this.formatCharacteristic(this.data.characteristics.presence)}`});
    }

    private formatCharacteristic(value?: number): string {
        if (value === undefined || isNaN(value)) {
            return "N/A";
        }
        return value >= 0 ? `+${value}` : `${value}`;
    }
}
