import {
	App, Notice, TFile, normalizePath, requestUrl, RequestUrlParam, RequestUrlResponse,
} from "obsidian";
import * as JSZip from "jszip";
import {
	CompendiumManifest, ManifestStore, MANIFEST_SCHEMA_VERSION, sha256Hex,
} from "./manifest";

export const COMPENDIUM_SOURCE = "SteelCompendium/data-unified";
export const COMPENDIUM_FORMAT = "md-dse";

export interface SyncOptions {
	/** Vault folder to sync into, e.g. "DS Compendium". */
	root: string;
	/** Release tag to pin; empty/undefined = latest. */
	releaseTag?: string;
	/** Data locale segment, e.g. "en". */
	locale: string;
}

export interface SyncReport {
	releaseTag: string;
	created: string[];
	updated: string[];
	unchanged: string[];
	/** User files squatting on compendium paths — never touched, surfaced to the user. */
	skippedConflicts: string[];
	/** Manifest-tracked files removed upstream, user never modified → moved to trash. */
	trashed: string[];
	/** Manifest-tracked files removed upstream but user-modified → left in place. */
	keptModified: string[];
	/** Incoming paths rejected as unsafe (absolute, or containing a ".." segment) — never written. */
	rejectedPaths: string[];
}

export type RequestUrlFn = (params: RequestUrlParam) => Promise<RequestUrlResponse>;

const BATCH_SIZE = 20; // keep the pre-6.0 batch/yield pattern (mobile-friendly)

/**
 * F2 §3.4 — non-destructive, manifest-driven compendium sync.
 * Design principles: never touch a file we didn't put there; never hard-delete
 * user modifications; all removals go through FileManager.trashFile (recoverable).
 *
 * `applySync` is pure vault mechanics — no network. Release fetch + zip extraction
 * that produce the `incoming` map are Task 10's `sync`/`checkForUpdates`; the
 * `requestUrlFn` constructor param is forward-compat plumbing for that.
 */
export class CompendiumSyncService {
	constructor(
		private app: App,
		private store: ManifestStore,
		private requestUrlFn: RequestUrlFn = requestUrl,
	) {}

