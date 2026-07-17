import { App, parseYaml, TFile } from "obsidian";
import { DSESettings } from "@model/Settings";
import { SccResolver } from "@/refs/SccResolver";

const SCC_PREFIX = /^scc(\.v\d+)?:/;

/**
 * Extract and parse the first `ds-*` fenced code block of a file.
 * Shared by ReferenceResolver (below) and SccRefProvider (F1 seam).
 * Requires the OD-1(A) md-dse shape for compendium statblocks (ds-sb blocks).
 */
export async function extractFirstDsBlock(app: App, file: TFile): Promise<any> {
    const content = await app.vault.read(file);
    // Matches ```ds-<something> ... ``` or ~~~ds-<something> ... ~~~
    const blockRegex = /^([`~]{3,})ds-[\w-]+\s*\n([\s\S]+?)\n^\1/m;
    const match = content.match(blockRegex);
    if (!match) {
        const type = app.metadataCache.getFileCache(file)?.frontmatter?.type;
        throw new Error(
            `No Draw Steel Elements code block (ds-*) found in ${file.path}` +
            (typeof type === "string" ? ` (frontmatter type: ${type})` : "") +
            `. If this is a compendium file, re-sync the compendium to get the latest format.`);
    }
    try {
        return parseYaml(match[2]);
    } catch (e) {
        throw new Error(`Failed to parse YAML in ${file.path}: ${e.message}`);
    }
}

export class ReferenceResolver {
    private app: App;
    private settings: DSESettings;
    private sccResolver: SccResolver;

    constructor(app: App, settings: DSESettings,
                sccResolver: SccResolver = new SccResolver(app, settings)) {
        this.app = app;
        this.settings = settings;
        this.sccResolver = sccResolver;
    }

    public async resolveReferences(data: any): Promise<any> {
        if (typeof data === 'string') {
            if (SCC_PREFIX.test(data.trim())) {
                return await this.resolveScc(data);
            }
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

    /** F2 §4.3(c): scc refs resolve to a TFile via SccResolver, then reuse the ds-* extraction. */
    private async resolveScc(target: string): Promise<any> {
        const resolution = this.sccResolver.resolve(target);
        if (resolution.kind !== "vault") {
            throw new Error(
                `SCC reference (${target.trim()}) could not be resolved to a file in this vault. ` +
                `Sync the compendium (Settings → Draw Steel Elements → Sync compendium), or check the code.`);
        }
        return await extractFirstDsBlock(this.app, resolution.file);
    }

    public async resolvePath(path: string): Promise<any> {
        const file = this.findFile(path);

        if (!file || !(file instanceof TFile)) {
            console.warn(`Draw Steel Elements: Reference file not found: ${path}`);
            throw new Error(`Reference file (${path}) not found in root, ${this.settings.compendiumDestinationDirectory}, or when searching the cache`);
        }

        return await extractFirstDsBlock(this.app, file);
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
        file = this.app.metadataCache.getFirstLinkpathDest(path, "");
        if (file instanceof TFile) return file;

        return null;
    }
}
