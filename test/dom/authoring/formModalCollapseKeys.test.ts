// SC-494 -- the block edit form must treat the three reserved collapse keys (`collapsed:`,
// `collapsible:`, `collapse_default:`) the way the render pipeline does: pop the claimed ones out of
// the data before the schema and `def.parse` see them, and put them back ahead of the body on Save.
// Before the fix the form validated and parsed them as ordinary fields (so a schema with
// `additionalProperties: false` rejected them and a model without the field dropped them), and Save
// wrote a block with no `collapsed:` line.
//
// Everything here is the real path: the real Edit button opens the real FormModal, Save goes through
// the real ReadingModeBlockHost.replaceSource -> vault.process, and the written note is re-rendered
// through the real ElementPipeline on a fresh host (the SC-493 pattern).
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementDefinition } from '@/framework/registry';
import { ReadingModeBlockHost } from '@/framework/host/ReadingModeBlockHost';
import { staminaBarElement } from '@/elements/stamina-bar/definition';
import { skillsElement } from '@/elements/skills/definition';
import { conditionsElement } from '@/elements/conditions/definition';
import { surgesElement } from '@/elements/surges/definition';
import { counterElement } from '@/elements/counter/definition';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { openFormEditor } from '@/authoring/FormModal';
import { createValidationService } from '@/framework/validation';
import { App, Component, Plugin, Setting, makeFakeContext } from '../../mocks/obsidian';

const PATH = 'Note.md';

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

async function setup(def: ElementDefinition<any>, alias: string, source: string) {
	const h = makeCompendiumDeps();
	await h.deps.prefs.set('authoringControls', true);
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) h.deps.validation.addDependencySchema(id, schema);
	const pipeline = new ElementPipeline(h.deps);
	const plugin = new Plugin(h.app);
	h.app.vault.setFile(PATH, noteWith(alias, source));
	const render = async (body: string) => {
		const ctx = makeFakeContext(h.app, PATH);
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, alias);
		host.setMountedBody(body);
		await pipeline.run(def, body, host);
		return { host, el: ctx.el };
	};
	const note = () => h.app.vault.getContent(PATH)!;
	return { h, render, note };
}

/** Open the block edit form from the rendered block's Edit button. */
function openForm(el: HTMLElement) {
	const edit = el.querySelector<HTMLElement>('.dse-btn[aria-label^="Edit "]');
	if (!edit) throw new Error('no Edit button on the rendered block');
	edit.click();
	const modalEl = document.querySelector<HTMLElement>('.modal-container');
	if (!modalEl) throw new Error('the edit form did not open');
	const save = modalEl.querySelector<HTMLButtonElement>('.dse-modal__footer button[aria-label="Save"]');
	if (!save) throw new Error('no Save button');
	const field = (name: string): Setting => {
		const found = Setting.created.find((s) => s.name === name && s.settingEl && modalEl.contains(s.settingEl));
		if (!found) throw new Error(`no field named "${name}"`);
		return found;
	};
	const raw = modalEl.querySelector<HTMLTextAreaElement>('textarea.dse-form__raw');
	const typeRaw = (text: string) => {
		if (!raw) throw new Error('the form has no raw-YAML box');
		raw.value = text;
		raw.dispatchEvent(new Event('input'));
	};
	const errors = () => modalEl.querySelector('.dse-form__errors')?.textContent ?? '';
	return { save, field, raw, typeRaw, errors };
}

/** Press Save -- which must be enabled, else the write below would be vacuous -- and wait for the write. */
async function submit(form: { save: HTMLButtonElement }): Promise<void> {
	expect(form.save.disabled).toBe(false);
	form.save.click();
	await flush();
}

const isCollapsed = (el: HTMLElement): boolean => el.querySelector('[data-dse-collapsed="on"]') !== null || el.firstElementChild?.getAttribute('data-dse-collapsed') === 'on';
const lines = (body: string, key: string): string[] => body.split('\n').filter((l) => new RegExp(`^${key}\\s*:`).test(l));

