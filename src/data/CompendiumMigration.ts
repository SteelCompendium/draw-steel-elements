import { App, TFile, normalizePath } from "obsidian";
import rawMigrationMap from "./migrationMap.json";
import { ensureParentFolders } from "./vaultPaths";
import {
	CompendiumManifest, ManifestStore, MANIFEST_SCHEMA_VERSION, sha256Hex,
} from "./manifest";
import { COMPENDIUM_FORMAT, COMPENDIUM_SOURCE } from "./CompendiumSyncService";

/**
 * SC-125 — the pre-7.0.0 → 7.0.0 compendium migration.
 *
 * 7.0.0 moved the compendium from the retired `SteelCompendium/data-md-dse`
 * (`Rules/Careers/Disciple.md`) to `data-unified`'s md-dse tree
 * (`career/disciple.md`). Every path changed, so every `[[wikilink]]` a user wrote
 * into the compendium would break the moment the new tree lands.
 *
 * The fix is to MOVE the old files to their new paths before the sync writes
 * anything: `FileManager.renameFile` is Obsidian's own move, and Obsidian rewrites
 * every link that pointed at the moved file — in the user's own notes, by itself.
 * The plugin therefore never opens, parses or edits a user-authored note. The
 * normal sync then updates the moved files' CONTENT in place.
 *
 * Safety rules, all enforced below and all tested:
 *   - Nothing is ever deleted. Not the old files, not the old (now empty) folders,
 *     not anything unmapped. The only vault mutation is `renameFile`.
 *   - A rename onto an existing path never happens; that pair is reported instead.
 *   - Files with no mapping are left exactly where they are and listed.
 *   - Re-running is a no-op: an already-moved file is no longer at its old path,
 *     so it is not in the plan at all.
 */

export const MIGRATION_MAP_SCHEMA_VERSION = 1 as const;

/** A map entry is `[newRelativePath]`, or `[newRelativePath, sha256Prefix]` when the
 *  old path was still present in the FINAL legacy release (see `modified` below). */
export type MigrationMapEntry = [string] | [string, string];

export interface MigrationMap {
	schemaVersion: number;
	oldSource: string;
	/** The last data-md-dse release; the one the shipped content hashes come from. */
	oldFinalRelease: string;
	oldReleasesCovered: number;
	newSource: string;
	newFormat: string;
	newLocale: string;
	newSnapshot: string;
	counts: Record<string, number>;
	paths: Record<string, MigrationMapEntry>;
}

/**
 * `import ... from "./migrationMap.json"` gives TypeScript the file's full literal
 * type — 3.3k keys of it. Widening to `unknown` at the boundary keeps that literal
 * type from leaking into every inference site downstream.
 */
export const MIGRATION_MAP = rawMigrationMap as unknown as MigrationMap;

/**
 * How many files at exact legacy compendium paths it takes to call a folder "a
 * pre-7.0.0 compendium". The smallest data-md-dse release ever published had >2,400
 * of them, so a real legacy install clears this by two orders of magnitude, while a
 * homebrew folder would have to independently place twenty files at paths like
 * `Rules/Careers/Disciple.md` to trip it. Deliberately not 1: a single coincidence
 * must not be able to prompt anybody.
 */
export const LEGACY_DETECTION_THRESHOLD = 20;

export interface LegacyDetection {
	root: string;
	/** Every file (not just markdown) currently under the compendium root. */
	filesInRoot: number;
	/** Of those, how many sit at a path this map knows as a pre-7.0.0 path. */
	legacyPaths: number;
	/** Of those, how many already sit at a 7.0.0 path (a finished/partial migration). */
	newLayoutPaths: number;
	isLegacyLayout: boolean;
}

