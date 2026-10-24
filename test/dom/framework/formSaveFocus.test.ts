// SC-518 -- after the block edit form's Save redraws the card, keyboard focus goes to the redrawn card's
// Edit pencil (the control that opened the form), not <body>.
//
// SC-509 made Save redraw the card, so the root that held the pencil is gone when the form closes and the
// focus return lands on a detached node. The fix is the SC-505 hand-off (chrome/focusHandoff.ts): Save arms a
// one-shot request keyed by the block, and the rebuilt card claims it.
//
// Everything is the real path: the real pencil opens the real FormModal, Save goes through the real
// ReadingModeBlockHost / SidebarBlockHost.replaceSource, and the REGISTERED processor (Reading view) or the real
// SidebarPanel builds the new card. `rebuild` stands in for Obsidian replacing the changed section: the new
// section is built detached, then swapped in for the old one (which takes the focused node out of the document).
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry, type ElementDefinition } from '../../../src/framework/registry';
import { counterElement } from '../../../src/elements/counter/definition';
import { montageElement } from '../../../src/elements/montage/definition';
import { rollElement } from '../../../src/elements/roll/definition';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import * as FormModal from '../../../src/authoring/FormModal';
import { armFormFocus, claimChromeFocus, disarmChromeFocus } from '../../../src/framework/chrome/focusHandoff';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '../../../src/framework/sidebar/DseSidebarView';
import type { DseSidebarServices } from '../../../src/framework/sidebar/DseSidebarView';
import { sendToSidebar } from '../../../src/framework/sidebar/registration';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions, FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import { App, Plugin, Setting, flushAsync, makeFakeContext } from '../../mocks/obsidian';
import { makeEnv } from './_adoptionEnv';

function bodyOf(text: string, index = 0): string {
	const blocks = [...text.matchAll(/^```(ds-[\w-]+)\n([\s\S]*?)\n```$/gm)];
	return blocks[index][2];
}

async function flush(): Promise<void> {
	for (let i = 0; i < 30; i++) await Promise.resolve();
}

type FormHandle = { save(): Promise<void>; close(): void; body: HTMLElement };
type Ctx = ReturnType<typeof makeFakeContext>;

const PENCIL = '.dse-btn[aria-label^="Edit "]';
const NOTE_KEYS = ['Note.md::ds-montage::', 'Note.md::ds-counter::', 'Note.md::ds-stamina::', 'Note.md::ds-roll::'];

async function setup(note: string, defs: ElementDefinition[]) {
	const { deps, app, plugin } = makeEnv();
	await deps.prefs.set('authoringControls', true); // the Edit pencil
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(id, schema);
	app.vault.setFile('Note.md', note);
	plugin.load();
	const elements = createElementRegistry();
	for (const d of defs) elements.register(d);
	registerFrameworkElements(plugin as any, { registry: elements, pipeline: new ElementPipeline(deps) }, { viewAdoption: true });
	/** Build the note's `index`-th block as a fresh section (what Obsidian does for a changed section), still detached. */
	async function build(alias: string, index = 0, attached = false): Promise<Ctx> {
		const ctx = makeFakeContext(app, 'Note.md', index);
		if (attached) document.body.appendChild(ctx.el); // already in the document when its processor runs
		await plugin.registeredProcessors.get(alias)!(bodyOf(app.vault.getContent('Note.md')!, index), ctx.el, ctx as any);
		ctx.addedChildren.forEach((c) => c.load());
		return ctx;
	}
	/** First paint: build the section and put it in the document. */
	async function render(alias: string, index = 0): Promise<Ctx> {
		const ctx = await build(alias, index);
		document.body.appendChild(ctx.el);
		return ctx;
	}
	/** Obsidian's rebuild after a write: the new section is built detached, then replaces the old one. */
	async function rebuild(alias: string, old: Ctx, index = 0): Promise<Ctx> {
		const next = await build(alias, index);
		old.el.replaceWith(next.el);
		old.addedChildren.forEach((c) => c.unload());
		await flush();
		return next;
	}
	return { app, build, render, rebuild };
}

/** A short, readable stand-in for an element in a failure message (a DOM dump of <body> is thousands of lines). */
const who = (el: Element | null): string =>
	el === null ? 'null' : el === document.body ? '<body>' : `${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? ''}]${el.isConnected ? '' : ' (detached)'}`;
