// SC-441 e2e driver: the compendium sync, "Existing compendium folder found" and the pre-7.0.0 migration window, in real Obsidian.
//
// New file on purpose (SC-682 shares driver/*): it builds on dse.ts / state.ts / cleanup.ts / page.ts / settingsDrive.ts without editing them.
// This surface MOVES and TRASHES vault files, so the first thing every scenario does (`startSyncTest`) is prove where it runs:
//   1. O2, `assertDisposableVault()`: the open vault is the runner's temporary copy (wdio-obsidian-service's `getVaultPath()` and the page's own
//      `adapter.basePath` agree, and lie under this run's TMPDIR), never the shipped fixture vault, the repository or a `demo-vault`. Throws.
//   2. O3, `setTrash()`: Obsidian's "Deleted files" option is put on the vault's own `.trash` (`'local'`) or, in the named "Permanently delete"
//      scenarios only, `'none'`, and READ BACK; anything else (`'system'` is Obsidian's default and would put files in the machine's trash)
//      throws before a single file is trashed. The write goes to the disposable copy's `.obsidian/app.json`, never to a tracked file.
//   3. the TRASH CANARY, once per spec session: a throwaway file is trashed through the same `app.fileManager.trashFile` the plugin uses and
//      must turn up under `<vault>/.trash/` on disk. If it does not, no trash scenario runs.
//   4. the network guard / fixture release, `resetSyncTree()` and the pristine-tree assertion (see below).
import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { E2E } from './env';
import { zipSync, strToU8 } from 'fflate';
import migrationMapJson from '../../src/data/migrationMap.json';
import { dse } from './dse';
import { clearNotices } from './cleanup';
import { ev, waitFor } from './page';
import { recordDrive } from './state';

const PLUGIN = `app.plugins.plugins['draw-steel-elements']`;
const REPO = path.resolve(__dirname, '..', '..');

export type TrashMode = 'local' | 'none';

const real = (p: string): string => fs.realpathSync(p);
const inside = (child: string, parent: string): boolean => child === parent || child.startsWith(parent + path.sep);

/** The vault copy's absolute path on disk, after the O2 checks. Throws unless this is the runner's disposable copy. */
export async function assertDisposableVault(): Promise<string> {
	const fromService = obsidianPage.getVaultPath();
	const fromPage = await ev<string>(`app.vault.adapter.basePath`);
	if (!fromService || !fromPage) throw new Error('O2: could not read the open vault\'s path (service: ' + fromService + ', page: ' + fromPage + ')');
	const base = real(fromPage);
	if (real(fromService) !== base) throw new Error(`O2: the service says the vault is ${fromService} but the page says ${fromPage}`);
	const tmp = real(process.env.TMPDIR ?? os.tmpdir());
	if (!inside(base, tmp)) throw new Error(`O2: the open vault ${base} is not under this run's temp dir ${tmp}`);
	const fixture = real(E2E.fixtureVault);
	if (inside(base, fixture) || inside(fixture, base)) throw new Error(`O2: the open vault ${base} is (or contains) the tracked fixture vault ${fixture}`);
	if (inside(base, REPO) || inside(REPO, base)) throw new Error(`O2: the open vault ${base} overlaps the repository ${REPO}`);
	if (base.split(path.sep).includes('demo-vault') || base === real(os.homedir())) throw new Error(`O2: the open vault ${base} looks like a real vault`);
	if (!fs.existsSync(path.join(base, '.obsidian', 'plugins', 'draw-steel-elements'))) throw new Error(`O2: ${base} holds no staged draw-steel-elements plugin: not the e2e copy`);
	return base;
}

/** Put Obsidian's "Deleted files" option on the vault's `.trash` (or "Permanently delete") and read it back. Never `'system'`. */
export async function setTrash(mode: TrashMode): Promise<void> {
	await ev(`(() => { app.vault.setConfig('trashOption', ${JSON.stringify(mode)}); return true; })()`);
	const now = await ev<unknown>(`app.vault.getConfig('trashOption')`);
	if (now !== mode) throw new Error(`O3: Obsidian's "Deleted files" option reads ${JSON.stringify(now)} after setting ${JSON.stringify(mode)}; no trash scenario may run`);
}

let canaryDone = false;
/** The result of this session's canary (for the report), or null before it ran. */
export let canaryResult: string | null = null;

