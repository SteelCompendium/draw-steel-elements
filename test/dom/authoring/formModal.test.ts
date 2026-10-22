// Plan 15 Task 5 (D9 §3.2) — the generic form modal: seed from the block body, live-validate
// via ValidationService (Save disabled while invalid — OD-6), and Save through
// host.replaceSource (the one write path — OD-D9-12). Uses the real ValidationService + a
// fake BlockHost recording the write.
//
// Fix round 1 (review findings) additions:
//  - Critical 1: a real ds-stam block WITH a `prefs:` map round-trips the map on Save.
//  - Critical 2: the live preview mounts a read-only host and never touches the real
//    host.replaceSource.
//  - Important 3: openFormEditor routes through openManagedModal — owner unload closes it.
//  - Important 4: a false host.replaceSource() shows a Notice and keeps the modal open.
//  - Minor: an optional select field with no value stays absent (SC-488: it shows "Default (…)";
//    nothing is seeded, so validation, the preview and Save all see the key absent).
import { openFormEditor } from '../../../src/authoring/FormModal';
import { replaceFenceBlock } from '../../../src/framework/host/fenceLine';
import { createValidationService } from '../../../src/framework/validation';
import { createRenderContext } from '../../../src/framework/context';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createRollService } from '../../../src/framework/roll/service';
import { createSessionStore } from '../../../src/framework/session';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { DEFAULT_SETTINGS } from '@model/Settings';
import type { ElementDefinition } from '../../../src/framework/registry';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { skillsElement } from '../../../src/elements/skills/definition';
import { rollElement } from '../../../src/elements/roll/definition';
import { createElementRegistry } from '../../../src/framework/registry';
import { fieldsFromSchema } from '../../../src/authoring/formModel';
import { App, Component, Notice, Plugin, Setting } from '../../mocks/obsidian';
// StaminaBarSchema.yaml $refs the shared component-wrapper dependency schema — same
// convention as stamina-bar.test.ts / pref-overrides.test.ts.
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS, registerFrameworkElementDefinitions } from 'main';

const SCHEMA = `
type: object
required: [name]
properties:
  name: { type: string }
  count: { type: integer }
`;

function makeCx(writes: string[], opts: { replaceSourceResult?: boolean; hostReported?: boolean } = {}) {
	const containerEl = document.createElement('div');
	const replaceSource = async (body: string) => {
		const ok = opts.replaceSourceResult ?? true;
		if (ok) writes.push(body);
		return ok;
	};
	return {
		app: new App(),
		host: {
			mode: 'reading', sourcePath: 'N.md', containerEl, canPersist: true,
			addChild: <T,>(c: T) => c, getBlockInfo: () => null, blockKey: () => 'k',
			replaceSource,
			// SC-455: a host that already told the user why the write failed
			...(opts.hostReported ? { lastWriteReported: true } : {}),
		},
		prefs: { descriptors: () => [] },
	} as never;
}

function schemaDef(): ElementDefinition {
	return {
		id: 'x', name: 'X', aliases: ['ds-x'], shape: 'static', schema: SCHEMA,
		parse: (d) => d,
		createView: () => ({ mount: async () => {}, load: () => {}, unload: () => {} } as never),
	} as ElementDefinition;
}

/** Finds a rendered field row by its label (mocks/obsidian-core.ts's Setting.created,
 *  filtered to rows inside this modal's body). */
function findSetting(modal: { body: HTMLElement }, name: string): Setting {
	const found = Setting.created.find((s) => s.name === name && s.settingEl && modal.body.contains(s.settingEl));
	if (!found) throw new Error(`no Setting row named "${name}"`);
	return found;
}

/** The mock Component (private-field bearing, jest-free) is nominally incompatible with
 *  the real `obsidian.Component` type openFormEditor's `owner` param declares — same `as
 *  any` escape managedModal.test.ts / condition-select-modal.test.ts use for this exact
 *  mock-vs-real Component mismatch.
 *
 *  SC-337: real Obsidian's owner Component is always loaded by its parent by the time it
 *  opens a form — a loaded fixture is the faithful default, since an unloaded Component's
 *  unload() is now a guarded no-op (SC-340 fix-round-1). */
