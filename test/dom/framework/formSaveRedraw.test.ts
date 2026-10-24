// SC-509 -- the block edit form's Save must redraw the card with the saved content.
//
// Before the fix every host write got a view-adoption claim ticket (Reading view) or a self-echo
// record (sidebar), whoever made it. The form's `cx.host.replaceSource` is not the view's own
// write, yet Obsidian's rebuild of the section then ADOPTED the old view (old root, old model),
// and the sidebar swallowed the change as its own echo. Result: the note had the new text and the
// card kept the old one until the note was reopened.
//
// Everything here is the real path: the real pencil opens the real FormModal, Save goes through
// the real ReadingModeBlockHost / SidebarBlockHost.replaceSource -> vault.process, and the
// REGISTERED processor (claim / adopt) or the real SidebarPanel handles the change.
import type { TFile } from 'obsidian';
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry, type ElementDefinition } from '../../../src/framework/registry';
import { counterElement } from '../../../src/elements/counter/definition';
import { montageElement } from '../../../src/elements/montage/definition';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import * as FormModal from '../../../src/authoring/FormModal';
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

type FormHandle = { save(): Promise<void>; body: HTMLElement; close(): void };

async function setup(note: string, defs: ElementDefinition[]) {
	const { deps, app, plugin } = makeEnv();
	await deps.prefs.set('authoringControls', true); // the Edit pencil
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) deps.validation.addDependencySchema(id, schema);
	app.vault.setFile('Note.md', note);
	plugin.load();
	const elements = createElementRegistry();
	for (const d of defs) elements.register(d);
	const registry = registerFrameworkElements(plugin as any, { registry: elements, pipeline: new ElementPipeline(deps) }, { viewAdoption: true });
	/** Render the note's first block as a fresh section: what Obsidian does for a changed section. */
	async function render(alias: string) {
		const ctx = makeFakeContext(app, 'Note.md', 0);
		await plugin.registeredProcessors.get(alias)!(bodyOf(app.vault.getContent('Note.md')!), ctx.el, ctx as any);
		ctx.addedChildren.forEach((c) => c.load());
		return ctx;
	}
	return { app, registry, render };
}

