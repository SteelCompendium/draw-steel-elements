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

// ---------------------------------------------------------------- paths
// F2 Task 4: SccResolver joins the managed-root directory + a derived relative path
// via normalizePath (as real element/settings code does before any vault lookup). The
// mock previously had no normalizePath at all — nothing needed it before now. This
// mirrors the real implementation's observable behavior (unify separators, collapse
// duplicate slashes, drop a leading "./", trim leading/trailing slashes) without
// pulling in Obsidian's actual (Electron-only) implementation.
export function normalizePath(path: string): string {
	let p = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
	if (p.startsWith('./')) p = p.slice(2);
	p = p.replace(/^\/+/, '').replace(/\/+$/, '');
	return p === '' ? '/' : p;
}

// ---------------------------------------------------------------- vault fake
const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * F2 Task 11: a minimal in-memory `DataAdapter` — enough for `ManifestStore`
 * (exists/read/write/remove/rename over plugin-config-dir paths). Before this, the
 * real `onload()` path in DOM tests (`makeLoadedPlugin()`) had NO adapter at all, so
 * any settings-tab render that called `manifestStore.load()` (F2 Task 11's status
 * line is the first) hit `undefined.exists` and fell into ManifestStore's fail-safe
 * catch — harmless (resolves to `null`), but it logged a scary console.warn on every
 * `display()` call. A real backing store avoids the warning and lets DOM tests seed
 * a manifest via `vault.adapter.write(...)` if a future test needs to.
 */
export class FakeAdapter {
	private store = new Map<string, string>();
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
		this.store.set(to, value);
		this.store.delete(from);
	}
}

export class FakeVault {
	private contents = new Map<string, string>();
	private tfiles = new Map<string, TFile>();
	private folders = new Map<string, TFolder>();
	readonly modifyCalls: { path: string; content: string }[] = [];
	/** F2 Task 11: ManifestStore.manifestPath() joins this in. Real Obsidian's is
	 *  `.obsidian` by default. */
	configDir = '.obsidian';
	/** F2 Task 11: backs ManifestStore's load/save. */
	readonly adapter = new FakeAdapter();

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

	// D6 Task 4 — SccResolver.seedIndex() (and CompendiumIndex.query/resolveSlug,
	// which walk resolver.entries()) call the real Obsidian Vault.getMarkdownFiles();
	// this mock only tracked files via allFiles() until now, which no production code
	// happened to call. Purely additive (no existing caller relies on its absence).
	getMarkdownFiles(): TFile[] {
		return this.allFiles().filter((f) => f.path.endsWith('.md'));
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

	// F2 Task 7: SccResolver.registerWatchers is the first production code to call
	// `Component.registerEvent(vault.on(...))` through the REAL onload() path (dom
	// tests construct the plugin against this mock, not test/fakes/fakeObsidian.ts's
	// FakeVault, which already stubs `.on()`). Component.registerEvent(_ref: any)
	// ignores the returned EventRef, so a bare stub is enough — no event actually
	// fires from this mock; SccResolver's incremental index maintenance is exercised
	// against fakeObsidian.ts's FakeVault instead (test/unit/refs/sccResolver.test.ts).
	on(_name: string, _callback: (...args: any[]) => any): any {
		return { unsubscribe: () => {} };
	}
}

export class FakeMetadataCache {
	constructor(private vault: FakeVault) {}

	// See FakeVault.on above — same rationale.
	on(_name: string, _callback: (...args: any[]) => any): any {
		return { unsubscribe: () => {} };
	}

	// Resolves "Thorn Dragon" → any vault file whose basename matches
	// (ReferenceResolver.findFile step 5).
	getFirstLinkpathDest(linkpath: string, _sourcePath: string): TFile | null {
		const wanted = linkpath.replace(/\.md$/, '');
		for (const file of this.vault.allFiles()) {
			if (file.basename === wanted) return file;
		}
		return null;
	}