beforeEach(() => {
	Setting.created.length = 0;
});
afterEach(() => {
	document.body.innerHTML = '';
});

const STAMINA = 'max_stamina: 20\ncurrent_stamina: 15';
const ALIAS = 'ds-stamina-bar';

describe('SC-494: a stamina bar with `collapsed:` (serialize path)', () => {
	test.each([true, false])('collapsed: %s -- the form opens clean, a no-edit Save writes the block byte-identical, and it re-renders in the same state', async (value) => {
		const source = `collapsed: ${value}\n${STAMINA}`;
		const { render, note } = await setup(staminaBarElement, ALIAS, source);
		const { el } = await render(source);
		expect(isCollapsed(el)).toBe(value);
		const form = openForm(el);
		expect(form.errors()).toBe('');
		expect(form.save.disabled).toBe(false);
		await submit(form);
		const body = fenceBody(note(), ALIAS);
		expect(body).toBe(source);
		const again = await render(body);
		expect(again.el.querySelector('.dse-error-card')).toBeNull();
		expect(isCollapsed(again.el)).toBe(value);
	});

	test('Save after an edit keeps the `collapsed:` line and applies the edit', async () => {
		const source = `collapsed: true\n${STAMINA}`;
		const { render, note } = await setup(staminaBarElement, ALIAS, source);
		const { el } = await render(source);
		const form = openForm(el);
		form.field('Max stamina').texts[0].trigger('25');
		expect(form.errors()).toBe('');
		await submit(form);
		const body = fenceBody(note(), ALIAS);
		expect(body).toBe('collapsed: true\nmax_stamina: 25\ncurrent_stamina: 15');
		const again = await render(body);
		expect(isCollapsed(again.el)).toBe(true);
		expect(again.el.textContent).toContain('15/25');
	});

	test('a block with `prefs:` then `collapsed:` keeps both, in that order, on a no-edit Save and after an edit', async () => {
		const source = `prefs:\n  reduceMotion: true\ncollapsed: true\n${STAMINA}`;
		const { render, note } = await setup(staminaBarElement, ALIAS, source);
		const { el } = await render(source);
		const form = openForm(el);
		await submit(form);
		expect(fenceBody(note(), ALIAS)).toBe(source);

		const second = openForm((await render(fenceBody(note(), ALIAS))).el);
		second.field('Max stamina').texts[0].trigger('30');
		await submit(second);
		const body = fenceBody(note(), ALIAS);
		expect(body).toBe(`prefs:\n  reduceMotion: true\ncollapsed: true\nmax_stamina: 30\ncurrent_stamina: 15`);
		expect(isCollapsed((await render(body)).el)).toBe(true);
	});
});

describe('SC-494: a chrome element WITHOUT serialize (the stringify-the-working-data path)', () => {
	const SKILLS = 'skills:\n  - Heal\n  - Sneak';
	test('ds-skills: `collapsed: true` survives a no-edit Save byte-identical and re-renders collapsed', async () => {
		expect(skillsElement.serialize).toBeUndefined();
		const source = `collapsed: true\n${SKILLS}`;
		const { render, note } = await setup(skillsElement, 'ds-skills', source);
		const { el } = await render(source);
		expect(isCollapsed(el)).toBe(true);
		const form = openForm(el);
		expect(form.errors()).toBe('');
		await submit(form);
		const body = fenceBody(note(), 'ds-skills');
		expect(body).toBe(source);
		expect(isCollapsed((await render(body)).el)).toBe(true);
	});

	test('ds-skills: `prefs:` then `collapsed:` then the body, after an edit', async () => {
		const source = `prefs:\n  reduceMotion: true\ncollapsed: true\n${SKILLS}`;
		const { render, note } = await setup(skillsElement, 'ds-skills', source);
		const form = openForm((await render(source)).el);
		form.field('Only show selected').toggles[0].trigger(true);
		await submit(form);
		const body = fenceBody(note(), 'ds-skills');
		expect(body).toBe(`${source}\nonly_show_selected: true`);
		expect(isCollapsed((await render(body)).el)).toBe(true);
	});
});