/** `el` holds focus. */
const focused = (el: Element): boolean => document.activeElement === el;
const rootOf = (ctx: Ctx): HTMLElement => ctx.el.firstElementChild as HTMLElement;
const pencilOf = (ctx: Ctx): HTMLElement => rootOf(ctx).querySelector<HTMLElement>(PENCIL)!;

/** Press the real pencil the way a keyboard (`detail 0`, the button holds focus) or a mouse (`detail 1`) does; hand back the real
 *  FormModal it opened. A pointer press does NOT focus the chrome pencil in Obsidian ('mouse'); 'mouse-focused' is a press that did. */
function openForm(root: HTMLElement, how: 'keyboard' | 'mouse' | 'mouse-focused' = 'keyboard'): () => FormHandle {
	let opened: FormHandle | undefined;
	const real = jest.requireActual('../../../src/authoring/FormModal').openFormEditor;
	jest.spyOn(FormModal, 'openFormEditor').mockImplementation((...a: any[]) => (opened = real(...a)));
	const pencil = root.querySelector<HTMLElement>(PENCIL);
	if (!pencil) throw new Error('no Edit pencil on the card');
	if (how !== 'mouse') pencil.focus(); // a Tab stop reached by key, or the focus a click gives the button
	pencil.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: how === 'keyboard' ? 0 : 1 }));
	return () => opened!;
}

function typeRaw(modal: FormHandle, from: string, to: string): void {
	const ta = modal.body.querySelector<HTMLTextAreaElement>('textarea.dse-form__raw')!;
	ta.value = ta.value.replace(from, to);
	ta.dispatchEvent(new Event('input'));
}

function findSetting(modal: FormHandle, name: string): Setting {
	const found = Setting.created.find((s) => s.name === name && s.settingEl && modal.body.contains(s.settingEl));
	if (!found) throw new Error(`no Setting row named "${name}"`);
	return found;
}

let focusCalls: Array<{ el: HTMLElement; opts: unknown }>;

beforeEach(() => {
	Setting.created.length = 0;
	focusCalls = [];
	const realFocus = HTMLElement.prototype.focus;
	jest.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
		focusCalls.push({ el: this, opts });
		return realFocus.call(this, opts);
	});
});

afterEach(() => {
	for (const key of NOTE_KEYS) for (const line of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) disarmChromeFocus(`${key}${line}`);
	jest.restoreAllMocks();
	document.body.innerHTML = '';
});

interface Case {
	name: string;
	def: ElementDefinition<any>;
	alias: string;
	note: string;
	edit(modal: FormHandle): void;
}

const CASES: Case[] = [
	{
		name: 'montage (raw box)',
		def: montageElement,
		alias: 'ds-montage',
		note: '# N\n\n```ds-montage\ntitle: The Heist\n```\n',
		edit: (m) => typeRaw(m, 'The Heist', 'Other Job'),
	},
	{
		name: 'stamina-bar (typed fields)',
		def: staminaBarElement,
		alias: 'ds-stamina',
		note: '# N\n\n```ds-stamina\nmax_stamina: 20\ncurrent_stamina: 15\n```\n',
		edit: (m) => findSetting(m, 'Current stamina').texts[0].trigger('7'),
	},
	{
		// No chrome panel: the pencil is the card-corner button, and the pipeline asks for the hand-back itself.
		name: 'roll (no chrome panel, card-corner pencil)',
		def: rollElement,
		alias: 'ds-roll',
		note: '# N\n\n```ds-roll\nname: Initiative\n```\n',
		edit: (m) => findSetting(m, 'Name').texts[0].trigger('Parley'),
	},
];