function fakeOwner(): any {
	const owner = new Component();
	owner.load();
	return owner;
}

test('opens seeded from the body and renders one control per visible field', () => {
	const validation = createValidationService();
	const modal = openFormEditor(fakeOwner(), makeCx([]), schemaDef(), 'name: Goblin\ncount: 3', validation);
	expect(modal.body.querySelectorAll('.setting-item, .dse-form__field').length).toBeGreaterThan(0);
	modal.close();
});

test('Save writes serialize/stringify output through host.replaceSource', async () => {
	const writes: string[] = [];
	const validation = createValidationService();
	const modal = openFormEditor(fakeOwner(), makeCx(writes), schemaDef(), 'name: Goblin', validation);
	await modal.save();
	expect(writes).toHaveLength(1);
	expect(writes[0]).toContain('name: Goblin');
	modal.close();
});

test('invalid working object disables Save and does not write', async () => {
	const writes: string[] = [];
	const validation = createValidationService();
	const modal = openFormEditor(fakeOwner(), makeCx(writes), schemaDef(), 'count: 3', validation); // missing required name
	expect(modal.canSave()).toBe(false);
	await modal.save();
	expect(writes).toHaveLength(0);
	modal.close();
});

test('schemaless element → raw-YAML textarea, saved verbatim through replaceSource', async () => {
	const writes: string[] = [];
	const validation = createValidationService();
	const def = {
		id: 'ft', name: 'Feature', aliases: ['ds-ft'], shape: 'static',
		parse: (_d: unknown, raw: string) => ({ raw }),
		createView: () => ({ mount: async () => {}, load: () => {}, unload: () => {} } as never),
	} as ElementDefinition;
	const modal = openFormEditor(fakeOwner(), makeCx(writes), def, 'name: Charge\ncost: 1', validation);
	expect(modal.body.querySelector('textarea')).not.toBeNull();
	await modal.save();
	expect(writes[0]).toContain('name: Charge');
	modal.close();
});

test('Minor: an optional select field with no value yet stays absent (SC-488: no seed; validation and the preview see no key, Save omits it)', async () => {
	const writes: string[] = [];
	const validation = createValidationService();
	const def = {
		id: 'sel', name: 'Sel', aliases: ['ds-sel'], shape: 'static',
		schema: 'type: object\nproperties:\n  style: { type: string, enum: [default, sheet] }\n',
		parse: (d: unknown) => d,
		createView: () => ({ mount: async () => {}, load: () => {}, unload: () => {} } as never),
	} as ElementDefinition;
	const modal = openFormEditor(fakeOwner(), makeCx(writes), def, '', validation);
	expect(modal.canSave()).toBe(true); // no required fields — the default alone is valid
	await modal.save();
	expect(writes[0]).not.toContain('style'); // SC-488: nothing is seeded; the user never set it
	modal.close();
});

describe('Important 3: openFormEditor routes through openManagedModal (F1 §4.5)', () => {
	test('owner unload closes the form', () => {
		const validation = createValidationService();
		const owner = fakeOwner();
		const modal = openFormEditor(owner, makeCx([]), schemaDef(), 'name: Goblin', validation);
		expect(document.body.contains(modal.containerEl)).toBe(true);
		owner.unload();
		expect(document.body.contains(modal.containerEl)).toBe(false);
	});
});

