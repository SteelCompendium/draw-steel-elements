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

/** Notified after the manifest on disk changes, with the new state (null = gone). */
export type ManifestListener = (manifest: CompendiumManifest | null) => void;

export class ManifestStore {
	/** SC-140: live subscribers to manifest writes — see `onChange`. */
	private listeners = new Set<ManifestListener>();

	constructor(private app: App, private pluginId: string) {}

	private manifestPath(): string {
		return normalizePath(
			`${this.app.vault.configDir}/plugins/${this.pluginId}/compendium-manifest.json`);
	}

	public async load(): Promise<CompendiumManifest | null> {
		const path = this.manifestPath();
		try {
			if (!(await this.app.vault.adapter.exists(path))) return null;
			const parsed: unknown = JSON.parse(await this.app.vault.adapter.read(path));
			const candidate = parsed as { schemaVersion?: unknown; files?: unknown } | null | undefined;
			if (candidate?.schemaVersion !== MANIFEST_SCHEMA_VERSION
				|| typeof candidate.files !== "object" || candidate.files === null) {
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
		// Only after the write actually landed: a listener that repaints UI must never
		// show a manifest the disk doesn't have.
		this.notify(manifest);
	}

	/**
	 * SC-140 — subscribe to manifest changes; returns the unsubscribe.
	 *
	 * The manifest is the state the settings tab's sync-status line displays, and that
	 * line is rendered ONCE per mount (obsidian caches the declarative definitions and
	 * replays them, so nothing re-reads the store on its own). Without this seam a sync
	 * that finished while the settings window was open left the line reading whatever it
	 * said at mount time — "No compendium synced yet." on a first sync — until the window
	 * was closed and reopened.
	 *
	 * Every writer goes through `save()` (CompendiumSyncService.applySync and the SC-125
	 * migration's adoption), so subscribing here covers both without either of them
	 * knowing a view exists.
	 */
	public onChange(listener: ManifestListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** Fan out to subscribers. A throwing listener is contained: it must not fail the
	 *  sync that triggered it, nor rob its fellow listeners of the notification. */
	private notify(manifest: CompendiumManifest | null): void {
		for (const listener of [...this.listeners]) {
			try {
				listener(manifest);
			} catch (error) {
				console.error("Draw Steel Elements: a compendium manifest listener threw", error);
			}
		}
	}
}