describe('SC-518: Reading view -- Save hands focus to the redrawn card\'s Edit pencil', () => {
	test.each(CASES)('$name: a keyboard-opened form -> the new root\'s pencil has focus, with the keyboard ring', async (c) => {
		const { render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1));
		c.edit(modal());
		await modal().save();
		await flush();
		expect(who(document.activeElement)).toBe('<body>'); // the form closed; nothing holds focus yet

		const ctx2 = await rebuild(c.alias, ctx1);

		expect(rootOf(ctx2)).not.toBe(rootOf(ctx1));
		expect(rootOf(ctx1).isConnected).toBe(false);
		expect(who(document.activeElement)).toBe(who(pencilOf(ctx2)));
		expect(focused(pencilOf(ctx2))).toBe(true);
		expect(rootOf(ctx2).contains(document.activeElement)).toBe(true);
		const onNew = focusCalls.filter((f) => f.el === pencilOf(ctx2));
		expect(onNew).toEqual([{ el: pencilOf(ctx2), opts: { preventScroll: true, focusVisible: true } }]);
	});

	test('the new section already in the document when its processor runs: the pencil is focused as soon as it exists', async () => {
		const c = CASES[0];
		const { build, render } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1));
		c.edit(modal());
		await modal().save();
		await flush();

		ctx1.el.remove(); // Obsidian drops the old section ...
		const ctx2 = await build(c.alias, 0, true); // ... and the new one is in place before its processor runs
		await flush();

		expect(who(document.activeElement)).toBe(who(pencilOf(ctx2)));
		expect(focused(pencilOf(ctx2))).toBe(true);
	});

	test('SC-518 r3 LOW-1: a mouse-opened form whose press never focused the pencil -> focus stays where it was (<body>), the pencil is not forced', async () => {
		const c = CASES[0];
		const { render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1), 'mouse');
		c.edit(modal());
		await modal().save();
		await flush();
		const ctx2 = await rebuild(c.alias, ctx1);

		expect(who(document.activeElement)).toBe('<body>');
		expect(focusCalls.filter((f) => f.el === pencilOf(ctx2))).toEqual([]);
	});

	test('a mouse-opened form whose press did focus the pencil -> the pencil is focused WITHOUT the keyboard ring (no focusVisible)', async () => {
		const c = CASES[0];
		const { render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1), 'mouse-focused');
		c.edit(modal());
		await modal().save();
		await flush();
		const ctx2 = await rebuild(c.alias, ctx1);

		expect(who(document.activeElement)).toBe(who(pencilOf(ctx2)));
		expect(focused(pencilOf(ctx2))).toBe(true);
		const onNew = focusCalls.filter((f) => f.el === pencilOf(ctx2));
		expect(onNew).toEqual([{ el: pencilOf(ctx2), opts: { preventScroll: true } }]);
	});

	test('hint scoped to the edited block: two same-kind blocks -> focus goes to the edited one, never its twin', async () => {
		const TWO =
			'# N\n\n```ds-counter\nname: A\ncurrent_value: 1\nmax_value: 20\nmin_value: 0\n```\n\n```ds-counter\nname: B\ncurrent_value: 7\nmax_value: 20\nmin_value: 0\n```\n';
		const { render, rebuild } = await setup(TWO, [counterElement]);
		const a1 = await render('ds-counter', 0);
		const b1 = await render('ds-counter', 1);
		const modal = openForm(rootOf(a1));
		typeRaw(modal(), 'name: A', 'name: A2');
		await modal().save();
		await flush();

		// Obsidian redraws the twin first, then the edited block.
		const b2 = await rebuild('ds-counter', b1, 1);
		expect(who(document.activeElement)).toBe('<body>'); // B's rebuild alone takes nothing
		const a2 = await rebuild('ds-counter', a1, 0);

		expect(who(document.activeElement)).toBe(who(pencilOf(a2)));
		expect(focused(pencilOf(a2))).toBe(true);
		expect(focused(pencilOf(b2))).toBe(false);
	});

	test('twin redrawn only (the edited block\'s section is not rebuilt): the twin is never focused', async () => {
		const TWO =
			'# N\n\n```ds-counter\nname: A\ncurrent_value: 1\nmax_value: 20\nmin_value: 0\n```\n\n```ds-counter\nname: B\ncurrent_value: 7\nmax_value: 20\nmin_value: 0\n```\n';
		const { render, rebuild } = await setup(TWO, [counterElement]);
		const a1 = await render('ds-counter', 0);
		const b1 = await render('ds-counter', 1);
		const modal = openForm(rootOf(a1));
		typeRaw(modal(), 'name: A', 'name: A2');
		await modal().save();
		await flush();
		const b2 = await rebuild('ds-counter', b1, 1);
		await flush();
		expect(focused(pencilOf(b2))).toBe(false);
		expect(who(document.activeElement)).toBe('<body>');
	});

	test('SC-518 r3 MEDIUM-1: identical twins, the UPPER one edited, its old section reused at the twin\'s place: focus goes to the edited card, not the twin', async () => {
		const TWINS =
			'# N\n\n```ds-counter\nname: Twin\ncurrent_value: 5\nmax_value: 20\nmin_value: 0\n```\n\n```ds-counter\nname: Twin\ncurrent_value: 5\nmax_value: 20\nmin_value: 0\n```\n';
		const { build, render } = await setup(TWINS, [counterElement]);
		const a1 = await render('ds-counter', 0);
		const b1 = await render('ds-counter', 1);
		const modal = openForm(rootOf(a1));
		typeRaw(modal(), 'name: Twin', 'name: Upper');
		await modal().save();
		await flush();

		// Obsidian matches sections by their text: the old upper section (old text) is now the lower block's, so it moves to
		// the twin's place, still in the document, and the closed form's focus return lands on its pencil.
		b1.el.replaceWith(a1.el);
		b1.addedChildren.forEach((c) => c.unload());
		pencilOf(a1).focus();
		expect(focused(pencilOf(a1))).toBe(true);
		const a2 = await build('ds-counter', 0); // the edited block gets a fresh section, inserted above
		a1.el.before(a2.el);
		await flush();

		expect(who(document.activeElement)).toBe(who(pencilOf(a2)));
		expect(focused(pencilOf(a2))).toBe(true);
		expect(rootOf(a1).contains(document.activeElement)).toBe(false);
		expect(focusCalls.filter((f) => f.el === pencilOf(a2))).toEqual([{ el: pencilOf(a2), opts: { preventScroll: true, focusVisible: true } }]);
	});

	test('SC-518 r3 LOW-2: the form opened inside an in-card write\'s debounce (the opener is read at the click, before the flush) -> the new pencil is focused after Save', async () => {
		jest.useFakeTimers();
		try {
			const COUNTER = '# N\n\n```ds-counter\nname: Health\ncurrent_value: 3\nmax_value: 20\nmin_value: 0\n```\n';
			const { app, build, render, rebuild } = await setup(COUNTER, [counterElement]);
			const ctx1 = await render('ds-counter');
			const root1 = rootOf(ctx1);
			(root1.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
			expect(app.vault.getContent('Note.md')).toContain('current_value: 3'); // the click's write is still pending

			const modal = openForm(root1); // keyboard press: the form waits for the flush, then opens
			await jest.advanceTimersByTimeAsync(0);
			await flush();
			expect(modal()).toBeDefined();
			expect(app.vault.getContent('Note.md')).toContain('current_value: 4'); // flushed first

			const ctx2 = await build('ds-counter'); // Obsidian's rebuild after the flush: the view's own write, adopted
			ctx1.el.replaceWith(ctx2.el);
			await flush();
			expect(rootOf(ctx2)).toBe(root1);

			typeRaw(modal(), 'Health', 'Wounds');
			await modal().save();
			await flush();
			const ctx3 = await rebuild('ds-counter', ctx2);

			expect(rootOf(ctx3)).not.toBe(root1);
			expect(who(document.activeElement)).toBe(who(pencilOf(ctx3)));
			expect(focused(pencilOf(ctx3))).toBe(true);
			expect(focusCalls.filter((f) => f.el === pencilOf(ctx3))).toEqual([{ el: pencilOf(ctx3), opts: { preventScroll: true, focusVisible: true } }]);
			expect(app.vault.getContent('Note.md')).toContain('current_value: 4');
		} finally {
			jest.useRealTimers();
		}
	});

	test('one-shot: after the focus landed and the user moved on, a later redraw of the block moves nothing', async () => {
		const c = CASES[0];
		const { render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1));
		c.edit(modal());
		await modal().save();
		await flush();
		const ctx2 = await rebuild(c.alias, ctx1);
		expect(who(document.activeElement)).toBe(who(pencilOf(ctx2)));
		expect(focused(pencilOf(ctx2))).toBe(true);

		const elsewhere = document.body.appendChild(document.createElement('button')); // the user Tabs to another control
		elsewhere.focus();
		const ctx3 = await rebuild(c.alias, ctx2); // an outside edit / Sync redraws the block

		expect(focused(elsewhere)).toBe(true);
		expect(focusCalls.filter((f) => f.el === pencilOf(ctx3))).toEqual([]);
	});

	test('one-shot: a redraw long after the hint lapsed leaves focus alone (nothing was left armed)', async () => {
		const c = CASES[0];
		const { render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1));
		c.edit(modal());
		await modal().save();
		await flush();
		const now = Date.now();
		jest.spyOn(Date, 'now').mockReturnValue(now + 60_000); // the redraw never came in time

		const ctx2 = await rebuild(c.alias, ctx1);

		expect(who(document.activeElement)).toBe('<body>');
		expect(focusCalls.filter((f) => f.el === pencilOf(ctx2))).toEqual([]);
	});

	test('Cancel: nothing is armed, so a later redraw of the block takes no focus', async () => {
		const c = CASES[0];
		const { render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1));
		c.edit(modal());
		modal().close(); // Cancel / Escape
		await flush();

		const ctx2 = await rebuild(c.alias, ctx1); // an outside redraw

		expect(who(document.activeElement)).toBe('<body>');
		expect(focusCalls.filter((f) => f.el === pencilOf(ctx2))).toEqual([]);
	});

	test('Save with nothing changed writes nothing and arms nothing: a later redraw takes no focus', async () => {
		const c = CASES[0];
		const { app, render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1));
		await modal().save();
		await flush();
		expect(app.vault.getContent('Note.md')).toBe(c.note);

		const ctx2 = await rebuild(c.alias, ctx1);

		expect(who(document.activeElement)).toBe('<body>');
		expect(focusCalls.filter((f) => f.el === pencilOf(ctx2))).toEqual([]);
	});

	test('a Save that cannot write (the block changed on disk) leaves the form open and the hint disarmed: a later rebuild takes no focus', async () => {
		const c = CASES[0];
		const { app, render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1));
		c.edit(modal());
		// An outside edit changed THIS block's body (the fence is still on the same line, so the block key is unchanged): the write is dropped.
		const changed = c.note.replace('The Heist', 'Changed Elsewhere');
		app.vault.setFile('Note.md', changed);
		await modal().save();
		await flush();
		expect(document.body.querySelector('.modal-container')).not.toBeNull(); // still open: no write happened
		expect(app.vault.getContent('Note.md')).toBe(changed);

		modal().close();
		expect(who(document.activeElement)).toBe('<body>');
		const ctx2 = await rebuild(c.alias, ctx1); // the block is redrawn for that outside edit, inside the hint's would-be window

		expect(who(document.activeElement)).toBe('<body>');
		expect(focusCalls.filter((f) => f.el === pencilOf(ctx2))).toEqual([]);
	});

	test('the note text outside the block is untouched by the focus hand-off', async () => {
		const c = CASES[0];
		const { app, render, rebuild } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const modal = openForm(rootOf(ctx1));
		c.edit(modal());
		await modal().save();
		await flush();
		await rebuild(c.alias, ctx1);
		expect(app.vault.getContent('Note.md')).toBe(c.note.replace('The Heist', 'Other Job'));
	});
});

