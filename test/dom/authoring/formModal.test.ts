// Plan 15 Task 5 (D9 §3.2) — the generic form modal: seed from the block body, live-validate
// via ValidationService (Save disabled while invalid — OD-6), and Save through
// host.replaceSource (the one write path — OD-D9-12). Uses the real ValidationService + a
// fake BlockHost recording the write.
import { openFormEditor } from '../../../src/authoring/FormModal';
import { createValidationService } from '../../../src/framework/validation';
import { createElementRegistry, type ElementDefinition } from '../../../src/framework/registry';
import { App, stringifyYaml } from 'obsidian';

const SCHEMA = `
type: object
required: [name]
properties:
  name: { type: string }
  count: { type: integer }
`;

function makeCx(writes: string[]) {
	const containerEl = document.createElement('div');
	return {
		app: new App(),
		host: {
			mode: 'reading', sourcePath: 'N.md', containerEl, canPersist: true,
			addChild: <T,>(c: T) => c, getBlockInfo: () => null, blockKey: () => 'k',
			replaceSource: async (body: string) => (writes.push(body), true),
		},
	} as never;
}

function schemaDef(): ElementDefinition {
	return {
		id: 'x', name: 'X', aliases: ['ds-x'], shape: 'static', schema: SCHEMA,
		parse: (d) => d,
		createView: () => ({ mount: async () => {}, load: () => {}, unload: () => {} } as never),
	} as ElementDefinition;
}

test('opens seeded from the body and renders one control per visible field', () => {
	const validation = createValidationService();
	const modal = openFormEditor(makeCx([]), schemaDef(), 'name: Goblin\ncount: 3', validation);
	expect(modal.body.querySelectorAll('.setting-item, .dse-form__field').length).toBeGreaterThan(0);
	modal.close();
});

test('Save writes serialize/stringify output through host.replaceSource', async () => {
	const writes: string[] = [];
	const validation = createValidationService();
	const modal = openFormEditor(makeCx(writes), schemaDef(), 'name: Goblin', validation);
	await modal.save();
	expect(writes).toHaveLength(1);
	expect(writes[0]).toContain('name: Goblin');
	modal.close();
});

test('invalid working object disables Save and does not write', async () => {
	const writes: string[] = [];
	const validation = createValidationService();
	const modal = openFormEditor(makeCx(writes), schemaDef(), 'count: 3', validation); // missing required name
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
	const modal = openFormEditor(makeCx(writes), def, 'name: Charge\ncost: 1', validation);
	expect(modal.body.querySelector('textarea')).not.toBeNull();
	await modal.save();
	expect(writes[0]).toContain('name: Charge');
	modal.close();
});