/** Trash a throwaway file the way the plugin does and prove on disk that it landed in the vault's own `.trash`. Once per session. */
export async function trashCanary(base: string): Promise<void> {
	if (canaryDone) return;
	await setTrash('local');
	const name = `sc441-canary-${crypto.randomBytes(4).toString('hex')}.md`;
	await ev(`(async () => { await app.vault.create(${JSON.stringify(name)}, 'trash canary: safe to delete'); return true; })()`);
	// let Obsidian's indexer read the new file before it is trashed (a file trashed under its reader makes it log an ENOENT, which the invariants flag)
	await waitFor(`app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${JSON.stringify(name)})) !== null`, 'the canary file to be indexed', 5000);
	await ev(`(async () => { const f = app.vault.getAbstractFileByPath(${JSON.stringify(name)}); await app.fileManager.trashFile(f); return true; })()`);
	const trashed = path.join(base, '.trash', name);
	await browser.waitUntil(async () => fs.existsSync(trashed), { timeout: 5000, interval: 50, timeoutMsg: `the trash canary: ${name} is not under ${path.join(base, '.trash')} after trashFile` });
	if (fs.existsSync(path.join(base, name))) throw new Error('the trash canary: the file is still in the vault after trashFile');
	canaryDone = true;
	canaryResult = `canary ${name} trashed to ${trashed} (trashOption ${await ev<string>('app.vault.getConfig("trashOption")')})`;
}

// ------------------------------------------------------------------------------------------------------ the file tree (ledger O4)

export interface Entry {
	size: number;
	hash: string;
}
export interface Tree {
	files: Record<string, Entry>;
	dirs: string[];
}

export const MANIFEST = '.obsidian/plugins/draw-steel-elements/compendium-manifest.json';
export const STATE = '.obsidian/plugins/draw-steel-elements/compendium-migration-state.json';
export const DATA = '.obsidian/plugins/draw-steel-elements/data.json';
/** The plugin's own state inside `.obsidian/`: removed by the reset, compared like any other file in a scenario. */
const PLUGIN_STATE = new Set([MANIFEST, `${MANIFEST}.tmp`, STATE, DATA]);
/**
 * The NAMED volatile files of Obsidian's own config folder: the workspace layout changes with every leaf that opens or closes, and Obsidian rewrites
 * appearance.json while it starts. Everything else under
 * `.obsidian/` is part of the tree (a product write anywhere in the config folder must show). `app.json` is compared with the two keys the harness
 * sets (`trashOption`, `alwaysUpdateLinks`) taken out.
 */
const VOLATILE = new Set(['.obsidian/workspace.json', '.obsidian/workspaces.json', '.obsidian/appearance.json']);
const HARNESS_APP_KEYS = ['trashOption', 'alwaysUpdateLinks'];
const sha = (buf: Buffer | string): string => crypto.createHash('sha256').update(buf).digest('hex');
function entryOf(rel: string, buf: Buffer): Entry {
	if (rel === '.obsidian/app.json') {
		try {
			const o = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
			for (const k of HARNESS_APP_KEYS) delete o[k];
			const norm = JSON.stringify(Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y))));
			return { size: norm.length, hash: sha(norm) };
		} catch {
			/* not JSON: hash the bytes */
		}
	}
	return { size: buf.length, hash: sha(buf) };
}

/**
 * Every file (path, size, sha256) and folder of the vault copy on disk, dot-folders included: `.trash/` and Obsidian's `.obsidian/` config folder too
 * (only at the vault root: a folder NAMED `.obsidian` deeper down is an ordinary folder), minus the named volatile files above.
 */
export function snapshot(base: string): Tree {
	const files: Record<string, Entry> = {};
	const dirs: string[] = [];
	const walk = (dir: string, rel: string): void => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const r = rel ? `${rel}/${e.name}` : e.name;
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				dirs.push(r);
				walk(full, r);
			} else if (e.isFile() && !VOLATILE.has(r)) {
				files[r] = entryOf(r, fs.readFileSync(full));
			}
		}
	};
	walk(base, '');
	return { files, dirs: dirs.sort() };
}

const same = (a: Tree, b: Tree): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What a scenario says the vault looks like afterwards, as a difference from before. Anything not named must be unchanged. */
export interface Expect {
	/** New files: path -> exact text (null: only that it exists, for files whose bytes vary such as a manifest's timestamp). */
	created?: Record<string, string | null>;
	/** Files that are gone and not accounted for by `moved`. */
	removed?: string[];
	/** Files whose bytes changed: path -> the exact new text (null: only that they differ). */
	modified?: Record<string, string | null>;
	/** Files that moved (old path gone, new path present, SAME bytes): from -> to. Trashing is a move into `.trash/`. */
	moved?: Record<string, string>;
	/** New files whose paths are not known in advance (the report note's name carries a timestamp): each pattern must match exactly one created path. */
	createdMatching?: RegExp[];
	/** New folders (created or left behind), by path. */
	dirsCreated?: string[];
	dirsRemoved?: string[];
}

export interface Diff {
	created: string[];
	removed: string[];
	modified: string[];
	moved: Record<string, string>;
	dirsCreated: string[];
	dirsRemoved: string[];
}

/**
 * The difference between two trees. A MOVE is a removed path and a created path with the same bytes. The moves a scenario NAMES are matched first
 * (`named`: from -> to); only what is left is inferred, over sorted lists, so the answer never depends on the order the filesystem lists folders
 * (a migration creates two files with a moved file's bytes: the move and its backup copy).
 */
