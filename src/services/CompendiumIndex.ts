// src/services/CompendiumIndex.ts — the typed-model accessor over Task 1's read seam
// (SccResolver.entries()/codeToPath()) + metadataCache (D6 Task 2, spec §6).
//
// This is the D6 -> D8 hand-off: `getStatblock` unwraps StatblockConfig to the raw SDK
// `Statblock` D8 needs. `getEntity().model()` dispatches through the shared TYPE_ADAPTERS
// map (typeAdapters.ts) so this service and the display family (Task 6) never diverge on
// "how do we parse a `type: X` file."
import { App, TFile, Plugin } from "obsidian";
import type { Statblock } from "steel-compendium-sdk";
import { SccResolver } from "@/refs/SccResolver";
import { adapterForType, extractFirstDsBlockText, ElementModel } from "./typeAdapters";
import { StatblockConfig } from "@model/StatblockConfig";

export interface CompendiumEntry {
	scc: string;
	type: string;
	name: string;
	source: string;
	file: TFile;
}

export interface CompendiumEntity extends CompendiumEntry {
	frontmatter: Record<string, unknown>;
	/** Rendered markdown body (frontmatter stripped). */
	body(): Promise<string>;
	/** Typed element model when `type` maps to a known family; else undefined. */
	model(): Promise<ElementModel | undefined>;
}

export interface CompendiumIndex {
	readonly available: boolean;
	getEntry(code: string): CompendiumEntry | null;
	getEntity(code: string): Promise<CompendiumEntity | null>;
	getStatblock(code: string): Promise<Statblock | null>;
	query(text: string, filters?: { type?: string | RegExp; source?: string }): CompendiumEntry[];
	resolveSlug(slug: string, typeScope: string | RegExp): string[];
	/** Wire vault-event cache invalidation (plugin lifetime). */
	registerWatchers(plugin: Plugin): void;
}

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

class DseCompendiumIndex implements CompendiumIndex {
	/** code -> parsed model. Insertion-ordered Map; cachePut evicts the oldest key on
	 *  overflow (Map iteration order == insertion order), giving cheap LRU-ish behavior
	 *  without a dedicated data structure. */
	private readonly modelCache = new Map<string, ElementModel>();
	private static readonly CACHE_MAX = 128;

	constructor(private app: App, private resolver: SccResolver) {}

	get available(): boolean {
		return this.resolver.entries().length > 0;
	}

	getEntry(code: string): CompendiumEntry | null {
		const path = this.resolver.codeToPath(code);
		if (path === null) return null;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		const fm = (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
		return {
			scc: code,
			file,
			type: typeof fm.type === "string" ? fm.type : "",
			name: typeof fm.item_name === "string" ? fm.item_name
				: typeof fm.name === "string" ? fm.name : file.basename,
			source: typeof fm.source === "string" ? fm.source : code.split("/")[0],
		};
	}

	async getEntity(code: string): Promise<CompendiumEntity | null> {
		const entry = this.getEntry(code);
		if (entry === null) return null;
		const app = this.app, self = this;
		return {
			...entry,
			frontmatter: (app.metadataCache.getFileCache(entry.file)?.frontmatter ?? {}) as Record<string, unknown>,
			async body(): Promise<string> {
				return (await app.vault.read(entry.file)).replace(FRONTMATTER_RE, "");
			},
			async model(): Promise<ElementModel | undefined> {
				if (self.modelCache.has(code)) return self.modelCache.get(code);
				const adapter = adapterForType(entry.type);
				if (!adapter) return undefined;
				const model = await adapter.fromFile(app, entry.file);
				if (model != null) self.cachePut(code, model);
				return model ?? undefined;
			},
		};
	}

	async getStatblock(code: string): Promise<Statblock | null> {
		const entry = this.getEntry(code);
		if (entry === null || !/statblock$/.test(entry.type)) return null;
		const text = await extractFirstDsBlockText(this.app, entry.file);
		return text === null ? null : StatblockConfig.readYaml(text).statblock;
	}

	query(text: string, filters?: { type?: string | RegExp; source?: string }): CompendiumEntry[] {
		const q = text.trim().toLowerCase();
		return this.resolver.entries()
			.map((e) => this.getEntry(e.scc))
			.filter((e): e is CompendiumEntry => e !== null)
			.filter((e) => (filters?.source ? e.source === filters.source : true))
			.filter((e) => (filters?.type ? matchType(e.type, filters.type) : true))
			.filter((e) => (q === "" ? true : fuzzy(e.name.toLowerCase(), q)));
	}

	resolveSlug(slug: string, typeScope: string | RegExp): string[] {
		const s = slug.trim().toLowerCase();
		return this.resolver.entries()
			.map((e) => this.getEntry(e.scc))
			.filter((e): e is CompendiumEntry => e !== null && matchType(e.type, typeScope))
			.filter((e) => e.file.basename.toLowerCase() === s
				|| (String(this.app.metadataCache.getFileCache(e.file)?.frontmatter?.file_basename ?? "")).toLowerCase() === s
				|| e.name.toLowerCase() === s)
			.map((e) => e.scc);
	}

	registerWatchers(plugin: Plugin): void {
		const drop = () => this.modelCache.clear();
		plugin.registerEvent(this.app.vault.on("modify", drop));
		plugin.registerEvent(this.app.vault.on("delete", drop));
		plugin.registerEvent(this.app.vault.on("rename", drop));
	}

	private cachePut(code: string, model: ElementModel): void {
		if (this.modelCache.size >= DseCompendiumIndex.CACHE_MAX) {
			this.modelCache.delete(this.modelCache.keys().next().value as string);
		}
		this.modelCache.set(code, model);
	}
}

function matchType(type: string, scope: string | RegExp): boolean {
	return typeof scope === "string" ? type === scope : scope.test(type);
}

/** Subsequence fuzzy match — cheap and dependency-free (matches the SuggestModal intent). */
function fuzzy(haystack: string, needle: string): boolean {
	let i = 0;
	for (const ch of haystack) {
		if (ch === needle[i]) i++;
		if (i === needle.length) return true;
	}
	return needle.length === 0;
}

export function createCompendiumIndex(app: App, resolver: SccResolver): CompendiumIndex {
	return new DseCompendiumIndex(app, resolver);
}
