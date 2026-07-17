// src/refs/SccResolver.ts — SCC (Steel Compendium Classification) code utilities (F2 §4).
//
// Task 3 scope: pure functions only (normalizeSccTarget, sccToFilePath). Task 4 layers the
// stateful `SccResolver` class (which does need App/TFile/etc.) on top of them below.
import { App, Plugin, TAbstractFile, TFile, normalizePath } from 'obsidian';
import type { DSESettings } from '@model/Settings';

/**
 * Strip the `scc:`/`scc.v1:` prefix and any `#format` fragment (F2 §4.1).
 * Returns the bare code ("source/type/item"), or null when the target is not an
 * SCC reference this plugin may resolve — including any future `scc.vN:` version,
 * which must NEVER silently bind to current content (spec v1.1 mandate).
 */
export function normalizeSccTarget(raw: string): string | null {
    // [\s\S] instead of `.` + the `s` (dotAll) flag: this repo's tsconfig targets ES6,
    // and the dotAll flag needs ES2018+ (tsc TS1501) — [\s\S] matches any char, newlines
    // included, without it.
    const match = /^scc(?:\.v(\d+))?:([\s\S]*)$/.exec(raw.trim());
    if (!match) return null;
    if (match[1] !== undefined && match[1] !== "1") return null;
    const code = match[2].split("#")[0].trim();
    return code.length > 0 ? code : null;
}

/**
 * Mirror of steel-etl `internal/output/generator.go:SCCToFilePath`: drop the source
 * segment (first slash-separated part), expand dots to path separators in the rest,
 * append the extension. The unified Browse tree guarantees path ≡ this derivation.
 *
 * Go's version uses `filepath.Join(pathParts...)`, which is documented to ignore empty
 * path elements ("Empty elements are ignored", https://pkg.go.dev/path/filepath#Join) —
 * a stray leading/trailing dot in a code segment (e.g. "rule." or ".turn") produces an
 * empty fragment when dot-split, and Go's Join silently drops it rather than emitting a
 * double slash or a leading slash. A naive `.join("/")` here would NOT do that, so empty
 * fragments are filtered before joining to keep this an exact mirror (see
 * test/unit/refs/sccCode.test.ts "Go-mirror edge cases").
 *
 * One deliberate divergence: Go returns the sentinel path `"unknown" + ext` for a
 * degenerate code (no `/`, or nothing left after dropping the source segment); this
 * mirror returns `null` instead so callers (SccResolver) can fall through to the
 * frontmatter index / web fallback rather than resolving to a bogus vault path.
 */
export function sccToFilePath(code: string, ext = ".md"): string | null {
    const parts = code.split("/");
    if (parts.length < 2) return null;
    const pathParts: string[] = [];
    for (const part of parts.slice(1)) {
        for (const segment of part.split(".")) pathParts.push(segment);
    }
    if (pathParts.length === 0) return null;
    pathParts[pathParts.length - 1] += ext;
    const nonEmpty = pathParts.filter((segment) => segment.length > 0);
    return nonEmpty.length > 0 ? nonEmpty.join("/") : null;
}

/** Frontmatter block delimiter pattern (YAML `---\n...\n---` block). Shared across
 *  CompendiumIndex and typeAdapters to strip frontmatter from markdown bodies. */
export const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

/** A single synced code → vault-path record (OD-D6-2a read seam). */
export interface CompendiumCodeEntry {
	scc: string;
	path: string;
}

/**
 * F2 §4.2 — the outcome of resolving one `scc:`/`scc.vN:` target:
 *   - "vault": a local file already carries (or was derived to carry) this code —
 *     `linkpath` is the resolved vault path, `file` the TFile itself.
 *   - "web": no local file, but the OD-7 web-fallback setting is on — `url` is the
 *     permanent steelcompendium.io redirect stub for the code.
 *   - "unresolved": no local file and no web fallback (toggle off, or the target
 *     wasn't a resolvable scc reference in the first place) — callers render the
 *     display text as plain, unlinked text.
 */
export type SccResolution =
	| { kind: 'vault'; file: TFile; linkpath: string }
	| { kind: 'web'; url: string }
	| { kind: 'unresolved'; code: string };

