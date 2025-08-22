import {Plugin} from 'obsidian';
import {HorizontalRuleProcessor} from "@drawSteelAdmonition/horizontalRuleProcessor";
import {InitiativeProcessor} from "@drawSteelAdmonition/initiativeProcessor";
import {NegotiationTrackerProcessor} from "@drawSteelAdmonition/negotiation/NegotiationTrackerProcessor";
import {StatblockProcessor} from "@drawSteelAdmonition/statblock/StatblockProcessor";
import {MyPluginSettingTab} from "@views/SettingsTab";
import {DEFAULT_SETTINGS, DSESettings} from "@model/Settings";
import {CompendiumDownloader} from "@utils/CompendiumDownloader";
import {AbilityProcessor} from "@drawSteelAdmonition/ability/AbilityProcessor";
import {StaminaBarProcessor} from "@drawSteelAdmonition/StaminaBar/StaminaBarProcessor";
import {CounterProcessor} from "@drawSteelAdmonition/Counter/CounterProcessor";
import {CharacteristicsProcessor} from "@drawSteelAdmonition/Characteristics/CharacteristicsProcessor";
import {SkillsProcessor} from "@drawSteelAdmonition/Skills/SkillsProcessor";
import {ValuesRowProcessor} from "@drawSteelAdmonition/ValuesRow/ValuesRowProcessor";

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
		this.registerMarkdownCodeBlockProcessor("ds-stamina-bar", stamProcessor.handler);

		let counterProcessor = new CounterProcessor(this);
		this.registerMarkdownCodeBlockProcessor("ds-ct", counterProcessor.handler);
		this.registerMarkdownCodeBlockProcessor("ds-counter", counterProcessor.handler);

		let charProcessor = new CharacteristicsProcessor(this);
		this.registerMarkdownCodeBlockProcessor("ds-char", charProcessor.handler);
		this.registerMarkdownCodeBlockProcessor("ds-characteristics", charProcessor.handler);

		let skillProcessor = new SkillsProcessor(this);
		this.registerMarkdownCodeBlockProcessor("ds-skills", skillProcessor.handler);

		let valRowProcessor = new ValuesRowProcessor(this);
		this.registerMarkdownCodeBlockProcessor("ds-vr", valRowProcessor.handler);
		this.registerMarkdownCodeBlockProcessor("ds-value-row", valRowProcessor.handler);
		this.registerMarkdownCodeBlockProcessor("ds-values-row", valRowProcessor.handler);
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
