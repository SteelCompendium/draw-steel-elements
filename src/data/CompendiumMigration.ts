import { App, TFile, normalizePath } from "obsidian";
import rawMigrationMap from "./migrationMap.json";
import { buildFolderCaseIndex, ensureParentFolders } from "./vaultPaths";
import type { FolderCaseIndex } from "./vaultPaths";
import {
	CompendiumManifest, ManifestStore, MANIFEST_SCHEMA_VERSION, sha256Hex,
} from "./manifest";
import { COMPENDIUM_FORMAT, COMPENDIUM_SOURCE } from "./CompendiumSyncService";
import { MigrationStateStore, emptyMigrationState } from "./migrationState";
import type { MigrationState } from "./migrationState";

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
 * THE ONE-SHOT PROPERTY, and why the flow guards it so hard: the migration is
 * impossible after a sync, and not because the old files vanish — they don't. It is
 * because the sync CREATES all ~3,000 destinations, so every planned rename then
 * finds its target occupied and is refused. Declining the offer, or stopping a run,
 * must therefore NOT fall through into a sync; see `MigrationStateStore`.
 *
 * Safety rules, all enforced below and all tested:
 *   - Nothing is ever deleted. Not the old files, not the old (now empty) folders,
 *     not anything unmapped. The only vault mutations are `renameFile` and creating
 *     the destination folders (plus, optionally, writing a report note).
 *   - A rename onto an existing path never happens; that pair is reported instead.
 *   - Files with no mapping are left exactly where they are and listed BY PATH.
 *   - Re-running is a no-op: an already-moved file is no longer at its old path.
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
	/** The PUBLISHED data-unified release every destination was verified against. */
	newRelease: string;
	counts: Record<string, number>;
	paths: Record<string, MigrationMapEntry>;
}

/**
 * LAZY, and deliberately so (review L3).
 *
 * `migrationMap.json` is ~390 KiB. Imported as data it would be parsed at plugin load
 * — a measured ~6.7 ms and ~0.7 MB retained on EVERY startup, forever, for a feature
 * that runs at most once in a vault's life. `esbuild.config.mjs` swaps this import for
 * the raw TEXT (see `migrationMapTextPlugin` there), and the parse happens on first
 * use, which for almost every user is never.
 *
 * Jest resolves the same import through ts-jest's `resolveJsonModule`, so it arrives
 * already parsed — hence the `typeof` check rather than an unconditional `JSON.parse`.
 * Both shapes are correct; only the bundle pays the deferral.
 */
const migrationMapSource: unknown = rawMigrationMap;
let parsedMigrationMap: MigrationMap | null = null;

export function migrationMap(): MigrationMap {
	if (parsedMigrationMap === null) {
		parsedMigrationMap = (typeof migrationMapSource === "string"
			? JSON.parse(migrationMapSource)
			: migrationMapSource) as MigrationMap;
	}
	return parsedMigrationMap;
}

/**
 * How many files at exact legacy compendium paths it takes to call a folder "a
 * pre-7.0.0 compendium". The smallest data-md-dse release ever published had >2,400
 * of them, so a real legacy install clears this by two orders of magnitude, while a
 * homebrew folder would have to independently place twenty files at paths like
 * `Rules/Careers/Disciple.md` to trip it. Deliberately not 1: a single coincidence
 * must not be able to prompt anybody.
 */
export const LEGACY_DETECTION_THRESHOLD = 20;

/** Renames between manifest/state checkpoints. A crash costs at most this many
 *  files' bookkeeping, and the next run converges the rest anyway (H1). */
export const CHECKPOINT_INTERVAL = 200;

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
	/** Vault path of the written report note, when one was written (review H3). */
	reportNotePath: string | null;
}

