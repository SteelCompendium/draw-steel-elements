import { App, normalizePath } from "obsidian";

/**
 * SC-125 (review H1/H2) — the migration's own durable state, beside the sync manifest
 * in the plugin's config folder.
 *
 * It exists because the manifest cannot answer two questions:
 *
 *  1. **"Which files did the MIGRATION move?"** The manifest only records "files the
 *     plugin manages". Adoption has to be able to converge after an interrupted run,
 *     and the obvious shortcut — sweep every file sitting at a known destination path
 *     — would happily adopt a user's own note that happens to occupy one, handing it
 *     to the next sync to overwrite. Recording what the migration actually moved makes
 *     convergence exact and keeps it incapable of claiming a file it never touched.
 *
 *  2. **"Is the offer still owed?"** Declining, or stopping half-way, must bring the
 *     prompt back on the next sync attempt. After a partial run the manifest is no
 *     longer null, so the manifest-absence trigger can never fire again — the flags
 *     here are what keep the door open.
 *
 * Missing or unreadable fails SAFE in the same sense the manifest does: no recorded
 * migrations (adoption converges to nothing extra) and no pending flags (the ordinary
 * first-sync trigger still applies).
 */

export const MIGRATION_STATE_SCHEMA_VERSION = 1 as const;

export interface MigrationState {
	schemaVersion: typeof MIGRATION_STATE_SCHEMA_VERSION;
	/** Compendium root the migration ran against. */
	root: string;
	/** Root-relative NEW-layout paths this plugin's migration has moved. Append-only. */
	migrated: string[];
	/** The user answered "Not now" (or dismissed the dialog) — re-offer next time. */
	declined: boolean;
	/** A run stopped with renames still owed — re-offer next time. */
	incomplete: boolean;
	updatedAt: string;
}

export function emptyMigrationState(root: string): MigrationState {
	return {
		schemaVersion: MIGRATION_STATE_SCHEMA_VERSION,
		root,
		migrated: [],
		declined: false,
		incomplete: false,
		updatedAt: new Date().toISOString(),
	};
}

export class MigrationStateStore {
	constructor(private app: App, private pluginId: string) {}

	private statePath(): string {
		return normalizePath(
			`${this.app.vault.configDir}/plugins/${this.pluginId}/compendium-migration-state.json`);
	}

	public async load(): Promise<MigrationState | null> {
		const path = this.statePath();
		try {
			if (!(await this.app.vault.adapter.exists(path))) return null;
			const parsed: unknown = JSON.parse(await this.app.vault.adapter.read(path));
			const candidate = parsed as { schemaVersion?: unknown; migrated?: unknown } | null;
			if (candidate?.schemaVersion !== MIGRATION_STATE_SCHEMA_VERSION
				|| !Array.isArray(candidate.migrated)) {
				console.warn(
					"Draw Steel Elements: unrecognized compendium migration state — treating as absent.");
				return null;
			}
			return parsed as MigrationState;
		} catch (error) {
			console.warn(
				"Draw Steel Elements: unreadable compendium migration state — treating as absent.", error);
			return null;
		}
	}

	public async save(state: MigrationState): Promise<void> {
		const path = this.statePath();
		state.updatedAt = new Date().toISOString();
		await this.app.vault.adapter.write(path, JSON.stringify(state, null, 2));
	}
}
