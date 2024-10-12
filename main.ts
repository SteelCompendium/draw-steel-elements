import {Plugin} from 'obsidian';
import {PowerRollProcessor} from "./src/drawSteelAdmonition/powerRollProcessor";
import {HorizontalRuleProcessor} from "./src/drawSteelAdmonition/horizontalRuleProcessor";
import {InitiativeProcessor} from "./src/drawSteelAdmonition/initiativeProcessor";
import {NegotiationTrackerProcessor} from "./src/drawSteelAdmonition/negotiation/NegotiationTrackerProcessor";
import {StatblockProcessor} from "./src/drawSteelAdmonition/statblock/StatblockProcessor";
import {MyPluginSettingTab} from "./src/views/SettingsTab";
import {DEFAULT_SETTINGS, DSESettings} from "./src/model/Settings";
import {CompendiumDownloader} from "./src/utils/CompendiumDownloader";

export default class DrawSteelAdmonitionPlugin extends Plugin {
    settings: DSESettings;

    private readonly githubOwner = "steelCompendium";
    private readonly githubRepo = "data-md-dse";

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
        const powerRollProcessor = new PowerRollProcessor(this);
        const powerRollHandler = (source, el, ctx) => powerRollProcessor.postProcess(source, el, ctx);
        this.registerMarkdownCodeBlockProcessor("ds-pr", powerRollHandler);
        this.registerMarkdownCodeBlockProcessor("ds-power-roll", powerRollHandler);

        const hrProcessor = new HorizontalRuleProcessor();
        const hrHandler = (source, el, ctx) => hrProcessor.postProcess(source, el, ctx);
        this.registerMarkdownCodeBlockProcessor("ds-hr", hrHandler);
        this.registerMarkdownCodeBlockProcessor("ds-horizontal-rule", hrHandler);

        const initProcessor = new InitiativeProcessor(this.app);
        const initHandler = (source, el, ctx) => initProcessor.postProcess(source, el, ctx);
        this.registerMarkdownCodeBlockProcessor("ds-it", initHandler);
        this.registerMarkdownCodeBlockProcessor("ds-init", initHandler);
        this.registerMarkdownCodeBlockProcessor("ds-initiative", initHandler);
        this.registerMarkdownCodeBlockProcessor("ds-initiative-tracker", initHandler);

        let ntProcessor = new NegotiationTrackerProcessor(this.app);
        const ntHandler = (source, el, ctx) => ntProcessor.postProcess(source, el, ctx);
        this.registerMarkdownCodeBlockProcessor("ds-nt", ntHandler);
        this.registerMarkdownCodeBlockProcessor("ds-negotiation-tracker", ntHandler);

        let sbProcessor = new StatblockProcessor(this);
        const sbHandler = (source, el, ctx) => sbProcessor.postProcess(source, el, ctx);
        this.registerMarkdownCodeBlockProcessor("ds-sb", sbHandler);
        this.registerMarkdownCodeBlockProcessor("ds-statblock", sbHandler);
    }

    async downloadAndExtractRelease() {
        return new CompendiumDownloader(this.app, this.githubOwner, this.githubRepo)
            .downloadAndExtractRelease(this.settings.releaseTag, this.settings.destinationDirectory);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