describe('Important 4: Save failure surfacing', () => {
	test('a false host.replaceSource() shows a Notice and keeps the modal open', async () => {
		const validation = createValidationService();
		const before = Notice.notices.length;
		const modal = openFormEditor(
			fakeOwner(),
			makeCx([], { replaceSourceResult: false }),
			schemaDef(),
			'name: Goblin',
			validation,
		);
		await modal.save();
		expect(Notice.notices.length).toBe(before + 1);
		expect(Notice.notices[Notice.notices.length - 1]).toMatch(/save/i);
		expect(document.body.contains(modal.containerEl)).toBe(true); // still open
		modal.close();
	});

	// SC-455 review LOW-2: one Notice per failed attempt - when the host already reported why
	// (its own Notice), the form does not add a second one; the modal still stays open.
	test('a false replaceSource the HOST already reported adds no second Notice, and the modal stays open', async () => {
		const validation = createValidationService();
		const before = Notice.notices.length;
		const modal = openFormEditor(fakeOwner(), makeCx([], { replaceSourceResult: false, hostReported: true }), schemaDef(), 'name: Goblin', validation);
		await modal.save();
		expect(Notice.notices.length).toBe(before);
		expect(document.body.contains(modal.containerEl)).toBe(true);
		modal.close();
	});
});

// —— Real ds-stam fixtures for Critical 1 / Critical 2 (real ElementDefinition, real
// prefs/validation services — same convention as test/dom/framework/pref-overrides.test.ts
// and test/dom/elements/stamina-bar.test.ts). ——————————————————————————————————————

const BASIC_STAM_YAML = ['max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5'].join('\n');

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-stam', lineStart: 0, lineEnd: 4 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-stam::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

function makeRealStaminaCx(host: BlockHost) {
	const app = new App();
	const plugin = new Plugin(app as never);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as never);
	const refs = createReferenceService(app as never, DEFAULT_SETTINGS);
	const validation = createValidationService();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
		validation.addDependencySchema(id, schema);
	}
	const session = createSessionStore();
	const roll = createRollService(prefs);
	const cx = createRenderContext({ app: app as never, plugin: plugin as never, settings: DEFAULT_SETTINGS, host, theme, prefs, refs, session, roll });
	return { cx, validation };
}

describe('Critical 1: the `prefs:` override map survives Save on a fixed-field model', () => {
	test('a ds-stam block WITH a prefs: map keeps the map on Save after changing a managed field', async () => {
		const host = makeHost();
		const { cx, validation } = makeRealStaminaCx(host);
		const source = `prefs:\n  reduceMotion: true\n${BASIC_STAM_YAML}`;

		const modal = openFormEditor(fakeOwner(), cx, staminaBarElement, source, validation);

		// Change a managed field through the real control (not a direct model poke).
		const maxStaminaText = findSetting(modal, 'Max stamina').texts[0];
		maxStaminaText.trigger('25');
		expect(modal.canSave()).toBe(true);

		await modal.save();

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = host.replaceSource.mock.calls[0][0] as string;
		// Content-preserving: the prefs: map survived...
		expect(written).toContain('prefs:');
		expect(written).toContain('reduceMotion: true');
		// ...AND the changed field made it through.
		expect(written).toContain('max_stamina: 25');
		modal.close();
	});
});

describe('Critical 2: the live preview is not a second write path', () => {
	test('the preview mounts a read-only host (data-dse-readonly) and never calls the real host.replaceSource', () => {
		const host = makeHost();
		const { cx, validation } = makeRealStaminaCx(host);

		const modal = openFormEditor(fakeOwner(), cx, staminaBarElement, BASIC_STAM_YAML, validation);

		const previewEl = modal.body.querySelector('.dse-form__preview') as HTMLElement;
		expect(previewEl).not.toBeNull();
		expect(previewEl.getAttribute('data-dse-readonly')).toBe('true');

		const bar = previewEl.querySelector('.dse-stamina') as HTMLElement;
		expect(bar).not.toBeNull();
		// stamina-bar's own view gates its click-to-edit affordance on canPersist —
		// canPersist: false on the preview host means no --clickable class / no listener.
		expect(bar.classList.contains('dse-stamina--clickable')).toBe(false);

		bar.click(); // even if something were wired, this must never reach the real host
		expect(host.replaceSource).not.toHaveBeenCalled();

		modal.close();
	});
});