	// T-6: parses the file's YAML frontmatter block on demand (real Obsidian caches
	// this; re-parsing per call is fine at test scale). Used by
	// ReferenceResolver.extractFirstDsBlock's miss-error path (names frontmatter `type`).
	getFileCache(file: TFile): { frontmatter?: Record<string, any> } | null {
		const content = this.vault.getContent(file.path);
		if (content == null) return null;
		const match = /^---\n([\s\S]*?)\n---/.exec(content);
		if (!match) return null;
		try {
			return { frontmatter: parseYaml(match[1]) };
		} catch {
			return null;
		}
	}
}

// D8 Task 1: `FakeWorkspace` widens the old plain-object `App.workspace` (previously just
// `getActiveViewOfType`, kept identical below) with the sidebar view APIs. `_viewFactories`/
// `_leaves`/`_activeLeaf`/`_track`/`_untrack` are internal bookkeeping (not part of the real
// Obsidian API) — `WorkspaceLeaf` reaches into them, and `Plugin.registerView` populates
// `_viewFactories`.
export class FakeWorkspace {
	_viewFactories = new Map<string, (leaf: WorkspaceLeaf) => ItemView>();
	_leaves: WorkspaceLeaf[] = [];
	_activeLeaf: WorkspaceLeaf | null = null;

	// SC-135 phase 1: src/refs/sccLinkClickHandler.ts's registerSccLinkClickHandling reaches
	// `workspace.containerEl` (main-window attach point) through the REAL onload() path.
	// NULL in the `unit` jest project (node env, no `document`) — same defensive pattern as
	// Notice.noticeEl above; no unit-project test drives onload() far enough to dereference
	// this, since that requires the jsdom-only WorkspaceLeaf/ItemView machinery anyway.
	containerEl: HTMLElement = (typeof document === 'undefined' ? null : document.createElement('div')) as HTMLElement;

	// SC-135 phase 1: reached only lazily, inside a click's openVault() — never at onload —
	// but stubbed here so any test that DOES simulate a click through the full mock has a
	// working (if inert) target. Real semantics are exercised by
	// test/dom/sccLinkClickHandler.test.ts's own lightweight fakes, not this mock.
	getActiveFile(): TFile | null {
		return null;
	}
	readonly openLinkTextCalls: Array<{ linktext: string; sourcePath: string; newLeaf?: unknown }> = [];
	async openLinkText(linktext: string, sourcePath: string, newLeaf?: unknown): Promise<void> {
		this.openLinkTextCalls.push({ linktext, sourcePath, newLeaf });
	}

	// SC-135 phase 1: registerSccLinkClickHandling's "already-open popout" sweep at
	// registration time. Every _leaves entry the mock tracks lives in the one jsdom
	// `document` (WorkspaceLeaf/ItemView both require it) — the mock does not model real
	// popout windows, so this is a plain sweep, not a popout enumeration.
	iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void {
		for (const leaf of this._leaves) callback(leaf);
	}

	// See FakeVault.on above (T-6/F2 Task 7) — same rationale: no event actually fires from
	// this mock; registerEvent(vault.on(...)) style calls just need a non-throwing stub so
	// production onload() code can register through the REAL path. SC-135 phase 1's
	// `workspace.on('window-open', ...)` is exercised for real against
	// test/dom/sccLinkClickHandler.test.ts's own lightweight fake workspace, not this one.
	on(_name: string, _callback: (...args: any[]) => any): any {
		return { unsubscribe: () => {} };
	}

	getActiveViewOfType(_type: any): any {
		return null;
	}

	/** D8 Task 1: test hook to force null (simulating no right sidebar available). */
	__rightLeafUnavailable = false;

	getRightLeaf(_split: boolean): WorkspaceLeaf | null {
		if (this.__rightLeafUnavailable) return null;
		const leaf = new WorkspaceLeaf(this);
		this._track(leaf);
		return leaf;
	}

	getLeavesOfType(type: string): WorkspaceLeaf[] {
		return this._leaves.filter((leaf) => leaf.getViewState().type === type);
	}

	revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
		this._activeLeaf = leaf;
		return Promise.resolve();
	}

	detachLeavesOfType(type: string): void {
		for (const leaf of this.getLeavesOfType(type)) {
			leaf.detach();
		}
	}

	/** Internal: idempotent add — also re-tracks a leaf whose view was re-opened after detach. */
	_track(leaf: WorkspaceLeaf): void {
		if (!this._leaves.includes(leaf)) this._leaves.push(leaf);
	}
	/** Internal: drop a detached leaf from the tracked list. */
	_untrack(leaf: WorkspaceLeaf): void {
		const index = this._leaves.indexOf(leaf);
		if (index >= 0) this._leaves.splice(index, 1);
	}
}

