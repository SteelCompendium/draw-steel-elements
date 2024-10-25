import {Plugin} from 'obsidian';
import {HorizontalRuleProcessor} from "./src/drawSteelAdmonition/horizontalRuleProcessor";
import {InitiativeProcessor} from "./src/drawSteelAdmonition/initiativeProcessor";
import {NegotiationTrackerProcessor} from "./src/drawSteelAdmonition/negotiation/NegotiationTrackerProcessor";
import {StatblockProcessor} from "./src/drawSteelAdmonition/statblock/StatblockProcessor";
import {MyPluginSettingTab} from "./src/views/SettingsTab";
import {DEFAULT_SETTINGS, DSESettings} from "./src/model/Settings";
import {CompendiumDownloader} from "./src/utils/CompendiumDownloader";
import {AbilityProcessor} from "./src/drawSteelAdmonition/ability/AbilityProcessor";
import {StaminaBarProcessor} from "./src/drawSteelAdmonition/StaminaBar/StaminaBarProcessor";
import {CounterProcessor} from "./src/drawSteelAdmonition/Counter/CounterProcessor";

export default class DrawSteelAdmonitionPlugin extends Plugin {
    settings: DSESettings;

	readonly githubOwner = "steelCompendium";
	readonly githubRepo = "data-md-dse";

    async onload() {
        console.log("Loading Draw Steel Elements Plugin.")

        await this.loadSettings();
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerElements();

        this.addCommand({
            id: 'download-data-md-dse',
            name: 'Download Compendium',
            callback: () => this.downloadAndExtractRelease(),
        });
    }

    onunload() {
    }

    private registerElements() {
        const abilityProcessor = new AbilityProcessor(this);
        this.registerMarkdownCodeBlockProcessor("ds-ab", abilityProcessor.handler);
        this.registerMarkdownCodeBlockProcessor("ds-ability", abilityProcessor.handler);

        const hrProcessor = new HorizontalRuleProcessor();
        this.registerMarkdownCodeBlockProcessor("ds-hr", hrProcessor.handler);
        this.registerMarkdownCodeBlockProcessor("ds-horizontal-rule", hrProcessor.handler);

        const initProcessor = new InitiativeProcessor(this.app);
        this.registerMarkdownCodeBlockProcessor("ds-it", initProcessor.handler);
        this.registerMarkdownCodeBlockProcessor("ds-init", initProcessor.handler);
        this.registerMarkdownCodeBlockProcessor("ds-initiative", initProcessor.handler);
        this.registerMarkdownCodeBlockProcessor("ds-initiative-tracker", initProcessor.handler);

        let ntProcessor = new NegotiationTrackerProcessor(this.app);
        this.registerMarkdownCodeBlockProcessor("ds-nt", ntProcessor.handler);
        this.registerMarkdownCodeBlockProcessor("ds-negotiation-tracker", ntProcessor.handler);

		let sbProcessor = new StatblockProcessor(this);
		this.registerMarkdownCodeBlockProcessor("ds-sb", sbProcessor.handler);
		this.registerMarkdownCodeBlockProcessor("ds-statblock", sbProcessor.handler);

		let stamProcessor = new StaminaBarProcessor(this);
		this.registerMarkdownCodeBlockProcessor("ds-stam", stamProcessor.handler);
		this.registerMarkdownCodeBlockProcessor("ds-stamina", stamProcessor.handler);

		let counterProcessor = new CounterProcessor(this);
		this.registerMarkdownCodeBlockProcessor("ds-ct", counterProcessor.handler);
		this.registerMarkdownCodeBlockProcessor("ds-counter", counterProcessor.handler);
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
