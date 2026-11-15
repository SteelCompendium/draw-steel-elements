// SC-443 e2e driver: the editor insert paths (src/authoring): the insert commands, the `/ds` suggest, the in-fence key / enum autocomplete and
// the compendium search window. Everything is real input (wdio keys and CDP pointer events through chromedriver) into a real CodeMirror
// editor in a real Obsidian; the note FILE is what the specs assert (plus the screen: the suggestion rows, the search window, the rendered block).
//
// New file on purpose (SC-442 shares driver/dse.ts): it builds on dse.ts / state.ts / cleanup.ts / page.ts without editing them.
//   - Notes are SEEDED by the spec (`openEditor`), so the exact bytes under test are in the spec, not in a fixture file; the vault reset at the
//     next `dse.openNote` deletes them (they are not in vaults/shipped/).
//   - A command is run through Obsidian's COMMAND PALETTE with real keys (`palette`): the pair `authoring.cmd.<id> x palette` is credited only
//     after the palette really ran it. `app.commands.executeCommandById` never counts.
//   - The suggesters take no DOM focus (it stays in the editor), so a key for the open list is credited to the SELECTED ROW's id, and only when the
//     list is open and that row carries a manifest id (`pressList`).
//   - The compendium fixture (`installCompendium`) is copied from test/fixtures/md-dse into the vault at run time and absent otherwise.
import { browser } from '@wdio/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { waitWriteIdle } from './cleanup';
import { dse } from './dse';
import { ev, waitFor } from './page';
import { recordDrive, state } from './state';

export type EditMode = 'live-preview' | 'source';
export interface Pos {
	line: number;
	ch: number;
}

/** Page-side: the markdown view in the active leaf (the one the spec opened). */
const VIEW = `app.workspace.getMostRecentLeaf().view`;
const STAMINA = 'Stamina/basic.md';
const FIXTURES_ROOT = path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'md-dse');

// ------------------------------------------------------------------------------------- the editor

/**
 * Reset the vault (through `dse.openNote`, which also closes everything and marks the recorders), seed `rel` with exactly `text`, open it in
 * Live Preview or Source mode with the cursor at `cursor` (and `to`, for a selection), and give the editor keyboard focus.
 * The note is the test's own: the invariants skip it (not a fixture) and the spec asserts its bytes.
 */
export async function openEditor(rel: string, text: string, mode: EditMode, cursor: Pos = { line: 0, ch: 0 }, to?: Pos): Promise<void> {
	await escapePrompts(); // a test that failed with the palette or the search window open must not hang the next one (they have no X for closeModals)
	await dse.openNote(STAMINA);
	// The vault reset deletes files, not folders: a compendium folder left behind by an earlier test would make a Sync open the "Existing
	// compendium folder found" window (SC-441's surface), so take the whole destination folder away.
	await ev(`(async () => {
		const stale = app.vault.getAbstractFileByPath(app.plugins.plugins['draw-steel-elements'].settings.compendiumDestinationDirectory);
		if (stale) await app.vault.delete(stale, true);
	})()`);
	await ev(`(async () => {
		const dir = ${JSON.stringify(rel)}.slice(0, ${JSON.stringify(rel)}.lastIndexOf('/'));
		if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
		await app.vault.create(${JSON.stringify(rel)}, ${JSON.stringify(text)});
	})()`);
	await openIn(rel, mode);
	await ev(`(() => { const e = ${VIEW}.editor; e.setSelection(${JSON.stringify(cursor)}, ${JSON.stringify(to ?? cursor)}); e.focus(); return true; })()`);
	await waitFor(`!!document.activeElement?.closest('.cm-content')`, 'the editor to take focus');
	state.currentNote = rel;
}

/** Close every open prompt window (the command palette, the compendium search) with Escape. */
export async function escapePrompts(): Promise<void> {
	for (let i = 0; i < 4 && (await ev<boolean>(`!!document.querySelector('.modal-container .prompt')`)); i++) {
		await browser.keys('Escape');
		await browser.pause(100);
	}
}