export class App {
	vault = new FakeVault();
	metadataCache = new FakeMetadataCache(this.vault);
	workspace = new FakeWorkspace();
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

// ---------------------------------------------------------------- editor surface (D9 Task 3)
// Minimal jest-free Editor/EditorSuggest mocks — Plan 15 Task 3. The real obsidian-mock has
// no editor surface yet (F3/F4 predate D9's authoring work); this is the smallest shape the
// insert command + /ds suggester need, matching the pattern of the rest of this file (records
// what it's asked to do, never simulates real CodeMirror behavior).
export interface EditorPosition {
	line: number;
	ch: number;
}
export interface EditorSuggestTriggerInfo {
	start: EditorPosition;
	end: EditorPosition;
	query: string;
}
export interface EditorSuggestContext {
	editor: Editor;
	file: TFile | null;
	start: EditorPosition;
	end: EditorPosition;
	query: string;
}

/** Minimal line-buffer editor for authoring tests: records every write it is asked to make. */
export class Editor {
	private lines: string[];
	cursor: EditorPosition = { line: 0, ch: 0 };
	readonly writes: Array<{ text: string; from: EditorPosition; to: EditorPosition }> = [];
	/** Every setCursor() call, in order — lets tests assert placement was actually invoked
	 * (not just that final `.cursor` happens to match by coincidence). */
	readonly setCursorCalls: EditorPosition[] = [];
	constructor(text = '') {
		this.lines = text.split('\n');
	}
	getLine(n: number): string {
		return this.lines[n] ?? '';
	}
	lineCount(): number {
		return this.lines.length;
	}
	getCursor(_side?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition {
		return this.cursor;
	}
	setCursor(pos: EditorPosition): void {
		this.setCursorCalls.push(pos);
		this.cursor = pos;
	}
	getValue(): string {
		return this.lines.join('\n');
	}
	replaceSelection(text: string): void {
		this.writes.push({ text, from: this.cursor, to: this.cursor });
	}
	replaceRange(text: string, from: EditorPosition, to: EditorPosition): void {
		this.writes.push({ text, from, to });
	}
}

export abstract class EditorSuggest<T> {
	app: App;
	context: EditorSuggestContext | null = null;
	constructor(app: App) {
		this.app = app;
	}
	abstract onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null;
	abstract getSuggestions(context: EditorSuggestContext): T[] | Promise<T[]>;
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract selectSuggestion(value: T, evt: unknown): void;
}

export class Plugin extends Component {
	app: App;
	manifest: any;
	readonly registeredProcessors = new Map<
		string,
		(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => any
	>();
	/** Vault-wide reading-mode post-processors (registerMarkdownPostProcessor), in
	 *  registration order — e.g. F2 §4.3(b)'s sccPostProcessor. */
	readonly registeredPostProcessors: Array<(el: HTMLElement, ctx: MarkdownPostProcessorContext) => any> = [];

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
	registerMarkdownPostProcessor(
		handler: (el: HTMLElement, ctx: MarkdownPostProcessorContext) => any,
	): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => any {
		this.registeredPostProcessors.push(handler);
		return handler;
	}
	/** Registered settings tabs, in registration order (tests read this to assert the
	 *  registration-time definition build). */
	settingTabs: any[] = [];

	/** SC-131: obsidian builds a tab's search index the moment it is registered, by
	 *  calling `update()` — which is what makes registration ORDER matter. Anything the
	 *  definitions depend on must already exist, or those rows are silently absent from
	 *  both the tab and the settings search until something calls update() again. */
	addSettingTab(tab: any): void {
		this.settingTabs.push(tab);
		tab?.update?.();
	}
	/** D8 Task 2: registerDseSidebar's ribbon icon — minimal jsdom-backed stub (real
	 *  Obsidian adds the element to the left ribbon bar and wires the click callback;
	 *  the mock just returns a detached element with the callback attached, matching the
	 *  rest of this file's "record what it's asked to do" style). */
	addRibbonIcon(_icon: string, title: string, callback: (evt: MouseEvent) => any): HTMLElement {
		const el: HTMLElement = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLElement);
		if (typeof document !== 'undefined') {
			el.setAttribute('aria-label', title);
			el.addEventListener('click', callback as EventListener);
		}
		return el;
	}
	async loadData(): Promise<any> {
		return {};
	}
	async saveData(_data: any): Promise<void> {}
	readonly commands: any[] = [];
	readonly editorSuggests: any[] = [];
	addCommand(command: any): any {
		this.commands.push(command);
		return command;
	}
	registerEditorSuggest(suggest: any): void {
		this.editorSuggests.push(suggest);
	}
	registerEditorExtension(_ext: any): void {}
	// D8 Task 1: real Obsidian registers the factory on the workspace and auto-detaches
	// registered views when the plugin unloads — the mock records the factory on
	// `app.workspace._viewFactories` and reuses `Component.register` for the auto-detach
	// (so `plugin.unload()` in a test closes any leaves left open by that plugin's views).
	registerView(type: string, factory: (leaf: WorkspaceLeaf) => ItemView): void {
		this.app.workspace._viewFactories.set(type, factory);
		this.register(() => void this.app.workspace.detachLeavesOfType(type));
	}
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

/** D6 Task 10 (spec §4.2) -- `CompendiumSearchModal` is the first `SuggestModal` user in
 *  this repo; no prior mock existed. Minimal, mirroring `Modal`'s own mock style: real
 *  jsdom `containerEl`/`contentEl` (inherited from `Modal`) plus an `inputEl`/
 *  `resultContainerEl` pair a subclass's `renderSuggestion` can write into, `setPlaceholder`,
 *  a no-op `setInstructions` (the real hint-row footer -- irrelevant to test assertions),
 *  and `getSuggestions`/`renderSuggestion`/`onChooseSuggestion` left abstract exactly like
 *  real Obsidian. `open`/`close` are inherited as-is from `Modal` (already track "is this
 *  in the DOM" via containerEl attach/detach -- no separate no-op tracking needed). Real
 *  Obsidian's `selectSuggestion` calls `onChooseSuggestion` then closes the modal; the mock
 *  does the same so a test can drive selection through either the abstract method directly
 *  or `selectSuggestion` (matching a real click/Enter). */
export abstract class SuggestModal<T> extends Modal {
	limit = 100;
	emptyStateText = 'No results found.';
	inputEl: HTMLInputElement;
	resultContainerEl: HTMLElement;

