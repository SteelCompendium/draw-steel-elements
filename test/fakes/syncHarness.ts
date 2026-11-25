// SC-441 — the compendium sync / migration tests' shared harness: the REAL plugin (`onload()` over the jest `App`), with the app's vault and
// file manager swapped for binary-capable fakes that behave like a real vault where the sync cares:
//   - folders carry their `children` (the first-sync check `root.children.length > 0`), implicit folders included;
//   - `fileManager.trashFile` moves into the vault's own `.trash/` (Obsidian's "Deleted files: Move to Obsidian trash"), or deletes for good
//     ("Permanently delete"); it NEVER touches anything outside the vault;
//   - `fileManager.renameFile` refuses an occupied target and a missing parent folder, like Obsidian;
//   - optionally a CASE-INSENSITIVE filesystem (macOS / Windows): creating `A.md` when `a.md` exists throws.
// Plus a fixture RELEASE SERVER: `requestUrlFn` answered from the test (tag lookup, zip download), no network, no product change.
// The windows are the real `LegacyCompendiumModal` / `CompendiumMigrationModal` drawn in jsdom, driven through their real buttons.
import { strToU8, zipSync } from 'fflate';
import { webcrypto } from 'node:crypto';
import DrawSteelAdmonitionPlugin from 'main';
import type { TFile, TFolder } from 'obsidian';
import { App } from '../mocks/obsidian';
import { CompendiumMigrationModal } from '../../src/views/CompendiumMigrationModal';
import { LegacyCompendiumModal } from '../../src/views/LegacyCompendiumModal';
import { migrationMap } from '../../src/data/CompendiumMigration';
import { FakeFileManager, FakeVault, fakeTFile, fakeTFolder } from './fakeObsidian';

// The sync hashes every file with WebCrypto (`crypto.subtle`), which jsdom does not provide (the node-project unit tests have it).
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.subtle === 'undefined') {
	Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

export const PLUGIN_ID = 'draw-steel-elements';
export const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A vault whose folders have `children`, optionally on a case-insensitive filesystem. */
export class HarnessVault extends FakeVault {
	caseInsensitive = false;
	/** Paths whose creation fails (a refused write), checked on create / createBinary / modifyBinary. */
	failWrites = new Set<string>();

	private lowered(): Set<string> {
		return new Set([...this.files.keys(), ...this.folders].map((p) => p.toLowerCase()));
	}
	private guardCreate(path: string): void {
		if (this.failWrites.has(path)) throw new Error(`EACCES: ${path}`);
		// a FILE where a parent folder should be: the adapter cannot write below it
		const parts = path.split('/').slice(0, -1);
		for (let i = 1; i <= parts.length; i++) {
			if (this.files.has(parts.slice(0, i).join('/'))) throw new Error(`ENOTDIR: not a directory, ${path}`);
		}
		if (this.caseInsensitive && !this.files.has(path) && this.lowered().has(path.toLowerCase())) {
			throw new Error(`File already exists: ${path}`);
		}
	}
	async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
		this.guardCreate(path);
		return super.createBinary(path, data);
	}
	async create(path: string, data: string): Promise<TFile> {
		this.guardCreate(path);
		return super.create(path, data);
	}
	async createFolder(path: string): Promise<void> {
		if (this.files.has(path)) throw new Error('Folder already exists.'); // Obsidian's message when a file holds the name
		if (this.caseInsensitive && !this.folders.has(path) && this.lowered().has(path.toLowerCase())) {
			throw new Error(`Folder already exists: ${path}`);
		}
		return super.createFolder(path);
	}
	async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {
		if (this.failWrites.has(file.path)) throw new Error(`EACCES: ${file.path}`);
		return super.modifyBinary(file, data);
	}
	async delete(file: { path: string }, _force?: boolean): Promise<void> {
		const prefix = `${file.path}/`;
		for (const p of [...this.files.keys()]) if (p === file.path || p.startsWith(prefix)) this.files.delete(p);
		for (const f of [...this.folders]) if (f === file.path || f.startsWith(prefix)) this.folders.delete(f);
	}

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		if (this.files.has(path)) return fakeTFile(path);
		const implicit = [...this.files.keys()].some((p) => p.startsWith(`${path}/`));
		if (!this.folders.has(path) && !implicit) return null;
		const folder = fakeTFolder(path);
		const direct = new Set<string>();
		for (const p of this.files.keys()) {
			if (!p.startsWith(`${path}/`)) continue;
			const rest = p.slice(path.length + 1);
			const slash = rest.indexOf('/');
			direct.add(slash === -1 ? p : `${path}/${rest.slice(0, slash)}`);
		}
		for (const f of this.folders) {
			if (f.startsWith(`${path}/`) && !f.slice(path.length + 1).includes('/')) direct.add(f);
		}
		for (const p of direct) folder.children.push(this.files.has(p) ? fakeTFile(p) : fakeTFolder(p));
		return folder;
	}
	/** Every file path, sorted (explicit helper: the fake's `files` map is the truth). */
	paths(): string[] {
		return [...this.files.keys()].sort();
	}
}