describe('SC-494: a key the model owns is serialized by the model, never duplicated', () => {
	test.each([
		['ds-stamina-bar', staminaBarElement, `collapse_default: true\n${STAMINA}`],
		['ds-skills', skillsElement, 'collapse_default: true\nskills:\n  - Heal\n  - Sneak'],
	])('%s: `collapse_default: true` stays one line and the block still starts collapsed', async (alias, def, source) => {
		const { render, note } = await setup(def, alias, source);
		const { el } = await render(source);
		expect(isCollapsed(el)).toBe(true);
		const form = openForm(el);
		expect(form.errors()).toBe('');
		await submit(form);
		const body = fenceBody(note(), alias);
		expect(lines(body, 'collapse_default')).toEqual(['collapse_default: true']);
		expect(isCollapsed((await render(body)).el)).toBe(true);
	});

	test('ds-stamina-bar: `collapsed: true` AND an owned `collapsible: false` -- each written once', async () => {
		const source = `collapsed: true\ncollapsible: false\n${STAMINA}`;
		const { render, note } = await setup(staminaBarElement, ALIAS, source);
		const form = openForm((await render(source)).el);
		await submit(form);
		const body = fenceBody(note(), ALIAS);
		expect(lines(body, 'collapsed')).toHaveLength(1);
		expect(lines(body, 'collapsible')).toHaveLength(1);
	});
});

describe('SC-494: a schema with additionalProperties: false (the form must not hand it the reserved keys)', () => {
	test('ds-conditions: `collapsed: true` -- the form opens with no schema error, Save writes the line back, it re-renders collapsed', async () => {
		const source = 'collapsed: true\nconditions:\n  - bleeding\n  - slowed';
		const { render, note } = await setup(conditionsElement, 'ds-conditions', source);
		const { el } = await render(source);
		expect(el.querySelector('.dse-error-card')).toBeNull();
		expect(isCollapsed(el)).toBe(true);
		const form = openForm(el);
		expect(form.errors()).toBe('');
		expect(form.save.disabled).toBe(false);
		await submit(form);
		const body = fenceBody(note(), 'ds-conditions');
		expect(lines(body, 'collapsed')).toEqual(['collapsed: true']);
		const again = await render(body);
		expect(again.el.querySelector('.dse-error-card')).toBeNull();
		expect(isCollapsed(again.el)).toBe(true);
	});

	test('ds-surges: all three reserved keys (this model owns none of them) -- no schema error, each written once, ahead of the body', async () => {
		const source = 'collapsed: true\ncollapsible: true\ncollapse_default: false\nsurges: 2\nhighest_characteristic: 3';
		const { render, note } = await setup(surgesElement, 'ds-surges', source);
		const { el } = await render(source);
		expect(el.querySelector('.dse-error-card')).toBeNull();
		const form = openForm(el);
		expect(form.errors()).toBe('');
		expect(form.save.disabled).toBe(false);
		await submit(form);
		expect(fenceBody(note(), 'ds-surges')).toBe(source);
	});

	test('ds-surges: an edit keeps the keys and applies the edit', async () => {
		const source = 'collapsed: true\nsurges: 2\nhighest_characteristic: 3';
		const { render, note } = await setup(surgesElement, 'ds-surges', source);
		const form = openForm((await render(source)).el);
		form.field('Surges').texts[0].trigger('4');
		await submit(form);
		const body = fenceBody(note(), 'ds-surges');
		expect(body).toBe('collapsed: true\nsurges: 4\nhighest_characteristic: 3');
		expect(isCollapsed((await render(body)).el)).toBe(true);
	});
});

