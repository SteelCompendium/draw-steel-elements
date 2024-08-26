// Settings
import {App, PluginSettingTab} from "obsidian";
import DrawSteelAdmonitionPlugin from "../../main";

export class DrawSteelAdmonitionSettingTab extends PluginSettingTab {
	plugin: DrawSteelAdmonitionPlugin;

	constructor(app: App, plugin: DrawSteelAdmonitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		const row: HTMLElement = containerEl.createDiv();
		row.addClass("dsa-setting-row")

		row.createSpan({
			text: "Power Roll Element",
			cls: "dsa-setting-row-title"
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