describe('SC-518: sidebar -- Save from the panel\'s pencil hands focus to the panel\'s new pencil', () => {
	/** Real modify delivery on the mock vault (its `on` is a no-op stub): `process` fires after writing. */
	function withRealModifyEvents(app: App): void {
		const listeners: Array<(file: any) => void> = [];
		const vault = app.vault as unknown as {
			on: (name: string, cb: (...args: any[]) => any) => any;
			process: (file: any, fn: (data: string) => string) => Promise<string>;
		};
		vault.on = (name, cb) => {
			if (name === 'modify') listeners.push(cb);
			return { unsubscribe: () => {} };
		};
		const originalProcess = vault.process.bind(vault);
		vault.process = async (file, fn) => {
			const result = await originalProcess(file, fn);
			for (const cb of listeners.slice()) cb(file);
			return result;
		};
	}

	test('a keyboard-opened form from the panel: after Save the redrawn panel\'s pencil has focus', async () => {
		const app = new App();
		const plugin = new Plugin(app);
		const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
		registerFrameworkElementDefinitions(frameworkV2.registry);
		await frameworkV2.services.prefs.set('authoringControls', true);
		const services = {
			app,
			plugin,
			pipeline: frameworkV2.pipeline,
			registry: frameworkV2.registry,
			refs: frameworkV2.services.refs,
			validation: frameworkV2.services.validation,
			prefs: frameworkV2.services.prefs,
		} as unknown as DseSidebarServices;
		plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
		withRealModifyEvents(app);
		app.vault.setFile('Note.md', '# N\n\n```ds-counter\nname: Health\ncurrent_value: 3\nmax_value: 20\nmin_value: 0\n```\n');
		await sendToSidebar(services, 'Note.md', 'ds-counter');
		await flushAsync();
		const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0].view as unknown as DseSidebarView;
		document.body.appendChild(view.contentEl); // the sidebar leaf is in the document
		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		const root1 = panelEl.querySelector('[data-dse-element="counter"]') as HTMLElement;
		const oldPencil = root1.querySelector<HTMLElement>(PENCIL)!;

		const modal = openForm(root1);
		typeRaw(modal(), 'Health', 'Wounds');
		await modal().save();
		await flushAsync();
		await flush();

		expect(panelEl.textContent).toContain('Wounds'); // the panel was redrawn
		expect(oldPencil.isConnected).toBe(false);
		const root2 = panelEl.querySelector('[data-dse-element="counter"]') as HTMLElement;
		const newPencil = root2.querySelector<HTMLElement>(PENCIL)!;
		expect(newPencil).not.toBe(oldPencil);
		expect(who(document.activeElement)).toBe(who(newPencil));
		expect(focused(newPencil)).toBe(true);
	});
});