	constructor(app: App) {
		super(app);
		this.inputEl = document.createElement('input');
		this.inputEl.type = 'text';
		this.resultContainerEl = document.createElement('div');
		this.contentEl.appendChild(this.inputEl);
		this.contentEl.appendChild(this.resultContainerEl);
	}

	setPlaceholder(placeholder: string): void {
		this.inputEl.placeholder = placeholder;
	}

	setInstructions(_instructions: Array<{ command: string; purpose: string }>): void {}

	onNoSuggestion(): void {}

	abstract getSuggestions(query: string): T[] | Promise<T[]>;
	abstract renderSuggestion(value: T, el: HTMLElement): void;
	abstract onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;

	selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void {
		this.onChooseSuggestion(value, evt);
		this.close();
	}

	selectActiveSuggestion(_evt: MouseEvent | KeyboardEvent): void {}
}

export class Notice {
	static readonly notices: string[] = [];
	/** SC-132: the most recently constructed Notice, so a test can reach the ACTION node
	 *  inside a rich (DocumentFragment) notice — the undo toast is the plugin's first
	 *  notice that carries a control rather than only text. */
	static last: Notice | null = null;
	/** The real Notice's own element. Here: a detached div holding whatever was passed,
	 *  which is enough for `noticeEl.querySelector(...)` + `.click()`.
	 *
	 *  NULL in the `unit` jest project, which runs in the NODE environment and has no
	 *  `document` — several node-side services post notices (CompendiumSyncService), and
	 *  a mock that needs a DOM to be constructed would break them. */
	readonly noticeEl: HTMLElement | null =
		typeof document === 'undefined' ? null : document.createElement('div');
	private hidden = false;
	constructor(message: string | DocumentFragment, _duration?: number) {
		if (typeof message === 'string') {
			Notice.notices.push(message);
			if (this.noticeEl) this.noticeEl.textContent = message;
		} else {
			this.noticeEl?.appendChild(message);
			Notice.notices.push(this.noticeEl?.textContent ?? '');
		}
		Notice.last = this;
	}
	setMessage(_message: string): this {
		return this;
	}
	get isHidden(): boolean {
		return this.hidden;
	}
	hide(): void {
		this.hidden = true;
		this.noticeEl?.remove();
	}
}

// SC-135 phase 1: the click-resolution seam (src/refs/sccLinkClickHandler.ts) calls the
// REAL obsidian `Keymap.isModEvent` (imported from 'obsidian', resolving to this mock under
// jest via moduleNameMapper) — a faithful-enough reimplementation of the documented
// semantics (real obsidian.d.ts): Cmd/Ctrl+Alt+Shift -> 'window', Cmd/Ctrl+Alt -> 'split',
// Cmd/Ctrl (or a middle-click MouseEvent, button 1) -> 'tab', otherwise false.
export type PaneType = 'tab' | 'split' | 'window';

export class Keymap {
	static isModEvent(evt?: MouseEvent | KeyboardEvent | null): PaneType | boolean {
		if (!evt) return false;
		const mod = evt.ctrlKey || evt.metaKey;
		if (mod && evt.altKey && evt.shiftKey) return 'window';
		if (mod && evt.altKey) return 'split';
		if (mod) return 'tab';
		if ('button' in evt && (evt as MouseEvent).button === 1) return 'tab';
		return false;
	}
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

// Recording Setting fakes (Plan 13 Task 4): the settings tab is driven by REAL
// jsdom tests, so the fakes record names/options/values and expose trigger() to
// simulate user input. Only src/views/SettingsTab.ts constructs Setting.
class FakeSettingComponent {
	disabled = false;
	protected changeCb: ((value: any) => any) | null = null;
	onChange(cb: (value: any) => any): this {
		this.changeCb = cb;
		return this;
	}
	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		return this;
	}
	setTooltip(_tooltip: string): this {
		return this;
	}
}
export class FakeToggle extends FakeSettingComponent {
	value = false;
	setValue(value: boolean): this {
		this.value = value;
		return this;
	}
	/** Test helper: simulate a user flip (setValue + fire onChange). */
	trigger(value: boolean): void {
		this.value = value;
		this.changeCb?.(value);
	}
}
export class FakeDropdown extends FakeSettingComponent {
	value = '';
	readonly options: { value: string; label: string }[] = [];
	addOption(value: string, label: string): this {
		this.options.push({ value, label });
		return this;
	}
	addOptions(options: Record<string, string>): this {
		for (const [value, label] of Object.entries(options)) this.addOption(value, label);
		return this;
	}
	setValue(value: string): this {
		this.value = value;
		return this;
	}
	trigger(value: string): void {
		this.value = value;
		this.changeCb?.(value);
	}
}
export class FakeText extends FakeSettingComponent {
	value = '';
	placeholder = '';
	/** Real TextComponent exposes its <input> — SC-112 Task 8's font renderer toggles
	 *  a visibility class on it (Custom… reveal), so the fake carries a real jsdom node. */
	inputEl: HTMLInputElement = (
		typeof document !== 'undefined' ? document.createElement('input') : null
	) as HTMLInputElement;
	setPlaceholder(placeholder: string): this {
		this.placeholder = placeholder;
		return this;
	}
	setValue(value: string): this {
		this.value = value;
		if (this.inputEl) this.inputEl.value = value;
		return this;
	}
	trigger(value: string): void {
		this.value = value;
		if (this.inputEl) this.inputEl.value = value;
		this.changeCb?.(value);
	}
}
export class FakeSlider extends FakeSettingComponent {
	value = 0;
	limits: { min: number; max: number; step: number } | null = null;
	dynamicTooltip = false;
	setLimits(min: number, max: number, step: number): this {
		this.limits = { min, max, step };
		return this;
	}
	setValue(value: number): this {
		this.value = value;
		return this;
	}
	setDynamicTooltip(): this {
		this.dynamicTooltip = true;
		return this;
	}
	trigger(value: number): void {
		this.value = value;
		this.changeCb?.(value);
	}
}
export class FakeButton {
	text = '';
	icon = '';
	cta = false;
	private clickCb: (() => any) | null = null;
	setButtonText(text: string): this {
		this.text = text;
		return this;
	}
	setIcon(icon: string): this {
		this.icon = icon;
		return this;
	}
	setCta(): this {
		this.cta = true;
		return this;
	}
	setTooltip(_tooltip: string): this {
		return this;
	}
	onClick(cb: () => any): this {
		this.clickCb = cb;
		return this;
	}
	click(): void {
		this.clickCb?.();
	}
}
export class Setting {
	/** All Settings constructed since the last reset — tests read rows from here
	 *  (reset with Setting.created.length = 0 in beforeEach). */
	static created: Setting[] = [];
	settingEl: HTMLElement | null;
	/** Real Setting exposes the right-hand control container — SC-112 Task 8's slider
	 *  renderer createSpans its percent readout into it. */
	controlEl: HTMLElement | null;
	/** Real Setting exposes the left-hand name/description container. SC-131's chrome
	 *  rows (the compendium safety sentence, the sync status line) render into it. */
	infoEl: HTMLElement | null;
	name = '';
	desc = '';
	heading = false;
	readonly toggles: FakeToggle[] = [];
	readonly dropdowns: FakeDropdown[] = [];
	readonly texts: FakeText[] = [];
	readonly buttons: FakeButton[] = [];
	readonly extraButtons: FakeButton[] = [];
	readonly sliders: FakeSlider[] = [];
	constructor(containerEl: any) {
		this.settingEl =
			typeof document !== 'undefined' && containerEl?.createDiv
				? containerEl.createDiv({ cls: 'setting-item' })
				: null;
		this.infoEl = this.settingEl
			? (this.settingEl as any).createDiv({ cls: 'setting-item-info' })
			: null;
		this.controlEl = this.settingEl
			? (this.settingEl as any).createDiv({ cls: 'setting-item-control' })
			: null;
		Setting.created.push(this);
	}
	setName(name: string): this {
		this.name = name;
		this.settingEl?.setAttribute('data-setting-name', name);
		return this;
	}
	setDesc(desc: string): this {
		this.desc = desc;
		return this;
	}
	setHeading(): this {
		this.heading = true;
		return this;
	}
	addText(cb?: (text: FakeText) => any): this {
		const c = new FakeText();
		this.texts.push(c);
		cb?.(c);
		return this;
	}
	addToggle(cb?: (toggle: FakeToggle) => any): this {
		const c = new FakeToggle();
		this.toggles.push(c);
		cb?.(c);
		return this;
	}
	addButton(cb?: (button: FakeButton) => any): this {
		const c = new FakeButton();
		this.buttons.push(c);
		cb?.(c);
		return this;
	}
	addExtraButton(cb?: (button: FakeButton) => any): this {
		const c = new FakeButton();
		this.extraButtons.push(c);
		cb?.(c);
		return this;
	}
	addDropdown(cb?: (dropdown: FakeDropdown) => any): this {
		const c = new FakeDropdown();
		this.dropdowns.push(c);
		cb?.(c);
		return this;
	}
	addSlider(cb?: (slider: FakeSlider) => any): this {
		const c = new FakeSlider();
		this.sliders.push(c);
		cb?.(c);
		return this;
	}
}

/**
 * SC-131: a faithful stand-in for obsidian 1.13's declarative settings host.
 *
 * The shape here is taken from the SHIPPED 1.13.4 bundle, not the .d.ts, because the two
 * disagree on the one thing that matters:
 *
 *   update()    { this.settingItems = this.getSettingDefinitions(); …refresh… }
 *   renderTab() { this.settingItems.length > 0 ? renderFromCache(this) : this.display() }
 *
 * `getSettingDefinitions()` is called ONLY from `update()` — at tab registration and
 * whenever the plugin asks. Re-rendering (opening the settings window again, navigating
 * between pages) replays the CACHED `settingItems`. The .d.ts comment "Called on every
 * display()" is simply false for 1.13.4.
 *
 * That distinction is load-bearing: a settings tab that tears resources down inside
 * getSettingDefinitions() looks fine on first render and silently breaks on every one
 * after. An earlier mock re-derived the definitions on each render and therefore asserted
 * the OPPOSITE of the real contract, which is exactly how that bug shipped green. Tests
 * must go through update() + renderTab().
 */
export class PluginSettingTab {
	app: App;
	plugin: any;
	containerEl: any = typeof document !== 'undefined' ? document.createElement('div') : null;
	/** The cache. Populated by update(), replayed by renderTab(). */
	settingItems: any[] = [];
	/** Cleanups returned by rendered `render` callbacks, invoked on teardown. */
	private renderedCleanups: (() => void)[] = [];
	/** Whether the tab is currently on screen — update() repaints only if it is. */
	private rendered = false;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	/** Default is an empty tree; DseSettingTab overrides it. */
	getSettingDefinitions(): any[] {
		return [];
	}

