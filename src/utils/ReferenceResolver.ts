import { App, parseYaml, TFile } from "obsidian";
import { DSESettings } from "@model/Settings";

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
             }
             return data;
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

    public async resolvePath(relativePath: string): Promise<any> {
        const fullPath = `${this.settings.compendiumDestinationDirectory}/${relativePath}`;
        
        // Try to find the file
        let file = this.app.vault.getAbstractFileByPath(fullPath);
        if (!file && !fullPath.endsWith('.md')) {
            file = this.app.vault.getAbstractFileByPath(fullPath + '.md');
        }

        if (!file || !(file instanceof TFile)) {
            console.warn(`Draw Steel Elements: Reference file not found: ${fullPath}`);
            return null; // Or throw error? For now return null or keep original string?
            // If I return null, the field becomes null. If I return the string, it stays a string.
            // Returning the string might be safer if resolution fails, so it doesn't break things unexpectedly,
            // but the user might wonder why it didn't work. 
            // Let's throw an error so it propagates to the UI error message.
            throw new Error(`Reference file not found: ${relativePath}`);
        }

        const content = await this.app.vault.read(file);
        
        // Regex to find the first ds- block
        // Matches ```ds-<something> ... ``` or ~~~ds-<something> ... ~~~
        const blockRegex = /^([`~]{3,})ds-[\w-]+\s*\n([\s\S]+?)\n^\1/m;
        const match = content.match(blockRegex);

        if (!match) {
             throw new Error(`No Draw Steel Elements code block (ds-*) found in ${relativePath}`);
        }

        const yamlContent = match[2];
        console.log("resolved " + yamlContent)
        try {
            return parseYaml(yamlContent);
        } catch (e) {
            throw new Error(`Failed to parse YAML in ${relativePath}: ${e.message}`);
        }
    }
}
