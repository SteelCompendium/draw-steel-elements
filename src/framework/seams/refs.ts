// F1 §3.7 — ReferenceService: generalizes `src/utils/ReferenceResolver.ts` into a
// provider chain.
//
// F1 ships two built-in providers, porting the legacy behavior verbatim:
//   - "at-path"  ("@Creatures/Goblin")
//   - "wikilink" ("[[Thorn Dragon]]")
// plus a RESERVED "scc" slot: a built-in placeholder that recognizes the `scc:` /
// `scc.vN:` ref shape (so the pipeline's error message is the standard one, not a
// generic "I don't understand this string"), but always fails until F2 `register()`s
// a real scc RefProvider. Because later-registered providers are consulted BEFORE
// built-ins (override order, F1 §3.7), F2's provider transparently takes over the
// "scc" kind the moment it registers — no change needed here.
//
// Both built-in providers share `resolveByPath`, which ports `ReferenceResolver`'s
// 5-step `findFile` fallback (exact path → `+.md` → compendium-dir prefix → prefix
// `+.md` → `metadataCache.getFirstLinkpathDest`) and first-`ds-*`-block extraction.
//
// Plan 06 amends F1 §3.7 with one ADDITIVE method, `resolveBarePath` — the legacy bare
// `statblock` resolution for the initiative element. It is a direct method, NOT a
// provider, so the resolve()/resolveDeep() chain (and every other element) is unaffected.
//
// Do NOT modify src/utils/ReferenceResolver.ts — it stays live for legacy elements
// until they migrate (Plan 02 migrates no element).
import { App, TFile } from 'obsidian';
import type { DSESettings } from '@model/Settings';
// Task 7: the ds-* block extraction (findFile's tail) is shared with
// ReferenceResolver.ts/SccRefProvider.ts via this helper, rather than carrying a
// private copy here — this file used to inline its own DS_BLOCK_RE + miss error,
// which had drifted from the shared one (no frontmatter-type hint). Reunifying means
// resolveByPath (the at-path/wikilink providers) AND resolveBarePath (initiative) now
// emit byte-identical miss errors to legacy's ReferenceResolver.
import { extractFirstDsBlock } from '@utils/ReferenceResolver';

export type RefKind = 'at-path' | 'wikilink' | 'scc' | (string & {});

export interface RefRequest {
	/** Raw reference text: "@Creatures/Goblin", "[[Thorn Dragon]]",
	 *  "scc.v1:mcdm.heroes.v1/class/shadow" (bare "scc:" ≡ v1 per spec v1.1). */
	raw: string;
	kind: RefKind;
	/** Referencing note's path — context for wikilink resolution. */
	sourcePath: string;
}

export interface ResolvedRef {
	/** Parsed YAML payload of the resolved target (today: first ds-* block of the file). */
	data: unknown;
	/** Vault file the data came from, when applicable. */
	file?: TFile;
	/** Bare SCC identity ("source/type/item") when kind === "scc". */
	scc?: string;
}

export interface RefProvider {
	readonly kind: RefKind;
	/** Cheap syntactic test — first provider whose canResolve passes wins. */
	canResolve(raw: string): boolean;
	resolve(req: RefRequest): Promise<ResolvedRef>;
}

