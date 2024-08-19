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
	}
}
