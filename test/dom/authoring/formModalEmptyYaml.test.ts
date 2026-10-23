// SC-493 -- the block edit form's raw-YAML box must check and preview the SAME data the render
// pipeline hands the element after Save. Counter / negotiation / party / encounter open the raw box
// (no field form); before the fix an emptied box passed the form's check as `{}`
// (`parseYaml(raw) ?? {}`) while the pipeline gave the element `null`, so Save wrote an empty
// body and the block re-rendered as an error card.
//
// Everything here is the real path: the real pencil opens the real FormModal, Save goes through
// the real ReadingModeBlockHost.replaceSource -> vault.process, and the written note is
// re-rendered through the real ElementPipeline on a fresh host.
import { parseYaml } from 'obsidian';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementDefinition } from '@/framework/registry';
import { ReadingModeBlockHost } from '@/framework/host/ReadingModeBlockHost';
import { counterElement } from '@/elements/counter/definition';
import { negotiationElement } from '@/elements/negotiation/definition';
import { partyElement } from '@/elements/party/definition';
import { encounterElement } from '@/elements/encounter/definition';
import { montageElement } from '@/elements/montage/definition';
import { projectElement } from '@/elements/project/definition';
import { valuesRowElement } from '@/elements/values-row/definition';
import { characteristicsElement } from '@/elements/characteristics/definition';
import { featureElement } from '@/elements/feature/definition';
import { featureblockElement } from '@/elements/featureblock/definition';
import { sccElement } from '@/elements/scc/definition';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { openFormEditor } from '@/authoring/FormModal';
import { createValidationService } from '@/framework/validation';
import { App, Component, Plugin, makeFakeContext } from '../../mocks/obsidian';

const PATH = 'Note.md';

interface Case {
	name: string;
	def: ElementDefinition<any>;
	alias: string;
	source: string;
	/** Does the element's parse accept an empty body (null from the pipeline)? */
	acceptsEmpty: boolean;
	/** A NON-empty box this element's parse() rejects, and the element's own message for it (r1b: that message is kept). */
	invalid?: { box: string; error: RegExp };
}

/** SC-493 r1b (ledger D5): shown instead of the element's own message when the box reads as no data. */
const EMPTY_MESSAGE = "This block can't be empty. Add at least one setting, or press Cancel.";

/** The element's own authoring example (a body that renders). */
function example(def: ElementDefinition<any>): string {
	return (def.authoring as { example: string }).example.trim();
}

const CASES: Case[] = [
	{ name: 'counter', def: counterElement, alias: 'ds-counter', source: 'current_value: 3', acceptsEmpty: false },
	{ name: 'negotiation', def: negotiationElement, alias: 'ds-negotiation', source: 'name: Duke', acceptsEmpty: false },
	{ name: 'party', def: partyElement, alias: 'ds-party', source: 'heroes: []', acceptsEmpty: false, invalid: { box: 'just text', error: /^The input must be a YAML object\.$/ } },
	{ name: 'encounter', def: encounterElement, alias: 'ds-encounter', source: 'heroes: []', acceptsEmpty: false, invalid: { box: 'just text', error: /^The input must be a YAML object\.$/ } },
	{ name: 'values-row', def: valuesRowElement, alias: 'ds-values-row', source: example(valuesRowElement), acceptsEmpty: false },
	{ name: 'characteristics', def: characteristicsElement, alias: 'ds-characteristics', source: example(characteristicsElement), acceptsEmpty: false },
	{ name: 'feature', def: featureElement, alias: 'ds-feature', source: example(featureElement), acceptsEmpty: false },
	{ name: 'featureblock', def: featureblockElement, alias: 'ds-featureblock', source: example(featureblockElement), acceptsEmpty: false },
	{ name: 'montage', def: montageElement, alias: 'ds-montage', source: 'title: Heist', acceptsEmpty: true },
	{ name: 'project', def: projectElement, alias: 'ds-project', source: 'name: Forge', acceptsEmpty: true },
];