export interface PlannedRename {
	fromPath: string;
	toPath: string;
	oldRelative: string;
	newRelative: string;
	/**
	 * `true` — the file's content differs from the final legacy release, so either
	 * you edited it or you were on an older compendium release. `false` — byte-
	 * identical to the final release. `null` — unknowable: the map has no hash for
	 * this path because it only ever existed in an older release.
	 *
	 * Purely informational. It changes what the summary SAYS, never what the engine
	 * DOES: every mapped file is moved, edited or not.
	 */
	modified: boolean | null;
}

export interface BlockedRename {
	fromPath: string;
	toPath: string;
}

export interface MigrationPlan {
	root: string;
	detection: LegacyDetection;
	renames: PlannedRename[];
	/** Mapped, but something already occupies the destination — left in place. */
	blocked: BlockedRename[];
	/** Under the root with no mapping at all — left in place. */
	unmapped: string[];
}

export interface MigrationReport {
	root: string;
	/** The legacy release the map's content hashes describe. */
	mapRelease: string;
	migrated: PlannedRename[];
	/** Migrated, but the content did not match the final legacy release. */
	migratedModified: PlannedRename[];
	blocked: BlockedRename[];
	failed: Array<{ fromPath: string; toPath: string; error: string }>;
	unmapped: string[];
	/** True when `shouldAbort()` stopped the run before the plan was exhausted. */
	aborted: boolean;
	/** Planned renames not attempted because the run was aborted. */
	remaining: number;
}

export interface ExecuteOptions {
	onProgress?: (done: number, total: number) => void;
	/** Polled between files; returning true stops after the file in flight. */
	shouldAbort?: () => boolean;
}

/** Total renames a fully-executed plan performs — the headline dry-run number. */
export const planSize = (plan: MigrationPlan): number => plan.renames.length;

const UNSAFE_PATH = /(^[\\/])|(^[a-zA-Z]:[\\/])|(^|\/)\.\.(\/|$)/;

/**
 * Structural validation of a migration map. Returns a list of problems, empty when
 * the map is sound. Run over the SHIPPED map by the test suite, so a regenerated map
 * that broke an invariant fails the build rather than the user's vault.
 *
 * The invariants are the ones the engine's safety story rests on:
 *   - no path can escape the compendium root (absolute, drive-prefixed, or `..`);
 *   - no entry renames a file onto itself;
 *   - the hashed subset (the files a final-release vault actually holds) is
 *     INJECTIVE — two of them mapping to one destination would make the outcome
 *     depend on iteration order;
 *   - a hash, when present, is a lowercase hex prefix.
 */
export function validateMigrationMap(map: MigrationMap): string[] {
	const problems: string[] = [];
	if (map.schemaVersion !== MIGRATION_MAP_SCHEMA_VERSION) {
		problems.push(`schemaVersion is ${String(map.schemaVersion)}, expected ${MIGRATION_MAP_SCHEMA_VERSION}`);
	}
	const hashedTargets = new Map<string, string>();
	for (const [oldPath, entry] of Object.entries(map.paths)) {
		if (!Array.isArray(entry) || entry.length < 1 || entry.length > 2) {
			problems.push(`${oldPath}: entry must be [newPath] or [newPath, hash]`);
			continue;
		}
		const [newPath, hash] = entry;
		if (typeof newPath !== "string" || newPath === "") problems.push(`${oldPath}: empty destination`);
		if (UNSAFE_PATH.test(oldPath)) problems.push(`${oldPath}: unsafe source path`);
		if (UNSAFE_PATH.test(newPath)) problems.push(`${oldPath}: unsafe destination "${newPath}"`);
		if (oldPath === newPath) problems.push(`${oldPath}: maps to itself`);
		if (!oldPath.endsWith(".md")) problems.push(`${oldPath}: source is not markdown`);
		if (!newPath.endsWith(".md")) problems.push(`${oldPath}: destination "${newPath}" is not markdown`);
		if (hash !== undefined) {
			if (!/^[0-9a-f]{8,64}$/.test(hash)) problems.push(`${oldPath}: bad hash "${hash}"`);
			const clash = hashedTargets.get(newPath);
			if (clash !== undefined) {
				problems.push(`${newPath}: two final-release paths map here ("${clash}" and "${oldPath}")`);
			} else {
				hashedTargets.set(newPath, oldPath);
			}
		}
	}
	return problems;
}