/** Open `rel` in the open leaf (`dse.openNote` left one) in the given mode; waits until the editor (or the reading view) is there. */
export async function openIn(rel: string, mode: EditMode | 'reading'): Promise<void> {
	const viewState = mode === 'reading' ? `{ mode: 'preview' }` : `{ mode: 'source', source: ${mode === 'source'} }`;
	await ev(`(async () => {
		const leaf = app.workspace.getMostRecentLeaf() ?? app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(rel)}, ...${viewState} }, active: true });
		app.workspace.setActiveLeaf(leaf, { focus: true });
	})()`);
	const scope = mode === 'reading' ? '.markdown-reading-view' : mode === 'source' ? '.markdown-source-view:not(.is-live-preview) .cm-content' : '.markdown-source-view.is-live-preview .cm-content';
	await waitFor(`(() => { const v = ${VIEW}; return v?.file?.path === ${JSON.stringify(rel)} && !!v.containerEl.querySelector(${JSON.stringify(scope)}); })()`, `${rel} to open in ${mode}`);
}

/** Switch the open note to Reading view and wait until it has drawn (the blocks, if any, are mounted). */
export async function toReading(rel: string): Promise<void> {
	await waitSaved();
	await openIn(rel, 'reading');
	await waitWriteIdle();
}

/** The editor's text and cursor / selection, as the editor holds them. */
export const editorState = (): Promise<{ value: string; cursor: Pos; from: Pos; to: Pos }> =>
	ev(`(() => { const e = ${VIEW}.editor; return { value: e.getValue(), cursor: e.getCursor(), from: e.getCursor('from'), to: e.getCursor('to') }; })()`);

/** Save the open note now (Obsidian saves an edit after a delay) and return the FILE's text. */
export async function savedText(rel: string): Promise<string> {
	return ev<string>(`(async () => { await ${VIEW}.save(); return await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(rel)})); })()`);
}

/** Wait until the editor's text is what the file holds (nothing left to save). */
export async function waitSaved(): Promise<void> {
	await ev(`(async () => { await ${VIEW}.save(); return true; })()`);
}

/** Real keys into the editor (focus must be there): `\n` is Enter. Credits `type` on `credit` (an authoring trigger id) when given. */
export async function typeKeys(text: string, credit?: string): Promise<void> {
	const keys = text.split('').map((c) => (c === '\n' ? 'Enter' : c));
	await browser.keys(keys);
	if (credit) recordDrive(credit, 'type');
}

/** Put the editor cursor (or selection) somewhere by script and give the editor focus back. */
export async function setCursor(cursor: Pos, to?: Pos): Promise<void> {
	await ev(`(() => { const e = ${VIEW}.editor; e.setSelection(${JSON.stringify(cursor)}, ${JSON.stringify(to ?? cursor)}); e.focus(); return true; })()`);
	await waitFor(`!!document.activeElement?.closest('.cm-content')`, 'the editor to take focus');
}

/** Leave a block in Live Preview (cursor to line 0) so it draws as an element, then wait for the element roots to be mounted. */
export async function leaveBlock(expectRoots: number): Promise<void> {
	await ev(`(() => { ${VIEW}.editor.setCursor({ line: 0, ch: 0 }); return true; })()`);
	await waitFor(`document.querySelectorAll('.workspace-leaf.mod-active .cm-content [data-dse-element]').length >= ${expectRoots}`, `${expectRoots} block(s) to draw in Live Preview`);
	await waitWriteIdle();
}

/** What the open view drew: element roots and error cards (a block refused at parse), Live Preview or Reading view. */
export async function drawn(where: 'live-preview' | 'reading'): Promise<{ roots: string[]; errors: string[] }> {
	const scope = where === 'reading' ? '.workspace-leaf.mod-active .markdown-reading-view' : '.workspace-leaf.mod-active .cm-content';
	return ev(`(() => {
		const all = Array.from(document.querySelectorAll(${JSON.stringify(scope)} + ' [data-dse-element]')).filter((r) => !r.parentElement.closest('[data-dse-element]'));
		return { roots: all.map((r) => r.getAttribute('data-dse-element')), errors: all.filter((r) => r.hasAttribute('data-dse-error-stage')).map((r) => r.getAttribute('data-dse-element')) };
	})()`);
}

// ------------------------------------------------------------------------------- the command palette

/**
 * Run command `id` (`insert-counter`) through the command palette with real keys: Ctrl+P, the command's name, Enter. Fails if the palette's
 * selected row is not that command. `opensSearch`: the command opens the compendium search window, so the call returns with it open. Credits
 * `authoring.cmd.<id> x palette` after the palette ran it.
 */
