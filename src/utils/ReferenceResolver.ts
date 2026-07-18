import { App, parseYaml, TFile } from "obsidian";
import { DSESettings } from "@model/Settings";
import { SccResolver } from "@/refs/SccResolver";

const SCC_PREFIX = /^scc(\.v\d+)?:/;

/** Narrow an unknown `catch` binding down to a displayable message without assuming
 *  it's an `Error` (thrown values aren't guaranteed to be). Mirrors
 *  JsonSchemaValidator.ts's helper of the same name (kept file-local, not shared,
 *  matching wave 1's convention). */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Extract and parse the first `ds-*` fenced code block of a file.
 * Shared by ReferenceResolver (below) and SccRefProvider (F1 seam).
 * Requires the OD-1(A) md-dse shape for compendium statblocks (ds-sb blocks).
 * Returns the raw parsed YAML payload — shape is caller-defined (statblock DTO,
 * arbitrary ds-* block, etc.), so callers narrow/cast at their own boundary, same
 * as `framework/seams/refs.ts`'s `ResolvedRef.data: unknown`.
 */
export async function extractFirstDsBlock(app: App, file: TFile): Promise<unknown> {
    const content = await app.vault.read(file);
    // Matches ```ds-<something> ... ``` or ~~~ds-<something> ... ~~~
    const blockRegex = /^([`~]{3,})ds-[\w-]+\s*\n([\s\S]+?)\n^\1/m;
    const match = content.match(blockRegex);
    if (!match) {
        const type: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.type;
        throw new Error(
            `No Draw Steel Elements code block (ds-*) found in ${file.path}` +
            (typeof type === "string" ? ` (frontmatter type: ${type})` : "") +
            `. If this is a compendium file, re-sync the compendium to get the latest format.`);
    }
    try {
        return parseYaml(match[2]);
    } catch (e: unknown) {
        throw new Error(`Failed to parse YAML in ${file.path}: ${errorMessage(e)}`);
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

    // NOTE: return type intentionally stays `any` (not `unknown`) — a genuinely
    // unsolvable `no-explicit-any` finding, not a silenceable one. Changing it to
    // `unknown` breaks tsc on test/unit/utils/referenceResolverScc.test.ts's "legacy
    // @path and nested-object walking are unchanged" case, which chains unnarrowed
    // property access straight off the resolved result
    // (`resolved.creature.statblock.name`) — that test is untouchable per this wave's
    // hard constraint (zero test modifications), and the recursive walk's output shape
    // is genuinely data-dependent (arbitrary nested YAML), so there is no callable
    // narrower return type here that keeps it compiling. The input param below is
    // still `unknown`, narrowed by the `typeof`/`Array.isArray` checks; only the
    // return keeps the pre-existing `any`. See wave-2 report.
    public async resolveReferences(data: unknown): Promise<any> {
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
            return await Promise.all((data as unknown[]).map(item => this.resolveReferences(item)));
        }

        if (typeof data === 'object' && data !== null) {
            const resolvedData: Record<string, unknown> = {};
            const record = data as Record<string, unknown>;
            for (const key of Object.keys(record)) {
                resolvedData[key] = await this.resolveReferences(record[key]);
            }
            return resolvedData;
        }

        return data;
    }

    /** F2 §4.3(c): scc refs resolve to a TFile via SccResolver, then reuse the ds-* extraction. */
    private async resolveScc(target: string): Promise<unknown> {
        const resolution = this.sccResolver.resolve(target);
        if (resolution.kind !== "vault") {
            throw new Error(
                `SCC reference (${target.trim()}) could not be resolved to a file in this vault. ` +
                `Sync the compendium (Settings → Draw Steel Elements → Sync compendium), or check the code.`);
        }
        return await extractFirstDsBlock(this.app, resolution.file);
    }

    public async resolvePath(path: string): Promise<unknown> {
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