/**
 * F2 §4.2 — SCC reference resolution. Synchronous by design so the DOM pass and
 * F1's pipeline can call it mid-render; the frontmatter index seeds lazily on the
 * first resolve that needs it and is maintained incrementally via registerWatchers.
 */
export class SccResolver {
	/** bare code → vault path. null = not yet seeded. */
	private index: Map<string, string> | null = null;

	constructor(
		private app: App,
		private settings: DSESettings,
	) {}

	public resolve(rawTarget: string): SccResolution {
		const code = normalizeSccTarget(rawTarget);
		if (code === null) return { kind: 'unresolved', code: rawTarget.trim() };

		// 1. Path derivation against the managed root (covers a fresh sync, O(1)).
		const relative = sccToFilePath(code);
		if (relative !== null) {
			const derived = normalizePath(`${this.settings.compendiumDestinationDirectory}/${relative}`);
			const file = this.app.vault.getAbstractFileByPath(derived);
			if (file instanceof TFile) return { kind: 'vault', file, linkpath: file.path };
		}

		// 2. Frontmatter-`scc` index (codes are forever; paths are not).
		const indexed = this.lookupIndex(code);
		if (indexed !== null) return { kind: 'vault', file: indexed, linkpath: indexed.path };

		// 3. Web permalink — the spec's permanent redirect stub (OD-7, click-time only).
		if (this.settings.sccWebFallback) {
			return { kind: 'web', url: `https://steelcompendium.io/scc/${code}/` };
		}

		// 4. Unresolved — caller renders display text as plain text.
		return { kind: 'unresolved', code };
	}

	/** OD-D6-2a: enumerate every indexed frontmatter-`scc` code → path (seeds on demand).
	 *  Returns a snapshot copy so callers (CompendiumIndex) cannot mutate the live index. */
	public entries(): CompendiumCodeEntry[] {
		if (this.index === null) this.seedIndex();
		const out: CompendiumCodeEntry[] = [];
		for (const [scc, path] of this.index!) out.push({ scc, path });
		return out;
	}

	/** OD-D6-2a: bare code → indexed vault path (seeds on demand), or null. Path-derivation
	 *  (the resolve() fast path) is deliberately NOT consulted here — this is the identity
	 *  index only; callers wanting the full ladder use resolve(). */
	public codeToPath(code: string): string | null {
		if (this.index === null) this.seedIndex();
		return this.index!.get(code) ?? null;
	}

	/** Wire incremental index maintenance to vault/metadata events (plugin lifetime). */
	public registerWatchers(plugin: Plugin): void {
		plugin.registerEvent(this.app.metadataCache.on('changed', (file: TFile) => this.handleChanged(file)));
		plugin.registerEvent(
			this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.handleRename(file, oldPath)),
		);
		plugin.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => this.handleDelete(file)));
	}

	public handleChanged(file: TFile): void {
		if (this.index === null) return;
		this.removePath(file.path);
		this.indexFile(file);
	}

	public handleRename(file: TAbstractFile, oldPath: string): void {
		if (this.index === null) return;
		this.removePath(oldPath);
		if (file instanceof TFile) this.indexFile(file);
	}

	public handleDelete(file: TAbstractFile): void {
		if (this.index === null) return;
		this.removePath(file.path);
	}

	private lookupIndex(code: string): TFile | null {
		if (this.index === null) this.seedIndex();
		const indexedPath = this.index!.get(code);
		if (indexedPath === undefined) return null;
		const file = this.app.vault.getAbstractFileByPath(indexedPath);
		return file instanceof TFile ? file : null;
	}

	private seedIndex(): void {
		this.index = new Map();
		for (const file of this.app.vault.getMarkdownFiles()) this.indexFile(file);
	}

	private indexFile(file: TFile): void {
		const scc = this.app.metadataCache.getFileCache(file)?.frontmatter?.scc;
		if (typeof scc === 'string' && scc.length > 0) this.index!.set(scc, file.path);
	}

	private removePath(path: string): void {
		for (const [code, indexedPath] of this.index!) {
			if (indexedPath === path) this.index!.delete(code);
		}
	}
}
