import {Plugin} from 'obsidian';
import {MyPluginSettingTab} from "@views/SettingsTab";
import {DEFAULT_SETTINGS, DSESettings} from "@model/Settings";
import {CompendiumDownloader} from "@utils/CompendiumDownloader";
import {COMPENDIUM_REPOS} from "@model/Settings";
import { registerElements } from '@/utils/RegisterElements';
import { initializeSchemaRegistry, resetSchemaRegistry } from '@utils/JsonSchemaValidator';
import componentWrapperSchemaYaml from '@model/schemas/ComponentWrapperSchema.yaml';
import "./styles-source.css";


export default class DrawSteelAdmonitionPlugin extends Plugin {
    settings: DSESettings;

	readonly githubOwner = "steelCompendium";

    async onload() {
        console.log("Loading Draw Steel Elements Plugin.")

        // Initialize schema registry with all common schemas
        this.initializeSchemas();

        await this.loadSettings();
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        registerElements(this);

        this.addCommand({
            id: 'download-data-md-dse',
            name: 'Download Compendium',
            callback: () => this.downloadAndExtractRelease(),
        });
    }

    /**
     * Initialize all JSON schemas for validation
     * This registers only dependency schemas that other schemas reference
     */
    private initializeSchemas() {
        const dependencySchemas = [
            {
                id: "https://steelcompendium.io/schemas/component-wrapper-1.0.0",
                schema: componentWrapperSchemaYaml
            }
            // Add more dependency schemas here as needed
            // Note: Don't register main schemas that are being validated directly
        ];
        
        initializeSchemaRegistry(dependencySchemas);
    }

    onunload() {
        // Reset schema registry to clean up global state
        resetSchemaRegistry();
        console.log("Draw Steel Elements Plugin unloaded and schema registry reset");
    }

    get githubRepo(): string {
        return COMPENDIUM_REPOS[this.settings.compendiumVariant];
    }

    get linkReplacements(): Record<string, string> {
        return {
            'REL_PATH_PREFIX': '/' + encodeURIComponent(this.settings.compendiumDestinationDirectory) + '/',
            'REL_PATH_SUFFIX': '.md',
        };
    }

    async downloadAndExtractRelease() {
        return new CompendiumDownloader(this.app, this.githubOwner, this.githubRepo, undefined)
            .downloadAndExtractRelease(this.settings.compendiumReleaseTag, this.settings.compendiumDestinationDirectory, this.linkReplacements);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