describe('SC-494: a raw-YAML-box element keeps the line verbatim', () => {
	test('ds-counter: `collapsed: true` stays in the box, a no-edit Save and an edited Save both keep it, and it re-renders collapsed', async () => {
		const source = 'collapsed: true\ncurrent_value: 3';
		const { render, note } = await setup(counterElement, 'ds-counter', source);
		const { el } = await render(source);
		expect(isCollapsed(el)).toBe(true);
		const form = openForm(el);
		expect(form.raw?.value).toBe(source);
		expect(form.errors()).toBe('');
		await submit(form);
		expect(fenceBody(note(), 'ds-counter')).toBe(source);

		const second = openForm((await render(source)).el);
		second.typeRaw('collapsed: true\ncurrent_value: 5');
		expect(second.errors()).toBe('');
		await submit(second);
		const body = fenceBody(note(), 'ds-counter');
		expect(body).toBe('collapsed: true\ncurrent_value: 5');
		expect(isCollapsed((await render(body)).el)).toBe(true);
	});
});

describe('SC-494: the form pops the keys the way the pipeline does (stub elements)', () => {
	/** A chrome-bearing schema'd element that records what `parse` and the validator are given. */
	function stub(over: Partial<ElementDefinition<any>> = {}) {
		const parsed: Array<Record<string, unknown>> = [];
		const def = {
			id: 'x', name: 'X', aliases: ['ds-x'], shape: 'static',
			schema: 'type: object\nadditionalProperties: false\nproperties:\n  name: { type: string }\n',
			chrome: { summary: () => ({ label: 'X' }) },
			parse: (data: Record<string, unknown>) => {
				parsed.push({ ...data });
				return { ...data };
			},
			createView: () => ({ mount: async () => {}, load: () => {}, unload: () => {} }) as never,
			...over,
		} as ElementDefinition<any>;
		return { def, parsed };
	}

	function open(def: ElementDefinition<any>, source: string, writes: string[]) {
		const owner = new Component();
		owner.load();
		const cx = {
			app: new App(),
			host: {
				mode: 'reading', sourcePath: PATH, containerEl: document.createElement('div'), canPersist: true,
				addChild: <T,>(child: T) => child, getBlockInfo: () => null, blockKey: () => 'k',
				replaceSource: async (body: string) => {
					writes.push(body);
					return true;
				},
			},
			prefs: { descriptors: () => [] },
		} as never;
		return openFormEditor(owner as never, cx, def, source, createValidationService());
	}

	test('a serializer-less chrome element: the claimed legacy keys are popped, then written back in the pipeline\'s order (collapsed, collapsible, collapse_default)', async () => {
		const { def, parsed } = stub();
		const writes: string[] = [];
		const modal = open(def, 'collapse_default: true\ncollapsible: false\ncollapsed: true\nname: A', writes);
		expect(modal.canSave()).toBe(true);
		expect(parsed.every((d) => !('collapsed' in d) && !('collapsible' in d) && !('collapse_default' in d))).toBe(true);
		await modal.save();
		expect(writes).toEqual(['collapsed: true\ncollapsible: false\ncollapse_default: true\nname: A']);
		modal.close();
	});

	test('a def without the chrome slot is left alone: its keys stay in the data (and fail its own closed schema, as they would at render)', () => {
		const { def } = stub({ chrome: undefined });
		const modal = open(def, 'collapsed: true\nname: A', []);
		expect(modal.canSave()).toBe(false);
		modal.close();
	});

	test('a key that is not a boolean is warned about and dropped, exactly as the pipeline drops it on a write-back', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const { def } = stub();
		const writes: string[] = [];
		const modal = open(def, 'collapsed: maybe\nname: A', writes);
		expect(modal.canSave()).toBe(true);
		await modal.save();
		expect(writes).toEqual(['name: A']);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
		modal.close();
	});

	test('a serializer that throws falls back to the stringified data, with the keys still written back', async () => {
		const { def } = stub({
			serialize: () => {
				throw new Error('nope');
			},
		});
		const writes: string[] = [];
		const modal = open(def, 'collapsed: true\nname: A', writes);
		await modal.save();
		expect(writes).toEqual(['collapsed: true\nname: A']);
		modal.close();
	});

	test('a body of only a collapse key writes just that key (nothing the user never typed)', async () => {
		const { def } = stub();
		const writes: string[] = [];
		const modal = open(def, 'collapsed: true', writes);
		await modal.save();
		expect(writes).toEqual(['collapsed: true']);
		modal.close();
	});
});
