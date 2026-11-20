// SC-671 — a counter write keeps the YAML keys the counter does not read (`note_to_self: keep me`, `extra: {a: 1}`), through every way the
// counter writes: the + and - buttons, a typed value (Enter, blur), a write after the plugin re-reads its own output or an outside edit,
// and the pinned sidebar card (which adds `_dse_anchor`). The counter has no reset and no schema, so its block edit form is the raw-YAML
// box: Save writes the text as typed and never goes through `serialize`. Harness: the REAL ElementPipeline over a REAL Reading-view host and
// a fake vault, so the write goes through the product's own splice (the montage X09/X10 shape); the sidebar half drives the real
// sendToSidebar stack (sidebarPendingSave.test.ts shape).
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Notice, Plugin, TFile, makeFakeContext, parseYaml } from '../../mocks/obsidian';
import { counterElement } from '../../../src/elements/counter/definition';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices } from '@/framework/sidebar/DseSidebarView';
import { sendToSidebar } from '@/framework/sidebar/registration';

const FENCE = /```ds-counter\n([\s\S]*?)\n```/g;
const blocksOf = (note: string): string[] => Array.from(note.matchAll(FENCE)).map((m) => m[1]);

/** The block the user wrote: a scalar, a nested map, a list and a null the counter does not read, and the counter's own keys between them. */
const OWN_BODY = [
	'note_to_self: keep me', 'name: Torches', 'max_value: 5', 'extra:', '  a: 1', '  deep:', '    - x', '    - y', 'current_value: 2', 'min_value: 0',
	'tags: [a, b]', 'nothing:', 'zz_last: 9',
].join('\n');
const OWN = `\`\`\`ds-counter\n${OWN_BODY}\n\`\`\``;
const NOTE = `# Own keys\n\nABOVE\n\n${OWN}\n\nBELOW\n`;
const UNKNOWN = { note_to_self: 'keep me', extra: { a: 1, deep: ['x', 'y'] }, tags: ['a', 'b'], nothing: null, zz_last: 9 };
const UNKNOWN_KEYS = ['note_to_self', 'extra', 'tags', 'nothing', 'zz_last'];

function makeDeps(app: App, plugin: Plugin): ElementPipelineDeps {
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	return {
		app: app as any, plugin: plugin as any, settings: DEFAULT_SETTINGS, theme: createThemeService(prefs, plugin as any), prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS), validation: createValidationService(), session: createSessionStore(), roll: createRollService(prefs),
	};
}

/** Mount block `index` of `note` through a REAL Reading-view host over a fake vault. `redraw()` mounts block `index` again from what the vault holds now,
 *  as Obsidian does after a write or an outside edit (a new parse, a new model). */
async function mountNote(note: string, index = 0) {
	jest.useFakeTimers();
	const app = new App();
	app.vault.setFile('Note.md', note);
	const plugin = new Plugin(app);
	const mount = async (): Promise<HTMLElement> => {
		const ctx = makeFakeContext(app, 'Note.md', index);
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter');
		await new ElementPipeline(makeDeps(app, plugin)).run(counterElement, blocksOf(app.vault.getContent('Note.md')!)[index], host);
		document.body.appendChild(host.containerEl);
		return host.containerEl.firstElementChild as HTMLElement;
	};
	let root = await mount();
	const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 50);
	return {
		app, flush, text: (): string => app.vault.getContent('Note.md')!,
		root: (): HTMLElement => root,
		redraw: async (): Promise<void> => { root = await mount(); },
	};
}

const ctl = <T extends HTMLElement = HTMLElement>(root: Element, id: string): T => {
	const el = root.querySelector<T>(`[data-dse-control="${id}"]`);
	if (!el) throw new Error(`no [data-dse-control="${id}"]`);
	return el;
};
const keyDown = (el: HTMLElement, key: string): void => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); };
const keysOf = (body: string): string[] => Object.keys(parseYaml(body));
const keyLines = (body: string, key: string): number => body.split('\n').filter((l) => new RegExp(`^${key}\\s*:`).test(l)).length;

afterEach(() => {
	jest.useRealTimers();
	document.body.innerHTML = '';
});

// ----------------------------------------------------------------------------- every write path

