import { Component, MarkdownPostProcessorContext, Plugin } from "obsidian";
import { Characteristics } from "@model/Characteristics";

export class CharacteristicsView {
	private plugin: Plugin;
	private data: Characteristics;
	private ctx: MarkdownPostProcessorContext;

	constructor(plugin: Plugin, data: Characteristics, ctx: MarkdownPostProcessorContext) {
		this.plugin = plugin;
		this.data = data;
		this.ctx = ctx;
	}

	public build(parent: HTMLElement) {
		const container = parent.createEl("div", { cls: "ds-characteristics-container" });

		// Create a row container for the characteristics
		const rowContainer = container.createEl("div", { cls: "ds-characteristics-row" });

		// List of characteristics
		const characteristics = [
			{ name: "Might", value: this.data.might },
			{ name: "Agility", value: this.data.agility },
			{ name: "Reason", value: this.data.reason },
			{ name: "Intuition", value: this.data.intuition },
			{ name: "Presence", value: this.data.presence },
		];

		// For each characteristic, create a cell
		characteristics.forEach((char) => {
			const cell = rowContainer.createEl("div", { cls: "ds-characteristics-cell" });

			// Value display
			const valueDisplay = cell.createEl("div", {
				cls: "ds-characteristics-value",
				text: char.value ?? "",
			});
			valueDisplay.style.fontSize = `${this.data.value_height}em`;

			// Name display
			const nameDisplay = cell.createEl("div", {
				cls: "ds-characteristics-name",
				text: char.name ?? "",
			});
			nameDisplay.style.fontSize = `${this.data.name_height}em`;
		});
	}
}
