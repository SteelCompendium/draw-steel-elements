// Plan 15 Task 5 (D9 §3.1) — fieldsFromSchema: schema node → control descriptor, with
// authoring.fields overrides (label/widget/order/hidden) and schema fallbacks.
import { fieldsFromSchema } from '../../../src/authoring/formModel';
import type { ElementDefinition } from '../../../src/framework/registry';

const SCHEMA = `
type: object
properties:
  name: { type: string, description: The name }
  max: { type: integer }
  style: { type: string, enum: [card, flat] }
  on: { type: boolean }
  notes: { type: string }
`;

function def(over: Partial<ElementDefinition>): ElementDefinition {
	return {
		id: 'x', name: 'X', aliases: ['ds-x'], shape: 'static', schema: SCHEMA,
		parse: (d) => d, createView: () => ({} as never), ...over,
	} as ElementDefinition;
}

test('maps schema types to widgets and derives sentence-case labels', () => {
	const f = fieldsFromSchema(def({}));
	const byKey = Object.fromEntries(f.map((x) => [x.key, x]));
	expect(byKey.name.widget).toBe('text');
	expect(byKey.name.label).toBe('Name');
	expect(byKey.name.help).toBe('The name');
	expect(byKey.max.widget).toBe('number');
	expect(byKey.style.widget).toBe('select');
	expect(byKey.style.enum).toEqual(['card', 'flat']);
	expect(byKey.on.widget).toBe('toggle');
});

test('authoring.fields overrides label/widget/order and can hide a field', () => {
	const f = fieldsFromSchema(
		def({ authoring: { fields: { notes: { label: 'GM notes', widget: 'textarea', order: -1 }, max: { hidden: true } } } }),
	);
	expect(f[0].key).toBe('notes');          // order: -1 sorts first
	expect(f[0].widget).toBe('textarea');
	expect(f.some((x) => x.key === 'max')).toBe(false); // hidden dropped
});

test('no schema → empty field list (caller falls back to a raw-YAML textarea)', () => {
	expect(fieldsFromSchema(def({ schema: undefined }))).toEqual([]);
});