const noteWith = (alias: string, body: string): string =>
	['# Note', '', '```' + alias, ...(body === '' ? [] : [body]), '```', '', 'After.'].join('\n');

/** The body of the first ds-* fence of a note. */
function fenceBody(note: string, alias: string): string {
	const m = new RegExp('```' + alias + '\\n([\\s\\S]*?)\\n?```').exec(note);
	if (!m) throw new Error(`no ${alias} fence in:\n${note}`);
	return m[1];
}

async function flush(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function setup(c: Case) {
	const h = makeCompendiumDeps();
	await h.deps.prefs.set('authoringControls', true);
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) h.deps.validation.addDependencySchema(id, schema);
	const pipeline = new ElementPipeline(h.deps);
	const plugin = new Plugin(h.app);
	h.app.vault.setFile(PATH, noteWith(c.alias, c.source));
	const render = async (source: string) => {
		const ctx = makeFakeContext(h.app, PATH);
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, c.alias);
		host.setMountedBody(source);
		await pipeline.run(c.def, source, host);
		return { host, el: ctx.el };
	};
	return { h, render };
}

function openForm(el: HTMLElement) {
	const edit = el.querySelector<HTMLElement>('.dse-btn[aria-label^="Edit "]');
	if (!edit) throw new Error('no Edit button on the rendered block');
	edit.click();
	const ta = document.querySelector<HTMLTextAreaElement>('.modal-container textarea.dse-form__raw');
	if (!ta) throw new Error('the edit form did not open the raw-YAML box');
	const save = document.querySelector<HTMLButtonElement>('.modal-container .dse-modal__footer button[aria-label="Save"]');
	if (!save) throw new Error('no Save button');
	const type = (text: string) => {
		ta.value = text;
		ta.dispatchEvent(new Event('input'));
	};
	const errors = () => document.querySelector('.modal-container .dse-form__errors')?.textContent ?? '';
	return { ta, save, type, errors };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-493: parseYaml of an empty-ish raw box is what the pipeline sees', () => {
	test.each([
		['empty', ''],
		['whitespace only', '  \n\t\n'],
		['comment only', '# note\n'],
	])('%s -> null (the jest mock is the yaml package Obsidian ships)', (_n, text) => {
		expect(parseYaml(text)).toBeNull();
	});
});

describe.each(CASES)('SC-493: emptying the raw-YAML box of $name', (c) => {
	test.each([
		['an empty box', ''],
		['a whitespace-only box', '  \n \n'],
		['a comment-only box', '# nothing here\n'],
	])('%s', async (_label, box) => {
		const { h, render } = await setup(c);
		const { el } = await render(c.source);
		expect(el.querySelector('.dse-error-card')).toBeNull();
		const before = h.app.vault.getContent(PATH); // (encounter writes its own _computed block on first render)
		const form = openForm(el);
		form.type(box);
		const saveEnabled = !form.save.disabled;
		if (c.acceptsEmpty) {
			// montage / project take an empty body: Save is allowed, writes it, and it renders.
			expect(saveEnabled).toBe(true);
			expect(form.errors()).toBe('');
			form.save.click();
			await flush();
			const note = h.app.vault.getContent(PATH)!;
			const body = fenceBody(note, c.alias);
			// no byte the user never typed (SC-483): not `{}`, not a default block
			expect(body.trim()).toBe(box.trim());
			const again = await render(body);
			expect(again.el.querySelector('.dse-error-card')).toBeNull();
		} else {
			// the element would error on null, so the form must refuse: Save disabled, the error shown,
			// nothing written.
			expect(saveEnabled).toBe(false);
			expect(form.errors()).toBe(EMPTY_MESSAGE);
			form.save.click();
			await flush();
			expect(h.app.vault.getContent(PATH)).toBe(before);
		}
	});
});

