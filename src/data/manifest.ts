import { App, normalizePath } from "obsidian";

export const MANIFEST_SCHEMA_VERSION = 1 as const;

/**
 * F2 §3.4 — the sync engine's record of every file it installed.
 * Lives in the plugin's config-dir folder, NOT inside the compendium folder
 * (Obsidian hides dotfiles there and third-party sync can mangle them).
 * A missing/corrupt manifest fails SAFE: all files count as unmanaged, and
 * unmanaged files are never modified or deleted by the sync engine.
 */
export interface CompendiumManifest {
	schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
	/** GitHub repo, e.g. "SteelCompendium/data-unified". */
	source: string;
	/** Release tag the files came from, e.g. "v4.20260701T120000". */
	releaseTag: string;
	locale: string;
	format: string;
	/** Vault folder the tree was synced into, e.g. "DS Compendium". */
	root: string;
	/** ISO-8601 timestamp of the last successful sync. */
	syncedAt: string;
	/** Root-relative file path → sha256 hex of the installed content. */
	files: Record<string, string>;
}

/** WebCrypto SHA-256 → lowercase hex. Mobile-safe (no Node builtins). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
	const buffer: ArrayBuffer = data instanceof Uint8Array
		? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
		: data;
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	const bytes = new Uint8Array(digest);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		const byteHex = bytes[i].toString(16);
		hex += byteHex.length === 1 ? "0" + byteHex : byteHex;
	}
	return hex;
}

export class ManifestStore {
	constructor(private app: App, private pluginId: string) {}

	private manifestPath(): string {
		return normalizePath(
			`${this.app.vault.configDir}/plugins/${this.pluginId}/compendium-manifest.json`);
	}

	public async load(): Promise<CompendiumManifest | null> {
		const path = this.manifestPath();
		try {
			if (!(await this.app.vault.adapter.exists(path))) return null;
			const parsed = JSON.parse(await this.app.vault.adapter.read(path));
			if (parsed?.schemaVersion !== MANIFEST_SCHEMA_VERSION
				|| typeof parsed.files !== "object" || parsed.files === null) {
				console.warn("Draw Steel Elements: unrecognized compendium manifest — treating as absent (fail-safe: nothing will be deleted).");
				return null;
			}
			return parsed as CompendiumManifest;
		} catch (error) {
			console.warn("Draw Steel Elements: unreadable compendium manifest — treating as absent (fail-safe: nothing will be deleted).", error);
			return null;
		}
	}

	/** Atomic-ish write: temp file, then rename into place. Worst case on a crash
	 *  is a stale/absent manifest — which fails safe (files become unmanaged). */
	public async save(manifest: CompendiumManifest): Promise<void> {
		const path = this.manifestPath();
		const tempPath = `${path}.tmp`;
		await this.app.vault.adapter.write(tempPath, JSON.stringify(manifest, null, 2));
		if (await this.app.vault.adapter.exists(path)) {
			await this.app.vault.adapter.remove(path);
		}
		await this.app.vault.adapter.rename(tempPath, path);
	}
}