export class CompendiumMigrationService {
	constructor(
		private app: App,
		private store: ManifestStore,
		private map: MigrationMap = MIGRATION_MAP,
	) {}

	/** Cheap, synchronous, no file reads — safe to call on every sync. */
	public detect(root: string): LegacyDetection {
		const prefix = `${normalizePath(root)}/`;
		const targets = new Set(Object.values(this.map.paths).map((entry) => entry[0]));
		let filesInRoot = 0;
		let legacyPaths = 0;
		let newLayoutPaths = 0;
		for (const file of this.filesUnder(prefix)) {
			filesInRoot++;
			const relative = file.path.slice(prefix.length);
			if (this.map.paths[relative] !== undefined) legacyPaths++;
			else if (targets.has(relative)) newLayoutPaths++;
		}
		return {
			root,
			filesInRoot,
			legacyPaths,
			newLayoutPaths,
			isLegacyLayout: legacyPaths >= LEGACY_DETECTION_THRESHOLD,
		};
	}

	/**
	 * The dry run. Reads every mapped file once to classify it as pristine or
	 * modified; performs no writes and mutates nothing.
	 */
	public async plan(root: string): Promise<MigrationPlan> {
		const normalizedRoot = normalizePath(root);
		const prefix = `${normalizedRoot}/`;
		const detection = this.detect(root);
		const renames: PlannedRename[] = [];
		const blocked: BlockedRename[] = [];
		const unmapped: string[] = [];

		// Deterministic order: the plan a user previews is the plan that runs.
		const files = this.filesUnder(prefix).sort((a, b) => (a.path < b.path ? -1 : 1));
		for (const file of files) {
			const oldRelative = file.path.slice(prefix.length);
			const entry = this.map.paths[oldRelative];
			if (entry === undefined) {
				unmapped.push(file.path);
				continue;
			}
			const [newRelative, expectedHash] = entry;
			const toPath = normalizePath(`${normalizedRoot}/${newRelative}`);
			if (toPath === file.path) continue; // already where it belongs
			if (this.app.vault.getAbstractFileByPath(toPath) !== null) {
				blocked.push({ fromPath: file.path, toPath });
				continue;
			}
			renames.push({
				fromPath: file.path,
				toPath,
				oldRelative,
				newRelative,
				modified: expectedHash === undefined
					? null
					: (await sha256Hex(await this.app.vault.readBinary(file))).slice(0, expectedHash.length)
						!== expectedHash,
			});
		}
		return { root, detection, renames, blocked, unmapped };
	}

	/**
	 * Execute a plan. Every mapped file is moved with `FileManager.renameFile` so
	 * Obsidian rewrites the user's links; the destination is re-checked immediately
	 * before each move (the vault can change under a long run), and a failure on one
	 * file never stops the others.
	 */
	public async execute(plan: MigrationPlan, options: ExecuteOptions = {}): Promise<MigrationReport> {
		const report: MigrationReport = {
			root: plan.root,
			mapRelease: this.map.oldFinalRelease,
			migrated: [],
			migratedModified: [],
			blocked: [...plan.blocked],
			failed: [],
			unmapped: [...plan.unmapped],
			aborted: false,
			remaining: 0,
		};

		for (let index = 0; index < plan.renames.length; index++) {
			if (options.shouldAbort?.() === true) {
				report.aborted = true;
				report.remaining = plan.renames.length - index;
				break;
			}
			const rename = plan.renames[index];
			const file = this.app.vault.getAbstractFileByPath(rename.fromPath);
			if (!(file instanceof TFile)) continue; // vanished or already moved — nothing to do
			if (this.app.vault.getAbstractFileByPath(rename.toPath) !== null) {
				report.blocked.push({ fromPath: rename.fromPath, toPath: rename.toPath });
				continue;
			}
			try {
				await ensureParentFolders(this.app, rename.toPath);
				await this.app.fileManager.renameFile(file, rename.toPath);
				report.migrated.push(rename);
				if (rename.modified === true) report.migratedModified.push(rename);
			} catch (error: unknown) {
				report.failed.push({
					fromPath: rename.fromPath,
					toPath: rename.toPath,
					error: error instanceof Error ? error.message : String(error),
				});
			}
			options.onProgress?.(index + 1, plan.renames.length);
		}

		await this.adoptIntoManifest(report, plan.root);
		return report;
	}