describe('SC-493 r2: the emptied preview drops its read-only badge', () => {
	test('after a valid box is emptied, .dse-form__preview carries no data-dse-readonly (the badge would cover the message)', async () => {
		const c = CASES[0];
		const { render } = await setup(c);
		const { el } = await render(c.source);
		const form = openForm(el);
		const preview = document.querySelector('.modal-container .dse-form__preview')!;
		expect(preview.getAttribute('data-dse-readonly')).toBe('true'); // a valid box mounts the preview
		form.type('');
		expect(form.save.disabled).toBe(true);
		expect(preview.hasAttribute('data-dse-readonly')).toBe(false);
		form.type('current_value: 4');
		expect(preview.getAttribute('data-dse-readonly')).toBe('true'); // the mount path sets it again
	});
});

describe('SC-493 r1b: only an empty box gets the plain message; any other parse error keeps the element\'s own', () => {
	test.each(CASES.filter((c) => c.invalid))('$name: a non-empty invalid box shows the element\'s message', async (c) => {
		const { render } = await setup(c);
		const { el } = await render(c.source);
		const form = openForm(el);
		form.type(c.invalid!.box);
		expect(form.save.disabled).toBe(true);
		expect(form.errors()).toMatch(c.invalid!.error);
		expect(form.errors()).not.toBe(EMPTY_MESSAGE);
	});

	test('the footer button the message points at is called Cancel', async () => {
		const c = CASES[0];
		const { render } = await setup(c);
		const { el } = await render(c.source);
		openForm(el);
		expect(document.querySelector('.modal-container .dse-modal__footer button[aria-label="Cancel"]')).not.toBeNull();
	});
});

describe('SC-493: an ordinary raw-box edit still saves', () => {
	test('counter: a changed value is written and renders', async () => {
		const c = CASES[0];
		const { h, render } = await setup(c);
		const { el } = await render(c.source);
		const form = openForm(el);
		form.type('current_value: 5');
		expect(form.save.disabled).toBe(false);
		form.save.click();
		await flush();
		const body = fenceBody(h.app.vault.getContent(PATH)!, c.alias);
		expect(body).toBe('current_value: 5');
		const again = await render(body);
		expect(again.el.querySelector('.dse-error-card')).toBeNull();
	});
});