export async function palette(id: string, name: string, opts: { opensSearch?: boolean } = {}): Promise<void> {
	await browser.keys(['Control', 'p']);
	await waitFor(`!!document.querySelector('.modal-container .prompt .prompt-input')`, 'the command palette to open');
	await browser.keys(name.split(''));
	const shown = `(() => { const s = document.querySelector('.modal-container .prompt .suggestion-item.is-selected'); return s ? s.textContent : ''; })()`;
	await waitFor(`${shown}.includes(${JSON.stringify(name)})`, `the palette to select "${name}"`);
	let selected = await ev<string>(shown);
	// "Feature" is a prefix of "Featureblock": the palette ranks the exact name first, but walk down if it does not.
	for (let i = 0; i < 3 && !selected.endsWith(name); i++) {
		await browser.keys('ArrowDown');
		selected = await ev<string>(shown);
	}
	if (!selected.endsWith(name)) throw new Error(`the palette selected "${selected}", not "${name}"`);
	await browser.keys('Enter');
	if (opts.opensSearch) await waitFor(`!!document.querySelector('[data-dse-control="authoring.search.input"]')`, 'the compendium search window to open');
	else await waitFor(`document.querySelectorAll('.modal-container').length === 0`, 'the palette to close');
	recordDrive(`authoring.cmd.${id}`, 'palette');
}

/** Type a query into the command palette and read the rows it offers (then Escape). Records nothing: it only looks. */
export async function paletteRows(query: string): Promise<string[]> {
	await browser.keys(['Control', 'p']);
	await waitFor(`!!document.querySelector('.modal-container .prompt .prompt-input')`, 'the command palette to open');
	await browser.keys(query.split(''));
	await browser.waitUntil(async () => (await ev<boolean>(`document.querySelectorAll('.modal-container .prompt .suggestion-item').length >= 0`)), { timeout: 3000 });
	// the palette filters on every key: wait for the list to settle (the same rows on two reads)
	let last = '';
	await browser.waitUntil(
		async () => {
			const now = JSON.stringify(await ev<string[]>(`Array.from(document.querySelectorAll('.modal-container .prompt .suggestion-item')).map((r) => r.textContent)`));
			const same = now === last;
			last = now;
			return same;
		},
		{ timeout: 4000, interval: 150, timeoutMsg: 'the palette list never settled' },
	);
	const rows = JSON.parse(last) as string[];
	await browser.keys('Escape');
	await waitFor(`document.querySelectorAll('.modal-container').length === 0`, 'the palette to close');
	return rows;
}

/** Every `draw-steel-elements:insert-*` command the plugin registered (a read of the command registry, not a run). */
export const insertCommandIds = (): Promise<string[]> =>
	ev(`Object.keys(app.commands.commands).filter((c) => c.startsWith('draw-steel-elements:insert-')).map((c) => c.slice('draw-steel-elements:'.length)).sort()`);

// ------------------------------------------------------------------------------- the editor suggesters

export interface ListRow {
	id: string | null;
	text: string;
	selected: boolean;
}

/** The rows of the open EditorSuggest popup (`.suggestion-container`), in order. Empty when no popup is open. */
export const listRows = (): Promise<ListRow[]> =>
	ev(`Array.from(document.querySelectorAll('body > .suggestion-container .suggestion-item')).map((r) => ({ id: r.getAttribute('data-dse-control'), text: r.textContent, selected: r.classList.contains('is-selected') }))`);

/** Wait until the popup is open and shows `n` rows (any number when omitted); returns them. */
export async function waitList(n?: number): Promise<ListRow[]> {
	await browser.waitUntil(async () => {
		const rows = await listRows();
		return n === undefined ? rows.length > 0 : rows.length === n;
	}, { timeout: 6000, interval: 60, timeoutMsg: `the suggestion list never showed ${n ?? 'any'} row(s)` });
	return listRows();
}

/** Wait until NO popup row is on screen, and stay that way for two reads (a closed popup can still be fading out). */
export async function waitNoList(): Promise<void> {
	let quiet = 0;
	await browser.waitUntil(async () => {
		quiet = (await listRows()).length === 0 ? quiet + 1 : 0;
		return quiet >= 3;
	}, { timeout: 6000, interval: 80, timeoutMsg: 'a suggestion list is still open' });
}

