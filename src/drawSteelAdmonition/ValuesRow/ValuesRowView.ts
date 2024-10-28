import {MarkdownPostProcessorContext, Plugin} from "obsidian";
import {KeyValuePairs, KVPair} from "../../model/KeyValuePairs";

export class ValuesRowView {
	private plugin: Plugin;
	private data: KeyValuePairs;
	private ctx: MarkdownPostProcessorContext;

	constructor(plugin: Plugin, data: KeyValuePairs, ctx: MarkdownPostProcessorContext) {
		this.plugin = plugin;
		this.data = data;
		this.ctx = ctx;
	}

	public build(parent: HTMLElement) {
		const container = parent.createEl("div", {cls: "ds-values-row-container"});

		// Create a row container for the valuesRow
		const rowContainer = container.createEl("div", {cls: "ds-values-row-row"});

		// For each characteristic, create a cell
		this.data.values.forEach((pair: KVPair) => {
			const cell = rowContainer.createEl("div", {cls: "ds-values-row-cell"});

			// Value display
			const valueDisplay = cell.createEl("div", {
				cls: "ds-values-row-value",
				text: pair.value ?? "",
			});
			valueDisplay.style.fontSize = `${this.data.value_height}em`;

			// Name display
			const nameDisplay = cell.createEl("div", {
				cls: "ds-values-row-name",
				text: pair.name ?? "",
			});
			nameDisplay.style.fontSize = `${this.data.name_height}em`;
		});
	}
}