export function diffTrees(before: Tree, after: Tree, named: Record<string, string> = {}): Diff {
	let created = Object.keys(after.files).filter((p) => !(p in before.files)).sort();
	let removed = Object.keys(before.files).filter((p) => !(p in after.files)).sort();
	const modified = Object.keys(after.files).filter((p) => p in before.files && before.files[p].hash !== after.files[p].hash);
	const moved: Record<string, string> = {};
	const sameBytes = (to: string, from: string): boolean => after.files[to].hash === before.files[from].hash && after.files[to].size === before.files[from].size;
	const take = (from: string, to: string): void => {
		moved[from] = to;
		created = created.filter((c) => c !== to);
		removed = removed.filter((r) => r !== from);
	};
	for (const [from, to] of Object.entries(named)) if (removed.includes(from) && created.includes(to) && sameBytes(to, from)) take(from, to);
	for (const from of [...removed]) {
		const to = created.find((c) => sameBytes(c, from));
		if (to !== undefined) take(from, to);
	}
	return {
		created,
		removed,
		modified: modified.sort(),
		moved,
		dirsCreated: after.dirs.filter((d) => !before.dirs.includes(d)),
		dirsRemoved: before.dirs.filter((d) => !after.dirs.includes(d)),
	};
}

const text = (base: string, rel: string): string => fs.readFileSync(path.join(base, rel), 'utf8');
const sortedKeys = (o: object | undefined): string[] => Object.keys(o ?? {}).sort();