const PATHS: Array<[string, (root: HTMLElement) => void, number]> = [
	['the + button', (root) => ctl(root, 'counter.inc').click(), 3],
	['the - button', (root) => ctl(root, 'counter.dec').click(), 1],
	['a typed value and Enter', (root) => { const i = ctl<HTMLInputElement>(root, 'counter.input'); i.value = '4'; keyDown(i, 'Enter'); }, 4],
	['a typed value and blur', (root) => { const i = ctl<HTMLInputElement>(root, 'counter.input'); i.value = '3'; i.dispatchEvent(new Event('blur')); }, 3],
	['a typed value above the maximum (clamped)', (root) => { const i = ctl<HTMLInputElement>(root, 'counter.input'); i.value = '99'; keyDown(i, 'Enter'); }, 5],
];

describe('SC-671: every counter write keeps the keys the counter does not read', () => {
	test.each(PATHS)('[O09] %s keeps a scalar, a nested map, a list and a null, after the known keys, in their original order', async (_name, act, value) => {
		const { root, flush, text } = await mountNote(NOTE);
		act(root());
		await flush();
		const body = blocksOf(text())[0];
		const data = parseYaml(body);
		expect(data).toMatchObject({ ...UNKNOWN, name: 'Torches', max_value: 5, min_value: 0, current_value: value });
		expect(Object.keys(data)).toEqual(['max_value', 'current_value', 'min_value', 'name', ...UNKNOWN_KEYS]);
		expect(text().startsWith('# Own keys\n\nABOVE\n\n```ds-counter\n')).toBe(true);
		expect(text().endsWith('\n```\n\nBELOW\n')).toBe(true);
	});

	test('[O10] two counter blocks in one note: a press on the second leaves the first block\'s bytes alone and never moves a key across', async () => {
		const other = OWN.replace('note_to_self: keep me', 'note_to_self: the other counter').replace('zz_last: 9', 'zz_last: 10');
		const note = `ABOVE\n\n${other}\n\nBETWEEN\n\n${OWN}\n\nBELOW\n`;
		const { root, flush, text } = await mountNote(note, 1);
		ctl(root(), 'counter.inc').click();
		await flush();
		const [first, second] = blocksOf(text());
		expect(first).toBe(blocksOf(note)[0]);
		expect(parseYaml(second)).toMatchObject({ ...UNKNOWN, current_value: 3 });
		expect(parseYaml(second).note_to_self).toBe('keep me');
		expect(text().startsWith('ABOVE\n\n')).toBe(true);
		expect(text().endsWith('\n```\n\nBELOW\n')).toBe(true);
		expect(text().replace(second, '').length).toBe(note.replace(blocksOf(note)[1], '').length);
	});

	test('[O11] a second and a third press, in place and after the block is read again from the note, lose nothing', async () => {
		const m = await mountNote(NOTE);
		ctl(m.root(), 'counter.inc').click();
		ctl(m.root(), 'counter.inc').click(); // coalesced with the first into one write
		await m.flush();
		expect(parseYaml(blocksOf(m.text())[0])).toMatchObject({ ...UNKNOWN, current_value: 4 });
		ctl(m.root(), 'counter.inc').click(); // a press on the same live model after its own write
		await m.flush();
		expect(parseYaml(blocksOf(m.text())[0])).toMatchObject({ ...UNKNOWN, current_value: 5 });
		await m.redraw(); // the plugin reads its own output back
		ctl(m.root(), 'counter.dec').click();
		await m.flush();
		const data = parseYaml(blocksOf(m.text())[0]);
		expect(data).toMatchObject({ ...UNKNOWN, current_value: 4 });
		expect(Object.keys(data)).toEqual(['max_value', 'current_value', 'min_value', 'name', ...UNKNOWN_KEYS]);
	});

	test('[O12] an outside edit that adds a key and removes one, then a press: the written block holds the outside edit\'s keys, not the stale set', async () => {
		const m = await mountNote(NOTE);
		m.app.vault.setFile('Note.md', m.text().replace('tags: [a, b]\n', 'added_outside: 7\n').replace('zz_last: 9\n', ''));
		await m.redraw(); // Obsidian draws the changed block
		ctl(m.root(), 'counter.inc').click();
		await m.flush();
		const data = parseYaml(blocksOf(m.text())[0]);
		expect(data.added_outside).toBe(7);
		expect('tags' in data).toBe(false);
		expect('zz_last' in data).toBe(false);
		expect(data.note_to_self).toBe('keep me');
		expect(Object.keys(data)).toEqual(['max_value', 'current_value', 'min_value', 'name', 'note_to_self', 'extra', 'added_outside', 'nothing']);
	});
});

