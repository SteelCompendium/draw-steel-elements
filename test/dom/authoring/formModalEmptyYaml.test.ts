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
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { Plugin, makeFakeContext } from '../../mocks/obsidian';

const PATH = 'Note.md';

interface Case {
	name: string;
	def: ElementDefinition<any>;
	alias: string;
	source: string;
	/** Does the element's parse accept an empty body (null from the pipeline)? */
	acceptsEmpty: boolean;
}

const CASES: Case[] = [
	{ name: 'counter', def: counterElement, alias: 'ds-counter', source: 'current_value: 3', acceptsEmpty: false },
	{ name: 'negotiation', def: negotiationElement, alias: 'ds-negotiation', source: 'name: Duke', acceptsEmpty: false },
	{ name: 'party', def: partyElement, alias: 'ds-party', source: 'heroes: []', acceptsEmpty: false },
	{ name: 'encounter', def: encounterElement, alias: 'ds-encounter', source: 'heroes: []', acceptsEmpty: false },
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
			expect(form.errors()).not.toBe('');
			form.save.click();
			await flush();
			expect(h.app.vault.getContent(PATH)).toBe(noteWith(c.alias, c.source));
		}
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
