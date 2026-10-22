// SC-482 x SC-483 — the block edit form's Save and the "a write adds no default keys the user never
// wrote" contract. Save runs `serialize(def.parse(data))` (SC-482's parse records which defaulted keys
// the data left absent) after dropping the dropdown seeds the user never touched (SC-483), so a minimal
// block must come back with nothing added, a fully-authored one byte-identical, and a changed field
// written.
//
// Which elements have a FORM: only those with a schema. Of the SC-482 elements, counter, project,
// montage, party, encounter and negotiation are schemaless, so the editor shows ONE raw-YAML textarea
// that Save writes verbatim (nothing is parsed into a model first); stamina-bar has a schema and a
// real field form. So the form-path assertions use stamina-bar, and counter / montage are covered on
// their raw path.
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
import { counterElement } from '../../../src/elements/counter/definition';
import { montageElement } from '../../../src/elements/montage/definition';
import { App, Component, Plugin, Setting } from '../../mocks/obsidian';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';

function makeHost() {
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
	};
	return host as unknown as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

function makeCx(host: BlockHost) {
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

function fakeOwner(): any {
	const owner = new Component();
	owner.load();
	return owner;
}

function findSetting(modal: { body: HTMLElement }, name: string): Setting {
	const found = Setting.created.find((s) => s.name === name && s.settingEl && modal.body.contains(s.settingEl));
	if (!found) throw new Error(`no Setting row named "${name}"`);
	return found;
}

/** Open the block edit form on `source`, hand back the modal and the host that records the write. */
function open(def: ElementDefinition, source: string) {
	const host = makeHost();
	const { cx, validation } = makeCx(host);
	const modal = openFormEditor(fakeOwner(), cx, def, source, validation);
	return { modal, host, written: () => host.replaceSource.mock.calls.map((c) => c[0]) };
}

/** Type into the raw-YAML textarea the schemaless editor shows. */
function typeRaw(modal: { body: HTMLElement }, text: string): void {
	const ta = modal.body.querySelector<HTMLTextAreaElement>('textarea.dse-form__raw')!;
	ta.value = text;
	ta.dispatchEvent(new Event('input'));
}

describe('SC-482 x SC-483: stamina-bar (the SC-482 element with a real field form)', () => {
	const MINIMAL = 'max_stamina: 20\ncurrent_stamina: 15';

	test('a minimal block, no field touched: Save writes exactly the source (no collapsible, collapse_default, temp_stamina, height, style)', async () => {
		const { modal, written } = open(staminaBarElement, MINIMAL);
		await modal.save();
		expect(written()).toEqual([MINIMAL]);
		modal.close();
	});

	test('a minimal block, one field changed: the changed field is written and no undeclared default key appears', async () => {
		const { modal, written } = open(staminaBarElement, MINIMAL);
		findSetting(modal, 'Temp stamina').texts[0].trigger('5');
		await modal.save();
		expect(written()).toEqual(['max_stamina: 20\ncurrent_stamina: 15\ntemp_stamina: 5']);
		modal.close();
	});

	test('a minimal block, a dropdown changed: that select is written, the other defaults are not', async () => {
		const { modal, written } = open(staminaBarElement, MINIMAL);
		findSetting(modal, 'Style').dropdowns[0].trigger('sheet');
		await modal.save();
		expect(written()).toEqual(['max_stamina: 20\ncurrent_stamina: 15\nstyle: sheet']);
		modal.close();
	});

	test('a fully-authored block, no field touched: Save is byte-identical to the source', async () => {
		const full = [
			'collapsible: false',
			'collapse_default: false',
			'max_stamina: 20',
			'current_stamina: 15',
			'temp_stamina: 0',
			'height: 1',
			'style: default',
		].join('\n');
		const { modal, written } = open(staminaBarElement, full);
		await modal.save();
		expect(written()).toEqual([full]);
		modal.close();
	});

	test('a declared number cleared in the form counts as absent: Save does not write the parser default back', async () => {
		const { modal, written } = open(staminaBarElement, `${MINIMAL}\nheight: 2`);
		findSetting(modal, 'Height').texts[0].trigger('');
		await modal.save();
		expect(written()).toEqual([MINIMAL]);
		modal.close();
	});
});

describe('SC-482 x SC-483: schemaless elements (counter, montage) edit as raw YAML, written verbatim', () => {
	test('counter, minimal, nothing typed: Save writes the source unchanged (no min_value, value_height, name_height, current_value)', async () => {
		const source = 'name: Deaths\nmax_value: 20';
		const { modal, written } = open(counterElement, source);
		expect(modal.body.querySelector('textarea.dse-form__raw')).not.toBeNull();
		await modal.save();
		expect(written()).toEqual([source]);
		modal.close();
	});

	test('montage, minimal, one line edited: exactly the typed text is written, no undeclared default key', async () => {
		const source = 'title: Escape\nsuccess_limit: 5\nfailure_limit: 3';
		const { modal, written } = open(montageElement, source);
		typeRaw(modal, 'title: Escape\nsuccess_limit: 6\nfailure_limit: 3');
		await modal.save();
		expect(written()).toEqual(['title: Escape\nsuccess_limit: 6\nfailure_limit: 3']);
		modal.close();
	});

	test('counter, fully authored, nothing typed: byte-identical', async () => {
		const full = 'max_value: 20\ncurrent_value: 10\nmin_value: 0\nname: Health\nvalue_height: 3\nname_height: 1';
		const { modal, written } = open(counterElement, full);
		await modal.save();
		expect(written()).toEqual([full]);
		modal.close();
	});
});