export interface ExecuteOptions {
	onProgress?: (done: number, total: number) => void;
	/** Polled between files; returning true stops after the file in flight. */
	shouldAbort?: () => boolean;
	/** Write the per-path report note into the vault (review H3). Default true. */
	writeReportNote?: boolean;
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
 *   - nothing is unsafe on a CASE-INSENSITIVE filesystem (review M3): no case-only
 *     rename, and no two destinations whose folder chains differ only by case — on
 *     macOS/Windows the first is a move onto itself and the second silently splits
 *     one folder into two spellings that only one of them can win;
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
	const folderCase = new Map<string, string>();
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
		if (oldPath !== newPath && oldPath.toLowerCase() === newPath.toLowerCase()) {
			problems.push(`${oldPath}: case-only rename to "${newPath}" (a no-op on macOS/Windows)`);
		}
		if (!oldPath.endsWith(".md")) problems.push(`${oldPath}: source is not markdown`);
		if (!newPath.endsWith(".md")) problems.push(`${oldPath}: destination "${newPath}" is not markdown`);
		const folder = newPath.split("/").slice(0, -1).join("/");
		if (folder !== "") {
			const owner = folderCase.get(folder.toLowerCase());
			if (owner === undefined) folderCase.set(folder.toLowerCase(), folder);
			else if (owner !== folder) {
				problems.push(`${oldPath}: destination folder "${folder}" clashes by case with "${owner}"`);
			}
		}
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
	private mapOverride: MigrationMap | undefined;

	constructor(
		private app: App,
		private manifestStore: ManifestStore,
		private stateStore: MigrationStateStore,
		map?: MigrationMap,
	) {
		this.mapOverride = map;
	}

	/**
	 * Resolved on FIRST USE, never in the constructor (review round 2, L3).
	 *
	 * `onload()` constructs this service unconditionally, so `map ?? migrationMap()`
	 * in the constructor only moved the ~390 KiB parse from module-evaluation to
	 * plugin-load — still every single launch, for a feature that runs at most once in
	 * a vault's lifetime. Behind a getter, a vault that has already migrated (or never
	 * needs to) never parses it at all: `reconcile()` returns before touching the map
	 * when there is no migration state, and `detect()` is only reached inside the
	 * trigger branch.
	 */
	private get map(): MigrationMap {
		if (this.mapOverride === undefined) this.mapOverride = migrationMap();
		return this.mapOverride;
	}

	// -- state ---------------------------------------------------------------

	public async state(): Promise<MigrationState | null> {
		return this.stateStore.load();
	}

	/** The offer is still owed: the user declined it, or a run stopped mid-way. */
	public async isPending(): Promise<boolean> {
		const state = await this.stateStore.load();
		return state !== null && (state.declined || state.incomplete);
	}

	/**
	 * Read-modify-write, and deliberately not guarded against a concurrent
	 * `execute()` finishing at the same moment (review round 2, item 7).
	 *
	 * The two cannot legitimately overlap — the dialog only declines from a screen
	 * where no run has started, and a dismissal *during* a run reports the run's own
	 * outcome instead of declining. If they somehow raced, `execute`'s `finally`
	 * re-reads the state before writing and its result deliberately WINS: a run that
	 * actually finished is newer, better information than a decline that arrived while
	 * it was finishing. The worst case is one lost `declined: true`, which costs a
	 * re-offer that the completed run had made unnecessary anyway.
	 */
	public async markDeclined(root: string): Promise<void> {
		const state = (await this.stateStore.load()) ?? emptyMigrationState(root);
		state.declined = true;
		await this.stateStore.save(state);
	}

	/** Nothing left to migrate — stop re-offering. */
	public async markSettled(root: string): Promise<void> {
		const state = await this.stateStore.load();
		if (state === null) return;
		if (!state.declined && !state.incomplete) return;
		state.declined = false;
		state.incomplete = false;
		state.root = root;
		await this.stateStore.save(state);
	}

	// -- detection -----------------------------------------------------------

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

	// -- planning ------------------------------------------------------------

