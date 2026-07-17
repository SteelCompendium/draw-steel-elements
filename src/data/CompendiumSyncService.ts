import {
	App, TFile, normalizePath, requestUrl, RequestUrlParam, RequestUrlResponse,
} from "obsidian";
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
