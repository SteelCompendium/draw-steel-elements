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
	addSettingTab(_tab: any): void {}
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
	setPlaceholder(placeholder: string): this {
		this.placeholder = placeholder;
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
	name = '';
	desc = '';
	heading = false;
	readonly toggles: FakeToggle[] = [];
	readonly dropdowns: FakeDropdown[] = [];
	readonly texts: FakeText[] = [];
	readonly buttons: FakeButton[] = [];
	readonly extraButtons: FakeButton[] = [];
	constructor(containerEl: any) {
		this.settingEl =
			typeof document !== 'undefined' && containerEl?.createDiv
				? containerEl.createDiv({ cls: 'setting-item' })
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
