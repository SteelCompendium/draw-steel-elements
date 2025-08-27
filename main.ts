import {Plugin} from 'obsidian';
import {MyPluginSettingTab} from "@views/SettingsTab";
import {DEFAULT_SETTINGS, DSESettings} from "@model/Settings";
import {CompendiumDownloader} from "@utils/CompendiumDownloader";
import { registerElements } from '@/utils/RegisterElements';
import "./styles-source.css";


export default class DrawSteelAdmonitionPlugin extends Plugin {
    settings: DSESettings;

	readonly githubOwner = "steelCompendium";
	readonly githubRepo = "data-md-dse";

    async onload() {
        console.log("Loading Draw Steel Elements Plugin.")

        await this.loadSettings();
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        registerElements(this);

        this.addCommand({
            id: 'download-data-md-dse',
            name: 'Download Compendium',
            callback: () => this.downloadAndExtractRelease(),
        });
    }

    onunload() {
    }

    async downloadAndExtractRelease() {
        return new CompendiumDownloader(this.app, this.githubOwner, this.githubRepo, undefined)
            .downloadAndExtractRelease(this.settings.compendiumReleaseTag, this.settings.compendiumDestinationDirectory);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
