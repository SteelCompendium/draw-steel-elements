import { App, PluginSettingTab, Setting } from 'obsidian';
import DrawSteelAdmonitionPlugin from "main";
import {CompendiumDownloader} from "@utils/CompendiumDownloader";

export class MyPluginSettingTab extends PluginSettingTab {
	plugin: DrawSteelAdmonitionPlugin;

	constructor(app: App, plugin: DrawSteelAdmonitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h3', { text: 'Draw Steel Compendium Downloader' });
		containerEl.createEl('p', { text: 'Important: The Compendium will download to a specific directory in your vault and delete any files in that directory' });

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
			.setDesc('Directory within your vault to extract the Compendium contents to.  THIS DIRECTORY WILL BE WIPED CLEAN!')
			.addText(text =>
				text
					.setPlaceholder('ImportedContent')
					.setValue(this.plugin.settings.compendiumDestinationDirectory)
					.onChange(async value => {
						this.plugin.settings.compendiumDestinationDirectory = value;
						await this.plugin.saveSettings();
					})
			);

		const downloadButton = containerEl.createEl('button', { cls: 'settings-action-button', text: 'Download Compendium' });
		downloadButton.addEventListener("click", () => {
			return new CompendiumDownloader(this.app, this.plugin.githubOwner, this.plugin.githubRepo, undefined)
				.downloadAndExtractRelease(this.plugin.settings.compendiumReleaseTag, this.plugin.settings.compendiumDestinationDirectory);
		});
	}
}