	/**
	 * The dry run. Reads every mapped file once to classify it as pristine or
	 * modified; performs no writes and mutates nothing. `onProgress` exists because
	 * that is ~2,000 reads on a real legacy install (review L2).
	 */
	public async plan(
		root: string,
		onProgress?: (done: number, total: number) => void,
	): Promise<MigrationPlan> {
		const normalizedRoot = normalizePath(root);
		const prefix = `${normalizedRoot}/`;
		const detection = this.detect(root);
		const renames: PlannedRename[] = [];
		const blocked: BlockedRename[] = [];
		const unmapped: string[] = [];

		// Deterministic order: the plan a user previews is the plan that runs, and the
		// winner of any destination contest is stable rather than walk-order luck.
		const files = this.filesUnder(prefix).sort((a, b) => (a.path < b.path ? -1 : 1));
		const claimed = new Set<string>();
		let done = 0;
		for (const file of files) {
			done++;
			if (done % 100 === 0) onProgress?.(done, files.length);
			const oldRelative = file.path.slice(prefix.length);
			const entry = this.map.paths[oldRelative];
			if (entry === undefined) {
				unmapped.push(file.path);
				continue;
			}
			const [newRelative, expectedHash] = entry;
			const toPath = normalizePath(`${normalizedRoot}/${newRelative}`);
			if (toPath === file.path) continue; // already where it belongs
			// Occupied in the vault, or already claimed by an earlier file in this same
			// plan (a transitional release can hold two spellings of one entity).
			if (claimed.has(toPath) || this.app.vault.getAbstractFileByPath(toPath) !== null) {
				blocked.push({ fromPath: file.path, toPath });
				continue;
			}
			claimed.add(toPath);
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
		onProgress?.(files.length, files.length);
		return { root, detection, renames, blocked, unmapped };
	}

	// -- execution -----------------------------------------------------------

	/**
	 * Execute a plan. Every mapped file is moved with `FileManager.renameFile` so
	 * Obsidian rewrites the user's links; the destination is re-checked immediately
	 * before each move (the vault can change under a long run), and a failure on one
	 * file never stops the others.
	 *
	 * Bookkeeping is WRITE-AHEAD, because the failure that matters is not an orderly
	 * abort but the process dying (review H1, round 2). A `finally` does not run when
	 * Obsidian is force-quit, so anything recorded only at the end — or only at a
	 * checkpoint AFTER the work — has a window in which moved files exist that nothing
	 * knows about. Two rules close it:
	 *
	 *   1. `incomplete: true` is persisted BEFORE the first rename and cleared in the
	 *      `finally`. Death at any point therefore leaves it set on disk, so the next
	 *      sync re-offers the migration instead of silently syncing — which would
	 *      create the remaining destinations and shut the door for good.
	 *   2. Each window of destinations is recorded BEFORE its renames happen, one
	 *      window ahead at each checkpoint (the same number of writes as recording
	 *      them afterwards). Over-recording is inert: `reconcile()` skips any recorded
	 *      path whose file is not actually there, so a destination that never arrived
	 *      costs nothing, while one that arrived just before the crash is adopted on
	 *      the next run.
	 *
	 * `reconcile()` also runs first, so a previous interrupted run's files are adopted
	 * before this one adds to them.
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
			reportNotePath: null,
		};

		// Self-heal anything a previous, interrupted run moved but never recorded.
		await this.reconcile(plan.root);
		const state = (await this.stateStore.load()) ?? emptyMigrationState(plan.root);
		state.root = plan.root;
		const caseIndex: FolderCaseIndex = buildFolderCaseIndex(this.app);
		const recorded = new Set(state.migrated);
		let sinceCheckpoint = 0;

		/** Write-ahead: claim a window of destinations BEFORE moving anything into them. */
		const recordWindow = (from: number): void => {
			for (const rename of plan.renames.slice(from, from + CHECKPOINT_INTERVAL)) {
				if (recorded.has(rename.newRelative)) continue;
				recorded.add(rename.newRelative);
				state.migrated.push(rename.newRelative);
			}
		};
		// Bookkeeping must never take the run down with it — the moves are the point,
		// and a failed write leaves `incomplete` set, which is the safe direction.
		const persist = async (): Promise<void> => {
			try {
				await this.stateStore.save(state);
			} catch (error) {
				console.warn("Draw Steel Elements: could not record migration progress.", error);
			}
		};
		const adopt = async (): Promise<void> => {
			try {
				await this.reconcile(plan.root);
			} catch (error) {
				console.warn("Draw Steel Elements: could not update the compendium manifest.", error);
			}
		};

		if (plan.renames.length > 0) {
			state.incomplete = true; // survives a force-quit; cleared in the finally below
			recordWindow(0);
			await persist();
		}

		try {
			for (let index = 0; index < plan.renames.length; index++) {
				if (options.shouldAbort?.() === true) {
					report.aborted = true;
					report.remaining = plan.renames.length - index;
					break;
				}
				const rename = plan.renames[index];
				// L1: progress must advance on EVERY entry, including the ones that skip —
				// otherwise a run that skips a stretch looks hung.
				const tick = () => options.onProgress?.(index + 1, plan.renames.length);
				const file = this.app.vault.getAbstractFileByPath(rename.fromPath);
				if (!(file instanceof TFile)) {
					tick();
					continue; // vanished or already moved — nothing to do
				}
				if (this.app.vault.getAbstractFileByPath(rename.toPath) !== null) {
					report.blocked.push({ fromPath: rename.fromPath, toPath: rename.toPath });
					tick();
					continue;
				}
				try {
					const target = await ensureParentFolders(this.app, rename.toPath, caseIndex);
					await this.app.fileManager.renameFile(file, target);
					report.migrated.push(rename);
					sinceCheckpoint++;
					if (rename.modified === true) report.migratedModified.push(rename);
				} catch (error: unknown) {
					report.failed.push({
						fromPath: rename.fromPath,
						toPath: rename.toPath,
						error: error instanceof Error ? error.message : String(error),
					});
				}
				tick();
				if (sinceCheckpoint >= CHECKPOINT_INTERVAL) {
					sinceCheckpoint = 0;
					await adopt();
					recordWindow(index + 1); // claim the next window before entering it
					await persist();
				}
			}
		} finally {
			// Runs on an orderly abort, on an unexpected throw, and on the happy path.
			// It does NOT run on process death — which is exactly why `incomplete` was
			// set before the loop rather than here.
			//
			// Re-read first so a `markDeclined` that landed mid-run isn't silently lost
			// from the record; this run's own outcome still wins for the two flags,
			// because a run that finished is newer information than a decline that
			// arrived while it was finishing (see markDeclined).
			const onDisk = await this.stateStore.load();
			for (const relative of onDisk?.migrated ?? []) {
				if (recorded.has(relative)) continue;
				recorded.add(relative);
				state.migrated.push(relative);
			}
			state.incomplete = report.aborted && report.remaining > 0;
			if (!state.incomplete) state.declined = false;
			await persist();
			await adopt();
		}

		if (options.writeReportNote !== false) {
			report.reportNotePath = await this.writeReportNote(report);
		}
		return report;
	}