/**
 * After an accept: Obsidian re-runs the triggers at the new cursor, so a list can be open again (the key list over a freshly inserted block, the
 * accepted key offered once more). Dismiss it with a raw Escape (a page key, no coverage credited), then wait until it is gone.
 */
export async function closeList(): Promise<void> {
	// The re-trigger runs on the editor's next update, not inside the accept: give the list up to a second to show (it does not for an element
	// without a schema), then dismiss whatever is open. Without this wait a following Enter would accept the late list instead of adding a line.
	await browser
		.waitUntil(async () => (await listRows()).length > 0, { timeout: 1000, interval: 50 })
		.catch(() => undefined);
	if ((await listRows()).length > 0) await browser.keys('Escape');
	await waitNoList();
}

/**
 * A key for the open popup (the editor keeps focus, Obsidian's keymap Scope takes ArrowUp / ArrowDown / Enter / Escape). The recipient is the
 * SELECTED row: it must carry a manifest id, which is credited with `press:<key>` after the key went.
 */
export async function pressList(key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape'): Promise<void> {
	const sel = (await listRows()).find((r) => r.selected);
	if (!sel?.id) throw new Error(`pressList(${key}): no open suggestion list with a selected, identified row`);
	await browser.keys(key);
	recordDrive(sel.id, `press:${key}`);
}

/** A real pointer click on the n-th row of the popup with control id `id`. */
export async function clickRow(id: string, nth: number): Promise<void> {
	await dse.click(dse.control(id, { nth }));
}

// ------------------------------------------------------------------------------- the search window

export interface SearchRow {
	id: string | null;
	name: string;
	type: string;
	source: string;
	code: string;
	hint: string;
	selected: boolean;
}

/** The compendium search window's result rows, in order. */
export const searchRows = (): Promise<SearchRow[]> =>
	ev(`Array.from(document.querySelectorAll('.modal-container .prompt-results .suggestion-item')).map((r) => {
		const t = (sel) => r.querySelector(sel)?.textContent ?? '';
		return { id: r.getAttribute('data-dse-control'), name: t('.dse-compendium-suggest__name') || t('.dse-compendium-suggest__title'), type: t('.dse-compendium-suggest__type'), source: t('.dse-compendium-suggest__source'), code: t('.dse-compendium-suggest__code'), hint: t('.dse-compendium-suggest__hint'), selected: r.classList.contains('is-selected') };
	})`);

/** Type a query into the open search window (real keys into its input) and wait for the rows to settle on `n` (any when omitted). */
export async function searchFor(query: string, n?: number): Promise<SearchRow[]> {
	const input = dse.control('authoring.search.input');
	await dse.type(input, query, { replace: true });
	await browser.waitUntil(async () => (n === undefined ? true : (await searchRows()).length === n), { timeout: 6000, interval: 60, timeoutMsg: `the search window never showed ${n} row(s) for "${query}"` });
	return searchRows();
}