	/** Base behaviour: control keys name fields on `plugin.settings`. DseSettingTab
	 *  overrides this for PreferenceStore-backed keys and calls super for the rest. */
	getControlValue(key: string): unknown {
		return this.plugin?.settings?.[key];
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		if (this.plugin?.settings) this.plugin.settings[key] = value;
		return this.plugin?.saveSettings?.();
	}

	/** Re-reads the definitions into the cache and repaints the current page — the
	 *  ONLY caller of getSettingDefinitions(), matching 1.13.4's
	 *  `settingItems = getSettingDefinitions(); … refreshCurrentPage(this)`. When the
	 *  settings window is closed there is nothing on screen to repaint, so the cache
	 *  refresh happens alone. */
	update(): void {
		this.settingItems = this.getSettingDefinitions();
		if (this.rendered) this.renderTab();
	}

	/** Renders the CACHED definitions. Deliberately does NOT call
	 *  getSettingDefinitions() — that is the whole point of this mock. */
	renderTab(): void {
		this.closeTab();
		const container = this.containerEl as HTMLElement;
		if (container) container.innerHTML = '';
		this.rendered = true;
		this.renderDefs(container, this.settingItems);
	}

	/** Obsidian tears rendered rows down on page navigation and on settings close.
	 *  Order matters and matches 1.13.4's `closeActiveTab`: run every rendered row's
	 *  stored cleanup FIRST (`j2(n.renderedItems)`), then call the tab's `hide()`. */
	closeTab(): void {
		this.rendered = false;
		const cleanups = this.renderedCleanups;
		this.renderedCleanups = [];
		for (const cleanup of cleanups) cleanup();
		this.hide();
	}

