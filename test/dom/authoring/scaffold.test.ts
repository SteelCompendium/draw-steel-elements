// Plan 15 Task 1 (D9 §2.1) — the pure scaffold builder. buildScaffold prefers a curated
// authoring.example; scaffoldFromSchema walks the JSON-Schema (required first, optionals
// commented) when there is none; wrapFence wraps a body in the canonical fence. No
// Obsidian editor, no DOM mutation — string in, string out.
import { buildScaffold, scaffoldFromSchema, wrapFence } from '../../../src/authoring/scaffold';
import type { ElementDefinition } from '../../../src/framework/registry';
import { parseYaml } from 'obsidian';
import { createValidationService } from '../../../src/framework/validation';

const SCHEMA = `
type: object
required: [name, max_stamina]
properties:
  name:
    type: string
    description: Display name
  max_stamina:
    type: integer
    minimum: 1
  style:
    type: string
    enum: [card, flat]
    default: card
  collapsible:
    type: boolean
`;

function def(over: Partial<ElementDefinition>): ElementDefinition {
	return {
		id: 'x', name: 'X', aliases: ['ds-x'], shape: 'static',
		parse: (d) => d, createView: () => ({} as never),
		...over,
	} as ElementDefinition;
}

describe('wrapFence', () => {
	test('wraps a body in a fenced block with the canonical alias', () => {
		expect(wrapFence('ds-x', 'a: 1')).toBe('```ds-x\na: 1\n```');
	});
	test('trims trailing newlines so there is exactly one before the close', () => {
		expect(wrapFence('ds-x', 'a: 1\n\n')).toBe('```ds-x\na: 1\n```');
	});
});

describe('scaffoldFromSchema', () => {
	test('required properties first, in declaration order, uncommented', () => {
		const body = scaffoldFromSchema(SCHEMA);
		const lines = body.split('\n');
		expect(lines[0]).toBe('name: ""  # Display name');
		// minimum: 1 on max_stamina — the stub must respect it, not fall back to 0
		// (a bare 0 would be schema-invalid out of the box).
		expect(lines[1]).toBe('max_stamina: 1');
	});
	test('optionals follow a divider, commented; enum uses default→first, boolean stub false', () => {
		const body = scaffoldFromSchema(SCHEMA);
		expect(body).toContain('# --- optional ---');
		expect(body).toContain('# style: card');       // default wins
		expect(body).toContain('# collapsible: false'); // typed stub
	});
	test('no schema / unparseable / no properties → empty string (never throws)', () => {
		expect(scaffoldFromSchema(undefined)).toBe('');
		expect(scaffoldFromSchema(': : not yaml : :')).toBe('');
		expect(scaffoldFromSchema('type: object')).toBe('');
	});
	test('enum without a default renders the first enum value unquoted (plain scalar)', () => {
		const schema = `
type: object
properties:
  rarity:
    type: string
    enum: [common, rare]
`;
		const body = scaffoldFromSchema(schema);
		// enum[0] with no default: same plain-scalar treatment as a string default —
		// NOT JSON.stringify'd (that would render the quoted "common").
		expect(body).toContain('# rarity: common');
		expect(body).not.toContain('"common"');
	});
	test('required lines from the SCHEMA fixture validate against that schema end-to-end', () => {
		// The actual bar: not just "renders 1 instead of 0", but that the scaffold's
		// required lines are schema-valid data when run through the real AJV-backed
		// ValidationService (the same service the pipeline uses).
		const body = scaffoldFromSchema(SCHEMA);
		const data = parseYaml(body);
		const result = createValidationService().validate('x', SCHEMA, data);
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});
});

describe('buildScaffold', () => {
	test('prefers authoring.example over the schema-derived body', () => {
		const s = buildScaffold(def({ schema: SCHEMA, authoring: { example: 'name: Goblin' } }));
		expect(s.text).toBe('```ds-x\nname: Goblin\n```');
		// cursor sits at the first body character (just past the opening fence line)
		expect(s.cursorOffset).toBe('```ds-x\n'.length);
	});
	test('falls back to the schema scaffold when there is no example', () => {
		const s = buildScaffold(def({ schema: SCHEMA }));
		expect(s.text.startsWith('```ds-x\nname: ""')).toBe(true);
	});
	test('no example and no schema → a placeholder comment, still a valid fence', () => {
		const s = buildScaffold(def({}));
		expect(s.text).toBe('```ds-x\n# fill in fields\n```');
	});
});