export interface ReferenceService {
	/** F2 calls register(sccRefProvider). Returns unregister. Later providers are
	 *  consulted BEFORE built-ins (override order). */
	register(provider: RefProvider): () => void;
	resolve(raw: string, sourcePath: string): Promise<ResolvedRef>;
	/** Deep-walk arbitrary parsed-YAML data, replacing every resolvable string with its
	 *  ResolvedRef.data (today's ReferenceResolver.resolveReferences, generalized). */
	resolveDeep(data: unknown, sourcePath: string): Promise<unknown>;
	/** Plan 06 (initiative `statblock` refs) — F1 §3.7 additive amendment. Resolve a BARE
	 *  path/name ("Thorn Dragon") exactly like the legacy statblock resolution
	 *  (ReferenceResolver.resolveReferences string dispatch → resolvePath): strip a leading
	 *  "@" or a "[[...]]" wrapper, run the 5-step findFile with the legacy hardcoded
	 *  sourcePath "" (ReferenceResolver.ts:89 — global first match, NOT note-relative like
	 *  the providers), then extract+parse the first ds-* block. Throws the legacy messages
	 *  when the file is not found or has no ds-* block, and when the block YAML is
	 *  malformed (ReferenceResolver.resolvePath threw all three; the initiative merge wraps
	 *  them in its hint). Returns null ONLY when the block parses to null/undefined —
	 *  legacy's `if (resolved)` skipped the merge for that without erroring. Deliberately a
	 *  DIRECT method, not a provider: bare strings must keep passing through
	 *  resolve()/resolveDeep() untouched for every other element. */
	resolveBarePath(path: string): Promise<ResolvedRef | null>;
}

// Matches `scc:` and `scc.v1:`, `scc.v2:`, … per spec v1.1 (bare "scc:" ≡ v1).
const SCC_PREFIX_RE = /^scc(\.v\d+)?:/;

function unresolvableReferenceError(raw: string): Error {
	return new Error(`Unresolvable reference: "${raw}" (no provider could resolve this reference)`);
}

// Legacy ReferenceResolver.findFile, 5-step fallback, generalized to take the
// requesting note's sourcePath (used by step 5, metadataCache.getFirstLinkpathDest)
// instead of the legacy hardcoded "".
function findFile(app: App, settings: DSESettings, path: string, sourcePath: string): TFile | null {
	// 1. Try exact path from root
	let file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) return file;

	// 2. Try path from root with .md extension
	if (!path.endsWith('.md')) {
		file = app.vault.getAbstractFileByPath(path + '.md');
		if (file instanceof TFile) return file;
	}

	// 3. Try path relative to compendium directory
	const compendiumPath = `${settings.compendiumDestinationDirectory}/${path}`;
	file = app.vault.getAbstractFileByPath(compendiumPath);
	if (file instanceof TFile) return file;

	// 4. Try path relative to compendium directory with .md extension
	if (!path.endsWith('.md')) {
		file = app.vault.getAbstractFileByPath(compendiumPath + '.md');
		if (file instanceof TFile) return file;
	}

	// 5. Try resolving by name using Obsidian's metadata cache (e.g. "Thorn Dragon" →
	// "Folders/Thorn Dragon.md"), relative to the referencing note.
	file = app.metadataCache.getFirstLinkpathDest(path, sourcePath);
	if (file instanceof TFile) return file;

	return null;
}

// Legacy ReferenceResolver.resolvePath: resolve `path` to a file, then extract and
// parse the first ds-* fenced block (via the shared extractFirstDsBlock, which throws
// the miss/parse errors). Shared by the at-path and wikilink providers, and by
// resolveBarePath below.
async function resolveByPath(
	app: App,
	settings: DSESettings,
	path: string,
	sourcePath: string,
): Promise<ResolvedRef> {
	const file = findFile(app, settings, path, sourcePath);

	if (!file) {
		throw new Error(
			`Reference file (${path}) not found in root, ${settings.compendiumDestinationDirectory}, or when searching the cache`,
		);
	}

	const data = await extractFirstDsBlock(app, file);
	return { data, file };
}

function createAtPathProvider(app: App, settings: DSESettings): RefProvider {
	return {
		kind: 'at-path',
		canResolve: (raw) => raw.startsWith('@'),
		resolve: (req) => resolveByPath(app, settings, req.raw.substring(1), req.sourcePath),
	};
}

function createWikilinkProvider(app: App, settings: DSESettings): RefProvider {
	return {
		kind: 'wikilink',
		canResolve: (raw) => raw.startsWith('[[') && raw.endsWith(']]'),
		resolve: (req) => resolveByPath(app, settings, req.raw.substring(2, req.raw.length - 2), req.sourcePath),
	};
}