/** Click the real pencil and hand back the real FormModal it opened. */
function clickPencil(root: HTMLElement): { modal: () => FormHandle } {
	let opened: FormHandle | undefined;
	const real = jest.requireActual('../../../src/authoring/FormModal').openFormEditor;
	jest.spyOn(FormModal, 'openFormEditor').mockImplementation((...a: any[]) => (opened = real(...a)));
	const pencil = root.querySelector<HTMLElement>('.dse-btn[aria-label^="Edit "]');
	if (!pencil) throw new Error('no Edit pencil on the card');
	pencil.click();
	return { modal: () => opened! };
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

beforeEach(() => {
	Setting.created.length = 0;
});

afterEach(() => {
	jest.restoreAllMocks();
	document.body.innerHTML = '';
});

interface Case {
	name: string;
	def: ElementDefinition<any>;
	alias: string;
	note: string;
	oldText: string;
	newText: string;
	edit(modal: FormHandle): void;
}

const CASES: Case[] = [
	{
		name: 'montage (raw box)',
		def: montageElement,
		alias: 'ds-montage',
		note: '# N\n\n```ds-montage\ntitle: The Heist\n```\n',
		oldText: 'The Heist',
		newText: 'Other Job',
		edit: (m) => typeRaw(m, 'The Heist', 'Other Job'),
	},
	{
		name: 'counter (raw box)',
		def: counterElement,
		alias: 'ds-counter',
		note: '# N\n\n```ds-counter\nname: Health\ncurrent_value: 3\nmax_value: 20\nmin_value: 0\n```\n',
		oldText: 'Health',
		newText: 'Wounds',
		edit: (m) => typeRaw(m, 'Health', 'Wounds'),
	},
	{
		name: 'stamina-bar (typed fields)',
		def: staminaBarElement,
		alias: 'ds-stamina',
		note: '# N\n\n```ds-stamina\nmax_stamina: 20\ncurrent_stamina: 15\n```\n',
		oldText: '15/20',
		newText: '7/20',
		edit: (m) => findSetting(m, 'Current stamina').texts[0].trigger('7'),
	},
];

describe('SC-509: Reading view -- a form Save is NOT the view\'s own write', () => {
	test.each(CASES)('$name: after Save the rebuilt section shows the saved content (fresh root, no claim, no ticket)', async (c) => {
		const { app, registry, render } = await setup(c.note, [c.def]);
		const ctx1 = await render(c.alias);
		const root1 = ctx1.el.firstElementChild as HTMLElement;
		expect(root1.textContent).toContain(c.oldText);

		const { modal } = clickPencil(root1);
		c.edit(modal());
		await modal().save();
		await flush();
		expect(app.vault.getContent('Note.md')).not.toContain(c.oldText); // the write landed
		const ticketsAfterSave = registry.liveEntries()[0].tickets.length;

		const ctx2 = await render(c.alias); // Obsidian's rebuild of the changed section
		ctx1.addedChildren.forEach((ch) => ch.unload());
		await flush();
		const root2 = ctx2.el.firstElementChild as HTMLElement;

		expect(root2.textContent).toContain(c.newText);
		expect(root2.textContent).not.toContain(c.oldText);
		expect(root2).not.toBe(root1);
		expect(registry.stats.claims).toBe(0);
		expect(ticketsAfterSave).toBe(0); // a non-view write leaves no claim ticket behind
	});

	test('control: an in-card click is still the view\'s own write and still adopts the same root', async () => {
		jest.useFakeTimers();
		try {
			const { app, registry, render } = await setup(CASES[1].note, [counterElement]);
			const ctx1 = await render('ds-counter');
			const root1 = ctx1.el.firstElementChild as HTMLElement;
			(root1.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
			await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
			expect(app.vault.getContent('Note.md')).toContain('current_value: 4');
			expect(registry.liveEntries()[0].tickets).toHaveLength(1);

			const ctx2 = await render('ds-counter');
			expect(ctx2.el.firstElementChild).toBe(root1);
			expect(registry.stats.claims).toBe(1);
		} finally {
			jest.useRealTimers();
		}
	});
});

describe('SC-509: sidebar -- a form Save from the panel\'s pencil reaches the panel', () => {
	/** Real modify delivery on the mock vault (its `on` is a no-op stub): `process` fires after writing. */
	function withRealModifyEvents(app: App): void {
		const listeners: Array<(file: TFile) => void> = [];
		const vault = app.vault as unknown as {
			on: (name: string, cb: (...args: any[]) => any) => any;
			process: (file: TFile, fn: (data: string) => string) => Promise<string>;
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

	async function sidebarSetup() {
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
		return { app, services };
	}

	async function waitUntil(cond: () => boolean, what: string, capMs = 5000): Promise<void> {
		const t0 = Date.now();
		while (!cond()) {
			if (Date.now() - t0 > capMs) throw new Error(`timed out after ${capMs}ms waiting for ${what}`);
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}

	test('Save from the panel\'s pencil redraws the panel in place; the view\'s own write is still swallowed as its echo', async () => {
		const { app, services } = await sidebarSetup();
		app.vault.setFile('Note.md', '# N\n\n```ds-counter\nname: Health\ncurrent_value: 3\nmax_value: 20\nmin_value: 0\n```\n');
		await sendToSidebar(services, 'Note.md', 'ds-counter');
		await flushAsync();
		const view = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0].view as unknown as DseSidebarView;
		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		const root1 = panelEl.querySelector('[data-dse-element="counter"]') as HTMLElement;
		expect(root1.textContent).toContain('Health');

		const { modal } = clickPencil(root1);
		typeRaw(modal(), 'Health', 'Wounds');
		await modal().save();
		await flushAsync();

		expect(app.vault.getContent('Note.md')).toContain('name: Wounds');
		expect(panelEl.textContent).toContain('Wounds'); // handleExternalChange ran
		expect(panelEl.textContent).not.toContain('Health');

		// The view's own write (in-card click) must still be swallowed: no external-change redraw,
		// so the mounted root is the same node.
		const root2 = panelEl.querySelector('[data-dse-element="counter"]') as HTMLElement;
		const before = app.vault.getContent('Note.md');
		(root2.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await waitUntil(() => app.vault.getContent('Note.md') !== before, 'the debounced persist to write the note');
		await flushAsync();
		expect(app.vault.getContent('Note.md')).toContain('current_value: 4');
		expect(panelEl.querySelector('[data-dse-element="counter"]')).toBe(root2);
		expect(panelEl.textContent).toContain('Wounds');
	});
});