	/**
	 * Diff `incoming` (root-relative path → content) against the old manifest and
	 * apply it to the vault. Saves the new manifest on completion.
	 */
	public async applySync(
		incoming: Map<string, Uint8Array>,
		oldManifest: CompendiumManifest | null,
		options: SyncOptions,
		releaseTag: string,
		onProgress?: (done: number, total: number) => void,
	): Promise<{ report: SyncReport; manifest: CompendiumManifest }> {
		const report: SyncReport = {
			releaseTag, created: [], updated: [], unchanged: [],
			skippedConflicts: [], trashed: [], keptModified: [], rejectedPaths: [],
		};
		const newFiles: Record<string, string> = {};
		// Defense-in-depth write-boundary guard (review F2): reject any incoming path
		// that could escape `options.root` before it ever reaches a vault write. The
		// zip-extraction layer (Task 10) is expected to filter these too, but neither
		// Obsidian's normalizePath nor this file's join resolves ".." segments.
		const entries = [...incoming.entries()].filter(([relativePath]) => {
			if (isUnsafeRelativePath(relativePath)) {
				report.rejectedPaths.push(relativePath);
				return false;
			}
			return true;
		});

		// Phase 1 — create / update / skip, batched with UI yields.
		for (let i = 0; i < entries.length; i += BATCH_SIZE) {
			const batch = entries.slice(i, i + BATCH_SIZE);
			await Promise.all(batch.map(async ([relativePath, content]) => {
				const vaultPath = normalizePath(`${options.root}/${relativePath}`);
				const incomingHash = await sha256Hex(content);
				const existing = this.app.vault.getAbstractFileByPath(vaultPath);

				if (existing === null) {
					await this.ensureParentFolders(vaultPath);
					await this.app.vault.createBinary(vaultPath, toArrayBuffer(content));
					report.created.push(relativePath);
					newFiles[relativePath] = incomingHash;
					return;
				}
				if (!(existing instanceof TFile)) {
					// A folder squats on a compendium file path — never touch it.
					report.skippedConflicts.push(relativePath);
					return;
				}
				const currentHash = await sha256Hex(await this.app.vault.readBinary(existing));
				if (currentHash === incomingHash) {
					// Already identical (covers re-adopting an intact install) — no write churn.
					report.unchanged.push(relativePath);
					newFiles[relativePath] = incomingHash;
				} else if (oldManifest?.files[relativePath] !== undefined) {
					// We installed it → safe to update in place (no delete/recreate churn).
					// Spec-sanctioned (F2 §3.4 step 3): upstream overwrites even if the user
					// edited this managed file since install — deliberate, not a bug (review F1).
					await this.app.vault.modifyBinary(existing, toArrayBuffer(content));
					report.updated.push(relativePath);
					newFiles[relativePath] = incomingHash;
				} else {
					// User content squatting on a compendium path — skip and report.
					report.skippedConflicts.push(relativePath);
				}
			}));
			onProgress?.(Math.min(i + BATCH_SIZE, entries.length), entries.length);
			// This service is unit-tested under the plain Node jest project (no DOM
			// `window` global); the yield here isn't popout-window-sensitive UI work.
			// eslint-disable-next-line obsidianmd/prefer-window-timers
			await new Promise((resolve) => setTimeout(resolve, 0)); // yield to the UI thread
		}

		// Phase 2 — old-manifest files absent upstream. Resolved against the OLD
		// manifest's root (the root setting may have changed between syncs).
		// Files never in any manifest are NEVER considered here: homebrew is safe
		// by construction — it never enters `oldManifest.files` in the first place.
		const oldRoot = oldManifest?.root ?? options.root;
		for (const relativePath of Object.keys(oldManifest?.files ?? {})) {
			if (incoming.has(relativePath)) continue;
			const vaultPath = normalizePath(`${oldRoot}/${relativePath}`);
			const existing = this.app.vault.getAbstractFileByPath(vaultPath);
			if (!(existing instanceof TFile)) continue; // already gone — nothing to do
			const currentHash = await sha256Hex(await this.app.vault.readBinary(existing));
			if (currentHash === oldManifest!.files[relativePath]) {
				await this.app.fileManager.trashFile(existing); // recoverable — never vault.delete
				report.trashed.push(relativePath);
			} else {
				report.keptModified.push(relativePath); // user modified it — leave in place
			}
		}

		const manifest: CompendiumManifest = {
			schemaVersion: MANIFEST_SCHEMA_VERSION,
			source: COMPENDIUM_SOURCE,
			releaseTag,
			locale: options.locale,
			format: COMPENDIUM_FORMAT,
			root: options.root,
			syncedAt: new Date().toISOString(),
			files: newFiles,
		};
		await this.store.save(manifest);
		return { report, manifest };
	}

	/**
	 * F2 Task 10 — the full user-facing sync: resolve the release → download the
	 * locale/format asset → unzip it → applySync. A single updating Notice tracks
	 * progress; on failure the Notice is replaced with an error Notice and the error
	 * rethrown (callers, e.g. main.ts's syncCompendium, don't need their own try/catch
	 * for the common path).
	 */
	public async sync(options: SyncOptions): Promise<SyncReport> {
		const notice = new Notice("Draw Steel Elements: resolving compendium release…", 0);
		try {
			const { tag, assetUrl } = await this.resolveRelease(options);
			notice.setMessage(`Draw Steel Elements: downloading ${tag}…`);
			const zipBuffer = await this.downloadAsset(assetUrl);
			notice.setMessage("Draw Steel Elements: reading archive…");
			const incoming = await this.readZip(zipBuffer);
			const oldManifest = await this.store.load();
			const { report } = await this.applySync(
				incoming, oldManifest, options, tag,
				(done, total) => notice.setMessage(
					`Draw Steel Elements: syncing compendium… ${done}/${total}`));
			notice.hide();
			this.showSummary(report);
			return report;
		} catch (error) {
			notice.hide();
			const message = error instanceof Error ? error.message : String(error);
			console.error("Draw Steel Elements: compendium sync failed:", error);
			new Notice(`Draw Steel Elements: compendium sync failed — ${message}`, 8000);
			throw error;
		}
	}

	/**
	 * Metadata-only update check (one GitHub API request; unauthenticated rate limit
	 * is 60/hr) — never downloads or extracts the asset.
	 */
	public async checkForUpdates(): Promise<{
		installedTag: string | null; latestTag: string; upToDate: boolean;
	}> {
		const { tag } = await this.resolveRelease({ root: "", locale: "en" });
		const manifest = await this.store.load();
		return {
			installedTag: manifest?.releaseTag ?? null,
			latestTag: tag,
			upToDate: manifest?.releaseTag === tag,
		};
	}