/** Assert the difference between two snapshots is EXACTLY `expected` (bytes included). Throws a message naming every discrepancy. */
export function expectDiff(base: string, before: Tree, after: Tree, expected: Expect = {}): void {
	const d = diffTrees(before, after, expected.moved);
	const problems: string[] = [];
	for (const re of expected.createdMatching ?? []) {
		const hit = d.created.filter((p) => re.test(p));
		if (hit.length !== 1) problems.push(`expected exactly one created path matching ${re}, got ${JSON.stringify(hit)}`);
		else d.created = d.created.filter((p) => p !== hit[0]);
	}
	const cmp = (what: string, got: string[], want: string[]): void => {
		if (JSON.stringify(got) !== JSON.stringify([...want].sort())) problems.push(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify([...want].sort())}`);
	};
	cmp('created', d.created, sortedKeys(expected.created));
	cmp('removed', d.removed, expected.removed ?? []);
	cmp('modified', d.modified, sortedKeys(expected.modified));
	cmp('moved', Object.keys(d.moved).sort(), sortedKeys(expected.moved));
	cmp('folders created', d.dirsCreated, expected.dirsCreated ?? []);
	cmp('folders removed', d.dirsRemoved, expected.dirsRemoved ?? []);
	for (const [from, to] of Object.entries(expected.moved ?? {})) if (d.moved[from] !== undefined && d.moved[from] !== to) problems.push(`${from} moved to ${d.moved[from]}, wanted ${to}`);
	for (const [p, want] of Object.entries(expected.created ?? {})) if (want !== null && p in after.files && text(base, p) !== want) problems.push(`created ${p} holds ${JSON.stringify(text(base, p))}, wanted ${JSON.stringify(want)}`);
	for (const [p, want] of Object.entries(expected.modified ?? {})) if (want !== null && p in after.files && text(base, p) !== want) problems.push(`modified ${p} holds ${JSON.stringify(text(base, p))}, wanted ${JSON.stringify(want)}`);
	if (problems.length) throw new Error(`the vault changed in a way the scenario did not expect:\n - ${problems.join('\n - ')}`);
}

// ------------------------------------------------------------------------------------------------------ the fixture release (ledger O6)

/** One release's files: root-relative path -> text. Names are arbitrary (hostile ones too): the zip holds exactly these keys. */
export type ReleaseFiles = Record<string, string>;

const B64 = (u8: Uint8Array): string => Buffer.from(u8).toString('base64');

/**
 * No scenario reaches the network. `fixtureRelease.install()` replaces the sync service's request function (page-side, the mechanism the SC-440
 * `releaseStub` uses; the `__e2eStubbed` flag keeps `openSettings` / `openEditor` from guarding over it) with a server that answers GitHub's
 * release lookup and the asset download from zips built HERE, at test time, with fflate. Every URL asked for is recorded (`calls()`).
 */
export const fixtureRelease = {
	async install(): Promise<void> {
		await ev(`(() => {
			const service = ${PLUGIN}.syncService;
			service.__e2eStubbed = true;
			window.__rel441 = { releases: {}, latest: '', lookup: null, download: null, broken: false, gate: null, release: null, calls: [] };
			service.requestUrlFn = async (req) => {
				const R = window.__rel441;
				R.calls.push(req.url);
				const reply = (status, json, arrayBuffer) => ({ status, json: json ?? null, text: '', arrayBuffer: arrayBuffer ?? new ArrayBuffer(0), headers: {} });
				const base = 'https://api.github.com/repos/SteelCompendium/data-unified/releases/';
				if (req.url.startsWith(base)) {
					if (R.gate) await R.gate;
					if (R.lookup !== null) return reply(R.lookup);
					const rest = decodeURIComponent(req.url.slice(base.length));
					const tag = rest === 'latest' ? R.latest : rest.replace(/^tags\\//, '');
					if (!R.releases[tag]) return reply(404);
					return reply(200, { tag_name: tag, assets: [{ name: 'md-dse-unified-en.zip', url: 'https://assets.example/' + tag + '.zip' }] });
				}
				const m = /^https:\\/\\/assets\\.example\\/(.+)\\.zip$/.exec(req.url);
				if (m && R.releases[m[1]]) {
					if (R.download !== null) return reply(R.download);
					if (R.broken) return reply(200, null, new TextEncoder().encode('this is not a zip archive').buffer);
					const bin = atob(R.releases[m[1]]);
					const u8 = new Uint8Array(bin.length);
					for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
					return reply(200, null, u8.buffer);
				}
				throw new Error('e2e: the sync asked for a URL the fixture release does not know: ' + req.url);
			};
			return true;
		})()`);
	},
	/** Make `tag` available (and the latest release unless `latest` is false). */
	async publish(tag: string, files: ReleaseFiles, latest = true): Promise<void> {
		const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([p, c]) => [p, strToU8(c)])));
		await ev(`(() => { const R = window.__rel441; R.releases[${JSON.stringify(tag)}] = ${JSON.stringify(B64(zipped))}; if (${latest}) R.latest = ${JSON.stringify(tag)}; return true; })()`);
	},
	/** Answer the lookup / the download with an HTTP status (or null to answer normally). */
	failLookup: (status: number | null): Promise<unknown> => ev(`(window.__rel441.lookup = ${status}, true)`),
	failDownload: (status: number | null): Promise<unknown> => ev(`(window.__rel441.download = ${status}, true)`),
	/** Serve bytes that are not a zip. */
	brokenZip: (on: boolean): Promise<unknown> => ev(`(window.__rel441.broken = ${on}, true)`),
	/** Hold the lookup until `release()`: a sync in flight. */
	async hold(): Promise<void> {
		await ev(`(() => { const R = window.__rel441; R.gate = new Promise((r) => { R.release = r; }); return true; })()`);
	},
	async release(): Promise<void> {
		await ev(`(() => { const R = window.__rel441; if (R.release) R.release(); R.gate = null; return true; })()`);
	},
	calls: (): Promise<string[]> => ev<string[]>(`window.__rel441.calls.slice()`),
};

// ------------------------------------------------------------------------------------------------------ holds on the engine (ledger O7)

/**
 * A run of 25 files takes milliseconds, so "Stop" could never be pressed in it. These page-side wrappers HOLD the n-th `renameFile` (or the n-th
 * backup copy) on a promise the test releases; the Stop (or Escape, or the X) is then REAL input. The wrappers are the only non-real part.
 */
export const hold = {
	async renames(n: number): Promise<void> {
		await ev(`(() => {
			const fm = app.fileManager;
			const H = (window.__hold441 = window.__hold441 ?? {});
			if (H.origRename === undefined) H.origRename = fm.renameFile;
			H.renames = 0; H.held = false;
			H.gate = new Promise((r) => { H.release = r; });
			fm.renameFile = async function (file, newPath) {
				if (H.renames++ === ${n}) { H.held = true; await H.gate; }
				return H.origRename.call(fm, file, newPath);
			};
			return true;
		})()`);
	},
	async backups(n: number): Promise<void> {
		await ev(`(() => {
			const v = app.vault;
			const H = (window.__hold441 = window.__hold441 ?? {});
			if (H.origCreateBinary === undefined) H.origCreateBinary = v.createBinary;
			H.backups = 0; H.held = false;
			H.gate = new Promise((r) => { H.release = r; });
			v.createBinary = async function (p, data) {
				if (p.includes('backup (pre-7.0.0)') && H.backups++ === ${n}) { H.held = true; await H.gate; }
				return H.origCreateBinary.call(v, p, data);
			};
			return true;
		})()`);
	},
	/** Make the move of the file whose NEW path contains `fragment` fail (Obsidian "refusing" it). */
	async failRename(fragment: string): Promise<void> {
		await ev(`(() => {
			const fm = app.fileManager;
			const H = (window.__hold441 = window.__hold441 ?? {});
			if (H.origRename === undefined) H.origRename = fm.renameFile;
			const inner = fm.renameFile;
			fm.renameFile = async function (file, newPath) {
				if (newPath.includes(${JSON.stringify(fragment)})) throw new Error('e2e: Obsidian refused the move');
				return inner.call(fm, file, newPath);
			};
			return true;
		})()`);
	},
	waitHeld: (): Promise<void> => waitFor(`window.__hold441 && window.__hold441.held === true`, 'the engine to reach the held step', 15000),
	async release(): Promise<void> {
		await ev(`(() => { const H = window.__hold441; if (H && H.release) H.release(); return true; })()`);
	},
	/** Take every wrapper off again (a plugin reload is not needed). */
	async clear(): Promise<void> {
		await ev(`(() => {
			const H = window.__hold441;
			if (H) {
				if (H.release) H.release();
				if (H.origRename !== undefined) delete app.fileManager.renameFile;
				if (H.origCreateBinary !== undefined) delete app.vault.createBinary;
			}
			// the error screen's page-side execute (driver/syncMigration.ts reachError) is an own property over the prototype method
			if (${PLUGIN}.migrationService) delete ${PLUGIN}.migrationService.execute;
			window.__hold441 = undefined;
			return true;
		})()`);
	},
};

// ------------------------------------------------------------------------------------------------------ vault helpers

/** Create these notes in the vault through Obsidian's own API (folders as needed), so its index and link cache see them. */
export async function createNotes(files: Record<string, string>): Promise<void> {
	await ev(`(async () => {
		const files = ${JSON.stringify(files)};
		for (const [rel, body] of Object.entries(files)) {
			const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
			if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
			await app.vault.create(rel, body);
		}
		return true;
	})()`);
}
export const createFolders = (folders: string[]): Promise<unknown> =>
	ev(`(async () => { for (const f of ${JSON.stringify(folders)}) if (!app.vault.getAbstractFileByPath(f)) await app.vault.createFolder(f); return true; })()`);

/** Change a note from outside the plugin (a plain vault.modify), the way a user editing a compendium file does. */
export const editNote = (rel: string, body: string): Promise<unknown> =>
	ev(`(async () => { const f = app.vault.getAbstractFileByPath(${JSON.stringify(rel)}); await app.vault.modify(f, ${JSON.stringify(body)}); return true; })()`);

export interface LegacyPair {
	oldRelative: string;
	newRelative: string;
	/** What the fixture file holds. */
	content: string;
}
/** The first `count` entries of the SHIPPED migration map (real old paths that really map), as files under `root`. Returns the pairs. */
export async function seedLegacy(count = 25, root = 'DS Compendium'): Promise<LegacyPair[]> {
	// Entries WITH a shipped content hash (the file existed in the final legacy release): a fixture file's bytes differ from it, so the run reports them as
	// "moved, but different" and backs them up, which is what makes every list of the summary reachable.
	const entries = Object.entries((migrationMapJson as unknown as { paths: Record<string, string[]> }).paths).filter(([, entry]) => entry.length === 2).slice(0, count);
	const pairs = entries.map(([oldRelative, entry]) => ({ oldRelative, newRelative: entry[0], content: `legacy ${oldRelative}` }));
	await createNotes(Object.fromEntries(pairs.map((p) => [`${root}/${p.oldRelative}`, p.content])));
	return pairs;
}

/** Test-side only: make the engine's map say these old paths hold exactly the fixture bytes (real paths, recomputed hash prefixes), so they count as unmodified. */
export async function markPristine(pairs: LegacyPair[]): Promise<void> {
	await ev(`(async () => {
		const svc = ${PLUGIN}.migrationService;
		const real = svc.map;
		const paths = { ...real.paths };
		for (const [oldRel, body] of ${JSON.stringify(pairs.map((p) => [p.oldRelative, p.content]))}) {
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
			const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
			paths[oldRel] = [paths[oldRel][0], hex.slice(0, 16)];
		}
		svc.mapOverride = { ...real, paths };
		return true;
	})()`);
}

// ------------------------------------------------------------------------------------------------------ the screen

export const noticeTexts = (): Promise<string[]> => ev<string[]>(`Array.from(document.querySelectorAll('.notice')).map((n) => n.textContent ?? '')`);
export const waitNotice = (re: RegExp): Promise<void> =>
	waitFor(`Array.from(document.querySelectorAll('.notice')).some((n) => new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags)}).test(n.textContent ?? ''))`, `a Notice matching ${re}`, 15000);

export interface WindowState {
	title: string;
	/** `data-dse-control` of the focused control inside the window (null: focus is elsewhere, e.g. on the page body). */
	focus: string | null;
	buttons: Array<{ id: string; label: string; disabled: boolean }>;
}
/** The windows on screen (one per `.modal-container`), newest last. */
export const windows = (): Promise<WindowState[]> =>
	ev<WindowState[]>(`Array.from(document.querySelectorAll('.modal-container')).map((m) => ({
		title: m.querySelector('.dse-modal__title')?.textContent ?? '',
		focus: m.contains(document.activeElement) ? (document.activeElement.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null) : null,
		buttons: Array.from(m.querySelectorAll('.dse-modal__footer button')).map((b) => ({ id: b.getAttribute('data-dse-control') ?? '', label: b.getAttribute('aria-label') ?? '', disabled: b.disabled })),
	}))`);
export const LEGACY = 'Existing compendium folder found';
export const PREVIEW = 'Move your compendium to the 7.0.0 layout';
export const RUNNING = 'Moving your compendium…';
export const COMPLETE = 'Compendium moved';
export const STOPPED = 'Migration stopped';
export const ERROR = 'Migration could not finish';
export async function waitWindow(title: string): Promise<WindowState> {
	await waitFor(`Array.from(document.querySelectorAll('.modal-container .dse-modal__title')).some((t) => t.textContent === ${JSON.stringify(title)})`, `the window "${title}"`, 20000);
	return (await windows()).find((w) => w.title === title) as WindowState;
}
export const noWindows = (): Promise<void> => waitFor(`document.querySelectorAll('.modal-container').length === 0`, 'every window to be gone', 10000);

/** Run a palette command with REAL keys (Ctrl+P, the name, Enter) and credit `sync.cmd.<id>`. Leaves whatever window it opens on screen. */
export async function runCommand(id: 'sync-compendium' | 'migrate-compendium-layout', name: string): Promise<void> {
	await browser.keys(['Control', 'p']);
	await waitFor(`!!document.querySelector('.modal-container .prompt .prompt-input')`, 'the command palette to open');
	await browser.keys(name.split(''));
	const shown = `(() => { const s = document.querySelector('.modal-container .prompt .suggestion-item.is-selected'); return s ? s.textContent : ''; })()`;
	await waitFor(`${shown}.includes(${JSON.stringify(name)})`, `the palette to select "${name}"`);
	if (!(await ev<string>(shown)).endsWith(name)) throw new Error(`the palette selected "${await ev<string>(shown)}", not "${name}"`);
	await browser.keys('Enter');
	await waitFor(`!document.querySelector('.modal-container .prompt')`, 'the palette to close');
	recordDrive(`sync.cmd.${id}`, 'palette');
}
export const palette = {
	sync: (): Promise<void> => runCommand('sync-compendium', 'Sync compendium'),
	migrate: (): Promise<void> => runCommand('migrate-compendium-layout', 'Migrate compendium from the pre-7.0.0 layout'),
};

export type DismissWindow = 'legacy' | 'preview' | 'running' | 'summary' | 'stopped' | 'error';
export type Way = 'escape' | 'x' | 'backdrop';
/** Leave a window by Escape, its X or a click outside, with real input, and credit the window's own pair (and the shared host pair). */
export async function dismiss(win: DismissWindow, way: Way): Promise<void> {
	const id = win === 'legacy' ? 'sync.legacy' : `migration.${win}`;
	if (way === 'escape') {
		await dse.press('Escape', dse.aimedAt('modal.close'));
		recordDrive(`${id}.escape`, 'press:Escape');
	} else if (way === 'x') {
		await dse.click(dse.control('modal.close'));
		recordDrive(`${id}.x`, 'click');
	} else {
		await dse.click(dse.control('modal.backdrop'), { inset: 5 });
		recordDrive(`${id}.backdrop`, 'click');
	}
}

/** Move focus to a control with real Tab presses and press Enter on it (the keyboard way to a button that does not hold the initial focus). */
export async function enterOn(id: string): Promise<void> {
	const el = dse.control(id);
	if ((await dse.focusedControl()) !== id) await dse.tabTo(el);
	await dse.press('Enter', el);
}

// ------------------------------------------------------------------------------------------------------ start of every scenario

export interface SyncTest {
	/** The vault copy's path on disk. */
	base: string;
	/** The tree to compare against: the start of the scenario (after the reset and the pristine check), or the last `rebase()`. */
	readonly before: Tree;
	/** Take the current tree as the new "before" (after the scenario seeded the vault with the user's own notes, a legacy tree, an earlier sync). */
	rebase(): Promise<Tree>;
	/** Wait until the plugin is idle and the tree on disk stops changing, then return it. */
	settled(): Promise<Tree>;
	/** `settled()`, then assert the difference from `before` is exactly `expected`. Returns the tree. */
	expectChange(expected?: Expect): Promise<Tree>;
	/** `settled()`, then assert the difference from a tree taken earlier in the scenario is exactly `expected` (e.g. nothing more happened after a window closed). */
	expectSince(earlier: Tree, expected?: Expect): Promise<Tree>;
	/** The folders a set of NEW file paths needs that the tree does not have yet (sorted): what `dirsCreated` should list. */
	dirsFor(paths: string[]): string[];
	/** Read a file of the vault copy from disk. */
	read(rel: string): string;
	exists(rel: string): boolean;
}

export interface StartOptions {
	/** "Deleted files": `'local'` (the vault's own `.trash`, the default) or `'none'` ("Permanently delete"). Never `'system'`. */
	trash?: TrashMode;
	/** Obsidian's "Automatically update internal links" (default ON, so the migration's promise is testable). */
	updateLinks?: boolean;
}

/** The plain files of the tracked fixture vault outside `.obsidian`, with their hashes: what a reset vault must look like. */
function fixtureTree(): Tree {
	const files: Record<string, Entry> = {};
	const dirs: string[] = [];
	const walk = (dir: string, rel: string): void => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.name === '.obsidian') continue;
			const r = rel ? `${rel}/${e.name}` : e.name;
			if (e.isDirectory()) {
				dirs.push(r);
				walk(path.join(dir, e.name), r);
			} else {
				const buf = fs.readFileSync(path.join(dir, e.name));
				files[r] = { size: buf.length, hash: crypto.createHash('sha256').update(buf).digest('hex') };
			}
		}
	};
	walk(E2E.fixtureVault, '');
	return { files, dirs: dirs.sort() };
}

/** What Obsidian's config folder looks like at the start of the session (before this driver wrote anything): the baseline every scenario must return to. */
interface ObsBaseline {
	files: Record<string, Entry>;
	dirs: string[];
}
let obsBaseline: ObsBaseline | null = null;
const isObs = (p: string): boolean => p === '.obsidian' || p.startsWith('.obsidian/');
const obsOf = (t: Tree): ObsBaseline => ({
	files: Object.fromEntries(Object.entries(t.files).filter(([p]) => isObs(p) && !PLUGIN_STATE.has(p))),
	dirs: t.dirs.filter(isObs),
});

/**
 * Put the vault copy back to "no compendium, nothing trashed, no sync state": what `dse.openNote`'s reset does not do (it only rewrites and
 * deletes indexed FILES). Deletes every folder the fixture does not have (a leftover empty `DS Compendium/` makes the first-sync check see
 * "children"), every file the fixture does not have (a migration report note a late run wrote at the vault root), the vault's `.trash/`,
 * anything a scenario left in Obsidian's `.obsidian/` config folder that the session did not start with, the sync manifest and the migration
 * state, and puts the compendium settings back to their defaults.
 */
async function resetSyncTree(): Promise<void> {
	const fx = fixtureTree();
	const obs = obsBaseline as ObsBaseline;
	await ev(`(async () => {
		const keep = new Set(${JSON.stringify(fx.dirs)});
		const keepFiles = new Set(${JSON.stringify(Object.keys(fx.files))});
		for (const f of app.vault.getFiles()) if (!keepFiles.has(f.path)) await app.vault.delete(f, true);
		const folders = app.vault.getAllLoadedFiles().filter((f) => f.children !== undefined && f.path !== '/').map((f) => f.path).sort((a, b) => b.length - a.length);
		for (const p of folders) {
			if (keep.has(p)) continue;
			const f = app.vault.getAbstractFileByPath(p);
			if (f) await app.vault.delete(f, true);
		}
		const a = app.vault.adapter;
		if (await a.exists('.trash')) await a.rmdir('.trash', true);
		for (const rel of ['${MANIFEST}', '${MANIFEST}.tmp', '${STATE}']) if (await a.exists(rel)) await a.remove(rel);
		// whatever a scenario wrote into the config folder (SC-700's Destination) that the session did not start with
		const obsFiles = new Set(${JSON.stringify(Object.keys(obs.files))});
		const obsDirs = new Set(${JSON.stringify(obs.dirs)});
		const walk = async (dir) => {
			const listing = await a.list(dir);
			for (const f of listing.files) if (!obsFiles.has(f) && f !== '${DATA}' && !f.endsWith('workspace.json') && !f.endsWith('workspaces.json') && !f.endsWith('appearance.json')) await a.remove(f);
			for (const d of listing.folders) {
				if (!obsDirs.has(d)) await a.rmdir(d, true);
				else await walk(d);
			}
		};
		await walk('.obsidian');
		const p = ${PLUGIN};
		p.settings.compendiumDestinationDirectory = 'DS Compendium';
		p.settings.compendiumReleaseTag = '';
		p.settings.compendiumLocale = 'en';
		await p.saveSettings();
		p.prefsStorage?.flush?.();
		if (p.migrationService) { p.migrationService.mapOverride = undefined; delete p.migrationService.execute; }
		return true;
	})()`);
}

/** Throw unless the tree on disk is the tracked fixture vault, Obsidian's config folder as the session found it, and nothing else (the pristine assertion). */
function assertPristine(t: Tree): void {
	const fx = fixtureTree();
	const obs = obsBaseline as ObsBaseline;
	const problems: string[] = [];
	for (const p of Object.keys(t.files)) {
		if (PLUGIN_STATE.has(p)) {
			if (p !== DATA) problems.push(`stray plugin state ${p}`);
			continue;
		}
		if (isObs(p)) {
			if (!(p in obs.files)) problems.push(`stray config file ${p}`);
			else if (obs.files[p].hash !== t.files[p].hash) problems.push(`config file ${p} differs from the session's start`);
			continue;
		}
		if (!(p in fx.files)) problems.push(`stray file ${p}`);
		else if (fx.files[p].hash !== t.files[p].hash) problems.push(`fixture file ${p} differs`);
	}
	for (const p of Object.keys(fx.files)) if (!(p in t.files)) problems.push(`fixture file ${p} is missing`);
	for (const p of Object.keys(obs.files)) if (!(p in t.files)) problems.push(`config file ${p} is missing`);
	for (const d of t.dirs) if (!isObs(d) && !fx.dirs.includes(d)) problems.push(`stray folder ${d}`);
	for (const d of t.dirs.filter(isObs)) if (!obs.dirs.includes(d)) problems.push(`stray config folder ${d}`);
	if (problems.length) throw new Error(`the vault copy is not pristine at the start of the scenario:\n - ${problems.join('\n - ')}`);
}