// ----------------------------------------------------------------------------- what the write must not add or move

describe('SC-671: the rest of the block is written as before', () => {
	test('[O13] SC-482 still holds with unknown keys present, and `value_height` / `name_height` are written once, never also as unknown keys', async () => {
		const note = '```ds-counter\nname: Torches\nmax_value: 5\nnote_to_self: keep me\n```';
		const a = await mountNote(note);
		ctl(a.root(), 'counter.inc').click();
		await a.flush();
		expect(blocksOf(a.text())[0]).toBe('max_value: 5\ncurrent_value: 1\nname: Torches\nnote_to_self: keep me'); // no min_value / value_height / name_height added
		document.body.innerHTML = '';
		const b = await mountNote('```ds-counter\nname: Torches\ncurrent_value: 1\nvalue_height: 4\nname_height: 2\nnote_to_self: keep me\n```');
		ctl(b.root(), 'counter.inc').click();
		await b.flush();
		const body = blocksOf(b.text())[0];
		expect(body).toBe('current_value: 2\nname: Torches\nvalue_height: 4\nname_height: 2\nnote_to_self: keep me');
		expect(keyLines(body, 'value_height')).toBe(1);
		expect(keyLines(body, 'name_height')).toBe(1);
	});

	test('[O14] the reserved wrapper keys (`prefs: compact`, `collapsed: yes`, a usable `prefs:` map) are written once each, ahead of the body, next to the unknown keys', async () => {
		const scalar = await mountNote('```ds-counter\nprefs: compact\ncollapsed: yes\nname: Torches\nnote_to_self: keep me\ncurrent_value: 1\n```');
		ctl(scalar.root(), 'counter.inc').click();
		await scalar.flush();
		let body = blocksOf(scalar.text())[0];
		expect(Object.keys(parseYaml(body))).toEqual(['prefs', 'collapsed', 'current_value', 'name', 'note_to_self']);
		expect(parseYaml(body)).toMatchObject({ prefs: 'compact', collapsed: 'yes', current_value: 2, note_to_self: 'keep me' });
		expect([keyLines(body, 'prefs'), keyLines(body, 'collapsed'), keyLines(body, 'note_to_self')]).toEqual([1, 1, 1]);
		document.body.innerHTML = '';
		const map = await mountNote('```ds-counter\nprefs:\n  sbDensity: compact\ncollapsed: true\nname: Torches\nnote_to_self: keep me\ncurrent_value: 1\n```');
		ctl(map.root(), 'counter.inc').click();
		await map.flush();
		body = blocksOf(map.text())[0];
		expect(Object.keys(parseYaml(body))).toEqual(['prefs', 'collapsed', 'current_value', 'name', 'note_to_self']);
		expect(parseYaml(body).prefs).toEqual({ sbDensity: 'compact' });
		expect([keyLines(body, 'prefs'), keyLines(body, 'collapsed'), keyLines(body, 'note_to_self')]).toEqual([1, 1, 1]);
	});

	test('[O15] keys that only look like the counter\'s own (`Name`, `maxValue`) and keys named like members or the prototype come back as plain keys; nothing is polluted', async () => {
		const note = '```ds-counter\nname: Torches\nName: Other\nmaxValue: 9\n__proto__:\n  polluted: yes\nconstructor: c\ntoString: s\nhasOwnProperty: h\ntoJSON: j\ncurrent_value: 1\n```';
		const { root, flush, text } = await mountNote(note);
		ctl(root(), 'counter.inc').click();
		await flush();
		const body = blocksOf(text())[0];
		const data = parseYaml(body);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(data).toMatchObject({ current_value: 2, name: 'Torches', Name: 'Other', maxValue: 9, constructor: 'c', toString: 's', hasOwnProperty: 'h', toJSON: 'j' });
		expect(body).toContain('polluted');
		expect(Object.keys(data)).toEqual(['current_value', 'name', 'Name', 'maxValue', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'toJSON']);
	});

	test('[O16] a counter with no unknown keys writes exactly what it wrote before', async () => {
		const { root, flush, text } = await mountNote('```ds-counter\nname: Health\nmax_value: 20\ncurrent_value: 10\nmin_value: 0\n```');
		ctl(root(), 'counter.inc').click();
		await flush();
		expect(blocksOf(text())[0]).toBe('max_value: 20\ncurrent_value: 11\nmin_value: 0\nname: Health');
	});
});

