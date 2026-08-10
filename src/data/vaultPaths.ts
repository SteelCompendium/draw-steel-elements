import { App } from "obsidian";

/**
 * Create every missing ancestor folder of `vaultPath` (which is a FILE path — the
 * last segment is not created). Shared by the compendium sync engine and the
 * pre-7.0.0 migration engine, both of which write into folder trees that may not
 * exist yet and both of which run their writes concurrently in batches.
 *
 * The "already exists" swallow is load-bearing, not defensive noise: two entries of
 * the same batch routinely race on the same parent folder, and Obsidian's
 * `createFolder` rejects rather than no-ops when it loses that race.
 */
export async function ensureParentFolders(app: App, vaultPath: string): Promise<void> {
	const parts = vaultPath.split("/").slice(0, -1);
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (app.vault.getAbstractFileByPath(current) === null) {
			try {
				await app.vault.createFolder(current);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				if (!message.includes("already exists")) throw error;
			}
		}
	}
}