/** `trashFile` the way Obsidian's "Deleted files" option does it, inside the vault. */
export class HarnessFileManager extends FakeFileManager {
	trashMode: 'local' | 'permanent' = 'local';
	/** Renames that fail (a refused move). */
	failRenames = new Set<string>();
	/** Awaited before every rename: a test can hold a run on one file (the e2e spec's page-side wrapper does the same). */
	beforeRename: ((from: string, to: string) => Promise<void> | void) | null = null;
	constructor(private harnessVault: HarnessVault) {
		super(harnessVault);
	}
	async renameFile(file: TFile | TFolder, newPath: string): Promise<void> {
		await this.beforeRename?.(file.path, newPath);
		if (this.failRenames.has(file.path)) throw new Error(`EPERM: ${file.path}`);
		return super.renameFile(file, newPath);
	}
	async trashFile(file: TFile | TFolder): Promise<void> {
		this.trashed.push(file.path);
		const vault = this.harnessVault;
		const moves: Array<[string, Uint8Array]> = [];
		const prefix = `${file.path}/`;
		for (const [p, content] of vault.files) {
			if (p === file.path || p.startsWith(prefix)) moves.push([p, content]);
		}
		for (const [p] of moves) vault.files.delete(p);
		for (const f of [...vault.folders]) if (f === file.path || f.startsWith(prefix)) vault.folders.delete(f);
		if (this.trashMode === 'permanent') return;
		for (const [p, content] of moves) {
			let target = `.trash/${p}`;
			for (let n = 1; vault.files.has(target); n++) target = `.trash/${p} ${n}`;
			vault.files.set(target, content);
			vault.folders.add(target.split('/').slice(0, -1).join('/'));
		}
	}
}

/** The whole observable tree: every vault file and every adapter file (manifest, migration state), as text. */
export type Tree = Record<string, string>;
export function treeOf(vault: HarnessVault): Tree {
	const tree: Tree = {};
	for (const [p, b] of vault.files) tree[p] = new TextDecoder().decode(b);
	for (const [p, text] of vault.adapter.store) tree[`[adapter] ${p}`] = text;
	return tree;
}
export interface TreeDiff {
	created: string[];
	removed: string[];
	changed: string[];
}
export function diffTree(before: Tree, after: Tree): TreeDiff {
	return {
		created: Object.keys(after).filter((p) => !(p in before)).sort(),
		removed: Object.keys(before).filter((p) => !(p in after)).sort(),
		changed: Object.keys(after).filter((p) => p in before && before[p] !== after[p]).sort(),
	};
}
/** A diff with nothing in it. */
export const NO_CHANGE: TreeDiff = { created: [], removed: [], changed: [] };

export const MANIFEST_PATH = `.obsidian/plugins/${PLUGIN_ID}/compendium-manifest.json`;
export const STATE_PATH = `.obsidian/plugins/${PLUGIN_ID}/compendium-migration-state.json`;

// ------------------------------------------------------------------------------------------ the fixture release server