	/**
	 * Hand the moved files to the sync engine as MANAGED files.
	 *
	 * Without this the very next sync would see 2,000 files it has no manifest entry
	 * for, classify each as "user content squatting on a compendium path", and skip
	 * them all — the migration would move the files and then leave them frozen at
	 * legacy content forever. Recording the moved paths with their CURRENT hashes
	 * makes the sync update them in place, which is the whole point.
	 *
	 * Merges into any existing manifest rather than replacing it, so running the
	 * manual command on a vault that already has a 7.0.0 manifest is safe.
	 */
	private async adoptIntoManifest(report: MigrationReport, root: string): Promise<void> {
		if (report.migrated.length === 0) return;
		const existing = await this.store.load();
		const files: Record<string, string> = { ...(existing?.files ?? {}) };
		for (const rename of report.migrated) {
			const file = this.app.vault.getAbstractFileByPath(rename.toPath);
			if (!(file instanceof TFile)) continue;
			files[rename.newRelative] = await sha256Hex(await this.app.vault.readBinary(file));
		}
		const manifest: CompendiumManifest = {
			schemaVersion: MANIFEST_SCHEMA_VERSION,
			source: existing?.source ?? COMPENDIUM_SOURCE,
			// Never a real data-unified tag: the migrated content is legacy content at
			// new paths, so `checkForUpdates` must keep reporting an update available
			// until a real sync has run.
			releaseTag: existing?.releaseTag ?? `migrated:${this.map.oldFinalRelease}`,
			locale: existing?.locale ?? this.map.newLocale,
			format: existing?.format ?? COMPENDIUM_FORMAT,
			root: existing?.root ?? root,
			syncedAt: new Date().toISOString(),
			files,
		};
		await this.store.save(manifest);
	}

	private filesUnder(prefix: string): TFile[] {
		const vault = this.app.vault as unknown as { getFiles?: () => TFile[]; getMarkdownFiles: () => TFile[] };
		const all = typeof vault.getFiles === "function" ? vault.getFiles() : vault.getMarkdownFiles();
		return all.filter((file) => file.path.startsWith(prefix));
	}
}

/** Human-readable dry-run text — the same words the modal shows and the console logs. */
export function describePlan(plan: MigrationPlan, sampleSize = 5): string {
	const modified = plan.renames.filter((r) => r.modified === true).length;
	const lines = [
		`${plan.renames.length} file(s) will be moved to their 7.0.0 paths in "${plan.root}".`,
		`Obsidian rewrites links to every moved file; nothing is deleted.`,
	];
	if (modified > 0) {
		lines.push(`${modified} of them differ from the last legacy release (edited, or from an older release) — they are moved too, and listed afterwards.`);
	}
	if (plan.blocked.length > 0) {
		lines.push(`${plan.blocked.length} cannot be moved because something already sits at the new path — left in place.`);
	}
	if (plan.unmapped.length > 0) {
		lines.push(`${plan.unmapped.length} file(s) have no 7.0.0 counterpart — left in place, untouched.`);
	}
	for (const rename of plan.renames.slice(0, sampleSize)) {
		lines.push(`    ${rename.oldRelative}  →  ${rename.newRelative}`);
	}
	if (plan.renames.length > sampleSize) {
		lines.push(`    …and ${plan.renames.length - sampleSize} more.`);
	}
	return lines.join("\n");
}