// ----------------------------------------------------------------------------- the pinned sidebar card

describe('SC-671: the pinned sidebar card keeps them too', () => {
	function setupSidebar() {
		const app = new App();
		const plugin = new Plugin(app);
		const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
		registerFrameworkElementDefinitions(frameworkV2.registry);
		const services = {
			app, plugin, pipeline: frameworkV2.pipeline, registry: frameworkV2.registry, refs: frameworkV2.services.refs,
			validation: frameworkV2.services.validation, prefs: frameworkV2.services.prefs,
		} as unknown as DseSidebarServices;
		plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
		const listeners: Array<(file: TFile) => void> = [];
		const vault = app.vault as unknown as { on: (n: string, cb: (...a: any[]) => any) => any; process: (f: TFile, fn: (d: string) => string) => Promise<string> };
		vault.on = (name, cb) => { if (name === 'modify') listeners.push(cb); return { unsubscribe: () => {} }; };
		const process = vault.process.bind(vault);
		vault.process = async (file, fn) => { const r = await process(file, fn); for (const cb of listeners.slice()) cb(file); return r; };
		return { app, services, fireModify: (file: TFile) => { for (const cb of listeners.slice()) cb(file); } };
	}
	const later = (ms: number): Promise<void> => jest.advanceTimersByTimeAsync(ms);
	async function pump<T>(p: Promise<T>): Promise<T> {
		let done = false;
		const finished = p.finally(() => { done = true; });
		while (!done) await jest.advanceTimersByTimeAsync(1);
		return finished;
	}
	async function pin(env: ReturnType<typeof setupSidebar>, content: string): Promise<HTMLElement> {
		env.app.vault.setFile('Session.md', content);
		await pump(sendToSidebar(env.services, 'Session.md', 'ds-counter'));
		await later(100);
		const view = env.app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0].view as unknown as DseSidebarView;
		if (!view.contentEl.isConnected) document.body.appendChild(view.contentEl);
		const panels = view.contentEl.querySelectorAll<HTMLElement>('.dse-sidebar__panel');
		return panels[panels.length - 1];
	}
	const SIDE_NOTE = `# Session\n\nABOVE\n\n${OWN}\n\nBELOW\n`;
	beforeEach(() => {
		jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
		Notice.notices.length = 0;
	});

	test('[O17] a press on the pinned card writes the block with `_dse_anchor` last of the counter\'s own keys and the unknown keys after it', async () => {
		const env = setupSidebar();
		const panel = await pin(env, SIDE_NOTE);
		ctl(panel, 'counter.inc').click();
		await later(600);
		const body = blocksOf(env.app.vault.getContent('Session.md')!)[0];
		const data = parseYaml(body);
		expect(data).toMatchObject({ ...UNKNOWN, current_value: 3 });
		const keys = Object.keys(data);
		expect(keys.slice(0, 4)).toEqual(['max_value', 'current_value', 'min_value', 'name']);
		expect(keys[4]).toBe('_dse_anchor'); // the pin stamped it; the card's write puts it back
		expect(keys.slice(5)).toEqual(UNKNOWN_KEYS);
		expect(env.app.vault.getContent('Session.md')!.startsWith('# Session\n\nABOVE\n\n```ds-counter\n')).toBe(true);
		expect(Notice.notices).toEqual([]);
	});

	test('[O18] an outside edit that adds a key, then a press on the card: the write has the outside edit\'s keys', async () => {
		const env = setupSidebar();
		const panel = await pin(env, SIDE_NOTE);
		const file = env.app.vault.getAbstractFileByPath('Session.md') as TFile;
		env.app.vault.setFile('Session.md', env.app.vault.getContent('Session.md')!.replace('zz_last: 9', 'zz_last: 9\nadded_outside: 7').replace('tags: [a, b]\n', ''));
		env.fireModify(file);
		await later(50);
		ctl(panel, 'counter.inc').click();
		await later(600);
		const data = parseYaml(blocksOf(env.app.vault.getContent('Session.md')!)[0]);
		expect(data).toMatchObject({ note_to_self: 'keep me', zz_last: 9, added_outside: 7, current_value: 3 });
		expect('tags' in data).toBe(false);
		expect(Notice.notices).toEqual([]);
	});
});