	/** Resolves the release (latest, or `options.releaseTag` pinned) and locates the
	 *  `{format}-unified-{locale}.zip` asset within it — one GitHub API request. */
	private async resolveRelease(options: SyncOptions): Promise<{ tag: string; assetUrl: string }> {
		const base = `https://api.github.com/repos/${COMPENDIUM_SOURCE}/releases`;
		const url = options.releaseTag
			? `${base}/tags/${encodeURIComponent(options.releaseTag)}`
			: `${base}/latest`;
		const response = await this.requestUrlFn({
			url, method: "GET",
			headers: { Accept: "application/vnd.github.v3+json" },
			throw: false,
		});
		if (response.status !== 200) {
			throw new Error(`GitHub release lookup failed (HTTP ${response.status}) for ${url}`);
		}
		const release = response.json;
		const assetName = `${COMPENDIUM_FORMAT}-unified-${options.locale}.zip`;
		const asset = (release.assets ?? []).find((a: any) => a.name === assetName);
		if (!asset) {
			throw new Error(
				`Release ${release.tag_name} has no asset named ${assetName}. ` +
				`The data-unified release pipeline may not have published this locale/format yet.`);
		}
		return { tag: release.tag_name, assetUrl: asset.url };
	}

	private async downloadAsset(assetUrl: string): Promise<ArrayBuffer> {
		const response = await this.requestUrlFn({
			url: assetUrl, method: "GET",
			headers: { Accept: "application/octet-stream" },
			throw: false,
		});
		if (response.status !== 200) {
			throw new Error(`Asset download failed (HTTP ${response.status})`);
		}
		if (!response.arrayBuffer || response.arrayBuffer.byteLength === 0) {
			throw new Error("Downloaded compendium asset is empty.");
		}
		return response.arrayBuffer;
	}

	/** Zip root IS the incoming-set root (class/…, monster/… at top level — F2 §3.2),
	 *  matching data-unified's real release layout (content at zip root). */
	private async readZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
		const zip = await JSZip.loadAsync(buffer);
		const incoming = new Map<string, Uint8Array>();
		for (const [entryPath, entry] of Object.entries(zip.files)) {
			if (entry.dir) continue;
			incoming.set(entryPath, await entry.async("uint8array"));
		}
		if (incoming.size === 0) throw new Error("Downloaded archive contains no files.");
		return incoming;
	}

	private showSummary(report: SyncReport): void {
		new Notice(
			`Draw Steel Elements: compendium ${report.releaseTag} synced — ` +
			`${report.created.length} new, ${report.updated.length} updated, ` +
			`${report.trashed.length} removed.`);
		// F2 final-review MUST-FIX #2: rejectedPaths (the path-traversal defense above)
		// was populated but never surfaced — a malformed/malicious archive silently
		// dropped files with no user- or console-visible trace. Folded into the same
		// skipped-count + console.warn payload as the other two skip reasons.
		const skipped = report.skippedConflicts.length + report.keptModified.length + report.rejectedPaths.length;
		if (skipped > 0) {
			new Notice(
				`Draw Steel Elements: ${skipped} file(s) skipped to protect your changes — ` +
				`see the developer console for the list.`, 10000);
			console.warn(
				"Draw Steel Elements: sync skipped these paths (user content is never overwritten):",
				{
					squattingOnCompendiumPaths: report.skippedConflicts,
					userModifiedRemovedUpstream: report.keptModified,
					rejectedUnsafePaths: report.rejectedPaths,
				});
		}
	}

	private async ensureParentFolders(vaultPath: string): Promise<void> {
		const parts = vaultPath.split("/").slice(0, -1);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (this.app.vault.getAbstractFileByPath(current) === null) {
				try {
					await this.app.vault.createFolder(current);
				} catch (error: unknown) {
					// Concurrent batch entries may race on the same folder.
					const message = error instanceof Error ? error.message : String(error);
					if (!message.includes("already exists")) throw error;
				}
			}
		}
	}
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Rejects any incoming path that could escape `options.root` when joined and written.
 * Absolute paths (leading slash/backslash, or a Windows drive prefix) are checked on the
 * raw path, since normalizePath strips a leading slash rather than flagging it. ".."
 * segments are checked after normalizePath (which only unifies separators — it does not
 * resolve dot segments, so a literal ".." survives straight through to the vault write).
 */
function isUnsafeRelativePath(relativePath: string): boolean {
	if (/^[\\/]/.test(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath)) return true;
	return normalizePath(relativePath).split("/").includes("..");
}