describe('SC-493: the pipeline body reader, not a private copy', () => {
	test('counter: a box holding only a prefs: map saves and renders (the pipeline pops the map, an object is left)', async () => {
		const c = CASES[0];
		const { h, render } = await setup(c);
		const { el } = await render(c.source);
		const form = openForm(el);
		form.type('prefs:\n  reduceMotion: true');
		expect(form.save.disabled).toBe(false);
		form.save.click();
		await flush();
		const body = fenceBody(h.app.vault.getContent(PATH)!, c.alias);
		expect(body).toBe('prefs:\n  reduceMotion: true');
		const again = await render(body);
		expect(again.el.querySelector('.dse-error-card')).toBeNull();
	});

	/** A schemaless def whose parse() records exactly what the form hands it. */
	function recordingDef(over: Partial<ElementDefinition<any>> = {}) {
		const calls: Array<{ data: unknown; body: string }> = [];
		const mounted: unknown[] = [];
		const def = {
			id: 'x', name: 'X', aliases: ['ds-x'], shape: 'static',
			parse: (data: unknown, body: string) => {
				calls.push({ data, body });
				return { data };
			},
			createView: () => ({ mount: async (_el: HTMLElement, model: unknown) => { mounted.push(model); }, load: () => {}, unload: () => {} }) as never,
			...over,
		} as ElementDefinition<any>;
		return { def, calls, mounted };
	}

	function openStub(def: ElementDefinition<any>, source: string) {
		const app = new App();
		const owner = new Component();
		owner.load();
		const cx = {
			app,
			host: {
				mode: 'reading', sourcePath: PATH, containerEl: document.createElement('div'), canPersist: true,
				addChild: <T,>(child: T) => child, getBlockInfo: () => null, blockKey: () => 'k', replaceSource: async () => true,
			},
			prefs: { descriptors: () => [] },
		} as never;
		const modal = openFormEditor(owner as never, cx, def, source, createValidationService());
		const ta = modal.body.querySelector<HTMLTextAreaElement>('textarea.dse-form__raw')!;
		const type = (text: string) => {
			ta.value = text;
			ta.dispatchEvent(new Event('input'));
		};
		return { modal, type };
	}

	test('the check and the preview both get null (never {}) for an emptied box', () => {
		const { def, calls, mounted } = recordingDef();
		const { modal, type } = openStub(def, 'a: 1');
		calls.length = 0;
		mounted.length = 0;
		type('');
		// the def accepts a null body: Save stays on, and the check AND the preview parsed the same thing
		expect(modal.canSave()).toBe(true);
		expect(calls.length).toBeGreaterThanOrEqual(2);
		expect(calls.every((call) => call.data === null && call.body === '')).toBe(true);
		expect(mounted).toEqual([{ data: null }]);
		modal.close();
	});

	test('an emptied box for a def that throws on null: the error is shown, Save is off, the preview is empty', () => {
		const { def, mounted } = recordingDef({
			parse: (data: unknown) => {
				if (data === null) throw new Error('expected an object, got null');
				return data;
			},
		});
		const { modal, type } = openStub(def, 'a: 1');
		mounted.length = 0;
		type('');
		expect(modal.canSave()).toBe(false);
		expect(modal.body.querySelector('.dse-form__errors')?.textContent).toBe(EMPTY_MESSAGE);
		expect(modal.body.querySelector('.dse-form__preview')?.children.length).toBe(0);
		expect(mounted).toEqual([]);
		modal.close();
	});

	test('a def that throws on a non-null box keeps its own message (the plain message is only for no data)', () => {
		const { def } = recordingDef({
			parse: (data: unknown) => {
				if (data !== null) throw new Error('bad shape');
				return data;
			},
		});
		const { modal, type } = openStub(def, 'a: 1');
		type('a: 2');
		expect(modal.canSave()).toBe(false);
		expect(modal.body.querySelector('.dse-form__errors')?.textContent).toBe('bad shape');
		modal.close();
	});

	test('a model of kind "invalid" (the shared withReference shape) is a check failure that shows its own message', () => {
		const { def } = recordingDef({ parse: (data: unknown) => (data === null ? { kind: 'invalid', message: 'Empty block.' } : { kind: 'ref', raw: 'x' }) });
		const { modal, type } = openStub(def, 'a: 1');
		expect(modal.canSave()).toBe(true);
		type('');
		expect(modal.canSave()).toBe(false);
		expect(modal.body.querySelector('.dse-form__errors')?.textContent).toBe('Empty block.');
		modal.close();
	});

	test('ds-scc: a body its parse refuses (inline link, empty) keeps Save off with its own message; a code saves', () => {
		const code = (sccElement.authoring as { example: string }).example.trim();
		const { modal, type } = openStub(sccElement, code);
		expect(modal.canSave()).toBe(true);
		for (const box of ['[Panther](scc.v1:mcdm.monsters.v1/statblock.monster/panther)', '']) {
			type(box);
			const refused = sccElement.parse(undefined, box) as { kind: string; message: string };
			expect(refused.kind).toBe('invalid');
			expect(modal.canSave()).toBe(false);
			expect(modal.body.querySelector('.dse-form__errors')?.textContent).toBe(refused.message);
		}
		type(code);
		expect(modal.canSave()).toBe(true);
		modal.close();
	});

	test('a raw-body def: leading collapse keys above prose are peeled exactly as the pipeline peels them', () => {
		const { def, calls } = recordingDef({ parseHandlesRawBody: true });
		const { modal, type } = openStub(def, 'plain prose');
		calls.length = 0;
		type('collapsed: true\nSome prose: and: more');
		expect(modal.canSave()).toBe(true);
		expect(calls[0].body).toBe('Some prose: and: more');
		modal.close();
	});
});
