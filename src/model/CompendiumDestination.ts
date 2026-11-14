// SC-643 — the ONE place the "Destination folder" setting (`compendiumDestinationDirectory`)
// is turned into a vault folder. Sync, the migration offer, the Migrate command and every
// link/reference resolver go through here, so they all agree on where the compendium lives.
//
// Why it exists: an empty field used to be handed straight to the sync engine as the root,
// which made the VAULT ROOT "the compendium folder" — and the first-sync "existing compendium
// folder found" window then offered to move that folder (the whole vault) to the trash.
//
// Rules (owner decisions D1-D3):
//   - empty / whitespace-only  -> the default folder (`DEFAULT_SETTINGS.compendiumDestinationDirectory`,
//     the value the field's placeholder shows); the stored setting is never rewritten;
//   - anything that resolves to the vault root (`/`, `.`, `./`, `//`, ` / `, `a/..`) -> refused;
//   - anything that climbs out of the vault (`..`, `a/../..`) -> refused.
//
// Deliberately NOT built on Obsidian's `normalizePath`: it does not trim, does not treat `.`
// as the root (`normalizePath('.')` is `.`, `normalizePath('./')` is `.` in real Obsidian but
// `/` in the jest mock) and does not resolve `..`. Pure and import-free so it unit-tests
// without any Obsidian mock.
import { DEFAULT_SETTINGS } from './Settings';

export type CompendiumDestination =
	| { kind: 'folder'; path: string }
	/** Resolves to the vault root, or climbs out of the vault: never a compendium folder. */
	| { kind: 'refused'; reason: 'root' | 'outside-vault' };

/** Classify a path that is ALREADY a resolved destination (no empty -> default step): an
 *  empty string here IS the vault root. This is the form the sync/migration services use. */
export function classifyDestinationPath(raw: string | null | undefined): CompendiumDestination {
	const segments: string[] = [];
	for (const segment of (raw ?? '').trim().split(/[\\/]+/)) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') {
			if (segments.length === 0) return { kind: 'refused', reason: 'outside-vault' };
			segments.pop();
			continue;
		}
		segments.push(segment);
	}
	return segments.length === 0
		? { kind: 'refused', reason: 'root' }
		: { kind: 'folder', path: segments.join('/') };
}

/** The setting's raw value -> the folder to use (D1: blank means the default folder) or a
 *  refusal (D2). */
export function resolveCompendiumDestination(raw: string | null | undefined): CompendiumDestination {
	const value = (raw ?? '').trim();
	return classifyDestinationPath(value === '' ? DEFAULT_SETTINGS.compendiumDestinationDirectory : value);
}

/** The resolved folder path, or null when the setting is refused. For readers that only
 *  need "where do compendium-relative links point". */
export function compendiumFolderPath(raw: string | null | undefined): string | null {
	const destination = resolveCompendiumDestination(raw);
	return destination.kind === 'folder' ? destination.path : null;
}

/** True for a path that must never be a compendium root / trashed / migrated: the vault
 *  root itself (`''`, `/`, `.`, `./`, `//`, ...) or anything outside the vault. */
export function isVaultRootPath(path: string | null | undefined): boolean {
	return classifyDestinationPath(path).kind === 'refused';
}

/** A vault folder that is the vault root: by path, or by Obsidian's own `TFolder.isRoot()`
 *  (optional here so fakes without it are still judged by path). */
export function isVaultRootFolder(folder: { path: string; isRoot?: () => boolean }): boolean {
	return isVaultRootPath(folder.path) || (typeof folder.isRoot === 'function' && folder.isRoot());
}

/** The Notice shown when the Destination folder was changed while the "Existing compendium
 *  folder found" window was open: the window's answer is dropped, nothing is moved or synced. */
export const DESTINATION_CHANGED_NOTICE =
	'Draw Steel Elements: the Destination folder changed while that window was open, so nothing was ' +
	'moved or synced. Run Sync again.';

/** The Notice shown when Sync / Migrate is refused because of the Destination folder. */
export const DESTINATION_REFUSED_NOTICE =
	"Draw Steel Elements: the Destination folder can't be the vault root (or outside the vault). " +
	'Choose a folder inside the vault in Settings → Draw Steel Elements → Compendium.';