export type ZipEntries = Record<string, string>;
export function zipBuffer(entries: ZipEntries): ArrayBuffer {
	const files: Record<string, Uint8Array> = {};
	for (const [p, content] of Object.entries(entries)) files[p] = strToU8(content);
	const zipped = zipSync(files);
	return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

/** Answers `requestUrlFn` from the test: GitHub's release lookup (latest or by tag) and the asset download. */
export class ReleaseServer {
	releases = new Map<string, ZipEntries>();
	latest = '';
	/** The URLs asked for, in order. */
	calls: string[] = [];
	/** An HTTP status to answer the lookup / the download with instead of 200. */
	lookupStatus: number | null = null;
	downloadStatus: number | null = null;
	/** Serve bytes that are not a zip. */
	brokenZip = false;
	/** Awaited by the lookup before it answers: holds a sync in flight. */
	gate: Promise<void> | null = null;
	publish(tag: string, entries: ZipEntries, makeLatest = true): this {
		this.releases.set(tag, entries);
		if (makeLatest) this.latest = tag;
		return this;
	}
	readonly fn = async (params: { url: string }): Promise<{ status: number; json: unknown; arrayBuffer: ArrayBuffer; text: string; headers: Record<string, string> }> => {
		this.calls.push(params.url);
		const reply = (status: number, json: unknown = null, arrayBuffer = new ArrayBuffer(0)) => ({ status, json, arrayBuffer, text: '', headers: {} });
		const base = 'https://api.github.com/repos/SteelCompendium/data-unified/releases/';
		if (params.url.startsWith(base)) {
			await this.gate;
			if (this.lookupStatus !== null) return reply(this.lookupStatus);
			const rest = decodeURIComponent(params.url.slice(base.length));
			const tag = rest === 'latest' ? this.latest : rest.replace(/^tags\//, '');
			if (!this.releases.has(tag)) return reply(404);
			return reply(200, { tag_name: tag, assets: [{ name: 'md-dse-unified-en.zip', url: `https://assets.example/${tag}.zip` }] });
		}
		const m = /^https:\/\/assets\.example\/(.+)\.zip$/.exec(params.url);
		if (m && this.releases.has(m[1])) {
			if (this.downloadStatus !== null) return reply(this.downloadStatus);
			if (this.brokenZip) return reply(200, null, bytes('this is not a zip archive').buffer.slice(0) as ArrayBuffer);
			return reply(200, null, zipBuffer(this.releases.get(m[1]) as ZipEntries));
		}
		return reply(404);
	};
}

// ------------------------------------------------------------------------------------------ the plugin harness

export interface SyncHarness {
	plugin: DrawSteelAdmonitionPlugin;
	app: App;
	vault: HarnessVault;
	fileManager: HarnessFileManager;
	server: ReleaseServer;
}

/** The real plugin over the harness vault, its sync service answered by a fixture release server. */
export async function makeSyncHarness(destination = 'DS Compendium'): Promise<SyncHarness> {
	const app = new App();
	const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: PLUGIN_ID, version: 'test' } as never);
	await plugin.onload();
	const vault = new HarnessVault();
	const fileManager = new HarnessFileManager(vault);
	(app as unknown as { vault: HarnessVault }).vault = vault;
	(app as unknown as { fileManager: HarnessFileManager }).fileManager = fileManager;
	plugin.settings.compendiumDestinationDirectory = destination;
	const server = new ReleaseServer();
	(plugin.syncService as unknown as { requestUrlFn: unknown }).requestUrlFn = server.fn;
	return { plugin, app, vault, fileManager, server };
}

/**
 * Let the fire-and-forget callbacks of a window run (they are async IIFEs the window does not await). Real time, not event-loop turns: the sync hashes
 * with WebCrypto, whose digests complete on libuv's thread pool, so a fixed number of `setTimeout(0)` turns is not a bound under load. Prefer
 * `until(...)` when the test knows what it is waiting for.
 */
export async function settle(rounds = 25): Promise<void> {
	for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 3));
}

/** Poll until `condition` holds (the tests wait for a state, never for a guessed delay), or fail with `what`. */
export async function until(condition: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
		await new Promise((resolve) => setTimeout(resolve, 3));
	}
}

// ------------------------------------------------------------------------------------------ the windows, drawn for real

/** Every window the plugin opens from now on (the real classes, drawn in jsdom), newest last. Call `restore()` when done. */
export function captureWindows(): { migration: CompendiumMigrationModal[]; legacy: LegacyCompendiumModal[]; restore: () => void } {
	const migration: CompendiumMigrationModal[] = [];
	const legacy: LegacyCompendiumModal[] = [];
	const base = Object.getPrototypeOf(CompendiumMigrationModal.prototype) as { open(this: unknown): void };
	const a = jest.spyOn(CompendiumMigrationModal.prototype, 'open').mockImplementation(function (this: CompendiumMigrationModal) {
		migration.push(this);
		base.open.call(this);
	});
	const b = jest.spyOn(LegacyCompendiumModal.prototype, 'open').mockImplementation(function (this: LegacyCompendiumModal) {
		legacy.push(this);
		base.open.call(this);
	});
	return { migration, legacy, restore: () => { a.mockRestore(); b.mockRestore(); } };
}
/** The control with this id in the open window(s): `click()` it like the user. */
export const control = (id: string): HTMLButtonElement => {
	const el = document.querySelector<HTMLButtonElement>(`[data-dse-control="${id}"]`);
	if (!el) throw new Error(`no control ${id} on screen (windows: ${windowTitles().join(' | ') || 'none'})`);
	return el;
};
/** Titles of the windows on screen, in DOM order. */
export const windowTitles = (): string[] => Array.from(document.querySelectorAll('.modal-container .dse-modal__title')).map((t) => t.textContent ?? '');
/** What Obsidian's scope does with an Escape key press on the open window. */
export const pressEscape = (modal: { onEscapeKey(evt: KeyboardEvent): void }): void => modal.onEscapeKey(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

/** `count` files at pre-7.0.0 paths taken from the SHIPPED migration map, each holding `legacy <path>`, plus one note of the user's own. */
export function seedLegacyTree(vault: HarnessVault, count: number, root = 'DS Compendium'): Array<{ oldRelative: string; newRelative: string }> {
	const pairs: Array<{ oldRelative: string; newRelative: string }> = [];
	for (const [oldRelative, entry] of Object.entries(migrationMap().paths).slice(0, count)) {
		vault.setText(`${root}/${oldRelative}`, `legacy ${oldRelative}`);
		pairs.push({ oldRelative, newRelative: entry[0] });
	}
	return pairs;
}
