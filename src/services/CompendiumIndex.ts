// src/services/CompendiumIndex.ts — the typed-model accessor over Task 1's read seam
// (SccResolver.entries()/codeToPath()) + metadataCache (D6 Task 2, spec §6).
//
// This is the D6 -> D8 hand-off: `getStatblock` unwraps StatblockConfig to the raw SDK
// `Statblock` D8 needs. `getEntity().model()` dispatches through the shared TYPE_ADAPTERS
// map (typeAdapters.ts) so this service and the display family (Task 6) never diverge on
// "how do we parse a `type: X` file."
import { App, TFile, TAbstractFile, Plugin } from "obsidian";
import type { Statblock } from "steel-compendium-sdk";
import { SccResolver } from "@/refs/SccResolver";
import { adapterForType, ElementModel, STATBLOCK_TYPE_RE } from "./typeAdapters";
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
	/** code -> {parsed model, resolved vault path at cache-write time}. Insertion-ordered
	 *  Map; `model()` touches (delete+re-insert) on a cache hit and `cachePut` evicts the
	 *  oldest key on overflow, so Map iteration order tracks recency and gives true LRU
	 *  behavior without a dedicated structure. The path is captured at write time (not
	 *  re-derived from the live SccResolver index at invalidation time) so scoped
	 *  invalidation can't be defeated by event-ordering races against SccResolver's own
	 *  listener updating the same index for the same vault event. */
	private readonly modelCache = new Map<string, { model: ElementModel; path: string }>();
	private static readonly CACHE_MAX = 128;
	/** Bumped on every cache invalidation (full or scoped). `model()` captures the
	 *  generation before its genuinely-async `vault.read()`; `cachePut` only commits if
	 *  the generation is unchanged, so a read that raced an invalidation (file changed
	 *  mid-read) can never silently reintroduce a stale model into the cache. */
	private generation = 0;

	constructor(
		private app: App,
		private resolver: SccResolver,
		private readonly cacheMax: number = DseCompendiumIndex.CACHE_MAX,
	) {}

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
				const cached = self.modelCache.get(code);
				if (cached !== undefined) {
					// Cache hit: touch (delete + re-insert) to move this entry to the
					// Map's most-recently-used end -- true LRU, not insertion-order FIFO.
					self.modelCache.delete(code);
					self.modelCache.set(code, cached);
					return cached.model;
				}
				const adapter = adapterForType(entry.type);
				if (!adapter) return undefined;
				// Capture the generation BEFORE the await -- vault.read() inside
				// fromFile() is genuinely async, so an invalidation can land while this
				// is in flight. cachePut checks the generation hasn't moved before
				// committing (see cachePut's comment).
				const genAtStart = self.generation;
				const model = await adapter.fromFile(app, entry.file);
				if (model != null) self.cachePut(code, model, entry.file.path, genAtStart);
				return model ?? undefined;
			},
		};
	}

	async getStatblock(code: string): Promise<Statblock | null> {
		// Single source of truth: gate on the SAME anchored regex TYPE_ADAPTERS uses,
		// then dispatch through getEntity().model() -- the shared adapterForType path
		// and cache -- rather than hand-rolling an independent read/parse here.
		const entry = this.getEntry(code);
		if (entry === null || !STATBLOCK_TYPE_RE.test(entry.type)) return null;
		const entity = await this.getEntity(code);
		const model = await entity?.model();
		return model instanceof StatblockConfig ? model.statblock : null;
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
		plugin.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultEvent(file)));
		plugin.registerEvent(this.app.vault.on("delete", (file) => this.handleVaultEvent(file)));
		plugin.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.handleVaultEvent(file);
				this.invalidatePath(oldPath);
			}),
		);
	}

	/** Scoped invalidation (evict only the cache entries whose resolved path matches
	 *  the affected file) rather than the blunt "clear everything" the brief's Step 4
	 *  sample used -- a vault with routine unrelated editing would otherwise rarely
	 *  keep this cache warm. Falls back to a full clear only when the event can't be
	 *  mapped to a path (defensive: real Obsidian always supplies one here). */
	private handleVaultEvent(file: TAbstractFile): void {
		if (typeof file?.path === "string") {
			this.invalidatePath(file.path);
		} else {
			this.generation++;
			this.modelCache.clear();
		}
	}

	private invalidatePath(path: string): void {
		this.generation++;
		for (const [code, cached] of this.modelCache) {
			if (cached.path === path) this.modelCache.delete(code);
		}
	}

	private cachePut(code: string, model: ElementModel, path: string, genAtStart: number): void {
		// The generation moved since this read started -- an invalidation raced it, so
		// committing now would silently reintroduce a stale model. Drop the write; the
		// next model() call will see a cache miss and re-read.
		if (genAtStart !== this.generation) return;
		if (this.modelCache.size >= this.cacheMax) {
			this.modelCache.delete(this.modelCache.keys().next().value as string);
		}
		this.modelCache.set(code, { model, path });
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

export function createCompendiumIndex(
	app: App,
	resolver: SccResolver,
	options?: { cacheMax?: number },
): CompendiumIndex {
	return new DseCompendiumIndex(app, resolver, options?.cacheMax);
}
