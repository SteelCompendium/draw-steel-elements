// test/mocks/obsidian-core.ts — the jest-FREE core of the obsidian mock. Everything the
// runtime mock provides except the jest.fn-wrapped network functions, so it is importable
// outside jest (the F4 visual harness's browser shim re-exports it).
// test/mocks/obsidian.ts re-exports this and adds the jest wrappers — tests are unchanged.
import { parse, stringify } from 'yaml';

// ---------------------------------------------------------------- yaml
// Obsidian's REAL parseYaml/stringifyYaml are the `yaml` npm package (eemeli/yaml v2),
// NOT js-yaml — D1 Task 3 byte-fidelity finding, correcting F3 §4.2's assumption: the
// shipped app bundle (obsidian.asar's app.js: `parseYaml:()=>_B` / `stringifyYaml:()=>jB`)
// contains thin wrappers matching `yaml`'s exact `parse(src, null, {})` /
// `stringify(value, null, {})` implementations byte-for-byte, including its default-options
// object literal `{..., lineWidth:80, indentSeq:true, singleQuote:false, ...}` verbatim.
// Plan 05 T-2 (DECIDED 2026-07-02, superseding OD-8's "no new deps" for this test-only
// case): the mock now delegates to the real `yaml` package at its DEFAULTS — an empty
// options object, exactly like the bundle — instead of the old js-yaml stand-in with
// pinned options. No options are passed on purpose: pinning would mask a `yaml` default
// drifting away from what Obsidian ships; the free-text golden
// (test/unit/model/yaml-roundtrip.test.ts) locks the observable behavior instead.
// Why the swap matters: js-yaml matched `yaml` byte-for-byte on scalar-only DTOs
// (stamina-bar — its byte-compat suite is the regression guard for this change) but
// block-folds long free-text scalars (`>-`) where `yaml` emits plain multi-line flow
// scalars, so persisted free-text byte-compat (Negotiation motivations/pitfalls and
// i5..i0 sentences; later Counter labels, Initiative notes) was untestable before.
export function parseYaml(yaml: string): any {
	// Equivalent to the bundle's `parse(src, null, {})` — null reviver, default options.
	return parse(yaml);
}
export function stringifyYaml(obj: any): string {
	// Equivalent to the bundle's `stringify(value, null, {})` — null replacer, default
	// options (lineWidth: 80, indentSeq: true, singleQuote: false, ...).
	return stringify(obj);
}

// ---------------------------------------------------------------- files
export class TAbstractFile {
	path = '';
	name = '';
	parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
	basename = '';
	extension = '';
	stat = { ctime: 0, mtime: 0, size: 0 };

	constructor(path = '') {
		super();
		this.setPath(path);
	}

	setPath(path: string): void {
		this.path = path;
		this.name = path.split('/').pop() ?? path;
		const dot = this.name.lastIndexOf('.');
		this.basename = dot === -1 ? this.name : this.name.slice(0, dot);
		this.extension = dot === -1 ? '' : this.name.slice(dot + 1);
	}
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];

	constructor(path = '') {
		super();
		this.path = path;
		this.name = path.split('/').pop() ?? path;
	}
}

// ---------------------------------------------------------------- vault fake
const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export class FakeVault {
	private contents = new Map<string, string>();
	private tfiles = new Map<string, TFile>();
	private folders = new Map<string, TFolder>();
	readonly modifyCalls: { path: string; content: string }[] = [];

	/** Test seeding helper (not part of the Obsidian API). */
	setFile(path: string, content: string): TFile {
		let file = this.tfiles.get(path);
		if (!file) {
			file = new TFile(path);
			this.tfiles.set(path, file);
		}
		this.contents.set(path, content);
		return file;
	}

	/** Test read helper (not part of the Obsidian API). */
	getContent(path: string): string | undefined {
		return this.contents.get(path);
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.tfiles.get(path) ?? this.folders.get(path) ?? null;
	}

	allFiles(): TFile[] {
		return [...this.tfiles.values()];
	}

	// Snapshot-then-yield: content is captured at call time, then one macrotask
	// elapses before it is returned. This deterministically reproduces the
	// CB-3 read-modify-write race (a second write can land inside the window).
	async read(file: TFile): Promise<string> {
		const content = this.contents.get(file.path);
		await macrotask();
		if (content == null) throw new Error(`File not found: ${file.path}`);
		return content;
	}

	async cachedRead(file: TFile): Promise<string> {
		return this.read(file);
	}

	async modify(file: TFile, content: string): Promise<void> {
		if (!this.tfiles.has(file.path)) throw new Error(`File not found: ${file.path}`);
		this.contents.set(file.path, content);
		this.modifyCalls.push({ path: file.path, content });
	}

	// Atomic by construction: no yield between read and write (obsidianmd rule 19).
	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const current = this.contents.get(file.path);
		if (current == null) throw new Error(`File not found: ${file.path}`);
		const next = fn(current);
		this.contents.set(file.path, next);
		this.modifyCalls.push({ path: file.path, content: next });
		return next;
	}

	async create(path: string, content: string): Promise<TFile> {
		if (this.tfiles.has(path)) throw new Error(`File already exists: ${path}`);
		return this.setFile(path, content);
	}

	async createFolder(path: string): Promise<TFolder> {
		const folder = new TFolder(path);
		this.folders.set(path, folder);
		return folder;
	}

	async delete(file: TAbstractFile, _force = false): Promise<void> {
		this.tfiles.delete(file.path);
		this.contents.delete(file.path);
		this.folders.delete(file.path);
	}

	getResourcePath(file: TFile): string {
		return `app://vault/${file.path}`;
	}
}