	/**
	 * Bring the sync manifest up to date with everything the migration has moved,
	 * across ALL runs. Idempotent and cheap when there is nothing to do.
	 *
	 * Without this the sync would see the renamed files, find no manifest entry, and
	 * classify every one as "user content squatting on a compendium path" — skipping
	 * them all and freezing them at legacy content forever.
	 *
	 * It reads the state file rather than sweeping every file that happens to sit at a
	 * known destination path, and that distinction matters: a user's own note parked on
	 * a destination would be adopted by a sweep and then silently overwritten by the
	 * next sync. Only files this plugin actually moved are ever claimed.
	 */
	public async reconcile(root?: string): Promise<number> {
		const state = await this.stateStore.load();
		if (state === null || state.migrated.length === 0) return 0;
		const existing = await this.manifestStore.load();
		const files: Record<string, string> = { ...(existing?.files ?? {}) };
		const effectiveRoot = existing?.root ?? state.root ?? root ?? "";
		let added = 0;
		for (const relative of new Set(state.migrated)) {
			if (files[relative] !== undefined) continue;
			const file = this.app.vault.getAbstractFileByPath(
				normalizePath(`${effectiveRoot}/${relative}`));
			if (!(file instanceof TFile)) continue;
			files[relative] = await sha256Hex(await this.app.vault.readBinary(file));
			added++;
		}
		if (added === 0 && existing !== null) return 0;
		const manifest: CompendiumManifest = {
			schemaVersion: MANIFEST_SCHEMA_VERSION,
			source: existing?.source ?? COMPENDIUM_SOURCE,
			// Never a real data-unified tag: the migrated content is legacy content at
			// new paths, so `checkForUpdates` must keep reporting an update available
			// until a real sync has run.
			releaseTag: existing?.releaseTag ?? `migrated:${this.map.oldFinalRelease}`,
			locale: existing?.locale ?? this.map.newLocale,
			format: existing?.format ?? COMPENDIUM_FORMAT,
			root: effectiveRoot,
			syncedAt: new Date().toISOString(),
			files,
		};
		await this.manifestStore.save(manifest);
		return added;
	}

