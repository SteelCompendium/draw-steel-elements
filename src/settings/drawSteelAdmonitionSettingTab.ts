// Settings
import {App, PluginSettingTab, Setting} from "obsidian";
import {EditDrawSteelAdmonitionModal} from "./editDrawSteelAdmonitionModal";
import DrawSteelAdmonitionPlugin from "../../main";
import {DrawSteelAdmonition} from "../drawSteelAdmonition/drawSteelAdmonition";

export class DrawSteelAdmonitionSettingTab extends PluginSettingTab {
	plugin: DrawSteelAdmonitionPlugin;

	constructor(app: App, plugin: DrawSteelAdmonitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		// Create Inline Admonition Button
		new Setting(containerEl)
			.addButton(b => b
				.setButtonText("Create new inline admonition")
				.onClick(async evt => {
					EditDrawSteelAdmonitionModal.new(this.app, async result => {
						this.plugin.settings.drawSteelAdmonitions.set(result.slug, result);
						await this.plugin.saveSettings();
						this.rebuildSettingRows(containerEl);
					}).open();
				}));

		this.rebuildSettingRows(containerEl);
	}

	// Renders the "samples" with options in the main settings view
	private rebuildSettingRows(containerEl: HTMLElement) {
		containerEl.findAll(".dsa-setting-row").forEach(e => e.remove());
		new Map([...this.plugin.settings.drawSteelAdmonitions].sort()).forEach((dsa, identifier) => {
			this.displaySampleDSA(containerEl, dsa, identifier);
		});
	}

	// Renders a single Inline Admonition "sample" with options
	private displaySampleDSA(containerEl: HTMLElement, dsa: DrawSteelAdmonition, identifier: string) {
		const row: HTMLElement = containerEl.createDiv();
		row.addClass("dsa-setting-row")

		row.createSpan({
			text: dsa.type + " Type",
			cls: "dsa-setting-row-title"
		});

		row.createEl("code", {
			text: dsa.sampleText(),
			cls: "dsa dsa-sample dsa-" + dsa.slug,
			parent: row,
			attr: {"style": dsa.simpleStyle() + `; margin: 0.5em;`}
		});

		const editButton = row.createEl("button", {text: "Edit"})
		editButton.addEventListener("click", evt => {
			EditDrawSteelAdmonitionModal.edit(this.app, dsa, async result => {
				// if the dsa prefix changed, we need to kill the original
				this.plugin.settings.drawSteelAdmonitions.delete(identifier);
				this.plugin.settings.drawSteelAdmonitions.set(result.slug, result);
				await this.plugin.saveSettings();
				this.rebuildSettingRows(containerEl);
			}).open();
		});

		const deleteButton = row.createEl("button", {text: "Delete"})
		deleteButton.addEventListener("click", async evt => {
			this.plugin.settings.drawSteelAdmonitions.delete(identifier);
			await this.plugin.saveSettings();
			row.remove();
		});
	}
}
