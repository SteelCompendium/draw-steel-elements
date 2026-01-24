import {App, parseYaml, TFile} from "obsidian";
import {DSESettings} from "@model/Settings";

export class ReferenceResolver {
    private app: App;
    private settings: DSESettings;

    constructor(app: App, settings: DSESettings) {
        this.app = app;
        this.settings = settings;
    }

    public async resolveReferences(data: any): Promise<any> {
        if (typeof data === 'string') {
            if (data.startsWith('@')) {
                return await this.resolvePath(data.substring(1));
            } else if (data.startsWith('[[') && data.endsWith(']]')) {
                return await this.resolvePath(data.substring(2, data.length - 2));
            }
            return await this.resolvePath(data);
        }

        if (Array.isArray(data)) {
            return await Promise.all(data.map(item => this.resolveReferences(item)));
        }

        if (typeof data === 'object' && data !== null) {
            const resolvedData: any = {};
            for (const key of Object.keys(data)) {
                resolvedData[key] = await this.resolveReferences(data[key]);
            }
            return resolvedData;
        }

        return data;
    }

    public async resolvePath(path: string): Promise<any> {
        let file = this.findFile(path);

        if (!file || !(file instanceof TFile)) {
            console.warn(`Draw Steel Elements: Reference file not found: ${path}`);
            throw new Error(`Reference file (${path}) not found in root, ${this.settings.compendiumDestinationDirectory}, or when searching the cache`);
        }

        const content = await this.app.vault.read(file);

        // Regex to find the first ds- block
        // Matches ```ds-<something> ... ``` or ~~~ds-<something> ... ~~~
        const blockRegex = /^([`~]{3,})ds-[\w-]+\s*\n([\s\S]+?)\n^\1/m;
        const match = content.match(blockRegex);

        if (!match) {
            throw new Error(`No Draw Steel Elements code block (ds-*) found in ${file.path}`);
        }

        const yamlContent = match[2];
        try {
            return parseYaml(yamlContent);
        } catch (e) {
            throw new Error(`Failed to parse YAML in ${file.path}: ${e.message}`);
        }
    }

    private findFile(path: string): TFile | null {
        // 1. Try exact path from root
        let file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) return file;

        // 2. Try path from root with .md extension
        if (!path.endsWith('.md')) {
            file = this.app.vault.getAbstractFileByPath(path + '.md');
            if (file instanceof TFile) return file;
        }

        // 3. Try path relative to compendium directory
        const compendiumPath = `${this.settings.compendiumDestinationDirectory}/${path}`;
        file = this.app.vault.getAbstractFileByPath(compendiumPath);
        if (file instanceof TFile) return file;

        // 4. Try path relative to compendium directory with .md extension
        if (!path.endsWith('.md')) {
            file = this.app.vault.getAbstractFileByPath(compendiumPath + '.md');
            if (file instanceof TFile) return file;
        }

        // 5. Try resolving by name using Obsidian's metadata cache
        // This handles cases like "Thorn Dragon" finding "Folders/Thorn Dragon.md"
        file = this.app.metadataCache.getFirstLinkpathDest(path, "");
        if (file instanceof TFile) return file;

        return null;
    }
}