export class FakeMetadataCache {
	constructor(private vault: FakeVault) {}

	// Resolves "Thorn Dragon" → any vault file whose basename matches
	// (ReferenceResolver.findFile step 5).
	getFirstLinkpathDest(linkpath: string, _sourcePath: string): TFile | null {
		const wanted = linkpath.replace(/\.md$/, '');
		for (const file of this.vault.allFiles()) {
			if (file.basename === wanted) return file;
		}
		return null;
	}
}

export class App {
	vault = new FakeVault();
	metadataCache = new FakeMetadataCache(this.vault);
	workspace = {
		getActiveViewOfType: (_type: any): any => null,
	};
}

// ---------------------------------------------------------------- components
export class Component {
	_loaded = false;
	_children: Component[] = [];
	private _registeredCallbacks: (() => any)[] = [];

	load(): void {
		this._loaded = true;
		this.onload();
		this._children.forEach((child) => child.load());
	}
	unload(): void {
		this._loaded = false;
		this._children.slice().forEach((child) => child.unload());
		this.onunload();
		// Real Component.register(cb) semantics: cb runs once, on unload.
		this._registeredCallbacks.slice().forEach((cb) => cb());
		this._registeredCallbacks.length = 0;
	}
	onload(): void {}
	onunload(): void {}
	addChild<T extends Component>(child: T): T {
		this._children.push(child);
		if (this._loaded) child.load();
		return child;
	}
	removeChild<T extends Component>(child: T): T {
		const index = this._children.indexOf(child);
		if (index >= 0) {
			this._children.splice(index, 1);
			child.unload();
		}
		return child;
	}
	register(cb: () => any): void {
		this._registeredCallbacks.push(cb);
	}
	registerEvent(_ref: any): void {}
	registerDomEvent(el: any, type: string, callback: any, options?: any): void {
		el.addEventListener(type, callback, options);
		// Real Component.registerDomEvent semantics: detached on unload (via register()).
		this.register(() => el.removeEventListener(type, callback, options));
	}
	registerInterval(id: number): number {
		return id;
	}
}

export class MarkdownRenderChild extends Component {
	containerEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.containerEl = containerEl;
	}
}

export class Events {}

export class Plugin extends Component {
	app: App;
	manifest: any;
	readonly registeredProcessors = new Map<
		string,
		(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => any
	>();

	constructor(app?: App, manifest?: any) {
		super();
		this.app = app ?? new App();
		this.manifest = manifest ?? { id: 'draw-steel-elements', version: 'test' };
	}
	registerMarkdownCodeBlockProcessor(
		language: string,
		handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => any,
	): void {
		this.registeredProcessors.set(language, handler);
	}
	addCommand(_command: any): void {}
	addSettingTab(_tab: any): void {}
	async loadData(): Promise<any> {
		return {};
	}
	async saveData(_data: any): Promise<void> {}
}

// ---------------------------------------------------------------- UI classes
export class Modal {
	app: App;
	containerEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		if (typeof document === 'undefined') {
			throw new Error('Modal requires the jsdom test environment (put the test under test/dom/)');
		}
		this.containerEl = document.createElement('div');
		this.containerEl.className = 'modal-container';
		this.titleEl = (this.containerEl as any).createEl('div', { cls: 'modal-title' });
		this.contentEl = (this.containerEl as any).createEl('div', { cls: 'modal-content' });
	}
	open(): void {
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}
	close(): void {
		this.containerEl.remove();
		this.onClose();
	}
	onOpen(): void {}
	onClose(): void {}
	setTitle(title: string): this {
		this.titleEl.textContent = title;
		return this;
	}
}

export class Notice {
	static readonly notices: string[] = [];
	constructor(message: string, _duration?: number) {
		Notice.notices.push(message);
	}
	setMessage(_message: string): this {
		return this;
	}
	hide(): void {}
}

export class MenuItem {
	title = '';
	icon = '';
	onClickCallback: ((evt?: any) => any) | null = null;
	setTitle(title: string): this {
		this.title = title;
		return this;
	}
	setIcon(icon: string): this {
		this.icon = icon;
		return this;
	}
	onClick(callback: (evt?: any) => any): this {
		this.onClickCallback = callback;
		return this;
	}
}