/** Wait until the tree on disk has stopped changing for three polls (a released run finishing its file in flight, writing its report note and state). */
async function quiesce(base: string): Promise<void> {
	let last = snapshot(base);
	let quiet = 0;
	await browser.waitUntil(
		async () => {
			await new Promise((r) => setTimeout(r, 150));
			const now = snapshot(base);
			quiet = same(now, last) ? quiet + 1 : 0;
			last = now;
			return quiet >= 3;
		},
		{ timeout: 20000, interval: 10, timeoutMsg: 'the vault copy never went quiet after the previous scenario' },
	);
}

/**
 * The first call of EVERY sync scenario. In order: the runner's own reset (`dse.openNote`), the O2 disposable-vault guard, the O3 trash setting
 * (read back), the link setting, the trash canary (once per session), the fixture release, `resetSyncTree()`, the pristine assertion. Returns the
 * tree to compare against.
 */
export async function startSyncTest(opts: StartOptions = {}): Promise<SyncTest> {
	await dse.openNote('Stamina/basic.md');
	const base = await assertDisposableVault();
	if (obsBaseline === null) obsBaseline = obsOf(snapshot(base)); // before this driver writes anything into the session
	await setTrash(opts.trash ?? 'local');
	await ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', ${opts.updateLinks !== false}); return true; })()`);
	await trashCanary(base);
	await setTrash(opts.trash ?? 'local');
	await hold.clear(); // releases a run an earlier scenario left held: its window was closed by the runner's reset, so it stops after the file in flight
	await quiesce(base);
	await resetSyncTree();
	await fixtureRelease.install();
	await clearNotices();
	await dse.closeModals();
	const settled = async (): Promise<Tree> => {
		await waitFor(`!${PLUGIN}.syncService.isBusy()`, 'the plugin to go idle', 20000);
		await dse.settle();
		let last = snapshot(base);
		await browser.waitUntil(
			async () => {
				await new Promise((r) => setTimeout(r, 150));
				const now = snapshot(base);
				const stable = same(now, last);
				last = now;
				return stable;
			},
			{ timeout: 15000, interval: 10, timeoutMsg: 'the vault copy never stopped changing' },
		);
		return last;
	};
	let first = await settled();
	assertPristine(first);
	return {
		base,
		get before(): Tree {
			return first;
		},
		async rebase(): Promise<Tree> {
			first = await settled();
			return first;
		},
		settled,
		async expectChange(expected = {}): Promise<Tree> {
			const after = await settled();
			expectDiff(base, first, after, expected);
			return after;
		},
		async expectSince(earlier: Tree, expected = {}): Promise<Tree> {
			const after = await settled();
			expectDiff(base, earlier, after, expected);
			return after;
		},
		dirsFor(paths: string[]): string[] {
			const need = new Set<string>();
			for (const p of paths) {
				const parts = p.split('/').slice(0, -1);
				for (let i = 1; i <= parts.length; i++) need.add(parts.slice(0, i).join('/'));
			}
			return [...need].filter((d) => !first.dirs.includes(d)).sort();
		},
		read: (rel) => text(base, rel),
		exists: (rel) => fs.existsSync(path.join(base, rel)),
	};
}