// —— SC-483: Save writes only the fields the user set or changed ——————————————————————
// SC-483 shipped these as a strip of a seeded first enum option; SC-488 removed the seed (an
// optional select shows "Default (…)" and stays absent), so the cases below now pin the OUTCOMES:
// an untouched, source-absent select is not written; a touched select (even changed back to the
// first option) and every key the source declared are written; a required select is always written.
describe('SC-483: an untouched, source-absent select is not written by Save', () => {
	const SEL_SCHEMA = [
		'type: object',
		'properties:',
		'  name: { type: string }',
		'  style: { type: string, enum: [default, sheet] }',
	].join('\n');
	const TWO_SELECTS = `${SEL_SCHEMA}\n  size: { type: string, enum: [small, large] }`;

	/** Schema'd element with NO `serialize` (the stringifyWorking path); records every model
	 *  the preview view mounts and every `data` parse() is handed. */
	function selectDef(schema = SEL_SCHEMA) {
		const mounted: unknown[] = [];
		const parsed: Record<string, unknown>[] = [];
		const def = {
			id: 'sel', name: 'Sel', aliases: ['ds-sel'], shape: 'static', schema,
			parse: (d: Record<string, unknown>) => {
				parsed.push({ ...d });
				return { ...d };
			},
			createView: () => ({ mount: async (_el: HTMLElement, model: unknown) => { mounted.push(model); }, load: () => {}, unload: () => {} } as never),
		} as unknown as ElementDefinition;
		return { def, mounted, parsed };
	}

	function open(def: ElementDefinition, source: string) {
		const writes: string[] = [];
		const modal = openFormEditor(fakeOwner(), makeCx(writes), def, source, createValidationService());
		return { modal, writes };
	}

	test('REPRO: stamina bar with only max/current stamina, Max stamina changed to 25 -> no style key written', async () => {
		const host = makeHost();
		const { cx, validation } = makeRealStaminaCx(host);
		const modal = openFormEditor(fakeOwner(), cx, staminaBarElement, 'max_stamina: 20\ncurrent_stamina: 15', validation);
		findSetting(modal, 'Max stamina').texts[0].trigger('25');
		await modal.save();
		expect(host.replaceSource.mock.calls[0][0]).toBe('max_stamina: 25\ncurrent_stamina: 15');
		modal.close();
	});

	test('no-serialize element (stringifyWorking path): untouched absent selects are omitted', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin');
		await modal.save();
		expect(writes).toEqual(['name: Goblin']);
		modal.close();
	});

	test('the prefs: map still leads the body when the untouched select is left out', async () => {
		const host = makeHost();
		const { cx, validation } = makeRealStaminaCx(host); // real prefs, so the prefs: map is recognised
		const modal = openFormEditor(fakeOwner(), cx, selectDef().def, 'prefs:\n  reduceMotion: true\nname: Goblin', validation);
		await modal.save();
		expect(host.replaceSource.mock.calls[0][0]).toBe('prefs:\n  reduceMotion: true\nname: Goblin');
		modal.close();
	});

	test('a select changed to a non-first option is written', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin');
		findSetting(modal, 'Style').dropdowns[0].trigger('sheet');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: sheet']);
		modal.close();
	});

	test('a select changed to another option and back to the first is still written', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin');
		const style = findSetting(modal, 'Style').dropdowns[0];
		style.trigger('sheet');
		style.trigger('default');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: default']);
		modal.close();
	});

	test('touching one select does not make another untouched select written', async () => {
		const { modal, writes } = open(selectDef(TWO_SELECTS).def, 'name: Goblin');
		findSetting(modal, 'Size').dropdowns[0].trigger('large');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nsize: large']);
		modal.close();
	});

	test('a source that already declares the select key is written, even at its default (byte-identical)', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin\nstyle: default');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: default']);
		modal.close();
	});

	// SC-488 D5: a null value is treated as absent (was: written as the seeded enum[0]).
	test('a key present in the source with a null value is treated as absent: Save drops the valueless line', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin\nstyle:');
		await modal.save();
		expect(writes).toEqual(['name: Goblin']);
		modal.close();
	});

	test('a REQUIRED untouched absent select is seeded, so validation and the live preview see its value', async () => {
		// `style` is REQUIRED here: validation only passes because its seed is in `working` (SC-488 D6).
		const { def, mounted } = selectDef(`${SEL_SCHEMA}\nrequired: [style]`);
		const { modal } = open(def, 'name: Goblin');
		expect(modal.canSave()).toBe(true);
		expect(mounted[mounted.length - 1]).toMatchObject({ name: 'Goblin', style: 'default' });
		modal.close();
	});

	// SC-488 D1: nothing is seeded for an optional select, so the preview sees the key absent too.
	test('the preview also sees an optional untouched select as absent, matching the written body', async () => {
		const { def, mounted } = selectDef();
		const { modal, writes } = open(def, 'name: Goblin');
		expect(mounted[mounted.length - 1]).not.toHaveProperty('style');
		await modal.save();
		expect(writes).toEqual(['name: Goblin']);
		modal.close();
	});

	test('a REQUIRED select is never stripped (the written block must stay valid), even when untouched', async () => {
		const { def } = selectDef(`${SEL_SCHEMA}\nrequired: [style]`);
		const { modal, writes } = open(def, 'name: Goblin');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: default']);
		modal.close();
	});

	test('with a serialize(): parse() is handed the key-absent data by both the preview and Save', async () => {
		const seen: Record<string, unknown>[] = [];
		const base = selectDef().def;
		const def = {
			...base,
			parse: (d: Record<string, unknown>) => {
				seen.push({ ...d });
				return { ...d };
			},
			serialize: (m: Record<string, unknown>) => JSON.stringify(m),
		} as unknown as ElementDefinition;
		const { modal, writes } = open(def, 'name: Goblin');
		const previewSaw = seen[seen.length - 1];
		await modal.save();
		expect(previewSaw).toEqual({ name: 'Goblin' }); // preview: key absent (SC-488: no seed)
		expect(seen[seen.length - 1]).toEqual({ name: 'Goblin' }); // Save: key absent
		expect(writes).toEqual(['{"name":"Goblin"}']);
		modal.close();
	});

	// SC-483 review LOW-1 / INFO-2: the stringify path writes no byte the user never typed.
	test('an empty schema\'d block with only optional selects, saved untouched, writes an empty body (not `{}`)', async () => {
		const { modal, writes } = open(selectDef().def, '');
		await modal.save();
		expect(writes).toEqual(['']);
		modal.close();
	});

	test('an empty body keeps the prefs: map and nothing else', async () => {
		const host = makeHost();
		const { cx, validation } = makeRealStaminaCx(host);
		const modal = openFormEditor(fakeOwner(), cx, selectDef().def, 'prefs:\n  reduceMotion: true', validation);
		await modal.save();
		expect(host.replaceSource.mock.calls[0][0]).toBe('prefs:\n  reduceMotion: true');
		modal.close();
	});

	test('the stringify-path body has no trailing newline, so the spliced note has no blank line before the closing fence', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin');
		await modal.save();
		expect(replaceFenceBlock('```ds-sel\nname: Goblin\n```', 0, 2, writes[0])).toBe('```ds-sel\nname: Goblin\n```');
		modal.close();
	});

	test('with a prefs: map, exactly one line break separates it from the body', async () => {
		const host = makeHost();
		const { cx, validation } = makeRealStaminaCx(host);
		const modal = openFormEditor(fakeOwner(), cx, selectDef().def, 'prefs:\n  reduceMotion: true\nname: Goblin', validation);
		findSetting(modal, 'Style').dropdowns[0].trigger('sheet');
		await modal.save();
		expect(host.replaceSource.mock.calls[0][0]).toBe('prefs:\n  reduceMotion: true\nname: Goblin\nstyle: sheet');
		modal.close();
	});
});

