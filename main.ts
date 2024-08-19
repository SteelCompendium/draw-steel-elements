import {MarkdownView, Plugin} from 'obsidian';
import {DrawSteelAdmonitionSettingTab} from "./src/settings/drawSteelAdmonitionSettingTab";
import {DrawSteelAdmonitionSettings, DrawSteelAdmonitionSettingsIO} from "./src/settings/drawSteelAdmonitionSettings";
import {DrawSteelAdmonitionsPostProcessor} from "./src/drawSteelAdmonition/drawSteelAdmonitionPostProcessor";
import {drawSteelAdmonitionPlugin} from "./src/drawSteelAdmonition/drawSteelAdmonitionExtension";

export default class DrawSteelAdmonitionPlugin extends Plugin {
	settings: DrawSteelAdmonitionSettings;

	async onload() {
		console.log("Loading Draw Steel Elements Plugin.")
		await this.loadSettings();

		this.registerMarkdownPostProcessor((element, context) => {
			new DrawSteelAdmonitionsPostProcessor(this.settings).postProcess(element, context);
		});
		// TODO - this fails on first created dsa - pretty sure its because it takes an array which wont get updated
		this.registerEditorExtension(drawSteelAdmonitionPlugin(Array.from(this.settings.drawSteelAdmonitions.values())));

		this.addSettingTab(new DrawSteelAdmonitionSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		const settingData = await this.loadData();
		const [settings, dataMigrated] = DrawSteelAdmonitionSettingsIO.unmarshalAndMigrate(settingData);
		this.settings = settings;
		if (dataMigrated) {
			await this.saveSettings();
		}
	}

	async saveSettings() {
		const settingData = DrawSteelAdmonitionSettingsIO.marshal(this.settings);
		await this.saveData(settingData);
		this.rerenderMarkdownViews();
	}

	private rerenderMarkdownViews() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		view?.previewMode.rerender(true);
	}
}