// ------------------------------------------------------------------------------------------------------ Obsidian's own "Update links" prompt

/** With "Automatically update internal links" OFF, Obsidian asks (a modal of its own, over ours) before it moves a file that has incoming links. */
export async function waitUpdateLinksPrompt(): Promise<string> {
	await waitFor(`Array.from(document.querySelectorAll('.modal-container .modal-title')).some((t) => t.textContent === 'Update links')`, `Obsidian's "Update links" prompt`, 20000);
	return ev<string>(`Array.from(document.querySelectorAll('.modal-container')).find((m) => m.querySelector('.modal-title')?.textContent === 'Update links').textContent`);
}
/** A real click on one of that prompt's buttons ("Always update", "Just once", "Do not update"). Obsidian's own control: no manifest id, nothing credited. */
export async function answerUpdateLinks(button: 'Always update' | 'Just once' | 'Do not update'): Promise<void> {
	const el = browser.$(`//div[contains(@class, 'modal-container')]//button[normalize-space()='${button}']`);
	await el.waitForDisplayed({ timeout: 8000 });
	await el.click();
	await waitFor(`!Array.from(document.querySelectorAll('.modal-container .modal-title')).some((t) => t.textContent === 'Update links')`, 'the prompt to close', 8000);
}

/**
 * Wait up to `ms` for `cond` and return whether it held. For a NEGATIVE expectation ("no second window opens"): the wait is bounded and ends the moment
 * the state shows, so a fixed bug costs the full wait once and a present bug costs nothing.
 */
export async function within(ms: number, cond: () => Promise<boolean>): Promise<boolean> {
	try {
		await browser.waitUntil(cond, { timeout: ms, interval: 50 });
		return true;
	} catch {
		return false;
	}
}
export const windowsWithin = (n: number, ms: number): Promise<boolean> => within(ms, async () => (await windows()).length >= n);