/** A real pointer click on the n-th search row with the given modifier held (CDP mouse events with the modifier bits: Shift 8, Control 2). */
export async function modifierClick(nth: number, modifier: 'Shift' | 'Control'): Promise<void> {
	const el = dse.control('authoring.search.result', { nth });
	await el.waitForDisplayed({ timeout: 8000 });
	const loc = await el.getLocation();
	const size = await el.getSize();
	const x = loc.x + size.width / 2;
	const y = loc.y + size.height / 2;
	const modifiers = modifier === 'Shift' ? 8 : 2;
	const base = { x, y, button: 'left', clickCount: 1, modifiers };
	await browser.sendCommandAndGetResult('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
	await browser.sendCommandAndGetResult('Input.dispatchMouseEvent', { type: 'mousePressed', buttons: 1, ...base });
	await browser.sendCommandAndGetResult('Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...base });
	recordDrive('authoring.search.result', `click:${modifier}`);
}

/** Wait for the search window to be gone. */
export const waitSearchClosed = (): Promise<void> => waitFor(`!document.querySelector('.modal-container')`, 'the search window to close');

// --------------------------------------------------------------------------------- the compendium

/** The 13 files (test/fixtures/md-dse, the jest set) the compendium specs search: see test/dom/authoring/compendiumInsertMatrix.test.ts. */
export const COMPENDIUM_FILES = [
	'kit/panther.md',
	'kit/mountain.md',
	'condition/bleeding.md',
	'monster/goblin/statblock/goblin-stinker.md',
	'monster/goblin/statblock/skitterling.md',
	'monster/retainer/gnoll-gnasher.md',
	'monster/devil/devil-malice.md',
	'feature/ability/shadow/level-1/coat-the-blade.md',
	'feature/fury/level-1/growing-ferocity.md',
	'feature/companion/beastheart/lightbender/level-3/hit-and-run.md',
	'feature/ability/fury/level-1/hit-and-run.md',
	'rule/combat/turn.md',
	'monster/companion/beastheart/statblock/panther.md',
] as const;
export const KIT = 'mcdm.heroes.v1/kit/panther';
export const GOBLIN = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
export const MALICE = 'mcdm.monsters.v1/monster.devil/devil-malice';
export const ABILITY = 'mcdm.heroes.v1/feature.ability.shadow.level-1/coat-the-blade';

/** Copy the fixture compendium into the vault (in this order: the index lists in it) and wait until the plugin's index holds all of it. */
export async function installCompendium(): Promise<void> {
	const files = COMPENDIUM_FILES.map((rel) => [rel, fs.readFileSync(path.join(FIXTURES_ROOT, rel), 'utf8')] as const);
	await ev(`(async () => {
		const root = app.plugins.plugins['draw-steel-elements'].settings.compendiumDestinationDirectory;
		for (const [rel, text] of ${JSON.stringify(files)}) {
			const full = root + '/' + rel;
			const dir = full.slice(0, full.lastIndexOf('/'));
			let at = '';
			for (const part of dir.split('/')) { at = at ? at + '/' + part : part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); }
			await app.vault.create(full, text);
		}
	})()`);
	await waitFor(`app.plugins.plugins['draw-steel-elements'].compendiumIndex.query('').length === ${files.length}`, `the compendium index to hold ${files.length} entries`);
}

/** How many entries the plugin's index holds right now. */
export const indexedCount = (): Promise<number> => ev<number>(`app.plugins.plugins['draw-steel-elements'].compendiumIndex.query('').length`);

// ------------------------------------------------------------------------------------ expectations

/**
 * The scaffold the plugin should insert for an element, read from the element's own `example.yaml` (the data the scaffold is built from), so
 * the spec's expectation does not come out of the code under test: the fence opener `alias`, the body, the closing fence. No trailing newline.
 */
export function scaffoldOf(dir: string, alias: string): string {
	// An element whose example is empty (ds-hr) gets scaffold.ts's placeholder comment line instead.
	const body = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'elements', dir, 'example.yaml'), 'utf8').replace(/\n+$/, '') || '# fill in fields';
	return '```' + alias + '\n' + body + '\n```';
}

/** The position `text` ends at when it starts at `from` (lines and columns, `\n` only). */
export function endOf(from: Pos, text: string): Pos {
	const lines = text.split('\n');
	return lines.length === 1 ? { line: from.line, ch: from.ch + text.length } : { line: from.line + lines.length - 1, ch: lines[lines.length - 1].length };
}

/**
 * A key typed into the search window's input (it holds focus): credits `authoring.search.input x press:<key>`; Enter on the Sync row also
 * credits `authoring.search.sync x press:Enter` (the key's recipient is the selected row).
 */
export async function pressSearch(key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape'): Promise<void> {
	const selected = (await searchRows()).find((r) => r.selected);
	await dse.press(key, dse.control('authoring.search.input'));
	if (key === 'Enter' && selected?.id === 'authoring.search.sync') recordDrive('authoring.search.sync', 'press:Enter');
}

/** The index (0-based) of the selected row of the search window, or -1. */
export const selectedSearchRow = async (): Promise<number> => (await searchRows()).findIndex((r) => r.selected);

/** The index of the selected row of the EditorSuggest popup, or -1. */
export const selectedListRow = async (): Promise<number> => (await listRows()).findIndex((r) => r.selected);

/** `before` with [from, to) replaced by `insert`: the note a correct insert leaves (positions are lines and columns, `\n` only). */
export function spliced(before: string, from: Pos, to: Pos | undefined, insert: string): string {
	const at = (p: Pos): number => before.split('\n').slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.ch;
	return before.slice(0, at(from)) + insert + before.slice(at(to ?? from));
}