// Reserved slot (F1 §3.7 note for F2): recognizes the scc: / scc.vN: ref *shape* so
// the pipeline reports the standard unresolvable-reference message instead of "this
// string doesn't look like a reference at all" — but never actually resolves
// anything. F2 registers a real "scc" RefProvider, which (per override order) is
// consulted before this placeholder and supersedes it.
function createReservedSccProvider(): RefProvider {
	return {
		kind: 'scc',
		canResolve: (raw) => SCC_PREFIX_RE.test(raw),
		resolve: async (req) => {
			throw unresolvableReferenceError(req.raw);
		},
	};
}

class DseReferenceService implements ReferenceService {
	// Registration order preserved; findProvider walks it back-to-front so the
	// most-recently-registered provider is consulted first (override order).
	private readonly registered: RefProvider[] = [];
	private readonly builtins: RefProvider[];

	constructor(
		private readonly app: App,
		private readonly settings: DSESettings,
	) {
		this.builtins = [createAtPathProvider(app, settings), createWikilinkProvider(app, settings), createReservedSccProvider()];
	}

	register(provider: RefProvider): () => void {
		this.registered.push(provider);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			const index = this.registered.indexOf(provider);
			if (index >= 0) this.registered.splice(index, 1);
		};
	}

	private findProvider(raw: string): RefProvider | undefined {
		for (let i = this.registered.length - 1; i >= 0; i--) {
			if (this.registered[i].canResolve(raw)) return this.registered[i];
		}
		for (const provider of this.builtins) {
			if (provider.canResolve(raw)) return provider;
		}
		return undefined;
	}

	async resolve(raw: string, sourcePath: string): Promise<ResolvedRef> {
		const provider = this.findProvider(raw);
		if (!provider) throw unresolvableReferenceError(raw);
		return provider.resolve({ raw, kind: provider.kind, sourcePath });
	}

	// Plan 06 (initiative): legacy bare-path statblock resolution — see the interface doc.
	// Reproduces ReferenceResolver.resolveReferences' string dispatch (:14-21) + resolvePath
	// (:38-63) via resolveByPath, which throws the byte-exact legacy messages on a missing
	// file or missing ds-* block and on malformed block YAML (the initiative merge wraps
	// them in its "multiple instances/full path" hint, matching legacy). The ONE
	// non-throwing miss is a block that parses to null/undefined: legacy truth-tested the
	// parsed data (`if (resolved)`, EncounterData.ts:114) and silently skipped the merge —
	// surfaced here as a null return. sourcePath is hardcoded "" in the findFile step-5
	// metadata-cache lookup, byte-exact with legacy (ReferenceResolver.ts:89) — NOT the
	// note-relative sourcePath the providers use.
	async resolveBarePath(path: string): Promise<ResolvedRef | null> {
		let bare = path;
		if (bare.startsWith('@')) {
			bare = bare.substring(1);
		} else if (bare.startsWith('[[') && bare.endsWith(']]')) {
			bare = bare.substring(2, bare.length - 2);
		}

		const resolved = await resolveByPath(this.app, this.settings, bare, '');
		return resolved.data == null ? null : resolved;
	}

	async resolveDeep(data: unknown, sourcePath: string): Promise<unknown> {
		if (typeof data === 'string') {
			const provider = this.findProvider(data);
			if (!provider) return data;
			const resolved = await provider.resolve({ raw: data, kind: provider.kind, sourcePath });
			return resolved.data;
		}

		if (Array.isArray(data)) {
			return Promise.all(data.map((item) => this.resolveDeep(item, sourcePath)));
		}

		if (typeof data === 'object' && data !== null) {
			const entries = await Promise.all(
				Object.entries(data as Record<string, unknown>).map(
					async ([key, value]) => [key, await this.resolveDeep(value, sourcePath)] as const,
				),
			);
			return Object.fromEntries(entries);
		}

		return data;
	}
}

/** Construct a fresh ReferenceService bound to a vault/settings pair. */
export function createReferenceService(app: App, settings: DSESettings): ReferenceService {
	return new DseReferenceService(app, settings);
}
