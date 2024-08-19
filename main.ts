import {MarkdownView, Plugin} from 'obsidian';
import {DrawSteelAdmonitionSettingTab} from "./src/settings/drawSteelAdmonitionSettingTab";
import {DrawSteelAdmonitionSettings, DrawSteelAdmonitionSettingsIO} from "./src/settings/drawSteelAdmonitionSettings";
import {setCssForClass, wipeCss} from "./src/io/drawSteelAdmonitionCss";
import {DrawSteelAdmonitionsPostProcessor} from "./src/drawSteelAdmonition/drawSteelAdmonitionPostProcessor";
import {drawSteelAdmonitionPlugin} from "./src/drawSteelAdmonition/drawSteelAdmonitionExtension";

export default class DrawSteelAdmonitionPlugin extends Plugin {
	settings: DrawSteelAdmonitionSettings;

	async onload() {
		console.log("Loading Inline Admonitions.")
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
		await this.refreshCss();
	}

	async saveSettings() {
		const settingData = DrawSteelAdmonitionSettingsIO.marshal(this.settings);
		await this.saveData(settingData);
		await this.refreshCss();
		this.rerenderMarkdownViews();
	}

	async refreshCss() {
		await wipeCss(this.app);
		for (const dsa of this.settings.drawSteelAdmonitions.values()) {
			// console.log("setting " + dsa.cssClasses().last() + " to " + dsa.simpleStyle());
			await setCssForClass(this.app, dsa.cssClasses().last(), dsa.simpleStyle());
		}
	}

	private rerenderMarkdownViews() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		view?.previewMode.rerender(true);
	}
}