export class Menu {
	static lastMenu: Menu | null = null;
	readonly items: MenuItem[] = [];
	constructor() {
		Menu.lastMenu = this;
	}
	addItem(callback: (item: MenuItem) => any): this {
		const item = new MenuItem();
		callback(item);
		this.items.push(item);
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(_evt: any): this {
		return this;
	}
	showAtPosition(_pos: any): this {
		return this;
	}
}

// Infinitely-chainable stub for Setting's fluent sub-component callbacks
// (addText(cb) etc.). Any method returns the chain; good enough for code that
// only wires settings UI.
const chain: any = new Proxy(function () {}, {
	get: () => chain,
	apply: () => chain,
});

export class Setting {
	constructor(_containerEl: any) {}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	setHeading(): this {
		return this;
	}
	addText(callback?: (text: any) => any): this {
		callback?.(chain);
		return this;
	}
	addToggle(callback?: (toggle: any) => any): this {
		callback?.(chain);
		return this;
	}
	addButton(callback?: (button: any) => any): this {
		callback?.(chain);
		return this;
	}
	addDropdown(callback?: (dropdown: any) => any): this {
		callback?.(chain);
		return this;
	}
}

export class PluginSettingTab {
	app: App;
	plugin: any;
	containerEl: any = typeof document !== 'undefined' ? document.createElement('div') : null;
	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}
	display(): void {}
	hide(): void {}
}

export class ItemView {
	getViewType(): string {
		return 'fake-item-view';
	}
}

export class MarkdownRenderer {
	static readonly calls: { markdown: string; sourcePath: string }[] = [];
	// Appends the raw markdown as a text node — tests assert on text content,
	// never on rendered markdown HTML (F3 §4.2).
	static async render(
		_app: any,
		markdown: string,
		el: HTMLElement,
		sourcePath: string,
		_component: Component,
	): Promise<void> {
		MarkdownRenderer.calls.push({ markdown, sourcePath });
		el.appendChild(el.ownerDocument.createTextNode(markdown));
	}
}

export function setIcon(el: HTMLElement, iconId: string): void {
	el.setAttribute('data-icon', iconId);
}
export function setTooltip(el: HTMLElement, tooltip: string, _options?: any): void {
	el.setAttribute('data-tooltip', tooltip);
}

// ---------------------------------------------------------------- ctx fake
export interface MarkdownSectionInformation {
	text: string;
	lineStart: number;
	lineEnd: number;
}

export interface MarkdownPostProcessorContext {
	docId: string;
	sourcePath: string;
	frontmatter: any | undefined;
	addChild(child: MarkdownRenderChild): void;
	getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null;
}

export interface FakeContext extends MarkdownPostProcessorContext {
	el: HTMLElement;
	addedChildren: MarkdownRenderChild[];
}

/**
 * Fake MarkdownPostProcessorContext bound to a note in the vault fake.
 * getSectionInfo RE-SCANS the file's CURRENT content on every call for the
 * blockIndex-th ds-* fenced block (``` or ~~~) — modeling Obsidian re-rendering
 * after each write. Returns { text: <whole file>, lineStart, lineEnd } with the
 * fence lines inclusive, matching what CodeBlocks.updateMarkdownCodeBlock splices.
 */
export function makeFakeContext(app: App, sourcePath: string, blockIndex = 0): FakeContext {
	const el: HTMLElement =
		typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLElement);
	const addedChildren: MarkdownRenderChild[] = [];
	return {
		docId: `fake-doc-${sourcePath}`,
		sourcePath,
		frontmatter: undefined,
		el,
		addedChildren,
		addChild(child: MarkdownRenderChild): void {
			addedChildren.push(child);
		},
		getSectionInfo(_el: HTMLElement): MarkdownSectionInformation | null {
			const content = app.vault.getContent(sourcePath);
			if (content == null) return null;
			const lines = content.split('\n');
			let matchIndex = -1;
			let openLine = -1;
			let fence = '';
			for (let i = 0; i < lines.length; i++) {
				if (openLine === -1) {
					const open = lines[i].match(/^([`~]{3,})ds-[\w-]+\s*$/);
					if (open) {
						openLine = i;
						fence = open[1];
					}
				} else {
					const close = lines[i].match(/^([`~]{3,})\s*$/);
					if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
						matchIndex++;
						if (matchIndex === blockIndex) {
							return { text: content, lineStart: openLine, lineEnd: i };
						}
						openLine = -1;
					}
				}
			}
			return null;
		},
	};
}

/** Drains the macrotask yields of un-awaited click → vault-write pipelines. */
export async function flushAsync(rounds = 3): Promise<void> {
	for (let i = 0; i < rounds; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}