	private renderDefs(container: HTMLElement, items: any[]): void {
		for (const def of items ?? []) {
			if (!def) continue;
			if (def.type === 'group' || def.type === 'page') {
				this.renderDefs(container, def.items ?? []);
				continue;
			}
			const setting = new Setting(container);
			if (def.name) setting.setName(def.name);
			if (typeof def.desc === 'string') setting.setDesc(def.desc);
			if (def.control) this.bindControl(setting, def.control);
			else if (def.render) this.storeCleanup(def.render(setting));
			else if (def.action) {
				setting.addButton((b) => b.setButtonText(def.name).onClick(() => def.action(setting.settingEl, 0)));
			}
		}
	}

	/**
	 * Mirrors obsidian's `v && (e.cleanup = v)` … `t()`: any TRUTHY return is kept and
	 * later invoked. Obsidian swallows the resulting TypeError into console.error; this
	 * throws instead, deliberately — a chainable builder accidentally returned from a
	 * render callback (`(s) => s.addButton(...)` returns the Setting) is a real defect,
	 * and a test harness should make it a failure rather than console noise.
	 */
	private storeCleanup(value: unknown): void {
		if (!value) return;
		if (typeof value !== 'function') {
			throw new TypeError(
				`render callback returned a non-function (${(value as object)?.constructor?.name ?? typeof value}); ` +
					'obsidian stores it as the row cleanup and calls it on teardown. Use a block body.',
			);
		}
		this.renderedCleanups.push(value as () => void);
	}