// —— SC-488: an absent select shows the value the block will actually use ————————————————
// An OPTIONAL select leads with a sentinel "Default (…)" option meaning "key absent": nothing is
// seeded, choosing it deletes the key, and validation, the preview and Save all see the key absent.
// The label comes from the element's own parse(): the enum option whose model equals the key-absent
// model. A REQUIRED select has no sentinel (an absent required key is invalid) and keeps a seed.
describe('SC-488: the optional select shows the default the block will use', () => {
	const SEL_SCHEMA = [
		'type: object',
		'properties:',
		'  name: { type: string }',
		'  style: { type: string, enum: [default, sheet] }',
	].join('\n');

	/** The leading dropdown option of a Setting row: its value (the sentinel) and live text. */
	function leadOption(modal: { body: HTMLElement }, name: string): { value: string; text: string; count: number } {
		const sel = findSetting(modal, name).dropdowns[0].selectEl;
		const first = sel.options[0];
		return { value: first.value, text: first.textContent ?? '', count: sel.options.length };
	}
	const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

	function openReal(def: ElementDefinition, source: string) {
		const host = makeHost();
		const { cx, validation } = makeRealStaminaCx(host);
		const modal = openFormEditor(fakeOwner(), cx, def, source, validation);
		return { modal, host };
	}
	function recordingDef(base: ElementDefinition) {
		const models: Record<string, unknown>[] = [];
		const def = {
			...base,
			parse: (d: unknown, raw: string) => {
				const m = base.parse(d, raw) as Record<string, unknown>;
				models.push(m);
				return m;
			},
		} as ElementDefinition;
		return { def, models };
	}
	/** A fake element whose `mode` default is derived from `name`; `extra` customises parse. */
	function derivedDef(parse: (d: Record<string, unknown>) => unknown, schema = SEL_SCHEMA + '\n  count: { type: integer }'): ElementDefinition {
		return {
			id: 'der', name: 'Der', aliases: ['ds-der'], shape: 'static', schema,
			parse: (d: Record<string, unknown>) => parse(d),
			createView: () => ({ mount: async () => {}, load: () => {}, unload: () => {} } as never),
		} as unknown as ElementDefinition;
	}
	function openPlain(def: ElementDefinition, source: string) {
		const writes: string[] = [];
		const modal = openFormEditor(fakeOwner(), makeCx(writes), def, source, createValidationService());
		return { modal, writes };
	}

	test('ds-skills with no style: shows "Default (ledger)", the preview renders the ledger layout, Save omits style', async () => {
		const { modal, host } = openReal(skillsElement, 'skills:\n  - climb');
		const lead = leadOption(modal, 'Style');
		expect(lead.text).toBe('Default (ledger)');
		expect(findSetting(modal, 'Style').dropdowns[0].value).toBe(lead.value);
		expect(lead.count).toBe(4); // sentinel + list, ledger, chips
		await flush();
		const preview = modal.body.querySelector('.dse-form__preview') as HTMLElement;
		expect(preview.querySelector('[data-skills-style="ledger"]')).not.toBeNull();
		await modal.save();
		expect(host.replaceSource.mock.calls[0][0]).toBe('skills:\n  - climb');
		modal.close();
	});

	test('ds-roll "Might test": mode reads "Default (test)" and relabels live to "Default (power-roll)" as roll: is edited; the preview follows', async () => {
		const { def, models } = recordingDef(rollElement);
		const { modal } = openReal(def, 'roll: Might test');
		expect(leadOption(modal, 'Mode').text).toBe('Default (test)');
		expect(models[models.length - 1]).toMatchObject({ mode: 'test' });
		findSetting(modal, 'Roll').texts[0].trigger('Power Roll + Might');
		expect(leadOption(modal, 'Mode').text).toBe('Default (power-roll)');
		expect(models[models.length - 1]).toMatchObject({ mode: 'power-roll' });
		modal.close();
	});

	test('ds-roll difficulty reads "Default (none)" and the preview caption has no difficulty', async () => {
		const { modal } = openReal(rollElement, 'roll: Might test');
		expect(leadOption(modal, 'Difficulty').text).toBe('Default (none)');
		await flush();
		const caption = modal.body.querySelector('.dse-form__preview .dse-roll__expr') as HTMLElement;
		expect(caption.textContent).toBe('Might test');
		modal.close();
	});

	test('ds-stam style reads "Default (default)"', () => {
		const { modal } = openReal(staminaBarElement, BASIC_STAM_YAML);
		expect(leadOption(modal, 'Style').text).toBe('Default (default)');
		modal.close();
	});

	test('nothing is seeded: the preview model has no key, the form is valid, and Save writes none', async () => {
		const mounted: unknown[] = [];
		const def = {
			...derivedDef((d) => ({ ...d })),
			createView: () => ({ mount: async (_el: HTMLElement, model: unknown) => { mounted.push(model); }, load: () => {}, unload: () => {} } as never),
		} as ElementDefinition;
		const { modal, writes } = openPlain(def, 'name: Goblin');
		expect(modal.canSave()).toBe(true);
		expect(mounted[mounted.length - 1]).toEqual({ name: 'Goblin' });
		await modal.save();
		expect(writes).toEqual(['name: Goblin']);
		modal.close();
	});

	test('an explicit pick is selected from the source and written', async () => {
		const { def } = recordingDef(derivedDef((d) => ({ ...d })));
		const { modal, writes } = openPlain(def, 'name: Goblin\nstyle: sheet');
		expect(findSetting(modal, 'Style').dropdowns[0].value).toBe('sheet');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: sheet']);
		modal.close();
	});

	test('picking an option writes it; picking Default again removes the line', async () => {
		const { modal, writes } = openPlain(derivedDef((d) => ({ ...d })), 'name: Goblin');
		const dd = findSetting(modal, 'Style').dropdowns[0];
		const sentinel = dd.selectEl.options[0].value;
		dd.trigger('sheet');
		dd.trigger(sentinel);
		await modal.save();
		expect(writes).toEqual(['name: Goblin']);
		modal.close();
	});

	test('a source that declares the key, switched to Default, loses the line', async () => {
		const { modal, writes } = openPlain(derivedDef((d) => ({ ...d })), 'name: Goblin\nstyle: sheet');
		const dd = findSetting(modal, 'Style').dropdowns[0];
		dd.trigger(dd.selectEl.options[0].value);
		await modal.save();
		expect(writes).toEqual(['name: Goblin']);
		modal.close();
	});

	// SC-488 review LOW-1: a declared key switched to Default and back keeps its place in the block.
	test('a declared select key switched to Default and then to an option keeps its source position on Save', async () => {
		const schema = 'type: object\nproperties:\n  style: { type: string, enum: [list, ledger, chips] }\n  skills: { type: array, items: { type: string } }\n';
		const { modal, writes } = openPlain(derivedDef((d) => ({ ...d }), schema), 'style: chips\nskills:\n  - climb');
		const dd = findSetting(modal, 'Style').dropdowns[0];
		dd.trigger(dd.selectEl.options[0].value);
		dd.trigger('chips');
		await modal.save();
		expect(writes).toEqual(['style: chips\nskills:\n  - climb']);
		modal.close();
	});

	test('a null value selects Default (treated as absent)', () => {
		const { modal } = openPlain(derivedDef((d) => ({ ...d })), 'name: Goblin\nstyle:');
		const dd = findSetting(modal, 'Style').dropdowns[0];
		expect(dd.value).toBe(dd.selectEl.options[0].value);
		expect(modal.canSave()).toBe(true);
		modal.close();
	});

	test('a REQUIRED select has no Default option; it seeds the schema default when that is in the enum, and is written', async () => {
		const schema = 'type: object\nrequired: [style]\nproperties:\n  style: { type: string, enum: [list, ledger, chips], default: ledger }\n';
		const { modal, writes } = openPlain(derivedDef((d) => ({ ...d }), schema), '');
		const dd = findSetting(modal, 'Style').dropdowns[0];
		expect(dd.selectEl.options).toHaveLength(3);
		expect(dd.value).toBe('ledger');
		await modal.save();
		expect(writes).toEqual(['style: ledger']);
		modal.close();
	});

	test('a REQUIRED select seeds enum[0] when the schema default is missing or not in the enum', async () => {
		for (const def of ['', ', default: bogus']) {
			const schema = `type: object\nrequired: [style]\nproperties:\n  style: { type: string, enum: [list, ledger]${def} }\n`;
			const { modal, writes } = openPlain(derivedDef((d) => ({ ...d }), schema), '');
			expect(findSetting(modal, 'Style').dropdowns[0].value).toBe('list');
			await modal.save();
			expect(writes).toEqual(['style: list']);
			modal.close();
		}
	});

	test('an option whose model equals the absent model is named; several equal -> "Default"; none -> "Default (none)"', () => {
		const derived = openPlain(derivedDef((d) => ({ name: d.name, mode: d.style ?? (d.name === 'a' ? 'sheet' : 'default') })), 'name: a');
		expect(leadOption(derived.modal, 'Style').text).toBe('Default (sheet)');
		derived.modal.close();
		const ignoring = openPlain(derivedDef(() => ({})), 'name: a'); // parse ignores style: every option "equals" absent
		expect(leadOption(ignoring.modal, 'Style').text).toBe('Default');
		ignoring.modal.close();
		const none = openPlain(derivedDef((d) => ({ style: d.style })), 'name: a');
		expect(leadOption(none.modal, 'Style').text).toBe('Default (none)');
		none.modal.close();
	});

	test('the label also recomputes while another field is invalid, and keeps the previous label when parse throws', () => {
		const def = derivedDef((d) => {
			if (d.name === 'boom') throw new Error('boom');
			return { style: d.style ?? (d.name === 'a' ? 'sheet' : 'default') };
		}, SEL_SCHEMA + '\n  count: { type: integer }\nrequired: [count]');
		const { modal } = openPlain(def, 'name: a\ncount: 1');
		expect(leadOption(modal, 'Style').text).toBe('Default (sheet)');
		findSetting(modal, 'Count').texts[0].trigger(''); // count removed -> invalid, Save disabled
		expect(modal.canSave()).toBe(false);
		findSetting(modal, 'Name').texts[0].trigger('b');
		expect(leadOption(modal, 'Style').text).toBe('Default (default)'); // relabelled although invalid
		findSetting(modal, 'Name').texts[0].trigger('boom');
		expect(leadOption(modal, 'Style').text).toBe('Default (default)'); // parse threw: previous label kept
		modal.close();
	});

	// Census: every OPTIONAL select on every registered element leads with the sentinel, and its
	// label is the option whose parse() equals the key-absent parse() (or none). The table is the
	// independent expectation: a new select fails here until someone states its default on purpose.
	test('census: every optional select of every registered element leads with the sentinel and names the real default', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);
		const expected: Record<string, string> = {
			'skills.style': 'ledger',
			'stamina-bar.style': 'default',
			'roll.mode': 'power-roll',
			'roll.difficulty': 'none',
		};
		const seen: string[] = [];
		for (const def of registry.all()) {
			for (const field of fieldsFromSchema(def)) {
				if (field.widget !== 'select' || field.required) continue;
				const id = `${def.id}.${field.key}`;
				seen.push(id);
				const { modal } = openReal(def, '');
				const lead = leadOption(modal, field.label);
				const options = findSetting(modal, field.label).dropdowns[0].selectEl.options;
				expect(Array.from(options).slice(1).map((o) => o.value)).toEqual(field.enum);
				expect(field.enum).not.toContain(lead.value);
				const want = expected[id];
				expect(want).toBeDefined();
				// The expectation is itself checked against the parser: `want` is the option whose
				// model equals the absent model, or no option does.
				const key = (v: unknown) => JSON.stringify(v);
				const absent = key(def.parse({}, ''));
				const hits = (field.enum ?? []).filter((v) => key(def.parse({ [field.key]: v }, '')) === absent);
				expect(hits).toEqual(want === 'none' ? [] : [want]);
				expect(lead.text).toBe(`Default (${want})`);
				modal.close();
			}
		}
		expect(seen.sort()).toEqual(Object.keys(expected).sort());
	});
});
