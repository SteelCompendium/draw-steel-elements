// test/fakes/fakeObsidian.ts — shared obsidian fakes for refs/data tests (Task 3).
//
// Deliberately self-contained: depends only on the jest obsidian mock's `App`/`TFile`/
// `TFolder` classes (via moduleNameMapper `^obsidian$` -> test/mocks/obsidian.ts), not on
// the internals of the mock's own `FakeVault`/`FakeMetadataCache` (test/mocks/obsidian-core.ts)
// — that fake is shaped for the existing ReferenceResolver/vault-write test suites and lacks
// `getMarkdownFiles()`, binary content, an `adapter`, and implicit-folder tracking, all of
// which Tasks 4/6/7/9 need here. Exported names are the shared contract — refs/data tests
// import from this module, not from test/mocks directly.
import * as fs from "fs";
import * as yaml from "js-yaml";
import { App, TFile, TFolder } from "obsidian";

/**
 * instanceof-compatible TFile without calling a constructor.
 *
 * `npm run tsc` type-checks this file against the REAL `obsidian` npm package's ambient
 * types (tsconfig `include` is `**\/*.ts`, and tsc has no notion of jest's `moduleNameMapper`
 * — that only rewires the module at *runtime* under ts-jest). The real `TFile`/`TFolder`
 * declare no public constructor (so TS synthesizes a zero-arg one), while the jest mock's
 * `TFile` DOES take a `path` arg — `new TFile(path)` type-checks against the mock but fails
 * `tsc` against the real types ("Expected 0 arguments, but got 1"). `Object.create` sidesteps
 * having to know either constructor's signature, and still satisfies `instanceof TFile` /
 * `instanceof TFolder` checks in production code.
 */
export function fakeTFile(path: string): TFile {
	const file = Object.create(TFile.prototype) as TFile;
	const name = path.split("/").pop() ?? path;
	const dot = name.lastIndexOf(".");
	Object.assign(file, {
		path,
		name,
		basename: dot > 0 ? name.slice(0, dot) : name,
		extension: dot > 0 ? name.slice(dot + 1) : "",
	});
	return file;
}

export function fakeTFolder(path: string): TFolder {
	const folder = Object.create(TFolder.prototype) as TFolder;
	Object.assign(folder, { path, name: path.split("/").pop() ?? path, children: [] });
	return folder;
}

/** Adapter over a Map — enough for ManifestStore (exists/read/write/remove/rename). */
export class FakeAdapter {
	store = new Map<string, string>();
	async exists(path: string): Promise<boolean> {
		return this.store.has(path);
	}
	async read(path: string): Promise<string> {
		const value = this.store.get(path);
		if (value === undefined) throw new Error(`ENOENT: ${path}`);
		return value;
	}
	async write(path: string, data: string): Promise<void> {
		this.store.set(path, data);
	}
	async remove(path: string): Promise<void> {
		this.store.delete(path);
	}
	async rename(from: string, to: string): Promise<void> {
		const value = this.store.get(from);
		if (value === undefined) throw new Error(`ENOENT: ${from}`);
		if (this.store.has(to)) throw new Error(`EEXIST: ${to}`);
		this.store.set(to, value);
		this.store.delete(from);
	}
}

/** In-memory vault: binary-content Map + implicit folders. */
export class FakeVault {
	files = new Map<string, Uint8Array>();
	folders = new Set<string>();
	configDir = ".obsidian";
	adapter = new FakeAdapter();

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		if (this.files.has(path)) return fakeTFile(path);
		if (this.folders.has(path)) return fakeTFolder(path);
		return null;
	}
	getMarkdownFiles(): TFile[] {
		return [...this.files.keys()].filter((p) => p.endsWith(".md")).map(fakeTFile);
	}
	async read(file: TFile): Promise<string> {
		return new TextDecoder().decode(await this.bytes(file.path));
	}
	async readBinary(file: TFile): Promise<ArrayBuffer> {
		const bytes = await this.bytes(file.path);
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	}
	async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
		if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
		this.files.set(path, new Uint8Array(data));
		this.ensureParents(path);
		return fakeTFile(path);
	}
	async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {
		if (!this.files.has(file.path)) throw new Error(`ENOENT: ${file.path}`);
		this.files.set(file.path, new Uint8Array(data));
	}
	async createFolder(path: string): Promise<void> {
		if (this.folders.has(path)) throw new Error(`Folder already exists: ${path}`);
		this.folders.add(path);
	}
	/** Test seeding helper. */
	setText(path: string, text: string): void {
		this.files.set(path, new TextEncoder().encode(text));
		this.ensureParents(path);
	}
	text(path: string): string | undefined {
		const bytes = this.files.get(path);
		return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
	}
	private ensureParents(path: string): void {
		const parts = path.split("/").slice(0, -1);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			this.folders.add(current);
		}
	}
	private async bytes(path: string): Promise<Uint8Array> {
		const bytes = this.files.get(path);
		if (bytes === undefined) throw new Error(`ENOENT: ${path}`);
		return bytes;
	}
	on(): any {
		return { unsubscribe: () => {} };
	} // EventRef stub
}

export class FakeFileManager {
	trashed: string[] = [];
	constructor(private vault: FakeVault) {}
	async trashFile(file: TFile | TFolder): Promise<void> {
		this.trashed.push(file.path);
		if (file instanceof TFolder) {
			for (const path of [...this.vault.files.keys()]) {
				if (path.startsWith(file.path + "/")) this.vault.files.delete(path);
			}
			this.vault.folders.delete(file.path);
		} else {
			this.vault.files.delete(file.path);
		}
	}
}

export class FakeMetadataCache {
	frontmatter = new Map<string, Record<string, any>>();
	getFileCache(file: TFile): { frontmatter?: Record<string, any> } | null {
		const fm = this.frontmatter.get(file.path);
		return fm === undefined ? null : { frontmatter: fm };
	}
	getFirstLinkpathDest(): TFile | null {
		return null;
	}
	on(): any {
		return { unsubscribe: () => {} };
	} // EventRef stub
}

export function makeFakeApp(): {
	app: App;
	vault: FakeVault;
	metadataCache: FakeMetadataCache;
	fileManager: FakeFileManager;
} {
	const vault = new FakeVault();
	const metadataCache = new FakeMetadataCache();
	const fileManager = new FakeFileManager(vault);
	const app = { vault, metadataCache, fileManager } as unknown as App;
	return { app, vault, metadataCache, fileManager };
}

/** Load a real fixture file from disk into the fake vault + metadata cache,
 *  parsing its YAML frontmatter the way Obsidian would. */
export function loadFixtureIntoVault(
	vault: FakeVault,
	metadataCache: FakeMetadataCache,
	fixtureAbsPath: string,
	vaultPath: string,
): void {
	const content = fs.readFileSync(fixtureAbsPath, "utf8");
	vault.setText(vaultPath, content);
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (match) {
		metadataCache.frontmatter.set(vaultPath, yaml.load(match[1]) as Record<string, any>);
	}
}