	private bindControl(setting: Setting, control: any): void {
		const read = (): any => this.getControlValue(control.key);
		const write = (value: unknown): void => void this.setControlValue(control.key, value);
		switch (control.type) {
			case 'toggle':
				setting.addToggle((t) => t.setValue(read() === true).onChange(write));
				break;
			case 'dropdown':
				setting.addDropdown((d) => {
					for (const [value, label] of Object.entries(control.options ?? {})) {
						d.addOption(value, label as string);
					}
					d.setValue(String(read() ?? '')).onChange(write);
				});
				break;
			case 'text':
			case 'file':
			case 'folder':
				setting.addText((t) => {
					if (control.placeholder) t.setPlaceholder(control.placeholder);
					t.setValue(String(read() ?? '')).onChange(write);
				});
				break;
			case 'slider':
				setting.addSlider((sl) =>
					sl
						.setLimits(control.min, control.max, control.step)
						.setValue(Number(read() ?? control.min))
						.setDynamicTooltip()
						.onChange(write),
				);
				break;
			default:
				throw new Error(`unhandled control type "${control.type}"`);
		}
	}

	display(): void {}
	hide(): void {}
}

/** D8 Task 1: minimal sidebar leaf — constructs the registered view via the plugin's
 *  factory (`Plugin.registerView`) and drives its `onOpen`/`onClose` lifecycle, matching
 *  real Obsidian's `WorkspaceLeaf.setViewState`/`detach` observable behavior closely enough
 *  for sidebar tests (never simulates real Electron pane layout). */
export class WorkspaceLeaf {
	view: ItemView | null = null;
	containerEl: HTMLElement;
	private state: { type: string; active?: boolean } = { type: 'empty' };

