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
//  - Minor: a select field's implicit default writes back to `working` on open (SC-483: for
//    validation/preview only - Save omits it unless the user touched the dropdown).
import { openFormEditor } from '../../../src/authoring/FormModal';
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
import { App, Component, Notice, Plugin, Setting } from '../../mocks/obsidian';
// StaminaBarSchema.yaml $refs the shared component-wrapper dependency schema — same
// convention as stamina-bar.test.ts / pref-overrides.test.ts.
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

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

test('Minor: a select field with no value yet writes its implicit default back to `working` on open (SC-483: validation/preview see it, Save omits it)', async () => {
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
	expect(writes[0]).not.toContain('style'); // SC-483: the seed is display/validation-only; the user never set it
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
// The select widget seeds an absent key's first enum option into `working` on open (so
// validation + preview see what the dropdown shows). That seed is display/validation-only: a
// select whose key was ABSENT from the source and whose dropdown never fired onChange is
// stripped from the data Save serializes. A touched select (even changed back to the first
// option) and every key the source declared are written as before.
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
		expect(writes).toEqual(['name: Goblin\n']);
		modal.close();
	});

	test('the prefs: map still leads the body when the untouched select is stripped', async () => {
		const host = makeHost();
		const { cx, validation } = makeRealStaminaCx(host); // real prefs, so the prefs: map is recognised
		const modal = openFormEditor(fakeOwner(), cx, selectDef().def, 'prefs:\n  reduceMotion: true\nname: Goblin', validation);
		await modal.save();
		expect(host.replaceSource.mock.calls[0][0]).toBe('prefs:\n  reduceMotion: true\nname: Goblin\n');
		modal.close();
	});

	test('a select changed to a non-first option is written', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin');
		findSetting(modal, 'Style').dropdowns[0].trigger('sheet');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: sheet\n']);
		modal.close();
	});

	test('a select changed to another option and back to the first is still written', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin');
		const style = findSetting(modal, 'Style').dropdowns[0];
		style.trigger('sheet');
		style.trigger('default');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: default\n']);
		modal.close();
	});

	test('touching one select does not make another untouched select written', async () => {
		const { modal, writes } = open(selectDef(TWO_SELECTS).def, 'name: Goblin');
		findSetting(modal, 'Size').dropdowns[0].trigger('large');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nsize: large\n']);
		modal.close();
	});

	test('a source that already declares the select key is written, even at its default (byte-identical)', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin\nstyle: default');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: default\n']);
		modal.close();
	});

	test('a key present in the source with a null value is a declared key: written (as the seeded value), as before', async () => {
		const { modal, writes } = open(selectDef().def, 'name: Goblin\nstyle:');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: default\n']);
		modal.close();
	});

	test('validation and the live preview still see the seeded value of an untouched absent select', async () => {
		// `style` is REQUIRED here: validation only passes because the seed is in `working`.
		const { def, mounted } = selectDef(`${SEL_SCHEMA}\nrequired: [style]`);
		const { modal } = open(def, 'name: Goblin');
		expect(modal.canSave()).toBe(true);
		expect(mounted.at(-1)).toMatchObject({ name: 'Goblin', style: 'default' });
		modal.close();
	});

	test('preview keeps the seeded value for an optional untouched select while the written body omits it', async () => {
		const { def, mounted } = selectDef();
		const { modal, writes } = open(def, 'name: Goblin');
		expect(mounted.at(-1)).toMatchObject({ style: 'default' });
		await modal.save();
		expect(writes).toEqual(['name: Goblin\n']);
		modal.close();
	});

	test('a REQUIRED select is never stripped (the written block must stay valid), even when untouched', async () => {
		const { def } = selectDef(`${SEL_SCHEMA}\nrequired: [style]`);
		const { modal, writes } = open(def, 'name: Goblin');
		await modal.save();
		expect(writes).toEqual(['name: Goblin\nstyle: default\n']);
		modal.close();
	});

	test('with a serialize(): parse() is handed the stripped data, so the model records the key as undeclared', async () => {
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
		const previewSaw = seen.at(-1);
		await modal.save();
		expect(previewSaw).toMatchObject({ style: 'default' }); // preview: seeded
		expect(seen.at(-1)).toEqual({ name: 'Goblin' }); // Save: stripped
		expect(writes).toEqual(['{"name":"Goblin"}']);
		modal.close();
	});
});
