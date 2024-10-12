import { App, PluginSettingTab, Setting } from 'obsidian';
import DrawSteelAdmonitionPlugin from "../../main";

export class MyPluginSettingTab extends PluginSettingTab {
	plugin: DrawSteelAdmonitionPlugin;

	constructor(app: App, plugin: DrawSteelAdmonitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'GitHub Release Importer Settings' });

		new Setting(containerEl)
			.setName('Release Tag (Optional)')
			.setDesc(
				'Specific release tag to download. Leave empty to download the latest release.'
			)
			.addText(text =>
				text
					.setPlaceholder('v1.0.0')
					.setValue(this.plugin.settings.compendiumReleaseTag)
					.onChange(async value => {
						this.plugin.settings.compendiumReleaseTag = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Destination Directory')
			.setDesc('Directory within your vault to extract the contents to.')
			.addText(text =>
				text
					.setPlaceholder('ImportedContent')
					.setValue(this.plugin.settings.compendiumDestinationDirectory)
					.onChange(async value => {
						this.plugin.settings.compendiumDestinationDirectory = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
