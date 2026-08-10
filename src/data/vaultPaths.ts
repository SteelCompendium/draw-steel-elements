import { App } from "obsidian";

/**
 * Lowercased folder path → the spelling that actually exists in the vault.
 *
 * Needed because macOS and Windows vaults are case-INSENSITIVE: `career/` and
 * `Career/` are one folder there and two here. Creating the second spelling fails (or
 * worse, silently resolves to the first), so `ensureParentFolders` has to reuse the
 * existing spelling rather than trust `getAbstractFileByPath` on the one it wanted.
 */
export type FolderCaseIndex = Map<string, string>;

/** Every folder implied by the vault's files, indexed by lowercased path. */
export function buildFolderCaseIndex(app: App): FolderCaseIndex {
	const vault = app.vault as unknown as { getFiles?: () => Array<{ path: string }> };
	const index: FolderCaseIndex = new Map();
	for (const file of vault.getFiles?.() ?? []) {
		const parts = file.path.split("/").slice(0, -1);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!index.has(current.toLowerCase())) index.set(current.toLowerCase(), current);
		}
	}
	return index;
}

/**
 * Create every missing ancestor folder of `vaultPath` (a FILE path — the last segment
 * is not created), and return the path with each ancestor rewritten to the spelling
 * that exists in the vault. Shared by the compendium sync engine and the pre-7.0.0
 * migration engine.
 *
 * The "already exists" swallow is load-bearing, not defensive noise: two entries of
 * the same batch routinely race on the same parent folder, and Obsidian's
 * `createFolder` rejects rather than no-ops when it loses that race.
 *
 * Pass `caseIndex` (from `buildFolderCaseIndex`) to get the case-insensitive-filesystem
 * behaviour; without it the function behaves exactly as it always did.
 */
export async function ensureParentFolders(
	app: App,
	vaultPath: string,
	caseIndex?: FolderCaseIndex,
): Promise<string> {
	const parts = vaultPath.split("/");
	const fileName = parts.pop() ?? "";
	let current = "";
	for (const part of parts) {
		const wanted = current ? `${current}/${part}` : part;
		const existing = caseIndex?.get(wanted.toLowerCase());
		if (existing !== undefined) {
			current = existing;
			continue;
		}
		current = wanted;
		if (app.vault.getAbstractFileByPath(current) === null) {
			try {
				await app.vault.createFolder(current);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				if (!message.includes("already exists")) throw error;
			}
		}
		caseIndex?.set(current.toLowerCase(), current);
	}
	return current ? `${current}/${fileName}` : fileName;
}