	/**
	 * Review H3 — the per-path lists have to outlive the dialog. Counts in a Notice
	 * are not "left in place and listed"; a user who wants to know WHICH file was
	 * skipped has to be able to read it tomorrow, without the developer console.
	 *
	 * A new note at the vault root (never inside the compendium folder, where the sync
	 * would then report it as an unmanaged stray), with a fresh name every time so it
	 * can never overwrite anything.
	 */
	public async writeReportNote(report: MigrationReport): Promise<string | null> {
		const interesting = report.migratedModified.length + report.blocked.length
			+ report.failed.length + report.unmapped.length;
		if (report.migrated.length === 0 && interesting === 0) return null;

		const lines: string[] = [];
		const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
		lines.push(`# Draw Steel Elements — compendium migration, ${stamp}`);
		lines.push("");
		lines.push(
			`Moved **${report.migrated.length}** file(s) in \`${report.root}\` to the 7.0.0 layout. ` +
			"Obsidian updated the links in your notes. Nothing was deleted.");
		if (report.aborted) {
			lines.push("");
			lines.push(
				`**Stopped early — ${report.remaining} file(s) were not moved.** Run the command ` +
				'"Migrate compendium from the pre-7.0.0 layout" to finish. Do NOT sync the ' +
				"compendium first: syncing creates the new files, and the remaining moves then " +
				"have nowhere to go.");
		}
		const section = (title: string, body: string, items: string[]) => {
			if (items.length === 0) return;
			lines.push("");
			lines.push(`## ${title} — ${items.length}`);
			lines.push("");
			lines.push(body);
			lines.push("");
			for (const item of items) lines.push(`- \`${item}\``);
		};
		section(
			"Moved, but their content did not match the last legacy release",
			"You edited these, or you were on an older compendium release. They were moved like " +
			"any other file. **The next sync overwrites them with the current official text** — " +
			"copy anything of your own out of them first if you want to keep it.",
			report.migratedModified.map((r) => r.toPath));
		section(
			"Not moved — something already occupies the new path",
			"Left exactly as they were, at their old paths. Nothing was overwritten.",
			report.blocked.map((r) => `${r.fromPath}  →  ${r.toPath}`));
		section(
			"Failed to move",
			"Obsidian refused the move. These are still at their old paths.",
			report.failed.map((r) => `${r.fromPath}  →  ${r.toPath}  (${r.error})`));
		section(
			"Left in place — no 7.0.0 counterpart",
			"Folder index pages, whole-book pages, and anything of your own that lives in the " +
			"compendium folder. Links to these still work; links to the compendium pages that " +
			"genuinely no longer exist will not.",
			report.unmapped);
		lines.push("");
		lines.push(
			"The old, now-empty folders were left behind on purpose — deleting folders is not " +
			"something this does. Remove them yourself whenever you like.");

		const base = `Draw Steel Elements migration report ${stamp.replace(":", "")}`;
		let path = normalizePath(`${base}.md`);
		for (let n = 2; this.app.vault.getAbstractFileByPath(path) !== null; n++) {
			path = normalizePath(`${base} (${n}).md`);
		}
		try {
			await this.app.vault.create(path, lines.join("\n"));
			return path;
		} catch (error) {
			console.warn("Draw Steel Elements: could not write the migration report note.", error);
			return null;
		}
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