	constructor(private workspace: FakeWorkspace) {
		if (typeof document === 'undefined') {
			throw new Error('WorkspaceLeaf requires the jsdom test environment (put the test under test/dom/)');
		}
		this.containerEl = document.createElement('div');
	}

	async setViewState(state: { type: string; active?: boolean }): Promise<void> {
		if (this.view) {
			await (this.view as any).onClose();
			this.view.unload();
		}
		this.state = state;
		const factory = this.workspace._viewFactories.get(state.type);
		this.view = factory ? factory(this) : null;
		if (this.view) {
			this.view.load();
			await (this.view as any).onOpen();
			this.workspace._track(this);
		}
	}

	getViewState(): { type: string; active?: boolean } {
		return this.state;
	}

	// SC-135 phase 1: registerSccLinkClickHandling's already-open-popout sweep calls
	// `leaf.getContainer().doc`. The mock never models a real popout WorkspaceWindow (every
	// leaf lives in the one jsdom `document`), so this always returns that leaf's own
	// document — correct for "main window", which is all this mock can represent.
	getContainer(): { doc?: Document } {
		return { doc: this.containerEl.ownerDocument ?? undefined };
	}

	detach(): void {
		if (this.view) {
			// Fire onClose asynchronously but don't block on it (matching real Obsidian).
			(this.view as any).onClose().catch(() => {});
			this.view.unload();
		}
		this.workspace._untrack(this);
		this.view = null;
	}
}

/** D8 Task 1: was a bare `getViewType`-only stub — sidebar work (Task 2) needs the real
 *  `Component`-derived lifecycle (`load`/`unload`, `addChild` cascading) plus a real jsdom
 *  `containerEl` with the `.view-content` child real Obsidian always provides. */
export class ItemView extends Component {
	containerEl: HTMLElement;
	contentEl: HTMLElement;

	constructor(public leaf: WorkspaceLeaf) {
		super();
		if (typeof document === 'undefined') {
			throw new Error('ItemView requires the jsdom test environment (put the test under test/dom/)');
		}
		this.containerEl = document.createElement('div');
		this.contentEl = (this.containerEl as any).createDiv({ cls: 'view-content' });
	}

	getViewType(): string {
		return 'fake-item-view';
	}
	getDisplayText(): string {
		return '';
	}
	getIcon(): string {
		return 'document';
	}
	protected async onOpen(): Promise<void> {}
	protected async onClose(): Promise<void> {}
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
// FOLLOWUPS #27-fix-round finding 1: real Obsidian's setTooltip stamps `aria-label`
// (verified production behavior — `el.setAttribute("aria-label", text)`), NOT a
// `data-tooltip` attribute. The mock previously diverged (wrote `data-tooltip`), which
// hid a real accessible-name-clobbering bug (StaminaEditModal's Spend Recovery button
// kept a stale "No Recoveries remaining" aria-label after re-enabling, because the code
// cleared `data-tooltip` — an attribute production never set — instead of re-asserting
// the button's own label). Mirroring the real side effect here means any future
// call site that lets a tooltip clobber a control's accessible name fails its tests too.
export function setTooltip(el: HTMLElement, tooltip: string, _options?: any): void {
	el.setAttribute('aria-label', tooltip);
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