// The control that comes back is found by name inside the redrawn card, so it works for a control that is not a chrome item
// (ds-hero's own "Edit definition" button) and never takes a nested card's same-named button.
describe('SC-518: the redrawn card is searched for the control that opened the form', () => {
	const KEY = 'Note.md::ds-hero::3';
	const el = (parent: HTMLElement, tag: string, attrs: Record<string, string> = {}): HTMLElement => {
		const node = parent.appendChild(document.createElement(tag));
		for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
		return node;
	};
	/** A card root: an optional nested card (same-named button first in document order), the opener's replacement, the Edit pencil. */
	const card = (opts: { named?: boolean; pencil?: boolean; nested?: boolean }): { root: HTMLElement; named: HTMLElement | null; pencil: HTMLElement | null; nestedBtn: HTMLElement | null } => {
		const root = el(document.body, 'div', { 'data-dse-element': 'hero', 'data-dse-chrome': '' });
		const nested = opts.nested ? el(root, 'div', { 'data-dse-element': 'statblock' }) : null;
		const nestedBtn = nested ? el(nested, 'button', { 'aria-label': 'Edit definition' }) : null;
		const named = opts.named ? el(root, 'button', { 'aria-label': 'Edit definition' }) : null;
		const pencil = opts.pencil ? el(root, 'button', { 'aria-label': 'Edit Hero', 'data-dse-chrome-item': 'edit' }) : null;
		return { root, named, pencil, nestedBtn };
	};
	const arm = (keyboard: boolean): void => {
		const old = el(document.body, 'button', { 'aria-label': 'Edit definition' });
		armFormFocus(KEY, { pressed: old, keyboard });
		old.remove();
	};
	afterEach(() => disarmChromeFocus(KEY));

	test('a control that is no chrome item is found by its name; a nested card\'s same-named button is not taken', () => {
		arm(true);
		const { root, named, nestedBtn } = card({ named: true, nested: true, pencil: true });
		claimChromeFocus(() => KEY, root);
		expect(focused(named!)).toBe(true);
		expect(focused(nestedBtn!)).toBe(false);
	});

	test('its replacement is gone (the card has only the Edit pencil): the pencil takes focus', () => {
		arm(true);
		const { root, pencil } = card({ pencil: true });
		claimChromeFocus(() => KEY, root);
		expect(focused(pencil!)).toBe(true);
	});

	test('no control at all: the card itself takes focus (not a new tab stop), never <body>', () => {
		arm(true);
		const { root } = card({});
		claimChromeFocus(() => KEY, root);
		expect(focused(root)).toBe(true);
		expect(root.getAttribute('tabindex')).toBe('-1');
	});
});
